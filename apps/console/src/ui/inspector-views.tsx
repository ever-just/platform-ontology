import { ArrowRight, ChevronRight, CircleCheck, CircleX, Code2, Database, Eye, History, Info, KeyRound, ListTree, ShieldQuestion, TriangleAlert, Undo2 } from "lucide-react";
import type { AtlasNode, IconType, ScopeDef, Session } from "../core/types";
import { fmt } from "./kit";
import { clock } from "./charts";
import { MECH, type Mechanism } from "./icons";
import { reqKey, type DepInfo } from "../core/deps";
import type { ConsoleCtx } from "../ext/registry";
import { reqIcon } from "./deps-graph";

// Visual subviews for the Inspector: provenance chain, field meanings, access rows and a log timeline.

type StepTone = "done" | "now" | "wait" | "bad";

/** Where a value comes from: browser call, access, raw reading, normalized record, fields. */
export function Provenance({ scope, session, mech }: { scope: ScopeDef; session: Session; mech: Mechanism }) {
  const st = session.state;
  const bad = st === "denied" || st === "unsupported" || st === "error";
  const granted = st === "granted" || st === "streaming" || (st === "stopped" && session.count > 0);
  const have = session.count > 0;
  const fields = session.last ? Object.keys(session.last.data || {}).length : 0;
  const M = MECH[mech];
  const steps: { Icon: IconType; label: string; detail: string; tone: StepTone }[] = [
    { Icon: Code2, label: "Browser call", detail: scope.call, tone: st === "idle" ? "wait" : "done" },
    { Icon: M.Icon, label: M.label, detail: bad ? st : granted ? "allowed" : st === "requesting" ? "asking" : M.plain, tone: bad ? "bad" : granted ? "done" : st === "requesting" ? "now" : "wait" },
    { Icon: Database, label: "Raw reading", detail: have ? `${session.count} read${session.count === 1 ? "" : "s"}${session.firstAt && session.startedAt ? `, first after ${session.firstAt - session.startedAt} ms` : ""}` : "none yet", tone: have ? "done" : bad ? "bad" : "wait" },
    { Icon: ListTree, label: "Record", detail: have ? `seq ${session.last?.seq ?? 0}${session.hz ? `, ${session.hz.toFixed(1)} Hz` : ""}` : "{ seq, t, data }", tone: have ? (st === "streaming" ? "now" : "done") : "wait" },
    { Icon: Info, label: "Fields", detail: have ? `${fields} value${fields === 1 ? "" : "s"} explained below` : "named and explained", tone: have ? "done" : "wait" },
  ];
  return (
    <div className="prov">
      {steps.map((s, i) => (
        <div key={s.label} className="prov-s">
          <div className={"prov-c t-" + s.tone}>
            <span className="prov-i"><s.Icon size={14} /></span>
            <b>{s.label}</b>
            <span className="prov-d" title={s.detail}>{s.detail}</span>
          </div>
          {i < steps.length - 1 && <ArrowRight className="prov-a" size={13} />}
        </div>
      ))}
    </div>
  );
}

const human = (k: string) => k.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

// [capability id pattern or null for any, field key pattern, plain meaning]. First match wins.
const MEANING: [RegExp | null, RegExp, string][] = [
  [/battery/, /^level$/, "How full the battery is."], [/battery/, /^charging$/, "Whether it is plugged in."],
  [/battery/, /charging_?time/i, "Seconds until full. Empty when not charging."], [/battery/, /discharging_?time/i, "Seconds of battery left."],
  [/microphone|audio/, /rms|level|db|peak/i, "How loud it is right now."],
  [null, /^lat/i, "North or south position in degrees."], [null, /^lon|^lng/i, "East or west position in degrees."],
  [null, /accuracy/i, "How sure the reading is. Smaller is more precise."], [null, /altitude/i, "Height above sea level."],
  [null, /speed/i, "How fast the device is moving."], [null, /heading/i, "Direction of travel, 0 is north."],
  [null, /^fps$/i, "Frames read per second."], [null, /bright|lux|illuminance/i, "How much light there is."], [null, /faces/i, "Faces detected in the frame."],
  [null, /timezone|^tz$/i, "Your clock region, which narrows down where you are."], [null, /offset/i, "Hours from UTC."], [null, /locale|lang/i, "Language settings."],
  [null, /^alpha$|^beta$|^gamma$/i, "Rotation angle of the device."], [null, /^x$|^y$|^z$/i, "Movement along one axis."],
  [null, /hash/i, "A short fingerprint that stays the same on repeat visits."], [null, /count$|^n$/i, "How many were found."],
  [null, /rtt|latency/i, "Round trip time to a server."], [null, /downlink|mbps/i, "Estimated download speed."], [null, /effective_?type/i, "Connection quality class."],
  [null, /width|height|^w$|^h$/i, "Size in pixels."], [null, /dpr|pixel_?ratio/i, "Screen pixel density."], [null, /cores|concurrency/i, "Processor threads."], [null, /memory/i, "Memory in GB, rounded."],
  [null, /quota/i, "Space this site is allowed to use."], [null, /usage/i, "Space this site uses now."], [null, /^state$|^status$/i, "Current state."],
];

