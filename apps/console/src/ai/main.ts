import type { Atlas } from "../core/types";
import { startAgent, type RpcRequest } from "../agent";

// https://ai.platformontology.lol: one Start button that opens a Gemini Live voice session.
// The page asks /api/gemini-token for a one use token, streams the microphone to Gemini, plays the
// spoken answer, and runs every tool call on the in-page MCP server over this browser's capabilities.

const WS = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";
const SYSTEM = `You are the voice of Platform Ontology, a live map of every permission, sensor and silent signal a web page can reach.
You can switch this person's own browser capabilities on and off with your tools and read what they report.
Keep answers short and spoken. Find ids with list_capabilities. Before you start anything that shows a browser prompt
(camera, microphone, location and similar), say what it will do and wait for a yes. Never read out long raw data; summarise it.`;

const $ = (id: string) => document.getElementById(id)!;
const btn = $("go") as HTMLButtonElement;
const status = (s: string) => { $("status").textContent = s; };
const log = (s: string) => { $("log").textContent = s; };

let mcp: { handle(m: RpcRequest): Promise<any> } | null = null;
let tools: { name: string; description: string; inputSchema: any }[] = [];
let session: Session | null = null;

async function agent() {
  if (mcp) return;
  const atlas = (await fetch("/console/data/console.json").then((r) => r.json())) as Atlas;
  const a = startAgent(atlas);
  mcp = a.mcp;
  tools = a.tools.tools;
}

// Gemini function declarations take an OpenAPI subset: one type per field.
function schema(s: any): any {
  if (!s || typeof s !== "object") return { type: "string" };
  const o: any = {};
  o.type = Array.isArray(s.type) ? "string" : s.type || "string";
  if (s.description) o.description = s.description;
  if (s.enum) o.enum = s.enum.map(String);
  if (o.type === "object") {
    o.properties = Object.fromEntries(Object.entries(s.properties || {}).map(([k, v]) => [k, schema(v)]));
    if (s.required?.length) o.required = s.required;
    if (!Object.keys(o.properties).length) delete o.properties;
  }
  if (o.type === "array") o.items = schema(s.items);
  return o;
}

