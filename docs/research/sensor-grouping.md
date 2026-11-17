# Grouping sensors into layers: from pixels to pictures

Research for Platform Ontology, 2026-11-16. Draft data: `data/composites/super-sensors.json`
(18 composites) and `data/composites/composite.schema.json`. Checker: `node scripts/check-composites.mjs`.

## The question

The atlas lists 497 web and 361 mobile capabilities, and the console streams readings from 45 scopes.
Each one is a pixel: "the mic level is 52 dB", "the page was hidden 3 times". An agent that wants to
help needs the picture: "this person is in a call", "they are about to leave", "the device is
struggling". This document explains how other fields group raw signals into meaning, then proposes a
layered model for the atlas with 18 worked super-sensors that an agent can query and act on.

## 1. What already exists

| Asset | What it gives us | Gap |
|---|---|---|
| `data/web/**`, `data/mobile/**` | 858 entries with `group`, `subgroup`, `tags`, `grant`, `update`, `related` (`r` requires, `p` pairs with), `scores.fingerprint_bits` | No layer above a single entry. Related edges exist on 401 web entries (664 edges) but are not used for grouping. |
| Console scopes (`apps/console/src/scopes`) | 45 live streams in 9 domains, each with `atlas` ids, numeric metrics, `layer` (1 to 3) and `feeds` | Each scope is still one sensor. Nothing combines scopes. |
| `apps/console/src/core/harness.ts` | `addTap({ record(scope, source, rec) })` sees every reading | The natural hook for a composite engine; unused for that today. |
| In-page MCP server (PR 25) | An agent can run every capability | It runs pixels; it cannot ask "is the person busy?" |
| Lake docs | Monitoring synthesis `doc:ba92eeba58785448`, census `doc:bdf1ab891c24a866`, manifest research `doc:2e865df25dfd817c` | Describe vendors, not a grouping model. |

Atlas facts that shape the design:

* Grant types: none 337, prompt 64, gesture 28, not exposed 26, picker 17, install 12, settings 6, origin trial 6, enterprise 1. Two thirds of the atlas is silent, so most composites can run with no prompt at all.
* Update field: 145 entries empty, 110 static. Static entries are priors, not streams.
* 23 duplicate name groups (fullscreen, battery, compute pressure x3, wake lock, storage access x3, user agent, webgl, webgpu and others). These must collapse before anything is summed.
* 235 entries carry fingerprint bits, 691.2 bits in total, far more than the roughly 33 bits that single out one person, because the bits are correlated.
* 193 group and subgroup pairs, 19 groups, 9 console domains: a hierarchy already exists.

## 2. How knowledge graphs and graph RAG group things

### Extraction and typed schemas

A knowledge graph stores entities (nodes) and typed relations (edges). Text pipelines use an LLM to
extract them; the atlas skips that step because it is already structured. An ontology fixes the types.
The closest standard is W3C SOSA/SSN: a `Sensor` makes an `Observation` of an `ObservableProperty`
(now `Property`) of a `FeatureOfInterest`, using a `Procedure` (an algorithm), producing a `Result`.
That maps cleanly: an atlas entry is a Sensor, a console reading is an Observation, the person or
device is the FeatureOfInterest, and a composite's logic is a Procedure whose Result is a new
observation one layer up.

### Microsoft GraphRAG: communities and summaries

