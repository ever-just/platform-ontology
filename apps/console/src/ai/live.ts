import type { RpcRequest, ToolDef } from "../agent";
import { buildSetup } from "./setup";
import { allSessions, isActive } from "../core/harness";
import { setSeeing } from "../core/awareness";

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
export type LiveOpts = {
  /** Resume handle from an earlier connection (after a refresh or a drop). */
  handle?: string | null;
  /** Called with each new resume handle the server sends. */
  onHandle?(h: string | null): void;
  /** Short text describing what is on screen now; sent as a quiet note when it changes. */
  context?(): string;
  /** Send camera or screen frames about once a second while one is running. */
  frames?: boolean;
};

const b64 = (buf: ArrayBuffer) => { let s = ""; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer;
const WORKLET = `class P extends AudioWorkletProcessor{constructor(){super();this.b=[];}process(i){const c=i[0]&&i[0][0];if(c){this.b.push(...c);if(this.b.length>=1600){this.port.postMessage(new Float32Array(this.b));this.b=[];}}return true;}}registerProcessor("pcm",P);`;

/** Short label for a tool call in the transcript. */
export const stepLabel = (name: string, a: Record<string, any> = {}) =>
  `${name.replace(/_/g, " ")}${a.id ? `: ${a.id}` : a.capability ? `: ${a.capability}` : a.view ? `: ${a.view}` : a.query ? `: ${a.query}` : ""}`;

export class LiveSession {
  ws!: WebSocket;
  mic?: MediaStream;
  inCtx!: AudioContext;
  outCtx = new AudioContext({ sampleRate: 24000 });
  playAt = 0;
  playing = new Set<AudioBufferSourceNode>();
  closed = false;
  micOn = false;
  handle: string | null = null;
  retries = 0;
  private talking = false;
  private held: { text: string; reply: boolean }[] = [];
  private onSetup?: () => void;
  timers: ReturnType<typeof setInterval>[] = [];
  lastCtx = "";
  ctxDue: ReturnType<typeof setTimeout> | null = null;
  frame?: { v: HTMLVideoElement; c: HTMLCanvasElement; id: string };

  /** Construct inside the click handler so audio may play (Safari keeps it suspended otherwise). */
  constructor(private mcp: Mcp, public tools: ToolDef[], private on: LiveHooks, private system?: string, private opts: LiveOpts = {}) {
    this.handle = opts.handle || null;
    this.outCtx.resume().catch(() => {});
  }

  /** Throw if close() ran while we were awaiting, after releasing anything acquired since. */
  private alive() {
    if (!this.closed) return;
    this.mic?.getTracks().forEach((t) => t.stop());
    try { this.ws?.close(); } catch {}
    this.inCtx?.close().catch(() => {});
    throw new Error("Stopped.");
  }

  async open() {
    this.on.status("Getting a session…");
    await signedIn();
    this.alive();
    const r = await fetch("/api/gemini-token", { method: "POST", credentials: "include" });
    const t = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(t.error || "Could not start");
    this.alive();
    // No microphone (denied, missing or blocked) still leaves a typed session.
    this.mic = await navigator.mediaDevices?.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } }).catch(() => undefined);
    this.alive();
    await this.connect(t);
    if (this.opts.frames) this.timers.push(setInterval(() => this.sendFrame(), 1000));
    if (this.opts.context) this.timers.push(setInterval(() => this.watchContext(), 1000));
  }

  private async connect(t: { token: string; model: string }) {
    const ws = new WebSocket(`${WS}?access_token=${encodeURIComponent(t.token)}`);
    this.ws = ws;
    await new Promise<void>((ok, bad) => { ws.onopen = () => ok(); ws.onerror = () => bad(new Error("Connection failed")); });
    this.alive();
    let ready = false;
    const setup = new Promise<void>((ok, bad) => { this.onSetup = ok; ws.addEventListener("close", (e) => { if (!ready) bad(new Error(e.reason || "Session refused")); }); });
    ws.onmessage = (e) => this.onMessage(e);
    ws.onclose = (e) => { if (ready && !this.closed && this.ws === ws) void this.dropped(e.reason); };
    this.send(buildSetup(t.model, this.tools, ["AUDIO"], this.system, this.handle));
    await setup;
    ready = true;
    this.alive();
  }

  /** The socket closed without us asking: pick the same conversation back up if we can. */
  private async dropped(reason?: string) {
    if (this.handle && this.retries < 3) {
      this.retries++;
      this.on.status("Reconnecting…");
      try {
        const r = await fetch("/api/gemini-token", { method: "POST", credentials: "include" });
        const t = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(t.error || "no token");
        if (this.closed) return;
        await this.connect(t);
        return;
      } catch { /* fall through */ }
    }
    this.close();
    this.on.ended(reason ? `Ended: ${reason}` : "Session ended");
  }

  /** Tell the model something without the person having said it. reply false keeps it quiet. */
  note(text: string, reply = false) {
    if (this.talking) { this.held = this.held.filter((h) => reply || !h.text.startsWith("[screen update")); this.held.push({ text, reply }); return; }
    this.send({ clientContent: { turns: [{ role: "user", parts: [{ text }] }], turnComplete: reply } });
  }
  private flushNotes() {
    const h = this.held; this.held = [];
    const reply = h.some((x) => x.reply);
    if (h.length) this.send({ clientContent: { turns: h.map((x) => ({ role: "user", parts: [{ text: x.text }] })), turnComplete: reply } });
  }

  private watchContext() {
    const now = this.opts.context?.() || "";
    if (!now || now === this.lastCtx) return;
    this.lastCtx = now;
    if (this.ctxDue) clearTimeout(this.ctxDue);
    this.ctxDue = setTimeout(() => { if (!this.closed && this.lastCtx === now) this.note(`[screen update, no reply needed] ${now}`); }, 1200);
  }

  /** About once a second, send a still from the newest running camera or screen capture. */
  private sendFrame() {
    if (this.ws?.readyState !== 1 || document.visibilityState !== "visible") return;
    // A screen share of this tab must not carry an account or key panel to the model.
    if (document.querySelector("[data-agent-off]")) return;
    const live = allSessions().filter((s) => isActive(s) && s.media?.getVideoTracks().some((t) => t.readyState === "live")).sort((a, b) => b.startedAt - a.startedAt)[0];
    if (!live) { if (this.frame) { this.frame.v.srcObject = null; this.frame = undefined; setSeeing(null); } return; }
    if (this.frame?.id !== live.id || this.frame.v.srcObject !== live.media) {
      const v = this.frame?.v || document.createElement("video");
      v.muted = true; v.playsInline = true; v.srcObject = live.media; v.play().catch(() => {});
      this.frame = { v, c: this.frame?.c || document.createElement("canvas"), id: live.id };
      const track = live.media!.getVideoTracks()[0];
      setSeeing({ id: live.id, name: track?.label || live.id });
    }
    const { v, c } = this.frame;
    if (!v.videoWidth) return;
    const w = Math.min(768, v.videoWidth), h = Math.round((v.videoHeight / v.videoWidth) * w);
    c.width = w; c.height = h;
    c.getContext("2d")?.drawImage(v, 0, 0, w, h);
    const data = c.toDataURL("image/jpeg", 0.6).split(",")[1];
    if (data) this.send({ realtimeInput: { video: { data, mimeType: "image/jpeg" } } });
  }

  send(o: unknown) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(o)); }

  /** Type instead of talking. */
  text(t: string) {
    this.on.say("you", t);
    this.on.turnDone();
    this.send({ realtimeInput: { text: t } });
  }

  async startMic() {
    if (this.micOn) { this.on.status("Listening."); return; }
    this.micOn = true;
    if (!this.mic) { this.on.status("Microphone is off. Type your question below."); return; }
    this.inCtx = new AudioContext({ sampleRate: 16000 });
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
    await this.inCtx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    if (this.closed) { this.inCtx.close().catch(() => {}); return; }
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
    if (m.setupComplete) { this.retries = 0; this.onSetup?.(); this.onSetup = undefined; await this.startMic(); return; }
    if (m.sessionResumptionUpdate) {
      const u = m.sessionResumptionUpdate;
      if (u.resumable !== false && u.newHandle) { this.handle = u.newHandle; this.opts.onHandle?.(u.newHandle); }
      return;
    }
    const sc = m.serverContent;
    if (sc?.interrupted) this.hush();
    if (sc?.inputTranscription?.text) this.on.say("you", sc.inputTranscription.text);
    if (sc?.outputTranscription?.text) this.on.say("ai", sc.outputTranscription.text);
    if (sc?.modelTurn || sc?.outputTranscription) this.talking = true;
    if (sc?.turnComplete || sc?.interrupted) { this.talking = false; this.flushNotes(); }
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
    // The server is about to drop this connection; reconnect now with the latest handle.
    if (m.goAway && this.handle) { const old = this.ws; this.ws = undefined as any; try { old.close(); } catch {} void this.dropped("server asked to reconnect"); }
    else if (m.goAway) this.on.status("Session is ending soon.");
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.timers.forEach(clearInterval);
    if (this.ctxDue) clearTimeout(this.ctxDue);
    if (this.frame) { this.frame.v.srcObject = null; this.frame = undefined; setSeeing(null); }
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
