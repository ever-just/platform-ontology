import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AudioLines, Mic, Send, Square, X, EyeOff, MessageSquare } from "lucide-react";
import type { Atlas, ScopeDef } from "../core/types";
import { createAgentTools, createMcpServer } from "../agent";
import type { RpcRequest, ToolDef } from "../agent";
import { LiveSession, stepLabel } from "../ai/live";
import { CONSOLE_SYSTEM } from "../ai/setup";
import { abilitiesBrief } from "../agent/aware-tools";
import { logTalk, memoryBrief, onLoopEvent, restoreLoops } from "../core/agent-memory";
import { describeEl, pointerNow, startAwareness } from "../core/awareness";
import { screen } from "../core/screen";

// The AI inside the console: a header button opens a dock that runs a Gemini Live voice session over
// the same tools as the MCP server, plus the screen tools, so the AI can show and point at what it means.
// It starts on its own on the ai. host (or with ?voice), comes back after a refresh with the same
// conversation, remembers earlier visits, and can show, hide, move and resize its own transcript.

type Line = { k: "you" | "ai" | "step"; t: string; ok?: boolean; id?: number };
type Ui = { hidden: boolean; side: "right" | "left"; size: "compact" | "normal" | "tall" };
type Saved = { on: boolean; handle: string | null; at: number; lines: Line[]; ui: Ui };
let seq = 0;

const KEY = "po.voice.v1";
const FRESH_MS = 2 * 60 * 60 * 1000;
const UI0: Ui = { hidden: false, side: "right", size: "normal" };
function loadSaved(): Saved | null {
  try { const s = JSON.parse(sessionStorage.getItem(KEY) || "null"); return s && typeof s === "object" ? s : null; } catch { return null; }
}
function save(p: Partial<Saved>) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ ...(loadSaved() || { on: false, handle: null, lines: [], ui: UI0 }), ...p, at: Date.now() })); } catch { /* blocked */ }
}
const autoHost = () => /^ai\./.test(location.hostname) || new URLSearchParams(location.search).has("voice");

const SET_TRANSCRIPT: ToolDef = {
  name: "set_transcript",
  description: "Show, hide, move or resize your own conversation panel. visible false hides it to a small pill (you keep listening); side right or left; size compact, normal or tall; clear true empties it.",
  inputSchema: { type: "object", properties: {
    visible: { type: "boolean" }, side: { type: "string", enum: ["right", "left"] },
    size: { type: "string", enum: ["compact", "normal", "tall"] }, clear: { type: "boolean" },
  } },
};

