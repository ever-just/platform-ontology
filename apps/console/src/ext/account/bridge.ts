import type { ConsoleCtx } from "../registry";
import { createAgentTools, createMcpServer, type RpcRequest } from "../../agent";
import { accountState, onAccount, post } from "./index";

// Bridge from https://api.platformontology.lol/mcp to this tab. While the tab is signed in and
// visible it long polls /api/account for MCP requests sent with this account's API keys, runs each
// on the in-page MCP server over the console's own capabilities, and posts the answer back.

let ctx: ConsoleCtx | null = null;
let server: ReturnType<typeof createMcpServer> | null = null;
let running = false;

export function noteCtx(c: ConsoleCtx) {
  if (ctx?.scopes !== c.scopes) server = null;
  ctx = c;
  kick();
}

function mcp() {
  if (!server && ctx) server = createMcpServer(createAgentTools(ctx.atlas, ctx.scopes));
  return server;
}

const active = () => !!accountState()?.user && document.visibilityState === "visible" && !!ctx;

async function loop() {
  running = true;
  const start = accountState()?.user?.id;
  let backoff = 1000;
  while (active()) {
    try {
      const r = await post("/api/account", { action: "relay_claim" });
      if (!r.ok) throw new Error(String(r.status));
      const owner = accountState()?.user?.id === start ? start : null;
      const jobs = (await r.json()) as { id: number; request: RpcRequest }[];
      backoff = 1000;
      // Signed out (or switched account) while the poll was open: drop the batch unrun.
      if (!owner || !active()) break;
      await Promise.all(jobs.map(async (j) => {
        const res = (await mcp()?.handle(j.request)) ?? { jsonrpc: "2.0", id: j.request?.id ?? null, result: {} };
        await post("/api/account", { action: "relay_answer", id: j.id, response: res });
      }));
    } catch {
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, 30000);
    }
  }
  running = false;
}

function kick() { if (!running && active()) loop(); }

// Deferred: index.tsx imports this module before its own state exists.
queueMicrotask(() => {
  onAccount(kick);
  document.addEventListener("visibilitychange", kick);
});
