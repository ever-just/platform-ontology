# What workplace monitoring products collect, and what a web page can do about it

Date: 2026-11-16. Scope: the web (browser APIs and extension APIs), with desktop and OS agents noted briefly.
Builds on the census write-up `research/workplace-monitoring-2026-11/write-up.md` (D15 49 monitoring products, D16 138 time tracking products). This note does not repeat the census. It looks inside 19 products (most of them from those censuses) and maps every signal they collect to Platform Ontology web capability ids (`web.<group>.<name>`).

## Method

- 19 vendors, extension and web-agent vendors first. Sources are vendor help pages and product pages fetched on 2026-11-16, plus search results where a vendor page could not be fetched.
- Confidence per fact: **high** means the vendor page was fetched and says it. **medium** means a vendor statement seen only in search result text, or a consistent third party review. **low** means one review or a gap in the evidence.
- Atlas ids come from the capability files of the atlas. Extension permission facts come from `research/device-permissions-atlas-2026-11-15/browser-extensions.json`.
- Mechanism names: **ext** browser extension, **agent** desktop agent, **proxy** custom root certificate for HTTPS inspection, **managed** enterprise policy (force install, MDM).

## Vendors (19)

| Vendor | Collects | Mechanism | Disclosure | Confidence |
|---|---|---|---|---|
| Time Doctor | Keystroke and mouse counts (not which keys), URLs, app names, screenshots every 3 min by default; only while the timer runs | agent, Chrome extension exists | Visible timer; stealth not stated | high |
| Hubstaff | Screenshots, apps and URLs with time, activity percent per 10 min from keyboard and mouse input | agent plus Chrome extension and Chrome app (activity only, no keyboard and mouse split); mobile and web timer have no screenshots | Silent app deployable by an admin on company devices | high |
| ActivTrak | Apps, sites, screenshots (off by default); states that keystroke logging and camera are not collected | agent; ChromeOS agent works in the browser; ActivTrak Assist extension adds URL capture on Windows and Mac | Not stated | medium |
| Teramind | Optional keystroke logging, screen video, OCR of screens, clipboard, file transfers (USB, cloud, email attachment, web upload), sites, apps, idle | agent plus proxy (a custom certificate "Quick Web Proxy" for HTTPS in Chrome, Edge, Firefox) | Agent types Revealed, Standard, Stealth in vendor docs (not re-verified) | high for features, medium for stealth |
| Insightful | Apps and sites, screenshots including on demand, screen video, idle, keyword alerts, Shadow AI detection | Not stated | Not stated | high |
| CurrentWare BrowseReporter | URLs, active time per site, active and idle time from keyboard and mouse activity, optional screenshots with OCR; no typed content | agent, no extension | Silent mode not stated | high |
| DeskTime | App titles, site URLs and titles, power state, idle, IP based location, optional screenshots | agent plus extension | Private Time mode for the worker | medium |
| Toggl Track | Time entries; extension asks for tabs access as an optional permission | ext, desktop app | Self reported by the worker | medium |
| Clockify | Time entries; automatic site logging not confirmed in this run | ext, desktop app | Self reported by the worker | low |
| RescueTime | Active app and site titles with idle detection (from product knowledge, not re-fetched) | agent plus extension | Worker installs it | low |
| Veriato Cerebral | Keystrokes, screenshots, email, chat, web activity, risk scoring | agent | Recorder runs in stealth by default (TechRadar, via search) | medium |
| Kickidler | Keylogger across all programs, screen video, apps | agent | Described as invisible to the employee | medium |
| Workstatus | Screenshots (1 to 3 per 10 min), keyboard and mouse on or off signals, apps and URLs; docs say no key logging | agent | Stealth mode without pop ups | medium |
| Monitask | Time, screenshots (0 to 30 per hour), keyboard and mouse counts, apps and URLs | agent; stealth is a separate installer | Default visible, stealth optional | medium |
| SentryPC | Browsing history, keystrokes, chat, screenshots, location with geofencing, webcam (some reviews) | agent | Hidden by default (reviews agree) | low to medium |
| StaffCop Enterprise | Keystrokes, screen recording, app use, file transfers, browsing history | agent | Stealth by name not confirmed | low to medium |
| Spyrix Employee Monitoring | Keylogger, screenshots, webcam, clipboard, social network chat (Windows) | agent | Stealth described in listings | low to medium |
| Cyberhaven | Data lineage: copy, paste and upload of data across SaaS and web | ext plus agent | Enterprise deployed | medium |
| Microsoft Purview extension for Chrome | Attempts to access or upload a sensitive item to a cloud service in Chrome, with DLP enforcement; Windows 10 and 11 devices onboarded to endpoint DLP | ext plus Windows endpoint | Managed by the organization | high |

