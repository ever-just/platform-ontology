import { siGithub } from "simple-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollText, ChartLine, ChartArea, ChartColumn, WandSparkles, Rows2, Rows4, Sun, Moon, Contrast, Square, SlidersHorizontal, ChevronDown } from "lucide-react";
import type { Atlas, AtlasNode, ScopeDef } from "./core/types";
import { allSessions, isActive, registerScopes, stopAll } from "./core/harness";
import { feed, startTimeline, useTimeline } from "./core/timeline";
import { buildScopes } from "./scopes";
import { referenceScopes } from "./scopes/reference";
import { applyMeta } from "./scopes/meta";
import { detectProfile } from "./browser/profile";
import { collectPassive, type PassiveSignal } from "./real";
import { listGroups, listViews, onRegistryChange, pluginScopes, resolveGroup, OTHER, type ChartOpts, type ConsoleCtx, type GroupDef } from "./ext/registry";
import { registerBuiltins } from "./ext/builtins";
import { registerThisBrowser } from "./ext/this-browser";
import { registerLinks } from "./ext/links";
import { Capabilities } from "./ui/Capabilities";
import { Inspector } from "./ui/Inspector";
import { clock } from "./ui/charts";
import { Spark } from "./ui/kit";
import { LOOKS, setLook, useLook } from "./ui/look";
import { PrivacyDialog, PrivacyLink } from "./ui/Privacy";
import { RunAll } from "./ui/RunAll";
import { setVisit, startUploader } from "./core/uploader";

registerBuiltins();
registerThisBrowser();
registerLinks();
startUploader();