function meaningOf(key: string, scope: ScopeDef, node?: AtlasNode): { label: string; unit?: string; plain?: string } {
  const m = scope.metrics?.find((x) => x.key === key);
  const f = node?.f?.find((x) => x.n === key);
  return { label: m?.label ? human(m.label) : human(key), unit: m?.unit || f?.u || undefined, plain: MEANING.find(([sc, re]) => (!sc || sc.test(scope.id)) && re.test(key))?.[2] };
}

function show(v: unknown) {
  if (v === null || v === undefined) return "n/a";
  if (typeof v === "number") return fmt(v, Number.isInteger(v) ? 0 : 2);
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "string") return v.length > 60 ? v.slice(0, 60) + "..." : v || "(empty)";
  if (Array.isArray(v)) return `${v.length} item${v.length === 1 ? "" : "s"}`;
  return `${Object.keys(v as object).length} values`;
}

/** Each value in the latest record, with its plain meaning. */
export function FieldMeanings({ scope, session, node }: { scope: ScopeDef; session: Session; node?: AtlasNode }) {
  const data = (session.last?.data || {}) as Record<string, unknown>;
  const keys = Object.keys(data);
  if (!keys.length) return <p className="empty">Run it to see each value and what it means.</p>;
  return (
    <div className="fm">
      {keys.slice(0, 24).map((k) => {
        const m = meaningOf(k, scope, node);
        const v = data[k];
        return (
          <div key={k} className="fm-r">
            <span className="fm-k"><b>{m.label}</b><code>{k}</code></span>
            <span className={"fm-v" + (typeof v === "boolean" ? (v ? " yes" : " no") : "")}>{show(v)}{m.unit && typeof v === "number" ? <em> {m.unit}</em> : null}</span>
            {m.plain && <span className="fm-p">{m.plain}</span>}
          </div>
        );
      })}
    </div>
  );
}

/** Access facts as icon rows instead of a definition list. */
export function AccessRows({ scope, session, node, mech }: { scope: ScopeDef; session: Session; node?: AtlasNode; mech: Mechanism }) {
  const M = MECH[mech];
  const rows: { Icon: IconType; k: string; v: React.ReactNode; tone?: string }[] = [
    { Icon: M.Icon, k: "How", v: <><b>{M.label}.</b> {M.plain}</>, tone: "k-" + mech },
    { Icon: ShieldQuestion, k: "Prompt", v: scope.passive ? "None. Read silently." : node?.ui || (scope.gesture ? "Chooser after a click" : "Browser prompt") },
  ];
  if (scope.permission || session.permState) rows.push({ Icon: KeyRound, k: "Permission", v: <>{scope.permission || "none"}{session.permState && <span className={"perm p-" + session.permState}>{session.permState}</span>}</> });
  const none = (v?: string) => !v || /^(none|n\/a|-)\.?$/i.test(v.trim());
  if (node?.gr && !none(node.gr)) rows.push({ Icon: CircleCheck, k: "Grant", v: node.gr });
  if (node?.ps && !none(node.ps)) rows.push({ Icon: History, k: "Remembered", v: node.ps });
  if (node?.rv && !none(node.rv)) rows.push({ Icon: Undo2, k: "Revoke", v: node.rv });
  rows.push({ Icon: Code2, k: "Browser call", v: <code>{scope.call}</code> });
  return (
    <div className="acc">
      {rows.map((r) => (
        <div key={r.k} className={"acc-r " + (r.tone || "")}><span className="acc-i"><r.Icon size={14} /></span><span className="acc-k">{r.k}</span><span className="acc-v">{r.v}</span></div>
      ))}
    </div>
  );
}

export function Reveals({ items }: { items: string[] }) {
  return <div className="rev">{items.map((r) => <div key={r}><Eye size={13} /><span>{r}</span></div>)}</div>;
}

