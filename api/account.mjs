// GET /api/account: the signed in account, a summary of its saved readings and whether GitHub linking is on.
// POST /api/account {action:"link_visit", visit}: ties this browser's visit id to the account so its
// readings are kept with it.
// Keys: {action:"create_key", name} (the key is returned once), "list_keys", {action:"revoke_key", id}.
// Relay: "relay_claim" waits up to 20 s for MCP requests sent with this account's keys;
// {action:"relay_answer", id, response} returns the tab's answer.
import { auth, githubEnabled } from "./_lib/auth.mjs";
import { rpc, json } from "./_lib/lake.mjs";
import { createKey } from "./_lib/keys.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function who(req) {
  const s = await auth.api.getSession({ headers: req.headers });
  return s?.user || null;
}

export async function GET(req) {
  try {
    const user = await who(req);
    if (!user) return json(200, { user: null, github: githubEnabled });
    const readings = await rpc("po_readings", { p_user: user.id, p_limit: 20 });
    return json(200, { user: { id: user.id, name: user.name, anonymous: !!user.isAnonymous, created: user.createdAt }, readings, github: githubEnabled });
  } catch (e) {
    return json(500, { error: "account unavailable" });
  }
}

export async function POST(req) {
  try {
    const user = await who(req);
    if (!user) return json(401, { error: "sign in first" });
    const body = await req.json().catch(() => ({}));
    if (body.action === "link_visit") {
      if (!UUID.test(body.visit || "")) return json(400, { error: "bad visit id" });
      return json(200, await rpc("po_visit_link", { p_user: user.id, p_visit: body.visit }));
    }
    if (body.action === "create_key") {
      try { return json(200, await createKey(user.id, body.name)); }
      catch { return json(400, { error: "You can have at most 5 active keys. Revoke one first." }); }
    }
    if (body.action === "list_keys") return json(200, await rpc("po_key_list", { p_user: user.id }));
    if (body.action === "revoke_key") return json(200, { revoked: await rpc("po_key_revoke", { p_user: user.id, p_id: String(body.id || "") }) });
    if (body.action === "relay_claim") {
      const end = Date.now() + 20000;
      for (;;) {
        const got = await rpc("po_relay_claim", { p_user: user.id, p_limit: 10 });
        if ((got && got.length) || Date.now() > end) return json(200, got || []);
        await sleep(700);
      }
    }
    if (body.action === "relay_answer") {
      const id = Number(body.id);
      if (!Number.isSafeInteger(id) || typeof body.response !== "object") return json(400, { error: "bad answer" });
      return json(200, { ok: await rpc("po_relay_answer", { p_user: user.id, p_id: id, p_response: body.response }) });
    }
    return json(400, { error: "unknown action" });
  } catch (e) {
    return json(500, { error: "account unavailable" });
  }
}
