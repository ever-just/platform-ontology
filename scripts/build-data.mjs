// Compiles data/**.json into dist/ bundles. No dependencies. Usage: node scripts/build-data.mjs [outDir]
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] || join(ROOT, 'dist');
const tax = JSON.parse(readFileSync(join(ROOT, 'data/taxonomy.json'), 'utf8'));
const share = JSON.parse(readFileSync(join(ROOT, 'data/platforms-share.json'), 'utf8'));
const walk = d => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.json') ? [p] : []; });
const errors = [], items = [];
for (const space of ['mobile', 'web']) for (const f of walk(join(ROOT, 'data', space))) {
  const e = JSON.parse(readFileSync(f, 'utf8'));
  const group = basename(dirname(f));
  if (e.space !== space) errors.push(`${f}: space should be ${space}`);
  if (e.group !== group) errors.push(`${f}: group should match folder ${group}`);
  if (!tax.groups[e.group]) errors.push(`${f}: unknown group ${e.group}`);
  if (!tax.kinds[e.kind]) errors.push(`${f}: unknown kind ${e.kind}`);
  for (const k of ['id', 'name', 'plain', 'platforms']) if (!e[k]) errors.push(`${f}: missing ${k}`);
  if (/[–—]/.test(JSON.stringify(e))) errors.push(`${f}: contains an em or en dash`);
  items.push(e);
}
const ids = new Set();
for (const e of items) { if (ids.has(e.id)) errors.push(`duplicate id ${e.id}`); ids.add(e.id); }
for (const e of items) for (const r of [...(e.related || []), ...(e.web_equivalents || [])]) if (!ids.has(r)) errors.push(`${e.id}: unknown link ${r}`);
if (errors.length) { console.error(errors.slice(0, 50).join('\n')); if (process.env.STRICT) process.exit(1); }
items.sort((a, b) => a.id.localeCompare(b.id));
mkdirSync(join(OUT, 'platform'), { recursive: true });
const meta = { name: 'Platform.Ontology', version: '1.0.0', built: share.built, license: 'CC-BY-4.0', homepage: 'https://platformontology.lol', count: items.length };
const w = (p, o) => writeFileSync(join(OUT, p), JSON.stringify(o));
w('ontology.json', { ...meta, taxonomy: tax, share, capabilities: items });
w('taxonomy.json', tax);
w('index.json', { ...meta, capabilities: items.map(e => ({ id: e.id, name: e.name, kind: e.kind, group: e.group, space: e.space, plain: e.plain, headline: e.limits?.headline, icon: e.story?.icon, reach: e.limits?.reach,
  status: Object.fromEntries(Object.entries(e.platforms).map(([p, b]) => [p, p === 'web' ? Object.fromEntries(Object.entries(b?.support || {}).map(([k, v]) => [k, v.s])) : b?.s])) })) });
for (const p of ['android', 'ios', 'web']) {
  const list = items.filter(e => e.platforms[p]).map(e => { const { platforms, ...rest } = e; return { ...rest, platform: platforms[p] }; });
  w(`platform/${p}.json`, { ...meta, platform: p, count: list.length, capabilities: list });
}
console.log(`built ${items.length} capabilities into ${OUT}${errors.length ? `, ${errors.length} warnings` : ''}`);