const RANGES: [number, string][] = [[60, "1m"], [300, "5m"], [900, "15m"], [3600, "1h"]];
const TYPES: [ChartOpts["type"], string, typeof ChartLine][] = [["auto", "Auto", WandSparkles], ["line", "Line", ChartLine], ["area", "Area", ChartArea], ["bars", "Bars", ChartColumn]];
const GROUPINGS: [ChartOpts["by"], string][] = [["auto", "Best fit"], ["group", "Group"], ["capability", "Capability"], ["access", "Access"]];
const PREFS = "po.chart";
const loadPrefs = (): Partial<ChartOpts> & { range?: number } => { try { return JSON.parse(localStorage.getItem(PREFS) || "{}"); } catch { return {}; } };
const readHash = () => decodeURIComponent(location.hash.replace(/^#/, ""));
const PRIVACY = "privacy";

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

function Console({ atlas }: { atlas: Atlas }) {
  const [regVer, setRegVer] = useState(0);
  useEffect(() => { const off = onRegistryChange(() => setRegVer((v) => v + 1)); return () => { off(); }; }, []);

  const scopes = useMemo(() => {
    const base = [...buildScopes(atlas.nodes), ...pluginScopes()];
    const list = applyMeta([...base, ...referenceScopes(base, atlas.nodes)]);
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
  useEffect(() => { setVisit(profile, passive); }, [profile, passive]);
  const [privacy, setPrivacy] = useState(() => readHash() === PRIVACY);
  useEffect(() => {
    const on = () => setPrivacy(true);
    const onHash = () => { if (readHash() === PRIVACY) setPrivacy(true); };
    window.addEventListener("po:privacy", on);
    window.addEventListener("hashchange", onHash);
    return () => { window.removeEventListener("po:privacy", on); window.removeEventListener("hashchange", onHash); };
  }, []);
  const closePrivacy = useCallback(() => {
    setPrivacy(false);
    if (readHash() === PRIVACY) history.replaceState(null, "", location.pathname + location.search);
  }, []);

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

  useEffect(() => {
    const on = () => { if (readHash() !== PRIVACY) setSelected(resolve(readHash())?.id || null); };
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

  const look = useLook();
  useTimeline(); // header and metrics refresh once a second
  const live = allSessions().filter(isActive).length;
  const current = views.find((v) => v.id === view) || views[0];
  const Panel = current?.Panel;
  const scope = selected ? scopes.find((s) => s.id === selected) || null : null;
  const lookIdx = Math.max(0, LOOKS.findIndex((l) => l.id === look));
  const nextLook = LOOKS[(lookIdx + 1) % LOOKS.length];
  const LookIcon = look === "light" ? Sun : look === "midnight" ? Moon : Contrast;

  return (
    <div className={"shell" + (scope ? " sheet-open" : "") + (chart.density === "compact" ? " dense" : "")}>
      <header className="bar">
        <div className="wrap bar-in">
          <a className="brand" href="../">Platform Ontology</a>
          <nav className="nav" aria-label="Sections">
            <a href="../">Docs</a>
            <a href="./" aria-current="page">Console</a>
            <a href="../wiki">Wiki</a>
          </nav>
          <span className="grow" />
          {live > 0 && (
            <button className="live-chip" onClick={stopAll} title="Stop every running capability">
              <span className="live-dot on" />{live} live<span className="live-x"><Square size={10} />Stop</span>
            </button>
          )}
          <RunAll ctx={ctx} />
          <button className="icon-b look-b" onClick={() => setLook(nextLook.id)} title={`Look: ${LOOKS[lookIdx]?.label}. Switch to ${nextLook.label}`} aria-label={`Switch look to ${nextLook.label}`}><LookIcon size={16} /></button>
          <a className="icon-b gh-b" href="https://github.com/ever-just/platform-ontology" target="_blank" rel="noreferrer" aria-label="Source on GitHub" title="Source on GitHub"><svg viewBox="0 0 24 24" width={16} height={16} aria-hidden="true"><path d={siGithub.path} fill="currentColor" /></svg></a>
        </div>
      </header>

      <main className="wrap main">
        <section className="box overview">
          <div className="kpis" role="tablist" aria-label="Views">
            {views.map((v) => {
              const m = v.metric(ctx);
              const on = v.id === current?.id;
              const showSpark = m.spark && m.spark.some((x) => x !== m.spark![0]);
              return (
                <button key={v.id} role="tab" aria-selected={on} title={m.sub} className={"kpi" + (on ? " on" : "")} onClick={() => setView(v.id)}>
                  <span className="kpi-l">{(m.tone === "err" || m.tone === "ok") && <i className={"kpi-dot " + m.tone} aria-hidden />}{v.label}</span>
                  <b>{m.value}{m.unit && <em>{m.unit}</em>}</b>
                  <span className="kpi-sp" aria-hidden>{showSpark && <Spark values={m.spark!} w={64} h={14} />}</span>
                </button>
              );
            })}
          </div>
          <div className="ov-tools">
            <h2>{current?.label}</h2>
            <span className="grow" />
            <div className="seg" role="group" aria-label="Time range">
              {RANGES.map(([r, l]) => <button key={r} className={range === r ? "on" : ""} onClick={() => setRange(r)}>{l}</button>)}
            </div>
            <details className="menu">
              <summary className="icon-b" title="Chart options" aria-label="Chart options"><SlidersHorizontal size={15} /></summary>
              <div className="menu-p">
                <span className="menu-h">Chart</span>
                <div className="seg full">
                  {TYPES.map(([t, l, I]) => <button key={t} className={chart.type === t ? "on" : ""} onClick={() => setChart({ type: t })} title={l + " chart"}><I size={13} />{l}</button>)}
                </div>
                <span className="menu-h">Group the list by</span>
                <div className="seg full">
                  {GROUPINGS.map(([g, l]) => <button key={g} className={chart.by === g ? "on" : ""} onClick={() => setChart({ by: g })}>{l}</button>)}
                </div>
                <span className="menu-h">Spacing</span>
                <div className="seg full">
                  <button className={chart.density !== "compact" ? "on" : ""} onClick={() => setChart({ density: "comfortable" })}><Rows2 size={13} />Roomy</button>
                  <button className={chart.density === "compact" ? "on" : ""} onClick={() => setChart({ density: "compact" })}><Rows4 size={13} />Compact</button>
                </div>
              </div>
            </details>
          </div>
          <div className="ov-body" key={current?.id}>
            {Panel && <Panel ctx={ctx} />}
          </div>
          <Activity ctx={ctx} />
        </section>

        <div className="duo">
          <Capabilities ctx={ctx} selected={selected} />
          <Inspector ctx={ctx} scope={scope} onClose={close} />
        </div>

        <footer className="foot">
          <span>Readings are stored with personal content removed. <PrivacyLink>Privacy notice</PrivacyLink></span>
          <span>{atlas.nodes.length} attributes, {atlas.browsers.length} browsers, built {atlas.built}</span>
        </footer>
      </main>
      <PrivacyDialog open={privacy} onClose={closePrivacy} />
    </div>
  );
}

/** The latest few events under the chart, so the picture and the log are always visible together. */
function Activity({ ctx }: { ctx: ConsoleCtx }) {
  const [open, setOpen] = useState(false);
  const rows = feed().slice(0, open ? 200 : 3);
  const name = (id: string) => ctx.scopes.find((s) => s.id === id)?.name || id;
  return (
    <div className={"act" + (open ? " open" : "")}>
      <div className="act-h">
        <ScrollText size={13} /><b>Activity</b>
        <span className="grow" />
        {feed().length > 3 && <button className="lnk" onClick={() => setOpen(!open)}>{open ? "Show less" : `Show all ${Math.min(feed().length, 200)}`}<ChevronDown size={13} className={open ? "flip" : ""} /></button>}
      </div>
      {!rows.length ? <div className="act-empty">Run a capability and each request, grant, reading and refusal appears here.</div> : (
        <div className="feed">
          {rows.map((l, i) => (
            <div key={l.t + ":" + i} className={"fe " + l.level}>
              <time>{clock(l.t)}</time>
              <button className="lnk" onClick={() => ctx.select(l.scope)}>{name(l.scope)}</button>
              <span>{l.msg}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
