import { useCallback, useEffect, useMemo, useState } from "react";
import { Square, BookOpen, Rows3, ScrollText, ChartLine, ChartArea, ChartColumn, WandSparkles, Rows2, Rows4, TrendingUp, TrendingDown } from "lucide-react";
import type { Atlas, AtlasNode, ScopeDef } from "./core/types";
import { allSessions, isActive, registerScopes, stopAll } from "./core/harness";
import { feed, startTimeline, useTimeline } from "./core/timeline";
import { buildScopes } from "./scopes";
import { applyMeta } from "./scopes/meta";
import { detectProfile } from "./browser/profile";
import { collectPassive, type PassiveSignal } from "./real";
import { listGroups, listViews, onRegistryChange, pluginScopes, resolveGroup, OTHER, type ChartOpts, type ConsoleCtx, type GroupDef } from "./ext/registry";
import { registerBuiltins } from "./ext/builtins";
import { Capabilities } from "./ui/Capabilities";
import { Inspector } from "./ui/Inspector";
import { clock } from "./ui/charts";
import { Spark } from "./ui/kit";

registerBuiltins();

const RANGES: [number, string][] = [[60, "1m"], [300, "5m"], [900, "15m"], [3600, "1h"]];
const TYPES: [ChartOpts["type"], string, typeof ChartLine][] = [["auto", "Auto", WandSparkles], ["line", "Line", ChartLine], ["area", "Area", ChartArea], ["bars", "Bars", ChartColumn]];
const GROUPINGS: [ChartOpts["by"], string][] = [["auto", "Best fit"], ["group", "Group"], ["capability", "Capability"], ["access", "Access"]];
const PREFS = "po.chart";
const loadPrefs = (): Partial<ChartOpts> & { range?: number } => { try { return JSON.parse(localStorage.getItem(PREFS) || "{}"); } catch { return {}; } };
const readHash = () => decodeURIComponent(location.hash.replace(/^#/, ""));

export function App() {
  const [atlas, setAtlas] = useState<Atlas | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/console.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setAtlas)
      .catch((e) => setErr(String(e)));
  }, []);
  if (err) return <div className="boot">Could not load the atlas: {err}</div>;
  if (!atlas) return <div className="boot"><span className="waiting-dot" />Loading</div>;
  return <Console atlas={atlas} />;
}

function Logo() {
  return <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden><rect width="32" height="32" rx="8" fill="var(--ink)" /><circle cx="16" cy="16" r="8" fill="none" stroke="var(--bg)" strokeWidth="2.5" /><circle cx="16" cy="16" r="3" fill="var(--accent)" /></svg>;
}

