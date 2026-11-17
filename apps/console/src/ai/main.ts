import type { Atlas } from "../core/types";
import { startAgent, type ToolDef } from "../agent";
import { LiveSession, stepLabel, type Mcp } from "./live";

// The standalone voice page (/ai/): one Start button over a Gemini Live session. The console's voice
// dock runs the same LiveSession; this page stays for a bare, no console fallback.

const $ = (id: string) => document.getElementById(id)!;
const btn = $("go") as HTMLButtonElement;
const status = (s: string) => { $("status").textContent = s; };
const feed = $("feed");
let turn: { who: string; el: HTMLElement } | null = null;
function say(who: "you" | "ai", text: string) {
  if (!text) return;
  if (turn?.who !== who) {
    const el = document.createElement("p");
    el.className = who;
    feed.append(el);
    turn = { who, el };
  }
  turn.el.textContent += text;
  feed.scrollTop = feed.scrollHeight;
}
function step(name: string, args: Record<string, any>) {
  const el = document.createElement("p");
  el.className = "step";
  el.textContent = stepLabel(name, args);
  feed.append(el);
  turn = null;
  feed.scrollTop = feed.scrollHeight;
  return (ok: boolean) => el.classList.add(ok ? "ok" : "bad");
}

let mcp: Mcp | null = null;
let tools: ToolDef[] = [];
let session: LiveSession | null = null;

async function agent() {
  if (mcp) return;
  const atlas = (await fetch("/console/data/console.json").then((r) => r.json())) as Atlas;
  const a = startAgent(atlas);
  mcp = a.mcp;
  tools = a.tools.tools;
}

function stop() {
  session?.close();
  session = null;
  mcp?.handle({ jsonrpc: "2.0", id: 0, method: "tools/call", params: { name: "stop_all", arguments: {} } }).catch(() => {});
  btn.textContent = "Start";
  btn.classList.remove("on");
  btn.disabled = false;
}

btn.onclick = async () => {
  if (session) { stop(); status("Stopped."); return; }
  btn.disabled = true;
  feed.textContent = "";
  turn = null;
  // Built inside the click, before any await, so Safari lets the audio play.
  const proxy: Mcp = { handle: (m) => mcp!.handle(m) };
  const s = (session = new LiveSession(proxy, [], { status, say, step, turnDone: () => { turn = null; }, ended: (r) => { status(r || "Session ended"); stop(); } }));
  try {
    await agent();
    s.tools = tools;
    await s.open();
    btn.textContent = "Stop";
    btn.classList.add("on");
  } catch (err) {
    stop();
    status((err as Error).message || "Could not start");
  } finally {
    btn.disabled = false;
  }
};
