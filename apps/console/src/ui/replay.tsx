import { Component, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button, ButtonGroup, HTMLSelect, Tag } from "@blueprintjs/core";
import { Pause, Play, Refresh, StepBackward, StepForward } from "@blueprintjs/icons";
import type { Rec, ScopeDef, Session } from "../core/types";
import { loadHistory } from "../core/history";
import { fmt } from "./kit";
import { clock } from "./charts";

// Replays a session: the scope's own Instrument is fed the records up to the playhead, so the replay looks
// exactly like the live view did. Sources: the readings held in memory for this run (full detail, last 600),
// or the readings saved in this tab's IndexedDB history (numbers only) when memory is empty.

const SPEEDS = [0.25, 0.5, 1, 2, 4, 8, 16];
type Ev = { t: number; msg: string; level: Session["logs"][number]["level"] };

class Guard extends Component<{ children: ReactNode; k: string }, { err: boolean }> {
  state = { err: false };
  static getDerivedStateFromError() { return { err: true }; }
  componentDidUpdate(p: { k: string }) { if (p.k !== this.props.k && this.state.err) this.setState({ err: false }); }
  render() { return this.state.err ? <p className="empty">This view cannot draw from saved numbers alone; the chart below still replays.</p> : this.props.children; }
}

/** Index of the last record at or before t (records are sorted by time). */
function at(recs: Rec[], t: number) {
  let lo = 0, hi = recs.length - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (recs[m].t <= t) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans;
}

