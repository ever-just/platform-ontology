import type { ReactNode } from "react";
import { AppWindow, FileJson, ListChecks, Puzzle, RefreshCw } from "lucide-react";
import type { Ctx, InstrumentProps, ScopeDef, Stop } from "../core/types";
import { Frame, Readout, Table, Waiting, lastData } from "../ui/kit";
import "./page-controls.css";

// Manifest and script surfaces: what a page can read about installation, its own manifest, the
// background machinery behind it, the traces extensions leave and the policy that gates features.
// Every scope here only reads. Nothing is prompted, requested or changed, and Stop removes the
// listeners, observers, timers and hidden frames the scope created.

const errText = (e: any) => (e?.name ? `${e.name}: ${e.message}` : String(e));
const short = (s: string, n = 56) => (s.length > n ? s.slice(0, n) + "…" : s);
const yn = (b: boolean) => (b ? "yes" : "no");

/** Live: read now, again whenever a watcher fires, and on an optional timer. Stop undoes it all. */
function watchRead(ctx: Ctx, o: { read: () => any; watch?: (re: () => void) => Stop | void; every?: number }): Stop {
  let alive = true;
  let busy = false;
  let again = false;
  const re = () => {
    if (!alive) return;
    if (busy) { again = true; return; }
    busy = true;
    Promise.resolve()
      .then(o.read)
      .then(
        (d) => { if (alive) ctx.emit({ ...d, error: "" }); },
        (e) => { ctx.log(errText(e)); if (alive) ctx.emit({ error: errText(e) }); },
      )
      .finally(() => { busy = false; if (again) { again = false; re(); } });
  };
  ctx.granted();
  const unwatch = o.watch?.(re);
  const timer = o.every ? window.setInterval(re, o.every) : 0;
  re();
  return () => {
    alive = false;
    if (timer) clearInterval(timer);
    try { unwatch?.(); } catch { /* best effort */ }
  };
}

/** Simulated: a fixed pretend page, so the instrument renders anywhere and the real tab is untouched. */
function fixed(ctx: Ctx, data: Record<string, unknown>): Stop {
  ctx.granted();
  ctx.emit({ ...data, error: "" });
  return () => {};
}

function Note({ error, sim, children }: { error?: string; sim: boolean; children?: ReactNode }) {
  return (
    <div className="pc">
      {children}
      {error && <p className="pc-msg err">{error}</p>}
      <p className="pc-foot">
        {sim ? "Simulated: a pretend page, your browser is untouched." : "Live and read only: nothing is changed, requested or prompted. Stop removes the listeners."}
      </p>
    </div>
  );
}

// ---------- 1. Install state ----------

const MODES = ["browser", "minimal-ui", "standalone", "fullscreen", "window-controls-overlay", "tabbed", "picture-in-picture"];
type RelatedApp = { platform?: string; id?: string; url?: string };
type InstallRec = {
  mode: string; matches: Record<string, boolean>; navStandalone: boolean | null;
  relatedSupported: boolean; related: RelatedApp[]; relatedNote: string;
  promptSeen: boolean; installedEvent: boolean; promptNote: string; error?: string;
};

function installLive(ctx: Ctx) {
  const nav = navigator as any;
  let promptSeen = false;
  let installedEvent = false;
  const onPrompt = () => { promptSeen = true; };
  const onInstalled = () => { installedEvent = true; };
  window.addEventListener("beforeinstallprompt", onPrompt);
  window.addEventListener("appinstalled", onInstalled);
  return watchRead(ctx, {
    read: async (): Promise<InstallRec> => {
      const matches: Record<string, boolean> = {};
      MODES.forEach((m) => { matches[m] = window.matchMedia(`(display-mode: ${m})`).matches; });
      const mode = MODES.find((m) => matches[m]) || "unknown";
      let related: RelatedApp[] = [];
      let relatedNote = "";
      const relatedSupported = typeof nav.getInstalledRelatedApps === "function";
      if (relatedSupported) {
        try { related = await nav.getInstalledRelatedApps(); relatedNote = related.length ? "" : "None found. The manifest needs related_applications for this to match."; }
        catch (e) { relatedNote = errText(e); }
      } else relatedNote = "Not available in this browser.";
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const promptNote = promptSeen ? "The browser offered an install prompt this session." : ios ? "iOS never fires this event. Install is only from the Share menu." : "Not seen yet. It fires only when the browser decides the page is installable.";
      return { mode, matches, navStandalone: typeof nav.standalone === "boolean" ? nav.standalone : null, relatedSupported, related, relatedNote, promptSeen, installedEvent, promptNote };
    },
    watch: (re) => {
      const lists = MODES.map((m) => window.matchMedia(`(display-mode: ${m})`));
      lists.forEach((l) => l.addEventListener("change", re));
      const fire = () => re();
      window.addEventListener("beforeinstallprompt", fire);
      window.addEventListener("appinstalled", fire);
      return () => {
        lists.forEach((l) => l.removeEventListener("change", re));
        window.removeEventListener("beforeinstallprompt", fire);
        window.removeEventListener("appinstalled", fire);
        window.removeEventListener("beforeinstallprompt", onPrompt);
        window.removeEventListener("appinstalled", onInstalled);
      };
    },
  });
}