function Console({ atlas }: { atlas: Atlas }) {
  const [regVer, setRegVer] = useState(0);
  useEffect(() => { const off = onRegistryChange(() => setRegVer((v) => v + 1)); return () => { off(); }; }, []);

  const scopes = useMemo(() => {
    const list = applyMeta([...buildScopes(atlas.nodes), ...pluginScopes()]);
    registerScopes(list);
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atlas, regVer]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const groups = useMemo(() => listGroups(), [regVer]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const views = useMemo(() => listViews(), [regVer]);
  const profile = useMemo(detectProfile, []);
  const [passive, setPassive] = useState<PassiveSignal[] | null>(null);
  useEffect(() => { startTimeline(); collectPassive().then(setPassive).catch(() => setPassive([])); }, []);

  const nodeById = useMemo(() => new Map(atlas.nodes.map((n) => [n.i, n])), [atlas]);
  const byAtlas = useMemo(() => {
    const m = new Map<string, ScopeDef>();
    scopes.forEach((s) => s.atlas.forEach((a) => !m.has(a) && m.set(a, s)));
    return m;
  }, [scopes]);
  const groupMap = useMemo(() => {
    const m = new Map<string, GroupDef>();
    scopes.forEach((s) => m.set(s.id, resolveGroup(s, nodeById.get(s.atlas[0]), groups)));
    return m;
  }, [scopes, groups, nodeById]);

  const resolve = useCallback((h: string) => scopes.find((s) => s.id === h) || byAtlas.get(h), [scopes, byAtlas]);
  const [selected, setSelected] = useState<string | null>(() => resolve(readHash())?.id || null);
  const [view, setView] = useState(() => views[0]?.id || "silent");
  const [prefs] = useState(loadPrefs);
  const [range, setRange] = useState(prefs.range || 300);
  const [chart, setChartState] = useState<ChartOpts>({ type: prefs.type || "auto", by: prefs.by || "auto", density: prefs.density || "comfortable" });
  const setChart = (p: Partial<ChartOpts>) => setChartState((c) => ({ ...c, ...p }));
  useEffect(() => { try { localStorage.setItem(PREFS, JSON.stringify({ ...chart, range })); } catch { /* private mode */ } }, [chart, range]);
  const [showFeed, setShowFeed] = useState(false);

  useEffect(() => {
    const on = () => setSelected(resolve(readHash())?.id || null);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, [resolve]);

  const select = useCallback((id: string) => {
    setSelected(id);
    if (location.hash !== "#" + id) history.replaceState(null, "", "#" + id);
  }, []);
  const close = useCallback(() => { setSelected(null); history.replaceState(null, "", location.pathname + location.search); }, []);

  const ctx: ConsoleCtx = useMemo(() => ({
    atlas, scopes, profile, passive, groups, range, chart, select,
    groupOf: (id) => groupMap.get(id) || OTHER,
    groupOfNode: (n: AtlasNode) => {
      const s = byAtlas.get(n.i);
      if (s) return groupMap.get(s.id) || OTHER;
      return groups.find((g) => g.atlasGroups?.includes(n.g)) || OTHER;
    },
    nodeOf: (s) => nodeById.get(s.atlas[0]),
  }), [atlas, scopes, profile, passive, groups, range, chart, select, groupMap, byAtlas, nodeById]);

  useTimeline(); // header and metrics refresh once a second
  const live = allSessions().filter(isActive).length;
  const current = views.find((v) => v.id === view) || views[0];
  const Panel = current?.Panel;
  const scope = selected ? scopes.find((s) => s.id === selected) || null : null;

  return (
    <div className={"shell" + (scope ? " sheet-open" : "") + (chart.density === "compact" ? " dense" : "")}>
      <header className="bar">
        <div className="wrap bar-in">
          <a className="brand" href="./"><Logo /><b>Platform.Ontology</b><span>Console</span></a>
          <div className="bar-r">
            <span className={"live" + (live ? " on" : "")}><i />{live} live</span>
            <button className="btn" onClick={stopAll} disabled={!live}><Square size={12} />Stop all</button>
            <a className="btn ghost" href="../"><BookOpen size={14} /><span className="hide-s">Docs</span></a>
          </div>
        </div>
      </header>

      <main className="wrap main">
        <section className="box overview">
          <div className="kpis" role="tablist">
            {views.map((v) => {
              const m = v.metric(ctx);
              return (
                <button key={v.id} role="tab" aria-selected={v.id === current?.id} className={"kpi" + (v.id === current?.id ? " on" : "") + (m.tone ? " t-" + m.tone : "")} onClick={() => setView(v.id)}>
                  <span>{v.label}</span>
                  <b>{m.value}{m.unit && <em>{m.unit}</em>}</b>
                  <span className="kpi-f">
                    {m.delta ? <i className={"kpi-d " + (m.delta > 0 ? "up" : "down")}>{m.delta > 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{m.delta > 0 ? "+" : ""}{m.delta}</i> : null}
                    {m.sub && <small>{m.sub}</small>}
                  </span>
                  {m.spark && m.spark.some((v) => v !== m.spark![0]) && <span className="kpi-sp" aria-hidden><Spark values={m.spark} w={72} h={18} fill /></span>}
                </button>
              );
            })}
          </div>
          <div className="ov-tools">
            <h2>{showFeed ? "Event log" : current?.label}</h2>
            <span className="grow" />
            {!showFeed && (
              <div className="ov-ctl">
                <div className="seg" role="group" aria-label="Chart type">
                  {TYPES.map(([t, l, I]) => <button key={t} className={chart.type === t ? "on" : ""} onClick={() => setChart({ type: t })} title={l + " chart"} aria-label={l + " chart"}><I size={13} /><span className="hide-s">{l}</span></button>)}
                </div>
                <label className="sel" title="Group the list beside the chart">
                  <span>By</span>
                  <select value={chart.by} onChange={(e) => setChart({ by: e.target.value as ChartOpts["by"] })}>
                    {GROUPINGS.map(([g, l]) => <option key={g} value={g}>{l}</option>)}
                  </select>
                </label>
                <div className="seg" role="group" aria-label="Time range">
                  {RANGES.map(([r, l]) => <button key={r} className={range === r ? "on" : ""} onClick={() => setRange(r)}>{l}</button>)}
                </div>
                <button className="btn sm icon" onClick={() => setChart({ density: chart.density === "compact" ? "comfortable" : "compact" })} title={chart.density === "compact" ? "Roomy layout" : "Compact layout"} aria-label="Toggle density">{chart.density === "compact" ? <Rows2 size={13} /> : <Rows4 size={13} />}</button>
              </div>
            )}
            <button className={"btn sm" + (showFeed ? " on" : "")} onClick={() => setShowFeed(!showFeed)}>{showFeed ? <Rows3 size={13} /> : <ScrollText size={13} />}{showFeed ? "Chart" : "Event log"}</button>
          </div>
          <div className="ov-body">
            {showFeed ? <Feed ctx={ctx} /> : Panel && <Panel ctx={ctx} />}
          </div>
        </section>

        <div className="duo">
          <Capabilities ctx={ctx} selected={selected} />
          <Inspector ctx={ctx} scope={scope} onClose={close} />
        </div>

        <footer className="foot">
          <span>Everything here runs in this tab. Nothing is sent anywhere.</span>
          <span>{atlas.nodes.length} attributes across {atlas.browsers.length} browsers, built {atlas.built}</span>
        </footer>
      </main>
    </div>
  );
}

function Feed({ ctx }: { ctx: ConsoleCtx }) {
  const rows = feed().slice(0, 200);
  const name = (id: string) => ctx.scopes.find((s) => s.id === id)?.name || id;
  if (!rows.length) return <div className="bl-empty pad">No events yet. Run a capability and every request, grant, record and refusal shows up here.</div>;
  return (
    <div className="feed big">
      {rows.map((l, i) => (
        <div key={i} className={"fe " + l.level}>
          <time>{clock(l.t)}</time>
          <button className="lnk" onClick={() => ctx.select(l.scope)}>{name(l.scope)}</button>
          <span>{l.msg}</span>
        </div>
      ))}
    </div>
  );
}
