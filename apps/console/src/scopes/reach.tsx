import { useEffect, useState } from "react";
import type { InstrumentProps, ScopeDef } from "../core/types";
import { every, unsupported } from "../core/harness";
import { C, DOMAIN_COLOR, Frame, Readout, Waiting, lastData } from "../ui/kit";
import "./extras-identity-reach.css";

// Reach scopes: ways a site gets your attention or keeps your device awake.

const nav = () => navigator as any;
const COLOR = DOMAIN_COLOR.reach;

// Instruments have only the session, so live adapters register an action hook the instrument button calls.
const hooks: Record<string, (() => void) | null> = {};

function ActionButton({ id, label, ghost, disabled, "data-control": control }: { id: string; label: string; ghost?: boolean; disabled?: boolean; "data-control"?: string }) {
  return <button data-control={control ?? `${id}.action`} className={"eir-btn" + (ghost ? " ghost" : "")} disabled={disabled} onClick={() => hooks[id]?.()}>{label}</button>;
}

// ---------- Notifications ----------

type NoteRec = { permission: string; sent: number; granted: number; last_sent: number };

function notifyScope(): ScopeDef {
  const id = "reach.notifications";
  const make = (sim: boolean) => async (ctx: Parameters<ScopeDef["live"]>[0]) => {
    let sent = 0;
    let lastSent = 0;
    let permission = "granted";
    if (!sim) {
      if (!("Notification" in window)) unsupported("Notifications");
      permission = await Notification.requestPermission();
      if (permission !== "granted") throw new DOMException(`Notification permission ${permission}`, "NotAllowedError");
    }
    ctx.granted();
    const push = () => ctx.emit({ permission, sent, granted: 1, last_sent: lastSent } satisfies NoteRec);
    hooks[id] = () => {
      sent++;
      lastSent = Date.now();
      if (!sim) {
        try { new Notification("Console test notification", { body: `Test number ${sent}. This is what a site can show you, even in a background tab.` }); } catch (e: any) { ctx.log(`notification failed: ${e?.message || e}`); }
      }
      ctx.log(`test notification ${sent} sent`);
      push();
    };
    push();
    return () => { hooks[id] = null; };
  };
  return {
    id, name: "Notifications", domain: "reach", atlas: ["web.notify.notifications"],
    summary: "Asks permission to show notifications, then lets you send yourself a test one.",
    call: "Notification.requestPermission()", permission: "notifications", gesture: true,
    reveals: ["A channel to reach you when the tab is not in front", "Whether you tend to accept prompts (a behavioural signal)"],
    feeds: ["reach.badging", "reach.vibration"],
    metrics: [{ key: "sent", label: "sent" }, { key: "granted", label: "allowed" }],
    live: make(false), sim: (ctx) => { void make(true)(ctx); return () => { hooks[id] = null; }; },
    Instrument: ({ session }: InstrumentProps) => {
      const d = lastData<NoteRec>(session);
      return (
        <Frame
          visual={d ? (
            <div className="eir-wrap">
              <div className="eir-row"><span className="eir-big eir-num" style={{ color: COLOR }}>{d.sent}</span><span className="eir-state">test notifications sent</span></div>
              <ActionButton id={id} label="Send a test notification" />
              <span className="eir-state">{session.source === "sim" ? "Simulated: nothing is shown on your device." : "A real notification appears from your browser."}</span>
            </div>
          ) : <Waiting session={session} what="After you allow notifications, a button sends a test one." />}
          side={<Readout rows={[{ k: "Permission", v: d?.permission ?? null, hot: true }, { k: "Sent", v: d?.sent ?? null }, { k: "Last sent", v: d?.last_sent ? new Date(d.last_sent).toLocaleTimeString() : null }]} />}
        />
      );
    },
  };
}

// ---------- Wake lock ----------

type WakeRec = { active: number; held_s: number; total_s: number; releases: number; events: string[] };

