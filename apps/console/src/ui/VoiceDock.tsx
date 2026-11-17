import { useEffect, useRef, useState } from "react";
import { AudioLines, Mic, Send, Square, X } from "lucide-react";
import type { Atlas, ScopeDef } from "../core/types";
import { createAgentTools, createMcpServer } from "../agent";
import { LiveSession, stepLabel } from "../ai/live";
import { CONSOLE_SYSTEM } from "../ai/setup";

// The AI inside the console: a header button opens a dock that runs a Gemini Live voice session over
// the same tools as the MCP server, plus the screen tools, so the AI can show and point at what it means.


type Line = { k: "you" | "ai" | "step"; t: string; ok?: boolean; id?: number };
let seq = 0;

export function VoiceDock({ atlas, scopes }: { atlas: Atlas; scopes: ScopeDef[] }) {
  const [open, setOpen] = useState(() => new URLSearchParams(location.search).has("voice"));
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Talk to the console. It can show you anything on this page.");
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState("");
  const session = useRef<LiveSession | null>(null);
  const merge = useRef(false);
  const feed = useRef<HTMLDivElement>(null);
  const server = useRef<ReturnType<typeof createMcpServer> | null>(null);
  const tools = useRef<ReturnType<typeof createAgentTools> | null>(null);

  useEffect(() => { feed.current?.scrollTo({ top: feed.current.scrollHeight }); }, [lines]);
  useEffect(() => () => session.current?.close(), []);

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
  }

  async function start() {
    if (session.current) return stop();
    setBusy(true);
    setLines([]);
    merge.current = false;
    if (!tools.current) { tools.current = createAgentTools(atlas, scopes); server.current = createMcpServer(tools.current); }
    const s = (session.current = new LiveSession(server.current!, tools.current.tools, {
      status: setStatus,
      say: (k, t) => t && add({ k, t }),
      turnDone: () => { merge.current = false; },
      step: (name, args) => {
        const id = ++seq;
        setLines((xs) => [...xs, { k: "step", t: stepLabel(name, args), id }]);
        merge.current = false;
        return (ok) => setLines((xs) => xs.map((x) => (x.id === id ? { ...x, ok } : x)));
      },
      ended: (r) => stop(r || "Session ended."),
    }, CONSOLE_SYSTEM));
    try {
      await s.open();
      setOn(true);
    } catch (e) {
      stop((e as Error).message || "Could not start");
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

  return (
    <>
      <button className={"icon-b voice-b" + (on ? " on" : "")} onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Talk to the console" title="Talk to the console">
        <AudioLines size={16} />
      </button>
      {open && (
        <aside className="voice" aria-label="Voice assistant">
          <div className="voice-h">
            <b>Ask the console</b>
            <span className="grow" />
            <button className="icon-b" onClick={() => { stop(); setOpen(false); }} aria-label="Close voice assistant"><X size={15} /></button>
          </div>
          <div className="voice-f" ref={feed} aria-live="polite">
            {!lines.length && <p className="voice-hint">Try “open the camera and show me the record tab” or “what is running right now?”</p>}
            {lines.map((l, i) => <p key={i} className={"vl " + l.k + (l.ok === true ? " ok" : l.ok === false ? " bad" : "")}>{l.t}</p>)}
          </div>
          <p className="voice-s" role="status">{status}</p>
          <div className="voice-c">
            <button className={"voice-go" + (on ? " on" : "")} onClick={start} disabled={busy}>
              {on ? <><Square size={13} />Stop</> : <><Mic size={14} />{busy ? "Starting…" : "Start talking"}</>}
            </button>
            {on && (
              <form className="voice-t" onSubmit={send}>
                <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Or type" aria-label="Type a message" />
                <button className="icon-b" aria-label="Send"><Send size={14} /></button>
              </form>
            )}
          </div>
        </aside>
      )}
    </>
  );
}
