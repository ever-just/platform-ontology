import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Mark } from "../core/timeline";
import { ChevronRight } from "lucide-react";

// Charts measure their box and draw in real pixels, so text and strokes never stretch.

export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect;
      setSize((s) => (Math.abs(s.w - r.width) < 1 && Math.abs(s.h - r.height) < 1 ? s : { w: Math.floor(r.width), h: Math.floor(r.height) }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
const short = (v: number) => (v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1e4 ? Math.round(v / 1e3) + "k" : v >= 1e3 ? (v / 1e3).toFixed(1) + "k" : Number.isInteger(v) ? String(v) : v.toFixed(1));

const MARK_COLOR: Record<Mark["kind"], string> = { granted: "var(--accent)", first: "var(--ok)", denied: "var(--err)", error: "var(--err)", stopped: "var(--mute)" };

export type Pt = { t: number; v: number };

export type ChartKind = "auto" | "line" | "area" | "bars";

export function TimeChart({ points, range, step, kind = "auto", marks = [], unit = "", empty }: { points: Pt[]; range: number; step?: boolean; kind?: ChartKind; marks?: Mark[]; unit?: string; empty?: ReactNode }) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const now = points.length ? points[points.length - 1].t : Date.now();
  const t0 = now - range * 1000;
  const pts = points.filter((p) => p.t >= t0 - 1000);
  const L = 36, R = 8, T = 18, B = 22;
  const iw = Math.max(1, w - L - R), ih = Math.max(1, h - T - B);
  const max = niceMax(Math.max(0, ...pts.map((p) => p.v)) * 1.1);
  const x = (t: number) => L + ((t - t0) / (range * 1000)) * iw;
  const y = (v: number) => T + ih - (v / max) * ih;
  let line = "";
  pts.forEach((p, i) => {
    const X = x(Math.max(p.t, t0)).toFixed(1), Y = y(p.v).toFixed(1);
    if (!i) line = `M${X} ${Y}`;
    else line += step && kind === "auto" ? ` H${X} V${Y}` : ` L${X} ${Y}`;
  });
  const showArea = kind === "auto" || kind === "area";
  const area = showArea && pts.length > 1 ? `${line} V${T + ih} H${x(Math.max(pts[0].t, t0)).toFixed(1)} Z` : "";
  // Bars sample once a second, so their width follows the window.
  const barW = Math.max(1, Math.min(10, iw / range - 0.6));
  const ticks = (iw < 360 ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1]).map((f) => t0 + f * range * 1000);
  const hp = hover !== null ? pts[hover] : null;
  const visMarks = marks.filter((m) => m.t >= t0);
  const allZero = pts.every((p) => p.v === 0);
  // Draw nothing until there is a real shape to show, so the chart never flickers as a flat line on load.
  const ready = pts.length >= 3 && !allZero;

  const onMove = (e: React.MouseEvent) => {
    if (!pts.length) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const t = t0 + ((e.clientX - r.left - L) / iw) * range * 1000;
    let best = 0, bd = Infinity;
    pts.forEach((p, i) => { const d = Math.abs(p.t - t); if (d < bd) { bd = d; best = i; } });
    setHover(best);
  };

  return (
    <div className="tc" ref={ref} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      {w > 0 && (
        <svg width={w} height={h} className={ready ? "in" : "idle"}>
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={L} x2={w - R} y1={y(max * f)} y2={y(max * f)} className={f ? "tc-grid" : "tc-base"} />
              <text x={L - 8} y={y(max * f) + 3.5} textAnchor="end" className="tc-ax">{short(max * f)}</text>
            </g>
          ))}
          {ticks.map((t, i) => (
            <text key={i} x={x(t)} y={h - 6} textAnchor={i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"} className="tc-ax">{i === ticks.length - 1 ? "now" : clock(t)}</text>
          ))}
          {!ready ? null : kind === "bars" ? (
            <g className="tc-bars">{pts.map((p, i) => p.v > 0 && <rect key={i} x={x(Math.max(p.t, t0)) - barW / 2} width={barW} y={y(p.v)} height={T + ih - y(p.v)} rx={barW > 3 ? 1 : 0} />)}</g>
          ) : (
            <>
              {area && <path d={area} className={"tc-area" + (kind === "area" ? " strong" : "")} />}
              {line && <path d={line} className="tc-line" />}
            </>
          )}
          {visMarks.map((m, i) => (
            <g key={i} transform={`translate(${x(m.t).toFixed(1)} ${T - 9})`}>
              <line y1="4" y2={ih + 9} className="tc-mark-l" stroke={MARK_COLOR[m.kind]} />
              <circle r="3.5" fill={MARK_COLOR[m.kind]}><title>{clock(m.t)} {m.scope}: {m.msg}</title></circle>
            </g>
          ))}
          {hp && (
            <g>
              <line x1={x(hp.t)} x2={x(hp.t)} y1={T} y2={T + ih} className="tc-cross" />
              <circle cx={x(hp.t)} cy={y(hp.v)} r="3.5" className="tc-dot" />
            </g>
          )}
        </svg>
      )}
      {hp && (
        <div className="tc-tip" style={{ left: Math.min(Math.max(x(hp.t) + 10, 0), Math.max(0, w - 150)), top: 8 }}>
          <span>{clock(hp.t)}</span><b>{short(hp.v)}{unit && <em> {unit}</em>}</b>
        </div>
      )}
      {!ready && <div className={"tc-empty" + (allZero && pts.length >= 3 ? "" : " wait")}>{allZero && pts.length >= 3 && empty ? empty : <span className="shimmer">Collecting readings</span>}</div>}
    </div>
  );
}

export type BarRow = { key: string; label: ReactNode; value: number; display?: ReactNode; sub?: ReactNode; onClick?: () => void; segs?: { v: number; c: string }[]; tone?: string };

/** Ranked list with an inline bar behind each row, in the DataFast style. */
export function BarList({ rows, empty = "Nothing yet", max }: { rows: BarRow[]; empty?: ReactNode; max?: number }) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <div className="bl-empty">{empty}</div>;
  return (
    <div className="bl">
      {rows.map((r) => {
        const Tag = r.onClick ? "button" : "div";
        return (
          <Tag data-control={`chart.row.${r.key}`} key={r.key} className={"bl-row" + (r.onClick ? " click" : "")} onClick={r.onClick}>
            {r.segs ? (
              <span className="bl-segs">{r.segs.map((s, i) => <i key={i} style={{ width: (s.v / m) * 100 + "%", background: s.c }} />)}</span>
            ) : (
              <span className="bl-bar" style={{ width: (r.value / m) * 100 + "%", background: r.tone }} />
            )}
            <span className="bl-l">{r.label}{r.sub && <small>{r.sub}</small>}</span>
            <b className="bl-v">{r.display ?? short(r.value)}</b>
            {r.onClick && <ChevronRight className="bl-go" size={13} aria-hidden />}
          </Tag>
        );
      })}
    </div>
  );
}

export { short, clock };
