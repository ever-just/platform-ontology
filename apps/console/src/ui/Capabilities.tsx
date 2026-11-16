import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Play, Square, Search, Zap, X } from "lucide-react";
import type { ScopeDef } from "../core/types";
import { getSession, isActive, request, stop, useSession } from "../core/harness";
import { useTimeline } from "../core/timeline";
import { supportOf } from "../browser/profile";
import { OTHER, type ConsoleCtx, type GroupDef } from "../ext/registry";
import { short } from "./charts";
import { CapIcon, LayerGlyph, MechBadge, ModeBadges, mechanismOf } from "./icons";

type Tab = "all" | "live" | "used" | "blocked";
const TABS: [Tab, string][] = [["all", "All"], ["live", "Live"], ["used", "Used"], ["blocked", "Blocked"]];
const BLOCKED = new Set(["denied", "unsupported", "error"]);

function inTab(tab: Tab, id: string) {
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
  const counts = Object.fromEntries(TABS.map(([t]) => [t, ctx.scopes.filter((s) => inTab(t, s.id)).length]));
  const visible = groups
    .filter((g) => !group || g.id === group)
    .map((g) => ({ g, list: (all.get(g.id) || []).filter((s) => match(s) && inTab(tab, s.id)).sort((a, b) => Number(works(b)) - Number(works(a))) }))
    .filter((x) => x.list.length);

  const runSilent = (list: ScopeDef[]) => list.filter((s) => s.passive && works(s) && !isActive(getSession(s.id))).forEach((s) => void request(s.id));

  return (
    <section className="box caps">
      <div className="box-h">
        <h3>Capabilities <em>{ctx.scopes.length}</em></h3>
        <div className="tabs">
          {TABS.map(([t, l]) => <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{l}<em>{counts[t]}</em></button>)}
        </div>
      </div>
      <div className="caps-tools">
        <label className="search"><Search size={14} /><input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search capabilities" /><kbd>/</kbd>{q && <button onClick={() => setQ("")} aria-label="Clear"><X size={13} /></button>}</label>
      </div>
      <div className="chips">
        <button className={!group ? "on" : ""} onClick={() => setGroup(null)}>All groups</button>
        {groups.map((g) => { const I = g.icon; return <button key={g.id} className={group === g.id ? "on" : ""} onClick={() => setGroup(group === g.id ? null : g.id)}>{I && <I size={13} />}{g.label}<em>{all.get(g.id)?.length}</em></button>; })}
      </div>
      <div className="caps-list">
        {visible.length === 0 && <div className="empty">{tab === "live" ? "Nothing is running." : tab === "blocked" ? "Nothing has been refused." : tab === "used" ? "Nothing has run yet." : "No match."}</div>}
        {visible.map(({ g, list }) => {
          const I = g.icon;
          const silent = list.filter((s) => s.passive && works(s)).length;
          return (
            <div key={g.id} className="cg">
              <div className="cg-h">
                {I && <I size={14} />}<b>{g.label}</b><span>{g.blurb}</span>
                {silent > 0 && <button className="cg-run" onClick={() => runSilent(list)} title="Run every capability in this group that needs no prompt"><Zap size={12} />Run {silent} silent</button>}
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
    <div className={"row" + (on ? " on" : "") + (ok ? "" : " dim")} onClick={() => ctx.select(scope.id)}>
      <span className="row-i"><CapIcon scope={scope} size={15} /><i className={"dot st-" + s.state} /></span>
      <span className="row-n">{scope.name}</span>
      <span className="row-k"><ModeBadges modes={scope.modes} compact /><LayerGlyph layer={scope.layer} /></span>
      <MechBadge mech={mech} />
      <span className="row-v">{active && s.hz ? s.hz.toFixed(1) + " Hz" : s.count ? short(s.count) : ""}</span>
      <button className={"row-b" + (active ? " stop" : "")} onClick={(e) => { e.stopPropagation(); active ? stop(scope.id) : void request(scope.id); }} aria-label={active ? "Stop" : "Run"} title={active ? "Stop" : "Run"}>
        {active ? <Square size={11} /> : <Play size={11} />}
      </button>
    </div>
  );
});
