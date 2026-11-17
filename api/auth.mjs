// Every Better Auth route under /api/auth/*: anonymous sign in, session, GitHub link, sign out.
// Vercel's plain functions only match one path segment with a [...all] file, so vercel.json rewrites
// /api/auth/<any depth> here as ?__auth=<path> and this handler puts the real path back.
import { auth } from "./_lib/auth.mjs";

const restore = async (req) => {
  const u = new URL(req.url);
  const p = u.searchParams.get("__auth");
  if (p === null) return req;
  u.searchParams.delete("__auth");
  u.pathname = `/api/auth/${p.replace(/^\/+/, "")}`;
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer();
  return new Request(u, { method: req.method, headers: req.headers, body });
};

export const GET = async (req) => auth.handler(await restore(req));
export const POST = async (req) => auth.handler(await restore(req));
