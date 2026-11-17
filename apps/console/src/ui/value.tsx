import { Check, Minus } from "lucide-react";
import type { ScopeDef, Session } from "../core/types";
import { KINDS, QUANT, formatKind, headline, readKey, showsRate, type Headline } from "../core/datatype";

/** One reading drawn the way its data type wants: Yes/No badge, swatch, ordered pips, number with unit, or a label. */
export function TypedValue({ h, compact }: { h: Headline | null; compact?: boolean }) {
  if (!h) return null;
  const tip = `${h.label}: ${h.text}${h.unit ? " " + h.unit : ""}`;
  if (h.kind === "boolean") {
    const yes = h.tone === "ok";
    return <span className={"tv tv-bool " + (yes ? "yes" : "no")} title={tip}>{yes ? <Check size={11} /> : <Minus size={11} />}{h.text}</span>;
  }
  if (h.kind === "color" && typeof h.value === "string") {
    return <span className="tv tv-color" title={tip}><i style={{ background: h.value }} />{compact ? null : h.text}</span>;
  }
  if (h.kind === "ordinal") {
    const n = h.options?.length || 0;
    return (
      <span className={"tv tv-ord t-" + h.tone} title={tip}>
        {n > 1 && h.rank !== undefined && <span className="pips" aria-hidden>{h.options!.map((_, i) => <i key={i} className={i <= h.rank! ? "on" : ""} />)}</span>}
        <span className="tv-t">{h.text}</span>
      </span>
    );
  }
  if (h.kind === "ratio" || h.kind === "interval" || h.kind === "count") {
    return <span className="tv tv-num" title={tip}>{h.text}{h.unit && <small>{h.unit}</small>}</span>;
  }
  return <span className={"tv tv-label t-" + h.tone} title={tip}><span className="tv-t">{h.text}</span></span>;
}

/** The row value for a capability: its typed headline, with the rate only where a stream makes it meaningful. */
export function RowValue({ scope, s }: { scope: ScopeDef; s: Session }) {
  const h = headline(scope, s.last?.data as Record<string, unknown> | undefined);
  const rate = showsRate(scope, s);
  return (
    <span className="row-v">
      <TypedValue h={h} compact />
      {rate && <em className="row-hz">{s.hz.toFixed(0)} Hz</em>}
    </span>
  );
}

/** The record tab's measures: each declared metric drawn by its own type, primary first, with its type named. */
export function TypedMetrics({ scope, s }: { scope: ScopeDef; s: Session }) {
  const data = s.last?.data as Record<string, unknown> | undefined;
  const ms = scope.reference ? [] : (scope.metrics || []).filter((m) => m.key !== "@first").slice(0, 6);
  const lead = headline(scope, data);
  return (
    <>
      {lead && <div className="met-lead"><span>{lead.label}<i className="kind">{KINDS[lead.kind].name}</i></span><b><TypedValue h={lead} /></b></div>}
      {ms.filter((m) => !m.primary).map((m) => {
        const v = data ? (m.key === "@geo" ? { lat: data.lat, lon: data.lon } : readKey(data, m.key)) : undefined;
        const kind = m.type || "nominal";
        const f = v === undefined ? null : formatKind(kind, v, m);
        const h: Headline | null = f && { kind, label: m.label, text: f.text, unit: QUANT.has(kind) ? m.unit : undefined, value: v, tone: f.tone, rank: f.rank, options: m.options };
        return <div key={m.key}><span>{m.label}</span><b>{h ? <TypedValue h={h} /> : "n/a"}</b></div>;
      })}
    </>
  );
}
