// Calls one api.* function in the Supabase lake with the server key.
// Every write and read of saved accounts goes through these functions; no table is touched directly.

export async function rpc(name, args = {}) {
  const url = process.env.LAKE_SUPABASE_URL;
  const key = process.env.LAKE_SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("lake not configured");
  const res = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      "content-profile": "api",
      "accept-profile": "api",
    },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`lake ${name} ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

export const json = (status, obj, headers = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });
