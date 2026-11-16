import { MapPin, Compass, MousePointer2, Camera, Mic, Radio, Cpu, Fingerprint, Wifi, KeyRound, Cookie, Bell, Clipboard, Sparkles } from "lucide-react";
import { Play } from "lucide-react";
import { allSessions, getSession, isActive, request } from "../core/harness";
import { blockedIds, grantedIds, marks, recent, useTimeline, type Sample } from "../core/timeline";
import { scoreFor, supportOf } from "../browser/profile";
import { MECH, mechanismOf } from "../ui/icons";
import { BarList, TimeChart, short, type BarRow } from "../ui/charts";
import { defineGroup, registerView, type ConsoleCtx } from "./registry";

// The built in groups and metric views. They register through the same calls a plugin uses.

const G = (id: string, label: string, blurb: string, icon: any, rest: { ids?: string[]; atlasGroups?: string[]; prefix?: string }, order: number) =>
  defineGroup({
    id, label, blurb, icon, order, ids: rest.ids, atlasGroups: rest.atlasGroups,
    match: rest.prefix ? (s) => s.id.startsWith(rest.prefix!) : undefined,
  });

export function registerBuiltins() {
  G("location", "Location", "Where you are and which region you live in", MapPin, { ids: ["place.geolocation", "place.timezone"], atlasGroups: ["location-motion", "locale-preferences"] }, 10);
  G("motion", "Motion and sensors", "How the device moves and what it senses", Compass, { ids: ["motion.orientation", "motion.accelerometer", "place.compass", "capture.light"] }, 20);
  G("activity", "Activity", "How you type, point and pay attention", MousePointer2, { ids: ["motion.pointer", "motion.keystroke", "motion.attention"] }, 30);
  G("camera", "Camera and screen", "Video from the camera or a shared screen", Camera, { ids: ["capture.camera", "capture.screen"], atlasGroups: ["camera-mic-screen"] }, 40);
  G("audio", "Microphone and speech", "Sound from the microphone and speech to text", Mic, { ids: ["capture.microphone", "capture.speech"] }, 50);
  G("nearby", "Nearby devices", "Bluetooth, USB, serial, MIDI and other hardware", Radio, { prefix: "surroundings.", atlasGroups: ["peripherals-hardware"] }, 60);
  G("device", "Device", "Battery, hardware, screens and storage", Cpu, { prefix: "device.", atlasGroups: ["device-system-profile", "display-window"] }, 70);
  G("fingerprint", "Fingerprint", "Rendering quirks that identify this browser", Fingerprint, { prefix: "fingerprint.", atlasGroups: ["rendering-fingerprint"] }, 80);
  G("network", "Network and timing", "Connection quality and load timing", Wifi, { prefix: "link.", atlasGroups: ["network-connectivity", "timing-performance"] }, 90);
  G("identity", "Identity and payments", "Passkeys, contacts, sign in and payments", KeyRound, { ids: ["identity.passkeys", "identity.contacts"], atlasGroups: ["identity-auth", "personal-data-contacts", "payments-commerce"] }, 100);
  G("tracking", "Storage and tracking", "Cookies, storage and cross site tracking", Cookie, { ids: ["identity.storage_tracking"], atlasGroups: ["cross-site-tracking", "files-storage"] }, 110);
  G("reach", "Notifications and install", "Notifications, background work and install", Bell, { prefix: "reach.", atlasGroups: ["notifications-background", "os-integration-install"] }, 120);
  G("input", "Input and clipboard", "Clipboard and input APIs", Clipboard, { ids: ["capture.clipboard"], atlasGroups: ["input-clipboard"] }, 130);
  G("actions", "Page actions and AI", "Share, fullscreen, dialogs and on device AI", Sparkles, { atlasGroups: ["page-actions", "on-device-ai"] }, 140);

  registerView({ id: "silent", label: "Readable silently", order: 10, metric: (c) => ({ value: c.passive ? String(c.passive.length) : "...", sub: "signals, no prompt", tone: "warn" }), Panel: SilentPanel });
  registerView({ id: "live", label: "Live now", order: 20, metric: () => { const n = allSessions().filter(isActive).length; return { value: String(n), sub: n ? "streaming" : "nothing running", tone: n ? "ok" : undefined, ...trend((x) => x.live) }; }, Panel: LivePanel });
  registerView({ id: "records", label: "Records", order: 30, metric: () => { const n = allSessions().reduce((a, s) => a + s.count, 0); return { value: short(n), sub: "collected this session", ...trend((x) => x.rate, false) }; }, Panel: RecordsPanel });
  registerView({ id: "granted", label: "Granted", order: 40, metric: () => ({ value: String(grantedIds().length), sub: "allowed this session", tone: "accent", ...trend((x) => x.granted) }), Panel: GrantedPanel });
  registerView({ id: "blocked", label: "Blocked", order: 50, metric: () => ({ value: String(blockedIds().length), sub: "refused or missing", tone: blockedIds().length ? "err" : undefined, ...trend((x) => x.blocked) }), Panel: BlockedPanel });
  registerView({ id: "supported", label: "Supported here", order: 60, metric: (c) => ({ value: String(scoreFor(c.atlas, c.profile.column).pct), unit: "%", sub: `of ${c.atlas.nodes.length} attributes` }), Panel: SupportedPanel });
}

