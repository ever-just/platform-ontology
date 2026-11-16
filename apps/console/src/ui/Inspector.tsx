import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./inspector.css";
import { HistoryChart } from "./history-view";
import { Replay } from "./replay";
import { TradeChart } from "./trade";
import { OtelPanel } from "./otel-panel";
import { AccessRows, DepChips, FieldMeanings, LogTimeline, Provenance, Reveals } from "./inspector-views";
import { Play, Square, Copy, X, ShieldCheck, TriangleAlert, ArrowLeft, Layers, Ban, FlaskConical, RotateCw } from "lucide-react";
import { gate, type Gate } from "./runall-gate";
import { useAvailability } from "../scopes/reference";
import type { AtlasNode } from "../core/types";
import type { Profile } from "../browser/profile";
import type { ScopeDef, Session } from "../core/types";
import { isActive, request, setParam, setSource, stop, useSession } from "../core/harness";
import { useInternals } from "../browser/engine";
import type { ConsoleCtx } from "../ext/registry";
import { fmt } from "./kit";
import { CapIcon, MECH, MODES, SupportMatrix, mechanismOf } from "./icons";
import { supportOf } from "../browser/profile";
import { PrivacyLink } from "./Privacy";
import { useDeps } from "../core/deps";
import { DependsOn } from "./deps-graph";

type Tab = "live" | "record" | "about" | "log";
const TABS: { id: Tab; label: string }[] = [{ id: "live", label: "Live" }, { id: "record", label: "Record" }, { id: "about", label: "About" }, { id: "log", label: "Log" }];

const LAYERS: Record<number, string> = { 1: "Insightful on its own", 2: "Joined with its group", 3: "Joined across groups" };
const TONE: Record<string, string> = { streaming: "ok", granted: "ok", requesting: "warn", denied: "err", unsupported: "err", error: "err" };

const WHY_TITLE: Record<string, string> = { missing: "Not available here", blocked: "Blocked for this site", policy: "Turned off by this site", device: "This device cannot do it", insecure: "Needs a secure page" };
const WHY_FIX: Record<string, string> = {
  missing: "Try a browser that supports it, or use Simulated to see how it behaves.",
  blocked: "Open site settings (the icon left of the address), allow it, then check again.",
  policy: "The page owner has to allow it in the Permissions-Policy header.",
  device: "Try it on a device that has the hardware, or use Simulated.",
  insecure: "Open the console over https.",
};

/** undefined while checking, null when it can run here, otherwise why it cannot. */
function useGate(scope: ScopeDef, node: AtlasNode | undefined, profile: Profile, tick: number): Gate | undefined {
  const a = useAvailability(scope.reference ? node : undefined);
  const [g, setG] = useState<Gate | undefined>(undefined);
  useEffect(() => {
    if (scope.reference) return;
    let off = false;
    setG(undefined);
    gate(scope, node, profile).then((r) => { if (!off) setG(r); }).catch(() => { if (!off) setG(null); });
    return () => { off = true; };
  }, [scope, node, profile, tick]);
  if (!scope.reference) return g;
  if (!a) return undefined;
  if (a.release === "not-exposed") return { why: "missing", text: "No browser gives this to a web page. It is listed for reference only." };
  if (a.detect === "absent") return { why: "missing", text: `This browser does not have it (${a.via} is missing).` };
  if (a.permission === "denied") return { why: "blocked", text: "Blocked for this site." };
  return null;
}

function snippet(scope: ScopeDef, s: Session) {
  const p = Object.keys(s.params).length ? `, ${JSON.stringify(s.params)}` : "";
  return `const stream = await po.request("${scope.id}"${p});\nstream.on("record", ({ seq, t, data }) => render(data));\n// later: po.stop("${scope.id}")`;
}

function json(v: unknown) {
  const text = JSON.stringify(v, (_k, x) => (typeof x === "number" && !Number.isInteger(x) ? Number(x.toFixed(3)) : x), 2) || "";
  return text.length > 3000 ? text.slice(0, 3000) + "\n..." : text;
}

