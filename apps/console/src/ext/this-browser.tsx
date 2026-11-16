import { useMemo } from "react";
import type { AtlasNode, ScopeDef } from "../core/types";
import { exclusivity } from "../browser/availability";
import { AvailabilityBadge, useAvailability } from "../scopes/reference";
import { registerView, type ConsoleCtx } from "./registry";

// "This browser": what is exclusive to, or strongest in, the browser the visitor is using right
// now, each with a live availability check. Then everything a web page can never reach.

const ENGINE: Record<number, string> = { 0: "Chromium", 1: "Chromium", 5: "Chromium", 6: "Chromium", 2: "Firefox", 3: "Safari", 4: "Safari" };

function picks(ctx: ConsoleCtx) {
  const col = ctx.profile.column;
  const ok = (c?: string) => c === "y" || c === "p";
  const only: AtlasNode[] = [], best: AtlasNode[] = [], edgeOnly: AtlasNode[] = [];
  for (const n of ctx.atlas.nodes) {
    if (n.k === "not-exposed") continue;
    if (col === 1 && ok(n.sup[1]) && !ok(n.sup[0])) { edgeOnly.push(n); continue; }
    const x = exclusivity(n, col);
    if (x === "only") only.push(n); else if (x === "best") best.push(n);
  }
  return { only, best, edgeOnly };
}

function Row({ node, scope, ctx }: { node: AtlasNode; scope?: ScopeDef; ctx: ConsoleCtx }) {
  const a = useAvailability(node);
  return (
    <button className="tb-row" onClick={() => scope && ctx.select(scope.id)} title={node.p}>
      <span className="tb-n">{node.n} <small>{ctx.groupOfNode(node).label}</small></span>
      {scope && !scope.reference ? <span className="tb-live">live call</span> : <span />}
      <AvailabilityBadge a={a} />
    </button>
  );
}

function List({ nodes, ctx, byAtlas }: { nodes: AtlasNode[]; ctx: ConsoleCtx; byAtlas: Map<string, ScopeDef> }) {
  const sorted = [...nodes].sort((a, b) => Number(!byAtlas.get(b.i)?.reference) - Number(!byAtlas.get(a.i)?.reference) || a.n.localeCompare(b.n));
  return <div className="tb-list">{sorted.map((n) => <Row key={n.i} node={n} scope={byAtlas.get(n.i)} ctx={ctx} />)}</div>;
}

/** Extension only APIs. A web page cannot call any of these; an installed extension with the permission can. */
const CHROME_APIS: [string, string][] = [
  ["tabs", "every open tab's URL and title"], ["history", "your full browsing history"], ["cookies", "cookies for any site"],
  ["webRequest", "watch every request the browser makes"], ["declarativeNetRequest", "block or rewrite requests (ad blockers)"],
  ["scripting", "inject code into any page"], ["debugger", "drive any tab through DevTools"], ["downloads", "start and read downloads"],
  ["bookmarks", "read and edit bookmarks"], ["identity", "the signed in Google account"], ["management", "list and disable other extensions"],
  ["sidePanel", "a persistent side panel"], ["offscreen", "hidden documents for audio or DOM work"], ["nativeMessaging", "talk to a native app on the computer"],
  ["tabCapture", "record a tab without the share picker"], ["desktopCapture", "the screen share picker from an extension"], ["proxy", "route traffic through a proxy"],
  ["privacy", "change privacy settings"], ["contentSettings", "per site camera, location and JS rules"], ["topSites", "your most visited sites"],
  ["sessions", "recently closed tabs and other devices"], ["readingList", "the reading list"], ["userScripts", "run user scripts"],
  ["enterprise.*", "device attributes on managed computers"],
];

/** Browser internal pages. Pages cannot open or read them; you can type them in the address bar. */
const INTERNAL: [string, string][] = [
  ["chrome://settings", "all settings"], ["chrome://flags", "experimental features"], ["chrome://on-device-internals", "Gemini Nano model state"],
  ["chrome://policy", "policies set by an admin"], ["chrome://webrtc-internals", "every call's media stats"], ["chrome://net-export", "a full network log"],
  ["chrome://inspect", "debug devices and workers"], ["chrome://site-engagement", "how much you use each site"], ["chrome://media-engagement", "which sites may autoplay"],
  ["chrome://history", "history"], ["chrome://password-manager", "saved passwords"], ["chrome://extensions", "installed extensions"],
  ["chrome://gpu", "GPU and driver details"], ["chrome://sandbox", "process sandbox status"],
];