/* ---------- helpers ---------- */

/** The last minute of one timeline field as a KPI spark; delta is the change across it. */
function trend(pick: (s: Sample) => number, withDelta = true): { spark?: number[]; delta?: number } {
  const v = recent(60).map(pick);
  if (v.length < 2) return {};
  return { spark: v, delta: withDelta ? v[v.length - 1] - v[0] : undefined };
}

/** Bucket a capability by the viewer's grouping choice. */
function bucket(c: ConsoleCtx, id: string, by: "group" | "capability" | "access") {
  if (by === "capability") return name(c, id);
  if (by === "access") { const s = c.scopes.find((x) => x.id === id); return s ? MECH[mechanismOf(s)].label : "Other"; }
  return c.groupOf(id).label;
}

/** Fold per capability rows into the chosen grouping. "auto" keeps a view's natural rows. */
function grouped(c: ConsoleCtx, rows: BarRow[], natural: "group" | "capability"): BarRow[] {
  const by = c.chart.by === "auto" ? natural : c.chart.by;
  if (by === "capability") return rows;
  const m = new Map<string, { v: number; n: number }>();
  rows.forEach((r) => { const k = bucket(c, r.key, by); const e = m.get(k) || { v: 0, n: 0 }; e.v += r.value; e.n++; m.set(k, e); });
  return [...m.entries()].map(([k, e]) => ({ key: k, label: k, value: e.v, sub: `${e.n} capabilit${e.n === 1 ? "y" : "ies"}` })).sort((a, b) => b.value - a.value);
}

/** An empty chart with one obvious thing to do. */
function Start({ text, label, id }: { text: string; label: string; id: string }) {
  return (
    <span className="tc-start">
      <span>{text}</span>
      <button className="btn primary" onClick={() => void request(id)}><Play size={12} />{label}</button>
    </span>
  );
}

const name = (c: ConsoleCtx, id: string) => c.scopes.find((s) => s.id === id)?.name || id;
const inRange = (samples: Sample[], range: number) => { const t0 = Date.now() - range * 1000; return samples.filter((s) => s.t >= t0); };

function Split({ chart, side, title }: { chart: React.ReactNode; side: React.ReactNode; title: string }) {
  return (
    <div className="vp">
      <div className="vp-chart">{chart}</div>
      <div className="vp-side"><h4>{title}</h4><div className="vp-scroll">{side}</div></div>
    </div>
  );
}

function scopeRows(c: ConsoleCtx, ids: string[], val: (id: string) => number, disp?: (id: string) => React.ReactNode, sub?: (id: string) => React.ReactNode): BarRow[] {
  return ids.map((id) => ({ key: id, label: name(c, id), sub: sub ? sub(id) : c.groupOf(id).label, value: val(id), display: disp?.(id), onClick: () => c.select(id) }))
    .sort((a, b) => b.value - a.value);
}

/* ---------- panels ---------- */

function SilentPanel({ ctx }: { ctx: ConsoleCtx }) {
  const sig = ctx.passive || [];
  const by = new Map<string, number>();
  sig.forEach((s) => by.set(s.group, (by.get(s.group) || 0) + 1));
  const rows: BarRow[] = [...by.entries()].map(([g, n]) => ({ key: g, label: g, value: n, tone: "var(--warn-soft)" })).sort((a, b) => b.value - a.value);
  return (
    <Split title="What any site reads without asking" chart={
      <div className="vp-pad">
        <p className="vp-lede">Any page can read <b>{sig.length}</b> signals from this browser with no prompt at all. This is the same surface fingerprinting scripts use.</p>
        <BarList rows={rows} empty="Reading signals" />
      </div>
    } side={
      <div className="kv">{sig.slice(0, 80).map((s) => <div key={s.id} title={s.detail}><span>{s.label}</span><b>{s.value}</b></div>)}</div>
    } />
  );
}

function LivePanel({ ctx }: { ctx: ConsoleCtx }) {
  const tl = useTimeline();
  const live = allSessions().filter(isActive);
  return (
    <Split title={`Running now (${live.length})`}
      chart={<TimeChart points={tl.map((s) => ({ t: s.t, v: s.live }))} range={ctx.range} step marks={marks()} unit="live" kind={ctx.chart.type} empty={<Start text="Nothing is running." label="Track the pointer" id="motion.pointer" />} />}
      side={<BarList rows={grouped(ctx, scopeRows(ctx, live.map((s) => s.id), (id) => getSession(id).hz, (id) => getSession(id).hz.toFixed(1) + " Hz"), "capability")} empty={<Start text="Nothing running right now." label="Track the pointer" id="motion.pointer" />} />} />
  );
}