export function Inspector({ ctx, scope, onClose }: { ctx: ConsoleCtx; scope: ScopeDef | null; onClose: () => void }) {
  // Opening a dependency replaces the panel content; a trail lets the back arrow return to where you were.
  const [trail, setTrail] = useState<string[]>([]);
  const via = useRef<"dep" | "back" | null>(null);
  const cur = useRef<string | null>(null);
  const id = scope?.id ?? null;
  useEffect(() => {
    if (via.current === null) setTrail([]);
    via.current = null;
    cur.current = id;
  }, [id]);
  const open = useCallback((to: string) => {
    if (cur.current) { const from = cur.current; setTrail((t) => [...t.slice(-8), from]); }
    via.current = "dep";
    ctx.select(to);
  }, [ctx]);
  const back = trail.length ? () => { const to = trail[trail.length - 1]; setTrail((t) => t.slice(0, -1)); via.current = "back"; ctx.select(to); } : undefined;
  const backName = back ? ctx.scopes.find((x) => x.id === trail[trail.length - 1])?.name : undefined;
  return (
    <section className={"box ins" + (scope ? " open" : "")}>
      {scope ? <ScopeInspector key={scope.id} ctx={ctx} scope={scope} onClose={onClose} open={open} back={back} backName={backName} /> : <BrowserSummary ctx={ctx} />}
    </section>
  );
}

