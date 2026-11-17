// Spoken task check for https://ai.platformontology.lol. Opens real Gemini Live sessions the same way
// the page does (a one use token that locks only the model, then the page's own setup message) and
// sends each task below as typed input. A task passes when the model answers with a call to one of the
// tools it expects. This catches the failure that shipped once: a token that silently dropped the
// system instruction and every tool, so the voice answered from guesses.
//
//   GEMINI_API_KEY=... node scripts/voice-eval.mjs
//
// Each run opens one short session per task on the key's free tier.

globalThis.window = globalThis;
globalThis.document ??= { addEventListener() {}, createElement: () => ({}), visibilityState: "visible" };
globalThis.addEventListener ??= () => {};

import fs from "node:fs";
import { createServer } from "vite";

const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_LIVE_MODEL || "gemini-2.5-flash-native-audio-preview-12-2025";
if (!KEY) { console.log("GEMINI_API_KEY is not set; skipping the voice check."); process.exit(0); }

const TASKS = [
  { say: "What can this browser tell you about my battery?", want: ["list_capabilities", "describe_capability"] },
  { say: "Is anything running right now?", want: ["get_status"] },
  { say: "Change the tab title to hello world.", want: ["list_capabilities", "describe_capability", "start_capability", "run_action"] },
  { say: "Find the capabilities about motion sensors.", want: ["list_capabilities"] },
  { say: "Turn everything off.", want: ["stop_all", "get_status"] },
];

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
const { createAgentTools } = await vite.ssrLoadModule("/src/agent/tools.ts");
const { buildSetup } = await vite.ssrLoadModule("/src/ai/setup.ts");
await vite.close();
const atlas = JSON.parse(fs.readFileSync(new URL("../public/data/console.json", import.meta.url), "utf8"));
const setup = buildSetup(MODEL, createAgentTools(atlas, []).tools, ["AUDIO"]);

async function token() {
  const now = Date.now();
  const r = await fetch("https://generativelanguage.googleapis.com/v1beta/auth_tokens", {
    method: "POST",
    headers: { "x-goog-api-key": KEY, "content-type": "application/json" },
    body: JSON.stringify({
      uses: 1,
      expireTime: new Date(now + 5 * 60e3).toISOString(),
      newSessionExpireTime: new Date(now + 60e3).toISOString(),
      bidiGenerateContentSetup: { model: `models/${MODEL}` },
      fieldMask: "model",
    }),
  });
  const t = await r.json();
  if (!r.ok) throw new Error(`token ${r.status}: ${JSON.stringify(t).slice(0, 200)}`);
  return t.name;
}

function run(task) {
  return new Promise(async (resolve) => {
    let ws;
    const end = (ok, note) => { try { ws?.close(); } catch {} resolve({ ok, note }); };
    try {
      ws = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(await token())}`);
    } catch (e) { return end(false, e.message); }
    const said = [];
    const timer = setTimeout(() => end(false, `no tool call in 30s; said: ${said.join("").slice(0, 120)}`), 30000);
    ws.onopen = () => ws.send(JSON.stringify(setup));
    ws.onmessage = async (e) => {
      const m = JSON.parse(typeof e.data === "string" ? e.data : await e.data.text());
      if (m.setupComplete) ws.send(JSON.stringify({ realtimeInput: { text: task.say } }));
      const tr = m.serverContent?.outputTranscription?.text;
      if (tr) said.push(tr);
      const calls = m.toolCall?.functionCalls?.map((c) => c.name);
      if (calls?.length) { clearTimeout(timer); end(calls.some((c) => task.want.includes(c)), calls.join(", ")); }
      else if (m.serverContent?.turnComplete) { clearTimeout(timer); end(false, `answered without a tool: ${said.join("").slice(0, 120)}`); }
    };
    ws.onclose = (e) => { clearTimeout(timer); end(false, `closed ${e.code} ${e.reason}`); };
  });
}

let failed = 0;
for (const t of TASKS) {
  const r = await run(t);
  if (!r.ok) failed++;
  console.log(`${r.ok ? "pass" : "FAIL"}  ${t.say}  ->  ${r.note}`);
}
console.log(`${TASKS.length - failed} of ${TASKS.length} spoken tasks used the right tool.`);
// Live models are not deterministic; one miss is noise, more means the voice is not getting its tools.
process.exit(failed > 1 ? 1 : 0);
