import type { ScopeDef, Session } from "../core/types";
import { DOMAIN_COLOR, fmt } from "./kit";

// Toggleable layer over the instrument: the access path lighting up, headline metrics,
// and what this data lets a site work out.

const STAGES = ["Scope", "Gate", "Unified API", "Stream", "Instrument"];

function reached(s: Session): number {
  switch (s.state) {
    case "requesting": return 1;
    case "granted": return 3;
    case "streaming": return 5;
    case "denied": case "unsupported": case "error": return 1;
    default: return 0;
  }
}

export function Overlay({ scope, session }: { scope: ScopeDef; session: Session }) {
  const n = reached(session);
  const bad = ["denied", "unsupported", "error"].includes(session.state);
  const c = DOMAIN_COLOR[scope.domain];
  const d = session.last?.data || {};
  return (
    <div className="ov" style={{ ["--c" as string]: c }}>
      <div className="ov-rail">
        {STAGES.map((t, i) => (
          <div key={t} className={"ov-st" + (i < n ? " on" : "") + (bad && i === 1 ? " bad" : "") + (i === n - 1 && session.state === "streaming" ? " pulse" : "")}>
            <i />
            <span>{t}</span>
          </div>
        ))}
      </div>
      {scope.metrics && scope.metrics.length > 0 && (
        <div className="ov-metrics">
          {scope.metrics.slice(0, 4).map((m) => (
            <div key={m.key} className="ov-m">
              <span>{m.label}</span>
              <b>{fmt(d[m.key], m.digits ?? 1)}{m.unit ? <em> {m.unit}</em> : null}</b>
            </div>
          ))}
          <div className="ov-m"><span>rate</span><b>{session.hz.toFixed(1)}<em> Hz</em></b></div>
        </div>
      )}
      <div className="ov-reveals">
        <span className="ov-lab">{session.state === "streaming" ? "Access gained. This lets a site work out" : "If granted, this lets a site work out"}</span>
        {scope.reveals.map((r) => <span key={r} className={"ov-chip" + (session.state === "streaming" ? " on" : "")}>{r}</span>)}
      </div>
    </div>
  );
}