function ScopeInspector({ ctx, scope, onClose, open, back, backName }: { ctx: ConsoleCtx; scope: ScopeDef; onClose: () => void; open: (id: string) => void; back?: () => void; backName?: string }) {
  const session = useSession(scope.id);
  const [tab, setTab] = useState<Tab>("live");
  const [view, setView] = useState<"now" | "chart" | "replay">("now");
  const active = isActive(session);
  const node = ctx.nodeOf(scope);
  const group = ctx.groupOf(scope.id);
  const Inst = scope.Instrument;
  const code = snippet(scope, session);
  const mech = mechanismOf(scope, node ? supportOf(node.sup, ctx.profile.column) : undefined);
  const M = MECH[mech];
  const deps = useDeps(scope, ctx);
  const modes = MODES.filter((m) => scope.modes?.[m.id]);
  const subCtx = useMemo<ConsoleCtx>(() => ({ ...ctx, select: open }), [ctx, open]);
  const [tick, setTick] = useState(0);
  const g = useGate(scope, node, ctx.profile, tick);
  const cannot = !!g && !active && session.source !== "sim";
  const canSim = !scope.reference;
  return (
    <div className="i-root">
      <div className="ins-h">
        <span className="ins-i"><CapIcon scope={scope} size={19} /></span>
        <div className="ins-t">
          <span className="ins-g">{group.label}</span>
          <h3>{scope.name}</h3>
          <p>{scope.summary}</p>
          <div className="ins-meta">
            <span className="mm" title={`${M.label}: ${M.plain}`}><M.Icon size={13} />{M.label}</span>
            {modes.length > 0 && <span className="mm-sep" />}
            <span className="mm-modes">{modes.map((m) => <span key={m.id} className="mm" title={`${m.label}: ${scope.modes![m.id]}`} aria-label={`${m.label}: ${scope.modes![m.id]}`}><m.Icon size={13} /></span>)}</span>
          </div>
        </div>
        <div className="ins-hb">
          {back && <button className="icon-b ins-back" onClick={back} title={backName ? `Back to ${backName}` : "Back"} aria-label="Back"><ArrowLeft size={16} /></button>}
          <button className="icon-b ins-x" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
      </div>
      {cannot ? (
      <div className="ins-ctl ins-na" data-why={g!.why}>
        <span className="ins-na-i"><Ban size={15} /></span>
        <div className="ins-na-t">
          <b>{WHY_TITLE[g!.why]}</b>
          <span>{g!.why === "blocked" ? "" : g!.text + " "}{scope.reference ? (/reference only/.test(g!.text) ? "" : g!.why === "blocked" ? WHY_FIX.blocked : "Try a browser that supports it.") : WHY_FIX[g!.why]}</span>
        </div>
        <div className="ins-na-b">
          {g!.why === "blocked" && <button className="btn" onClick={() => setTick((t) => t + 1)}><RotateCw size={12} />Check again</button>}
          {canSim && <button className="btn" onClick={() => { setSource(scope.id, "sim"); void request(scope.id); }}><FlaskConical size={12} />Simulate</button>}
        </div>
      </div>
      ) : (
      <div className="ins-ctl">
        <span className="ins-st" data-tone={TONE[session.state] || "mute"} data-state={session.state}><i />{session.state}</span>
        {!scope.reference && <div className="seg">
          <button className={session.source === "live" ? "on" : ""} onClick={() => setSource(scope.id, "live")}>Live</button>
          <button className={session.source === "sim" ? "on" : ""} onClick={() => setSource(scope.id, "sim")}>Simulated</button>
        </div>}
        <span className="grow" />
        {active
          ? <button className="btn" onClick={() => stop(scope.id)}><Square size={12} />Stop</button>
          : g === undefined && session.source !== "sim"
            ? <button className="btn" disabled><Play size={12} />Checking</button>
            : <button className="btn pri" onClick={() => void request(scope.id)}><Play size={12} />{scope.reference ? "Check availability" : session.source === "sim" ? "Run simulated" : scope.passive ? "Run" : "Request access"}</button>}
      </div>
      )}
      <div className="tabs line" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
            {t.label}{t.id === "log" && session.logs.length > 0 && <em>{session.logs.length}</em>}
          </button>
        ))}
      </div>
      <div className="ins-b">
        {tab === "live" && (
          <div className="i-tab" key={"live-" + view}>
            <div className="i-sub">
              <div className="seg" role="group" aria-label="View">
                <button className={view === "now" ? "on" : ""} onClick={() => setView("now")}>Now</button>
                <button className={view === "chart" ? "on" : ""} onClick={() => setView("chart")}>Chart</button>
                <button className={view === "replay" ? "on" : ""} onClick={() => setView("replay")}>Replay</button>
              </div>
            </div>
            {view === "now" ? <div className="ins-data"><Inst scope={scope} session={session} /></div> : view === "chart" ? <div className="ins-pad"><div className="tr-chartview"><TradeChart scope={scope} session={session} /></div></div> : <div className="ins-pad"><Replay scope={scope} session={session} /></div>}
          </div>
        )}
        {tab === "record" && (
          <div className="ins-pad i-tab" key="record">
            <div className="mets">
              <div><span>Sequence</span><b>{session.last?.seq ?? 0}</b></div>
              <div><span>Rate</span><b>{session.hz ? session.hz.toFixed(1) : "0"}<em> Hz</em></b></div>
              <div><span>To first record</span><b>{session.firstAt && session.startedAt ? session.firstAt - session.startedAt : "n/a"}<em> ms</em></b></div>
              {(scope.metrics || []).slice(0, 3).map((m) => (
                <div key={m.key}><span>{m.label}</span><b>{session.last ? fmt((session.last.data as any)[m.key], m.digits ?? 2) : "n/a"}{m.unit && <em> {m.unit}</em>}</b></div>
              ))}
            </div>
            <h5>Change over time</h5>
            <HistoryChart scope={scope} session={session} />
            <h5>Where it comes from</h5>
            <Provenance scope={scope} session={session} mech={mech} />
            <h5>What each value means</h5>
            <FieldMeanings scope={scope} session={session} node={node} />
            <details className="raw"><summary>Raw record</summary><pre className="code">{session.last ? json(session.last) : "// Run it to see the normalized record.\n// Every capability returns { seq, t, data }."}</pre></details>
            <h5>OpenTelemetry</h5>
            <OtelPanel scope={scope} session={session} />
          </div>
        )}
        {tab === "about" && (
          <div className="ins-pad i-tab" key="about">
            <section className="i-sec">
              <h5>What it reveals</h5>
              <Reveals items={scope.reveals} />
            </section>
            {node && (
              <section className="i-sec">
                <h5>Browser support</h5>
                <SupportMatrix sup={node.sup} me={ctx.profile.column} />
              </section>
            )}
            <section className="i-sec">
              <h5>Access</h5>
              <AccessRows scope={scope} session={session} node={node} mech={mech} />
              <dl className="i-dl">
                {scope.layer && <><dt>Layer</dt><dd><Layers size={13} className="ic" />L{scope.layer} <span>{LAYERS[scope.layer]}</span></dd></>}
                {modes.length > 0 && <><dt>Modes</dt><dd>{modes.map((m) => <div key={m.id}><m.Icon size={13} className="ic" />{m.label} <span>{scope.modes![m.id]}</span></div>)}</dd></>}
              </dl>
            </section>
            <section className="i-sec">
              <h5>Depends on <em>{deps.reqs.length}</em></h5>
              <DepChips ctx={subCtx} info={deps} />
              <details className="more"><summary>Graph and reasons</summary><DependsOn scope={scope} ctx={subCtx} info={deps} /></details>
              {scope.params && scope.params.length > 0 && (
                <>
                  <h6>Options</h6>
                  <div className="params">
                    {scope.params.map((p) => (
                      <label key={p.key} title={p.hint}>
                        <span>{p.label}</span>
                        {p.type === "bool" ? <input type="checkbox" checked={!!session.params[p.key]} onChange={(e) => setParam(scope.id, p.key, e.target.checked)} />
                          : p.type === "number" ? <input type="number" min={p.min} max={p.max} step={p.step || 1} value={Number(session.params[p.key])} onChange={(e) => setParam(scope.id, p.key, Number(e.target.value))} />
                          : <select value={String(session.params[p.key])} onChange={(e) => setParam(scope.id, p.key, e.target.value)}>{p.options.map((o) => <option key={o}>{o}</option>)}</select>}
                      </label>
                    ))}
                  </div>
                </>
              )}
            </section>
            <section className="i-sec">
              <h5>Call it</h5>
              <details className="more">
                <summary>Show code</summary>
                <div className="snip"><button className="icon-b" title="Copy" aria-label="Copy code" onClick={() => navigator.clipboard?.writeText(code).catch(() => {})}><Copy size={12} /></button><pre className="code">{code}</pre></div>
              </details>
              <p className="fine">Atlas {scope.atlas.map((a) => <a key={a} href={`../#${a}`}>{a}</a>)}</p>
            </section>
          </div>
        )}
        {tab === "log" && (
          <div className="ins-pad i-tab" key="log">
            <LogTimeline session={session} />
          </div>
        )}
      </div>
    </div>
  );
}

