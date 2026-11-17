import type { DataKind, Metric, ScopeDef, Session } from "./types";

// Data kinds decide how a value is drawn. The rule, after Stevens' levels of measurement and the
// usual dashboard practice (Few, Tufte, Material and Apple chart guidance):
//   quantitative (ratio, interval, count): the number with its unit; a sparkline is allowed.
//   categorical (nominal, ordinal): a chip with the current option; ordinal also shows its rank.
//   boolean: a yes/no badge with an icon and the word, never 1/0 and never a chart.
//   temporal: a relative time ("2 min ago") with the exact timestamp on hover.
//   text, identifier, color, geo, set, media: the value itself, shortened, never charted.
// Sampling rate (Hz) is a property of the stream, not of the data, so it is never the headline.

export type KindInfo = { kind: DataKind; name: string; level: string; row: string; detail: string; never: string; chart: boolean };

export const KINDS: Record<DataKind, KindInfo> = {
  ratio: { kind: "ratio", name: "Ratio", level: "Quantitative, true zero", row: "Number with unit (62 %, 25.8 Mbps)", detail: "Big number, sparkline and trend chart", never: "Hz or a record count in place of the value", chart: true },
  interval: { kind: "interval", name: "Interval", level: "Quantitative, no true zero", row: "Signed number with unit (-6 h, 181°)", detail: "Big number, sparkline; differences, not ratios", never: "Percent change (meaningless without a true zero)", chart: true },
  count: { kind: "count", name: "Count", level: "Quantitative, whole numbers", row: "Whole number with noun (11 devices)", detail: "Number, step chart over time", never: "Decimals", chart: true },
  ordinal: { kind: "ordinal", name: "Ordinal", level: "Ordered categories", row: "Chip with the current level", detail: "Chip plus the ordered scale with the current step marked", never: "A number line or average", chart: false },
  nominal: { kind: "nominal", name: "Nominal", level: "Unordered categories", row: "Chip with the value (America/Chicago)", detail: "Chip plus the known options", never: "Hz, a count, or a chart", chart: false },
  boolean: { kind: "boolean", name: "Boolean", level: "Two states", row: "Yes or No badge with an icon", detail: "Badge with icon and word; when it last changed", never: "1 or 0, true or false, a chart", chart: false },
  temporal: { kind: "temporal", name: "Temporal", level: "Point in time", row: "Relative time (2 min ago)", detail: "Exact timestamp and time zone", never: "Raw epoch milliseconds", chart: false },
  text: { kind: "text", name: "Text", level: "Free text", row: "The text, shortened", detail: "Full text, copyable", never: "Its length in place of the text", chart: false },
  identifier: { kind: "identifier", name: "Identifier", level: "Opaque key or hash", row: "Short monospace value", detail: "Full value, copyable, stability note", never: "A chart or a sum", chart: false },
  geo: { kind: "geo", name: "Geo", level: "Position", row: "Latitude and longitude", detail: "Coordinates with accuracy radius", never: "Separate lat and lon sparklines as the headline", chart: false },
  set: { kind: "set", name: "Set", level: "List of values", row: "Count of items with the first few", detail: "Every item as a chip", never: "Only the count when items are known", chart: false },
  media: { kind: "media", name: "Media", level: "Stream or blob", row: "Live or captured, with size", detail: "The preview itself", never: "Hz as the headline", chart: false },
  color: { kind: "color", name: "Color", level: "Color value", row: "Swatch with hex", detail: "Swatch, hex and contrast", never: "A number", chart: false },
};

export const QUANT: ReadonlySet<DataKind> = new Set(["ratio", "interval", "count"]);

export type Tone = "ok" | "warn" | "bad" | "off" | "neutral";

export type Headline = {
  kind: DataKind;
  label: string;
  /** Display text, already formatted, without the unit. */
  text: string;
  unit?: string;
  value: unknown;
  tone: Tone;
  /** For ordinal: position in options (0 based) and the options. */
  rank?: number;
  options?: string[];
};

const AVAIL = ["Missing", "Behind a flag", "Blocked", "Available"];

/** Read a key from a record: a plain field, or a named entry in a generic `fields` table. */
export function readKey(data: Record<string, unknown> | undefined, key: string): unknown {
  if (!data) return undefined;
  if (key in data) return data[key];
  const f = (data.fields as { name: string; value: unknown }[] | undefined)?.find?.((x) => x.name === key);
  return f ? f.value : undefined;
}

