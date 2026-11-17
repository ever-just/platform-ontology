// Shared by /mcp and /v1/tools: queue one JSON-RPC message in the lake for the key's owner, wait for
// their open console tab (signed in to the same account) to claim it, run it on its in-page MCP
// server and post the answer back.
import { rpc } from "./lake.mjs";

const WAIT_MS = 25000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const rpcError = (id, code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

export async function relay(keyId, msg) {
  const id = await rpc("po_relay_send", { p_key: keyId, p_request: msg });
  const end = Date.now() + WAIT_MS;
  let claimed = false;
  while (Date.now() < end) {
    await sleep(claimed ? 250 : 600);
    const r = await rpc("po_relay_result", { p_key: keyId, p_id: id });
    if (r?.answered) return r.response;
    claimed = !!r?.claimed;
  }
  return rpcError(msg.id, -32001, claimed
    ? "Your console tab took the request but did not answer in time."
    : "No console tab is listening. Open https://platformontology.lol, sign in under Account, and keep the tab open.");
}

// Read only page script tools (manifest and page script atlas entries). They answer in plain words
// (said), with the facts behind them and whether a real reading backed the answer (verified).
const RUN = { source: { type: "string", enum: ["live", "sim"] }, keep: { type: "boolean" } };
export const PAGE_TOOLS = [
  { name: "check_install_state", capability: "reach.install-state", description: "Is the page running as an installed app, and is the site's own app installed?" },
  { name: "read_manifest", capability: "reach.manifest-reader", description: "The page's web app manifest: name, start address, display mode and members." },
  { name: "list_background_jobs", capability: "reach.background-apis", description: "Service workers and their background jobs (sync, periodic sync, push, badge)." },
  { name: "find_extension_traces", capability: "fingerprint.extension-traces", description: "Marks browser extensions left in the page." },
  { name: "read_permissions_policy", capability: "fingerprint.permissions-policy", description: "Which powerful features Permissions Policy allows on the page." },
].map((t) => ({ ...t, input: { type: "object", properties: RUN } }));
