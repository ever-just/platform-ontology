import { memo, useEffect, useMemo, useRef, useState } from "react";
import { History, Play, Square, Search, Zap, X } from "lucide-react";
import type { Rec, ScopeDef } from "../core/types";
import { getSession, isActive, request, series, stop, useSession } from "../core/harness";
import { useTimeline } from "../core/timeline";
import { supportOf } from "../browser/profile";
import { OTHER, type ConsoleCtx, type GroupDef } from "../ext/registry";
import { Spark } from "./kit";
import { CapIcon, MechBadge, mechanismOf } from "./icons";
import { RowValue } from "./value";
import { QUANT, primaryMetric } from "../core/datatype";

type Tab = "all" | "live" | "used" | "blocked" | "ref";
const TABS: [Tab, string][] = [["all", "All"], ["live", "Live"], ["used", "Used"], ["blocked", "Blocked"], ["ref", "Reference"]];
const BLOCKED = new Set(["denied", "unsupported", "error"]);

function inTab(tab: Tab, id: string, scope?: ScopeDef) {
  if (tab === "ref") return !!scope?.reference;
  const s = getSession(id);
  if (tab === "live") return isActive(s);
  if (tab === "used") return s.count > 0 || s.state !== "idle";
  if (tab === "blocked") return BLOCKED.has(s.state);
  return true;
}

