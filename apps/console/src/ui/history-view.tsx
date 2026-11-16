import { useEffect, useMemo, useState } from "react";
import { HardDrive, Trash2 } from "lucide-react";
import type { ScopeDef, Session } from "../core/types";
import { clearHistory, loadHistory, type Stored } from "../core/history";
import { fmt } from "./kit";
import { clock } from "./charts";

// Change over time for one capability, read back from this tab's IndexedDB history.

export function HistoryChart({ scope, session }: { scope: ScopeDef; session: Session }) {
  const [rows, setRows] = useState<Stored[]>([]);
  const [pick, setPick] = useState<string | null>(null);
  // Reload when new readings land, at most every two seconds.
  const tick = Math.floor(session.count / 2) + (session.startedAt || 0);
  useEffect(() => {
    let live = true;
    const h = setTimeout(() => void loadHistory(scope.id).then((r) => live && setRows(r)), 400);
    return () => { live = false; clearTimeout(h); };
  }, [scope.id, tick]);

  const keys = useMemo(() => {
    const seen = new Set<string>();
    for (const r of rows.slice(-50)) for (const [k, v] of Object.entries(r.data)) if (typeof v === "number") seen.add(k);
    const pref = (scope.metrics || []).map((m) => m.key).filter((k) => seen.has(k));
    return [...pref, ...[...seen].filter((k) => !pref.includes(k))].slice(0, 8);
  }, [rows, scope.metrics]);
  const key = pick && keys.includes(pick) ? pick : keys[0];

  if (!rows.length)
    return <p className="empty">No saved readings yet. Every reading is kept in this browser for this tab, so a trend builds up as you use it.</p>;

  const pts = key ? rows.filter((r) => typeof r.data[key] === "number").map((r) => ({ t: r.t, v: r.data[key] as number })) : [];
  const meta = scope.metrics?.find((m) => m.key === key);
  const W = 600, H = 150, P = { l: 40, r: 8, t: 8, b: 22 };
  const t0 = pts[0]?.t ?? rows[0].t, t1 = Math.max(pts[pts.length - 1]?.t ?? rows[rows.length - 1].t, t0 + 1000);
  const vs = pts.map((p) => p.v);
  const lo = Math.min(...vs), hi = Math.max(...vs), span = hi - lo || Math.abs(hi) || 1;
  const x = (t: number) => P.l + ((t - t0) / (t1 - t0)) * (W - P.l - P.r);
  const y = (v: number) => H - P.b - ((v - lo) / span) * (H - P.t - P.b);
  // Break the line where readings stopped for more than 10 seconds.
  let d = "";
  pts.forEach((p, i) => { d += (i === 0 || p.t - pts[i - 1].t > 10000 ? "M" : "L") + x(p.t).toFixed(1) + " " + y(p.v).toFixed(1); });
  const dg = meta?.digits ?? (Number.isInteger(hi) && Number.isInteger(lo) ? 0 : 2);
  const last = vs[vs.length - 1];
  const first = vs[0];
  const delta = last - first;
  const mins = (t1 - t0) / 60000;

  return (
    <div className="hist">
      <div className="hist-stats">
        <div><span>Saved</span><b>{rows.length}</b></div>
        <div><span>Over</span><b>{mins < 1 ? Math.round(mins * 60) + " s" : mins.toFixed(mins < 10 ? 1 : 0) + " min"}</b></div>
        {pts.length > 0 && <div><span>Low to high</span><b>{fmt(lo, dg)} to {fmt(hi, dg)}</b></div>}
        {pts.length > 1 && <div><span>Change</span><b className={delta > 0 ? "up" : delta < 0 ? "down" : ""}>{delta > 0 ? "+" : ""}{fmt(delta, dg)}{meta?.unit && <em> {meta.unit}</em>}</b></div>}
      </div>
      {keys.length > 1 && (
        <div className="hist-keys">{keys.map((k) => <button key={k} className={k === key ? "on" : ""} onClick={() => setPick(k)}>{scope.metrics?.find((m) => m.key === k)?.label || k}</button>)}</div>
      )}
      {pts.length > 1 ? (
        <svg className="hist-c" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${key} over time`}>
          {[0, 0.5, 1].map((f) => { const v = lo + f * span; return <g key={f}><line className="hist-g" x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} /><text x={P.l - 5} y={y(v) + 3} textAnchor="end">{fmt(v, dg)}</text></g>; })}
          <path className="hist-a" d={`${d} L${x(pts[pts.length - 1].t)} ${H - P.b} L${x(pts[0].t)} ${H - P.b} Z`} />
          <path className="hist-l" d={d} />
          <circle className="hist-p" cx={x(pts[pts.length - 1].t)} cy={y(last)} r="3.5"><title>{clock(pts[pts.length - 1].t)} {fmt(last, dg)}</title></circle>
          <text x={P.l} y={H - 6}>{clock(t0)}</text>
          <text x={W - P.r} y={H - 6} textAnchor="end">{clock(t1)}</text>
        </svg>
      ) : (
        <p className="empty">{key ? "One saved reading so far. Run it again later to see a change." : "These readings have no numbers to chart; the latest values are listed above."}</p>
      )}
      <div className="hist-f">
        <span><HardDrive size={12} />Kept in this browser, so it is still here when you come back.</span>
        <button className="btn ghost" onClick={() => void clearHistory(scope.id).then(() => setRows([]))}><Trash2 size={12} />Clear</button>
      </div>
    </div>
  );
}
