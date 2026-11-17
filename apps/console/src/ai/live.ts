import type { RpcRequest, ToolDef } from "../agent";
import { buildSetup } from "./setup";

// One Gemini Live voice session: mint a one use token, stream the microphone, play the spoken answer
// and run each tool call on the in-page MCP server. The standalone voice page and the console dock
// both use it and only differ in how they draw the conversation.

const WS = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";

export type LiveHooks = {
  status(s: string): void;
  say(who: "you" | "ai", text: string): void;
  turnDone(): void;
  /** A tool call started; call the returned function with whether it worked. */
  step(name: string, args: Record<string, any>): (ok: boolean) => void;
  ended(reason?: string): void;
};
export type Mcp = { handle(m: RpcRequest): Promise<any> };

const b64 = (buf: ArrayBuffer) => { let s = ""; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer;
const WORKLET = `class P extends AudioWorkletProcessor{constructor(){super();this.b=[];}process(i){const c=i[0]&&i[0][0];if(c){this.b.push(...c);if(this.b.length>=1600){this.port.postMessage(new Float32Array(this.b));this.b=[];}}return true;}}registerProcessor("pcm",P);`;

/** Short label for a tool call in the transcript. */
export const stepLabel = (name: string, a: Record<string, any> = {}) =>
  `${name.replace(/_/g, " ")}${a.id ? `: ${a.id}` : a.capability ? `: ${a.capability}` : a.view ? `: ${a.view}` : a.query ? `: ${a.query}` : ""}`;

export class LiveSession {
  ws!: WebSocket;
  mic!: MediaStream;
  inCtx!: AudioContext;
  outCtx = new AudioContext({ sampleRate: 24000 });
  playAt = 0;
  playing = new Set<AudioBufferSourceNode>();
  closed = false;

  /** Construct inside the click handler so audio may play (Safari keeps it suspended otherwise). */
  constructor(private mcp: Mcp, public tools: ToolDef[], private on: LiveHooks, private system?: string) {
    this.outCtx.resume().catch(() => {});
  }

  async open() {
    this.on.status("Getting a session…");
    await signedIn();
    const r = await fetch("/api/gemini-token", { method: "POST", credentials: "include" });
    const t = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(t.error || "Could not start");
    this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    this.ws = new WebSocket(`${WS}?access_token=${encodeURIComponent(t.token)}`);
    await new Promise<void>((ok, bad) => { this.ws.onopen = () => ok(); this.ws.onerror = () => bad(new Error("Connection failed")); });
    this.ws.onmessage = (e) => this.onMessage(e);
    this.ws.onclose = (e) => { if (!this.closed) { this.close(); this.on.ended(e.reason ? `Ended: ${e.reason}` : "Session ended"); } };
    this.send(buildSetup(t.model, this.tools, ["AUDIO"], this.system));
  }

  send(o: unknown) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(o)); }

  /** Type instead of talking. */
  text(t: string) {
    this.on.say("you", t);
    this.on.turnDone();
    this.send({ realtimeInput: { text: t } });
  }

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
    this.on.status("Listening. Ask what this browser can do.");
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
    if (sc?.inputTranscription?.text) this.on.say("you", sc.inputTranscription.text);
    if (sc?.outputTranscription?.text) this.on.say("ai", sc.outputTranscription.text);
    if (sc?.turnComplete) this.on.turnDone();
    sc?.modelTurn?.parts?.forEach((p: any) => { if (p.inlineData?.data) this.play(unb64(p.inlineData.data)); });
    if (m.toolCall?.functionCalls) {
      const functionResponses = await Promise.all(m.toolCall.functionCalls.map(async (c: any) => {
        const done = this.on.step(c.name, c.args || {});
        const r = await this.mcp.handle({ jsonrpc: "2.0", id: c.id, method: "tools/call", params: { name: c.name, arguments: c.args || {} } });
        done(!(r?.error || r?.result?.isError));
        const out = r?.result?.structuredContent ?? r?.result?.content?.map((x: any) => x.text).join("\n") ?? r?.error ?? null;
        return { id: c.id, name: c.name, response: { result: out } };
      }));
      this.send({ toolResponse: { functionResponses } });
    }
    if (m.goAway) this.on.status("Session is ending soon.");
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.hush();
    try { this.ws?.close(); } catch {}
    this.mic?.getTracks().forEach((t) => t.stop());
    this.inCtx?.close().catch(() => {});
    this.outCtx.close().catch(() => {});
  }
}

// The token endpoint needs a session; start an anonymous one if this browser has none.
async function signedIn() {
  const s = await fetch("/api/auth/get-session", { credentials: "include" }).then((r) => r.json()).catch(() => null);
  if (s?.user) return;
  const r = await fetch("/api/auth/sign-in/anonymous", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: "{}" });
  if (!r.ok) throw new Error("Could not sign in. Try again.");
}
