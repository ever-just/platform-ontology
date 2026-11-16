import type { ReactNode } from "react";
import type { DomainId, Session } from "../core/types";

// Shared instrument parts. Every instrument is built from these so the console reads as one system.

// Blueprint palette hues (@blueprintjs/colors, Apache 2.0); the "4" shades read on dark and light.
export const DOMAIN_COLOR: Record<DomainId, string> = {
  place: "#4c90f0",
  motion: "#9881f3",
  surroundings: "#13c9ba",
  capture: "#e76a6e",
  device: "#8f99a8",
  fingerprint: "#f0b726",
  link: "#43bf4d",
  identity: "#f5498b",
  reach: "#eb6847",
};

/** Theme tokens resolved from CSS, so SVG and canvas drawing follow the chosen look. */
const tokCache = new Map<string, string>();
const FALLBACK: Record<string, string> = { ink: "#f6f7f9", ink2: "#c5cbd3", mute: "#8f99a8", line: "#2f343c", line2: "#252a31", bg: "#1c2127", panel: "#252a31", accent: "#4c90f0", ok: "#32a467", warn: "#ec9a3c", err: "#e76a6e" };
function tok(k: string): string {
  let v = tokCache.get(k);
  if (v) return v;
  try { v = getComputedStyle(document.documentElement).getPropertyValue("--" + k).trim(); } catch { v = ""; }
  v = v || FALLBACK[k];
  tokCache.set(k, v);
  return v;
}
/** Call after the look changes so the next draw reads fresh tokens. */
export const resetTokens = () => tokCache.clear();
export const C = {
  get ink() { return tok("ink"); },
  get ink2() { return tok("ink2"); },
  get mute() { return tok("mute"); },
  get line() { return tok("line"); },
  get line2() { return tok("line2"); },
  get bg() { return tok("bg"); },
  get panel() { return tok("panel"); },
  get accent() { return tok("accent"); },
  get ok() { return tok("ok"); },
  get warn() { return tok("warn"); },
  get err() { return tok("err"); },
};

