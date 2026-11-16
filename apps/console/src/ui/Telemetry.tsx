import type { Atlas, ScopeDef } from "../core/types";
import { allSessions, isActive, series, useVersion } from "../core/harness";
import { DOMAIN_COLOR, Spark, fmt } from "./kit";

// Bottom strip: one live chip per active scope, plus totals. Reads like a telemetry bus.

export function Telemetry({ atlas, scopes, onSelect }: { atlas: Atlas; scopes: ScopeDef[]; onSelect: (id: string) => void }) {
  useVersion();
  const byId = new Map(scopes.map((s) => [s.id, s]));
  const fb = new Map(atlas.nodes.map((n) => [n.i, n.fb || 0]));
  const live = allSessions().filter((s) => isActive(s) && byId.has(s.id));
  const records = allSessions().reduce((a, s) => a + s.count, 0);
  const bits = live.reduce((a, s) => a + byId.get(s.id)!.atlas.reduce((b, id) => b + (fb.get(id) || 0), 0), 0);
  const hz = live.reduce((a, s) => a + s.hz, 0);
  return (
    <footer className="tele">
      <div className="tele-tot">
        <span><b>{live.length}</b> live</span>
        <span><b>{fmt(records)}</b> records</span>
        <span><b>{hz.toFixed(1)}</b> Hz</span>
        <span title="Sum of identifying bits from the atlas for every live scope"><b>{bits.toFixed(1)}</b> bits</span>
      </div>
      <div className="tele-chips">
        {live.length === 0 && <span className="mute">Nothing streaming. Request a scope to see it here.</span>}
        {live.map((s) => {
          const def = byId.get(s.id)!;
          const m = def.metrics?.[0];
          const vals = m ? series(s.records, m.key, 40) : [];
          const v = m && s.last ? s.last.data[m.key] : undefined;
          const color = DOMAIN_COLOR[def.domain];
          return (
            <button key={s.id} className="chip" onClick={() => onSelect(s.id)}>
              <i style={{ background: color }} className="chip-dot" />
              <span className="chip-n">{def.name}</span>
              {vals.length > 1 && <Spark values={vals} w={46} h={16} color={color} />}
              <b>{m ? `${fmt(v, m.digits ?? 1)}${m.unit ? " " + m.unit : ""}` : fmt(s.count)}</b>
              <em>{s.hz ? s.hz.toFixed(0) + " Hz" : s.state}</em>
            </button>
          );
        })}
      </div>
    </footer>
  );
}