export function Capabilities({ ctx, selected }: { ctx: ConsoleCtx; selected: string | null }) {
  useTimeline(); // refresh tab counts once a second
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [group, setGroup] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)) { e.preventDefault(); input.current?.focus(); }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  const works = (s: ScopeDef) => { const n = ctx.nodeOf(s); return !n || "yp".includes(supportOf(n.sup, ctx.profile.column)); };
  const ql = q.trim().toLowerCase();
  const match = (s: ScopeDef) => !ql || s.name.toLowerCase().includes(ql) || s.id.includes(ql) || s.summary.toLowerCase().includes(ql);

  const all = useMemo(() => {
    const m = new Map<string, ScopeDef[]>();
    ctx.scopes.forEach((s) => { const g = ctx.groupOf(s.id).id; m.set(g, [...(m.get(g) || []), s]); });
    return m;
  }, [ctx]);
  const groups: GroupDef[] = [...ctx.groups, OTHER].filter((g) => all.has(g.id));
  const counts = Object.fromEntries(TABS.map(([t]) => [t, ctx.scopes.filter((s) => inTab(t, s.id, s)).length]));
  const visible = groups
    .filter((g) => !group || g.id === group)
    .map((g) => ({ g, list: (all.get(g.id) || []).filter((s) => match(s) && inTab(tab, s.id, s)).sort((a, b) => Number(!b.reference) - Number(!a.reference) || Number(works(b)) - Number(works(a))) }))
    .filter((x) => x.list.length);

  // A site can read every silent capability the moment it loads, so the console does the same and
  // shows those readings as already logged. Only one-shot reads run here, never live streams.
  useEffect(() => {
    const auto = ctx.scopes.filter((s) => s.passive && !s.gesture && !s.modes?.stream && !s.modes?.create && works(s) && (getSession(s.id).count === 0 || !!getSession(s.id).restoredAt) && !isActive(getSession(s.id)));
    auto.forEach((s) => void request(s.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const logged = ctx.scopes.filter((s) => s.passive && getSession(s.id).count > 0).length;

  const runSilent = (list: ScopeDef[]) => list.filter((s) => s.passive && works(s) && !isActive(getSession(s.id))).forEach((s) => void request(s.id));

  return (
    <section className="box caps">
      <div className="box-h">
        <h3>Capabilities <em>{ctx.scopes.length}</em></h3>
        <div className="tabs">
          {TABS.map(([t, l]) => <button data-control={`caps.tab.${t}`} key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{l}<em>{counts[t]}</em></button>)}
        </div>
      </div>
      <div className="caps-tools">
        <label className="search"><Search size={14} /><input data-control="caps.search" ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search capabilities" /><kbd>/</kbd>{q && <button data-control="caps.search-clear" onClick={() => setQ("")} aria-label="Clear"><X size={13} /></button>}</label>
      </div>
      {logged > 0 && <div className="logged-note" title="Any site can read these on load without asking"><History size={13} /><span>{logged} read silently on load</span></div>}
      <div className="chips">
        <button data-control="caps.group.all" className={!group ? "on" : ""} onClick={() => setGroup(null)}>All groups</button>
        {groups.map((g) => { const I = g.icon; return <button data-control={`caps.group.${g.id}`} key={g.id} className={group === g.id ? "on" : ""} onClick={() => setGroup(group === g.id ? null : g.id)}>{I && <I size={13} />}{g.label}<em>{all.get(g.id)?.length}</em></button>; })}
      </div>
      <div className="caps-list">
        {visible.length === 0 && <div className="empty">{tab === "live" ? "Nothing is running." : tab === "blocked" ? "Nothing has been refused." : tab === "used" ? "Nothing has run yet." : tab === "ref" ? "Every entry has a live call." : "No match."}</div>}
        {visible.map(({ g, list }) => {
          const I = g.icon;
          const silent = list.filter((s) => s.passive && works(s)).length;
          return (
            <div key={g.id} className="cg">
              <div className="cg-h">
                {I && <I size={14} />}<b title={g.blurb}>{g.label}</b><em>{list.length}</em>
                {silent > 0 && <button data-control={`caps.group-run.${g.id}`} className="cg-run" onClick={() => runSilent(list)} title={`Run the ${silent} capabilities here that need no prompt`} aria-label={`Run ${silent} silent capabilities`}><Zap size={12} />{silent}</button>}
              </div>
              {list.map((s) => <Row key={s.id} scope={s} on={selected === s.id} ok={works(s)} ctx={ctx} />)}
            </div>
          );
        })}
      </div>
    </section>
  );
}

const Row = memo(function Row({ scope, on, ok, ctx }: { scope: ScopeDef; on: boolean; ok: boolean; ctx: ConsoleCtx }) {
  const s = useSession(scope.id);
  const active = isActive(s);
  const mech = mechanismOf(scope, ok ? undefined : "n");
  return (
    <div data-control={`caps.row.${scope.id}`} data-cap={scope.id} className={"row" + (on ? " on" : "") + (ok ? "" : " dim") + (active ? " live" : "")} onClick={() => ctx.select(scope.id)} title={scope.summary}>
      <span className="row-i"><CapIcon scope={scope} size={15} /><i className={"dot st-" + s.state} /></span>
      <span className="row-n">{scope.name}</span>
      <MechBadge mech={mech} />
      <RowSpark scope={scope} records={s.records} />
      <RowValue scope={scope} s={s} />
      <button data-control={`caps.row-run.${scope.id}`} className={"row-b" + (active ? " stop" : "")} onClick={(e) => { e.stopPropagation(); active ? stop(scope.id) : void request(scope.id); }} aria-label={active ? "Stop" : "Run"} title={active ? "Stop" : "Run"}>
        {active ? <Square size={11} /> : <Play size={11} />}
      </button>
    </div>
  );
});

/** A tiny trend of the first number the capability reports. */
function RowSpark({ scope, records }: { scope: ScopeDef; records: Rec[] }) {
  if (records.length < 3) return <span className="row-sp" />;
  const d = records[records.length - 1].data as Record<string, unknown>;
  // Only quantities trend. A label, a Yes/No or a set has no line to draw.
  const pm = primaryMetric(scope);
  if (scope.reference || !pm || !QUANT.has(pm.type || "ratio")) return <span className="row-sp" />;
  const key = scope.metrics?.find((m) => QUANT.has(m.type || "ratio") && typeof d[m.key] === "number")?.key;
  const vals = key ? series(records, key, 60) : [];
  return <span className="row-sp" title={key ? `Trend of ${key}` : undefined}>{vals.length > 2 && <Spark values={vals} w={46} h={16} />}</span>;
}
