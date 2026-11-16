import { useEffect, useMemo, useRef, useState } from "react";
import { Ban, Check, CircleAlert, Hand, Lock, MousePointerClick, PackageOpen, Play, RotateCcw, SkipForward, X, Zap } from "lucide-react";
import type { ScopeDef } from "../core/types";
import { getSession, isActive, request, useSession, useVersion } from "../core/harness";
import { gate, type Gate } from "./runall-gate";
import type { ConsoleCtx } from "../ext/registry";
import { CapIcon } from "./icons";
import "./runall.css";

// Run all: starts every capability this browser can actually run. Before anything is queued, each one
// is checked (feature present, not blocked, allowed by Permissions Policy, hardware present), and the
// ones that cannot start are listed with the reason instead of prompted. Silent ones start at once; the
// rest are walked through one at a time, because each browser prompt needs its own click. Counts come
// from the live session state, not from what was requested.

/** silent: no prompt. ask: a permission prompt. tap: needs a click but no prompt. pick: opens a chooser. */
export type Kind = "silent" | "ask" | "tap" | "pick";
type Outcome = "ok" | "refused" | "blocked" | "none" | "skipped" | "failed";
type Phase = "intro" | "step" | "done";

const PICK_ID = /\.(usb|serial|hid|bluetooth|screen|contacts)$/;
const PICK_NAME = /file|folder|picker|contact/i;
const ORDER: Record<Kind, number> = { silent: 0, ask: 1, tap: 2, pick: 3 };

export function kindOf(s: ScopeDef): Kind {
  if (s.reference) return "silent";
  if ((PICK_ID.test(s.id) || PICK_NAME.test(s.name)) && (s.gesture || s.permission)) return "pick";
  if (s.permission) return "ask";
  if (s.gesture) return "tap";
  return "silent";
}

async function permState(s: ScopeDef): Promise<string> {
  if (!s.permission || !navigator.permissions) return "";
  try { return (await navigator.permissions.query({ name: s.permission as PermissionName })).state; } catch { return ""; }
}

function unblockSteps(engine: string, brand: string): string[] {
  const e = (engine + " " + brand).toLowerCase();
  if (e.includes("firefox") || e.includes("gecko")) return ["Click the permissions icon at the left of the address bar.", "Clear the blocked entry for this permission.", "Come back here and try again."];
  if (e.includes("safari") || e.includes("webkit")) return ["Open the Safari menu and choose Settings for this website (on iPhone: the aA button, then Website Settings).", "Set this permission to Ask or Allow.", "Come back here and try again."];
  return ["Click the site controls icon at the left of the address bar.", "Turn this permission on, or choose Reset permission.", "Come back here and try again."];
}

const VERB: Record<Kind, string> = { silent: "Run", ask: "Allow", tap: "Run", pick: "Choose" };
const HINT: Record<Kind, string> = {
  silent: "Runs without asking.",
  ask: "Your browser will show a prompt. Choose Allow to turn it on.",
  tap: "Needs one click from you, then it runs. There is no prompt.",
  pick: "Your browser will open a chooser. Pick an item, or cancel to skip it.",
};
const RESULT: Record<Outcome, [string, typeof Check, string]> = {
  ok: ["Running", Check, "ok"], refused: ["Refused", Ban, "err"], blocked: ["Blocked", Lock, "err"],
  none: ["Nothing picked", PackageOpen, "warn"], skipped: ["Skipped", SkipForward, "mute"], failed: ["Failed", CircleAlert, "warn"],
};

