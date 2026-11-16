import { useState } from "react";
import { HistoryChart } from "./history-view";
import { AccessRows, FieldMeanings, LogTimeline, Provenance, Reveals } from "./inspector-views";
import { Play, Square, Copy, X, ShieldCheck, TriangleAlert } from "lucide-react";
import type { ScopeDef, Session } from "../core/types";
import { isActive, request, setParam, setSource, stop, useSession } from "../core/harness";
import { useInternals } from "../browser/engine";
import type { ConsoleCtx } from "../ext/registry";
import { fmt } from "./kit";
import { clock } from "./charts";
import { CapIcon, LayerGlyph, LAYERS, MECH, MechBadge, MODES, SupportMatrix, mechanismOf } from "./icons";
import { supportOf } from "../browser/profile";

type Tab = "data" | "record" | "scope" | "log";

function snippet(scope: ScopeDef, s: Session) {
  const p = Object.keys(s.params).length ? `, ${JSON.stringify(s.params)}` : "";
  return `const stream = await po.request("${scope.id}"${p});\nstream.on("record", ({ seq, t, data }) => render(data));\n// later: po.stop("${scope.id}")`;
}

function json(v: unknown) {
  const text = JSON.stringify(v, (_k, x) => (typeof x === "number" && !Number.isInteger(x) ? Number(x.toFixed(3)) : x), 2) || "";
  return text.length > 3000 ? text.slice(0, 3000) + "\n..." : text;
}

export function Inspector({ ctx, scope, onClose }: { ctx: ConsoleCtx; scope: ScopeDef | null; onClose: () => void }) {
  return (
    <section className={"box ins" + (scope ? " open" : "")}>
      {scope ? <ScopeInspector key={scope.id} ctx={ctx} scope={scope} onClose={onClose} /> : <BrowserSummary ctx={ctx} />}
    </section>
  );
}

function ScopeInspector({ ctx, scope, onClose }: { ctx: ConsoleCtx; scope: ScopeDef; onClose: () => void }) {
  const session = useSession(scope.id);
  const [tab, setTab] = useState<Tab>("data");
  const active = isActive(session);
  const node = ctx.nodeOf(scope);
  const group = ctx.groupOf(scope.id);
  const Inst = scope.Instrument;
  const code = snippet(scope, session);
  const mech = mechanismOf(scope, node ? supportOf(node.sup, ctx.profile.column) : undefined);
  return (
    <>
      <div className="ins-h">
        <span className="ins-i"><CapIcon scope={scope} size={20} /></span>
        <div className="ins-t">
          <span className="ins-g">{group.label}</span>
          <h3>{scope.name}</h3>
          <p>{scope.summary}</p>
          <div className="ins-badges">
            <MechBadge mech={mech} label />
            {MODES.filter((m) => scope.modes?.[m.id]).map((m) => <span key={m.id} className={"mode m-" + m.id} title={scope.modes![m.id]}><m.Icon size={12} />{m.label}</span>)}
            <span className="mode m-layer" title={LAYERS[scope.layer || 1].plain}><LayerGlyph layer={scope.layer} />L{scope.layer || 1}</span>
          </div>
        </div>
        <button className="icon-b ins-x" onClick={onClose} aria-label="Close"><X size={16} /></button>
      </div>
      <div className="ins-ctl">
        <span className={"pill st-" + session.state}>{session.state}</span>
        <div className="seg">
          <button className={session.source === "live" ? "on" : ""} onClick={() => setSource(scope.id, "live")}>Live</button>
          <button className={session.source === "sim" ? "on" : ""} onClick={() => setSource(scope.id, "sim")}>Simulated</button>
        </div>
        <span className="grow" />
        {active
          ? <button className="btn" onClick={() => stop(scope.id)}><Square size={12} />Stop</button>
          : <button className="btn pri" onClick={() => void request(scope.id)}><Play size={12} />{scope.passive ? "Run" : "Request access"}</button>}
      </div>
      <div className="tabs line">
        {(["data", "record", "scope", "log"] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {t === "data" ? "Data" : t === "record" ? "Record" : t === "scope" ? "Scope" : "Log"}{t === "log" && session.logs.length > 0 && <em>{session.logs.length}</em>}
          </button>
        ))}
      </div>
      <div className="ins-b">
        {tab === "data" && <div className="ins-data"><Inst scope={scope} session={session} /></div>}
        {tab === "record" && (
          <div className="ins-pad">
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
          </div>
        )}
        {tab === "scope" && (
          <div className="ins-pad">
            <h5>What you can do with it</h5>
            <div className="mode-list">
              {MODES.filter((m) => scope.modes?.[m.id]).map((m) => (
                <div key={m.id} className={"mode-row m-" + m.id}><span className="mode-ic"><m.Icon size={15} /></span><div><b>{m.label}</b><span>{scope.modes![m.id]}</span></div></div>
              ))}
              <div className="mode-row m-layer"><span className="mode-ic"><LayerGlyph layer={scope.layer} /></span><div><b>{LAYERS[scope.layer || 1].label}</b><span>{LAYERS[scope.layer || 1].plain}</span></div></div>
            </div>
            <h5>What it reveals</h5>
            <Reveals items={scope.reveals} />
            <h5>Access</h5>
            <AccessRows scope={scope} session={session} node={node} mech={mech} />
            {node && (
              <>
                <h5>Support</h5>
                <SupportMatrix sup={node.sup} me={ctx.profile.column} />
              </>
            )}
            {scope.params && scope.params.length > 0 && (
              <>
                <h5>Options</h5>
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
            <h5>Call it</h5>
            <div className="snip"><button className="icon-b" title="Copy" onClick={() => navigator.clipboard?.writeText(code).catch(() => {})}><Copy size={12} /></button><pre className="code">{code}</pre></div>
            <p className="fine">Atlas: {scope.atlas.map((a) => <a key={a} href={`../#${a}`}>{a}</a>)}</p>
          </div>
        )}
        {tab === "log" && (
          <div className="ins-pad">
            <LogTimeline session={session} />
          </div>
        )}
      </div>
    </>
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
          <p>Read from this tab, on this device. Nothing leaves it. Pick a capability to inspect it.</p>
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