const installSim = (ctx: Ctx) => fixed(ctx, {
  mode: "standalone",
  matches: { browser: false, "minimal-ui": false, standalone: true, fullscreen: false, "window-controls-overlay": false, tabbed: false, "picture-in-picture": false },
  navStandalone: true, relatedSupported: true, related: [{ platform: "webapp", id: "https://example.com/app" }], relatedNote: "",
  promptSeen: false, installedEvent: false, promptNote: "Pretend page: already installed, so no prompt.",
} satisfies InstallRec);

function InstallInstrument({ session }: InstrumentProps) {
  const d = lastData<InstallRec>(session);
  const sim = session.source === "sim";
  if (!d || !d.matches) return <Frame visual={<Waiting session={session} what="Reads whether this page runs as an installed app, with no prompt." />} />;
  return (
    <Frame
      visual={
        <Note error={d.error} sim={sim}>
          <Table
            head={["Display mode", "Matches now"]}
            rows={MODES.map((m) => [m, <b key={m}>{d.matches[m] ? "yes" : "no"}</b>])}
          />
          <p className="pc-foot">{d.promptNote}</p>
          {d.relatedNote && <p className="pc-foot">{d.relatedNote}</p>}
        </Note>
      }
      side={<Readout rows={[
        { k: "Current mode", v: d.mode, hot: true },
        { k: "navigator.standalone", v: d.navStandalone === null ? "not present" : yn(d.navStandalone) },
        { k: "Related apps API", v: d.relatedSupported ? "present" : "missing" },
        { k: "Related apps found", v: d.related.length, digits: 0 },
        { k: "Install prompt seen", v: yn(d.promptSeen) },
        { k: "Installed event seen", v: yn(d.installedEvent) },
      ]} />}
    />
  );
}

// ---------- 2. Manifest reader ----------

// Members that only Chromium acts on, from the research report (checked 2026-11-16).
const CHROMIUM_ONLY = ["file_handlers", "protocol_handlers", "launch_handler", "note_taking", "scope_extensions", "tab_strip", "share_target", "shortcuts", "screenshots", "widgets", "edge_side_panel", "related_applications", "prefer_related_applications", "handle_links", "migrate_from", "migrate_to"];
const KNOWN = ["name", "short_name", "id", "start_url", "scope", "display", "display_override", "orientation", "theme_color", "background_color", "icons", "lang", "dir", "description", "categories", ...CHROMIUM_ONLY];

type ManifestRec = {
  href: string; present: boolean; fetched: boolean; status: string; members: { k: string; v: string; chromium: boolean }[];
  appleCapable: string; appleIcon: boolean; extra: number; error?: string;
};

const brief = (v: unknown) => short(typeof v === "string" ? v : JSON.stringify(v) ?? "", 60);

