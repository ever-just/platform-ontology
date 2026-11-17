// GET /api/account: the signed in account, a summary of its saved readings and whether GitHub linking is on.
// POST /api/account {action:"link_visit", visit}: ties this browser's visit id to the account so its
// readings are kept with it.
import { auth, githubEnabled } from "./_lib/auth.mjs";
import { rpc, json } from "./_lib/lake.mjs";

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
    return json(400, { error: "unknown action" });
  } catch (e) {
    return json(500, { error: "account unavailable" });
  }
}