function RecordsPanel({ ctx }: { ctx: ConsoleCtx }) {
  const tl = useTimeline();
  const by = new Map<string, number>();
  inRange(tl, ctx.range).forEach((s) => Object.entries(s.per).forEach(([id, n]) => by.set(id, (by.get(id) || 0) + n)));
  const rows = grouped(ctx, [...by.entries()].map(([id, n]) => ({ key: id, label: name(ctx, id), sub: ctx.groupOf(id).label, value: n, onClick: () => ctx.select(id) })).sort((a, b) => b.value - a.value), "group");
  return (
    <Split title={`Records by ${{ auto: "group", group: "group", capability: "capability", access: "how it is accessed" }[ctx.chart.by]} in this window`}
      chart={<TimeChart points={tl.map((s) => ({ t: s.t, v: s.rate }))} range={ctx.range} marks={marks()} unit="rec/s" kind={ctx.chart.type} empty={<Start text="No records yet. Start something to watch data flow." label="Track the pointer" id="motion.pointer" />} />}
      side={<BarList rows={rows} empty={<Start text="No records in this window." label="Track the pointer" id="motion.pointer" />} />} />
  );
}

function GrantedPanel({ ctx }: { ctx: ConsoleCtx }) {
  const tl = useTimeline();
  const ids = grantedIds();
  return (
    <Split title={`Allowed (${ids.length})`}
      chart={<TimeChart points={tl.map((s) => ({ t: s.t, v: s.granted }))} range={ctx.range} step marks={marks().filter((m) => m.kind === "granted")} unit="granted" kind={ctx.chart.type} empty={<Start text="Nothing granted yet. A prompt appears when you ask." label="Ask for location" id="place.geolocation" />} />}
      side={<BarList rows={grouped(ctx, scopeRows(ctx, ids, (id) => getSession(id).count, (id) => short(getSession(id).count) + " rec"), "capability")} empty="Nothing granted yet" />} />
  );
}

function BlockedPanel({ ctx }: { ctx: ConsoleCtx }) {
  const tl = useTimeline();
  const ids = blockedIds();
  return (
    <Split title={`Refused or missing (${ids.length})`}
      chart={<TimeChart points={tl.map((s) => ({ t: s.t, v: s.blocked }))} range={ctx.range} step marks={marks().filter((m) => m.kind === "denied" || m.kind === "error")} unit="blocked" kind={ctx.chart.type} empty="Nothing blocked yet." />}
      side={<BarList rows={grouped(ctx, scopeRows(ctx, ids, () => 1, (id) => getSession(id).state, (id) => getSession(id).error || ctx.groupOf(id).label), "capability")} empty="Nothing blocked" />} />
  );
}

function SupportedPanel({ ctx }: { ctx: ConsoleCtx }) {
  const col = ctx.profile.column;
  const per = new Map<string, { y: number; p: number; n: number }>();
  ctx.atlas.nodes.forEach((n) => {
    const g = ctx.groupOfNode(n).label;
    const e = per.get(g) || { y: 0, p: 0, n: 0 };
    const s = supportOf(n.sup, col);
    if (s === "y") e.y++; else if (s === "p" || s === "f") e.p++; else e.n++;
    per.set(g, e);
  });
  const max = Math.max(1, ...[...per.values()].map((e) => e.y + e.p + e.n));
  const rows: BarRow[] = [...per.entries()].map(([g, e]) => ({
    key: g, label: g, value: e.y + e.p + e.n, display: Math.round((e.y / (e.y + e.p + e.n)) * 100) + "%",
    segs: [{ v: e.y, c: "var(--ok)" }, { v: e.p, c: "var(--warn)" }, { v: e.n, c: "var(--line-strong)" }],
  })).sort((a, b) => b.value - a.value);
  const o = scoreFor(ctx.atlas, col);
  return (
    <Split title={`${ctx.profile.brand} at a glance`} chart={
      <div className="vp-pad">
        <div className="legend"><span><i style={{ background: "var(--ok)" }} />supported</span><span><i style={{ background: "var(--warn)" }} />partial or flag</span><span><i style={{ background: "var(--line-strong)" }} />missing</span></div>
        <BarList rows={rows} max={max} />
      </div>
    } side={
      <div className="kv">
        <div><span>Browser</span><b>{ctx.profile.brand} {ctx.profile.version.split(".")[0]}</b></div>
        <div><span>Engine</span><b>{ctx.profile.engine}</b></div>
        <div><span>System</span><b>{ctx.profile.os} {ctx.profile.osVersion}</b></div>
        <div><span>Supported</span><b>{o.yes}</b></div>
        <div><span>Partial</span><b>{o.partial}</b></div>
        <div><span>Behind a flag</span><b>{o.flag}</b></div>
        <div><span>Missing</span><b>{o.no}</b></div>
        <div><span>Secure context</span><b>{ctx.profile.secure ? "yes" : "no"}</b></div>
        <div><span>Data from</span><b>{ctx.profile.columnLabel}</b></div>
      </div>
    } />
  );
}
