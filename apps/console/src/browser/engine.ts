import { useEffect, useRef, useState } from "react";

// Live internals of this browser tab, sampled in the page itself. Nothing leaves the device.

export type Internals = {
  fps: number; lag: number; longTasks: number; heapMB: number | null; heapLimitMB: number | null;
  fpsH: number[]; lagH: number[]; heapH: number[];
  net: { type: string; down: number | null; rtt: number | null; save: boolean } ;
  storage: { usedMB: number | null; quotaMB: number | null; persisted: boolean | null };
  cores: number | null; memGB: number | null; online: boolean; visible: boolean; battery: { level: number; charging: boolean } | null;
  gpu: { vendor: string; renderer: string; webgl2: boolean; maxTex: number | null } | null;
  nav: { ttfb: number | null; dcl: number | null; load: number | null; transfer: number | null; resources: number };
  viewport: { w: number; h: number; sw: number; sh: number; dpr: number; orient: string };
};

const push = (a: number[], v: number, n = 60) => [...a.slice(-(n - 1)), v];
const n = navigator as any;

function gpuInfo(): Internals["gpu"] {
  try {
    const c = document.createElement("canvas");
    const gl: any = c.getContext("webgl2") || c.getContext("webgl");
    if (!gl) return null;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      vendor: String(ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)),
      renderer: String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)),
      webgl2: typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext,
      maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE) ?? null,
    };
  } catch { return null; }
}

function navTiming(): Internals["nav"] {
  const e = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  return {
    ttfb: e ? Math.round(e.responseStart) : null, dcl: e ? Math.round(e.domContentLoadedEventEnd) : null,
    load: e && e.loadEventEnd ? Math.round(e.loadEventEnd) : null, transfer: e ? Math.round(e.transferSize / 1024) : null,
    resources: performance.getEntriesByType("resource").length,
  };
}

function viewport(): Internals["viewport"] {
  return { w: innerWidth, h: innerHeight, sw: screen.width, sh: screen.height, dpr: devicePixelRatio || 1, orient: screen.orientation?.type || (innerWidth > innerHeight ? "landscape" : "portrait") };
}

export function useInternals(active = true): Internals {
  const [s, setS] = useState<Internals>(() => ({
    fps: 0, lag: 0, longTasks: 0, heapMB: null, heapLimitMB: null, fpsH: [], lagH: [], heapH: [],
    net: { type: "unknown", down: null, rtt: null, save: false }, storage: { usedMB: null, quotaMB: null, persisted: null },
    cores: n.hardwareConcurrency ?? null, memGB: n.deviceMemory ?? null, online: navigator.onLine, visible: !document.hidden,
    battery: null, gpu: null, nav: navTiming(), viewport: viewport(),
  }));
  const st = useRef({ frames: 0, last: performance.now(), long: 0, fpsH: [] as number[], lagH: [] as number[], heapH: [] as number[], lag: 0, raf: 0 });

  useEffect(() => {
    if (!active) return;
    const r = st.current;
    let alive = true;
    const loop = () => { r.frames++; r.raf = requestAnimationFrame(loop); };
    r.raf = requestAnimationFrame(loop);
    let po: PerformanceObserver | undefined;
    try { po = new PerformanceObserver((l) => { r.long += l.getEntries().length; }); po.observe({ entryTypes: ["longtask"] }); } catch { /* unsupported */ }
    // Event loop lag: how late a 100 ms timer fires.
    let expect = performance.now() + 100;
    const lagT = setInterval(() => { const now = performance.now(); r.lag = Math.max(0, now - expect); expect = now + 100; }, 100);
    const extras = { battery: null as Internals["battery"], gpu: gpuInfo(), storage: { usedMB: null as number | null, quotaMB: null as number | null, persisted: null as boolean | null } };
    n.getBattery?.().then((b: any) => { extras.battery = { level: b.level, charging: b.charging }; }).catch(() => {});
    navigator.storage?.estimate?.().then((e) => { extras.storage.usedMB = (e.usage || 0) / 1048576; extras.storage.quotaMB = (e.quota || 0) / 1048576; }).catch(() => {});
    navigator.storage?.persisted?.().then((p) => { extras.storage.persisted = p; }).catch(() => {});
    const tick = setInterval(() => {
      if (!alive) return;
      const now = performance.now();
      const fps = Math.round((r.frames * 1000) / (now - r.last));
      r.frames = 0; r.last = now;
      const mem = (performance as any).memory;
      const heap = mem ? mem.usedJSHeapSize / 1048576 : null;
      r.fpsH = push(r.fpsH, fps); r.lagH = push(r.lagH, r.lag); if (heap !== null) r.heapH = push(r.heapH, heap);
      const c = n.connection;
      setS({
        fps, lag: r.lag, longTasks: r.long, heapMB: heap, heapLimitMB: mem ? mem.jsHeapSizeLimit / 1048576 : null,
        fpsH: r.fpsH, lagH: r.lagH, heapH: r.heapH,
        net: { type: c?.effectiveType || "unknown", down: c?.downlink ?? null, rtt: c?.rtt ?? null, save: !!c?.saveData },
        storage: { ...extras.storage }, cores: n.hardwareConcurrency ?? null, memGB: n.deviceMemory ?? null,
        online: navigator.onLine, visible: !document.hidden, battery: extras.battery, gpu: extras.gpu, nav: navTiming(), viewport: viewport(),
      });
    }, 1000);
    return () => { alive = false; cancelAnimationFrame(r.raf); clearInterval(tick); clearInterval(lagT); po?.disconnect(); };
  }, [active]);
  return s;
}

export type PermState = "granted" | "denied" | "prompt" | "unsupported";
export const PERMS = ["geolocation", "camera", "microphone", "notifications", "clipboard-read", "clipboard-write", "midi", "persistent-storage", "screen-wake-lock", "accelerometer", "gyroscope", "magnetometer", "ambient-light-sensor", "background-sync", "push", "storage-access", "window-management"] as const;

export function usePermissions(): Record<string, PermState> {
  const [p, setP] = useState<Record<string, PermState>>({});
  useEffect(() => {
    let alive = true;
    const subs: PermissionStatus[] = [];
    (async () => {
      const out: Record<string, PermState> = {};
      await Promise.all(PERMS.map(async (name) => {
        try {
          const q = await navigator.permissions.query({ name: name as PermissionName });
          out[name] = q.state as PermState;
          q.onchange = () => alive && setP((o) => ({ ...o, [name]: q.state as PermState }));
          subs.push(q);
        } catch { out[name] = "unsupported"; }
      }));
      if (alive) setP(out);
    })();
    return () => { alive = false; subs.forEach((q) => (q.onchange = null)); };
  }, []);
  return p;
}