function Outside({ ctx, byAtlas }: { ctx: ConsoleCtx; byAtlas: Map<string, ScopeDef> }) {
  const notExposed = ctx.atlas.nodes.filter((n) => n.k === "not-exposed");
  const wc = (window as any).chrome;
  const keys = wc ? Object.keys(wc) : [];
  return (
    <div className="tb">
      <div>
        <p className="tb-blurb">These exist in the browser or the system, but no web page can call them. Extensions, native apps or you at the keyboard can.</p>
      </div>
      <div>
        <h5>window.chrome on this page</h5>
        <p className="tb-blurb">{wc ? "The page sees only these keys, not the extension APIs:" : "This browser has no window.chrome object."}</p>
        {wc && <div className="tb-chips">{["runtime", "app", "csi", "loadTimes", "webstore"].map((k) => <code key={k} className={keys.includes(k) ? "on" : ""}>{k}{keys.includes(k) ? "" : " (absent)"}</code>)}</div>}
      </div>
      <div>
        <h5>Extension only (chrome.*)</h5>
        <div className="tb-list">{CHROME_APIS.map(([k, v]) => <div key={k} className="tb-row" style={{ cursor: "default" }}><span className="tb-n"><code>chrome.{k}</code> <small>{v}</small></span><span /><span className="ref-badge">extensions</span></div>)}</div>
      </div>
      <div>
        <h5>Internal pages</h5>
        <div className="tb-list">{INTERNAL.map(([k, v]) => <div key={k} className="tb-row" style={{ cursor: "default" }}><span className="tb-n"><code>{k}</code> <small>{v}</small></span><span /><span className="ref-badge">you only</span></div>)}</div>
      </div>
      <div>
        <h5>Never exposed to pages ({notExposed.length})</h5>
        <List nodes={notExposed} ctx={ctx} byAtlas={byAtlas} />
      </div>
    </div>
  );
}

function ThisBrowserPanel({ ctx }: { ctx: ConsoleCtx }) {
  const byAtlas = useMemo(() => {
    const m = new Map<string, ScopeDef>();
    ctx.scopes.forEach((s) => s.atlas.forEach((id) => { if (!m.has(id)) m.set(id, s); }));
    return m;
  }, [ctx.scopes]);
  const { only, best, edgeOnly } = useMemo(() => picks(ctx), [ctx]);
  const col = ctx.profile.column;
  const fam = ENGINE[col] || ctx.profile.engine;
  const brand = ctx.profile.brand;
  return (
    <div className="vp">
      <div className="vp-chart">
        <div className="tb">
          {edgeOnly.length > 0 && (
            <div>
              <h5>Only in Edge ({edgeOnly.length})</h5>
              <List nodes={edgeOnly} ctx={ctx} byAtlas={byAtlas} />
            </div>
          )}
          <div>
            <h5>Only in {fam} ({only.length})</h5>
            <p className="tb-blurb">{brand} has these and no other engine does. Each badge is a live check: feature detection, then the permission state, then flag or trial status.</p>
            <List nodes={only} ctx={ctx} byAtlas={byAtlas} />
          </div>
          <div>
            <h5>Best here ({best.length})</h5>
            <p className="tb-blurb">{fam} and only one other engine support these.</p>
            <List nodes={best} ctx={ctx} byAtlas={byAtlas} />
          </div>
        </div>
      </div>
      <div className="vp-side"><h4>Outside the web page</h4><div className="vp-scroll"><Outside ctx={ctx} byAtlas={byAtlas} /></div></div>
    </div>
  );
}

export function registerThisBrowser() {
  registerView({
    id: "this-browser",
    label: "This browser",
    order: 5,
    metric: (c) => {
      const { only, edgeOnly } = picks(c);
      return { value: String(only.length + edgeOnly.length), sub: `only in ${c.profile.column === 1 && edgeOnly.length ? "Edge or Chromium" : ENGINE[c.profile.column] || c.profile.brand}`, tone: "accent" };
    },
    Panel: ThisBrowserPanel,
  });
}