const b64 = (buf: ArrayBuffer) => { let s = ""; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer;

const WORKLET = `class P extends AudioWorkletProcessor{constructor(){super();this.b=[];}process(i){const c=i[0]&&i[0][0];if(c){this.b.push(...c);if(this.b.length>=1600){this.port.postMessage(new Float32Array(this.b));this.b=[];}}return true;}}registerProcessor("pcm",P);`;

class Session {
  ws!: WebSocket;
  mic!: MediaStream;
  inCtx!: AudioContext;
  outCtx = new AudioContext({ sampleRate: 24000 });
  playAt = 0;
  playing = new Set<AudioBufferSourceNode>();
  closed = false;

  async open() {
    status("Getting a session…");
    await signedIn();
    const r = await fetch("/api/gemini-token", { method: "POST", credentials: "include" });
    const t = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(t.error || "Could not start");
    this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    this.ws = new WebSocket(`${WS}?access_token=${encodeURIComponent(t.token)}`);
    await new Promise<void>((ok, bad) => { this.ws.onopen = () => ok(); this.ws.onerror = () => bad(new Error("Connection failed")); });
    this.ws.onmessage = (e) => this.onMessage(e);
    this.ws.onclose = (e) => { if (!this.closed) { status(e.reason ? `Ended: ${e.reason}` : "Session ended"); stop(); } };
    this.send({
      setup: {
        model: `models/${t.model}`,
        generationConfig: { responseModalities: ["AUDIO"] },
        systemInstruction: { parts: [{ text: SYSTEM }] },
        tools: [{ functionDeclarations: tools.map((d) => ({ name: d.name, description: d.description, parameters: schema(d.inputSchema) })) }],
      },
    });
  }

  send(o: unknown) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(o)); }

  async startMic() {
    this.inCtx = new AudioContext({ sampleRate: 16000 });
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
    await this.inCtx.audioWorklet.addModule(url);
    const node = new AudioWorkletNode(this.inCtx, "pcm");
    node.port.onmessage = (e) => {
      const f = e.data as Float32Array;
      const pcm = new Int16Array(f.length);
      for (let i = 0; i < f.length; i++) pcm[i] = Math.max(-1, Math.min(1, f[i])) * 0x7fff;
      this.send({ realtimeInput: { audio: { data: b64(pcm.buffer), mimeType: "audio/pcm;rate=16000" } } });
    };
    this.inCtx.createMediaStreamSource(this.mic).connect(node);
    status("Listening. Ask what this browser can do.");
  }

  play(data: ArrayBuffer) {
    const pcm = new Int16Array(data);
    const buf = this.outCtx.createBuffer(1, pcm.length, 24000);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 0x8000;
    const src = this.outCtx.createBufferSource();
    src.buffer = buf;
    src.connect(this.outCtx.destination);
    this.playAt = Math.max(this.playAt, this.outCtx.currentTime);
    src.start(this.playAt);
    this.playAt += buf.duration;
    this.playing.add(src);
    src.onended = () => this.playing.delete(src);
  }

  hush() { this.playing.forEach((s) => { try { s.stop(); } catch {} }); this.playing.clear(); this.playAt = 0; }

  async onMessage(e: MessageEvent) {
    const text = typeof e.data === "string" ? e.data : await (e.data as Blob).text();
    let m: any;
    try { m = JSON.parse(text); } catch { return; }
    if (m.setupComplete) { await this.startMic(); return; }
    const sc = m.serverContent;
    if (sc?.interrupted) this.hush();
    sc?.modelTurn?.parts?.forEach((p: any) => { if (p.inlineData?.data) this.play(unb64(p.inlineData.data)); });
    if (m.toolCall?.functionCalls) {
      const functionResponses = await Promise.all(m.toolCall.functionCalls.map(async (c: any) => {
        log(`Using ${c.name.replace(/_/g, " ")}${c.args?.id ? `: ${c.args.id}` : ""}`);
        const r = await mcp!.handle({ jsonrpc: "2.0", id: c.id, method: "tools/call", params: { name: c.name, arguments: c.args || {} } });
        const out = r?.result?.structuredContent ?? r?.result?.content?.map((x: any) => x.text).join("\n") ?? r?.error ?? null;
        return { id: c.id, name: c.name, response: { result: out } };
      }));
      this.send({ toolResponse: { functionResponses } });
    }
    if (m.goAway) status("Session is ending soon.");
  }

  close() {
    this.closed = true;
    this.hush();
    try { this.ws?.close(); } catch {}
    this.mic?.getTracks().forEach((t) => t.stop());
    this.inCtx?.close().catch(() => {});
    this.outCtx.close().catch(() => {});
    mcp?.handle({ jsonrpc: "2.0", id: 0, method: "tools/call", params: { name: "stop_all", arguments: {} } }).catch(() => {});
  }
}

// The token endpoint needs a session; start an anonymous one if this browser has none.
async function signedIn() {
  const s = await fetch("/api/auth/get-session", { credentials: "include" }).then((r) => r.json()).catch(() => null);
  if (s?.user) return;
  const r = await fetch("/api/auth/sign-in/anonymous", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: "{}" });
  if (!r.ok) throw new Error("Could not sign in. Try again.");
}

function stop() {
  session?.close();
  session = null;
  btn.textContent = "Start";
  btn.classList.remove("on");
  btn.disabled = false;
}

btn.onclick = async () => {
  if (session) { stop(); status("Stopped."); log(""); return; }
  btn.disabled = true;
  // Create and resume audio inside the click gesture, before any await, or Safari keeps it suspended.
  const s = (session = new Session());
  s.outCtx.resume().catch(() => {});
  try {
    await agent();
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
