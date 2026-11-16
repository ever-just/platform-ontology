# How the data is stored

**One file per capability.** Small files make reviews easy and merge conflicts rare.

**Folders carry meaning.** `data/<space>/<group>/<slug>.json`. The space is `mobile` or `web`, the group is a key from
`taxonomy.json`, and the slug is the id without its `mob.` or `web.` prefix. The build checks that folder, `space` and
`group` agree.

**Shared once, different per OS.** A native capability such as precise location is one concept on Android and iPhone. Its
name, meaning, data fields, limits and history are stored once. Only what differs (permission string, prompt wording,
first version, store policy) sits under `platforms.android` and `platforms.ios`. Web capabilities keep one support record
per browser under `platforms.web.support`. Native and web versions of the same idea link with `web_equivalents`.

**Taxonomy is separate.** Labels, icons and descriptions for kinds, groups, lifecycle stages and browsers live in
`taxonomy.json`, so renaming a label never touches 844 files.

**Bundles are built, not stored.** `scripts/build-data.mjs` validates everything and writes `dist/`:
`ontology.json` (all), `index.json` (light list), `platform/<android|ios|web>.json` (one platform, flattened with the
platform block under `platform`), and `taxonomy.json`. The website serves them under `/data/`.
