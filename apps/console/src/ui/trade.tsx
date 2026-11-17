import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, Pause, Play, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import type { Rec, ScopeDef, Session } from "../core/types";
import { addTap } from "../core/harness";
import { useSize, clock } from "./charts";
import { C, DOMAIN_COLOR, fmt } from "./kit";
import "./trade.css";

// A trading terminal style chart for any streaming scope: range presets, wheel and pinch free zoom,
// drag to pan, pause or follow live, line, area, step or candles, a crosshair readout, a metric
// picker and a ticker strip with change since the start of the visible range.

/** One OHLC bucket. n is how many readings fell in it (drawn as volume). */
export type Bucket = { t: number; o: number; h: number; l: number; c: number; n: number };

// ---------- long range rollups ----------
// The harness keeps the last few thousand raw records. For longer ranges every numeric field is also
// folded into one second OHLC buckets, kept for an hour, so a 15 minute view of a 60 Hz sensor
// still has data.

const ROLL_MS = 1000;
const ROLL_KEEP = 3600;
type Roll = Map<string, Bucket[]>;
const rolls = new Map<string, Roll>();

function fold(roll: Roll, key: string, t: number, v: number) {
  let arr = roll.get(key);
  if (!arr) { arr = []; roll.set(key, arr); }
  const bt = Math.floor(t / ROLL_MS) * ROLL_MS;
  const b = arr[arr.length - 1];
  if (b && b.t === bt) { b.h = Math.max(b.h, v); b.l = Math.min(b.l, v); b.c = v; b.n++; }
  else { arr.push({ t: bt, o: v, h: v, l: v, c: v, n: 1 }); if (arr.length > ROLL_KEEP) arr.splice(0, arr.length - ROLL_KEEP); }
}

addTap({
  record: (scope, _src, rec) => {
    if (rec.seq === 1) rolls.set(scope, new Map());
    let roll = rolls.get(scope);
    if (!roll) { roll = new Map(); rolls.set(scope, roll); }
    for (const [k, v] of Object.entries(rec.data)) if (typeof v === "number" && isFinite(v)) fold(roll, k, rec.t, v);
  },
});

// ---------- data shaping ----------

/** Numeric fields in the latest records, in their natural order. */
export function numericKeys(records: Rec[]): string[] {
  const seen = new Set<string>();
  for (let i = Math.max(0, records.length - 5); i < records.length; i++) {
    for (const [k, v] of Object.entries(records[i].data)) if (typeof v === "number" && isFinite(v)) seen.add(k);
  }
  return [...seen];
}

/** Buckets for one key between t0 and t1, `step` ms wide. Raw records where they reach, rollups before that. */
function bucketize(scope: string, records: Rec[], key: string, t0: number, t1: number, step: number): Bucket[] {
  const out: Bucket[] = [];
  let cur: Bucket | null = null;
  const add = (t: number, o: number, h: number, l: number, c: number, n: number) => {
    const bt = Math.floor(t / step) * step;
    if (cur && cur.t === bt) { cur.h = Math.max(cur.h, h); cur.l = Math.min(cur.l, l); cur.c = c; cur.n += n; }
    else { cur = { t: bt, o, h, l, c, n }; out.push(cur); }
  };
  const rawStart = records.length ? records[0].t : Infinity;
  const roll = rolls.get(scope)?.get(key);
  if (roll && rawStart > t0) {
    for (const b of roll) if (b.t >= t0 - step && b.t < rawStart && b.t <= t1) add(b.t, b.o, b.h, b.l, b.c, b.n);
  }
  for (const r of records) {
    if (r.t < t0 - step || r.t > t1) continue;
    const v = r.data[key];
    if (typeof v === "number" && isFinite(v)) add(r.t, v, v, v, v, 1);
  }
  return out;
}

/** Earliest time any data exists for this scope (raw or rollup). */
function earliest(scope: string, records: Rec[]): number {
  let t = records.length ? records[0].t : Infinity;
  rolls.get(scope)?.forEach((arr) => { if (arr.length && arr[0].t < t) t = arr[0].t; });
  return t;
}

