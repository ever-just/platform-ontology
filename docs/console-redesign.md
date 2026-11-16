# Console redesign plan

Written 2026-11-15. Replaces the sidebar, force map, flow view and overlay with one calm dashboard.

## What the console is for

The console answers three questions about the browser it runs in:

1. **What is happening now?** Which capabilities are live, how much data they produce, what was just granted or refused.
2. **What happened before?** A timeline and an activity feed of every request, grant, denial and stop in this session.
3. **What could happen?** Every capability this browser supports, grouped the way a person thinks about it, with a button to run it.

It is not a traffic analytics tool. There are no visitors, pages or funnels. The model is a privacy control room: a few headline numbers, one clear chart, a grouped list you can act on, and an inspector for the one thing you picked.

## The data that matters

| Number | Why it matters |
|---|---|
| Readable silently | How many signals any site gets with no prompt at all. This is the headline privacy fact. |
| Live now | Capabilities streaming data right now. |
| Records | Total records produced, and the rate per second. |
| Granted | Capabilities the browser allowed this session. |
| Blocked | Capabilities refused, unsupported or failed. |
| Supported here | Share of the 483 atlas attributes this browser supports. |

Each number is a tab. Clicking it switches the main panel, the same pattern DataFast uses for its metric strip. Time based numbers show a smooth chart over the last 1, 5 or 15 minutes, with markers for grants and denials. Static numbers show a breakdown by group instead of a fake time series.

## Groups

Inspired by the grouping on Progressier's "What Web Can Do Today", adapted to what this platform exposes. Curated capabilities are placed by id; the generated ones are placed by their atlas group.

| Group | Holds |
|---|---|
| Location | Geolocation, time zone, language, locale preferences |
| Motion and sensors | Orientation, accelerometer, compass, ambient light |
| Activity | Pointer, keystroke timing, attention and idle, page and window state |
| Camera and screen | Camera, screen share, media capture |
| Microphone and speech | Microphone, speech to text |
| Nearby devices | Bluetooth, USB, serial, HID, MIDI, NFC, gamepad, media devices |
| Device | Battery, hardware, storage, CPU pressure, screens, system profile |
| Fingerprint | Canvas, GPU, audio, fonts, rendering signals |
| Network and timing | Network quality, load timing, connectivity, performance |
| Identity and payments | Passkeys, contacts, sign in, payments |
| Storage and tracking | Cookies, storage, cross site tracking, files |
| Notifications and install | Notifications, background work, install and OS integration, wake lock, badge |
| Input and clipboard | Clipboard and input APIs |
| Page actions and AI | Share, dialogs, fullscreen, on device AI |

## Layout

* **Top bar:** brand, live indicator, Stop all, Docs.
* **Metric strip:** the six numbers above, each a clickable tab.
* **Main panel:** the chart or breakdown for the chosen number, a time range control, a breakdown list on the right, and a Feed toggle that shows the merged activity log.
* **Capabilities:** a grouped list with filter chips per group, tabs for All, Live, Used and Blocked, search, and an inline Run or Stop button on every row. Each group header can run all of its silent capabilities at once.
* **Inspector:** the picked capability with Live or Simulated source, Run or Stop, and tabs for Data (the custom instrument), Record (raw JSON and metrics), Scope (what it reveals, the permission, support per browser, the code to call it) and Log. With nothing picked it shows what this browser gives away silently.
* **Phone:** everything stacks; the inspector opens as a full screen sheet.

## Look

White surface, Geist for text, Geist Mono for numbers, 13px base, hairline borders, one blue accent, muted status colors (green live, amber waiting, red refused). No rainbow domain colors in the chrome.

## Extensibility

`apps/console/src/ext/registry.ts` holds three registries:

* `defineGroup({ id, label, blurb, order, match })` adds or overrides a group.
* `registerView({ id, label, metric, Panel })` adds a metric tab and its main panel.
* `registerScopes([...])` adds capabilities from a plugin; they flow through the same harness, list and inspector.

Built in groups and views use the same calls, so a plugin is a peer of the core, not a special case.