function wakeScope(): ScopeDef {
  return {
    id: "reach.wake_lock", name: "Screen wake lock", domain: "reach", atlas: ["web.notify.screen-wake-lock", "web.display.wake-lock"],
    summary: "Keeps the screen from sleeping and counts how long it is held and when it is released.",
    call: 'navigator.wakeLock.request("screen")', permission: "screen-wake-lock", gesture: true,
    reveals: ["That you are actively watching this page (it stays awake only while you do)", "How long you stay, even without touching the screen"],
    feeds: ["motion.orientation"],
    metrics: [{ key: "held_s", label: "held", unit: "s", digits: 0 }, { key: "releases", label: "releases" }],
    params: [{ key: "reacquire", label: "Re-acquire after release", type: "bool", value: true, hint: "Browsers drop the lock when the tab is hidden; this asks again when it is visible." }],
    live: async (ctx) => {
      if (!nav().wakeLock?.request) unsupported("Screen Wake Lock");
      let sentinel: any = await nav().wakeLock.request("screen");
      ctx.granted();
      let since = Date.now();
      let carried = 0;
      let releases = 0;
      const events: string[] = [`${new Date().toLocaleTimeString()} acquired`];
      const watch = (s: any) => s.addEventListener("release", () => {
        carried += (Date.now() - since) / 1000;
        releases++;
        events.push(`${new Date().toLocaleTimeString()} released`);
        sentinel = null;
      });
      watch(sentinel);
      const onVis = async () => {
        if (document.visibilityState === "visible" && !sentinel && ctx.params.reacquire) {
          try { sentinel = await nav().wakeLock.request("screen"); since = Date.now(); events.push(`${new Date().toLocaleTimeString()} re-acquired`); watch(sentinel); } catch { /* ignore */ }
        }
      };
      document.addEventListener("visibilitychange", onVis);
      const tick = every(250, () => {
        const held = sentinel ? (Date.now() - since) / 1000 : 0;
        ctx.emit({ active: sentinel ? 1 : 0, held_s: held, total_s: carried + held, releases, events: events.slice(-6) } satisfies WakeRec);
      });
      return () => { tick(); document.removeEventListener("visibilitychange", onVis); try { sentinel?.release(); } catch { /* ignore */ } };
    },
    sim: (ctx) => {
      ctx.granted();
      const t0 = Date.now();
      let since = t0;
      let carried = 0;
      let releases = 0;
      let on = true;
      const events = [`${new Date().toLocaleTimeString()} acquired`];
      return every(250, () => {
        const now = Date.now();
        if (on && now - since > 20000) { carried += (now - since) / 1000; on = false; releases++; events.push(`${new Date().toLocaleTimeString()} released (tab hidden)`); since = now; }
        else if (!on && now - since > 3000) { on = true; since = now; events.push(`${new Date().toLocaleTimeString()} re-acquired`); }
        const held = on ? (now - since) / 1000 : 0;
        ctx.emit({ active: on ? 1 : 0, held_s: held, total_s: carried + held, releases, events: events.slice(-6) } satisfies WakeRec);
      });
    },
    Instrument: ({ session }: InstrumentProps) => {
      const d = lastData<WakeRec>(session);
      const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
      return (
        <Frame
          visual={d ? (
            <div className="eir-wrap">
              <div className="eir-row"><span className="eir-big eir-num" style={{ color: d.active ? COLOR : C.mute }}>{clock(d.held_s)}</span><span className="eir-state">{d.active ? "screen held awake" : "released"}</span></div>
              <div>
                <h4 className="eir-h">Events</h4>
                <div className="eir-events eir-mono">{d.events.map((e, i) => <span key={i}>{e}</span>)}</div>
              </div>
            </div>
          ) : <Waiting session={session} what="A counter of how long the screen has been held awake, plus release events." />}
          side={<Readout rows={[{ k: "Lock active", v: d ? d.active === 1 : null, hot: true }, { k: "Held now", v: d?.held_s ?? null, u: "s", digits: 0 }, { k: "Held in total", v: d?.total_s ?? null, u: "s", digits: 0 }, { k: "Releases", v: d?.releases ?? null }]} />}
        />
      );
    },
  };
}

