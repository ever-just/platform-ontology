// Every Better Auth route under /api/auth/*: anonymous sign in, session, GitHub link, sign out.
import { auth } from "../_lib/auth.mjs";

export const GET = (req) => auth.handler(req);
export const POST = (req) => auth.handler(req);
