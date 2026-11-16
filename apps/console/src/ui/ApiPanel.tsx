import { useState } from "react";
import { Play, Square, Copy } from "lucide-react";
import type { AtlasNode, ScopeDef, Session } from "../core/types";
import { isActive, request, setParam, setSource, stop } from "../core/harness";

const BROWSER_LABEL = ["Chrome", "Edge", "Firefox", "Safari", "iOS Safari", "Android Chrome", "Samsung"];
const SUP: Record<string, [string, string]> = { y: ["yes", "ok"], p: ["partial", "warn"], f: ["flag", "warn"], n: ["no", "no"], u: ["unknown", "no"] };

function snippet(scope: ScopeDef, s: Session) {
  const p = Object.keys(s.params).length ? `, ${JSON.stringify(s.params)}` : "";
  return [
    `import { po } from "platform-ontology";`,
    ``,
    `const stream = await po.request("${scope.id}"${p});`,
    `stream.on("record", ({ seq, t, data }) => render(data));`,
    `// later: po.stop("${scope.id}")`,
  ].join("\n");
}

function json(v: unknown) {
  const text = JSON.stringify(v, (_k, x) => (typeof x === "number" && !Number.isInteger(x) ? Number(x.toFixed(3)) : x), 2) || "";
  return text.length > 2400 ? text.slice(0, 2400) + "\n…" : text;
}

export function ApiPanel({ scope, session, node }: { scope: ScopeDef; session: Session; node?: AtlasNode }) {
  const [tab, setTab] = useState<"response" | "log" | "access">("response");
  const active = isActive(session);
  const code = snippet(scope, session);
  return (
    <aside className="api">
      <div className="api-sec">
        <div className="api-h">
          <span>Request</span>
          <div className="seg">
            <button className={session.source === "live" ? "on" : ""} onClick={() => setSource(scope.id, "live")}>Live</button>
            <button className={session.source === "sim" ? "on" : ""} onClick={() => setSource(scope.id, "sim")}>Simulated</button>
          </div>
        </div>
        <div className="code">
          <button className="code-copy" title="Copy" onClick={() => navigator.clipboard?.writeText(code).catch(() => {})}><Copy size={12} /></button>
          <pre>{code}</pre>
        </div>
        <div className="native"><span>Browser call</span><code>{scope.call}</code></div>
        {scope.params && scope.params.length > 0 && (
          <div className="params">
            {scope.params.map((p) => (
              <label key={p.key} className="param" title={p.hint}>
                <span>{p.label}</span>
                {p.type === "bool" ? (
                  <input type="checkbox" checked={!!session.params[p.key]} onChange={(e) => setParam(scope.id, p.key, e.target.checked)} />
                ) : p.type === "number" ? (
                  <input type="number" min={p.min} max={p.max} step={p.step || 1} value={Number(session.params[p.key])} onChange={(e) => setParam(scope.id, p.key, Number(e.target.value))} />
                ) : (
                  <select value={String(session.params[p.key])} onChange={(e) => setParam(scope.id, p.key, e.target.value)}>
                    {p.options.map((o) => <option key={o}>{o}</option>)}
                  </select>
                )}
              </label>
            ))}
          </div>
        )}
        <div className="run">
          {active ? (
            <button className="btn stop" onClick={() => stop(scope.id)}><Square size={13} /> Stop</button>
          ) : (
            <button className="btn go" onClick={() => void request(scope.id)}><Play size={13} /> Request access</button>
          )}
          <span className={"pill st-" + session.state}>{session.state}</span>
        </div>
      </div>

      <div className="api-tabs">
        {(["response", "log", "access"] as const).map((t) => <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t === "response" ? "Response" : t === "log" ? `Log ${session.logs.length || ""}` : "Access"}</button>)}
      </div>
      <div className="api-body">
        {tab === "response" && (
          <>
            <div className="resp-meta">
              <span>seq <b>{session.last?.seq ?? 0}</b></span>
              <span><b>{session.hz ? session.hz.toFixed(1) : "0"}</b> Hz</span>
              <span>{session.firstAt && session.startedAt ? <><b>{session.firstAt - session.startedAt}</b> ms to first</> : "no data yet"}</span>
            </div>
            <pre className="json">{session.last ? json(session.last) : "// Request access to see the normalized record here.\n// Every scope returns { seq, t, data }."}</pre>
          </>
        )}
        {tab === "log" && (
          <div className="log">
            {session.logs.length === 0 && <p className="mute">Nothing yet.</p>}
            {[...session.logs].reverse().map((l, i) => (
              <div key={i} className={"log-row " + l.level}>
                <time>{new Date(l.t).toLocaleTimeString([], { hour12: false })}</time>
                <span>{l.msg}</span>
              </div>
            ))}
          </div>
        )}
        {tab === "access" && (
          <div className="access">
            <dl>
              <dt>Permission</dt><dd>{scope.permission || "none"}{session.permState ? ` (${session.permState})` : ""}</dd>
              <dt>Prompt</dt><dd>{scope.passive ? "No prompt. Collected silently." : node?.ui || (scope.gesture ? "Chooser or prompt after a click" : "Browser prompt")}</dd>
              {node?.gr && <><dt>Grant</dt><dd>{node.gr}</dd></>}
              {node?.ps && <><dt>Remembered</dt><dd>{node.ps}</dd></>}
              {node?.rv && <><dt>Revoke</dt><dd>{node.rv}</dd></>}
              <dt>Atlas</dt><dd>{scope.atlas.map((a) => <a key={a} href={`../#${a}`} className="lnk mono">{a}</a>)}</dd>
            </dl>
            {node && (
              <div className="support">
                {BROWSER_LABEL.map((b, i) => {
                  const [txt, cls] = SUP[node.sup[i]] || SUP.u;
                  return <div key={b} className={"sup " + cls}><span>{b}</span><b>{txt}</b></div>;
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
