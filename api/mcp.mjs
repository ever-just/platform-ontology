// Remote MCP at https://api.platformontology.lol/mcp (Streamable HTTP, JSON responses).
// initialize and ping are answered here. Every other request is queued in the lake for the key's
// owner; their open console tab (signed in to the same account) claims it, runs it on its in-page
// MCP server and posts the answer back, which this function returns.
import { json } from "./_lib/lake.mjs";
import { relay, rpcError } from "./_lib/relay.mjs";
import { resolveKey, CORS } from "./_lib/keys.mjs";

const PROTOCOL = "2025-06-18";
const out = (status, obj) => json(status, obj, CORS);
const err = rpcError;

async function one(keyId, msg) {
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return err(msg?.id, -32600, "Invalid request");
  if (msg.id === undefined) return null; // notification
  if (msg.method === "initialize") {
    return { jsonrpc: "2.0", id: msg.id, result: {
      protocolVersion: PROTOCOL,
      capabilities: { tools: { listChanged: false }, resources: { listChanged: false } },
      serverInfo: { name: "platform-ontology", version: "1.0.0" },
      instructions: "Drives the browser capabilities of the key owner's open Platform Ontology console tab. Find ids with list_capabilities, start one, then read_stream or run_action. Ask before turning on anything that shows a browser prompt.",
    } };
  }
  if (msg.method === "ping") return { jsonrpc: "2.0", id: msg.id, result: {} };
  return relay(keyId, msg);
}

export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });
export const GET = () => new Response("Use POST for MCP requests.", { status: 405, headers: { ...CORS, allow: "POST" } });
export const DELETE = () => new Response(null, { status: 204, headers: CORS });

const MAX_BATCH = 5;

export async function POST(req) {
  const k = await resolveKey(req).catch(() => null);
  if (!k) return out(401, err(null, -32000, "Missing or unknown API key. Send Authorization: Bearer <key>."));
  let body;
  try { body = await req.json(); } catch { return out(400, err(null, -32700, "Parse error")); }
  try {
    if (Array.isArray(body)) {
      if (body.length === 0 || body.length > MAX_BATCH) {
        return out(400, err(null, -32600, `A batch must hold 1 to ${MAX_BATCH} messages.`));
      }
      const res = (await Promise.all(body.map((m) => one(k.key_id, m)))).filter(Boolean);
      return res.length ? out(200, res) : new Response(null, { status: 202, headers: CORS });
    }
    const res = await one(k.key_id, body);
    return res ? out(200, res) : new Response(null, { status: 202, headers: CORS });
  } catch (e) {
    return out(500, err(body?.id, -32603, "Relay failed"));
  }
}
