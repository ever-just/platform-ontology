import { useMemo, useState } from "react";
import { Copy, Download, Send } from "lucide-react";
import type { ScopeDef, Session } from "../core/types";
import { exportOtlp, toOtlpMetrics, toOtlpTraces, type ExportResult } from "./otel";

const URL_KEY = "po.otlp.url";
const readUrl = () => { try { return localStorage.getItem(URL_KEY) || ""; } catch { return ""; } };
const saveUrl = (v: string) => { try { if (v) localStorage.setItem(URL_KEY, v); else localStorage.removeItem(URL_KEY); } catch { /* private mode */ } };

/** Shows the session as OTLP/JSON, with copy, download and an opt in send to the user's own collector. */
export function OtelPanel({ scope, session }: { scope: ScopeDef; session: Session }) {
  const [sig, setSig] = useState<"metrics" | "traces">("metrics");
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(readUrl);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<ExportResult[] | string | null>(null);
  const [copied, setCopied] = useState(false);
  // Recompute only when the panel is open, at most once per new record.
  const text = useMemo(() => {
    if (!open) return "";
    const body = sig === "metrics" ? toOtlpMetrics(scope, session) : toOtlpTraces(scope, session);
    return JSON.stringify(body, null, 2);
  }, [open, sig, scope, session.last?.seq, session.state, session.logs.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const preview = text.length > 6000 ? text.slice(0, 6000) + "\n  ... " + (text.length - 6000).toLocaleString() + " more characters, use Copy or Download for all of it" : text;

  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch { /* denied */ } };
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    a.download = `${scope.id}.otlp-${sig}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const send = async () => {
    setBusy(true); setRes(null);
    try { saveUrl(url.trim()); setRes(await exportOtlp(url, scope, session)); }
    catch (e) { setRes((e as Error).message || "That URL does not parse."); }
    finally { setBusy(false); }
  };

  return (
    <div className="otel">
      <p className="otel-lede">
        OpenTelemetry is the open standard for telemetry. This session maps onto it directly: the tab is the resource, the session is one span, and every number is a gauge named <code>po.{scope.id}.&lt;field&gt;</code> with a point per record.
      </p>
      <details className="otel-d" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary>Export as OTLP JSON</summary>
        <div className="otel-bar">
          <div className="seg" role="group" aria-label="Signal">
            <button className={sig === "metrics" ? "on" : ""} onClick={() => setSig("metrics")}>Metrics</button>
            <button className={sig === "traces" ? "on" : ""} onClick={() => setSig("traces")}>Trace</button>
          </div>
          <span className="grow" />
          <button className="btn sm" onClick={copy} disabled={!session.count && sig === "metrics"}><Copy size={12} /> {copied ? "Copied" : "Copy"}</button>
          <button className="btn sm" onClick={download} disabled={!session.count && sig === "metrics"}><Download size={12} /> Download</button>
        </div>
        <pre className="code otel-pre">{session.count || sig === "traces" ? preview : "// Run it first. Each record becomes a data point."}</pre>
        <div className="otel-send">
          <label htmlFor={"otlp-" + scope.id}>Send to your collector (optional, off until you press Send)</label>
          <div className="otel-row">
            <input id={"otlp-" + scope.id} type="url" inputMode="url" placeholder="https://your-collector:4318" value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} autoComplete="off" />
            <button className="btn sm" onClick={send} disabled={busy || !url.trim() || !session.count}><Send size={12} /> {busy ? "Sending" : "Send"}</button>
          </div>
          <small>POSTs OTLP/HTTP JSON to <code>/v1/metrics</code> and <code>/v1/traces</code> under that address. The address stays in this browser only. The collector has to allow CORS from this page. Records include everything in the buffer, location included if this capability reports it.</small>
          {res && (typeof res === "string"
            ? <div className="otel-res err">{res}</div>
            : res.map((r) => <div key={r.detail} className={"otel-res " + (r.ok ? "ok" : "err")}>{r.detail}</div>))}
        </div>
      </details>
    </div>
  );
}