// ---------- Vibration ----------

const PATTERNS: Record<string, number[]> = {
  short: [80],
  double: [80, 60, 80],
  heartbeat: [70, 90, 70, 400, 70, 90, 70],
  sos: [100, 80, 100, 80, 100, 200, 300, 80, 300, 80, 300, 200, 100, 80, 100, 80, 100],
  long: [600],
};
type VibRec = { pulses: number; sends: number; last_ms: number; pattern: string; at: number; supported: number };

function vibrationScope(): ScopeDef {
  const id = "reach.vibration";
  const make = (sim: boolean) => (ctx: Parameters<ScopeDef["live"]>[0]) => {
    let pulses = 0;
    let sends = 0;
    let at = 0;
    let lastMs = 0;
    const name = String(ctx.params.pattern || "double");
    const pat = PATTERNS[name] || PATTERNS.double;
    ctx.granted();
    const push = () => ctx.emit({ pulses, sends, last_ms: lastMs, pattern: name, at, supported: sim ? 0 : 1 } satisfies VibRec);
    const fire = () => {
      if (!sim && !nav().vibrate(pat)) ctx.log("vibrate() returned false: blocked or no motor");
      sends++;
      pulses += pat.filter((_, i) => i % 2 === 0).length;
      lastMs = pat.reduce((a, b) => a + b, 0);
      at = Date.now();
      push();
    };
    hooks[id] = fire;
    fire();
    return () => { hooks[id] = null; if (!sim) try { nav().vibrate(0); } catch { /* ignore */ } };
  };
  return {
    id, name: "Vibration", domain: "reach", atlas: ["web.actions.vibrate", "web.peripherals.vibration"],
    summary: "Buzzes the phone with a pattern you choose and counts the pulses sent.",
    call: "navigator.vibrate([80, 60, 80])", gesture: true,
    reveals: ["That the device has a vibration motor (a phone, not a laptop)", "A way to get your attention without sound"],
    feeds: ["reach.notifications"],
    metrics: [{ key: "pulses", label: "pulses" }, { key: "sends", label: "sends" }],
    params: [{ key: "pattern", label: "Pattern", type: "select", value: "double", options: Object.keys(PATTERNS) }],
    live: async (ctx) => { if (!nav().vibrate) unsupported("Vibration"); return make(false)(ctx); },
    sim: make(true),
    Instrument: ({ session }: InstrumentProps) => {
      const d = lastData<VibRec>(session);
      const [now, setNow] = useState(0);
      const pat = PATTERNS[d?.pattern || String(session.params.pattern || "double")] || PATTERNS.double;
      const total = pat.reduce((a, b) => a + b, 0);
      useEffect(() => {
        if (!d?.at) return;
        const h = setInterval(() => setNow(Date.now() - d.at), 40);
        return () => clearInterval(h);
      }, [d?.at]);
      const playing = d?.at ? now < total : false;
      return (
        <Frame
          visual={d ? (
            <div className="eir-wrap">
              <h4 className="eir-h">Pattern: {d.pattern} ({total} ms)</h4>
              <div className="eir-pat">
                {pat.map((ms, i) => <i key={i} className={i % 2 ? "gap" : ""} style={{ flexGrow: ms }} />)}
                {playing && <span className="eir-pat-cursor" style={{ left: `${(now / total) * 100}%` }} />}
              </div>
              <ActionButton id={id} label="Send again" />
              <span className="eir-state">{d.supported ? "Real vibration. Laptops and iPhones ignore it." : "Simulated: no motor is driven."}</span>
            </div>
          ) : <Waiting session={session} what="Bars show the on and off lengths of the vibration pattern." />}
          side={<Readout rows={[{ k: "Pulses sent", v: d?.pulses ?? null, hot: true }, { k: "Sends", v: d?.sends ?? null }, { k: "Last pattern", v: d?.last_ms ?? null, u: "ms", digits: 0 }]} />}
        />
      );
    },
  };
}

