import { useMemo } from "react";
import type { AtlasNode, ScopeDef } from "../core/types";
import { exclusivity } from "../browser/availability";
import { availabilityText, useAvailability } from "../scopes/reference";
import { Ban, Check, CircleHelp, Minus, X } from "lucide-react";
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

const VERDICT: Record<string, [string, typeof Check]> = { ok: ["ok", Check], err: ["err", Ban], no: ["no", X], off: ["off", Minus], warn: ["warn", CircleHelp], wait: ["wait", Minus] };

function Row({ node, scope, ctx }: { node: AtlasNode; scope?: ScopeDef; ctx: ConsoleCtx }) {
  const a = useAvailability(node);
  const g = ctx.groupOfNode(node);
  const G = g.icon;
  const [label, tone] = availabilityText(a);
  const [cls, V] = VERDICT[tone] || VERDICT.no;
  return (
    <button className={"tb-row" + (scope ? "" : " ro")} onClick={() => scope && ctx.select(scope.id)} title={`${node.p || node.n}. ${g.label}. ${label}${a?.why ? ": " + a.why : ""}`}>
      <span className="tb-g" aria-hidden>{G ? <G size={14} /> : null}</span>
      <span className="tb-n">{node.n}</span>
      <span className={"tb-v " + cls} aria-label={label}><V size={13} /></span>
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
      {wc && (
        <details className="tb-sec">
          <summary><h5>window.chrome on this page</h5><em>{keys.length}</em></summary>
          <div className="tb-chips">{["runtime", "app", "csi", "loadTimes", "webstore"].map((k) => <code key={k} className={keys.includes(k) ? "on" : ""} title={keys.includes(k) ? "present" : "absent"}>{k}</code>)}</div>
        </details>
      )}
      <details className="tb-sec">
        <summary><h5>Extensions only</h5><em>{CHROME_APIS.length}</em></summary>
        <div className="tb-list">{CHROME_APIS.map(([k, v]) => <div key={k} className="tb-row ro" title={v}><span className="tb-n"><code>chrome.{k}</code></span><span className="tb-d">{v}</span></div>)}</div>
      </details>
      <details className="tb-sec">
        <summary><h5>Address bar only</h5><em>{INTERNAL.length}</em></summary>
        <div className="tb-list">{INTERNAL.map(([k, v]) => <div key={k} className="tb-row ro" title={v}><span className="tb-n"><code>{k}</code></span><span className="tb-d">{v}</span></div>)}</div>
      </details>
      <details className="tb-sec">
        <summary><h5>Never exposed to pages</h5><em>{notExposed.length}</em></summary>
        <List nodes={notExposed} ctx={ctx} byAtlas={byAtlas} />
      </details>
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
              <h5>Only in Edge <em>{edgeOnly.length}</em></h5>
              <List nodes={edgeOnly} ctx={ctx} byAtlas={byAtlas} />
            </div>
          )}
          <div>
            <h5 title={`${brand} has these and no other engine does. Each mark is a live check.`}>Only in {fam} <em>{only.length}</em></h5>
            <List nodes={only} ctx={ctx} byAtlas={byAtlas} />
          </div>
          <div>
            <h5 title={`${fam} and one other engine support these`}>Shared with one other <em>{best.length}</em></h5>
            <List nodes={best} ctx={ctx} byAtlas={byAtlas} />
          </div>
        </div>
      </div>
      <div className="vp-side"><h4 title="These exist in the browser or the system, but no web page can call them">Outside the page</h4><div className="vp-scroll"><Outside ctx={ctx} byAtlas={byAtlas} /></div></div>
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
      return { value: String(only.length + edgeOnly.length), sub: `Only in ${c.profile.column === 1 && edgeOnly.length ? "Edge or Chromium" : ENGINE[c.profile.column] || c.profile.brand}` };
    },
    Panel: ThisBrowserPanel,
  });
}