const COUNT_KEY = /^(n|count|.*_count|steps|clicks|switches|sends|sets|pulses|releases|faces|cams|mics|connected|pressed|supported|available|granted|sent|records_total|notes_total|runs|drops|opened|voices|.*s found|keys mapped|frames.*|samples)$/i;

/** Best guess when a scope declares nothing: by unit, key and the value itself. */
export function inferKind(key: string, value: unknown, unit?: string): DataKind {
  if (typeof value === "boolean") return "boolean";
  if (Array.isArray(value)) return "set";
  if (typeof value === "number") {
    if (unit && /^(°|deg|dB|dBm|h)$/i.test(unit)) return "interval";
    if (!unit && (COUNT_KEY.test(key) || /count|number of/i.test(key)) && Number.isInteger(value)) return "count";
    return "ratio";
  }
  if (typeof value === "string") {
    if (/^#[0-9a-f]{3,8}$/i.test(value)) return "color";
    if (/^[0-9a-f]{12,}$/i.test(value)) return "identifier";
    if (/^(true|false)$/i.test(value)) return "boolean";
    if (/^(granted|denied|prompt|default)$/i.test(value)) return "nominal";
    if (value.includes(", ") && value.length > 20) return "set";
    return value.length > 32 ? "text" : "nominal";
  }
  return "text";
}

/** Format one value as its kind wants. */
export function formatKind(kind: DataKind, v: unknown, m?: Pick<Metric, "digits" | "unit" | "options">): { text: string; tone: Tone; rank?: number } {
  if (v === null || v === undefined || v === "" || (typeof v === "number" && !isFinite(v))) return { text: "n/a", tone: "off" };
  switch (kind) {
    case "boolean": {
      const b = typeof v === "string" ? /^(true|yes|on|1)$/i.test(v) : typeof v === "number" ? v > 0 : !!v;
      return { text: b ? "Yes" : "No", tone: b ? "ok" : "off" };
    }
    case "count": {
      const n = typeof v === "number" ? v : Array.isArray(v) ? v.length : Number(v);
      return { text: isFinite(n) ? Math.round(n).toLocaleString() : String(v), tone: "neutral" };
    }
    case "ratio": case "interval": {
      if (typeof v !== "number") return { text: String(v), tone: "neutral" };
      const d = m?.digits ?? (Number.isInteger(v) ? 0 : Math.abs(v) < 10 ? 2 : 1);
      const t = Math.abs(v) >= 1e6 ? v.toExponential(2) : v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: d });
      return { text: kind === "interval" && v > 0 && m?.unit === "h" ? "+" + t : t, tone: "neutral" };
    }
    case "ordinal": case "nominal": {
      const s = String(v);
      const rank = m?.options ? m.options.findIndex((o) => o.toLowerCase() === s.toLowerCase()) : -1;
      return { text: s, tone: "neutral", rank: rank >= 0 ? rank : undefined };
    }
    case "temporal": {
      const t = typeof v === "number" ? v : Date.parse(String(v));
      return { text: isFinite(t) ? ago(t) : String(v), tone: "neutral" };
    }
    case "geo": {
      const g = v as { lat?: number; lon?: number };
      return { text: g && typeof g.lat === "number" && typeof g.lon === "number" ? `${g.lat.toFixed(4)}, ${g.lon.toFixed(4)}` : String(v), tone: "neutral" };
    }
    case "set": {
      const arr = Array.isArray(v) ? v.map((x) => (typeof x === "object" && x ? (x as any).name ?? (x as any).k ?? (x as any).kind ?? (x as any).label ?? (x as any).id ?? "item" : String(x))) : String(v).split(/,\s*/).filter(Boolean);
      if (!arr.length) return { text: "None", tone: "off" };
      const head = arr.slice(0, 2).join(", ");
      return { text: arr.length > 2 ? `${arr.length}: ${head} +${arr.length - 2}` : head, tone: "neutral" };
    }
    case "identifier": { const s = String(v); return { text: s.length > 12 ? s.slice(0, 10) + "…" : s, tone: "neutral" }; }
    case "color": return { text: String(v).toLowerCase(), tone: "neutral" };
    case "media": return { text: typeof v === "string" ? v : "Live", tone: "ok" };
    case "text": default: { const s = String(v); return { text: s.length > 28 ? s.slice(0, 27) + "…" : s, tone: "neutral" }; }
  }
}