function manifestLive(ctx: Ctx) {
  let abort: AbortController | null = null;
  let last = "";
  return watchRead(ctx, {
    read: async (): Promise<ManifestRec> => {
      const link = document.querySelector<HTMLLinkElement>('link[rel~="manifest"]');
      const appleCapable = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-capable"]')?.content || document.querySelector<HTMLMetaElement>('meta[name="mobile-web-app-capable"]')?.content || "";
      const appleIcon = !!document.querySelector('link[rel="apple-touch-icon"]');
      const base: ManifestRec = { href: link?.href || "", present: !!link, fetched: false, status: link ? "" : "No manifest link in this page.", members: [], appleCapable, appleIcon, extra: 0 };
      if (!link) return base;
      abort?.abort();
      abort = new AbortController();
      const cred = link.crossOrigin === "use-credentials" ? "include" : "same-origin";
      let json: Record<string, unknown>;
      try {
        const r = await fetch(link.href, { signal: abort.signal, credentials: cred, cache: "no-cache" });
        if (!r.ok) return { ...base, status: `HTTP ${r.status}` };
        json = await r.json();
      } catch (e: any) {
        if (e?.name === "AbortError") return { ...base, status: last };
        return { ...base, status: errText(e) };
      }
      const members = Object.keys(json).map((k) => ({ k, v: brief(json[k]), chromium: CHROMIUM_ONLY.includes(k) }));
      last = `Read ${members.length} members.`;
      return { ...base, fetched: true, status: last, members, extra: members.filter((m) => !KNOWN.includes(m.k)).length };
    },
    watch: (re) => {
      const mo = new MutationObserver(re);
      mo.observe(document.head, { subtree: true, childList: true, attributes: true, attributeFilter: ["href", "rel", "content"] });
      return () => { mo.disconnect(); abort?.abort(); abort = null; };
    },
  });
}

const manifestSim = (ctx: Ctx) => fixed(ctx, {
  href: "https://example.com/manifest.webmanifest", present: true, fetched: true, status: "Read 8 members.", appleCapable: "yes", appleIcon: true, extra: 0,
  members: [
    { k: "name", v: "Example", chromium: false }, { k: "start_url", v: "/?source=pwa", chromium: false },
    { k: "display", v: "standalone", chromium: false }, { k: "display_override", v: '["window-controls-overlay"]', chromium: false },
    { k: "icons", v: "[3 icons]", chromium: false }, { k: "share_target", v: "{action: /share}", chromium: true },
    { k: "file_handlers", v: "[1 handler]", chromium: true }, { k: "scope_extensions", v: "[1 origin]", chromium: true },
  ],
} satisfies ManifestRec);

function ManifestInstrument({ session }: InstrumentProps) {
  const d = lastData<ManifestRec>(session);
  const sim = session.source === "sim";
  if (!d || !d.members) return <Frame visual={<Waiting session={session} what="Reads this page's web app manifest and marks which members only Chromium acts on." />} />;
  return (
    <Frame
      visual={
        <Note error={d.error} sim={sim}>
          <Table
            head={["Member", "Value", "Acted on by"]}
            rows={d.members.map((m) => [m.k, short(m.v, 44), m.chromium ? "Chromium only" : "Wider"])}
            empty={d.status || "No manifest"}
          />
          <p className="pc-foot">Chromium only members come from the research report and need re-checking as browsers change.</p>
        </Note>
      }
      side={<Readout rows={[
        { k: "Manifest link", v: d.present ? short(d.href, 34) : "none", hot: true },
        { k: "Fetched", v: d.fetched ? "yes" : d.status || "no" },
        { k: "Members", v: d.members.length, digits: 0 },
        { k: "Chromium only", v: d.members.filter((m) => m.chromium).length, digits: 0 },
        { k: "Not in the known list", v: d.extra, digits: 0 },
        { k: "iOS web app meta", v: d.appleCapable || "none" },
        { k: "apple-touch-icon", v: yn(d.appleIcon) },
      ]} />}
    />
  );
}

// ---------- 3. Background APIs, read only ----------

type RegRow = { scope: string; script: string; state: string; periodic: string; sync: string; index: string; fetches: string; push: string };
type BgRec = {
  swSupported: boolean; controlled: boolean; regs: RegRow[];
  features: Record<string, boolean>; badge: boolean; error?: string;
};

const tryCount = async (f: () => Promise<any>, unit: string) => {
  try { const r = await f(); const n = Array.isArray(r) ? r.length : Array.isArray(r?.tags) ? r.tags.length : 0; return `${n} ${unit}`; }
  catch (e: any) { return e?.name === "NotAllowedError" ? "blocked" : "n/a"; }
};

