// API keys for api.platformontology.lol. A key is shown once; only its SHA-256 is stored.
import { createHash, randomBytes } from "node:crypto";
import { rpc } from "./lake.mjs";

const ALPHA = "abcdefghijklmnopqrstuvwxyz0123456789";
const token = (n) => Array.from(randomBytes(n), (b) => ALPHA[b % 36]).join("");
export const sha256 = (s) => createHash("sha256").update(s).digest("hex");

export async function createKey(userId, name) {
  const prefix = `po_${token(8)}`;
  const key = `${prefix}_${token(40)}`;
  const id = `key_${token(16)}`;
  const clean = String(name || "My key").replace(/[^\w .:-]/g, "").slice(0, 60) || "My key";
  await rpc("po_key_create", { p_user: userId, p_id: id, p_name: clean, p_prefix: prefix, p_hash: sha256(key) });
  return { id, name: clean, prefix, key };
}

/** The key's id and owner from an Authorization: Bearer po_... header, or null. */
export async function resolveKey(req) {
  const m = /^Bearer\s+(po_[a-z0-9]{8}_[a-z0-9]{40})$/i.exec(req.headers.get("authorization") || "");
  if (!m) return null;
  return rpc("po_key_resolve", { p_hash: sha256(m[1]) });
}

export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type, mcp-session-id, mcp-protocol-version",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-expose-headers": "mcp-session-id",
};
