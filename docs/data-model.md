# Data model

Every capability is one JSON object validated by `schema/capability.schema.json`.

| Field | Meaning |
|---|---|
| `id` | Stable id. `mob.*` for native apps (Android and iPhone), `web.*` for websites |
| `name`, `plain`, `meaning` | Name, one plain sentence, and why it matters |
| `kind` | One of 7 kinds: permission, picker, capability, action, signal, tracking, not-exposed |
| `group`, `subgroup` | One of 24 groups in `data/taxonomy.json`, plus a finer subgroup |
| `lifecycle` | When it happens: before install, on launch, while you use it, in the background, after uninstall and so on |
| `platforms` | Per OS facts. Native: status `s`, first version `v`, Android `api` level, permission or Info.plist key, protection, grant path, prompt UI, persistence, revocation, store policy, API surface, note. Web: api, permission name, permissions policy, access (grant, prompt, persistence, revocation, secure context, user gesture, steps) and support for 7 browsers |
| `data` | What comes back: type, metric, update rate, fields with unit, range and precision |
| `limits` | Plain bounds: headline, user action that starts it, can (2 to 5), cannot (2 to 5), reach 1 to 4, reach label, how platforms differ |
| `story` | Reader story: what it is, Lucide icon, for you, for makers, use cases, risks, vendor marketing links |
| `scores` | Sensitivity, utility, friction (1 to 5), fingerprint bits |
| `value` | Legitimate uses and known abuse |
| `history` | Dated platform changes |
| `related`, `web_equivalents` | Links to other ids |
| `refs`, `confidence` | Sources and how well the facts were checked |

## Status codes
`y` supported, `p` partial, `f` behind a flag, `n` not supported, `r` removed.

## Reach
1 one thing, one moment. 2 while you use it, or only what you choose. 3 ongoing or in the background, one kind of data.
4 broad: everything of that type, anytime, or a stable id that follows you.
