import { useEffect, useState } from "react";
import { Button, Callout, HTMLTable, Tag } from "@blueprintjs/core";
import { registerView, type ConsoleCtx } from "../registry";
import { noteCtx } from "./bridge";

// Account: keep your readings across visits. Starts as an anonymous account (no email, no name);
// GitHub can be linked later when the site has it turned on. Self contained module: it talks to
// /api/auth and /api/account with plain fetch and registers one view.

type Readings = { visits: number; chunks: { scope?: string; at?: string }[]; scopes: Record<string, number> };
export type State = { user: { id: string; name: string; anonymous: boolean; created: string } | null; readings?: Readings; github: boolean };

const VISIT_KEY = "po.visit";
const visitId = () => { try { return sessionStorage.getItem(VISIT_KEY) || ""; } catch { return ""; } };
export const post = (url: string, body: unknown) =>
  fetch(url, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

let cache: State | null = null;
export const accountState = () => cache;
export function onAccount(f: (s: State) => void) { listeners.add(f); return () => { listeners.delete(f); }; }
const listeners = new Set<(s: State) => void>();
const publish = (s: State) => { cache = s; listeners.forEach((f) => f(s)); };

export async function refreshAccount(): Promise<State> {
  try {
    const r = await fetch("/api/account", { credentials: "include" });
    const s = r.ok ? ((await r.json()) as State) : { user: null, github: false };
    publish(s);
    return s;
  } catch {
    const s = { user: null, github: false };
    publish(s);
    return s;
  }
}

async function linkVisit() {
  const v = visitId();
  if (v) await post("/api/account", { action: "link_visit", visit: v }).catch(() => null);
}

export async function signInAnonymous() {
  await post("/api/auth/sign-in/anonymous", {});
  await linkVisit();
  return refreshAccount();
}

async function linkGithub() {
  const r = await post("/api/auth/sign-in/social", { provider: "github", callbackURL: location.href });
  const j = await r.json().catch(() => ({}));
  if (j?.url) location.href = j.url;
}

async function signOut() {
  await post("/api/auth/sign-out", {});
  return refreshAccount();
}

function useAccount() {
  const [s, set] = useState<State | null>(cache);
  useEffect(() => {
    listeners.add(set);
    if (!cache) refreshAccount();
    return () => { listeners.delete(set); };
  }, []);
  return s;
}

function AccountPanel(_: { ctx: ConsoleCtx }) {
  const s = useAccount();
  const [busy, setBusy] = useState(false);
  const run = (f: () => Promise<unknown>) => async () => { setBusy(true); try { await f(); } finally { setBusy(false); } };
  if (!s) return <div className="vp"><div className="vp-pad"><p className="vp-lede">Checking your account…</p></div></div>;
  const top = Object.entries(s.readings?.scopes || {}).sort((a, b) => b[1] - a[1]).slice(0, 12);
  return (
    <div className="vp">
      <div className="vp-pad">
        {!s.user ? (
          <>
            <p className="vp-lede">Readings from this tab are sampled anonymously. Start an account to keep them with you across visits. It needs no email and no name.</p>
            <Button data-control="account.keep-readings" intent="primary" loading={busy} onClick={run(signInAnonymous)} text="Keep my readings" />
          </>
        ) : (
          <>
            <p className="vp-lede">
              {s.user.anonymous ? "Anonymous account" : "Linked to GitHub"} <Tag minimal>{s.user.id.slice(0, 8)}</Tag>, since {new Date(s.user.created).toLocaleDateString()}.
              {" "}{s.readings?.visits ?? 0} visit{s.readings?.visits === 1 ? "" : "s"} saved.
            </p>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <Button data-control="account.save-visit" loading={busy} onClick={run(async () => { await linkVisit(); await refreshAccount(); })} text="Save this visit" />
              {s.user.anonymous && s.github && <Button data-control="account.link-github" intent="primary" onClick={run(linkGithub)} text="Link GitHub" />}
              <Button data-control="account.sign-out" minimal onClick={run(signOut)} text="Sign out" />
            </div>
            {s.user.anonymous && !s.github && <Callout compact>GitHub linking is not turned on yet. Your anonymous account works on its own.</Callout>}
            {top.length > 0 && (
              <HTMLTable compact striped style={{ marginTop: 12 }}>
                <thead><tr><th>Capability</th><th>Samples kept</th></tr></thead>
                <tbody>{top.map(([k, n]) => <tr key={k}><td><code>{k}</code></td><td>{n}</td></tr>)}</tbody>
              </HTMLTable>
            )}
          </>
        )}
      </div>
    </div>
  );
}

registerView({
  id: "account",
  label: "Account",
  order: 900,
  metric: (ctx) => {
    noteCtx(ctx);
    const s = cache;
    if (!s?.user) return { value: "Off", sub: "readings not kept" };
    return { value: String(s.readings?.visits ?? 0), unit: "visits", sub: s.user.anonymous ? "anonymous" : "GitHub", tone: "ok" };
  },
  Panel: AccountPanel,
});

refreshAccount();
