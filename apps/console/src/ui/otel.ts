import type { Rec, ScopeDef, Session } from "../core/types";

// OpenTelemetry mapping for a scope session.
//
// Every capability in the console already emits one envelope ({ seq, t, data }), which is the same
// shape OpenTelemetry uses for telemetry: a resource (who produced it), an instrumentation scope
// (which library), and timestamped points. So the mapping is direct:
//   resource              = this browser tab (service.name, user_agent.original, browser.*)
//   instrumentation scope = the console, versioned
//   one span per session  = "scope <id>", from request to now, with an event per log line
//   one gauge per number  = po.<scope id>.<field>, a data point per record
// The output is OTLP/JSON (the protobuf JSON mapping the collector accepts on /v1/metrics and
// /v1/traces), so it can be pasted into any OTLP tool or POSTed to a collector the user runs.

type AnyValue = { stringValue: string } | { boolValue: boolean } | { intValue: string } | { doubleValue: number };
type KV = { key: string; value: AnyValue };

const SCOPE = { name: "platform-ontology-console", version: "0.1.0" };

const val = (v: unknown): AnyValue | null => {
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { boolValue: v };
  if (typeof v === "number" && isFinite(v)) return Number.isInteger(v) ? { intValue: String(v) } : { doubleValue: v };
  return null;
};
const attrs = (o: Record<string, unknown>): KV[] => Object.entries(o).flatMap(([key, v]) => { const value = val(v); return value ? [{ key, value }] : []; });
const nano = (ms: number) => String(Math.round(ms)) + "000000";

/** Deterministic hex ids so the same session always exports the same trace. */
function hexId(seed: string, bytes: number): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  let out = "";
  while (out.length < bytes * 2) {
    for (let i = 0; i < seed.length; i++) { h1 = Math.imul(h1 ^ seed.charCodeAt(i), 16777619); h2 = Math.imul(h2 ^ (h1 >>> 7), 2246822519); }
    out += ((h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0"));
    seed += out;
  }
  return out.slice(0, bytes * 2);
}

/** OTel resource attributes for this tab. Uses the semantic convention names (service.*, telemetry.sdk.*, user_agent.*, browser.*). */
export function resourceAttrs(): KV[] {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  const uad = (nav as Navigator & { userAgentData?: { platform?: string; mobile?: boolean; brands?: { brand: string; version: string }[] } })?.userAgentData;
  return attrs({
    "service.name": "platform-ontology-console",
    "service.version": SCOPE.version,
    "telemetry.sdk.name": "platform-ontology-console",
    "telemetry.sdk.language": "webjs",
    "user_agent.original": nav?.userAgent,
    "browser.platform": uad?.platform,
    "browser.mobile": uad?.mobile,
    "browser.language": nav?.language,
    "browser.brands": uad?.brands?.map((b) => `${b.brand} ${b.version}`).join(", "),
  });
}

const metricName = (scope: ScopeDef, key: string) => `po.${scope.id}.${key}`.toLowerCase().replace(/[^a-z0-9_.]/g, "_");

/** UCUM-ish units the collector understands; unknown units pass through. */
const UNIT: Record<string, string> = { "°": "deg", "°/s": "deg/s", "m/s²": "m/s2", "%": "%", "": "1" };

/** Gauges, one per numeric field, one data point per record in the buffer. */
export function toOtlpMetrics(scope: ScopeDef, session: Session, records: Rec[] = session.records) {
  const declared = new Map((scope.metrics || []).map((m) => [m.key, m]));
  const series = new Map<string, { timeUnixNano: string; startTimeUnixNano: string; asDouble: number; attributes: KV[] }[]>();
  const pointAttrs = attrs({ "po.scope.id": scope.id, "po.source": session.source });
  const start = nano(session.startedAt || records[0]?.t || Date.now());
  for (const r of records) {
    for (const [k, v] of Object.entries(r.data)) {
      if (typeof v !== "number" || !isFinite(v)) continue;
      let s = series.get(k);
      if (!s) { s = []; series.set(k, s); }
      s.push({ timeUnixNano: nano(r.t), startTimeUnixNano: start, asDouble: v, attributes: pointAttrs });
    }
  }
  const metrics = [...series].map(([k, dataPoints]) => {
    const m = declared.get(k);
    const unit = m?.unit !== undefined ? UNIT[m.unit] ?? m.unit : "";
    return { name: metricName(scope, k), description: m ? `${scope.name}: ${m.label}` : `${scope.name}: ${k}`, unit, gauge: { dataPoints } };
  });
  return { resourceMetrics: [{ resource: { attributes: resourceAttrs() }, scopeMetrics: [{ scope: SCOPE, metrics }] }] };
}

/** One span for the session with an event per log line and the record count as attributes. */
export function toOtlpTraces(scope: ScopeDef, session: Session) {
  const seed = `${scope.id}:${session.startedAt}`;
  const end = session.last?.t || Date.now();
  const failed = session.state === "denied" || session.state === "error" || session.state === "unsupported";
  const span = {
    traceId: hexId(seed, 16),
    spanId: hexId(seed + ":span", 8),
    name: `scope ${scope.id}`,
    kind: 1, // SPAN_KIND_INTERNAL
    startTimeUnixNano: nano(session.startedAt || end),
    endTimeUnixNano: nano(Math.max(end, session.startedAt || end)),
    attributes: attrs({
      "po.scope.id": scope.id,
      "po.scope.name": scope.name,
      "po.scope.domain": scope.domain,
      "po.source": session.source,
      "po.state": session.state,
      "po.permission.name": scope.permission,
      "po.permission.state": session.permState || undefined,
      "po.records.count": session.count,
      "po.records.rate_hz": Math.round(session.hz * 10) / 10,
      "po.time_to_first_record_ms": session.firstAt && session.startedAt ? session.firstAt - session.startedAt : undefined,
    }),
    events: [
      ...(session.firstAt ? [{ timeUnixNano: nano(session.firstAt), name: "first_record", attributes: [] as KV[] }] : []),
      ...session.logs.map((l) => ({ timeUnixNano: nano(l.t), name: "log", attributes: attrs({ "log.severity": l.level, "log.message": l.msg }) })),
    ],
    status: failed ? { code: 2, message: session.error || session.state } : { code: session.count ? 1 : 0 },
  };
  return { resourceSpans: [{ resource: { attributes: resourceAttrs() }, scopeSpans: [{ scope: SCOPE, spans: [span] }] }] };
}

export type ExportResult = { ok: boolean; detail: string };

/** POST OTLP/JSON to a collector the user named. Nothing is sent unless they press the button. */
export async function exportOtlp(base: string, scope: ScopeDef, session: Session): Promise<ExportResult[]> {
  const root = base.trim().replace(/\/+$/, "").replace(/\/v1\/(metrics|traces)$/, "");
  const url = new URL(root); // throws on a bad URL
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Use an http or https URL.");
  const send = async (path: string, body: unknown): Promise<ExportResult> => {
    try {
      const r = await fetch(root + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), mode: "cors", credentials: "omit" });
      return { ok: r.ok, detail: `${path} ${r.status} ${r.statusText}`.trim() };
    } catch (e) {
      return { ok: false, detail: `${path} failed: ${(e as Error).message}. The collector must allow CORS from this page.` };
    }
  };
  return Promise.all([send("/v1/metrics", toOtlpMetrics(scope, session)), send("/v1/traces", toOtlpTraces(scope, session))]);
}