export function RunAll({ ctx }: { ctx: ConsoleCtx }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("intro");
  const [queue, setQueue] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState<Record<string, Outcome>>({});
  const [asked, setAsked] = useState<string[]>([]);
  const [silentIds, setSilentIds] = useState<string[]>([]);
  const [gates, setGates] = useState<Record<string, Gate> | null>(null);
  useVersion(); // re-render as sessions change, so every count is live
  const [pickers, setPickers] = useState(true);
  const [perm, setPerm] = useState<Record<string, string>>({});

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) { d.showModal(); d.querySelector<HTMLElement>("[data-af]")?.focus(); }
    if (!open && d.open) d.close();
  }, [open]);

  const byId = useMemo(() => new Map(ctx.scopes.map((s) => [s.id, s])), [ctx.scopes]);

  // The plan, rebuilt each time the intro shows. A permission already granted needs no prompt, so it joins the silent batch.
  const plan = useMemo(() => {
    const p = { silent: [] as ScopeDef[], ask: [] as ScopeDef[], tap: [] as ScopeDef[], pick: [] as ScopeDef[], running: 0, out: [] as [ScopeDef, NonNullable<Gate>][] };
    for (const s of ctx.scopes) {
      if (isActive(getSession(s.id))) { p.running++; continue; }
      const g = gates?.[s.id];
      if (g) { p.out.push([s, g]); continue; }
      const k = kindOf(s);
      if (k !== "silent" && perm[s.id] === "granted" && k !== "pick") p.silent.push(s); else p[k].push(s);
    }
    const sort = (a: ScopeDef, b: ScopeDef) => (a.layer || 1) - (b.layer || 1) || a.name.localeCompare(b.name);
    p.ask.sort(sort); p.tap.sort(sort); p.pick.sort(sort);
    p.out.sort((a, b) => a[1].why.localeCompare(b[1].why) || a[0].name.localeCompare(b[0].name));
    return p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.scopes, perm, gates, open, phase]);

  const show = () => {
    if (phase === "done") setPhase("intro");
    setOpen(true);
    // Look up permission states so the plan knows what is already allowed or already blocked.
    void Promise.all(ctx.scopes.filter((s) => s.permission && !s.reference).map(async (s) => [s.id, await permState(s)] as const))
      .then((rows) => setPerm(Object.fromEntries(rows)));
    // Check what can actually start here, so impossible prompts never reach the queue.
    void Promise.all(ctx.scopes.map(async (s) => [s.id, await gate(s, ctx.nodeOf(s), ctx.profile).catch(() => null)] as const))
      .then((rows) => setGates(Object.fromEntries(rows)));
  };

  const start = () => {
    plan.silent.forEach((s) => void request(s.id));
    setSilentIds(plan.silent.map((s) => s.id));
    const q = [...plan.ask, ...plan.tap, ...(pickers ? plan.pick : [])].map((s) => s.id);
    setQueue(q); setAsked(q); setResults({}); setIdx(0);
    setPhase(q.length ? "step" : "done");
  };

  const settle = (id: string, o: Outcome) => {
    setResults((r) => ({ ...r, [id]: o }));
    setIdx((i) => { const n = i + 1; if (n >= queue.length) setPhase("done"); return n; });
  };

  const stopAsking = () => {
    setResults((r) => { const x = { ...r }; queue.slice(idx).forEach((id) => { if (!x[id]) x[id] = "skipped"; }); return x; });
    setPhase("done");
  };

  const retry = (ids: string[]) => {
    if (!ids.length) return;
    setResults((r) => { const x = { ...r }; ids.forEach((id) => delete x[id]); return x; });
    setQueue(ids); setIdx(0); setPhase("step");
  };

  const current = phase === "step" ? byId.get(queue[idx]) : undefined;
  const again = asked.filter((id) => results[id] && results[id] !== "ok");
  const silentLive = silentIds.filter((id) => isActive(getSession(id))).length;
  const silentFailed = silentIds.filter((id) => ["error", "unsupported", "denied"].includes(getSession(id).state));
  const checking = gates === null;
  const label = phase === "step" && !open ? `Resume ${idx + 1}/${queue.length}` : "Run all";

  return (
    <>
      <button className={"btn sm ra-b" + (phase === "step" ? " on" : "")} onClick={show} title="Start every capability this browser supports, one prompt at a time">
        <Zap size={13} /><span>{label}</span>
      </button>
      <dialog ref={ref} className="ra" onClose={() => setOpen(false)} onClick={(e) => e.target === ref.current && setOpen(false)} aria-labelledby="ra-t">
        <div className="ra-in">
          <header>
            <Zap size={17} />
            <h2 id="ra-t">{phase === "done" ? "Run all: finished" : "Run all"}</h2>
            <button className="btn ghost sm" onClick={() => setOpen(false)} aria-label={phase === "step" ? "Pause" : "Close"} title={phase === "step" ? "Pause. Press Resume in the header to carry on." : "Close"}><X size={14} /></button>
          </header>

          {phase === "intro" && (
            <>
              <p>Starts every capability this browser and device can actually run. The silent ones start straight away. Then each one that needs your approval comes up in turn, one click each, because browsers only show a prompt after a click.</p>
              <div className="ra-plan">
                <Cell icon={Zap} n={plan.silent.length} label="Start silently" hint="No prompt. They start the moment you press Start." />
                <Cell icon={Hand} n={plan.ask.length} label="Ask permission" hint="The browser shows an Allow or Block prompt." />
                <Cell icon={MousePointerClick} n={plan.tap.length} label="Need a click" hint="No prompt, but the browser wants a click first." />
                <Cell icon={PackageOpen} n={plan.pick.length} label="Open a chooser" hint="You pick a device, screen, file or contact." off={!pickers} />
              </div>
              {plan.ask.length + plan.tap.length + plan.pick.length > 0 && (
                <div className="ra-chips" aria-label="Will ask in this order">
                  {[...plan.ask, ...plan.tap, ...(pickers ? plan.pick : [])].map((s) => (
                    <span key={s.id} className={perm[s.id] === "denied" ? "blk" : ""} title={perm[s.id] === "denied" ? "Blocked earlier. You will get steps to unblock it." : s.summary}>
                      <CapIcon scope={s} size={12} />{s.name}{perm[s.id] === "denied" && <Lock size={11} />}
                    </span>
                  ))}
                </div>
              )}
              <label className="ra-opt"><input type="checkbox" checked={pickers} onChange={(e) => setPickers(e.target.checked)} />Include choosers (devices, screen, files, contacts)</label>
              {plan.out.length > 0 && (
                <details className="ra-out">
                  <summary><Ban size={13} />{plan.out.length} left out because they cannot start here</summary>
                  <div className="ra-list">
                    {plan.out.map(([s, g]) => (
                      <div key={s.id} className="ra-row" title={s.summary}>
                        <CapIcon scope={s} size={14} />
                        <button className="lnk" onClick={() => { ctx.select(s.id); setOpen(false); }}>{s.name}</button>
                        <span className={"ra-why " + g.why}>{g.text}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
              <p className="ra-fine">{checking ? "Checking what this browser and device can run. " : ""}{plan.running > 0 && `${plan.running} already running. `}You can pause at any point and pick up where you left off.</p>
              <footer>
                <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
                <button className="btn pri" data-af onClick={start} disabled={checking}>{checking ? <><span className="ra-spin" />Checking</> : <><Play size={13} />Start</>}</button>
              </footer>
            </>
          )}

          {phase === "step" && current && (
            <Step key={current.id + ":" + idx} scope={current} kind={kindOf(current)} pos={idx} total={queue.length}
              next={byId.get(queue[idx + 1])} ctx={ctx} silent={[silentLive, silentIds.length]} known={perm[current.id]}
              onDone={(o) => settle(current.id, o)} onStop={stopAsking} />
          )}

          {phase === "done" && (
            <Summary ids={asked} results={results} byId={byId} silentLive={silentLive} silentFailed={silentFailed} ctx={ctx}
              onRetry={retry} onClose={() => setOpen(false)} again={again} />
          )}
        </div>
      </dialog>
    </>
  );
}

function Cell({ icon: I, n, label, hint, off }: { icon: typeof Zap; n: number; label: string; hint: string; off?: boolean }) {
  return <div className={"ra-cell" + (off ? " off" : "")} title={hint}><I size={14} /><b>{n}</b><span>{label}</span></div>;
}

function Step({ scope, kind, pos, total, next, ctx, silent, known, onDone, onStop }: {
  scope: ScopeDef; kind: Kind; pos: number; total: number; next?: ScopeDef; ctx: ConsoleCtx; silent: [number, number]; known?: string;
  onDone: (o: Outcome) => void; onStop: () => void;
}) {
  const s = useSession(scope.id);
  const [clickAt, setClickAt] = useState(0);
  const [tries, setTries] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [msg, setMsg] = useState("");
  const [unblocked, setUnblocked] = useState(false);
  const primary = useRef<HTMLButtonElement>(null);
  const waiting = clickAt > 0 && !outcome;
  const [slow, setSlow] = useState(false);

  // Already running (started elsewhere, or by the silent batch): nothing to ask.
  useEffect(() => {
    if (!clickAt && isActive(s)) { setOutcome("ok"); const h = setTimeout(() => onDone("ok"), 650); return () => clearTimeout(h); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.state]);

  // A prompt that never shows (quiet permission UI, or a prompt hidden behind another window) should not look like a hang.
  useEffect(() => {
    setSlow(false);
    if (!waiting) return;
    const h = setTimeout(() => setSlow(true), 12000);
    return () => clearTimeout(h);
  }, [waiting, clickAt]);
  const g = ctx.groupOf(scope.id);

  const go = () => {
    setOutcome(null); setMsg(""); setUnblocked(false);
    setTries((t) => t + 1);
    setClickAt(Date.now());
    void request(scope.id);
  };

  // Read the result of this attempt from the session.
  useEffect(() => {
    if (!clickAt || outcome || s.startedAt < clickAt - 50) return;
    if (s.state === "granted" || s.state === "streaming") {
      setOutcome("ok");
      const h = setTimeout(() => onDone("ok"), 650);
      return () => clearTimeout(h);
    }
    if (s.state === "denied") {
      const fast = Date.now() - clickAt < 400;
      void permState(scope).then((p) => {
        setOutcome(p === "denied" || fast ? "blocked" : "refused");
        setMsg(s.error);
      });
    } else if (s.state === "stopped") { setOutcome("none"); setMsg(s.error); }
    else if (s.state === "error" || s.state === "unsupported") {
      setOutcome("failed"); setMsg(s.error);
      const h = setTimeout(() => onDone("failed"), 2400);
      return () => clearTimeout(h);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.state, s.startedAt, clickAt, outcome]);

  // While blocked, watch for the visitor lifting the block in site settings.
  useEffect(() => {
    if (outcome !== "blocked" || !scope.permission || !navigator.permissions) return;
    let st: PermissionStatus | null = null;
    let live = true;
    navigator.permissions.query({ name: scope.permission as PermissionName }).then((x) => {
      if (!live) return;
      st = x;
      x.onchange = () => { if (x.state !== "denied") { setUnblocked(true); primary.current?.focus(); } };
    }).catch(() => {});
    return () => { live = false; if (st) st.onchange = null; };
  }, [outcome, scope.permission]);

  useEffect(() => { if (!waiting) primary.current?.focus(); }, [waiting, outcome]);

  const steps = unblockSteps(ctx.profile.engine, ctx.profile.brand);
  const verb = VERB[kind];

  return (
    <div className="ra-step" aria-live="polite">
      <div className="ra-prog">
        <span>{pos + 1} of {total}</span>
        <i><b style={{ width: `${((pos + (outcome === "ok" ? 1 : 0)) / total) * 100}%` }} /></i>
        {silent[1] > 0 && <em title="Counted from what is actually running, not from what was requested"><Check size={12} />{silent[0]} of {silent[1]} running silently</em>}
      </div>

      <div className={"ra-card" + (outcome ? " o-" + RESULT[outcome][2] : "")}>
        <span className="ra-ic"><CapIcon scope={scope} size={22} /></span>
        <div className="ra-t">
          <span className="ra-g">{g.label}</span>
          <h3>{scope.name}</h3>
          <p>{scope.summary}</p>
        </div>
      </div>

      {!outcome && !clickAt && known === "denied" && (
        <div className="ra-msg err">
          <Lock size={14} />
          <div><b>{scope.name} was blocked earlier on this site,</b> so the browser may refuse without asking. To allow it:
            <ol>{steps.map((x) => <li key={x}>{x}</li>)}</ol></div>
        </div>
      )}
      {!outcome && !(known === "denied" && !clickAt) && <p className="ra-hint">{waiting ? (kind === "pick" ? "Waiting for you to pick something in the chooser." : "Waiting for your answer in the browser prompt.") : HINT[kind]}</p>}

      {waiting && slow && (
        <p className="ra-msg warn"><CircleAlert size={14} /><span>No prompt yet? Your browser may have shown it quietly as an icon in the address bar, or blocked it without asking. Check there, or press Skip.</span></p>
      )}
      {outcome === "ok" && <p className="ra-msg ok"><Check size={14} />{scope.name} is running.</p>}

      {outcome === "refused" && (
        <div className="ra-msg err">
          <Ban size={14} />
          <div><b>You said no to {scope.name}.</b> Nothing is collected from it. You can ask again now or skip it; skipped ones can be asked again at the end.
            {tries >= 2 && <span className="ra-note"> Browsers stop showing a prompt after a few refusals. If nothing appears, follow the unblock steps your browser gives.</span>}</div>
        </div>
      )}

      {outcome === "blocked" && (
        <div className="ra-msg err">
          <Lock size={14} />
          <div>
            <b>{unblocked ? `${scope.name} is unblocked.` : `Your browser has blocked ${scope.name} for this site.`}</b>
            {unblocked ? " Press Ask again to turn it on." : " It will not show the prompt again until you change it:"}
            {!unblocked && <ol>{steps.map((x) => <li key={x}>{x}</li>)}</ol>}
          </div>
        </div>
      )}

      {outcome === "none" && <p className="ra-msg warn"><PackageOpen size={14} />Nothing was picked, so {scope.name} did not start.</p>}
      {outcome === "failed" && <p className="ra-msg warn"><CircleAlert size={14} /><span>{scope.name} could not start{msg ? `: ${msg}` : "."} Moving on.</span></p>}

      <footer>
        <button className="btn ghost" onClick={onStop} title="Stop asking and see the summary">Stop asking</button>
        <span className="grow" />
        {outcome !== "ok" && (
          <button className="btn" onClick={() => onDone(outcome ?? "skipped")} disabled={waiting && !slow}>
            <SkipForward size={13} />{outcome ? "Next" : "Skip"}
          </button>
        )}
        {(!outcome || outcome === "refused" || outcome === "blocked" || outcome === "none") && (
          <button ref={primary} className="btn pri" disabled={waiting} onClick={go}>
            {waiting ? <><span className="ra-spin" />Waiting</> : outcome ? <><RotateCcw size={13} />{outcome === "none" ? "Pick again" : "Ask again"}</> : <><Play size={13} />{known === "denied" ? "Try" : verb} {scope.name}</>}
          </button>
        )}
      </footer>
      {next && !outcome && <p className="ra-next">Next: {next.name}</p>}
    </div>
  );
}

function Summary({ ids, results, byId, silentLive, silentFailed, ctx, again: asked, onRetry, onClose }: {
  ids: string[]; results: Record<string, Outcome>; byId: Map<string, ScopeDef>; silentLive: number; silentFailed: string[]; ctx: ConsoleCtx; again: string[];
  onRetry: (ids: string[]) => void; onClose: () => void;
}) {
  // Approved only counts what is still running now, so a prompt that was allowed but then failed is not counted.
  const ok = ids.filter((id) => results[id] === "ok" && isActive(getSession(id))).length;
  const again = [...asked, ...ids.filter((id) => results[id] === "ok" && !isActive(getSession(id))), ...silentFailed.filter((id) => !asked.includes(id))];
  const tagOf = (id: string): Outcome => results[id] && results[id] !== "ok" ? results[id] : "failed";
  return (
    <>
      <div className="ra-plan">
        <Cell icon={Zap} n={silentLive} label="Running silently" hint="Started without a prompt and running now" />
        <Cell icon={Check} n={ok} label="Approved" hint="You allowed these" />
        <Cell icon={Ban} n={again.length} label="Not running" hint="Refused, blocked, skipped, nothing picked or failed to start" />
      </div>
      {again.length > 0 ? (
        <>
          <p>These did not start. Ask again for all of them, or one at a time.</p>
          <div className="ra-list">
            {again.map((id) => {
              const s = byId.get(id)!;
              const [l, I, tone] = RESULT[tagOf(id)];
              const err = getSession(id).error;
              return (
                <div key={id} className="ra-row">
                  <CapIcon scope={s} size={14} />
                  <button className="lnk" onClick={() => { ctx.select(id); onClose(); }}>{s.name}</button>
                  <span className={"ra-tag " + tone} title={err || undefined}><I size={12} />{l}</span>
                  <button className="btn sm" onClick={() => onRetry([id])}><RotateCcw size={12} />Ask again</button>
                </div>
              );
            })}
          </div>
        </>
      ) : <p>Everything you were asked about is running. Use Stop in the header to turn it all off.</p>}
      <footer>
        <button className="btn" onClick={onClose}>Close</button>
        {again.length > 0 && <button className="btn pri" data-af onClick={() => onRetry(again)}><RotateCcw size={13} />Ask again for {again.length}</button>}
      </footer>
    </>
  );
}
