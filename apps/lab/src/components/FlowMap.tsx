import { useMemo } from 'react';
import type { Item, NodeState, Plat } from '../types';
import type { Plan } from '../sim/flow';
import { nodeDetails } from '../sim/flow';
import type { Sim } from '../hooks/useSim';

interface Pos { x: number; y: number; w: number; h: number }
const NW = 92; const NH = 28;
const POS: Record<string, Pos> = {
  trigger: { x: 150, y: 2, w: 100, h: NH },
  c1: { x: 1, y: 42, w: NW, h: NH }, c2: { x: 103, y: 42, w: NW, h: NH }, c3: { x: 205, y: 42, w: NW, h: NH }, c4: { x: 307, y: 42, w: NW, h: NH },
  prompt: { x: 140, y: 86, w: 120, h: NH },
  decision: { x: 140, y: 128, w: 120, h: NH },
  allow: { x: 30, y: 172, w: 130, h: NH }, deny: { x: 240, y: 172, w: 130, h: NH },
  data: { x: 30, y: 214, w: 130, h: NH }, sees: { x: 240, y: 214, w: 130, h: NH },
  persist: { x: 30, y: 256, w: 130, h: NH }, recover: { x: 240, y: 256, w: 130, h: NH },
  revoke: { x: 30, y: 298, w: 130, h: NH },
};
const EDGES: [string, string, string?][] = [
  ['trigger', 'c1'], ['c1', 'c2'], ['c2', 'c3'], ['c3', 'c4'], ['c4', 'prompt', 'all pass'],
  ['prompt', 'decision'], ['decision', 'allow', 'Allow'], ['decision', 'deny', 'Deny'],
  ['allow', 'data'], ['data', 'persist'], ['persist', 'revoke'], ['deny', 'sees'], ['sees', 'recover'],
];

function pathFor(a: string, b: string) {
  const A = POS[a]; const B = POS[b];
  const row = Math.abs(A.y - B.y) < 4;
  if (row) {
    const x1 = A.x + A.w; const x2 = B.x; const y = A.y + A.h / 2;
    return { d: `M${x1} ${y} L${x2} ${y}`, lx: (x1 + x2) / 2, ly: y - 4 };
  }
  const x1 = A.x + A.w / 2; const y1 = A.y + A.h; const x2 = B.x + B.w / 2; const y2 = B.y;
  if (a === 'trigger') { // trigger to first check, elbow
    return { d: `M${x1} ${y1} L${x1} ${y1 + 8} L${B.x + B.w / 2} ${y1 + 8} L${B.x + B.w / 2} ${y2}`, lx: x1, ly: y1 + 6 };
  }
  if (a === 'c4') {
    return { d: `M${x1} ${y1} L${x1} ${y1 + 8} L${x2} ${y1 + 8} L${x2} ${y2}`, lx: (x1 + x2) / 2 + 22, ly: y1 + 6 };
  }
  if (a === 'decision') {
    const ym = y1 + 12;
    return { d: `M${x1} ${y1} L${x1} ${ym} L${x2} ${ym} L${x2} ${y2}`, lx: (x1 + x2) / 2 + (x2 > x1 ? 30 : -30), ly: ym - 3 };
  }
  return { d: `M${x1} ${y1} L${x2} ${y2}`, lx: x1 + 4, ly: (y1 + y2) / 2 };
}

const LABEL: Record<string, string> = {
  trigger: 'Trigger', allow: 'Allow', data: 'Data delivered', persist: 'Persistence', revoke: 'Revocation',
  deny: 'Deny', sees: 'App sees', recover: 'Recovery', decision: 'Decision',
};

export function FlowMap(p: { item: Item; plat: Plat; plan: Plan; sim: Sim; selected: string; onSelect: (id: string) => void }) {
  const { plan, sim, selected } = p;
  const details = useMemo(() => nodeDetails(p.item, p.plat, plan), [p.item, p.plat, plan]);
  const labelOf = (id: string) => {
    const c = plan.checks.find((x) => x.id === id);
    if (c) return c.label;
    if (id === 'prompt') return plan.mode === 'prompt' ? (plan.prompt?.style === 'bubble' ? 'Permission bubble' : 'Prompt') : plan.mode === 'picker' ? 'Picker' : plan.mode === 'settings' ? 'Settings switch' : 'No prompt';
    return LABEL[id] ?? id;
  };
  const st = (id: string): NodeState => sim.lit[id] ?? 'idle';
  const idleRun = sim.phase === 'idle' && sim.runs === 0;
  const d = details[selected] ?? details.trigger;
  return (
    <div className="flow">
      <div className="flow-svgwrap">
        <svg viewBox="0 0 400 330" preserveAspectRatio="xMidYMid meet" role="group" aria-label="Flow map">
          <defs>
            <marker id="ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="var(--line-strong)" /></marker>
            <marker id="ah-on" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="var(--accent)" /></marker>
          </defs>
          {EDGES.map(([a, b, lab]) => {
            const { d: pd, lx, ly } = pathFor(a, b);
            const tb = st(b); const ta = st(a);
            const on = (tb === 'active' || tb === 'done' || tb === 'fail') && (ta === 'done' || ta === 'fail' || ta === 'active');
            const dead = tb === 'skip' || ta === 'skip';
            return (
              <g key={a + b} className={`edge ${on ? 'on' : ''} ${dead ? 'dead' : ''}`}>
                <path d={pd} fill="none" markerEnd={on ? 'url(#ah-on)' : 'url(#ah)'} />
                {lab && <text x={lx} y={ly} textAnchor="middle" className="elab">{lab}</text>}
              </g>
            );
          })}
          {Object.keys(POS).map((id) => {
            const P = POS[id]; const s = st(id);
            const sel = selected === id;
            return (
              <g key={id} className={`node ${s} ${sel ? 'sel' : ''}`} transform={`translate(${P.x} ${P.y})`}
                 onClick={() => p.onSelect(id)} tabIndex={0} role="button" aria-label={`${labelOf(id)}, ${s}`}
                 onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); p.onSelect(id); } }}>
                <rect width={P.w} height={P.h} rx={8} />
                {s === 'active' && <rect className="ring" width={P.w} height={P.h} rx={8} />}
                <text x={P.w / 2} y={P.h / 2 + 4} textAnchor="middle">{labelOf(id)}</text>
                {s === 'done' && <circle className="tick" cx={P.w - 9} cy={9} r={4} />}
                {s === 'fail' && <text className="xmark" x={P.w - 9} y={12} textAnchor="middle">x</text>}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="flow-info">
        <div className="flow-say" aria-live="polite">
          <b>{idleRun ? 'Press the trigger on the device' : sim.hint || 'Ready'}</b>
          <span>{idleRun ? 'Every step lights up in order. Click any node for details.' : sim.next}</span>
        </div>
        <div className="flow-detail">
          <h4>{d.title}</h4>
          <em>{d.from}</em>
          <ul>{d.lines.slice(0, 3).map((l, i) => <li key={i}>{l}</li>)}</ul>
        </div>
      </div>
    </div>
  );
}
