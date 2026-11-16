// Compiles the Platform.Ontology dataset into a compact public/data/lab.json
// and generates src/generated/iconMap.ts with only the Lucide icons the data uses.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const labRoot = join(here, '..');
const dataRoot = join(labRoot, '..', '..', 'data');

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const taxonomy = readJson(join(dataRoot, 'taxonomy.json'));

function loadSpace(space) {
  const out = [];
  const base = join(dataRoot, space);
  for (const group of readdirSync(base)) {
    const gdir = join(base, group);
    let files = [];
    try { files = readdirSync(gdir).filter((f) => f.endsWith('.json')); } catch { continue; }
    for (const f of files) out.push(readJson(join(gdir, f)));
  }
  return out;
}

const clean = (s) => (typeof s === 'string' ? s.replace(/[–—]/g, ', ').replace(/\s+,/g, ',') : s);
const cleanArr = (a) => (Array.isArray(a) ? a.map(clean) : []);

function common(m) {
  return {
    id: m.id,
    n: clean(m.name),
    k: m.kind,
    g: m.group,
    pl: clean(m.plain || ''),
    me: clean(m.meaning || ''),
    lc: m.lifecycle || [],
    ic: m.story?.icon || '',
    tg: (m.tags || []).slice(0, 6),
    d: {
      t: m.data?.type || 'none',
      m: clean(m.data?.metric || ''),
      u: clean(m.data?.update || ''),
      f: (m.data?.fields || []).slice(0, 10).map((f) => ({
        n: f.name,
        t: f.type || '',
        u: f.unit || '',
        r: clean(f.range || ''),
      })),
    },
    l: {
      h: clean(m.limits?.headline || ''),
      a: clean(m.limits?.user_action || ''),
      c: cleanArr(m.limits?.can),
      x: cleanArr(m.limits?.cannot),
      r: m.limits?.reach || 1,
      rl: clean(m.limits?.reach_label || ''),
      df: clean(m.limits?.differs || ''),
    },
    s: m.scores?.sensitivity ?? 0,
    fr: m.scores?.friction ?? 0,
    ut: m.scores?.utility ?? 0,
    fb: m.scores?.fingerprint_bits ?? null,
    wh: clean(m.story?.what_it_is || ''),
    uc: cleanArr(m.value?.legit_uses).slice(0, 3),
    ab: cleanArr(m.value?.abuse).slice(0, 3),
  };
}

const mobile = loadSpace('mobile').map((m) => {
  const o = common(m);
  o.sp = 'm';
  o.p = {};
  for (const pf of ['android', 'ios']) {
    const p = m.platforms?.[pf];
    if (!p) continue;
    o.p[pf] = {
      s: p.s || 'n',
      v: String(p.v ?? ''),
      api: p.api ?? null,
      pm: p.permission || '',
      pr: p.protection || '',
      g: p.grant || 'none',
      ui: clean(p.prompt_ui || ''),
      ps: clean(p.persistence || ''),
      rv: clean(p.revocation || ''),
      sp: clean(p.store_policy || ''),
      as: clean(p.api_surface || ''),
      nt: clean(p.note || ''),
    };
  }
  return o;
});

const web = loadSpace('web').map((m) => {
  const o = common(m);
  o.sp = 'w';
  const w = m.platforms?.web || {};
  const a = w.access || {};
  const sup = {};
  for (const [b, v] of Object.entries(w.support || {})) sup[b] = [v.s || 'n', String(v.v ?? '')];
  o.p = {
    web: {
      api: clean(w.api || ''),
      pm: clean(w.permission_name || ''),
      pp: clean(w.permissions_policy || ''),
      g: a.grant || 'none',
      ui: clean(a.prompt_ui || ''),
      sc: a.secure_context === true,
      ug: a.user_gesture === true,
      ps: clean(a.persistence || ''),
      rv: clean(a.revocation || ''),
      ifr: clean(a.iframe || ''),
      st: cleanArr(a.steps),
      sup,
    },
  };
  return o;
});

const items = [...mobile, ...web];
const idSet = new Set();
for (const it of items) {
  if (idSet.has(it.id)) throw new Error('duplicate id ' + it.id);
  idSet.add(it.id);
}

const out = {
  generated: new Date().toISOString().slice(0, 10),
  kinds: Object.fromEntries(Object.entries(taxonomy.kinds).map(([k, v]) => [k, { label: v.label, icon: v.icon, description: v.description }])),
  groups: Object.fromEntries(Object.entries(taxonomy.groups).map(([k, v]) => [k, { label: v.label, icon: v.icon, description: v.description }])),
  lifecycle: taxonomy.lifecycle,
  reach: taxonomy.reach,
  browsers: taxonomy.platforms?.web?.browsers || {},
  statusCodes: taxonomy.status_codes,
  items,
};

mkdirSync(join(labRoot, 'public', 'data'), { recursive: true });
writeFileSync(join(labRoot, 'public', 'data', 'lab.json'), JSON.stringify(out));

// ---- icons ----
const lucide = await import('lucide-react');
const names = new Set();
for (const g of Object.values(out.groups)) names.add(g.icon);
for (const k of Object.values(out.kinds)) names.add(k.icon);
for (const it of items) if (it.ic) names.add(it.ic);
const pascal = (s) => s.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
const found = [];
const missing = [];
for (const n of [...names].sort()) {
  const P = pascal(n);
  if (lucide[P]) found.push([n, P]);
  else if (lucide[P + 'Icon']) found.push([n, P + 'Icon']);
  else missing.push(n);
}
mkdirSync(join(labRoot, 'src', 'generated'), { recursive: true });
const ts =
  '// Generated by scripts/gen-lab-data.mjs. Do not edit.\n' +
  "import type { LucideIcon } from 'lucide-react';\n" +
  'import {\n' + found.map(([, P]) => `  ${P},`).join('\n') + "\n} from 'lucide-react';\n\n" +
  'export const iconMap: Record<string, LucideIcon> = {\n' + found.map(([n, P]) => `  '${n}': ${P},`).join('\n') + '\n};\n';
writeFileSync(join(labRoot, 'src', 'generated', 'iconMap.ts'), ts);

console.log(`lab.json: ${items.length} items (${mobile.length} mobile, ${web.length} web), icons ${found.length} found, ${missing.length} missing${missing.length ? ' [' + missing.join(', ') + ']' : ''}`);