Platform fact that matters for all of them: a force installed Chrome extension cannot be removed by the user, is visible to the user on managed Chrome, and bypasses block lists (Google Chrome Enterprise help, fetched 2026-11-16). Extensions are therefore non removable but not hidden. Hidden operation is a desktop agent feature.

## Signal to capability matrix

Columns: can a normal web page do it with no extension (**page**), with an extension (**ext**), or only with a desktop agent (**agent**).

| Signal | Who collects it | Atlas capability ids | Page | Ext | Agent |
|---|---|---|---|---|---|
| URL and title of the active tab | Nearly all | `web.notexposed.other-tabs`, `web.notexposed.browsing-history`, `web.actions.tab-title-favicon` | Own page only | Yes (`tabs` permission gives URL and title of every tab) | Yes (window title, UI automation, proxy) |
| Time per site | Hubstaff, BrowseReporter, DeskTime, Time Doctor | `web.perf.page-visibility-focus`, `web.xsite.page-lifecycle-events`, `web.timing.page-lifecycle-bfcache` | Own site only | Yes (tab focus events plus `idle`) | Yes |
| Idle and active state | Nearly all | `web.notify.idle-detection`, `web.perf.idle-detection-user-activation` | Own page via input events; Idle Detection API needs a prompt | Yes (`idle` permission: active, idle, locked) | Yes (OS input timers) |
| Keystroke counts and activity level | Hubstaff, Time Doctor, Workstatus, Monitask | `web.input.keyboard-events`, `web.perf.keystroke-dynamics` | Own page only | In pages where a content script runs | Yes, system wide |
| Keystroke content (keylogging) | Teramind, Kickidler, Veriato, SentryPC, StaffCop, Spyrix | `web.input.keyboard-events`, `web.xsite.form-field-capture`, `web.input.paste-event` | Own page fields only | Yes on sites it has host access to | Yes, system wide, including passwords and chat |
| Mouse activity | Hubstaff, Time Doctor, BrowseReporter | `web.input.pointer-events`, `web.perf.mouse-dynamics` | Own page only | In pages where a content script runs | Yes, system wide |
| Screenshots | Hubstaff, Time Doctor, Insightful, Workstatus, Monitask, DeskTime | `web.camera.display-capture`, `web.camera.region-element-capture`, `web.camera.captured-surface-control` | Only with a user prompt each time | Visible tab capture with host or activeTab access; whole screen needs a chooser (`desktopCapture` is user gesture required) | Yes, silent, scheduled |
| Screen video | Teramind, Insightful, Kickidler | `web.camera.display-capture`, `web.camera.media-recorder` | Only with a user prompt | Chooser based, needs a user gesture | Yes, continuous |
| Apps and active window | Hubstaff, Time Doctor, Teramind, ActivTrak | `web.notexposed.other-tabs` (a page cannot see other windows) | No | No | Yes, only an agent can |
| Clipboard | Teramind, Spyrix, Cyberhaven | `web.input.clipboard-read`, `web.input.copy-event`, `web.input.paste-event` | Own page events; read needs a prompt and focus | Yes (`clipboardRead` is install time) | Yes, system wide |
| File uploads, downloads, transfers | Teramind, Purview, Cyberhaven, StaffCop | `web.files.file-input`, `web.files.drop-files`, `web.actions.downloads` | Own page only | Yes (downloads and upload events on sites it can reach) | Yes (USB, cloud sync folders, email attachments) |
| Location | DeskTime, SentryPC | `web.location.geolocation`, `web.net.ip-geolocation` | Geolocation with a prompt; IP location with none, server side | Same prompt | Yes (Wi-Fi, IP) |
| Webcam and microphone | SentryPC, Spyrix | `web.camera.camera`, `web.camera.microphone` | Prompt each use | Same prompt | Yes, silent |
| Email and chat content | Veriato, Teramind, Spyrix | `web.xsite.form-field-capture`, `web.notexposed.other-tabs` | No | Reads webmail and web chat pages it has host access to | Yes (screen OCR, hooks, HTTPS proxy) |
| HTTPS traffic inspection | Teramind (Quick Web Proxy) | `web.net.ja3-tls-fingerprint` (the closest fingerprint signal) | No | Request metadata only | Yes, with a custom root certificate |
| Productivity score, site category | Nearly all | none (server side derived from URL and app) | n/a | n/a | n/a |
| Presence of the monitor itself | none collect this | `web.device.extension-probing` | A page can sometimes detect extensions | n/a | No |

