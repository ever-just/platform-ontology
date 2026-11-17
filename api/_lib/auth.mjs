// Better Auth for platformontology.lol. Accounts start anonymous; GitHub can be linked later.
// Storage is the lake schema po_auth, reached only through api.po_auth_db. Nothing personal is
// kept: anonymous users get a made up address under .invalid, GitHub users are stored as an HMAC
// of their GitHub id, and tokens, IP addresses and user agents are dropped before every write.

import { createHmac, randomBytes } from "node:crypto";
import { betterAuth } from "better-auth";
import { createAdapterFactory } from "better-auth/adapters";
import { anonymous } from "better-auth/plugins/anonymous";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { rpc } from "./lake.mjs";

const snake = (s) => s.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const toSnake = (o) => (o ? Object.fromEntries(Object.entries(o).map(([k, v]) => [snake(k), v])) : o);
const toCamel = (o) => (o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [camel(k), v])) : o);
const where = (w) => (w || []).map((c) => ({ ...c, field: snake(c.field) }));
const db = (p) => rpc("po_auth_db", { p });

const lakeAdapter = createAdapterFactory({
  config: {
    adapterId: "po-lake",
    adapterName: "platform ontology lake",
    usePlural: false,
    supportsJSON: true,
    supportsDates: false,
    supportsBooleans: true,
    transaction: false,
  },
  adapter: () => ({
    async create({ model, data }) {
      return toCamel(await db({ op: "create", model, data: toSnake(data) }));
    },
    async findOne({ model, where: w }) {
      return toCamel(await db({ op: "find_one", model, where: where(w) }));
    },
    async findMany({ model, where: w, limit, offset, sortBy }) {
      const rows = await db({
        op: "find_many", model, where: where(w), limit, offset,
        sort_by: sortBy ? { field: snake(sortBy.field), direction: sortBy.direction } : undefined,
      });
      return (rows || []).map(toCamel);
    },
    async count({ model, where: w }) {
      return Number(await db({ op: "count", model, where: where(w) })) || 0;
    },
    async update({ model, where: w, update }) {
      return toCamel(await db({ op: "update", model, where: where(w), update: toSnake(update) }));
    },
    async updateMany({ model, where: w, update }) {
      return Number(await db({ op: "update_many", model, where: where(w), update: toSnake(update) })) || 0;
    },
    async delete({ model, where: w }) {
      await db({ op: "delete", model, where: where(w) });
    },
    async deleteMany({ model, where: w }) {
      return Number(await db({ op: "delete_many", model, where: where(w) })) || 0;
    },
    async consumeOne({ model, where: w }) {
      return toCamel(await db({ op: "consume_one", model, where: where(w) }));
    },
  }),
});

const SECRET = process.env.BETTER_AUTH_SECRET || "";
const hmac = (label, v) => createHmac("sha256", SECRET).update(`${label}:${v}`).digest("hex");
const rand = () => randomBytes(9).toString("hex");
const stripTokens = (a) => ({ ...a, accessToken: null, refreshToken: null, idToken: null, password: null });

export const githubEnabled = Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
const PROD = process.env.VERCEL_ENV === "production";
const BASE = PROD ? "https://platformontology.lol" : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";

const plugins = [
  anonymous({
    emailDomainName: "po.invalid",
    generateName: () => "Visitor",
    onLinkAccount: async ({ anonymousUser, newUser }) => {
      await rpc("po_account_merge", { p_from: anonymousUser.user.id, p_to: newUser.user.id });
    },
  }),
];

if (githubEnabled) {
  plugins.push(genericOAuth({
    config: [{
      providerId: "github",
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      authorizationUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      userInfoUrl: "https://api.github.com/user",
      scopes: ["read:user"],
      accountSubject: ({ profile }) => hmac("github", profile.id),
      mapProfileToUser: (profile) => ({
        name: "GitHub user",
        email: `gh-${hmac("github-mail", profile.id).slice(0, 24)}@po.invalid`,
        emailVerified: false,
        image: null,
      }),
    }],
  }));
}

export const auth = betterAuth({
  appName: "Platform Ontology",
  baseURL: BASE,
  basePath: "/api/auth",
  secret: SECRET,
  database: lakeAdapter,
  user: { modelName: "app_user" },
  trustedOrigins: ["https://platformontology.lol", "https://api.platformontology.lol", "https://ai.platformontology.lol", "https://*.vercel.app"],
  session: { expiresIn: 60 * 60 * 24 * 90, updateAge: 60 * 60 * 24 },
  advanced: {
    ipAddress: { disableIpTracking: true },
    crossSubDomainCookies: PROD ? { enabled: true, domain: "platformontology.lol" } : { enabled: false },
  },
  databaseHooks: {
    user: { create: { before: async (u) => ({ data: { ...u, image: null, email: u.email?.endsWith(".invalid") ? u.email : `anon-${rand()}@po.invalid` } }) } },
    session: { create: { before: async (s) => ({ data: { ...s, userAgent: null, ipAddress: null } }) } },
    account: {
      create: { before: async (a) => ({ data: stripTokens(a) }) },
      update: { before: async (a) => ({ data: stripTokens(a) }) },
    },
  },
  plugins,
});
