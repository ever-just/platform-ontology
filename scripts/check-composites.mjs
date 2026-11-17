#!/usr/bin/env node
// Checks data/composites/super-sensors.json: every input ref must be an atlas id
// (data/web, data/mobile) or another composite, and every scope a console scope id.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : p.endsWith(".json") ? [p] : [];
});
const atlas = new Set();
for (const dir of ["data/web", "data/mobile"]) {
  for (const f of walk(join(root, dir))) {
    try { const j = JSON.parse(readFileSync(f, "utf8")); if (j.id) atlas.add(j.id); } catch {}
  }
}
const scopes = new Set();
for (const f of readdirSync(join(root, "apps/console/src/scopes"))) {
  if (!/\.tsx?$/.test(f)) continue;
  const src = readFileSync(join(root, "apps/console/src/scopes", f), "utf8");
  for (const m of src.matchAll(/\bid:\s*"([a-z]+\.[a-z_-]+)"/g)) scopes.add(m[1]);
}
const { composites } = JSON.parse(readFileSync(join(root, "data/composites/super-sensors.json"), "utf8"));
const ids = new Set(composites.map((c) => c.id));
const errors = [];
for (const c of composites) {
  if (!/^(ctx|intent)\.[a-z0-9-]+$/.test(c.id)) errors.push(`${c.id}: bad id`);
  if ((c.layer === "L3") !== c.id.startsWith("intent.")) errors.push(`${c.id}: layer and prefix disagree`);
  for (const i of c.inputs) {
    const ok = i.ref.startsWith("ctx.") || i.ref.startsWith("intent.") ? ids.has(i.ref) : atlas.has(i.ref);
    if (!ok) errors.push(`${c.id}: unknown ref ${i.ref}`);
    if (i.scope && !scopes.has(i.scope)) errors.push(`${c.id}: unknown scope ${i.scope}`);
    if (i.ref === c.id) errors.push(`${c.id}: refers to itself`);
  }
}
console.log(`${composites.length} composites, ${atlas.size} atlas ids, ${scopes.size} scopes`);
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log("ok");