GraphRAG (Edge et al. 2024) builds the graph, then runs hierarchical Leiden community detection,
which nests clusters of densely connected nodes (Leiden fixes Louvain's badly connected communities).
An LLM writes a report for each community bottom up: leaf communities first, higher levels from their
children's reports. Questions then take two routes:

* Global search maps the question over every community report at a chosen level, collects partial
  answers, and reduces them. Good for "what can this page tell about the room I am in?"
* Local search starts at entities matched in the question and pulls their neighborhood: descriptions,
  relations, source text and the community report. Good for "what feeds the in-call signal?"

### LightRAG: two levels of keywords

LightRAG (Guo et al. 2024) indexes the graph with dual-level keys. Low-level keywords name concrete
entities ("microphone", "visibilitychange"); high-level keywords name themes ("attention", "presence").
A question is split into both and each retrieves a different slice. For us: low-level keys hit atlas
entries, high-level keys hit composites and communities.

### HippoRAG: Personalized PageRank

HippoRAG (Gutiérrez et al., NeurIPS 2024) keeps a schemaless graph plus synonym edges from an
embedding model, seeds Personalized PageRank at the concepts in the question, and reads off the most
reached nodes. It does multi-hop retrieval in one step, 10 to 30 times cheaper and 6 to 13 times
faster than iterative retrieval (IRCoT). For us: seed PPR at `web.camera.microphone` and it walks to
`ctx.in-call`, `intent.ready-for-voice` and `ctx.surroundings` without hand-written joins.

### Graphiti (Zep): time on every edge

Graphiti stores bi-temporal edges: `created_at` and `expired_at` are when the system learned or
retired a fact; `valid_at` and `invalid_at` are when it was true in the world. A contradiction closes
the old edge with `invalid_at` instead of deleting it. Contexts are exactly this: "in call from 10:02
to 10:31" is an interval, and a later correction must not erase the history.

### Grouping mechanisms, compared

| Mechanism | How it groups | Use in the atlas |
|---|---|---|
| Hierarchy (taxonomy) | Fixed parent and child | subgroup (193) to group (19) to domain (9) |
| Community detection (Leiden) | Dense subgraphs over edges | Over related edges, scope feeds and tag overlap; yields "presence", "network health" and similar clusters |
| Embedding clustering (node2vec, text embeddings) | Nearby vectors | Finds near duplicates and analogues across web and mobile |
| Motifs (Milo et al. 2002) | Recurring small subgraph shapes | "prompt gated sensor plus silent proxy for the same thing" recurs (camera and enumerate devices, geolocation and timezone) |
| Density clustering (DBSCAN) | Points close in space or time | Geolocation fixes into places |
| Time window roll-ups | Bucket readings by window | 1 s to 1 min to 10 min to 1 h, as monitoring products do |
| Rules and sequences (CEP) | Pattern over ordered events | Intents such as "about to leave" |

## 3. How monitoring products turn raw input into scores

Accessed 2026-11-16. Where a vendor does not publish the formula, the table says so.

| Product | Metric | Published logic |
|---|---|---|
| Hubstaff | Activity % | A second is active if any key or mouse input happens in it. Activity = active seconds / 600 per 10 minute slot. |
| ActivTrak | Productivity, focus | Apps and sites labelled productive, unproductive or undefined. Passive after an idle threshold (0 to 30 min, configurable). Focus = single task time without multitasking; focus efficiency = focused time / total time. Burnout uses utilization, efficiency and focus, thresholds not published. |
| RescueTime | Productivity Pulse | Pulse = (vd×0 + d×1 + n×2 + p×3 + vp×4) / (total×4) × 100, uncategorized counted as neutral (from search summary; help page returned 404). |
| Microsoft Viva Insights | Focus and collaboration | Uninterrupted hours: blocks of 1 h or more with no meetings, email, chat or calls. Legacy focus: blocks of 2 h or more without meetings. Collaboration hours with overlaps removed. After hours measured against Outlook working hours (default 8:00 to 17:00). Multitasking: 2 or more emails sent per meeting hour. |
| Teramind | Activity, risk | Activity % per 5 min is the max of keys, clicks or mouse, with about 60 keys or 30 clicks a minute as 100%. Idle default 10 min. Rules carry a risk level by frequency, threshold and severity; adaptive baselines such as 20% above the department. The risk score formula is not published. |
| Insightful | Utilization | Productive time / tracked time × 100. Burnout formula not published. |
| Time Doctor, DeskTime | Productivity | Productive time / total time. |

The pattern across all of them: (1) a per second activity bit, (2) a label per app or site, (3)
window roll-ups, (4) ratios over a denominator the customer chooses, (5) a threshold or baseline. None
fuses more than two modalities, and none explains a score with its evidence. That is the opening for
the atlas: the console sees camera, mic, motion, network and device state that these tools never touch.

### Adjacent fields

* **Sensor fusion.** The Kalman filter (Welch and Bishop, UNC TR 95-041) predicts a state and corrects
  it with each noisy reading. Dempster-Shafer combines belief from sources that may conflict,
  renormalizing by 1 − K where K is the conflicting mass. Log odds (naive Bayes) addition is the
  simple case when sources are roughly independent.
* **Complex event processing.** Apache Flink CEP expresses sequences: `next()` is strict contiguity,
  `followedBy()` allows events in between, and `within()` bounds the whole pattern in time.
* **Context-aware computing.** Dey (2001) defines context as any information that characterizes the
  situation of an entity relevant to the interaction. The layered model below is that definition made
  concrete.
* **Human activity recognition.** UCI HAR samples a phone at 50 Hz in 2.56 s windows with 50% overlap
  and computes 561 features to classify walking, sitting and so on. `ctx.motion-mode` borrows the
  window recipe.
* **Observability.** OpenTelemetry semantic conventions name attributes (`user_agent.*`, `browser.*`,
  `session.*`). Google SRE multiwindow burn rate alerts fire only when a long and a short window agree
  (1 h with 5 min at 14.4×, 6 h with 30 min at 6×, 3 d with 6 h at 1×). `ctx.link-degraded` copies the
  two window rule to avoid flapping.

## 4. The layered model

```
L4 Action      do something: hold notifications, save draft, offer voice     (suggest | auto | ask)
                 ^
L3 Intent      a sequence of contexts in time: about to leave, ready for voice
                 ^
L2 Context     a named state with confidence: in call, away, focused, strained
                 ^
L1 Feature     a windowed number from one modality: speech_ratio_30s, kpm_60s
                 ^
L0 Signal      one atlas entry's reading from one console scope
```

* **L0 Signal.** A console `Rec` as the harness records it. Nothing is computed.
* **L1 Feature.** A number over a sliding window from one modality, for example share of 100 ms
  frames with speech in the last 30 s. Windows roll up 1 s to 1 min to 10 min (the Hubstaff slot) to
  1 h, kept in ring buffers in memory.
* **L2 Context.** A named state with a confidence, an `enter` and lower `exit` threshold
  (hysteresis) and a `min_dwell` so it does not flicker. Each input has a role: `required`,
  `evidence` (adds log odds), `veto` (forces off), `prior` (static, shifts thresholds) or
  `blind_spot` (the page cannot see it; another surface can).
* **L3 Intent.** A pattern over contexts and events in time, written CEP style:
  `A followedBy B within 5 s`.
* **L4 Action.** A console action, atlas action id or MCP tool, with a mode: `suggest` shows it,
  `auto` does it, `ask` needs a yes.

### Confidence

`p = sigmoid(bias + Σ weight × present)` over the evidence that is available. A missing input adds
nothing, it does not count against the state. Each composite also reports
`coverage = available weight / total weight`, so an agent can tell "not in a call (90% coverage)"
from "not in a call (we can only hear the mic)". Alternatives for the same thing (OS activity label or
accelerometer) combine by noisy-OR. Dempster-Shafer is the fallback when sources contradict.

## 5. Grouping rules

| Rule | What it does |
|---|---|
| R1 Alias collapse | Merge the 23 duplicate name groups (and near duplicates such as `web.notify.screen-wake-lock` and `web.display.wake-lock`) into one canonical node before any sum or vote. |
| R2 Modality map | Tag each input with one of 12 modalities (audio, video, motion, position, input, attention, environment, device, network, identity, content, schedule). A composite takes at most one feature per modality per piece of evidence, so the same fact is not counted twice. |
| R3 Rate class | Static entries become priors. Event entries feed counts. Continuous entries get windows. |
| R4 Gate tier | Silent inputs (grant none) form the base tier; prompt and gesture inputs add confidence when already granted. A composite must give a usable answer from the silent tier alone or say why not. Not exposed entries become `blind_spot` inputs tagged with the surface that can see them (extension, mobile). |
| R5 Communities | Run Leiden over related edges, scope `feeds` and tag Jaccard; write a GraphRAG style report per community. The existing subgroup to group to domain tree is the fallback hierarchy. |
| R6 Fingerprint roll-up | Sum fingerprint bits over distinct inputs after R1, discount for correlation (0.6), cap at 33 bits. |
| R7 Sensitivity | A composite's sensitivity is the max of its inputs, plus one when it infers a state about a person (in call, fatigue, place). |
| R8 Surface roll-up | Each composite states how much of it works on a page, an extension and a mobile app (full, partial, none). |

## 6. Graph schema

Nodes: `Capability` (atlas entry), `Scope` (console stream), `Feature` (L1), `Context` (L2),
`Intent` (L3), `Action` (L4), `Group`, `Community`, `Gate`, `Surface`, `Analogue` (a vendor metric).

| Edge | From to | Meaning |
|---|---|---|
| `emits` | Scope to Feature | The stream produces this windowed number |
| `derives_from` | Context or Intent to Feature, Capability or Context | Input, with role, weight and modality on the edge |
| `vetoes` | Capability or Context to Context | Forces the state off |
| `gated_by` | Capability to Gate | Needs this permission |
| `alias_of` | Capability to Capability | R1 duplicate |
| `precedes` | Context to Context inside an Intent | Sequence step |
| `triggers` | Context or Intent to Action | With mode |
| `member_of` | Capability to Group or Community | R5 |
| `blind_to` | Context to Surface | Needs another surface |
| `analogous_to` | Context to Analogue | Comparable vendor metric |
| `requires`, `pairs_with` | Capability to Capability | Existing `related` `r` and `p` |

Every Context instance carries `valid_from` and `valid_to` (Graphiti style) when stored.

## 7. Eighteen super-sensors

Full definitions with inputs, features, weights, windows and thresholds are in
`data/composites/super-sensors.json`. All refs pass `scripts/check-composites.mjs`.

| Id | Plain meaning | Key inputs | Logic | Action |
|---|---|---|---|---|
| `ctx.in-call` | Talking with others right now | mic speech ratio, camera faces, speech turns, own tab title; mobile calendar and phone state; blind to other tabs | log odds, enter 0.75, exit 0.4, 60 s dwell | Hold notifications |
| `ctx.away` | Nobody at the device | idle detection, no keys or pointer for 120 s, hidden, camera faces 0; vetoed by in call | log odds | Pause streams, release wake lock |
| `ctx.focused` | Steady work without switching | visible run 25 min or more, under 2 switches in 10 min, active share 50%; OS focus mode | rule | Defer suggestions |
| `ctx.context-switching` | Leaving and returning in bursts | 6 or more switches in 5 min, median burst under 45 s | rule | Keep a resume summary |
| `ctx.fatigue-risk` | Slowing compared with own baseline | keystroke flight and dwell z scores, backspace ratio, pointer speed, local hour | log odds, per session baseline | Suggest a break |
| `ctx.automation-suspected` | Machine made input | webdriver, untrusted events, synthetic patterns, flat mouse paths; Web Bot Auth signature switches to declared agent | log odds | Offer WebMCP tools |
| `ctx.motion-mode` | Still, walking or riding | accelerometer 2.56 s windows, geolocation speed, handovers; OS activity labels win | rule with majority vote | Prefer voice when walking |
| `ctx.surroundings` | Light and noise | ambient light or camera brightness, mic noise floor, color scheme | buckets | Switch theme, captions |
| `ctx.device-strain` | Battery, heat, jank | battery under 20%, compute pressure, long animation frames, INP | log odds | Lower sample rates |
| `ctx.link-degraded` | Network worsening | rtt and downlink trend, fetch errors; offline vetoes | two window burn rule | Queue writes |
| `ctx.multi-screen-workspace` | More than one display, or presenting | screen count, live display capture, fullscreen | rule | Hide private panels while presenting |
| `ctx.content-leaving` | Bulk copying out | select then copy then hide, 3 times in 5 min (lengths only, never text) | sequence | Offer export |
| `ctx.recognisable-device` | How unique this browser looks | canvas, fonts, timezone, client hints, voices; GPC as prior | capped bit sum | Explain the top bits |
| `ctx.place-type` | Home, work or elsewhere | geolocation DBSCAN clusters, hour, wifi or cellular | cluster, needs opt in history | Ask before changing profile |
| `ctx.calm-ui-preferred` | Wants less motion or more contrast | reduced motion, contrast, forced colors, reduced transparency and data | rule | Stop animations |
| `intent.about-to-leave` | Likely to close the page | pointer exits top, blur, pagehide, beforeunload | sequence within 5 s | Save the draft |
| `intent.ready-for-voice` | Good moment to offer voice | a mic exists, quiet, not in call, visible, recent activation | rule | Show the talk button |
| `intent.needs-help` | Stuck on something | rage clicks, backspace bursts, long hover; slow page vetoes | log odds | Offer the agent with context |

Composites stack: `ctx.away` vetoes `ctx.focused`, `ctx.in-call` vetoes `intent.ready-for-voice`,
`ctx.motion-mode` is a prior for `ctx.link-degraded`. The checker rejects unknown refs and self
references; the current graph has no cycles.

## 8. How an agent uses it

Retrieval follows the graph RAG patterns above, over data the site already ships (no new graph store):

1. **Global questions** ("what can this page tell about me?") use community and domain reports,
   map then reduce (GraphRAG global search).
2. **Local questions** ("why do you think I am in a call?") match a Context with low and high level
   keywords (LightRAG), then walk `derives_from` to the live inputs and their current values.
3. **Multi-hop questions** ("what would granting the camera unlock?") seed Personalized PageRank at
   the capability and rank reachable contexts and actions (HippoRAG).
4. **Time questions** ("how long was I focused today?") read context intervals with `valid_from`
   and `valid_to` (Graphiti). In the page these live in memory; across visits they would go to the
   lake only with opt in.

Proposed MCP tools for the in-page server, generated from `super-sensors.json`:

| Tool | Returns |
|---|---|
| `list_contexts` | Every composite with layer, plain meaning, surfaces and what is currently available |
| `describe_context(id)` | Inputs, roles, logic and analogues |
| `evaluate_context(id)` | `{ state, confidence, coverage, evidence[], missing[], since }` |
| `subscribe_context(id)` | A stream of state changes with evidence |

Engine sketch inside the console: `harness.addTap` feeds per scope feature extractors (ring buffers),
which feed context evaluators (log odds with hysteresis), which feed an intent matcher (small CEP),
which proposes actions through the existing action registry. The composites file compiles into
`console.json` next to the atlas so the engine and the MCP tools read the same definitions.

## 9. Privacy guardrails

* Content features use lengths and counts only (copy, paste, selection); never the text.
* Baselines are per session and per person; never compared across people.
* Inferences about a person (sensitivity 4 or 5) default to `suggest` or `ask`, never silent `auto`
  side effects beyond the page itself.
* `ctx.place-type` needs history across visits and therefore an explicit opt in.
* Every evaluation returns its evidence, so the person can see why.

## 10. Lake mapping and gaps

Stored in `cd-lake-prod` under dataset `dataset:po-sensor-grouping-2026-11`:

* One `product_feature:po-composite-<slug>` entity per composite, summary holding the logic.
* One `product_feature:po-atlas-<atlas id>` entity per referenced atlas entry, aliased with scheme `atlas_id`.
* Relations: atlas input `enables` composite (role, feature, weight, modality in detail), composite
  `derived_from` composite for stacking, composites `part_of` the dataset.
* Notes: method (layers and rules), caveat (unverified vendor formulas), known gap (predicates),
  decision (no new graph store).
* This document via `api.add_document` at `research/sensor-grouping-2026-11/sensor-grouping.md`.

Known gaps:

* The lake has no `feeds`, `vetoes` or `contradicts` predicate, so veto and blind spot roles live in
  relation detail. Adding them is a migration PR in `CUSTOM-DOMAIN-APP/customdomain-internal-workspace`.
* Weights and thresholds are design estimates, not fitted. They need labelled sessions to tune.
* Several vendor formulas come from search summaries because the help pages returned 403 or 404.
* Leiden communities (R5) are described, not yet computed.

## Sources (accessed 2026-11-16)

* Edge et al., From Local to Global: A Graph RAG Approach, arXiv 2404.16130; microsoft.github.io/graphrag
* Guo et al., LightRAG, arXiv 2410.05779
* Gutiérrez et al., HippoRAG, arXiv 2405.14831 (NeurIPS 2024)
* Rasmussen et al., Zep: A Temporal Knowledge Graph Architecture for Agent Memory, arXiv 2501.13956; github.com/getzep/graphiti
* W3C SOSA/SSN ontology, w3.org/TR/vocab-ssn and w3.org/ns/sosa
* Traag, Waltman, van Eck, From Louvain to Leiden, Scientific Reports 2019
* Grover and Leskovec, node2vec, KDD 2016; Milo et al., Network Motifs, Science 2002
* Hubstaff: support.hubstaff.com/how-is-time-tracked-and-calculated-in-hubstaff
* ActivTrak: activtrak.com/solutions/burnout/assessment-and-scoring (support articles returned 403)
* RescueTime: blog.rescuetime.com/breaking-down-the-rescuetime-productivity-score
* Microsoft Viva Insights metrics: learn.microsoft.com/en-us/viva/insights/advanced/reference/metrics
* Teramind: kb.teramind.co/en/articles/8790922; knowledge.teramind.co/en/articles/11903996
* Insightful: help.insightful.io/en/articles/4211156
* Apache Flink CEP: nightlies.apache.org/flink/flink-docs-stable/docs/libs/cep
* Welch and Bishop, An Introduction to the Kalman Filter, UNC TR 95-041
* Dempster-Shafer combination survey, arxiv.org/pdf/1906.09769
* Dey, Understanding and Using Context, Personal and Ubiquitous Computing 2001, DOI 10.1007/s007790170019
* UCI HAR dataset, archive.ics.uci.edu/dataset/240
* OpenTelemetry semantic conventions, opentelemetry.io/docs/specs/semconv
* Google SRE Workbook, Alerting on SLOs, sre.google/workbook/alerting-on-slos
