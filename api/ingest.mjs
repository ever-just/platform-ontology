// POST /api/ingest: receives batches from the console, redacts personal
// content, then stores them in the lake through api.ontology_ingest.
// The lake key lives only in Vercel env vars; the browser never sees it.

const MAX_BODY = 512 * 1024;
const MAX_SAMPLE = 4096;
const SCOPE = /^[a-z0-9_.-]{1,80}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Scope ids are namespaced ("capture.clipboard", "identity.contacts") and generic
// scopes use atlas ids ("clipboard-read", "contact-picker"), so match by pattern.
// Content scopes hold the visitor's own words or contacts: keep shape, drop content.
const CONTENT_RE = /clipboard|speech|contact|transcri|dictation|share-target|file-handl|text-select/i;
const KEY_RE = /keystroke|key-?event|keyboard-?input/i;
function kindOf(scope) {
  const s = String(scope || "");
  return CONTENT_RE.test(s) ? "content" : KEY_RE.test(s) ? "keys" : "";
}
const KEY_FIELDS = new Set(["key", "code", "char", "text", "value", "data"]);
const GEO_FIELDS = new Set(["latitude", "longitude", "lat", "lon", "lng"]);

// Best effort limit per warm instance: 60 batches a minute per visit.
const hits = new Map();
function limited(id) {
  const now = Date.now();
  const h = hits.get(id) || { n: 0, at: now };
  if (now - h.at > 60_000) { h.n = 0; h.at = now; }
  h.n++;
  hits.set(id, h);
  if (hits.size > 5000) hits.clear();
  return h.n > 60;
}

function scrub(v, scope, key, depth = 0) {
  if (depth > 8) return null;
  const kind = kindOf(scope);
  if (typeof v === "string") {
    if (kind === "content") return { len: v.length };
    if (kind === "keys" && KEY_FIELDS.has(key)) return undefined;
    if (/^(data|blob):/i.test(v)) return { omitted: "media", len: v.length };
    return v.length > 500 ? { omitted: "long", len: v.length } : v;
  }
  if (typeof v === "number") {
    // Coordinates are coarsened to about 1 km wherever they appear, whatever the scope.
    if (GEO_FIELDS.has(String(key).toLowerCase())) return Math.round(v * 100) / 100;
    return Number.isFinite(v) ? v : null;
  }
  if (typeof v === "boolean" || v === null) return v;
  if (Array.isArray(v)) {
    if (kind === "content") return { count: v.length };
    return v.slice(0, 200).map((x) => scrub(x, scope, key, depth + 1)).filter((x) => x !== undefined);
  }
  if (typeof v === "object") {
    const out = {};
    for (const [k, x] of Object.entries(v).slice(0, 100)) {
      const s = scrub(x, scope, k, depth + 1);
      if (s !== undefined) out[k] = s;
    }
    return out;
  }
  return undefined;
}

function sample(s, scope) {
  const data = scrub(s?.data, scope, "");
  const out = { seq: Number(s?.seq) || 0, t: Number(s?.t) || 0, data };
  return JSON.stringify(out).length > MAX_SAMPLE ? { ...out, data: { omitted: "large" } } : out;
}

function str(v, n) { return typeof v === "string" ? v.slice(0, n) : null; }

function clean(body, country) {
  if (!body || typeof body !== "object" || !UUID.test(body.visit_id || "")) return null;
  const v = body.visit || {};
  const visit = {
    site: str(v.site, 120), brand: str(v.brand, 40), version: str(v.version, 40), engine: str(v.engine, 40),
    os: str(v.os, 40), device: str(v.device, 40), country, ua: str(v.ua, 600),
  };
  if (v.profile && typeof v.profile === "object") visit.profile = scrub(v.profile, "profile", "");
  if (Array.isArray(v.passive)) visit.passive = scrub(v.passive.slice(0, 120), "passive", "");
  const readings = (Array.isArray(body.readings) ? body.readings : []).slice(0, 200)
    .filter((r) => SCOPE.test(r?.scope || "") && Array.isArray(r.samples) && r.samples.length)
    .map((r) => ({ scope: r.scope, source: r.source === "sim" ? "sim" : "live", samples: r.samples.slice(0, 600).map((s) => sample(s, r.scope)) }));
  const events = (Array.isArray(body.events) ? body.events : []).slice(0, 500)
    .filter((e) => SCOPE.test(e?.scope || ""))
    .map((e) => ({
      scope: e.scope, t: Number(e.t) || Date.now(),
      level: ["info", "ok", "warn", "err"].includes(e.level) ? e.level : "info",
      state: str(e.state, 20), msg: kindOf(e.scope) === "content" ? null : str(e.msg, 500),
    }));
  const captures = (Array.isArray(body.captures) ? body.captures : []).slice(0, 50)
    .filter((c) => SCOPE.test(c?.scope || ""))
    .map((c) => ({
      scope: c.scope, t: Number(c.t) || Date.now(), kind: str(c.kind, 10), mime: str(c.mime, 80),
      bytes: Number(c.bytes) || null, width: Number(c.width) || null, height: Number(c.height) || null,
      duration_ms: Number(c.duration_ms) || null, sha256: /^[0-9a-f]{64}$/.test(c.sha256 || "") ? c.sha256 : null,
    }));
  return { visit_id: body.visit_id, visit, readings, events, captures };
}

const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function POST(req) {
  const url = process.env.LAKE_SUPABASE_URL, key = process.env.LAKE_SUPABASE_SECRET_KEY;
  if (!url || !key) return json(503, { error: "storage not configured" });
  const text = await req.text();
  if (text.length > MAX_BODY) return json(413, { error: "batch too large" });
  let body;
  try { body = JSON.parse(text); } catch { return json(400, { error: "bad json" }); }
  const country = (req.headers.get("x-vercel-ip-country") || "").slice(0, 2).toUpperCase() || null;
  const batch = clean(body, country);
  if (!batch) return json(400, { error: "bad batch" });
  if (limited(batch.visit_id)) return json(429, { error: "slow down" });
  const r = await fetch(`${url}/rest/v1/rpc/ontology_ingest`, {
    method: "POST",
    headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", "content-profile": "api", "accept-profile": "api" },
    body: JSON.stringify({ p_batch: batch }),
  });
  if (!r.ok) return json(502, { error: "store failed", status: r.status });
  return json(200, await r.json());
}

export function GET() { return json(200, { ok: true, accepts: "POST" }); }
