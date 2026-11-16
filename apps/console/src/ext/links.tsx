import { FlaskConical, Link2, Play, Plus, Sparkles, Square } from "lucide-react";
import { getSession, isActive, request, series, setSource, stop, useVersion } from "../core/harness";
import type { Session } from "../core/types";
import { CapIcon, LayerGlyph, MechBadge, mechanismOf } from "../ui/icons";
import { Spark } from "../ui/kit";
import { listLinks, registerLink, registerView, type ConsoleCtx, type LinkDef } from "./registry";

// Layer 3: capabilities from different groups read side by side, with what they say together.
// Plugins add their own with registerLink(); the "Joined up" view lists every registered link.

const lastOf = (s: Session) => (s.count > 0 ? (s.last?.data as Record<string, any> | undefined) : undefined);
const sd = (xs: number[]) => { if (xs.length < 2) return 0; const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length); };
const r0 = (n: number) => Math.round(n);

export function registerLinks() {
  registerLink({
    id: "connect-place", order: 10, title: "Where and how you connect",
    plain: "Position plus connection type tells home Wi-Fi from a phone network at a known spot.",
    parts: [{ id: "place.geolocation", key: "accuracy" }, { id: "link.network", key: "rtt_ms" }],
    infer: (d) => {
      const g = d["place.geolocation"], n = d["link.network"];
      if (!g || !n) return null;
      const via = n.type === "wifi" ? "Wi-Fi" : n.type === "cellular" ? "a phone network" : n.type === "ethernet" ? "a cable" : `a ${n.effectiveType || "unknown"} class link`;
      return {
        headline: `On ${via}, placed to within ${r0(g.accuracy ?? 0)} m`,
        detail: `${n.downlink ? `About ${r0(n.downlink)} Mbps down` : "Speed unknown"}${n.rtt_ms ? `, ${r0(n.rtt_ms)} ms round trip` : ""}. Together these say whether you are at home, at work or moving.`,
        tone: "accent",
      };
    },
  });

  registerLink({
    id: "hand-or-desk", order: 20, title: "In hand or on a charger",
    plain: "Tilt plus battery state shows whether the device is held, set down or plugged in on a desk.",
    parts: [{ id: "motion.orientation", key: "beta" }, { id: "device.battery", key: "level" }],
    infer: (d, r) => {
      const o = d["motion.orientation"], b = d["device.battery"];
      if (!o || !b) return null;
      const t0 = Date.now() - 3000;
      const moving = sd(r["motion.orientation"].filter((x) => x._t >= t0).map((x) => Number(x.beta) || 0)) > 2;
      const plug = !!b.charging;
      const headline = moving ? (plug ? "Moving while plugged in: held near a charger" : "Moving on battery: in hand, maybe on the go") : plug ? "Still and plugged in: likely on a desk" : "Still on battery: set down somewhere";
      return { headline, detail: `Battery at ${r0(b.level ?? 0)}%, ${plug ? "charging" : "not charging"}. Tilt is ${moving ? "changing" : "steady"} over the last 3 seconds.`, tone: moving ? "ok" : "accent" };
    },
  });

  registerLink({
    id: "clock-vs-place", order: 30, title: "Does your clock match your position",
    plain: "Time zone plus location exposes a VPN, travel or a faked position when the two disagree.",
    parts: [{ id: "place.timezone", key: "offset_h" }, { id: "place.geolocation", key: "lon" }],
    infer: (d) => {
      const t = d["place.timezone"], g = d["place.geolocation"];
      if (!t || !g || typeof g.lon !== "number") return null;
      const expect = Math.round(g.lon / 15);
      const gap = Math.abs((t.offset_h ?? 0) - expect);
      const off = `UTC${t.offset_h >= 0 ? "+" : ""}${t.offset_h}`;
      return gap <= 1.5
        ? { headline: "Clock and position agree", detail: `${t.timezone} (${off}) fits a longitude of ${g.lon.toFixed(1)}.`, tone: "ok" }
        : { headline: `Clock and position are ${r0(gap)} hours apart`, detail: `${t.timezone} (${off}) does not fit a longitude of ${g.lon.toFixed(1)}. That points to a VPN, travel or a faked location.`, tone: "warn" };
    },
  });

  registerLink({
    id: "typing-attention", order: 40, title: "How you type when you are looking",
    plain: "Typing rhythm plus tab focus can tell a person from a script, and when you are distracted.",
    parts: [{ id: "motion.keystroke", key: "kpm", hint: "Type a few words anywhere on this page." }, { id: "motion.attention", key: "visible_s" }],
    infer: (d) => {
      const k = d["motion.keystroke"], a = d["motion.attention"];
      if (!k || !a) return null;
      return {
        headline: `${r0(k.kpm ?? 0)} keys a minute while this tab is ${a.state || "open"}`,
        detail: `${a.switches ?? 0} tab switch${a.switches === 1 ? "" : "es"}, ${r0(a.visible_s ?? 0)} s in view${k.mean_dwell ? `, keys held ${r0(k.mean_dwell)} ms on average` : ""}.`,
        tone: "accent",
      };
    },
  });

  registerView({
    id: "joined", label: "Joined up", order: 55,
    metric: () => {
      const all = listLinks();
      const n = all.filter((l) => l.parts.every((p) => getSession(p.id).count > 0)).length;
      return { value: `${n}/${all.length}`, sub: n ? "views with both sides" : "run a pair to join", tone: n ? "accent" : undefined };
    },
    Panel: JoinedPanel,
  });
}

