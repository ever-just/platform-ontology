import { allSessions, getSession, isActive } from "../core/harness";
import type { AgentTools } from "./tools";
import { clip } from "./tools";

// A Model Context Protocol server that runs inside the page. It speaks JSON-RPC 2.0 and has no
// transport of its own: the in-page voice agent calls handle() directly, and the api relay passes
// messages from remote MCP clients to the same handle() in the browser that owns the session.

export const PROTOCOL = "2025-06-18";
export type RpcRequest = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: any };
export type RpcResponse = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string } };

export function createMcpServer(t: AgentTools, info = { name: "platform-ontology", version: "1.0.0" }) {
  const ok = (id: RpcRequest["id"], result: unknown): RpcResponse => ({ jsonrpc: "2.0", id: id ?? null, result });
  const fail = (id: RpcRequest["id"], code: number, message: string): RpcResponse => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

  async function handle(msg: RpcRequest): Promise<RpcResponse | null> {
    if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return fail(msg?.id, -32600, "Invalid request");
    const notification = msg.id === undefined;
    const p = msg.params || {};
    let res: RpcResponse;
    switch (msg.method) {
      case "initialize":
        res = ok(msg.id, {
          protocolVersion: PROTOCOL,
          capabilities: { tools: { listChanged: false }, resources: { listChanged: false } },
          serverInfo: info,
          instructions: "Controls the browser capabilities of one person's open page. Find ids with list_capabilities, start one, then read_stream or run_action. Ask before turning on anything that shows a browser prompt.",
        });
        break;
      case "notifications/initialized":
      case "notifications/cancelled":
        return null;
      case "ping":
        res = ok(msg.id, {});
        break;
      case "tools/list":
        res = ok(msg.id, { tools: t.tools });
        break;
      case "tools/call": {
        if (!t.tools.some((x) => x.name === p.name)) { res = fail(msg.id, -32602, `Unknown tool ${p.name}`); break; }
        try {
          const out = await t.call(p.name, p.arguments || {});
          res = ok(msg.id, { content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out, isError: !out.ok });
        } catch (e) {
          res = ok(msg.id, { content: [{ type: "text", text: String((e as Error)?.message || e) }], isError: true });
        }
        break;
      }
      case "resources/list":
        res = ok(msg.id, {
          resources: allSessions().filter(isActive).map((s) => ({
            uri: `stream://${s.id}`, name: t.scopes.find((x) => x.id === s.id)?.name || s.id, mimeType: "application/json",
            description: "Latest readings from this running capability",
          })),
        });
        break;
      case "resources/templates/list":
        res = ok(msg.id, { resourceTemplates: [{ uriTemplate: "stream://{id}", name: "Capability stream", mimeType: "application/json" }] });
        break;
      case "resources/read": {
        const id = String(p.uri || "").replace(/^stream:\/\//, "");
        const s = getSession(id);
        res = ok(msg.id, { contents: [{ uri: p.uri, mimeType: "application/json", text: JSON.stringify({ state: s.state, count: s.count, records: s.records.slice(-10).map((r) => ({ seq: r.seq, t: r.t, data: clip(r.data) })) }) }] });
        break;
      }
      default:
        res = fail(msg.id, -32601, `Method not found: ${msg.method}`);
    }
    return notification ? null : res;
  }

  return { handle };
}