function BrowserSummary({ ctx }: { ctx: ConsoleCtx }) {
  const p = ctx.profile;
  const i = useInternals(true);
  const rows: [string, string][] = [
    ["Engine", p.engine], ["System", `${p.os} ${p.osVersion}`.trim()], ["Device", `${p.device}, ${p.touch ? "touch" : "pointer"}`],
    ["CPU threads", String(i.cores ?? "n/a")], ["Memory", i.memGB ? i.memGB + " GB" : "hidden"],
    ["GPU", i.gpu?.renderer?.replace(/ANGLE \(|\)/g, "").slice(0, 40) ?? "n/a"],
    ["Screen", `${i.viewport.sw} x ${i.viewport.sh} at ${i.viewport.dpr}x`], ["Viewport", `${i.viewport.w} x ${i.viewport.h}`],
    ["Link", `${i.net.type}${i.net.down ? `, ${i.net.down} Mb/s` : ""}`], ["Frame rate", i.fps ? i.fps + " fps" : "n/a"],
    ["Battery", i.battery ? Math.round(i.battery.level * 100) + "%" + (i.battery.charging ? " charging" : "") : "hidden"],
    ["Colour scheme", p.dark ? "dark" : "light"],
  ];
  return (
    <>
      <div className="ins-h">
        <div className="ins-t">
          <span className="ins-g">This browser</span>
          <h3>{p.brand} {p.version.split(".")[0]}</h3>
          <p>Readings from this tab are stored with personal content removed (<PrivacyLink>privacy notice</PrivacyLink>). Pick a capability to inspect it.</p>
        </div>
      </div>
      <div className="ins-ctl">
        <span className="pill">{p.secure ? <ShieldCheck size={12} /> : <TriangleAlert size={12} />}{p.secure ? "secure context" : "insecure context"}</span>
        {p.standalone && <span className="pill">installed app</span>}
        {p.uaSpoofed && <span className="pill st-requesting">user agent disagrees with engine</span>}
      </div>
      <div className="ins-b">
        <div className="ins-pad">
          <h5>Hardware and display</h5>
          <div className="kv">{rows.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>
          <h5>Exposed without asking {ctx.passive && <em>{ctx.passive.length}</em>}</h5>
          <div className="kv">{(ctx.passive || []).slice(0, 40).map((s) => <div key={s.id} title={s.detail}><span>{s.label}</span><b>{s.value}</b></div>)}</div>
          <h5>User agent</h5>
          <pre className="code wrap">{p.ua}</pre>
        </div>
      </div>
    </>
  );
}
