import { useState } from "react";
import type { Ctx, InstrumentProps, ScopeDef, Stop } from "../core/types";
import { every, noise, series, unsupported } from "../core/harness";
import { C, DOMAIN_COLOR, Frame, Gauge, Readout, Scope, Table, Waiting, fmt, lastData } from "../ui/kit";
import { TradeChart } from "../ui/trade";
import "./place-motion-link.css";

// The connection itself: what the browser says about the network, a live round trip time, and page load timing.

const COLOR = DOMAIN_COLOR.link;
const conn = () => (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection || null;

// ---------- Network ----------

type NetRec = { effectiveType: string | null; downlink: number | null; rtt_est: number | null; save_data: boolean | null; type: string | null; online: boolean; rtt_ms: number | null; jitter_ms: number | null; failures: number; samples: number };

async function netLive(ctx: Ctx): Promise<Stop> {
  if (typeof fetch !== "function") unsupported("fetch");
  ctx.granted();
  const rtts: number[] = [];
  let failures = 0, samples = 0, busy = false;
  const read = (rtt: number | null): NetRec => {
    const c = conn();
    const recent = rtts.slice(-10);
    const jitter = recent.length > 1 ? recent.slice(1).reduce((a, v, i) => a + Math.abs(v - recent[i]), 0) / (recent.length - 1) : null;
    return {
      effectiveType: c?.effectiveType ?? null, downlink: c?.downlink ?? null, rtt_est: c?.rtt ?? null, save_data: c ? !!c.saveData : null,
      type: c?.type ?? null, online: navigator.onLine, rtt_ms: rtt, jitter_ms: jitter, failures, samples,
    };
  };
  const probe = async () => {
    if (busy) return;
    busy = true;
    const t0 = performance.now();
    try {
      await fetch(location.href, { method: "HEAD", cache: "no-store" });
      const rtt = performance.now() - t0;
      rtts.push(rtt); samples++;
      ctx.emit(read(rtt));
    } catch {
      failures++; samples++;
      ctx.emit(read(null));
    } finally { busy = false; }
  };
  const stopTimer = every(2000, () => void probe());
  const c = conn();
  const on = () => ctx.emit(read(rtts[rtts.length - 1] ?? null));
  c?.addEventListener?.("change", on);
  window.addEventListener("online", on);
  window.addEventListener("offline", on);
  return () => { stopTimer(); c?.removeEventListener?.("change", on); window.removeEventListener("online", on); window.removeEventListener("offline", on); };
}

function netSim(ctx: Ctx): Stop {
  ctx.granted();
  const rtts: number[] = [];
  let n = 0;
  return every(1000, () => {
    n++;
    const t = Date.now() / 1000;
    const rtt = Math.max(8, 48 + 22 * Math.sin(t * 0.3) + noise(7) + (Math.random() < 0.06 ? 90 : 0));
    rtts.push(rtt);
    const rec = rtts.slice(-10);
    ctx.emit({
      effectiveType: "4g", downlink: Math.max(1, 18 + 8 * Math.sin(t * 0.15) + noise(1.5)), rtt_est: 50, save_data: false, type: "wifi", online: true,
      rtt_ms: rtt, jitter_ms: rec.length > 1 ? rec.slice(1).reduce((a, v, i) => a + Math.abs(v - rec[i]), 0) / (rec.length - 1) : null, failures: 0, samples: n,
    });
  });
}

function Network({ scope, session }: InstrumentProps) {
  const d = lastData<NetRec>(session);
  const R = session.records;
  const down = d?.downlink ?? null;
  return (
    <Frame
      visual={d ? (
        <div className="pml-link-wrap">
          <div>
            <TradeChart scope={scope} session={session} keys={["rtt_ms", "jitter_ms", "downlink"]} compact height={230} />
            <div className="pml-note" style={{ marginTop: 6, maxWidth: "none" }}>RTT is measured live: a HEAD request to this page, uncached, every 2 seconds. Any site can do the same.</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <Gauge value={down === null ? 0 : Math.min(1, Math.log10(1 + down) / Math.log10(101))} label={down === null ? "n/a" : fmt(down, 1)} sub="Mbps down" color={COLOR} />
            <div className="pml-note">{d.effectiveType ? `looks like ${d.effectiveType}` : "this browser hides link speed"}</div>
          </div>
        </div>
      ) : <Waiting session={session} what="A live round trip trace and a link speed dial." />}
      side={<Readout rows={[
        { k: "Round trip", v: d?.rtt_ms ?? null, u: "ms", digits: 0, hot: true },
        { k: "Jitter", v: d?.jitter_ms ?? null, u: "ms", digits: 1 },
        { k: "Link type", v: d?.effectiveType ?? null },
        { k: "Downlink", v: d?.downlink ?? null, u: "Mbps", digits: 1 },
        { k: "RTT estimate", v: d?.rtt_est ?? null, u: "ms", digits: 0 },
        { k: "Data saver", v: d?.save_data ?? null },
        { k: "Radio", v: d?.type ?? null },
        { k: "Failed probes", v: d?.failures ?? null, digits: 0 },
      ]} />}
    />
  );
}

// ---------- Timing ----------

type Row = { name: string; start: number; dns: number; connect: number; tls: number; ttfb: number; download: number; end: number };
type TimRec = { rows: Row[]; count: number; total_ms: number; ttfb_ms: number; dns_ms: number; tls_ms: number };

const PHASES: { k: keyof Row; label: string; color: string }[] = [
  { k: "dns", label: "dns", color: "#8a8a92" }, { k: "connect", label: "connect", color: "#d98a00" }, { k: "tls", label: "tls", color: "#bf3989" },
  { k: "ttfb", label: "ttfb", color: "#1f6feb" }, { k: "download", label: "download", color: COLOR },
];

function toRow(e: PerformanceResourceTiming | PerformanceNavigationTiming, name: string): Row {
  const dns = Math.max(0, e.domainLookupEnd - e.domainLookupStart);
  const tlsStart = e.secureConnectionStart > 0 ? e.secureConnectionStart : 0;
  const tls = tlsStart ? Math.max(0, e.connectEnd - tlsStart) : 0;
  const connect = Math.max(0, e.connectEnd - e.connectStart - tls);
  const ttfb = e.responseStart > 0 && e.requestStart > 0 ? Math.max(0, e.responseStart - e.requestStart) : 0;
  const download = e.responseEnd > 0 && e.responseStart > 0 ? Math.max(0, e.responseEnd - e.responseStart) : 0;
  const start = e.startTime;
  return { name, start, dns, connect, tls, ttfb, download, end: e.responseEnd || start + dns + connect + tls + ttfb + download };
}

const short = (u: string) => { try { const x = new URL(u, location.href); return (x.pathname.split("/").filter(Boolean).pop() || x.host) + (x.host === location.host ? "" : " @" + x.host); } catch { return u; } };

function readTiming(): TimRec | null {
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (!nav) return null;
  const page = toRow(nav, "page (document)");
  const res = (performance.getEntriesByType("resource") as PerformanceResourceTiming[]).filter((r) => r.responseEnd > 0).sort((a, b) => b.duration - a.duration).slice(0, 12).map((r) => toRow(r, short(r.name)));
  const rows = [page, ...res].sort((a, b) => a.start - b.start);
  return { rows, count: performance.getEntriesByType("resource").length, total_ms: nav.loadEventEnd > 0 ? nav.loadEventEnd : nav.responseEnd, ttfb_ms: page.ttfb, dns_ms: page.dns, tls_ms: page.tls };
}

const timLive = async (ctx: Ctx): Promise<Stop> => {
  if (!performance.getEntriesByType) unsupported("Performance timing");
  ctx.granted();
  return every(2000, () => { const r = readTiming(); if (r) ctx.emit({ ...r }); });
};

function timSim(ctx: Ctx): Stop {
  ctx.granted();
  const mk = (name: string, start: number, dns: number, connect: number, tls: number, ttfb: number, download: number): Row => ({ name, start, dns, connect, tls, ttfb, download, end: start + dns + connect + tls + ttfb + download });
  const all = [
    mk("page (document)", 0, 12, 24, 31, 86, 18), mk("app.css", 140, 0, 0, 0, 34, 12), mk("main.js", 142, 0, 0, 0, 52, 61), mk("vendor.js", 143, 0, 0, 0, 58, 94),
    mk("inter.woff2 @fonts.gstatic.com", 210, 18, 22, 28, 41, 9), mk("hero.webp", 260, 0, 0, 0, 48, 120), mk("collect @analytics.example", 330, 14, 20, 26, 62, 4),
    mk("tag.js @cdn.tracker.example", 340, 16, 19, 24, 44, 22), mk("pixel.gif @ads.example", 420, 21, 25, 30, 70, 2), mk("logo.svg", 270, 0, 0, 0, 22, 5),
  ];
  let i = 2;
  return every(700, () => {
    i = Math.min(all.length, i + 1);
    const rows = all.slice(0, i);
    ctx.emit({ rows, count: rows.length, total_ms: Math.max(...rows.map((r) => r.end)), ttfb_ms: rows[0].ttfb, dns_ms: rows[0].dns, tls_ms: rows[0].tls });
  });
}

function Timing({ session }: InstrumentProps) {
  const [pick, setPick] = useState<number | null>(null);
  const d = lastData<TimRec>(session);
  const rows = d?.rows || [];
  const span = Math.max(1, ...rows.map((r) => r.end));
  const sel = pick !== null ? rows[pick] : rows[0];
  return (
    <Frame
      visual={d ? (
        <div className="pml-vis" style={{ justifyContent: "flex-start", alignItems: "stretch" }}>
          <div className="pml-wf">
            {rows.map((r, i) => {
              let x = r.start;
              return (
                <div key={i} data-control={`link.timing.row-${i}`} className="pml-wf-row" onClick={() => setPick(i)} style={{ cursor: "pointer", color: sel === r ? C.ink : undefined }}>
                  <span title={r.name}>{r.name}</span>
                  <div className="pml-wf-track">
                    {PHASES.map((p) => {
                      const w = r[p.k] as number;
                      const left = x;
                      x += w;
                      return w > 0 ? <i key={p.k} title={`${p.label} ${w.toFixed(0)} ms`} style={{ left: `${(left / span) * 100}%`, width: `${(w / span) * 100}%`, background: p.color }} /> : null;
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="pml-legend" style={{ justifyContent: "center" }}>{PHASES.map((p) => <span key={p.k}><i style={{ background: p.color }} />{p.label}</span>)}</div>
          <div className="pml-note" style={{ alignSelf: "center", padding: 6 }}>Third party hosts leak your visit here: each connect and tls bar is a server that learned you opened this page. Cross-origin rows with no bars hide their timing.</div>
        </div>
      ) : <Waiting session={session} what="A waterfall of how the page and its resources loaded: dns, connect, tls, first byte, download." />}
      side={
        <>
          <Readout rows={[
            { k: "Page first byte", v: d?.ttfb_ms ?? null, u: "ms", digits: 0, hot: true },
            { k: "Page DNS", v: d?.dns_ms ?? null, u: "ms", digits: 0 },
            { k: "Page TLS", v: d?.tls_ms ?? null, u: "ms", digits: 0 },
            { k: "Load complete", v: d?.total_ms ?? null, u: "ms", digits: 0 },
            { k: "Resources loaded", v: d?.count ?? null, digits: 0 },
          ]} />
          {sel && <Table head={["Phase", "ms"]} rows={PHASES.map((p) => [p.label, fmt(sel[p.k] as number, 0)])} />}
        </>
      }
    />
  );
}

export const linkScopes: ScopeDef[] = [
  {
    id: "link.network", name: "Network quality", domain: "link",
    atlas: ["web.network.connection-info", "web.network.network-information", "web.perf.network-information"],
    summary: "Reads the connection type and speed the browser reports, and measures a live round trip time.",
    call: "navigator.connection; fetch(location.href, { method: 'HEAD', cache: 'no-store' })",
    passive: true,
    reveals: ["Whether you are on Wi-Fi, mobile data or a slow link", "Your latency, which hints at distance and congestion", "Whether data saver is on"],
    feeds: ["link.timing", "place.geolocation"],
    metrics: [{ key: "rtt_ms", label: "RTT", unit: "ms", digits: 0 }, { key: "downlink", label: "downlink", unit: "Mbps", digits: 1 }, { key: "jitter_ms", label: "jitter", unit: "ms", digits: 1 }],
    live: netLive, sim: netSim, Instrument: Network,
  },
  {
    id: "link.timing", name: "Load timing", domain: "link",
    atlas: ["web.perf.navigation-resource-timing"],
    summary: "Shows how long each step of loading this page took, for the page and the top resources.",
    call: "performance.getEntriesByType('navigation' | 'resource')",
    passive: true,
    reveals: ["Which third party servers this page contacts", "Whether files came from cache, which hints at your history", "Your network speed and distance to each server"],
    feeds: ["link.network"],
    metrics: [{ key: "ttfb_ms", label: "TTFB", unit: "ms", digits: 0 }, { key: "total_ms", label: "load", unit: "ms", digits: 0 }, { key: "count", label: "resources" }],
    live: timLive, sim: timSim, Instrument: Timing,
  },
];
