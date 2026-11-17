import type { ScopeDef } from "../core/types";
import { getSession } from "../core/harness";
import { loadHistory, type Stored } from "../core/history";
import { marks, recent } from "../core/timeline";
import type { ToolDef, ToolResult } from "./tools";

// Read only tools over what the console already remembers: the readings kept in this browser
// (IndexedDB), the per second activity timeline, the readings saved to the signed in account, and a
// "super sensor" that lines several capabilities up on one clock and says what moves together.
// Nothing here starts, stops or changes anything.

type Find = (id: unknown) => ScopeDef | undefined;
type Row = { t: number; data: Record<string, unknown> };

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "boolean" ? (v ? 1 : 0) : null);

/** Numeric leaves of a reading, flattened one level ("coords.latitude"), up to 24 fields. */
function numbers(d: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(d || {})) {
    const n = num(v);
    if (n != null) out[k] = n;
    else if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
        const n2 = num(v2);
        if (n2 != null) out[`${k}.${k2}`] = n2;
      }
    }
    if (Object.keys(out).length >= 24) break;
  }
  return out;
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** Per field min, max, mean, first, last and a plain trend word for a run of readings. */
function stats(rows: Row[]) {
  const by = new Map<string, { t: number; v: number }[]>();
  rows.forEach((r) => Object.entries(numbers(r.data)).forEach(([k, v]) => { if (!by.has(k)) by.set(k, []); by.get(k)!.push({ t: r.t, v }); }));
  const out: Record<string, unknown> = {};
  for (const [k, pts] of by) {
    if (pts.length < 1) continue;
    const vs = pts.map((p) => p.v);
    const min = Math.min(...vs), max = Math.max(...vs), mean = vs.reduce((a, b) => a + b, 0) / vs.length;
    const first = vs[0], last = vs[vs.length - 1];
    const span = max - min;
    const trend = span === 0 ? "flat" : Math.abs(last - first) < span * 0.15 ? "steady" : last > first ? "rising" : "falling";
    out[k] = { n: vs.length, min: r3(min), max: r3(max), mean: r3(mean), first: r3(first), last: r3(last), trend };
  }
  return out;
}

/** Evenly spaced picks so a long run still fits a voice reply. */
function sample<T>(xs: T[], n: number): T[] {
  if (xs.length <= n) return xs;
  const step = (xs.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => xs[Math.round(i * step)]);
}

function small(d: Record<string, unknown>) {
  const o: Record<string, unknown> = {};
  Object.entries(d || {}).slice(0, 12).forEach(([k, v]) => {
    o[k] = typeof v === "string" ? (v.length > 80 ? v.slice(0, 80) + "…" : v) : typeof v === "object" && v ? "{…}" : v;
  });
  return o;
}

/** Stored history plus whatever the live session holds that is not stored yet, oldest first. */
async function rowsFor(id: string, since: number): Promise<Row[]> {
  const stored: Stored[] = await loadHistory(id);
  const rows: Row[] = stored.filter((s) => s.t >= since).map((s) => ({ t: s.t, data: s.data }));
  const lastT = rows.length ? rows[rows.length - 1].t : 0;
  getSession(id).records.forEach((r) => { if (r.t > lastT && r.t >= since) rows.push({ t: r.t, data: r.data as Record<string, unknown> }); });
  return rows;
}

function pearson(a: number[], b: number[]) {
  const n = a.length;
  if (n < 4) return null;
  const ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { const da = a[i] - ma, db = b[i] - mb; sab += da * db; saa += da * da; sbb += db * db; }
  if (saa === 0 || sbb === 0) return null;
  return sab / Math.sqrt(saa * sbb);
}

/** Main numeric field of a run: the one that varies most relative to its size. */
function mainField(rows: Row[]): string | null {
  const s = stats(rows) as Record<string, { min: number; max: number; mean: number; n: number }>;
  let best: string | null = null, score = 0;
  for (const [k, v] of Object.entries(s)) {
    if (v.n < 4 || /(^|\.)(t|time|timestamp|seq|id)$/i.test(k)) continue;
    const sc = (v.max - v.min) / (Math.abs(v.mean) + 1e-9);
    if (sc > score) { score = sc; best = k; }
  }
  return best;
}