const STATE_WORD: Record<string, string> = { idle: "not run", requesting: "asking", granted: "allowed", streaming: "live", denied: "refused", unsupported: "not here", error: "failed", stopped: "stopped" };

function LinkCard({ ctx, link }: { ctx: ConsoleCtx; link: LinkDef }) {
  const ss = link.parts.map((p) => getSession(p.id));
  const data: Record<string, Record<string, any> | undefined> = {};
  const recs: Record<string, Record<string, any>[]> = {};
  link.parts.forEach((p, i) => { data[p.id] = lastOf(ss[i]); recs[p.id] = ss[i].records.map((r) => ({ ...(r.data as Record<string, any>), _t: r.t })); });
  const inf = link.infer(data, recs);
  const live = ss.some(isActive);
  const isBlocked = (s: Session) => ["denied", "unsupported", "error"].includes(s.state);
  const blocked = ss.filter((s) => isBlocked(s) && !data[s.id]);
  const missing = link.parts.filter((p, i) => !data[p.id] && !isActive(ss[i]) && !isBlocked(ss[i]));
  const waiting = link.parts.filter((p, i) => !data[p.id] && isActive(ss[i]));
  const waitText = waiting.length ? `Waiting for ${waiting.map((p) => ctx.scopes.find((s) => s.id === p.id)?.name || p.id).join(" and ")}. ${waiting.map((p) => p.hint || "").join(" ").trim()}`.trim() : "Waiting for the first reading from each side.";
  const sample = () => blocked.forEach((s) => { setSource(s.id, "sim"); void request(s.id); });
  const runLabel = missing.length === link.parts.length ? (link.parts.length === 2 ? "Run both" : `Run all ${link.parts.length}`) : missing.length ? "Run the rest" : "";

  return (
    <article className={"jn-c" + (inf ? " has" : "")}>
      <header className="jn-h">
        <span className="jn-icons">
          {link.parts.map((p, i) => {
            const sc = ctx.scopes.find((s) => s.id === p.id);
            return <span key={p.id} className="jn-ic-w">{i > 0 && <Plus size={11} className="jn-plus" />}<span className="jn-ic">{sc ? <CapIcon scope={sc} size={15} /> : <Link2 size={15} />}</span></span>;
          })}
        </span>
        <h3>{link.title}</h3>
        <LayerGlyph layer={3} />
      </header>
      <p className="jn-p">{link.plain}</p>
      <div className="jn-parts">
        {link.parts.map((p, i) => {
          const sc = ctx.scopes.find((s) => s.id === p.id);
          const s = ss[i];
          const vals = p.key ? series(s.records, p.key, 40) : [];
          return (
            <button key={p.id} className={"jn-part st-" + s.state} onClick={() => ctx.select(p.id)} title="Open in the Inspector">
              <span className="jn-pn">{sc && <MechBadge mech={mechanismOf(sc)} />}<b>{p.label || sc?.name || p.id}</b></span>
              <span className="jn-ps"><i className="jn-dot" />{STATE_WORD[s.state] || s.state}{s.count > 0 && <em>{s.count} read{s.count === 1 ? "" : "s"}</em>}</span>
              {vals.length > 1 ? <Spark values={vals} w={120} h={20} /> : <span className="jn-flat" />}
            </button>
          );
        })}
      </div>
      <div className={"jn-out" + (inf ? " t-" + (inf.tone || "accent") : "")}>
        <Sparkles size={14} />
        {inf ? <div><b>{inf.headline}</b>{inf.detail && <span>{inf.detail}</span>}</div>
          : blocked.length ? <div><span>{blocked.map((s) => ctx.scopes.find((x) => x.id === s.id)?.name || s.id).join(" and ")} could not run here. Use a sample for {blocked.length === 1 ? "that side" : "those sides"} to see the join.</span></div>
          : <div><span>{live ? waitText : "Run them together to see what they say as a pair."}</span></div>}
      </div>
      <footer className="jn-f">
        {runLabel && <button className="btn primary" onClick={() => missing.forEach((p) => void request(p.id))}><Play size={12} />{runLabel}</button>}
        {blocked.length > 0 && <button className="btn" onClick={sample}><FlaskConical size={12} />Use a sample</button>}
        {live && <button className="btn ghost" onClick={() => link.parts.forEach((p) => stop(p.id))}><Square size={11} />Stop</button>}
      </footer>
    </article>
  );
}

function JoinedPanel({ ctx }: { ctx: ConsoleCtx }) {
  useVersion();
  const all = listLinks().filter((l) => l.parts.every((p) => ctx.scopes.some((s) => s.id === p.id)));
  if (!all.length) return <p className="empty">No linked views are registered.</p>;
  return <div className={"jn" + (ctx.chart.density === "compact" ? " dense" : "")}>{all.map((l) => <LinkCard key={l.id} ctx={ctx} link={l} />)}</div>;
}
