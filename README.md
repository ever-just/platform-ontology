<p align="center"><img src="brand/logo.svg" alt="Platform.Ontology" width="420"></p>

<p align="center"><b>Every permission, sensor and silent signal on Android, iPhone and the web, as open data.</b></p>

<p align="center">
<a href="https://platformontology.lol">Docs</a> ·
<a href="https://platformontology.lol/lab/">Simulator</a> ·
<a href="https://platformontology.lol/wiki/">Wiki</a> ·
<a href="https://platformontology.lol/data/ontology.json">Download the data</a>
</p>

Platform.Ontology maps **844 capabilities**: everything a native app or a website can ask for, get without asking, or do on
your device. **361** native app capabilities cover Android and iPhone side by side. **483** web capabilities cover 7 browsers.
Each one says, in plain language, what it can and can't do, what you do to start it, how much it gets, how the prompt looks,
how long access lasts, how to take it back, and how it changed over time.

## What is inside

| Kind | Native apps | Web |
|---|---:|---:|
| Asks you first (`permission`) | 66 | 55 |
| You pick what to share (`picker`) | 6 | 7 |
| Works without asking (`capability`) | 151 | 107 |
| Does something on your device (`action`) | 7 | 37 |
| Gets silently (`signal`) | 72 | 153 |
| Used to track you (`tracking`) | 45 | 98 |
| Blocked for apps (`not-exposed`) | 14 | 26 |

24 groups (location, camera and mic, health, identity, tracking, fingerprinting and more) organize them.

## Three ways to use it

- **Docs** at [platformontology.lol](https://platformontology.lol): one page per capability, searchable.
- **Lab** at [platformontology.lol/lab](https://platformontology.lol/lab/): a device simulator. Pick Android, iPhone or Web,
  trigger a capability, accept or deny the system prompt, watch the data arrive, and see what this page learned about you
  silently. On the web, many capabilities run for real in your browser.
- **Data**: plain JSON, no API key.

```js
const o = await fetch('https://platformontology.lol/data/ontology.json').then(r => r.json());
const location = o.capabilities.find(c => c.id === 'mob.location.precise');
console.log(location.limits.headline, location.platforms.ios.prompt_ui);
```

| File | What it holds |
|---|---|
| `/data/ontology.json` | Everything: taxonomy, platform share, all capabilities |
| `/data/index.json` | A light list: id, name, kind, group, headline, status per platform |
| `/data/platform/android.json`, `ios.json`, `web.json` | One platform at a time, flattened |
| `/data/taxonomy.json` | Kinds, groups, lifecycle stages, browsers, status codes |
| `/schema/capability.schema.json` | JSON Schema for one capability file |

## How the data is stored

One JSON file per capability. The folder is the space and group, the file name is the id without its prefix.

```
data/
  taxonomy.json              kinds, groups, lifecycle, platforms, browsers
  platforms-share.json       OS and version share used for reach
  mobile/<group>/<slug>.json one native capability, Android and iPhone in one file
  web/<group>/<slug>.json    one web capability, all 7 browsers in one file
schema/capability.schema.json
scripts/build-data.mjs       validates and compiles dist/ bundles
```

Shared facts (name, plain meaning, limits, data fields, history, risks) live once at the top of the file. Anything that
differs by operating system sits under `platforms.android`, `platforms.ios` or `platforms.web`, so a concept is never
copied across platforms and a change for one OS touches one block. Read more in [docs/data-model.md](docs/data-model.md)
and [docs/storage.md](docs/storage.md).

## Repository layout

| Path | What |
|---|---|
| `data/` | The ontology (CC BY 4.0) |
| `schema/` | JSON Schema |
| `scripts/` | Data build and checks |
| `apps/docs/` | Docs site (Fumadocs, Next.js static export) |
| `apps/lab/` | Device simulator (Vite, React) |
| `apps/wiki/` | Single page reader wiki |
| `brand/` | Logo, mark, favicon, social image |
| `docs/` | Repository docs |

## Build locally

```bash
node scripts/build-data.mjs            # dist/ bundles, prints warnings
STRICT=1 node scripts/build-data.mjs   # fails on any problem
cd apps/docs && npm ci && npm run build
cd apps/lab && npm ci && npm run build
```

The site is served by GitHub Pages from the `gh-pages` branch. `bash scripts/publish-pages.sh` builds everything and
pushes it there. `.github/workflows/pages.yml` does the same automatically when Actions is available.

## Contributing

Fixes and new capabilities are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Code: [MIT](LICENSE). Data in `data/` and `schema/`: [CC BY 4.0](LICENSE-DATA). Please credit "Platform.Ontology".
