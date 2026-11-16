import { useEffect, useMemo, useState } from "react";
import { Layers, Square, BookOpen, List, Activity, Code2, Share2 } from "lucide-react";
import type { Atlas, ScopeDef } from "./core/types";
import { allSessions, isActive, registerScopes, stopAll, useSession, useVersion } from "./core/harness";
import { buildScopes } from "./scopes";
import { Sidebar } from "./ui/Sidebar";
import { ApiPanel } from "./ui/ApiPanel";
import { MapView } from "./ui/MapView";
import { FlowView } from "./ui/FlowView";
import { Overlay } from "./ui/Overlay";
import { Telemetry } from "./ui/Telemetry";
import { DOMAIN_COLOR } from "./ui/kit";
import { YourBrowser, BrowserLive } from "./ui/YourBrowser";
import { detectProfile, supportOf } from "./browser/profile";

type Tab = "instrument" | "map" | "flow";
type Mob = "scopes" | "stage" | "api" | "map";

function readHash() {
  return decodeURIComponent(location.hash.replace(/^#/, ""));
}

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
  if (!atlas) return <div className="boot"><span className="waiting-dot" />Loading the atlas</div>;
  return <Console atlas={atlas} />;
}

function Console({ atlas }: { atlas: Atlas }) {
  const scopes = useMemo(() => {
    const list = buildScopes(atlas.nodes);
    registerScopes(list);
    return list;
  }, [atlas]);
  const byAtlas = useMemo(() => {
    const m = new Map<string, ScopeDef>();
    scopes.forEach((s) => s.atlas.forEach((a) => !m.has(a) && m.set(a, s)));
    return m;
  }, [scopes]);
  const resolve = (h: string) => scopes.find((s) => s.id === h) || byAtlas.get(h);
  const profile = useMemo(detectProfile, []);
  const [view, setView] = useState<"browser" | "scope">(() => (resolve(readHash()) ? "scope" : "browser"));
  const nodeOf = (s: ScopeDef) => atlas.nodes.find((n) => n.i === s.atlas[0]);
  const works = (s: ScopeDef) => { const n = nodeOf(s); return !n || "yp".includes(supportOf(n.sup, profile.column)); };
  const firstSupported = scopes.find((s) => s.passive && works(s))?.id || scopes.find(works)?.id || scopes[0].id;
  const [selected, setSelected] = useState(() => resolve(readHash())?.id || firstSupported);
  const [tab, setTab] = useState<Tab>("instrument");
  const [overlay, setOverlay] = useState(true);
  const [mob, setMob] = useState<Mob>("stage");
  const showBrowser = () => { setView("browser"); setMob("stage"); history.replaceState(null, "", location.pathname + location.search); };

  useEffect(() => {
    const on = () => {
      const s = resolve(readHash());
      if (s) { setSelected(s.id); setView("scope"); } else if (!readHash()) setView("browser");
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopes]);

  const select = (id: string) => {
    setSelected(id);
    setView("scope");
    if (location.hash !== "#" + id) history.replaceState(null, "", "#" + id);
    if (tab === "map") setTab("instrument");
    setMob("stage");
  };

  useVersion();
  const scope = scopes.find((s) => s.id === selected) || scopes[0];
  const session = useSession(scope.id);
  const node = atlas.nodes.find((n) => n.i === scope.atlas[0]);
  const liveCount = allSessions().filter(isActive).length;
  const Inst = scope.Instrument;
  const c = DOMAIN_COLOR[scope.domain];

  return (
    <div className={"app mob-" + mob + (profile.touch && profile.coarse ? " touch" : "")}>
      <header className="top">
        <div className="brand">
          <svg width="20" height="20" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#0b0b0c" /><circle cx="16" cy="16" r="8" fill="none" stroke="#fff" strokeWidth="2.5" /><circle cx="16" cy="16" r="3" fill="#1f4bff" /></svg>
          <b>Platform.Ontology</b><span>Console</span>
        </div>
        <div className="top-r">
          <span className="top-live"><i className={liveCount ? "on" : ""} />{liveCount} live</span>
          <button className={"tbtn" + (overlay ? " on" : "")} onClick={() => setOverlay(!overlay)} title="Show the access path, metrics and what the data reveals on top of the instrument"><Layers size={14} /> Overlay</button>
          <button className="tbtn" onClick={stopAll} disabled={!liveCount}><Square size={13} /> Stop all</button>
          <a className="tbtn ghost" href="../"><BookOpen size={14} /> <span className="hide-s">Docs</span></a>
        </div>
      </header>

      <Sidebar atlas={atlas} scopes={scopes} selected={view === "browser" ? "" : scope.id} onSelect={select} profile={profile} browserOn={view === "browser"} onBrowser={showBrowser} />

      {view === "browser" ? (
        <main className="stage">
          <div className="stage-h"><div className="stage-t"><h1>This browser</h1><span className="chip-dom" style={{ color: "#1f4bff", borderColor: "#1f4bff40", background: "#1f4bff0d" }}>{profile.columnLabel}</span><span className="pill st-streaming">live</span></div></div>
          <div className="stage-body"><YourBrowser atlas={atlas} profile={profile} onSelect={select} firstSupported={firstSupported} /></div>
        </main>
      ) : (
      <main className="stage">
        <div className="stage-h">
          <div className="stage-t">
            <h1>{scope.name}</h1>
            <span className="chip-dom" style={{ color: c, borderColor: c + "40", background: c + "0d" }}>{atlas.domains.find((d) => d.id === scope.domain)?.short}</span>
            <code className="stage-id">{scope.id}</code>
            <span className={"pill st-" + session.state}>{session.state}</span>
          </div>
          <div className="stage-tabs">
            {(["instrument", "map", "flow"] as const).map((t) => (
              <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t === "instrument" ? "Instrument" : t === "map" ? "Map" : "Flow"}</button>
            ))}
          </div>
        </div>
        <p className="stage-sum">{scope.summary}</p>
        <div className="stage-body">
          {tab === "instrument" && (
            <div className="inst">
              {overlay && <Overlay scope={scope} session={session} />}
              <div className="inst-body"><Inst scope={scope} session={session} /></div>
            </div>
          )}
          {tab === "map" && <MapView atlas={atlas} scopes={scopes} selected={scope.id} onSelect={select} />}
          {tab === "flow" && <FlowView scopes={scopes} selected={scope.id} onSelect={select} />}
        </div>
      </main>
      )}

      {view === "browser" ? <BrowserLive profile={profile} atlas={atlas} /> : <ApiPanel scope={scope} session={session} node={node} />}

      <div className="mapfull">{mob === "map" && <MapView atlas={atlas} scopes={scopes} selected={scope.id} onSelect={select} />}</div>

      <Telemetry atlas={atlas} scopes={scopes} onSelect={select} />

      <nav className="mnav">
        {([["scopes", List, "Scopes"], ["stage", Activity, "Instrument"], ["api", Code2, view === "browser" ? "Hood" : "API"], ["map", Share2, "Map"]] as const).map(([k, I, l]) => (
          <button key={k} className={mob === k ? "on" : ""} onClick={() => setMob(k)}><I size={18} /><span>{l}</span></button>
        ))}
      </nav>
    </div>
  );
}
