import type { ScopeDef, Source } from "../core/types";
import { getSession, isActive, request, setSource, stop, subscribe } from "../core/harness";
import type { ToolDef, ToolResult } from "./tools";

// Plain tools over the manifest and page script atlas entries (installed app state, the web app
// manifest, service workers and background jobs, extension traces, Permissions Policy). Each one
// starts the read only capability, waits for its first reading, answers in plain words with the
// facts behind them, and turns the capability off again if it was off before. They change nothing,
// so they are open to every caller: the voice agent, WebMCP, the MCP relay and the REST API.

type D = Record<string, any>;
type Spec = { tool: string; scope: string; description: string; words: (d: D) => { said: string; facts: D } };

const list = (xs: string[], n = 5) => (xs.length ? xs.slice(0, n).join(", ") + (xs.length > n ? ` and ${xs.length - n} more` : "") : "none");
const yes = (b: unknown) => (b ? "yes" : "no");

export const PAGE_SCRIPT_SPECS: Spec[] = [
  {
    tool: "check_install_state", scope: "reach.install-state",
    description: "Is this page running as an installed app or in a browser tab, and is the site's own app installed? Read only, no prompt.",
    words: (d) => {
      const mode = String(d.mode || "browser");
      const related = Array.isArray(d.related) ? d.related : [];
      const installed = mode !== "browser" || d.navStandalone === true;
      return {
        said: `${installed ? `This page runs as an installed app (${mode}).` : "This page runs in a normal browser tab, not as an installed app."}${related.length ? ` The browser reports ${related.length} related app${related.length > 1 ? "s" : ""} installed.` : ""}${d.promptSeen ? " The browser offered to install it." : ""}`,
        facts: { mode, installed, ios_standalone: d.navStandalone ?? null, related_apps: related.length, install_offered: !!d.promptSeen, just_installed: !!d.installedEvent },
      };
    },
  },
  {
    tool: "read_manifest", scope: "reach.manifest-reader",
    description: "Read this page's web app manifest: whether it has one, its name, start address, display mode, icons and the other members.",
    words: (d) => {
      const members: { k: string; v: string }[] = Array.isArray(d.members) ? d.members : [];
      const get = (k: string) => members.find((m) => m.k === k)?.v;
      if (!d.present) return { said: "This page has no web app manifest, so it cannot be installed as an app from its own settings.", facts: { present: false, apple_capable: d.appleCapable || "" } };
      const name = get("name") || get("short_name");
      return {
        said: `This page has a manifest${name ? ` for ${name}` : ""}${get("display") ? `, shown as ${get("display")}` : ""}. It sets ${members.length} member${members.length === 1 ? "" : "s"}: ${list(members.map((m) => m.k), 8)}.`,
        facts: { present: true, fetched: !!d.fetched, status: d.status, name: name || null, start_url: get("start_url") || null, display: get("display") || null, members: members.length, keys: members.map((m) => m.k).slice(0, 20) },
      };
    },
  },
  {
    tool: "list_background_jobs", scope: "reach.background-apis",
    description: "List the service workers this site has and the background jobs behind them (background sync, periodic sync, push, badge). Read only, creates nothing.",
    words: (d) => {
      const regs: D[] = Array.isArray(d.regs) ? d.regs : [];
      const on = Object.entries(d.features || {}).filter(([, v]) => v).map(([k]) => k);
      return {
        said: !d.swSupported ? "This browser has no service workers, so the site cannot run background jobs."
          : `This site has ${regs.length || "no"} service worker${regs.length === 1 ? "" : "s"}${d.controlled ? " and one controls this page" : ""}. The browser supports ${list(on, 6)}.`,
        facts: { supported: !!d.swSupported, controlled: !!d.controlled, workers: regs.length, registrations: regs.slice(0, 5).map((r) => ({ scope: r.scope, state: r.state, sync: r.sync, periodic: r.periodic, push: r.push })), features: on, badge: !!d.badge },
      };
    },
  },
  {
    tool: "find_extension_traces", scope: "fingerprint.extension-traces",
    description: "Look for marks browser extensions left in this page: extension addresses, DOM attributes and global names. Never guesses extension ids.",
    words: (d) => {
      const known: string[] = Array.isArray(d.known) ? d.known : [];
      const urls: string[] = Array.isArray(d.urls) ? d.urls : [];
      const attrs: string[] = Array.isArray(d.attrs) ? d.attrs : [];
      const globals: string[] = Array.isArray(d.globals) ? d.globals : [];
      const total = urls.length + attrs.length + globals.length;
      return {
        said: total ? `I found ${total} extension trace${total === 1 ? "" : "s"} in this page${known.length ? `, matching ${list(known)}` : ""}.` : "I found no extension traces in this page.",
        facts: { traces: total, known, urls: urls.length, attrs: attrs.slice(0, 8), globals: globals.slice(0, 8), custom_elements: Array.isArray(d.custom) ? d.custom.length : 0, in_frame: !!d.frame },
      };
    },
  },
  {
    tool: "read_permissions_policy", scope: "fingerprint.permissions-policy",
    description: "Which powerful features (camera, microphone, location, USB and more) this page is allowed to use under Permissions Policy, and the header that set it.",
    words: (d) => {
      const fs: { name: string; allowed: boolean }[] = Array.isArray(d.features) ? d.features : [];
      const blocked = fs.filter((f) => !f.allowed).map((f) => f.name);
      return {
        said: !d.supported ? "This browser does not expose Permissions Policy to the page." : `${fs.length - blocked.length} of ${fs.length} features are allowed here.${blocked.length ? ` Blocked: ${list(blocked, 6)}.` : ""}${d.header ? " A header sets the policy." : " No policy header is set."}`,
        facts: { supported: !!d.supported, api: d.api, features: fs.length, allowed: fs.length - blocked.length, blocked, header: d.header || null },
      };
    },
  },
];

