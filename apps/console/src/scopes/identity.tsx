import type { InstrumentProps, ScopeDef } from "../core/types";
import { every, unsupported } from "../core/harness";
import { DOMAIN_COLOR, Frame, Readout, Waiting, lastData } from "../ui/kit";
import "./extras-identity-reach.css";

// Identity scopes: passkey capability checks (never creates or uses a credential), the contact picker,
// and what the page can store and read back.

const nav = () => navigator as any;
const COLOR = DOMAIN_COLOR.identity;

type Check = { label: string; note: string; state: boolean | null };

function CheckList({ checks }: { checks: Check[] }) {
  return (
    <div className="eir-checks">
      {checks.map((c) => (
        <div key={c.label} className="eir-check">
          <span className={"eir-dot " + (c.state === true ? "yes" : c.state === false ? "no" : "")} />
          <div>{c.label}<small>{c.note}</small></div>
          <span className="eir-state">{c.state === null ? "unknown" : c.state ? "yes" : "no"}</span>
        </div>
      ))}
    </div>
  );
}

// ---------- Passkeys ----------

type PkRec = { checks: Check[]; supported: number; total: number; caps_count: number; webauthn: number };

async function probePasskeys(): Promise<PkRec> {
  const PKC = (window as any).PublicKeyCredential;
  if (!PKC) unsupported("WebAuthn");
  const safe = async (fn: string): Promise<boolean | null> => {
    try { return typeof PKC[fn] === "function" ? !!(await PKC[fn]()) : null; } catch { return null; }
  };
  const platform = await safe("isUserVerifyingPlatformAuthenticatorAvailable");
  const conditional = await safe("isConditionalMediationAvailable");
  let caps: Record<string, boolean> | null = null;
  try { if (typeof PKC.getClientCapabilities === "function") caps = await PKC.getClientCapabilities(); } catch { /* ignore */ }
  const checks: Check[] = [
    { label: "WebAuthn present", note: "window.PublicKeyCredential exists", state: true },
    { label: "Built in authenticator", note: "Face, fingerprint or device PIN can unlock a passkey", state: platform },
    { label: "Autofill passkeys", note: "Conditional mediation: passkeys offered in a username field", state: conditional },
  ];
  if (caps) {
    Object.keys(caps).sort().forEach((k) => checks.push({ label: k, note: "getClientCapabilities()", state: !!caps![k] }));
  } else checks.push({ label: "Client capabilities report", note: "getClientCapabilities() not offered by this browser", state: null });
  return { checks, supported: checks.filter((c) => c.state === true).length, total: checks.length, caps_count: caps ? Object.keys(caps).length : 0, webauthn: 1 };
}

const passkeys: ScopeDef = {
  id: "identity.passkeys", name: "Passkey readiness", domain: "identity", atlas: ["web.auth.passkeys", "web.identity.webauthn-get"],
  summary: "Asks the browser which passkey features it offers. It never creates or uses a credential.",
  call: "PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()", passive: true,
  reveals: ["Whether this device has biometrics or a screen lock tied to passkeys", "Browser and OS generation, since the capability list differs by version"],
  feeds: ["fingerprint.profile", "device.hardware"],
  metrics: [{ key: "supported", label: "features" }, { key: "caps_count", label: "capabilities" }],
  live: async (ctx) => {
    const run = async () => ctx.emit(await probePasskeys() as unknown as Record<string, unknown>);
    const first = await probePasskeys();
    ctx.granted();
    ctx.emit(first as unknown as Record<string, unknown>);
    const h = setInterval(() => void run(), 4000);
    return () => clearInterval(h);
  },
  sim: (ctx) => {
    ctx.granted();
    const names = ["conditionalCreate", "conditionalGet", "hybridTransport", "passkeyPlatformAuthenticator", "userVerifyingPlatformAuthenticator", "relatedOrigins", "signalAllAcceptedCredentials"];
    const checks: Check[] = [
      { label: "WebAuthn present", note: "window.PublicKeyCredential exists", state: true },
      { label: "Built in authenticator", note: "Face, fingerprint or device PIN can unlock a passkey", state: true },
      { label: "Autofill passkeys", note: "Conditional mediation: passkeys offered in a username field", state: true },
      ...names.map((n, i) => ({ label: n, note: "getClientCapabilities()", state: i !== 5 })),
    ];
    return every(2000, () => ctx.emit({ checks, supported: checks.filter((c) => c.state).length, total: checks.length, caps_count: names.length, webauthn: 1 }));
  },
  Instrument: ({ session }: InstrumentProps) => {
    const d = lastData<PkRec>(session);
    return (
      <Frame
        visual={d ? <CheckList checks={d.checks} /> : <Waiting session={session} what="A checklist of the passkey features this browser reports." />}
        side={<Readout rows={[{ k: "Features available", v: d ? `${d.supported} of ${d.total}` : null, hot: true }, { k: "Capabilities listed", v: d?.caps_count ?? null }, { k: "Credential created", v: false }]} />}
      />
    );
  },
};