export function VoiceDock({ atlas, scopes }: { atlas: Atlas; scopes: ScopeDef[] }) {
  const saved0 = useRef(loadSaved());
  const resumable = !!(saved0.current?.on && Date.now() - saved0.current.at < FRESH_MS);
  const [open, setOpen] = useState(() => resumable || autoHost());
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Talk to the console. It can show you anything on this page.");
  const [lines, setLines] = useState<Line[]>(() => (resumable ? saved0.current!.lines || [] : []));
  const [ui, setUi] = useState<Ui>(() => ({ ...UI0, ...(saved0.current?.ui || {}) }));
  const [draft, setDraft] = useState("");
  const session = useRef<LiveSession | null>(null);
  const merge = useRef(false);
  const feed = useRef<HTMLDivElement>(null);
  const server = useRef<ReturnType<typeof createMcpServer> | null>(null);
  const tools = useRef<ReturnType<typeof createAgentTools> | null>(null);
  const uiRef = useRef(ui);
  uiRef.current = ui;

  useEffect(() => { feed.current?.scrollTo({ top: feed.current.scrollHeight }); }, [lines]);
  useEffect(() => { save({ lines: lines.slice(-60).map(({ k, t, ok }) => ({ k, t, ok })) }); }, [lines]);
  useEffect(() => { save({ ui }); }, [ui]);

  useEffect(() => {
    startAwareness();
    restoreLoops();
    // Loop results come back as notes the AI answers out loud.
    const off = onLoopEvent((e) => {
      add({ k: "step", t: `loop ${e.loop}: ${e.kind}` });
      session.current?.note(`[loop ${e.loop}] ${e.tool} ${e.kind}: ${e.text}`, true);
    });
    // Audio started without a click stays silent until the first gesture.
    const wake = () => session.current?.outCtx.resume().catch(() => {});
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
    if (resumable || autoHost()) void start(resumable ? saved0.current!.handle : null, false);
    return () => { off(); window.removeEventListener("pointerdown", wake); window.removeEventListener("keydown", wake); session.current?.close(); session.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function add(l: Line) {
    setLines((xs) => {
      const last = xs[xs.length - 1];
      if (merge.current && last && last.k === l.k && l.k !== "step") return [...xs.slice(0, -1), { ...last, t: last.t + l.t }];
      merge.current = l.k !== "step";
      return [...xs, l];
    });
  }

  function stop(msg = "Stopped.") {
    session.current?.close();
    session.current = null;
    setOn(false);
    setStatus(msg);
    save({ on: false, handle: null });
  }

  /** What is on screen, short and stable, so a change is worth a quiet note to the AI. */
  function context() {
    const st = screen()?.state();
    const p = pointerNow();
    const over = p && p.idle_s < 30 ? p.over : null;
    const focus = document.activeElement && document.activeElement !== document.body ? describeEl(document.activeElement) : null;
    const parts = [
      st ? `view ${st.view}${st.pane ? `, pane ${st.pane}` : ""}${st.inspector ? `, side panel ${st.inspector.id}` : ""}` : "",
      over ? `pointer over ${over.control || over.label || over.text || over.tag}${over.in ? ` in ${over.in}` : ""}` : "",
      focus?.control && !focus.control.startsWith("voice.") ? `typing in ${focus.control}` : "",
    ];
    return parts.filter(Boolean).join("; ");
  }

  function transcript(a: Record<string, any>) {
    if (a.clear) setLines([]);
    const next: Ui = {
      hidden: a.visible === undefined ? uiRef.current.hidden : !a.visible,
      side: a.side === "left" || a.side === "right" ? a.side : uiRef.current.side,
      size: ["compact", "normal", "tall"].includes(a.size) ? a.size : uiRef.current.size,
    };
    setUi(next);
    if (!next.hidden) setOpen(true);
    return { ok: true, ...next };
  }

  /** toggle false: only start, never stop a session already running (used by auto start). */
  async function start(handle: string | null = null, toggle = true): Promise<void> {
    if (session.current) { if (toggle) stop(); return; }
    setBusy(true);
    if (!handle) setLines([]);
    merge.current = false;
    if (!tools.current) { tools.current = createAgentTools(atlas, scopes, { pageControls: true, account: true }); server.current = createMcpServer(tools.current); }
    const all = [...tools.current.tools, SET_TRANSCRIPT];
    // set_transcript lives here because it changes this panel; everything else goes to the MCP server.
    const mcp = {
      handle: async (m: RpcRequest) => {
        const p = (m as any).params;
        if (m.method === "tools/call" && p?.name === "set_transcript") {
          const r = transcript(p.arguments || {});
          return { jsonrpc: "2.0", id: (m as any).id, result: { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r } };
        }
        return server.current!.handle(m);
      },
    };
    const system = handle ? CONSOLE_SYSTEM : [CONSOLE_SYSTEM, abilitiesBrief(all, scopes), memoryBrief()].filter(Boolean).join("\n\n");
    const s = (session.current = new LiveSession(mcp, all, {
      status: setStatus,
      say: (k, t) => { if (!t) return; add({ k, t }); logTalk(k, t); },
      turnDone: () => { merge.current = false; },
      step: (name, args) => {
        const id = ++seq;
        setLines((xs) => [...xs, { k: "step", t: stepLabel(name, args), id }]);
        merge.current = false;
        return (ok) => setLines((xs) => xs.map((x) => (x.id === id ? { ...x, ok } : x)));
      },
      ended: (r) => stop(r || "Session ended."),
    }, system, { handle, onHandle: (h) => save({ on: true, handle: h }), context, frames: true }));
    try {
      await s.open();
      if (session.current === s) { setOn(true); save({ on: true, handle: s.handle }); if (handle) setStatus("Picked up where you left off."); }
    } catch (e) {
      if (session.current === s) {
        // A stale handle fails to resume; start fresh once instead.
        if (handle) { session.current = null; s.close(); setBusy(false); return start(null, false); }
        stop((e as Error).message || "Could not start");
      } else s.close();
    } finally {
      setBusy(false);
    }
  }

  function send(e: React.FormEvent) {
    e.preventDefault();
    const t = draft.trim();
    if (!t || !session.current) return;
    merge.current = false;
    session.current.text(t);
    setDraft("");
  }

  const cls = `voice side-${ui.side} size-${ui.size}`;
  return (
    <>
      <button data-control="voice.toggle" className={"icon-b voice-b" + (on ? " on" : "")} onClick={() => { if (ui.hidden) { setUi({ ...ui, hidden: false }); setOpen(true); } else setOpen(!open); }} aria-expanded={open && !ui.hidden} aria-label="Talk to the console" title="Talk to the console">
        <AudioLines size={16} />
      </button>
      {open && ui.hidden && createPortal(
        <button data-control="voice.show" className={`voice-pill side-${ui.side}` + (on ? " on" : "")} onClick={() => setUi({ ...ui, hidden: false })} aria-label="Show the conversation">
          <MessageSquare size={14} />{on ? "Listening" : "Assistant"}
        </button>,
        document.body,
      )}
      {open && !ui.hidden && createPortal(
        <aside className={cls} aria-label="Voice assistant">
          <div className="voice-h">
            <b>Ask the console</b>
            <span className="grow" />
            <button data-control="voice.hide" className="icon-b" onClick={() => setUi({ ...ui, hidden: true })} aria-label="Hide the conversation" title="Hide (keeps listening)"><EyeOff size={15} /></button>
            <button data-control="voice.close" className="icon-b" onClick={() => { stop(); setOpen(false); }} aria-label="Close voice assistant"><X size={15} /></button>
          </div>
          <div className="voice-f" ref={feed} aria-live="polite">
            {!lines.length && <p className="voice-hint">Try “open the camera and show me the record tab”, “what is running right now?” or “tell me when the battery drops below 20%”.</p>}
            {lines.map((l, i) => <p key={i} className={"vl " + l.k + (l.ok === true ? " ok" : l.ok === false ? " bad" : "")}>{l.t}</p>)}
          </div>
          <p className="voice-s" role="status">{status}</p>
          <div className="voice-c">
            <button data-control="voice.talk" className={"voice-go" + (on ? " on" : "")} onClick={() => void start()} disabled={busy}>
              {on ? <><Square size={13} />Stop</> : <><Mic size={14} />{busy ? "Starting…" : "Start talking"}</>}
            </button>
            {on && (
              <form className="voice-t" onSubmit={send}>
                <input data-control="voice.text" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Or type" aria-label="Type a message" />
                <button data-control="voice.send" className="icon-b" aria-label="Send"><Send size={14} /></button>
              </form>
            )}
          </div>
        </aside>,
        document.body,
      )}
    </>
  );
}
