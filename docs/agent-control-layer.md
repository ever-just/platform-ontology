# Agent control layer

The console's capabilities are exposed to an AI agent as a Model Context Protocol (MCP) server that
runs inside the page. Code lives in `apps/console/src/agent/`.

## Tools

Nine tools cover every capability. None are written per capability; ids, descriptions, related
entries and actions come from the atlas (`data/web`, compiled to `console.json`) and the registered
scopes, so a new atlas entry or demo is reachable with no new tool.

| Tool | What it does |
| --- | --- |
| `list_capabilities` | Search by words, group or running state. Returns ids and how each one starts (silent, ask, tap, pick). |
| `describe_capability` | What it reveals, its settings, its actions, atlas entries and related capabilities from the atlas edges. |
| `start_capability` | Turn it on, live or simulated, with optional settings. Waits up to 2.5 s for the first reading. |
| `stop_capability`, `stop_all` | Turn off and put back anything changed. |
| `get_status` | Everything running, with each latest reading. |
| `read_stream` | Recent records from one stream, with `since` for only new ones. |
| `run_action` | Run an action on a page control, using the same patch its buttons send (`agent/actions.ts`). |
| `set_param` | Change a setting, clamped to its range; a running capability restarts. |

Running streams are also MCP resources at `stream://<id>`.

`createMcpServer(tools).handle(message)` is plain JSON-RPC 2.0 (protocol `2025-06-18`) with no
transport. The in-page voice agent calls it directly. Remote MCP clients reach the same handler
through the api relay added in a later phase.

## Scope of control

The server runs in the visitor's own tab against that tab's harness. It can only see and control
the capabilities of that one browser session. Browser prompts and choosers still appear to the
person, and gesture-only calls (fullscreen, audio) still need a recent click.

## Do we need a knowledge graph or ontology?

No new one. The atlas already is the ontology: typed nodes (capability, group, API, permission,
support), domains, and edges for "requires" and "pairs with", plus each scope's `feeds` list. The
tools read it directly, so `describe_capability` returns related capabilities and the agent can
walk from one capability to its neighbours. A separate graph store would duplicate this data and
drift from it. If the agent later needs reasoning across visits or users, the place to add it is
the lake, keyed by the same atlas ids.

## Use it

```ts
import { startAgent } from "./agent";
const atlas = await fetch("/console/data/console.json").then((r) => r.json());
const { tools, mcp } = startAgent(atlas);
await mcp.handle({ jsonrpc: "2.0", id: 1, method: "tools/list" });
await tools.call("start_capability", { id: "device.battery", source: "sim" });
```