// ---------- Contacts ----------

type ContactRow = { name: string; email: string; tel: string };
type ContactRec = { contacts: ContactRow[]; count: number; with_name: number; with_email: number; with_tel: number };

const mask = (s: string | undefined) => (s ? s.slice(0, 2) + "***" : "");

function summarize(rows: ContactRow[]): ContactRec {
  return { contacts: rows.slice(0, 50), count: rows.length, with_name: rows.filter((r) => r.name).length, with_email: rows.filter((r) => r.email).length, with_tel: rows.filter((r) => r.tel).length };
}

const contacts: ScopeDef = {
  id: "identity.contacts", name: "Contact picker", domain: "identity", atlas: ["web.contacts.contact-picker", "web.notexposed.contacts-list"],
  summary: "Opens your contact chooser. The page receives only the contacts and fields you tick.",
  call: 'navigator.contacts.select(["name","email","tel"], { multiple: true })', gesture: true,
  reveals: ["Who you know, by name, email and phone number", "How complete your address book is", "A social graph that can link you to other people's accounts"],
  feeds: ["identity.storage_tracking"],
  metrics: [{ key: "count", label: "contacts" }, { key: "with_email", label: "emails" }, { key: "with_tel", label: "phones" }],
  live: async (ctx) => {
    if (!nav().contacts?.select) unsupported("Contact Picker");
    const picked = await nav().contacts.select(["name", "email", "tel"], { multiple: true });
    ctx.granted();
    // Only masked values are kept in the record stream.
    ctx.emit(summarize(picked.map((c: any) => ({ name: mask(c.name?.[0]), email: mask(c.email?.[0]), tel: mask(c.tel?.[0]) }))) as unknown as Record<string, unknown>);
  },
  sim: (ctx) => {
    ctx.granted();
    ctx.emit(summarize([
      { name: mask("Avery Stone"), email: mask("avery@example.com"), tel: mask("+1 555 0101") },
      { name: mask("Jordan Lee"), email: mask("jordan@example.org"), tel: "" },
      { name: mask("Sam Rivera"), email: "", tel: mask("+1 555 0133") },
    ]) as unknown as Record<string, unknown>);
    return () => {};
  },
  Instrument: ({ session }: InstrumentProps) => {
    const d = lastData<ContactRec>(session);
    const cov = (label: string, n: number) => (
      <div key={label} className="eir-cov eir-mono"><span>{label}</span><div className="eir-meter" style={{ margin: 0 }}><i style={{ width: `${d && d.count ? (n / d.count) * 100 : 0}%` }} /></div><span>{n}/{d?.count}</span></div>
    );
    return (
      <Frame
        visual={d ? (
          <div className="eir-wrap">
            <div>
              <h4 className="eir-h">Field coverage</h4>
              {cov("name", d.with_name)}{cov("email", d.with_email)}{cov("phone", d.with_tel)}
            </div>
            <div>
              <h4 className="eir-h">Received (masked here)</h4>
              <table className="eir-contacts eir-mono">
                <thead><tr><th>Name</th><th>Email</th><th>Phone</th></tr></thead>
                <tbody>{d.contacts.map((c, i) => <tr key={i}><td>{c.name || "n/a"}</td><td>{c.email || "n/a"}</td><td>{c.tel || "n/a"}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        ) : <Waiting session={session} what="Shows how many contacts you shared and which fields came with them. Values are masked." />}
        side={<Readout rows={[{ k: "Contacts shared", v: d?.count ?? null, hot: true }, { k: "With email", v: d?.with_email ?? null }, { k: "With phone", v: d?.with_tel ?? null }, { k: "Values masked", v: true }]} />}
      />
    );
  },
};

// ---------- Storage and tracking ----------

type StRec = { checks: Check[]; score: number; available: number; total: number; embedded: number };

async function probeStorage(): Promise<StRec> {
  const tryBool = (fn: () => boolean) => { try { return fn(); } catch { return false; } };
  const cookie = tryBool(() => {
    document.cookie = "eir_probe=1; path=/; SameSite=Lax; max-age=60";
    const ok = document.cookie.includes("eir_probe=1");
    document.cookie = "eir_probe=; path=/; max-age=0";
    return ok;
  });
  const local = tryBool(() => { localStorage.setItem("eir_probe", "1"); const ok = localStorage.getItem("eir_probe") === "1"; localStorage.removeItem("eir_probe"); return ok; });
  const session = tryBool(() => { sessionStorage.setItem("eir_probe", "1"); const ok = sessionStorage.getItem("eir_probe") === "1"; sessionStorage.removeItem("eir_probe"); return ok; });
  const idb = await new Promise<boolean>((res) => {
    try {
      const r = indexedDB.open("eir_probe");
      r.onsuccess = () => { r.result.close(); indexedDB.deleteDatabase("eir_probe"); res(true); };
      r.onerror = () => res(false);
      r.onblocked = () => res(false);
    } catch { res(false); }
  });
  const cacheApi = "caches" in window;
  const sw = "serviceWorker" in navigator;
  let persisted: boolean | null = null;
  try { if (navigator.storage?.persisted) persisted = await navigator.storage.persisted(); } catch { /* ignore */ }
  let hasAccess: boolean | null = null;
  try { if (typeof (document as any).hasStorageAccess === "function") hasAccess = await (document as any).hasStorageAccess(); } catch { /* ignore */ }
  const embedded = window.top !== window.self;
  const checks: Check[] = [
    { label: "Cookies", note: `navigator.cookieEnabled is ${navigator.cookieEnabled}; write and read back ${cookie ? "worked" : "failed"}`, state: cookie },
    { label: "localStorage", note: "Survives restarts until cleared", state: local },
    { label: "sessionStorage", note: "Lives until the tab closes", state: session },
    { label: "IndexedDB", note: "Large structured store, easy to hide an id in", state: idb },
    { label: "Cache Storage", note: "Can hold an id inside a cached response", state: cacheApi },
    { label: "Service worker", note: "Lets a site run code and keep data in the background", state: sw },
    { label: "Persistent storage granted", note: "Browser will not evict this site's data under pressure", state: persisted },
    { label: "Storage Access API", note: embedded ? "Embedded: hasStorageAccess() tells if third-party cookies pass" : `Top level page: hasStorageAccess() is ${hasAccess === null ? "not offered" : hasAccess}`, state: hasAccess },
    { label: "Third-party cookie hint", note: embedded ? "This page is framed; cookie write test above reflects third-party rules" : "Page is top level, so first-party rules apply; embeds would be partitioned or blocked in most browsers", state: embedded ? cookie : null },
  ];
  const persistent = [cookie, local, idb, cacheApi, sw, persisted === true];
  const available = persistent.filter(Boolean).length;
  return { checks, score: Math.round((available / persistent.length) * 100), available, total: persistent.length, embedded: embedded ? 1 : 0 };
}

const storage: ScopeDef = {
  id: "identity.storage_tracking", name: "Storage and tracking", domain: "identity", atlas: ["web.storage.cookies-first-party", "web.storage.localstorage", "web.storage.indexeddb", "web.storage.storage-access", "web.storage.storage-partitioning"],
  summary: "Tests which places this page can hide an identifier and read it back, and scores how well one would persist.",
  call: "document.cookie, localStorage, indexedDB.open, document.hasStorageAccess()", passive: true,
  reveals: ["Whether a tracking id would survive a restart on this browser", "Whether you block third-party cookies or partition storage", "Several redundant places a site can store the same id"],
  feeds: ["fingerprint.profile", "identity.contacts"],
  metrics: [{ key: "score", label: "persistence", unit: "%" }, { key: "available", label: "stores" }],
  live: async (ctx) => {
    const first = await probeStorage();
    ctx.granted();
    ctx.emit(first as unknown as Record<string, unknown>);
    const h = setInterval(() => void probeStorage().then((r) => ctx.emit(r as unknown as Record<string, unknown>)), 5000);
    return () => clearInterval(h);
  },
  sim: (ctx) => {
    ctx.granted();
    const states: (boolean | null)[] = [true, true, true, true, true, true, false, null, null];
    const labels = ["Cookies", "localStorage", "sessionStorage", "IndexedDB", "Cache Storage", "Service worker", "Persistent storage granted", "Storage Access API", "Third-party cookie hint"];
    const checks = labels.map((label, i) => ({ label, note: "simulated browser with default settings", state: states[i] }));
    return every(2500, () => ctx.emit({ checks, score: 83, available: 5, total: 6, embedded: 0 }));
  },
  Instrument: ({ session }: InstrumentProps) => {
    const d = lastData<StRec>(session);
    return (
      <Frame
        visual={d ? (
          <div className="eir-wrap">
            <div>
              <h4 className="eir-h">Identifier persistence</h4>
              <div className="eir-score"><b className="eir-num" style={{ color: COLOR }}>{d.score}</b><span className="eir-state">out of 100: {d.available} of {d.total} long lived stores open</span></div>
              <div className="eir-meter"><i style={{ width: `${d.score}%`, background: COLOR }} /></div>
            </div>
            <CheckList checks={d.checks} />
          </div>
        ) : <Waiting session={session} what="Checks which storage areas work and scores how well an identifier would persist." />}
        side={<Readout rows={[{ k: "Persistence score", v: d?.score ?? null, u: "%", digits: 0, hot: true }, { k: "Long lived stores", v: d ? `${d.available} of ${d.total}` : null }, { k: "Page is framed", v: d ? d.embedded === 1 : null }, { k: "Probe values cleaned up", v: true }]} />}
      />
    );
  },
};

export const identityScopes: ScopeDef[] = [passkeys, contacts, storage];