export function Replay({ scope, session }: { scope: ScopeDef; session: Session }) {
  const [snap, setSnap] = useState<{ recs: Rec[]; events: Ev[]; from: "memory" | "saved" } | null>(null);
  const [ph, setPh] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const raf = useRef(0);

  const take = async () => {
    setPlaying(false);
    let recs = session.records.slice();
    let from: "memory" | "saved" = "memory";
    if (!recs.length) {
      const rows = await loadHistory(scope.id);
      recs = rows.map((r) => ({ seq: r.seq, t: r.t, data: r.data }));
      from = "saved";
    }
    const t0 = recs[0]?.t ?? 0;
    const events = session.logs.filter((l) => l.t >= t0 - 2000).map((l) => ({ t: l.t, msg: l.msg, level: l.level }));
    setSnap({ recs, events, from });
    setPh(t0);
  };
  // Take a snapshot when the tab opens.
  useEffect(() => { void take(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [scope.id]);

  const recs = snap?.recs || [];
  const t0 = recs[0]?.t ?? 0;
  const t1 = Math.max(recs[recs.length - 1]?.t ?? 0, snap?.events.length ? snap.events[snap.events.length - 1].t : 0, t0 + 1);

  useEffect(() => {
    if (!playing) return;
    let prev = performance.now();
    const step = (now: number) => {
      const dt = (now - prev) * speed;
      prev = now;
      setPh((p) => {
        const n = p + dt;
        if (n >= t1) { setPlaying(false); return t1; }
        return n;
      });
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, speed, t1]);

  const i = at(recs, ph);
  const shown = useMemo(() => recs.slice(0, i + 1), [recs, i]);
  const metric = scope.metrics?.find((m) => recs.some((r) => typeof (r.data as any)[m.key] === "number"));
  const fake: Session = { ...session, records: shown, last: shown[shown.length - 1] || null, count: shown.length, state: playing ? "streaming" : "stopped", media: null, startedAt: t0, firstAt: t0 };
  const Inst = scope.Instrument;

  if (!snap) return <p className="empty">Loading the recording…</p>;
  if (!recs.length)
    return <p className="empty">Nothing recorded yet. Run this capability (Live or Simulated); every reading is kept, and the run can be replayed here with play, pause, scrub and speed.</p>;

  // Track geometry
  const W = 600, H = 56, P = 6;
  const x = (t: number) => P + ((t - t0) / (t1 - t0)) * (W - 2 * P);
  const vals = metric ? recs.map((r) => (r.data as any)[metric.key]).filter((v): v is number => typeof v === "number") : [];
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  let line = "";
  if (metric) recs.forEach((r, k) => { const v = (r.data as any)[metric.key]; if (typeof v === "number") line += (line ? "L" : "M") + x(r.t).toFixed(1) + " " + (H - 12 - ((v - lo) / span) * (H - 22)).toFixed(1); void k; });
  const scrub = (clientX: number, el: SVGSVGElement) => {
    const b = el.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - b.left) / b.width));
    setPh(t0 + f * (t1 - t0));
  };
  const near = snap.events.filter((e) => e.t <= ph).slice(-4).reverse();
  const jump = (dir: 1 | -1) => {
    const k = Math.min(recs.length - 1, Math.max(0, i + dir));
    setPlaying(false);
    setPh(recs[k].t);
  };

  return (
    <div className="rp">
      <div className="rp-bar">
        <ButtonGroup>
          <Button data-control="replay.prev" small icon={<StepBackward size={12} />} onClick={() => jump(-1)} aria-label="Previous reading" />
          <Button data-control="replay.play" small intent="primary" icon={playing ? <Pause size={12} /> : <Play size={12} />} onClick={() => { if (!playing && ph >= t1) setPh(t0); setPlaying(!playing); }}>{playing ? "Pause" : "Play"}</Button>
          <Button data-control="replay.next" small icon={<StepForward size={12} />} onClick={() => jump(1)} aria-label="Next reading" />
        </ButtonGroup>
        <HTMLSelect minimal value={speed} onChange={(e) => setSpeed(Number(e.currentTarget.value))} aria-label="Speed">
          {SPEEDS.map((s) => <option key={s} value={s}>{s}x</option>)}
        </HTMLSelect>
        <span className="rp-time">{clock(ph)}<em> +{((ph - t0) / 1000).toFixed(1)} s of {((t1 - t0) / 1000).toFixed(1)} s</em></span>
        <span className="grow" />
        <Tag minimal>{snap.from === "memory" ? `${recs.length} readings in memory` : `${recs.length} saved readings`}</Tag>
        <Button data-control="replay.refresh" small minimal icon={<Refresh size={12} />} onClick={() => void take()} title="Take a fresh snapshot of the recording">Refresh</Button>
      </div>
      <svg
        className="rp-track" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="slider" aria-label="Scrub" aria-valuemin={0} aria-valuemax={Math.round(t1 - t0)} aria-valuenow={Math.round(ph - t0)} tabIndex={0}
        onPointerDown={(e) => { (e.currentTarget as Element).setPointerCapture(e.pointerId); setPlaying(false); scrub(e.clientX, e.currentTarget); }}
        onPointerMove={(e) => { if (e.buttons) scrub(e.clientX, e.currentTarget); }}
        onKeyDown={(e) => { if (e.key === "ArrowLeft") jump(-1); if (e.key === "ArrowRight") jump(1); if (e.key === " ") { e.preventDefault(); setPlaying((p) => !p); } }}
      >
        <rect x="0" y="0" width={W} height={H} className="rp-bg" />
        <rect x={P} y="0" width={Math.max(0, x(ph) - P)} height={H} className="rp-done" />
        {recs.length < 1500 && recs.map((r) => <line key={r.seq + ":" + r.t} x1={x(r.t)} x2={x(r.t)} y1={H - 6} y2={H - 2} className="rp-tick" />)}
        {line && <path d={line} className="rp-line" />}
        {snap.events.map((e, k) => <g key={k}><line x1={x(e.t)} x2={x(e.t)} y1="0" y2={H} className={"rp-ev " + e.level} /><title>{clock(e.t)} {e.msg}</title></g>)}
        <line x1={x(ph)} x2={x(ph)} y1="0" y2={H} className="rp-head" />
      </svg>
      <div className="rp-legend">
        <span>{metric ? `${metric.label}: ${fmt((fake.last?.data as any)?.[metric.key], metric.digits ?? 2)}${metric.unit ? " " + metric.unit : ""}` : "Readings"}</span>
        <span>Reading {i + 1} of {recs.length}</span>
      </div>
      {near.length > 0 && (
        <ul className="rp-events">{near.map((e, k) => <li key={k} className={e.level}><b>{clock(e.t)}</b>{e.msg}</li>)}</ul>
      )}
      <div className="rp-view">
        {snap.from === "memory"
          ? <Guard k={String(i)}><Inst scope={scope} session={fake} /></Guard>
          : <p className="empty">Saved readings keep numbers only, so the replay shows the chart and values above. Run it again to replay the full view.</p>}
      </div>
    </div>
  );
}
