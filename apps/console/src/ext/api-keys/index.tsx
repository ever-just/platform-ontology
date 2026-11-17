import { useEffect, useState } from "react";
import { Button, Callout, HTMLTable, InputGroup } from "@blueprintjs/core";
import { registerView, type ConsoleCtx } from "../registry";
import { accountState, onAccount, post, signInAnonymous, type State } from "../account";

// API keys: make a key for https://api.platformontology.lol (REST and MCP). Separate module that
// reuses the Account module's sign in. A key is shown once; only its hash is stored.

type Key = { id: string; name: string; prefix: string; created_at: string; last_used_at: string | null };
const API = "https://api.platformontology.lol";

let count = 0;

function KeysPanel(_: { ctx: ConsoleCtx }) {
  const [acct, setAcct] = useState<State | null>(accountState());
  const [keys, setKeys] = useState<Key[]>([]);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => onAccount(setAcct), []);
  const load = async () => {
    const r = await post("/api/account", { action: "list_keys" });
    if (r.ok) { const k = (await r.json()) as Key[]; setKeys(k); count = k.length; }
  };
  useEffect(() => { if (acct?.user) load(); }, [acct?.user?.id]);

  const create = async () => {
    setBusy(true); setErr("");
    try {
      const r = await post("/api/account", { action: "create_key", name: name || "My key" });
      const j = await r.json();
      if (!r.ok) setErr(j.error || "Could not make a key");
      else { setFresh(j.key); setName(""); await load(); }
    } finally { setBusy(false); }
  };
  const revoke = async (id: string) => { await post("/api/account", { action: "revoke_key", id }); await load(); };

  if (!acct?.user) {
    return (
      <div className="vp" data-agent-off><div className="vp-pad">
        <p className="vp-lede">API keys let a script or an AI agent read your saved readings and drive this tab through MCP. Start an account first; it needs no email.</p>
        <Button data-control="api-keys.start-account" intent="primary" onClick={() => signInAnonymous()} text="Start an account" />
      </div></div>
    );
  }
  const mcpJson = JSON.stringify({ mcpServers: { "platform-ontology": { type: "http", url: `${API}/mcp`, headers: { Authorization: `Bearer ${fresh || "<your key>"}` } } } }, null, 2);
  return (
    <div className="vp" data-agent-off><div className="vp-pad">
      <p className="vp-lede">REST at <code>{API}/v1</code> and MCP at <code>{API}/mcp</code>. MCP calls run in this tab, so keep it open and signed in.</p>
      <div style={{ display: "flex", gap: 8, maxWidth: 480, marginBottom: 12 }}>
        <InputGroup placeholder="Key name" value={name} onChange={(e) => setName(e.target.value)} fill />
        <Button data-control="api-keys.make" intent="primary" loading={busy} onClick={create} text="Make API key" />
      </div>
      {err && <Callout intent="danger" compact>{err}</Callout>}
      {fresh && (
        <Callout intent="success" compact title="Copy it now; it will not be shown again">
          <code style={{ wordBreak: "break-all" }}>{fresh}</code>
          <div style={{ marginTop: 6 }}><Button data-control="api-keys.copy-key" small onClick={() => navigator.clipboard?.writeText(fresh)} text="Copy key" />{" "}
            <Button data-control="api-keys.copy-mcp" small minimal onClick={() => navigator.clipboard?.writeText(mcpJson)} text="Copy MCP config" /></div>
        </Callout>
      )}
      {keys.length > 0 && (
        <HTMLTable compact striped style={{ marginTop: 12 }}>
          <thead><tr><th>Name</th><th>Starts with</th><th>Made</th><th>Last used</th><th /></tr></thead>
          <tbody>{keys.map((k) => (
            <tr key={k.id}><td>{k.name}</td><td><code>{k.prefix}_…</code></td><td>{new Date(k.created_at).toLocaleDateString()}</td>
              <td>{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "never"}</td>
              <td><Button data-control={`api-keys.revoke.${k.id}`} small minimal intent="danger" onClick={() => revoke(k.id)} text="Revoke" /></td></tr>
          ))}</tbody>
        </HTMLTable>
      )}
      <pre style={{ marginTop: 14, fontSize: 11 }}>{mcpJson}</pre>
    </div></div>
  );
}

registerView({
  id: "api-keys",
  label: "API keys",
  order: 910,
  metric: () => (accountState()?.user ? { value: String(count), unit: "keys", sub: "api.platformontology.lol" } : { value: "Off", sub: "start an account" }),
  Panel: KeysPanel,
});
