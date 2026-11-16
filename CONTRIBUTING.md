# Contributing to Platform.Ontology

Thanks for helping. Most contributions are a small edit to one JSON file.

## Fix or improve a capability
1. Find the file: `data/<mobile|web>/<group>/<slug>.json`. The docs page for each capability has an "Edit this data on GitHub" link.
2. Edit it. Keep shared facts at the top level and anything that differs by OS inside `platforms.android`, `platforms.ios` or `platforms.web`.
3. Run `STRICT=1 node scripts/build-data.mjs`. It checks ids, groups, kinds, links between capabilities and writing rules.
4. Open a pull request with a source link (official platform docs, MDN, browser compat data, a store policy page).

## Add a capability
Copy a similar file in the same group, give it a new id (`mob.<area>.<name>` or `web.<area>.<name>`), and fill in what you know.
`limits` (headline, user_action, can, cannot, reach) is the most important part for readers.

## Writing rules
- Plain language a non engineer understands. Say what the app can do and its limits, not API jargon.
- Headlines start with "Can" or "Can't" and avoid words like read, write, query, expose and API.
- No em dashes or en dashes anywhere. Write ranges as "7 to 15".
- Name platforms "Android", "iPhone" and browsers by name.

## Code
`apps/docs` (Fumadocs) and `apps/lab` (Vite and React) each build with `npm ci && npm run build`.