// ---------- Badging ----------

type BadgeRec = { badge: number; sets: number; cleared: number };

function badgeScope(): ScopeDef {
  const id = "reach.badging";
  const make = (sim: boolean) => async (ctx: Parameters<ScopeDef["live"]>[0]) => {
    const n = Math.max(0, Math.round(Number(ctx.params.count) || 0));
    let sets = 0;
    let badge = 0;
    let cleared = 0;
    const push = () => ctx.emit({ badge, sets, cleared } satisfies BadgeRec);
    if (!sim) await nav().setAppBadge(n);
    ctx.granted();
    badge = n;
    sets = 1;
    push();
    hooks[id] = () => {
      if (!sim) void nav().clearAppBadge?.();
      badge = 0;
      cleared++;
      push();
    };
    return () => { hooks[id] = null; if (!sim) try { void nav().clearAppBadge?.(); } catch { /* ignore */ } };
  };
  return {
    id, name: "App badge", domain: "reach", atlas: ["web.notify.badging", "web.os.badging"],
    summary: "Puts a number on the app icon, like unread mail. Works for installed web apps.",
    call: "navigator.setAppBadge(5)", gesture: true,
    reveals: ["A persistent number on your dock or home screen icon", "A nudge that pulls you back without a notification"],
    feeds: ["reach.notifications"],
    metrics: [{ key: "badge", label: "badge" }, { key: "sets", label: "sets" }],
    params: [{ key: "count", label: "Badge number", type: "number", value: 5, min: 1, max: 99, step: 1 }],
    live: async (ctx) => { if (!nav().setAppBadge) unsupported("Badging API"); return make(false)(ctx); },
    sim: (ctx) => { let stop: (() => void) | void; void make(true)(ctx).then((s) => { stop = s; }); return () => stop?.(); },
    Instrument: ({ session }: InstrumentProps) => {
      const d = lastData<BadgeRec>(session);
      return (
        <Frame
          visual={d ? (
            <div className="eir-wrap">
              <div className="eir-icon">
                <svg width="96" height="96" viewBox="0 0 96 96">
                  <rect x="10" y="10" width="68" height="68" rx="16" fill={C.bg} stroke={C.ink} strokeWidth="1.5" />
                  <path d="M28 52 L44 28 L60 52 Z" fill="none" stroke={C.ink} strokeWidth="1.5" strokeLinejoin="round" />
                  {d.badge > 0 && <g><circle className="eir-badge-dot" cx="76" cy="20" r="13" /><text x="76" y="25" textAnchor="middle" fontSize="14" fill={C.bg} fontFamily="var(--mono)">{d.badge > 99 ? "99+" : d.badge}</text></g>}
                </svg>
                <div className="eir-row"><ActionButton id={id} label="Clear badge" ghost disabled={d.badge === 0} /></div>
              </div>
              <span className="eir-state">{session.source === "sim" ? "Simulated icon. A real badge needs an installed web app." : "Look at the app icon in your dock or home screen."}</span>
            </div>
          ) : <Waiting session={session} what="An app icon with a red number badge." />}
          side={<Readout rows={[{ k: "Badge shown", v: d?.badge ?? null, hot: true, digits: 0 }, { k: "Times set", v: d?.sets ?? null }, { k: "Times cleared", v: d?.cleared ?? null }]} />}
        />
      );
    },
  };
}

export const reachScopes: ScopeDef[] = [notifyScope(), wakeScope(), vibrationScope(), badgeScope()];