export function fmt(v: unknown, digits = 2): string {
  if (v === null || v === undefined || v === "") return "n/a";
  if (typeof v === "number") {
    if (!isFinite(v)) return "n/a";
    if (Math.abs(v) >= 1e6) return v.toExponential(2);
    return Number.isInteger(v) && digits <= 2 ? v.toLocaleString() : v.toFixed(digits);
  }
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (Array.isArray(v)) return v.length + " items";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function Spark({ values, w = 120, h = 28, color = C.accent, min, max, fill = true }: { values: number[]; w?: number; h?: number; color?: string; min?: number; max?: number; fill?: boolean }) {
  if (values.length < 2) return <svg width={w} height={h} className="spark" aria-hidden />;
  const lo = min ?? Math.min(...values);
  const hi = max ?? Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 2 - ((v - lo) / span) * (h - 4)]);
  const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  return (
    <svg width={w} height={h} className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {fill && <path d={`${d} L${w} ${h} L0 ${h} Z`} fill={color} opacity="0.08" />}
      <path d={d} fill="none" stroke={color} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Multi-channel oscilloscope with grid and zero line. Fills its container. */
export function Scope({ series, min, max, labels = true }: { series: { label: string; values: number[]; color: string }[]; min?: number; max?: number; labels?: boolean }) {
  const all = series.flatMap((s) => s.values);
  const lo = min ?? (all.length ? Math.min(...all) : -1);
  const hi = max ?? (all.length ? Math.max(...all) : 1);
  const span = hi - lo || 1;
  const W = 600;
  const H = 200;
  const y = (v: number) => H - ((v - lo) / span) * H;
  return (
    <div className="scope">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke={C.line2} vectorEffect="non-scaling-stroke" />)}
        {Array.from({ length: 11 }, (_, i) => <line key={i} x1={(W / 10) * i} x2={(W / 10) * i} y1="0" y2={H} stroke={C.line2} vectorEffect="non-scaling-stroke" />)}
        {lo < 0 && hi > 0 && <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke={C.line} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
        {series.map((s) => {
          if (s.values.length < 2) return null;
          const d = s.values.map((v, i) => (i ? "L" : "M") + ((i / (s.values.length - 1)) * W).toFixed(1) + " " + y(v).toFixed(1)).join(" ");
          return <path key={s.label} d={d} fill="none" stroke={s.color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />;
        })}
      </svg>
      {labels && (
        <div className="scope-legend">
          {series.map((s) => (
            <span key={s.label}><i style={{ background: s.color }} />{s.label} <b>{s.values.length ? fmt(s.values[s.values.length - 1], 2) : "n/a"}</b></span>
          ))}
          <span className="scope-range">{fmt(lo, 1)} to {fmt(hi, 1)}</span>
        </div>
      )}
    </div>
  );
}

/** `inferred` is optional: plain source text for a value the device did not report and the console estimated. */
export function Readout({ rows, cols = 1 }: { rows: { k: string; v: unknown; u?: string; digits?: number; hot?: boolean; inferred?: string }[]; cols?: number }) {
  return (
    <div className="readout" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {rows.map((r) => (
        <div key={r.k} className={"ro-row" + (r.hot ? " hot" : "") + (r.inferred && r.v !== null && r.v !== undefined ? " inf" : "")}>
          <span>{r.k}</span>
          <b>{fmt(r.v, r.digits ?? 2)}{r.u && r.v !== null && r.v !== undefined ? <em> {r.u}</em> : null}</b>
          {r.inferred && r.v !== null && r.v !== undefined ? <span className="ro-est"><Est />{r.inferred}</span> : null}
        </div>
      ))}
    </div>
  );
}

/** Small "estimated" badge shown beside any value the console inferred instead of measured. */
export function Est({ why }: { why?: string }) {
  return <i className="est" title={why}>estimated</i>;
}

export function Stat({ label, value, unit, digits = 0, color }: { label: string; value: unknown; unit?: string; digits?: number; color?: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <b style={color ? { color } : undefined}>{fmt(value, digits)}{unit ? <em>{unit}</em> : null}</b>
    </div>
  );
}

export function Gauge({ value, label, sub, color = C.accent, size = 132 }: { value: number; label: string; sub?: string; color?: string; size?: number }) {
  const v = Math.max(0, Math.min(1, value || 0));
  const r = 44;
  const a0 = Math.PI * 0.75;
  const a1 = a0 + Math.PI * 1.5 * v;
  const end = a0 + Math.PI * 1.5;
  const pt = (a: number) => `${50 + r * Math.cos(a)} ${50 + r * Math.sin(a)}`;
  const arc = (from: number, to: number) => `M${pt(from)} A${r} ${r} 0 ${to - from > Math.PI ? 1 : 0} 1 ${pt(to)}`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="gauge">
      <path d={arc(a0, end)} fill="none" stroke={C.line} strokeWidth="6" strokeLinecap="round" />
      {v > 0.002 && <path d={arc(a0, a1)} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" />}
      {Array.from({ length: 11 }, (_, i) => {
        const a = a0 + (Math.PI * 1.5 * i) / 10;
        return <line key={i} x1={50 + 35 * Math.cos(a)} y1={50 + 35 * Math.sin(a)} x2={50 + 38 * Math.cos(a)} y2={50 + 38 * Math.sin(a)} stroke={C.mute} strokeWidth="0.6" />;
      })}
      <text x="50" y="52" textAnchor="middle" className="gauge-v">{label}</text>
      {sub && <text x="50" y="64" textAnchor="middle" className="gauge-s">{sub}</text>}
    </svg>
  );
}

/** Standard instrument frame: a visual area plus an optional side table. */
export function Frame({ visual, side, foot }: { visual: ReactNode; side?: ReactNode; foot?: ReactNode }) {
  return (
    <div className={"frame" + (side ? " has-side" : "")}>
      <div className="frame-visual">{visual}</div>
      {side && <div className="frame-side">{side}</div>}
      {foot && <div className="frame-foot">{foot}</div>}
    </div>
  );
}

/** Shown in the visual area before the first record. */
export function Waiting({ session, what }: { session: Session; what: string }) {
  const s = session.state;
  const msg =
    s === "idle" || s === "stopped" ? `Press Request to start. ${what}` :
    s === "requesting" ? "Waiting for the browser. Answer the prompt if one appears." :
    s === "granted" ? "Access granted. Waiting for the first reading." :
    s === "denied" ? session.error || "Access was refused." :
    s === "unsupported" ? `${session.error || "Not supported here."} Switch to Simulated to see what it would show.` :
    s === "error" ? session.error : "";
  return <div className={"waiting st-" + s}><span className="waiting-dot" />{msg}</div>;
}

export function Table({ head, rows, empty = "No rows yet" }: { head: string[]; rows: (string | number | ReactNode)[][]; empty?: string }) {
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.length ? rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>) : <tr><td colSpan={head.length} className="tbl-empty">{empty}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export const lastData = <T,>(s: Session): T | null => (s.last ? (s.last.data as T) : null);