export const INSIGHT_TOOLS: ToolDef[] = [
  {
    name: "get_history",
    description: "Readings this browser has kept for one capability over a time window, including earlier visits: how many, when, per field min/max/mean/trend, and a few sample readings. Use for questions about the past, like 'how has the battery changed this hour'.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Capability id" },
        minutes: { type: "number", description: "How far back to look, 1 to 10080 (a week). Default 60." },
        samples: { type: "number", description: "How many sample readings to include, 0 to 20. Default 6." },
      },
      required: ["id"],
    },
  },
  {
    name: "get_activity",
    description: "What happened in the console over the last minutes: readings per second, how many capabilities were live, and notable events (granted, denied, stopped, errors) with times.",
    inputSchema: { type: "object", properties: { minutes: { type: "number", description: "1 to 60. Default 10." } } },
  },
  {
    name: "evaluate_insight",
    description: "Super sensor: line two to six capabilities up on one clock and report each one's summary, which of them move together (correlation of their main numbers), and when each was last active. Use to answer questions that combine signals, like 'does my motion line up with the light level'.",
    inputSchema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" }, description: "Two to six capability ids" },
        minutes: { type: "number", description: "Window to compare, 1 to 1440. Default 15." },
        question: { type: "string", description: "The person's question, echoed back so the answer stays on it." },
      },
      required: ["ids"],
    },
  },
];

export const ACCOUNT_TOOLS: ToolDef[] = [
  {
    name: "get_saved_readings",
    description: "Readings saved to the signed in account from linked visits (kept on the server, across devices). Needs the person to be signed in.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Optional capability id to filter by" },
        hours: { type: "number", description: "Only readings from the last N hours, 1 to 720" },
        limit: { type: "number", description: "1 to 50. Default 20." },
      },
    },
  },
];

const nope = (id: unknown) => ({ ok: false, error: `No capability "${id}". Call list_capabilities to find ids.` });

