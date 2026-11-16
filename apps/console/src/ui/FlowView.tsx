import type { ScopeDef } from "../core/types";
import { getSession, isActive, useVersion } from "../core/harness";
import { DOMAIN_COLOR, fmt } from "./kit";

// Data flow, left to right: scope -> permission gate -> unified API -> stream -> what it reveals.
// Combined inferences appear when two scopes that feed each other are both live.

export function FlowView({ scopes, selected, onSelect }: { scopes: ScopeDef[]; selected: string; onSelect: (id: string) => void }) {
  useVersion();
  const live = scopes.filter((s) => isActive(getSession(s.id)));
  const sel = scopes.find((s) => s.id === selected);
  const rows = live.length ? live : sel ? [sel] : [];
  const ids = new Set(live.map((s) => s.id));
  const reveals = new Map<string, string[]>();
  rows.forEach((s) => s.reveals.forEach((r) => reveals.set(r, [...(reveals.get(r) || []), s.id])));
  const combos: { label: string; from: string[] }[] = [];
  live.forEach((s) => (s.feeds || []).forEach((f) => {
    if (ids.has(f) && s.id < f) {
      const o = scopes.find((x) => x.id === f)!;
      combos.push({ label: `${s.name} + ${o.name}`, from: [s.id, f] });
    }
  }));
  const outs = [...[...reveals.entries()].map(([label, from]) => ({ label, from, combo: false })), ...combos.map((c) => ({ ...c, combo: true }))];

  const W = 1000;
  const rowH = 46;
  const H = Math.max(320, Math.max(rows.length, outs.length) * rowH + 80);
  const X = { scope: 20, gate: 300, hub: 470, stream: 620, out: 760 };
  const yScope = (i: number) => 50 + (i + 0.5) * ((H - 80) / Math.max(1, rows.length));
  const yOut = (i: number) => 50 + (i + 0.5) * ((H - 80) / Math.max(1, outs.length));
  const hubY = H / 2;
  const sy = new Map(rows.map((s, i) => [s.id, yScope(i)]));

  if (!rows.length) return <div className="flow-empty">Select or request a scope to see how its data flows.</div>;

  return (
    <div className="flow">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          <marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="#8a8a92" /></marker>
        </defs>
        {["Scope", "Permission gate", "po.request", "Stream", "What it reveals"].map((t, i) => (
          <text key={t} x={[X.scope, X.gate - 40, X.hub - 40, X.stream - 10, X.out][i]} y="24" className="flow-col">{t.toUpperCase()}</text>
        ))}
        {rows.map((s) => {
          const ses = getSession(s.id);
          const y = sy.get(s.id)!;
          const on = isActive(ses);
          const c = DOMAIN_COLOR[s.domain];
          const gateOk = ses.state === "streaming" || ses.state === "granted";
          const gateNo = ses.state === "denied" || ses.state === "unsupported" || ses.state === "error";
          return (
            <g key={s.id} className="flow-row" onClick={() => onSelect(s.id)}>
              <path d={`M${X.scope + 220} ${y} C ${X.gate - 60} ${y}, ${X.gate - 60} ${y}, ${X.gate - 14} ${y}`} className={"flow-wire" + (on ? " on" : "")} stroke={c} />
              <path d={`M${X.gate + 14} ${y} C ${X.hub - 60} ${y}, ${X.hub - 60} ${hubY}, ${X.hub - 30} ${hubY}`} className={"flow-wire" + (gateOk ? " on" : "")} stroke={gateOk ? c : "#d4d4d8"} />
              <rect x={X.scope} y={y - 16} width="220" height="32" rx="8" className={"flow-node" + (s.id === selected ? " sel" : "")} />
              <circle cx={X.scope + 16} cy={y} r="5" fill={c} />
              <text x={X.scope + 28} y={y + 4} className="flow-t">{s.name}</text>
              <text x={X.scope + 210} y={y + 4} textAnchor="end" className="flow-s">{ses.state}</text>
              <g transform={`translate(${X.gate} ${y})`}>
                <rect x="-14" y="-14" width="28" height="28" rx="6" transform="rotate(45)" className={"flow-gate" + (gateOk ? " ok" : gateNo ? " no" : "")} />
                <text y="4" textAnchor="middle" className="flow-gt">{gateOk ? "✓" : gateNo ? "×" : s.passive ? "·" : "?"}</text>
              </g>
              <text x={X.gate + 22} y={y - 10} className="flow-s">{s.passive ? "no prompt" : s.permission || "prompt"}</text>
            </g>
          );
        })}
        <g transform={`translate(${X.hub} ${hubY})`}>
          <circle r="30" className="flow-hub" />
          <text y="-2" textAnchor="middle" className="flow-ht">po</text>
          <text y="12" textAnchor="middle" className="flow-hs">{live.length} live</text>
        </g>
        <path d={`M${X.hub + 30} ${hubY} L${X.stream + 40} ${hubY}`} className={"flow-wire" + (live.length ? " on" : "")} stroke="#0b0b0c" markerEnd="url(#arr)" />
        <g transform={`translate(${X.stream + 60} ${hubY})`}>
          <rect x="-20" y="-22" width="40" height="44" rx="6" className="flow-node" />
          <text y="-4" textAnchor="middle" className="flow-hs">{fmt(live.reduce((a, s) => a + getSession(s.id).count, 0))}</text>
          <text y="10" textAnchor="middle" className="flow-hs">rec</text>
        </g>
        {outs.map((o, i) => {
          const y = yOut(i);
          const c = o.combo ? "#0b0b0c" : DOMAIN_COLOR[scopes.find((s) => s.id === o.from[0])!.domain];
          const lit = o.from.every((id) => ids.has(id));
          return (
            <g key={o.label}>
              <path d={`M${X.stream + 80} ${hubY} C ${X.out - 40} ${hubY}, ${X.out - 40} ${y}, ${X.out - 6} ${y}`} className={"flow-wire thin" + (lit ? " on" : "")} stroke={lit ? c : "#e4e4e7"} strokeDasharray={o.combo ? "4 3" : undefined} />
              <circle cx={X.out} cy={y} r="4" fill={lit ? c : "#d4d4d8"} />
              <text x={X.out + 10} y={y + 4} className={"flow-o" + (o.combo ? " combo" : "") + (lit ? "" : " dim")}>{o.combo ? "◆ " : ""}{o.label}</text>
            </g>
          );
        })}
      </svg>
      <p className="viz-caption">{live.length ? "Live scopes flow through one call. Dashed rows are inferences that only appear when two scopes run together." : "Preview for the selected scope. Request it to light the path."}</p>
    </div>
  );
}