function niceTicks(lo: number, hi: number, n = 5): number[] {
  const span = hi - lo || Math.abs(hi) || 1;
  const raw = span / n;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  const step = (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

const axisNum = (v: number, span: number) => {
  const a = Math.abs(v);
  if (a >= 1e6) return v.toExponential(1);
  const d = span >= 50 ? 0 : span >= 5 ? 1 : span >= 0.5 ? 2 : span >= 0.05 ? 3 : 4;
  return v.toFixed(d);
};

const dur = (ms: number) => (ms < 1000 ? Math.round(ms) + " ms" : ms < 60000 ? +(ms / 1000).toFixed(1) + " s" : ms < 3600000 ? +(ms / 60000).toFixed(1) + " min" : +(ms / 3600000).toFixed(1) + " h");

// ---------- the chart ----------

export type Kind = "line" | "area" | "step" | "candles";
const KINDS: { id: Kind; label: string }[] = [{ id: "line", label: "Line" }, { id: "area", label: "Area" }, { id: "step", label: "Step" }, { id: "candles", label: "Candles" }];
const RANGES: { id: string; ms: number }[] = [{ id: "10s", ms: 10e3 }, { id: "1m", ms: 60e3 }, { id: "5m", ms: 300e3 }, { id: "15m", ms: 900e3 }, { id: "All", ms: 0 }];
const MIN_SPAN = 2000;

type Metric = { key: string; label: string; unit?: string; digits?: number };

export function TradeChart({ scope, session, keys, compact = false, height }: { scope: ScopeDef; session: Session; keys?: string[]; compact?: boolean; height?: number }) {
  const records = session.records;
  const avail = useMemo(() => numericKeys(records), [records.length ? records[records.length - 1].seq : 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const metrics: Metric[] = useMemo(() => {
    const declared = new Map((scope.metrics || []).map((m) => [m.key, m]));
    const order = keys ? keys : [...(scope.metrics || []).map((m) => m.key), ...avail];
    const uniq = [...new Set(order)].filter((k) => avail.includes(k));
    return uniq.map((k) => declared.get(k) || { key: k, label: k.replace(/_/g, " ") });
  }, [scope, keys, avail]);
  const extra = avail.filter((k) => !metrics.some((m) => m.key === k));

  const [primary, setPrimary] = useState<string | null>(null);
  const [compare, setCompare] = useState<string[]>([]);
  const [kind, setKind] = useState<Kind>("area");
  const [rangeId, setRangeId] = useState("1m");
  const [span, setSpan] = useState(60e3);
  const [follow, setFollow] = useState(true);
  const [endAt, setEndAt] = useState(0);
  const [hoverX, setHoverX] = useState<number | null>(null);
  // Measure the plot area, not the whole widget: the svg is absolutely placed inside it, so its own size never feeds back.
  const [plotRef, { w, h: plotH }] = useSize<HTMLDivElement>();

  const key = primary && avail.includes(primary) ? primary : metrics[0]?.key ?? avail[0] ?? null;
  const meta = metrics.find((m) => m.key === key) || (key ? { key, label: key } : null);
  const lastT = records.length ? records[records.length - 1].t : Date.now();
  const first = earliest(scope.id, records);
  const fullSpan = isFinite(first) ? Math.max(MIN_SPAN, lastT - first) : 60e3;
  const vSpan = rangeId === "All" && follow ? fullSpan : span;
  const t1 = follow ? lastT : endAt;
  const t0 = t1 - vSpan;

  const H = Math.max(120, plotH || 190);
  const L = 6, R = 58, T = 8, B = 20;
  const iw = Math.max(10, w - L - R);
  const ihAll = Math.max(40, H - T - B);
  const volH = Math.round(ihAll * 0.16);
  const ih = ihAll - volH - 4;
  const target = Math.max(8, Math.floor(iw / (kind === "candles" ? 8 : 2)));
  const step = Math.max(kind === "candles" ? 100 : 16, vSpan / target);

  const seq = session.last?.seq ?? 0;
  const bk = useMemo(() => (key ? bucketize(scope.id, records, key, t0, t1, step) : []), [scope.id, records, key, t0, t1, step, seq]);
  const cmp = useMemo(() => compare.filter((k) => k !== key && avail.includes(k)).slice(0, 3).map((k) => ({ k, b: bucketize(scope.id, records, k, t0, t1, step) })), [compare, key, avail, scope.id, records, t0, t1, step, seq]);

  const vis = bk.filter((b) => b.t >= t0 - step);
  let lo = Infinity, hi = -Infinity, vmax = 1;
  for (const b of vis) { if (kind === "candles") { lo = Math.min(lo, b.l); hi = Math.max(hi, b.h); } else { lo = Math.min(lo, b.c); hi = Math.max(hi, b.c); } vmax = Math.max(vmax, b.n); }
  if (!isFinite(lo)) { lo = 0; hi = 1; }
  if (hi - lo < 1e-9) { const pad = Math.abs(hi) * 0.05 || 1; lo -= pad; hi += pad; }
  const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
  const x = (t: number) => L + ((t - t0) / vSpan) * iw;
  const y = (v: number) => T + ih - ((v - lo) / (hi - lo)) * ih;
  const yTicks = niceTicks(lo, hi, compact ? 3 : 5);
  const nX = iw < 360 ? 3 : 5;
  const xTicks: number[] = Array.from({ length: nX }, (_v, i: number) => t0 + (vSpan * i) / (nX - 1));

  // Change since the start of the visible range, per metric (the ticker).
  const change = (k: string) => {
    const bb = k === key ? vis : bucketize(scope.id, records, k, t0, t1, Math.max(step, vSpan / 40)).filter((b) => b.t >= t0 - step);
    if (!bb.length) return null;
    const a = bb[0].o, z = bb[bb.length - 1].c;
    let H2 = -Infinity, L2 = Infinity;
    bb.forEach((b) => { H2 = Math.max(H2, b.h); L2 = Math.min(L2, b.l); });
    return { last: z, d: z - a, pct: a !== 0 ? ((z - a) / Math.abs(a)) * 100 : null, hi: H2, lo: L2 };
  };

  const color = DOMAIN_COLOR[scope.domain] || C.accent;
  const CMP_COLORS = [C.warn, C.ok, C.ink2];

  // Paths
  let path = "", area = "";
  if (kind !== "candles" && vis.length > 1) {
    vis.forEach((b, i) => {
      const X = x(Math.max(b.t + step / 2, t0)).toFixed(1), Y = y(b.c).toFixed(1);
      path += !i ? `M${X} ${Y}` : kind === "step" ? ` H${X} V${Y}` : ` L${X} ${Y}`;
    });
    if (kind === "area") area = `${path} V${T + ih} H${x(Math.max(vis[0].t + step / 2, t0)).toFixed(1)} Z`;
  }
  const cmpPaths = cmp.map(({ k, b }, i) => {
    const vb = b.filter((q) => q.t >= t0 - step);
    if (vb.length < 2) return null;
    let a = Infinity, z = -Infinity;
    vb.forEach((q) => { a = Math.min(a, q.c); z = Math.max(z, q.c); });
    const s = z - a || 1;
    // Each compared field gets its own scale, mapped onto the plot height, like an overlay study.
    const d = vb.map((q, j) => (j ? "L" : "M") + x(Math.max(q.t + step / 2, t0)).toFixed(1) + " " + (T + ih - ((q.c - a) / s) * ih * 0.9 - ih * 0.05).toFixed(1)).join(" ");
    return <path key={k} d={d} fill="none" stroke={CMP_COLORS[i % CMP_COLORS.length]} strokeWidth="1.3" strokeDasharray="4 3" />;
  });

  const lastB = vis[vis.length - 1];
  const hb = hoverX !== null && vis.length ? vis.reduce((best, b) => (Math.abs(x(b.t + step / 2) - hoverX) < Math.abs(x(best.t + step / 2) - hoverX) ? b : best), vis[0]) : null;
  const shownB = hb || lastB;
  const live = session.state === "streaming";

  // ---------- interactions ----------
  const st = useRef({ vSpan, t1, follow, iw, lastT, fullSpan });
  st.current = { vSpan, t1, follow, iw, lastT, fullSpan };
  const zoomBy = (f: number, anchorFrac = 1) => {
    const s = st.current;
    const ns = Math.max(MIN_SPAN, Math.min(Math.max(s.fullSpan, 60e3) * 1.05, s.vSpan * f));
    setRangeId("");
    setSpan(ns);
    if (!s.follow || anchorFrac < 0.98) {
      const anchorT = s.t1 - s.vSpan * (1 - anchorFrac);
      const ne = Math.min(s.lastT, anchorT + ns * (1 - anchorFrac));
      if (ne >= s.lastT - 1) setFollow(true);
      else { setFollow(false); setEndAt(ne); }
    }
  };
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Horizontal swipes pan; vertical wheel zooms around the cursor.
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const frac = Math.max(0, Math.min(1, (e.clientX - r.left - L) / st.current.iw));
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) panBy((e.deltaX / st.current.iw) * st.current.vSpan);
      else zoomBy(Math.exp(e.deltaY * 0.0015), frac);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const panBy = (dt: number) => {
    const s = st.current;
    const ne = Math.min(s.lastT, s.t1 + dt);
    if (ne >= s.lastT - 1) { setFollow(true); return; }
    if (s.follow && rangeId === "All") setSpan(s.vSpan);
    setRangeId((r) => (r === "All" ? "" : r));
    setFollow(false);
    setEndAt(ne);
  };
  const ptrs = useRef(new Map<number, number>());
  const drag = useRef<{ x: number; t1: number; pinch?: number; span?: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    ptrs.current.set(e.pointerId, e.clientX);
    const xs = [...ptrs.current.values()];
    drag.current = xs.length >= 2 ? { x: e.clientX, t1: st.current.t1, pinch: Math.abs(xs[0] - xs[1]) || 1, span: st.current.vSpan } : { x: e.clientX, t1: st.current.t1 };
  };
  const onMove = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setHoverX(e.clientX - r.left);
    if (!ptrs.current.has(e.pointerId) || !drag.current) return;
    ptrs.current.set(e.pointerId, e.clientX);
    const xs = [...ptrs.current.values()];
    const d = drag.current;
    if (d.pinch && xs.length >= 2) {
      const now = Math.abs(xs[0] - xs[1]) || 1;
      const ns = Math.max(MIN_SPAN, (d.span || st.current.vSpan) * (d.pinch / now));
      setRangeId(""); setSpan(ns);
      return;
    }
    const dx = e.clientX - d.x;
    if (Math.abs(dx) < 3) return;
    const dt = (-dx / st.current.iw) * st.current.vSpan;
    const ne = Math.min(st.current.lastT, d.t1 + dt);
    if (ne >= st.current.lastT - 1) { setFollow(true); return; }
    if (rangeId === "All") { setSpan(st.current.vSpan); setRangeId(""); }
    setFollow(false); setEndAt(ne);
  };
  const onUp = (e: React.PointerEvent) => {
    ptrs.current.delete(e.pointerId);
    if (!ptrs.current.size) drag.current = null;
    if (e.pointerType !== "mouse") setHoverX(null);
  };
  const onKey = (e: React.KeyboardEvent) => {
    const s = st.current.vSpan;
    if (e.key === "ArrowLeft") { panBy(-s * 0.1); e.preventDefault(); }
    else if (e.key === "ArrowRight") { panBy(s * 0.1); e.preventDefault(); }
    else if (e.key === "+" || e.key === "=") zoomBy(0.8);
    else if (e.key === "-") zoomBy(1.25);
    else if (e.key === "0" || e.key === "Home") reset();
    else if (e.key === " ") { togglePause(); e.preventDefault(); }
  };
  const pickRange = (id: string, ms: number) => { setRangeId(id); if (ms) setSpan(ms); setFollow(true); };
  const reset = () => pickRange("1m", 60e3);
  const togglePause = () => { if (follow) { setEndAt(st.current.t1); setSpan(st.current.vSpan); if (rangeId === "All") setRangeId(""); setFollow(false); } else setFollow(true); };

  if (!avail.length) {
    return <div className={"tr tr-empty" + (compact ? " compact" : "")}><span className="shimmer">{session.count ? "This capability reports no numbers to chart." : "Start it to chart its numbers."}</span></div>;
  }

  const ch = key ? change(key) : null;
  const up = ch && ch.d > 0, down = ch && ch.d < 0;
  const dg = meta?.digits ?? 2;
  const hv = (v: number) => fmt(v, Math.max(dg, Math.abs(v) < 10 ? 2 : dg));

  return (
    <div className={"tr" + (compact ? " compact" : "")} style={height ? { height } : undefined}>
      {/* Ticker strip: each headline metric with its change across the visible range. Click to chart it. */}
      <div className="tr-tick" role="tablist" aria-label="Metrics">
        {metrics.slice(0, compact ? 4 : 8).map((m) => {
          const c = change(m.key);
          const sel = m.key === key;
          const tone = !c || c.d === 0 ? "flat" : c.d > 0 ? "up" : "down";
          return (
            <button data-control={`trade.metric.${m.key}`} key={m.key} role="tab" aria-selected={sel} className={"tr-t" + (sel ? " on" : "")} data-tone={tone} onClick={() => setPrimary(m.key)} onContextMenu={(e) => { e.preventDefault(); setCompare((cc) => cc.includes(m.key) ? cc.filter((k) => k !== m.key) : [...cc, m.key]); }} title="Click to chart. Right click to overlay.">
              <span className="tr-tl">{m.label}</span>
              <b>{c ? fmt(c.last, m.digits ?? 2) : "n/a"}{m.unit && <em> {m.unit}</em>}</b>
              <span className="tr-tc">{tone === "up" ? <ArrowUpRight size={11} /> : tone === "down" ? <ArrowDownRight size={11} /> : <Minus size={11} />}{c ? (c.d >= 0 ? "+" : "") + fmt(c.d, m.digits ?? 2) : ""}{c && c.pct !== null && isFinite(c.pct) ? ` (${c.pct >= 0 ? "+" : ""}${c.pct.toFixed(1)}%)` : ""}</span>
            </button>
          );
        })}
      </div>

      {/* Toolbar: range presets, chart type, pause, zoom, reset, overlay picker. */}
      <div className="tr-bar">
        <div className="seg tr-seg" role="group" aria-label="Time range">
          {RANGES.map((r) => <button data-control={`trade.range.${r.id}`} key={r.id} className={rangeId === r.id ? "on" : ""} onClick={() => pickRange(r.id, r.ms)}>{r.id}</button>)}
        </div>
        <div className="seg tr-seg" role="group" aria-label="Chart type">
          {KINDS.map((k) => <button data-control={`trade.kind.${k.id}`} key={k.id} className={kind === k.id ? "on" : ""} onClick={() => setKind(k.id)} title={k.label}><KindIcon k={k.id} /><span className="tr-kl">{k.label}</span></button>)}
        </div>
        <span className="grow" />
        <button data-control="trade.follow" className={"btn sm tr-live" + (follow ? " on-live" : "")} onClick={togglePause} title={follow ? "Pause (space)" : "Follow live (space)"} aria-label={follow ? "Pause" : "Follow live"}>
          {follow ? <><Pause size={12} /><span>{live ? "Live" : "Latest"}</span></> : <><Play size={12} /><span>Go live</span></>}
        </button>
        <button data-control="trade.zoom-in" className="icon-b" onClick={() => zoomBy(0.7)} title="Zoom in (+)" aria-label="Zoom in"><ZoomIn size={14} /></button>
        <button data-control="trade.zoom-out" className="icon-b" onClick={() => zoomBy(1.4)} title="Zoom out (-)" aria-label="Zoom out"><ZoomOut size={14} /></button>
        <button data-control="trade.reset" className="icon-b" onClick={reset} title="Reset view (0)" aria-label="Reset view"><RotateCcw size={14} /></button>
      </div>

      <div className="tr-plot" ref={plotRef} tabIndex={0} aria-label={`${meta?.label} chart. Arrows pan, plus and minus zoom, space pauses.`}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={(e) => { if (e.pointerType === "mouse") setHoverX(null); }} onKeyDown={onKey} onDoubleClick={reset}>
        {w > 0 && (
          <svg width={w} height={H} className="tr-svg">
            {yTicks.map((v) => (
              <g key={v}>
                <line x1={L} x2={L + iw} y1={y(v)} y2={y(v)} className="tr-grid" />
                <text x={L + iw + 6} y={y(v) + 3.5} className="tr-ax">{axisNum(v, hi - lo)}</text>
              </g>
            ))}
            {xTicks.map((t, i) => (
              <text key={i} x={x(t)} y={H - 5} textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"} className="tr-ax">{clock(t)}</text>
            ))}
            <line x1={L} x2={L + iw} y1={T + ih + 4 + volH} y2={T + ih + 4 + volH} className="tr-base" />
            {/* Volume: readings per bucket, a proxy for sample rate. */}
            <g className="tr-vol">
              {vis.map((b) => {
                const bw = Math.max(1, (step / vSpan) * iw - 1);
                const vh = (b.n / vmax) * volH;
                return <rect key={b.t} x={x(b.t)} y={T + ih + 4 + volH - vh} width={bw} height={vh} />;
              })}
            </g>
            <clipPath id={"trc-" + scope.id.replace(/\W/g, "")}><rect x={L} y={T} width={iw} height={ih} /></clipPath>
            <g clipPath={`url(#trc-${scope.id.replace(/\W/g, "")})`}>
              {kind === "candles" ? (
                vis.map((b) => {
                  const bw = Math.max(1, (step / vSpan) * iw * 0.7);
                  const cx = x(b.t + step / 2);
                  const upc = b.c >= b.o;
                  const yo = y(b.o), yc = y(b.c);
                  return (
                    <g key={b.t} className={upc ? "tr-up" : "tr-dn"}>
                      <line x1={cx} x2={cx} y1={y(b.h)} y2={y(b.l)} />
                      <rect x={cx - bw / 2} y={Math.min(yo, yc)} width={bw} height={Math.max(1, Math.abs(yo - yc))} />
                    </g>
                  );
                })
              ) : (
                <>
                  {area && <path d={area} fill={color} opacity="0.14" />}
                  {path && <path d={path} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />}
                </>
              )}
              {cmpPaths}
            </g>
            {lastB && (
              <g className="tr-lastp">
                <line x1={L} x2={L + iw} y1={y(lastB.c)} y2={y(lastB.c)} stroke={color} strokeDasharray="2 3" opacity="0.7" />
                <rect x={L + iw + 1} y={y(lastB.c) - 8} width={R - 3} height={16} rx="3" fill={color} />
                <text x={L + iw + 6} y={y(lastB.c) + 3.5} className="tr-ax tr-axl">{axisNum(lastB.c, hi - lo)}</text>
              </g>
            )}
            {hb && hoverX !== null && hoverX >= L && hoverX <= L + iw && (
              <g className="tr-cross">
                <line x1={x(hb.t + step / 2)} x2={x(hb.t + step / 2)} y1={T} y2={T + ih + 4 + volH} />
                <line x1={L} x2={L + iw} y1={y(hb.c)} y2={y(hb.c)} />
                <circle cx={x(hb.t + step / 2)} cy={y(hb.c)} r="3.5" fill={C.bg} stroke={color} strokeWidth="2" />
              </g>
            )}
          </svg>
        )}
        {shownB && (
          <div className="tr-read">
            <span className="tr-rk" style={{ color }}>{meta?.label}</span>
            <span>{clock(shownB.t)}</span>
            {kind === "candles" || step > 50
              ? <><span>O <b>{hv(shownB.o)}</b></span><span>H <b>{hv(shownB.h)}</b></span><span>L <b>{hv(shownB.l)}</b></span><span>C <b>{hv(shownB.c)}</b></span></>
              : <span><b>{hv(shownB.c)}</b>{meta && "unit" in meta && meta.unit ? <em> {meta.unit}</em> : null}</span>}
            {hb && cmp.map(({ k, b }, i) => { const q = b.find((z) => z.t === hb.t); return q ? <span key={k} style={{ color: CMP_COLORS[i % CMP_COLORS.length] }}>{k} <b>{hv(q.c)}</b></span> : null; })}
            {!follow && <span className="tr-paused">paused</span>}
          </div>
        )}
      </div>

      <div className="tr-foot">
        <span>Range <b>{dur(vSpan)}</b></span>
        <span>Bucket <b>{dur(step)}</b></span>
        {ch && <><span>High <b>{hv(ch.hi)}</b></span><span>Low <b>{hv(ch.lo)}</b></span></>}
        <span className={up ? "up" : down ? "down" : ""}>Change <b>{ch ? (ch.d >= 0 ? "+" : "") + hv(ch.d) : "n/a"}</b></span>
        <span>Rate <b>{session.hz ? session.hz.toFixed(1) : "0"} Hz</b></span>
        <span className="grow" />
        {(extra.length > 0 || metrics.length > 1) && (
          <label className="tr-ov">
            <span>Overlay</span>
            <select data-control="trade.overlay" value="" onChange={(e) => { const k = e.target.value; if (k) setCompare((cc) => cc.includes(k) ? cc.filter((z) => z !== k) : [...cc, k].slice(-3)); }}>
              <option value="">{compare.length ? compare.join(", ") : "none"}</option>
              {[...metrics.map((m) => m.key), ...extra].filter((k) => k !== key).map((k) => <option key={k} value={k}>{compare.includes(k) ? "remove " : "add "}{k}</option>)}
            </select>
          </label>
        )}
        {extra.length > 0 && (
          <label className="tr-ov">
            <span>Field</span>
            <select data-control="trade.metric-select" value={key || ""} onChange={(e) => setPrimary(e.target.value)}>
              {[...metrics.map((m) => m.key), ...extra].map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
        )}
      </div>
    </div>
  );
}

function KindIcon({ k }: { k: Kind }) {
  const p = { width: 14, height: 12, viewBox: "0 0 14 12", fill: "none", stroke: "currentColor", strokeWidth: 1.4, "aria-hidden": true } as const;
  if (k === "line") return <svg {...p}><path d="M1 9 L5 4 L8 7 L13 2" /></svg>;
  if (k === "area") return <svg {...p}><path d="M1 9 L5 4 L8 7 L13 2 V11 H1 Z" fill="currentColor" fillOpacity=".25" /></svg>;
  if (k === "step") return <svg {...p}><path d="M1 9 H4 V4 H8 V7 H11 V2 H13" /></svg>;
  return <svg {...p}><path d="M3 1 V11 M7 3 V10 M11 2 V8" /><rect x="1.8" y="3" width="2.4" height="5" fill="currentColor" stroke="none" /><rect x="5.8" y="5" width="2.4" height="3" /><rect x="9.8" y="3" width="2.4" height="3" fill="currentColor" stroke="none" /></svg>;
}