const LV_ICON = { info: Info, ok: CircleCheck, warn: TriangleAlert, err: CircleX } as const;

/** A time axis with every log event and the record density, then the event list. */
export function LogTimeline({ session }: { session: Session }) {
  const logs = session.logs;
  if (!logs.length) return <p className="empty">Nothing yet. Run it and every step shows up here.</p>;
  const recs = session.records;
  const t0 = Math.min(logs[0].t, recs[0]?.t ?? Infinity);
  const t1 = Math.max(logs[logs.length - 1].t, recs[recs.length - 1]?.t ?? 0, t0 + 1000);
  const W = 600, span = t1 - t0, x = (t: number) => 8 + ((t - t0) / span) * (W - 16);
  const bins = new Array(60).fill(0);
  for (const r of recs) bins[Math.min(59, Math.floor(((r.t - t0) / span) * 60))]++;
  const peak = Math.max(1, ...bins);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ x: 8 + f * (W - 16), s: ((f * span) / 1000).toFixed(span < 10000 ? 1 : 0) }));
  return (
    <>
      <svg className="tl" viewBox={`0 0 ${W} 74`} preserveAspectRatio="none" role="img" aria-label="Timeline of events and records">
        {bins.map((b, i) => b > 0 && <rect key={i} className="tl-b" x={8 + (i / 60) * (W - 16)} width={(W - 16) / 60 - 1} y={44 - (b / peak) * 26} height={(b / peak) * 26} />)}
        <line className="tl-ax" x1="8" x2={W - 8} y1="46" y2="46" />
        {ticks.map((t) => <g key={t.x}><line className="tl-ax" x1={t.x} x2={t.x} y1="46" y2="50" /><text x={t.x} y="62" textAnchor={t.x < 20 ? "start" : t.x > W - 20 ? "end" : "middle"}>{t.s}s</text></g>)}
        {logs.map((l, i) => <circle key={i} className={"tl-d " + l.level} cx={x(l.t)} cy="10" r="4.5"><title>{clock(l.t)} {l.msg}</title></circle>)}
      </svg>
      <div className="tl-legend"><span><i className="tl-sw rec" />records per moment</span><span><i className="tl-sw ok" />step</span><span><i className="tl-sw warn" />warning</span><span><i className="tl-sw err" />error</span></div>
      <div className="feed">
        {[...logs].reverse().map((l, i) => {
          const I = LV_ICON[l.level];
          return <div key={i} className={"fe " + l.level}><time>{clock(l.t)}</time><I size={12} className="fe-i" /><span>{l.msg}</span></div>;
        })}
      </div>
    </>
  );
}

/** Dependencies as quiet chips: a status dot (met, unmet, unknown) and the name. A capability opens as a subview. */
export function DepChips({ ctx, info }: { ctx: ConsoleCtx; info: DepInfo }) {
  const byId = new Map(ctx.scopes.map((s) => [s.id, s]));
  const unlocks = info.unlocks.map((id) => byId.get(id)).filter(Boolean) as ScopeDef[];
  if (!info.reqs.length && !unlocks.length) return <p className="lead">Needs nothing. Any page can use it.</p>;
  const word = { met: "met here", unmet: "not met here", unknown: "cannot be checked here" } as const;
  return (
    <>
      {info.reqs.length === 0 ? <p className="lead">Needs nothing.</p> : (
        <div className="chips">
          {info.reqs.map((r) => {
            const st = info.status[reqKey(r)] || "unknown";
            const target = r.kind === "capability" ? byId.get(r.id) : undefined;
            const I = reqIcon(r);
            const title = `${r.label}: ${r.why} (${word[st]})${target ? ". Open it." : ""}`;
            const body = <><i /><I size={12} /><span className="t">{r.label}</span>{target && <ChevronRight size={12} className="go" />}</>;
            return target
              ? <button data-control={`inspector.dep-chip.${reqKey(r)}`} key={reqKey(r)} className="chip" data-s={st} title={title} onClick={() => ctx.select(target.id)}>{body}</button>
              : <span key={reqKey(r)} className="chip" data-s={st} title={title}>{body}</span>;
          })}
        </div>
      )}
      {unlocks.length > 0 && (
        <>
          <span className="chip-l">Needed by</span>
          <div className="chips">
            {unlocks.map((s) => (
              <button data-control={`inspector.needed-by.${s.id}`} key={s.id} className="chip" title={`${s.name} needs this. Open it.`} onClick={() => ctx.select(s.id)}>
                <span className="t">{s.name}</span><ChevronRight size={12} className="go" />
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