## Findings

1. **Two classes of product.** Activity counting (Time Doctor, Hubstaff, ActivTrak, Workstatus, Monitask) counts input and never stores keys. Content capture (Teramind, Kickidler, Veriato, SentryPC, StaffCop, Spyrix) records typing, screens, clipboard and chat.
2. **Content capture lives in desktop agents.** Keystrokes outside a page, apps, silent screenshots, webcam and clipboard across apps are not reachable from a browser page or extension. A web page cannot do any of them without a user prompt, and several not at all.
3. **Extensions are the URL attribution layer.** Hubstaff, ActivTrak (Assist), DeskTime and Purview use an extension for what the browser alone knows: tab URL and title (`tabs` gives both for every tab), site time, uploads and downloads. ChromeOS has no desktop agent, so the extension carries everything.
4. **Stealth is a desktop feature.** Hidden modes are named for agents (Veriato, SentryPC, Workstatus, Monitask, Kickidler, Teramind Stealth). Force installed extensions are not removable but are visible on managed Chrome.
5. **A plain page sees only itself.** It gets its own URL, focus, input and timing, plus prompted camera, screen, location and clipboard. It cannot see other tabs, apps or history (`web.notexposed.*`), so the Platform Ontology web ids that matter here are the prompted ones and the self-observation ones.

## Known gaps

- Time Doctor, Hubstaff and ActivTrak pages with a full data list could not be fetched (404 or 403). Their rows use the help pages that did load, or search text.
- Clockify, RescueTime, DeskTime, Toggl Track, Kickidler, SentryPC, StaffCop, Spyrix rows rest on search results and reviews, not fetched vendor pages. InterGuard returned nothing usable and is not tabled.
- The Teramind agent type names (Revealed, Standard, Stealth) were not in the fetched article.
- The lake has no attribute for vendor by signal facts. The census migration `20261116030000_workplace_monitoring_attributes.sql` proposed six attributes and is not applied. The vendor rows are therefore stored as 19 context notes on the company and product entities in this run, with only the help page address stored as an observation (`links.docs_url`, 6 rows). A migration is the right fix, via `CUSTOM-DOMAIN-APP/customdomain-internal-workspace`.
- Desktop and OS agents get a one line verdict per signal here, not an OS permission mapping. That belongs in the mobile and desktop atlas.

## Sources (retrieved 2026-11-16)

- https://help.timedoctor.com/what-does-time-doctor-monitor-on-my-computer
- https://support.hubstaff.com/activity-tracking-overview/
- https://www.insightful.io/features
- https://www.teramind.co/solutions/employee-monitoring-software/
- https://intercom.help/teramind-54fbd732679c/en/articles/8791076
- https://www.currentware.com/browsereporter/
- https://support.google.com/chrome/a/answer/6306504
- https://learn.microsoft.com/en-us/purview/dlp-chrome-learn-about
- Search results for the other vendors, see the notes on each company entity in this run.