export async function insightCall(name: string, a: Record<string, any>, find: Find, account: boolean): Promise<ToolResult | null> {
  switch (name) {
    case "get_history": {
      const s = find(a.id);
      if (!s) return nope(a.id);
      const minutes = Math.min(10080, Math.max(1, Number(a.minutes) || 60));
      const n = Math.min(20, Math.max(0, a.samples == null ? 6 : Number(a.samples) || 0));
      const rows = await rowsFor(s.id, Date.now() - minutes * 60_000);
      if (!rows.length) return { ok: true, id: s.id, name: s.name, minutes, count: 0, note: "Nothing kept for this window. Start it, or widen the window." };
      return {
        ok: true, id: s.id, name: s.name, minutes, count: rows.length,
        from: new Date(rows[0].t).toISOString(), to: new Date(rows[rows.length - 1].t).toISOString(),
        fields: stats(rows),
        samples: sample(rows, n).map((r) => ({ t: new Date(r.t).toISOString(), data: small(r.data) })),
      };
    }
    case "get_activity": {
      const minutes = Math.min(60, Math.max(1, Number(a.minutes) || 10));
      const since = Date.now() - minutes * 60_000;
      const ss = recent(minutes * 60).filter((x) => x.t >= since);
      const per: Record<string, number> = {};
      ss.forEach((x) => Object.entries(x.per).forEach(([k, v]) => { per[k] = (per[k] || 0) + v; }));
      const top = Object.entries(per).sort((x, y) => y[1] - x[1]).slice(0, 10).map(([id, readings]) => ({ id, name: find(id)?.name, readings }));
      const ev = marks().filter((m) => m.t >= since).slice(0, 15).map((m) => ({ t: new Date(m.t).toISOString(), id: m.scope, kind: m.kind, msg: m.msg.slice(0, 120) }));
      const rates = ss.map((x) => x.rate);
      return {
        ok: true, minutes, seconds: ss.length,
        readings: rates.reduce((x, y) => x + y, 0),
        peakPerSecond: rates.length ? Math.max(...rates) : 0,
        liveNow: ss.length ? ss[ss.length - 1].live : 0,
        busiest: top, events: ev,
      };
    }
    case "evaluate_insight": {
      const ids: unknown[] = Array.isArray(a.ids) ? a.ids.slice(0, 6) : [];
      const picked = ids.map((x) => find(x)).filter((s): s is ScopeDef => !!s);
      const missing = ids.filter((x) => !find(x));
      if (picked.length < 2) return { ok: false, error: `Give two to six known capability ids.${missing.length ? ` Unknown: ${missing.join(", ")}.` : ""}` };
      const minutes = Math.min(1440, Math.max(1, Number(a.minutes) || 15));
      const since = Date.now() - minutes * 60_000;
      // Bucket each main series to a shared clock so different rates line up.
      const bucket = Math.max(1000, Math.round((minutes * 60_000) / 120));
      const series = new Map<string, Map<number, number[]>>();
      const each = await Promise.all(picked.map(async (s) => {
        const rows = await rowsFor(s.id, since);
        const field = mainField(rows);
        if (field) {
          const m = new Map<number, number[]>();
          rows.forEach((r) => { const v = numbers(r.data)[field]; if (v != null) { const b = Math.floor(r.t / bucket); if (!m.has(b)) m.set(b, []); m.get(b)!.push(v); } });
          series.set(s.id, m);
        }
        const ses = getSession(s.id);
        return {
          id: s.id, name: s.name, state: ses.state, readings: rows.length, mainField: field,
          lastAt: rows.length ? new Date(rows[rows.length - 1].t).toISOString() : null,
          latest: rows.length ? small(rows[rows.length - 1].data) : null,
          fields: rows.length ? stats(rows) : {},
        };
      }));
      const pairs: { a: string; b: string; together: number; correlation: number | null; reading: string }[] = [];
      for (let i = 0; i < picked.length; i++) for (let j = i + 1; j < picked.length; j++) {
        const A = series.get(picked[i].id), B = series.get(picked[j].id);
        if (!A || !B) continue;
        const keys = [...A.keys()].filter((k) => B.has(k));
        const mean = (xs: number[]) => xs.reduce((x, y) => x + y, 0) / xs.length;
        const c = pearson(keys.map((k) => mean(A.get(k)!)), keys.map((k) => mean(B.get(k)!)));
        const word = c == null ? "not enough overlap to tell"
          : Math.abs(c) >= 0.7 ? (c > 0 ? "rise and fall together" : "move in opposite directions")
          : Math.abs(c) >= 0.4 ? (c > 0 ? "loosely move together" : "loosely move opposite")
          : "look unrelated";
        pairs.push({ a: picked[i].id, b: picked[j].id, together: keys.length, correlation: c == null ? null : r3(c), reading: word });
      }
      const idle = each.filter((e) => !e.readings).map((e) => e.id);
      return {
        ok: true, question: a.question ? String(a.question).slice(0, 200) : undefined, minutes, bucketSeconds: bucket / 1000,
        capabilities: each, pairs,
        missing: missing.length ? missing : undefined,
        hint: idle.length ? `No readings yet for ${idle.join(", ")} in this window. Start them and ask again for a real comparison.` : undefined,
      };
    }
    case "get_saved_readings": {
      if (!account) return null;
      const s = a.id ? find(a.id) : undefined;
      if (a.id && !s) return nope(a.id);
      const hours = Number(a.hours) || 0;
      const body = {
        action: "readings",
        scope: s?.id || null,
        since: hours > 0 ? new Date(Date.now() - Math.min(720, hours) * 3_600_000).toISOString() : null,
        limit: Math.min(50, Math.max(1, Number(a.limit) || 20)),
      };
      try {
        const r = await fetch("/api/account", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        if (r.status === 401) return { ok: false, error: "Not signed in. Saved readings need an account; this browser's own history is in get_history." };
        if (!r.ok) return { ok: false, error: `Saved readings are unavailable right now (${r.status}).` };
        const j = await r.json();
        const rows: any[] = Array.isArray(j) ? j : Array.isArray(j?.readings) ? j.readings : [];
        return { ok: true, count: rows.length, readings: rows.slice(0, body.limit).map((x) => ({ ...x, data: x && typeof x.data === "object" ? small(x.data) : x?.data })) };
      } catch {
        return { ok: false, error: "Could not reach the server for saved readings." };
      }
    }
  }
  return null;
}