function bgLive(ctx: Ctx) {
  const sw = navigator.serviceWorker;
  return watchRead(ctx, {
    every: 4000,
    read: async (): Promise<BgRec> => {
      const w = window as any;
      const features = {
        "Periodic Sync": "PeriodicSyncManager" in w,
        "Background Sync": "SyncManager" in w,
        "Background Fetch": "BackgroundFetchManager" in w,
        "Content Index": "ContentIndex" in w,
        Push: "PushManager" in w,
        "Clients API": "Clients" in w,
      };
      const badge = typeof (navigator as any).setAppBadge === "function";
      if (!sw) return { swSupported: false, controlled: false, regs: [], features, badge };
      const regs = await sw.getRegistrations();
      const rows: RegRow[] = await Promise.all(regs.map(async (r: any) => {
        const worker = r.active || r.waiting || r.installing;
        return {
          scope: r.scope.replace(location.origin, ""),
          script: worker ? short(worker.scriptURL.replace(location.origin, ""), 28) : "none",
          state: worker?.state || "none",
          periodic: r.periodicSync?.getTags ? await tryCount(() => r.periodicSync.getTags(), "tags") : "missing",
          sync: r.sync?.getTags ? await tryCount(() => r.sync.getTags(), "tags") : "missing",
          index: r.index?.getAll ? await tryCount(() => r.index.getAll(), "items") : "missing",
          fetches: r.backgroundFetch?.getIds ? await tryCount(() => r.backgroundFetch.getIds(), "fetches") : "missing",
          // getSubscription never prompts. It only says whether one already exists.
          push: r.pushManager?.getSubscription ? ((await r.pushManager.getSubscription().catch(() => null)) ? "subscribed" : "none") : "missing",
        };
      }));
      return { swSupported: true, controlled: !!sw.controller, regs: rows, features, badge };
    },
    watch: (re) => {
      sw?.addEventListener("controllerchange", re);
      document.addEventListener("visibilitychange", re);
      return () => { sw?.removeEventListener("controllerchange", re); document.removeEventListener("visibilitychange", re); };
    },
  });
}

const bgSim = (ctx: Ctx) => fixed(ctx, {
  swSupported: true, controlled: true, badge: true,
  features: { "Periodic Sync": true, "Background Sync": true, "Background Fetch": true, "Content Index": false, Push: true, "Clients API": true },
  regs: [{ scope: "/", script: "/sw.js", state: "activated", periodic: "1 tags", sync: "0 tags", index: "missing", fetches: "0 fetches", push: "subscribed" }],
} satisfies BgRec);

function BgInstrument({ session }: InstrumentProps) {
  const d = lastData<BgRec>(session);
  const sim = session.source === "sim";
  if (!d || !d.features) return <Frame visual={<Waiting session={session} what="Reads the service workers on this site and what is queued behind them, with no prompt." />} />;
  return (
    <Frame
      visual={
        <Note error={d.error} sim={sim}>
          <Table
            head={["Scope", "Worker", "State", "Periodic", "Sync", "Index", "Fetch", "Push"]}
            rows={d.regs.map((r) => [r.scope, r.script, r.state, r.periodic, r.sync, r.index, r.fetches, r.push])}
            empty={d.swSupported ? "No service worker registered for this site." : "Service workers are not available here."}
          />
          <p className="pc-foot">Push shows only whether a subscription already exists. Nothing here asks for permission or creates a registration.</p>
        </Note>
      }
      side={<Readout rows={[
        { k: "Service workers", v: d.regs.length, digits: 0, hot: true },
        { k: "Page controlled", v: yn(d.controlled) },
        ...Object.entries(d.features).map(([k, v]) => ({ k, v: v ? "present" : "missing" })),
        { k: "Badging API", v: d.badge ? "present" : "missing" },
      ]} />}
    />
  );
}

// ---------- 4. Extension traces ----------

type TraceRec = { urls: string[]; attrs: string[]; globals: string[]; known: string[]; custom: string[]; added: number; frame: boolean; error?: string };