export function ago(t: number, now = Date.now()): string {
  const s = Math.round((now - t) / 1000);
  if (Math.abs(s) < 5) return "just now";
  const a = Math.abs(s), f = s < 0 ? "in " : "", b = s < 0 ? "" : " ago";
  if (a < 60) return `${f}${a} s${b}`;
  if (a < 3600) return `${f}${Math.round(a / 60)} min${b}`;
  if (a < 86400) return `${f}${Math.round(a / 3600)} h${b}`;
  return new Date(t).toLocaleDateString();
}

/** The primary metric of a scope (declared primary, else the first typed metric). */
export function primaryMetric(scope: ScopeDef): Metric | undefined {
  const ms = scope.metrics || [];
  return ms.find((m) => m.primary) || ms[0];
}

/** Availability of a reference entry, as an ordinal. */
export function availability(d: Record<string, unknown>): { text: string; tone: Tone; rank?: number } {
  const det = String(d.detect ?? "");
  const rel = String(d.release ?? "");
  if (/never exposed/i.test(rel)) return { text: "Never exposed", tone: "off" };
  if (det === "simulated") return { text: "Simulated", tone: "neutral" };
  if (det === "present") return d.permission === "denied" ? { text: "Blocked", tone: "bad", rank: 2 } : { text: "Available", tone: "ok", rank: 3 };
  if (det === "absent") return /flag|trial/i.test(rel) ? { text: "Behind a flag", tone: "warn", rank: 1 } : { text: "Missing", tone: "off", rank: 0 };
  return { text: "No script test", tone: "warn" };
}

/** The value to lead with for a scope's latest record, formatted by its kind. */
export function headline(scope: ScopeDef, data: Record<string, unknown> | undefined | null): Headline | null {
  if (!data) return null;
  if (scope.reference) {
    const a = availability(data);
    return { kind: "ordinal", label: "Availability", text: a.text, value: data.detect, tone: a.tone, rank: a.rank, options: AVAIL };
  }
  const m = primaryMetric(scope);
  if (m) {
    const v = m.key === "@geo" ? { lat: data.lat, lon: data.lon } : readKey(data, m.key);
    if (v !== undefined) {
      const kind = m.type || inferKind(m.key, v, m.unit);
      const f = formatKind(kind, v, m);
      return { kind, label: m.label, text: f.text, unit: QUANT.has(kind) ? m.unit : undefined, value: v, tone: f.tone, rank: f.rank, options: m.options };
    }
  }
  // Nothing declared or the declared key is missing: first meaningful field.
  const fields = data.fields as { name: string; value: unknown; unit?: string }[] | undefined;
  if (Array.isArray(fields) && fields.length) {
    const f0 = fields.find((f) => f.value !== null && f.value !== "sample") || fields[0];
    const kind = inferKind(f0.name, f0.value, f0.unit);
    const f = formatKind(kind, f0.value, { unit: f0.unit });
    return { kind, label: f0.name, text: f.text, unit: QUANT.has(kind) ? f0.unit : undefined, value: f0.value, tone: f.tone };
  }
  for (const [k, v] of Object.entries(data)) {
    if (v === null || v === undefined || typeof v === "object") continue;
    const kind = inferKind(k, v);
    const f = formatKind(kind, v);
    return { kind, label: k, text: f.text, value: v, tone: f.tone };
  }
  return null;
}

/** One line for the voice agent and logs: "Time zone: America/Chicago (nominal)". */
export function headlineText(h: Headline | null): string {
  if (!h) return "no reading yet";
  return `${h.label}: ${h.text}${h.unit ? " " + h.unit : ""}`;
}

/** Whether Hz is worth showing next to this scope's value: only for continuous streams. */
export function showsRate(scope: ScopeDef, s: Pick<Session, "hz" | "state">): boolean {
  const m = primaryMetric(scope);
  return s.state === "streaming" && s.hz >= 1 && !scope.reference && !!m && QUANT.has(m.type || "ratio");
}
