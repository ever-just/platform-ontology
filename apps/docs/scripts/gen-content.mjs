// Turns every data/<space>/<group>/<slug>.json file into an MDX page.
// Output: content/docs/capabilities/<mobile|web>/<group>/<slug>.mdx plus meta.json folder titles.
// Also copies brand files into public/. Run as the prebuild step. No dependencies.
import {
  readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync, copyFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(APP, '..', '..');
const OUT = join(APP, 'content', 'docs', 'capabilities');
const GH = 'https://github.com/ever-just/platform-ontology/blob/main/data';

const tax = JSON.parse(readFileSync(join(ROOT, 'data/taxonomy.json'), 'utf8'));
const BROWSERS = tax.platforms.web.browsers;
const PLATFORM_LABEL = { android: 'Android', ios: 'iPhone', ...BROWSERS };

// ---------- escaping ----------
const one = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
/** Escape text so MDX and markdown treat it as plain words. */
function esc(s) {
  let t = one(s)
    .replace(/&/g, '&amp;')
    .replace(/[\\`*_{}[\]<>|~#$]/g, (c) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : `\\${c}`));
  t = t.replace(/^([-+])(\s|$)/, '\\$1$2').replace(/^(\d+)([.)])(\s|$)/, '$1\\$2$3');
  return t;
}
/** Inline code that is safe inside table cells. */
function code(s) {
  const t = one(s).replace(/\|/g, '\\|');
  if (!t) return '';
  if (t.includes('`')) return '`` ' + t + ' ``';
  return '`' + t + '`';
}
const cell = (s, fallback = 'Not listed') => (one(s) ? esc(s) : fallback);
const yaml = (s) => JSON.stringify(one(s));
const url = (u) => one(u).replace(/[()\s<>]/g, (c) => encodeURIComponent(c));
const link = (label, href) => `[${esc(label)}](${url(href)})`;
const jsx = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

// ---------- load ----------
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.json') ? [join(d, e.name)] : []);

const items = [];
for (const space of ['mobile', 'web']) {
  for (const f of walk(join(ROOT, 'data', space)).sort()) {
    const e = JSON.parse(readFileSync(f, 'utf8'));
    const file = f.split('/').pop().replace(/\.json$/, '');
    const slug = file.replace(/\./g, '-');
    e._file = file;
    e._slug = slug;
    e._url = `/docs/capabilities/${e.space}/${e.group}/${slug}/`;
    items.push(e);
  }
}
const byId = new Map(items.map((e) => [e.id, e]));
// Make sure slugs do not collide inside a folder.
const seen = new Set();
for (const e of items) {
  const k = `${e.space}/${e.group}/${e._slug}`;
  if (seen.has(k)) throw new Error(`slug collision ${k}`);
  seen.add(k);
}

// ---------- helpers ----------
const kindLabel = (k) => tax.kinds[k]?.label ?? k;
const groupLabel = (g) => tax.groups[g]?.label ?? g;
const lifecycleLabel = (l) => tax.lifecycle[l] ?? l;
const toArr = (a) => (Array.isArray(a) ? a : a == null || a === '' ? [] : [a]);
const list = (arr) => toArr(arr).filter((x) => one(x)).map((x) => `- ${esc(x)}`).join('\n');

function version(os, b) {
  const v = one(b.v);
  if (!v) return 'Not available';
  if (os === 'android') return `Android ${esc(v)}${b.api ? ` (API ${esc(b.api)})` : ''}`;
  if (os === 'ios') return `iOS ${esc(v)}`;
  return esc(v);
}
const statusCell = (s) => `<S s="${['y', 'p', 'n', 'r', 'f'].includes(s) ? s : 'n'}" />`;

function table(head, rows) {
  const h = `| ${head.join(' | ')} |\n| ${head.map(() => '---').join(' | ')} |`;
  return `${h}\n${rows.map((r) => `| ${r.join(' | ')} |`).join('\n')}`;
}

function mobileTables(e) {
  const a = e.platforms.android || {};
  const i = e.platforms.ios || {};
  const rows = [
    ['Status', statusCell(a.s), statusCell(i.s)],
    ['First version', version('android', a), version('ios', i)],
    ['Permission or entitlement', cell(a.permission), cell(i.permission)],
    ['Protection level', cell(a.protection), cell(i.protection)],
    ['How access is granted', cell(a.grant), cell(i.grant)],
    ['What the user sees', cell(a.prompt_ui), cell(i.prompt_ui)],
    ['How long it lasts', cell(a.persistence), cell(i.persistence)],
    ['How to take it back', cell(a.revocation), cell(i.revocation)],
    ['Store policy', cell(a.store_policy, 'None listed'), cell(i.store_policy, 'None listed')],
    ['API', cell(a.api_surface), cell(i.api_surface)],
    ['Notes', cell(a.note, 'None'), cell(i.note, 'None')],
  ];
  return `## On Android and iPhone

${table(['', 'Android', 'iPhone'], rows)}`;
}

function webTables(e) {
  const w = e.platforms.web || {};
  const sup = w.support || {};
  const anyDate = Object.values(sup).some((s) => one(s.date));
  const head = ['Browser', 'Status', 'First version', ...(anyDate ? ['Released'] : []), 'Note'];
  const rows = Object.keys(BROWSERS).map((k) => {
    const s = sup[k] || { s: 'n', v: '', note: '' };
    return [
      esc(BROWSERS[k]),
      statusCell(s.s),
      s.v ? esc(s.v) : 'Not available',
      ...(anyDate ? [cell(s.date, 'Not listed')] : []),
      cell(s.note, 'None'),
    ];
  });
  const acc = w.access || {};
  const yn = (b) => (b === true ? 'Yes' : b === false ? 'No' : 'Not listed');
  const arows = [
    ['API', w.api ? code(w.api) : 'Not listed'],
    ...(w.permission_name ? [['Permission name', code(w.permission_name)]] : []),
    ...(w.permissions_policy ? [['Permissions policy', code(w.permissions_policy)]] : []),
    ...((w.bcd || []).length ? [['Browser compat keys', w.bcd.map(code).join('<br />')]] : []),
    ['How access is granted', cell(acc.grant)],
    ['What the user sees', cell(acc.prompt_ui)],
    ['Needs a secure context (HTTPS)', yn(acc.secure_context)],
    ['Needs a user gesture', yn(acc.user_gesture)],
    ...(acc.activation ? [['Activation', cell(acc.activation)]] : []),
    ['How long it lasts', cell(acc.persistence)],
    ['How to take it back', cell(acc.revocation)],
    ['Inside an iframe', cell(acc.iframe)],
  ];
  const steps = (acc.steps || []).filter((x) => one(x)).map((x, n) => `${n + 1}. ${esc(x)}`).join('\n');
  return `## Browser support

${table(head, rows)}

## How a site asks for it

${table(['', ''], arows)}
${steps ? `\n### Typical flow\n\n${steps}\n` : ''}`;
}

function dataSection(e) {
  const d = e.data || {};
  const fields = d.fields || [];
  const meta = [
    d.metric ? `**What comes back:** ${esc(d.metric)}` : '',
    d.type ? `**Shape:** ${esc(d.type)}` : '',
    d.update ? `**How often:** ${esc(d.update)}` : '',
  ].filter(Boolean).join('  \n');
  const t = fields.length
    ? '\n\n' + table(
      ['Field', 'Type', 'Unit', 'Range', 'Precision'],
      fields.map((f) => [code(f.name) || 'Not listed', cell(f.type), cell(f.unit, 'None'), cell(f.range), cell(f.precision)]),
    )
    : '\n\nNo individual data fields. The signal is the access itself.';
  return `## Data you get

${meta}${t}`;
}

function storySection(e) {
  const s = e.story || {};
  const out = ['## The story'];
  if (s.what_it_is) out.push(`### What it is\n\n${esc(s.what_it_is)}`);
  if (s.for_you) out.push(`### For you\n\n${esc(s.for_you)}`);
  if (s.for_makers) out.push(`### For makers\n\n${esc(s.for_makers)}`);
  if ((s.use_cases || []).length) {
    out.push(`### Where you see it\n\n${table(
      ['Type', 'Example', 'Apps'],
      s.use_cases.map((u) => [esc(u.type), cell(u.example), (u.apps || []).length ? esc(u.apps.join(', ')) : 'None named']),
    )}`);
  }
  if ((s.risks || []).length) out.push(`### Risks\n\n${list(s.risks)}`);
  if (e.space === 'mobile' && (one(s.android_note) || one(s.ios_note))) {
    out.push(`### Android and iPhone in short\n\n${[
      one(s.android_note) ? `- **Android:** ${esc(s.android_note)}` : '',
      one(s.ios_note) ? `- **iPhone:** ${esc(s.ios_note)}` : '',
    ].filter(Boolean).join('\n')}`);
  }
  if ((s.marketing || []).length) {
    out.push(`### What the platform says\n\n${s.marketing.map((m) =>
      `- ${link(`${m.vendor}: ${m.name}`, m.url)}. ${esc(m.pitch)}`).join('\n')}`);
  }
  return out.join('\n\n');
}

function historySection(e) {
  const h = e.history || [];
  if (!h.length) return '';
  const rows = [...h].sort((a, b) => String(a.date).localeCompare(String(b.date))).map((x) => {
    const who = PLATFORM_LABEL[x.platform] || PLATFORM_LABEL[x.browser] || x.platform || x.browser || '';
    const ver = x.version ? ` ${x.version}` : '';
    return `- **${esc(x.date)}**, ${esc(`${who}${ver}`.trim())}: ${esc(x.change)}`;
  });
  return `## History\n\n${rows.join('\n')}`;
}

function relatedSection(e) {
  const out = [];
  const line = (id) => {
    const t = byId.get(id);
    return t ? `- [${esc(t.name)}](${t._url}). ${esc(t.limits?.headline || t.plain)}` : '';
  };
  const rel = (e.related || []).map(line).filter(Boolean);
  if (rel.length) out.push(`### Related\n\n${rel.join('\n')}`);
  const eq = (e.web_equivalents || []);
  const mob = eq.filter((id) => id.startsWith('mob.')).map(line).filter(Boolean);
  const web = eq.filter((id) => id.startsWith('web.')).map(line).filter(Boolean);
  if (web.length) out.push(`### Same idea on the web\n\n${web.join('\n')}`);
  if (mob.length) out.push(`### Same idea in native apps\n\n${mob.join('\n')}`);
  return out.length ? `## Related capabilities\n\n${out.join('\n\n')}` : '';
}

const CONF = {
  verified: 'Checked against real behavior',
  docs: 'Based on official documentation',
  inferred: 'Inferred from related behavior',
};

function page(e) {
  const l = e.limits || {};
  const chips = [
    { text: kindLabel(e.kind), kind: true },
    { text: groupLabel(e.group) },
    ...(e.subgroup ? [{ text: e.subgroup }] : []),
    { text: e.space === 'mobile' ? 'Android and iPhone' : 'Web browsers' },
    ...(e.lifecycle || []).map((x) => ({ text: lifecycleLabel(x) })),
  ];
  const sc = e.scores || {};
  const score = (n) => (n === null || n === undefined ? 'Not rated' : `${esc(n)}${n === 0 ? '' : ''}`);
  const scoreRows = [
    ['Sensitivity', sc.sensitivity != null ? `${sc.sensitivity} of 5` : 'Not rated', 'How revealing the data is'],
    ['Utility', sc.utility != null ? `${sc.utility} of 5` : 'Not rated', 'How useful it is to honest apps'],
    ['Friction', sc.friction != null ? `${sc.friction} of 5` : 'Not rated', 'How much the user has to do'],
    ['Fingerprint bits', score(sc.fingerprint_bits), 'Rough identifying entropy, when known'],
  ];
  const v = e.value || {};
  const li = e.case_study?.linkedin;

  const parts = [
    `---\ntitle: ${yaml(e.name)}\ndescription: ${yaml(e.plain)}\n---`,
    `<Chips items={${jsx(chips)}} />`,
    `<Callout title="In one line">\n\n${esc(l.headline || e.plain)}\n\n</Callout>`,
    `${esc(e.plain)}${one(e.meaning) ? `\n\n${esc(e.meaning)}` : ''}`,
    `## What it can and can't do

<Reach level={${Number(l.reach) || 1}} label={${jsx(one(l.reach_label))}} />

${l.user_action ? `**What the user does:** ${esc(l.user_action)}\n` : ''}
### It can

${list(l.can)}

### It cannot

${list(l.cannot)}
${l.differs ? `\n**How it differs between platforms:** ${esc(l.differs)}` : ''}`,
    e.space === 'mobile' ? mobileTables(e) : webTables(e),
    dataSection(e),
    (e.technical_bounds || []).length ? `## Technical limits\n\n${list(e.technical_bounds)}` : '',
    storySection(e),
    `## Good uses and abuse

### Legitimate uses

${list(v.legit_uses) || 'None listed.'}

### Known abuse

${list(v.abuse) || 'None listed.'}

### Scores

${table(['Score', 'Value', 'Meaning'], scoreRows)}`,
    li?.used ? `## A real example: LinkedIn\n\n${esc(li.how)}` : '',
    historySection(e),
    relatedSection(e),
    `## Sources

${(e.refs || []).map((r) => `- ${link(r.label, r.url)}`).join('\n') || 'None listed.'}

**How well checked:** ${esc(CONF[e.confidence] || e.confidence)}.`,
    `<Cards>
${e.space === 'web' ? `  <Card title="Open it in the console" href="/console/#${e.id}">Request this scope in your browser and watch the data arrive.</Card>\n` : ''}  <Card title="Edit this data on GitHub" href="${GH}/${e.space}/${e.group}/${e._file}.json">Fix a fact or add a source. One small JSON file, no code needed.</Card>
</Cards>`,
  ];
  return parts.filter(Boolean).join('\n\n') + '\n';
}

function indexPage(title, description, body) {
  return `---\ntitle: ${yaml(title)}\ndescription: ${yaml(description)}\n---\n\n${body}\n`;
}

const writeJson = (p, o) => writeFileSync(p, JSON.stringify(o, null, 2) + '\n');
const put = (p, s) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, s); };

// ---------- write ----------
if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const SPACES = {
  mobile: {
    title: 'Native apps (Android and iPhone)',
    desc: '361 capabilities of installed apps, with Android and iPhone shown side by side.',
  },
  web: {
    title: 'Websites (7 browsers)',
    desc: '483 capabilities of websites, with support in 7 browsers.',
  },
};

const groupOrder = Object.keys(tax.groups);
for (const space of ['mobile', 'web']) {
  const spaceItems = items.filter((e) => e.space === space);
  const groups = groupOrder.filter((g) => spaceItems.some((e) => e.group === g));
  for (const g of groups) {
    const gi = spaceItems.filter((e) => e.group === g);
    const dir = join(OUT, space, g);
    for (const e of gi) put(join(dir, `${e._slug}.mdx`), page(e));
    writeJson(join(dir, 'meta.json'), { title: groupLabel(g) });
    const sorted = [...gi].sort((a, b) => a.name.localeCompare(b.name));
    put(join(dir, 'index.mdx'), indexPage(
      groupLabel(g),
      `${tax.groups[g].description}. ${gi.length} capabilities.`,
      `${esc(tax.groups[g].description)}. ${gi.length} capabilities in this group.\n\n${table(
        ['Capability', 'Kind', 'In one line'],
        sorted.map((e) => [`[${esc(e.name)}](${e._url})`, esc(kindLabel(e.kind)), esc(e.limits?.headline || e.plain)]),
      )}`,
    ));
  }
  writeJson(join(OUT, space, 'meta.json'), { title: SPACES[space].title, pages: ['index', ...groups] });
  put(join(OUT, space, 'index.mdx'), indexPage(
    SPACES[space].title,
    SPACES[space].desc,
    `${esc(SPACES[space].desc)}\n\n<Cards>\n${groups.map((g) => {
      const n = spaceItems.filter((e) => e.group === g).length;
      return `  <Card title={${jsx(groupLabel(g))}} href="/docs/capabilities/${space}/${g}/">${esc(tax.groups[g].description)}. ${n} capabilities.</Card>`;
    }).join('\n')}\n</Cards>`,
  ));
}
writeJson(join(OUT, 'meta.json'), { title: 'Capabilities', pages: ['index', 'mobile', 'web'] });
put(join(OUT, 'index.mdx'), indexPage(
  'Capabilities',
  'All 844 capabilities, one page each.',
  `Every capability has its own page with plain limits, the exact platform details and a link to the data file.

<Cards>
  <Card title="Native apps (Android and iPhone)" href="/docs/capabilities/mobile/">361 capabilities, Android and iPhone side by side.</Card>
  <Card title="Websites (7 browsers)" href="/docs/capabilities/web/">483 capabilities with support in 7 browsers.</Card>
</Cards>`,
));

// ---------- brand files ----------
mkdirSync(join(APP, 'public'), { recursive: true });
for (const f of ['logo.svg', 'mark.svg', 'favicon.svg', 'favicon.ico', 'apple-touch-icon.png', 'og.png']) {
  const src = join(ROOT, 'brand', f);
  if (existsSync(src)) copyFileSync(src, join(APP, 'public', f));
  else console.warn(`brand file missing: ${f}`);
}

// ---------- dash check (writing rule) ----------
let bad = 0;
const scan = (d) => {
  for (const ent of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, ent.name);
    if (ent.isDirectory()) scan(p);
    else if (/[\u2013\u2014]/.test(readFileSync(p, 'utf8'))) { bad++; if (bad < 5) console.warn(`dash found in ${p}`); }
  }
};
scan(OUT);
if (bad) { console.error(`${bad} generated files contain an em or en dash`); process.exit(1); }

console.log(`generated ${items.length} capability pages in ${OUT}`);