const EXT_URL = /(chrome|moz|safari-web)-extension:\/\//i;
// A few well known passive traces. This is a demonstration list, not an extension census.
const KNOWN_TRACES: { label: string; test: () => boolean }[] = [
  { label: "Grammarly (html attribute)", test: () => document.documentElement.hasAttribute("data-gr-ext-installed") || document.body?.hasAttribute("data-gr-ext-installed") },
  { label: "Dark Reader (html attribute)", test: () => [...document.documentElement.attributes].some((a) => a.name.startsWith("data-darkreader")) },
  { label: "LanguageTool (html attribute)", test: () => document.documentElement.hasAttribute("data-lt-installed") },
  { label: "Redux DevTools (global)", test: () => "__REDUX_DEVTOOLS_EXTENSION__" in window },
  { label: "React DevTools (global)", test: () => "__REACT_DEVTOOLS_GLOBAL_HOOK__" in window },
  { label: "Vue DevTools (global)", test: () => "__VUE_DEVTOOLS_GLOBAL_HOOK__" in window },
];

function scanDom(): { urls: string[]; custom: string[] } {
  const urls = new Set<string>();
  const custom = new Set<string>();
  const nodes = document.querySelectorAll<HTMLElement>("*");
  nodes.forEach((el) => {
    if (el.tagName.includes("-")) custom.add(el.tagName.toLowerCase());
    for (const a of ["src", "href", "data-src", "srcset"]) {
      const v = el.getAttribute(a);
      if (v && EXT_URL.test(v)) urls.add(short(v, 70));
    }
    const st = el.getAttribute("style");
    if (st && EXT_URL.test(st)) urls.add("style: " + short(st, 60));
  });
  return { urls: [...urls].slice(0, 12), custom: [...custom].slice(0, 12) };
}

function traceLive(ctx: Ctx) {
  let frame: HTMLIFrameElement | null = null;
  let added = 0;
  let clean: Set<string> | null = null;
  try {
    frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.style.cssText = "position:absolute;width:0;height:0;border:0;visibility:hidden";
    document.body.appendChild(frame);
    clean = new Set(Object.getOwnPropertyNames(frame.contentWindow as Window));
  } catch { clean = null; }
  return watchRead(ctx, {
    every: 5000,
    read: (): TraceRec => {
      const { urls, custom } = scanDom();
      const attrs = [...document.documentElement.attributes, ...(document.body ? [...document.body.attributes] : [])]
        .map((a) => a.name)
        .filter((n) => n.startsWith("data-") && !["data-theme", "data-vite-theme"].includes(n))
        .slice(0, 12);
      const globals = clean ? Object.getOwnPropertyNames(window).filter((k) => !clean!.has(k) && !k.startsWith("webkit")).slice(0, 14) : [];
      const known = KNOWN_TRACES.filter((t) => { try { return t.test(); } catch { return false; } }).map((t) => t.label);
      return { urls, attrs, globals, known, custom, added, frame: !!clean };
    },
    watch: (re) => {
      const mo = new MutationObserver((recs) => {
        for (const r of recs) r.addedNodes.forEach((n) => {
          const el = n as Element;
          const s = el.getAttribute?.("src") || el.getAttribute?.("href") || "";
          if (EXT_URL.test(s)) added++;
        });
        re();
      });
      mo.observe(document.documentElement, { subtree: true, childList: true });
      return () => { mo.disconnect(); frame?.remove(); frame = null; };
    },
  });
}

const traceSim = (ctx: Ctx) => fixed(ctx, {
  urls: ["chrome-extension://<id>/icon.png (pretend)"], attrs: ["data-darkreader-mode", "data-gr-ext-installed"], globals: ["__REDUX_DEVTOOLS_EXTENSION__"],
  known: ["Dark Reader (html attribute)", "Redux DevTools (global)"], custom: ["grammarly-desktop-integration"], added: 0, frame: true,
} satisfies TraceRec);

