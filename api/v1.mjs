// REST API at https://api.platformontology.lol/v1 (rewritten here from /v1/*).
// Public: GET /v1 (this index), GET /v1/capabilities, GET /v1/tools. With an API key: GET /v1/me,
// GET /v1/readings, POST /v1/tools/<name> (runs a page script tool in your open console tab).
import { rpc, json } from "./_lib/lake.mjs";
import { resolveKey, CORS } from "./_lib/keys.mjs";
import { relay, PAGE_TOOLS } from "./_lib/relay.mjs";

const out = (status, obj) => json(status, obj, CORS);
const ATLAS = "https://platformontology.lol/console/data/console.json";
let atlas = null;

const INDEX = {
  name: "Platform Ontology API",
  docs: "https://platformontology.lol",
  auth: "Authorization: Bearer <key>. Make a key in the console under API keys.",
  endpoints: {
    "GET /v1/capabilities": "Every capability in the atlas: id, name, group, kind. Public. Filter with ?q= and ?group=.",
    "GET /v1/me": "The account the key belongs to.",
    "GET /v1/readings": "Saved readings from your linked visits. ?scope=<capability id>&since=<ISO time>&limit=1..200",
    "GET /v1/tools": "Read only page script tools (install state, manifest, background jobs, extension traces, Permissions Policy). Public.",
    "POST /v1/tools/<name>": "Run one in your open console tab. JSON body: {source?: live|sim, keep?: boolean}. Answers in plain words with verified.",
    "POST /mcp": "MCP (Streamable HTTP). Drives the capabilities of your open console tab.",
  },
};

export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });

export async function GET(req) {
  const u = new URL(req.url);
  const path = (u.searchParams.get("path") || "").replace(/^\/+|\/+$/g, "");
  try {
    if (path === "") return out(200, INDEX);
    if (path === "tools") return out(200, { count: PAGE_TOOLS.length, tools: PAGE_TOOLS });
    if (path === "capabilities") {
      atlas ??= await fetch(ATLAS).then((r) => r.json());
      const q = (u.searchParams.get("q") || "").toLowerCase();
      const g = u.searchParams.get("group");
      const nodes = (atlas.nodes || [])
        .filter((n) => (!g || n.g === g) && (!q || `${n.i} ${n.n || ""} ${n.p || ""}`.toLowerCase().includes(q)))
        .map((n) => ({ id: n.i, name: n.n, group: n.g, domain: n.d, kind: n.k, summary: n.p }));
      return out(200, { count: nodes.length, capabilities: nodes });
    }
    const k = await resolveKey(req);
    if (!k) return out(401, { error: "missing or unknown API key" });
    if (path === "me") return out(200, { user: k.user_id, key: k.key_id });
    if (path === "readings") {
      const limit = Math.min(200, Math.max(1, parseInt(u.searchParams.get("limit") || "50", 10) || 50));
      const since = u.searchParams.get("since");
      return out(200, await rpc("po_readings", {
        p_user: k.user_id, p_scope: u.searchParams.get("scope") || null,
        p_since: since && !isNaN(Date.parse(since)) ? new Date(since).toISOString() : null, p_limit: limit,
      }));
    }
    return out(404, { error: "no such endpoint", see: "GET /v1" });
  } catch (e) {
    return out(500, { error: "api unavailable" });
  }
}

export async function POST(req) {
  const u = new URL(req.url);
  const path = (u.searchParams.get("path") || "").replace(/^\/+|\/+$/g, "");
  const m = /^tools\/([a-z_]+)$/.exec(path);
  const tool = m && PAGE_TOOLS.find((t) => t.name === m[1]);
  if (!tool) return out(404, { error: "no such tool", see: "GET /v1/tools" });
  try {
    const k = await resolveKey(req);
    if (!k) return out(401, { error: "missing or unknown API key" });
    let body = {};
    try { body = (await req.json()) || {}; } catch { body = {}; }
    const args = {};
    if (body.source === "live" || body.source === "sim") args.source = body.source;
    if (body.keep === true) args.keep = true;
    const r = await relay(k.key_id, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool.name, arguments: args } });
    if (r?.error) return out(r.error.code === -32001 ? 504 : 502, { ok: false, error: r.error.message });
    const res = r?.result?.structuredContent ?? (() => { try { return JSON.parse(r?.result?.content?.[0]?.text || "{}"); } catch { return {}; } })();
    return out(200, { tool: tool.name, capability: tool.capability, ...res });
  } catch (e) {
    return out(500, { error: "api unavailable" });
  }
}