export const PAGE_SCRIPT_TOOLS: ToolDef[] = PAGE_SCRIPT_SPECS.map((s) => ({
  name: s.tool,
  description: s.description,
  inputSchema: { type: "object", properties: {
    source: { type: "string", enum: ["live", "sim"], description: "Default live: this real page. sim reads a pretend page." },
    keep: { type: "boolean", description: "Leave the capability running after the read. Default false." },
  } },
}));

/** Wait for the first reading after a start, up to ms. */
function firstReading(id: string, after: number, ms: number) {
  return new Promise<void>((res) => {
    const done = () => { off(); clearTimeout(t); res(); };
    const check = () => { const s = getSession(id); if ((s.last && s.last.seq > after) || ["denied", "unsupported", "error"].includes(s.state)) done(); };
    const off = subscribe(check);
    const t = setTimeout(done, ms);
    check();
  });
}

export async function pageScriptCall(name: string, a: Record<string, any>, find: (id: unknown) => ScopeDef | undefined): Promise<ToolResult | null> {
  const spec = PAGE_SCRIPT_SPECS.find((s) => s.tool === name);
  if (!spec) return null;
  const scope = find(spec.scope);
  if (!scope) return { ok: false, error: `${spec.scope} is not on this page.`, verified: false };
  const was = getSession(scope.id);
  const wasOn = isActive(was);
  const before = was.last?.seq ?? -1;
  if (a.source === "live" || a.source === "sim") setSource(scope.id, a.source as Source);
  if (!wasOn || a.source) void request(scope.id);
  await firstReading(scope.id, wasOn && !a.source ? -1 : before, 4000);
  const ses = getSession(scope.id);
  const d = (ses.last?.data || {}) as D;
  if (!wasOn && !a.keep) stop(scope.id, true);
  if (!ses.last || d.error) {
    const why = String(d.error || ses.error || ses.state);
    return { ok: false, id: scope.id, error: why, said: `I could not read ${scope.name.toLowerCase()}: ${why}.`, verified: false };
  }
  const { said, facts } = spec.words(d);
  return { ok: true, id: scope.id, source: ses.source, said, facts, verified: true, at: new Date(ses.last.t).toISOString() };
}