function TraceInstrument({ session }: InstrumentProps) {
  const d = lastData<TraceRec>(session);
  const sim = session.source === "sim";
  if (!d || !d.known) return <Frame visual={<Waiting session={session} what="Looks through this page for the marks browser extensions leave in the page." />} />;
  const rows: [string, string][] = [
    ...d.known.map((k): [string, string] => ["Known trace", k]),
    ...d.urls.map((u): [string, string] => ["Extension URL", u]),
    ...d.attrs.map((a): [string, string] => ["Attribute on html or body", a]),
    ...d.globals.map((g): [string, string] => ["Global missing in a clean frame", g]),
    ...d.custom.map((c): [string, string] => ["Custom element", c]),
  ];
  return (
    <Frame
      visual={
        <Note error={d.error} sim={sim}>
          <Table head={["Kind", "Found"]} rows={rows} empty="No extension traces found in this page." />
          <p className="pc-foot">Some globals, attributes and custom elements belong to this app, not an extension. This scope never probes extension ids and reads no extension data.</p>
        </Note>
      }
      side={<Readout rows={[
        { k: "Known traces", v: d.known.length, digits: 0, hot: true },
        { k: "Extension URLs in page", v: d.urls.length, digits: 0 },
        { k: "Extra html or body attrs", v: d.attrs.length, digits: 0 },
        { k: "New globals", v: d.frame ? d.globals.length : "no clean frame", digits: 0 },
        { k: "Custom elements", v: d.custom.length, digits: 0 },
        { k: "Extension nodes added since start", v: d.added, digits: 0 },
      ]} />}
    />
  );
}

// ---------- 5. Permissions Policy reader ----------

type PolicyRec = { supported: boolean; api: string; features: { name: string; allowed: boolean }[]; header: string; headerNote: string; error?: string };

function policyLive(ctx: Ctx) {
  let abort: AbortController | null = null;
  return watchRead(ctx, {
    read: async (): Promise<PolicyRec> => {
      const doc = document as any;
      const pol = doc.permissionsPolicy || doc.featurePolicy;
      const api = doc.permissionsPolicy ? "document.permissionsPolicy" : doc.featurePolicy ? "document.featurePolicy (legacy)" : "none";
      let features: { name: string; allowed: boolean }[] = [];
      if (pol?.features) {
        const all: string[] = pol.features();
        const allowed = new Set<string>(pol.allowedFeatures());
        features = all.map((name) => ({ name, allowed: allowed.has(name) })).sort((a, b) => Number(a.allowed) - Number(b.allowed) || a.name.localeCompare(b.name));
      }
      abort?.abort();
      abort = new AbortController();
      let header = "";
      let headerNote = "";
      try {
        const r = await fetch(location.href, { method: "HEAD", signal: abort.signal, cache: "no-cache", credentials: "same-origin" });
        header = r.headers.get("permissions-policy") || "";
        headerNote = header ? "" : "No Permissions-Policy header on this page.";
      } catch (e: any) {
        headerNote = e?.name === "AbortError" ? "" : "Could not read the response header.";
      }
      return { supported: !!pol?.features, api, features, header, headerNote };
    },
    watch: () => () => { abort?.abort(); abort = null; },
  });
}

const policySim = (ctx: Ctx) => fixed(ctx, {
  supported: true, api: "document.permissionsPolicy", header: "camera=(), microphone=(), geolocation=(self)", headerNote: "",
  features: [{ name: "camera", allowed: false }, { name: "microphone", allowed: false }, { name: "geolocation", allowed: true }, { name: "fullscreen", allowed: true }, { name: "payment", allowed: true }],
} satisfies PolicyRec);

function PolicyInstrument({ session }: InstrumentProps) {
  const d = lastData<PolicyRec>(session);
  const sim = session.source === "sim";
  if (!d || !d.features) return <Frame visual={<Waiting session={session} what="Reads which browser features this page is allowed to use, and the header that decides it." />} />;
  const blocked = d.features.filter((f) => !f.allowed).length;
  return (
    <Frame
      visual={
        <Note error={d.error} sim={sim}>
          <Table
            head={["Feature", "This frame may use it"]}
            rows={d.features.map((f) => [f.name, f.allowed ? "yes" : "blocked"])}
            empty={d.supported ? "No features listed" : "This browser has no Permissions Policy introspection API."}
          />
          {d.header && <p className="pc-foot">Header: {short(d.header, 160)}</p>}
          {d.headerNote && <p className="pc-foot">{d.headerNote}</p>}
        </Note>
      }
      side={<Readout rows={[
        { k: "API", v: d.api, hot: true },
        { k: "Features listed", v: d.features.length, digits: 0 },
        { k: "Blocked here", v: blocked, digits: 0 },
        { k: "Header present", v: yn(!!d.header) },
      ]} />}
    />
  );
}

