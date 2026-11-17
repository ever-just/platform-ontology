// REST API at https://api.platformontology.lol/v1 (rewritten here from /v1/*).
// Public: GET /v1 (this index), GET /v1/capabilities. With an API key: GET /v1/me, GET /v1/readings.
import { rpc, json } from "./_lib/lake.mjs";
import { resolveKey, CORS } from "./_lib/keys.mjs";

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
    "POST /mcp": "MCP (Streamable HTTP). Drives the capabilities of your open console tab.",
  },
};

export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });

export async function GET(req) {
  const u = new URL(req.url);
  const path = (u.searchParams.get("path") || "").replace(/^\/+|\/+$/g, "");
  try {
    if (path === "") return out(200, INDEX);
    if (path === "capabilities") {
      atlas ??= await fetch(ATLAS).then((r) => r.json());
      const q = (u.searchParams.get("q") || "").toLowerCase();
      const g = u.searchParams.get("group");
      const nodes = (atlas.nodes || [])
        .filter((n) => (!g || n.g === g) && (!q || `${n.id} ${n.n || ""}`.toLowerCase().includes(q)))
        .map((n) => ({ id: n.id, name: n.n, group: n.g, kind: n.k }));
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