// ---------- Registry ----------

const base = { passive: true, layer: 1 as const, modes: { detect: "Reads the current state. Nothing is changed." } };

export const manifestScriptScopes: ScopeDef[] = [
  {
    ...base, id: "reach.install-state", name: "Install state", domain: "reach", icon: AppWindow,
    atlas: ["web.os.install-state-detection", "web.os.installed-related-apps", "web.os.install-prompt", "web.os.ios-home-screen-web-apps"],
    summary: "Reads whether this page runs in a browser tab or as an installed app, and whether the site's own app is installed. No prompt appears.",
    call: "matchMedia('(display-mode: standalone)'); navigator.getInstalledRelatedApps()",
    reveals: ["Whether you installed this site as an app", "Whether you use the site's own native app", "A stable yes or no a site can use to tell you from a stranger"],
    live: async (ctx) => installLive(ctx), sim: installSim, Instrument: InstallInstrument,
  },
  {
    ...base, id: "reach.manifest-reader", name: "Manifest reader", domain: "reach", icon: FileJson,
    atlas: ["web.os.manifest-member-support", "web.os.scope-extensions", "web.os.tabbed-display-mode", "web.os.manifest-migration"],
    summary: "Fetches this page's web app manifest and lists each member, marking the ones only Chromium browsers act on.",
    call: "fetch(link[rel=manifest].href).then(r => r.json())",
    reveals: ["Which install features the site asks for", "Which of them your browser would ignore", "Tracking parameters hidden in start_url"],
    live: async (ctx) => manifestLive(ctx), sim: manifestSim, Instrument: ManifestInstrument,
  },
  {
    ...base, id: "reach.background-apis", name: "Background APIs", domain: "reach", icon: RefreshCw,
    atlas: ["web.notify.sw-fetch-interception", "web.notify.sw-clients-tab-census", "web.notify.content-index", "web.notify.periodic-background-sync", "web.notify.background-fetch", "web.notify.background-sync", "web.notify.badging", "web.storage.clear-site-data"],
    summary: "Lists the service workers this site has and which background jobs are queued behind them, without creating or requesting anything.",
    call: "navigator.serviceWorker.getRegistrations(); registration.periodicSync.getTags()",
    reveals: ["That a site keeps code installed between visits", "Whether it has background jobs or a push subscription waiting", "Which background APIs your browser offers at all"],
    live: async (ctx) => bgLive(ctx), sim: bgSim, Instrument: BgInstrument,
  },
  {
    ...base, id: "fingerprint.extension-traces", name: "Extension traces", domain: "fingerprint", icon: Puzzle,
    atlas: ["web.device.extension-dom-injection", "web.device.extension-probe-defenses", "web.device.userscripts-and-mv2", "web.device.extension-probing"],
    summary: "Looks through this page for marks extensions leave in the DOM and in global names, and for extension addresses in the page. It never guesses extension ids.",
    call: "querySelectorAll('*'); Object.getOwnPropertyNames(window) vs a clean iframe",
    reveals: ["Extensions that change the page, such as ad blockers and dark mode tools", "That passive marks alone can add to a fingerprint"],
    live: async (ctx) => traceLive(ctx), sim: traceSim, Instrument: TraceInstrument,
  },
  {
    ...base, id: "fingerprint.permissions-policy", name: "Permissions Policy", domain: "fingerprint", icon: ListChecks,
    atlas: ["web.meta.permissions-policy-introspection", "web.meta.permissions-policy"],
    summary: "Lists every feature the browser can gate with Permissions Policy, which this page may use, and the header that set it.",
    call: "document.permissionsPolicy.features(); document.permissionsPolicy.allowedFeatures()",
    reveals: ["Your browser engine and rough version from the feature list", "What the page has locked down, for example camera or microphone"],
    live: async (ctx) => policyLive(ctx), sim: policySim, Instrument: PolicyInstrument,
  },
];
