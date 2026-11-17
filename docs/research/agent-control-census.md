# Agent control census: AI that sees and acts on screens, and voice that drives actions

Status: research snapshot, 2026-11-17. Owner: platform-ontology. Lake run: see the last section.

Platform Ontology is an atlas of what a page or platform can sense and do. The goal is an AI agent that sees the screen, acts on it, and takes voice commands. This census looks at what already exists so the atlas can serve as the typed sense and action schema for such a loop. Related work: `docs/research/voice-agents-2026-11.md` (voice stack choice) and `docs/agent-control-layer.md` (the in page control layer); this file does not repeat them.

## Headlines

- **63 entries**: 36 screen control (group A), 20 voice (group B), 4 that combine both, 3 benchmarks. 49 open source or with open code, 14 closed.
- **Element ids beat pixels when a structure exists.** The strongest browser agents (Playwright MCP, Stagehand, browser-use, Nanobrowser) hand the model an indexed list of elements from the accessibility tree or DOM. Pixel coordinates are the fallback and the norm only for desktop and for vision models (Anthropic, OpenAI, UI-TARS).
- **Split planning from grounding.** The best open OSWorld results (Agent S) use a planner plus a separate grounding model. That is the same split the atlas offers: the atlas is the grounding layer for pages that publish it.
- **Voice and screen control are still two separate worlds.** Only Gemini Live (screen share plus tools), Self-Operating Computer (voice sets the goal) and the Rabbit LAM (cloud browser) cross both, and none of them is reliable. That gap is the opening.
- **Voice safety hooks exist and are underused**: per tool interruption modes (ElevenLabs), server side per action confirmation labels (Gemini), and takeover modes (OpenAI).
- **Benchmark numbers disagree.** Treat every score as a reported snapshot, see Caveats.

## Ranked synthesis: recurring mechanisms

Ranked by how many entries use it and how useful it is to the atlas.

**1. Perceive as an indexed element list (accessibility tree or DOM).** Used by: browser-use, Playwright MCP, Stagehand, Nanobrowser, OpenHands (BrowserGym bid), Mobilerun, AppAgent, UFO (UIA). Cheapest and most reliable perception. Tokens per step are low and targets are named. The atlas already knows the controls of a page, so it can emit this list without parsing.

**2. Perceive as a screenshot, optionally marked (set of marks).** Used by: Anthropic, OpenAI CUA, Gemini, UI-TARS, Midscene, WebVoyager, Magentic-UI, OmniParser, Self-Operating Computer. Universal fallback; works on canvas, games, remote desktops. Overlaying numeric labels (WebVoyager, OmniParser) turns pixels back into ids.

**3. Ground by element id or ref, not coordinates.** Used by: Playwright MCP, Stagehand, browser-use, Mobilerun, UIA based UFO, UiPath selectors. Survives layout shifts and zoom, and can be checked before acting. Pixel grounding drifts with scaling and DPI.

**4. Ground by pixel coordinates from a vision model.** Used by: Anthropic (pixels), Gemini (normalized 1000 grid), OpenAI CUA, UI-TARS, ShowUI, OpenCUA, CogAgent. Needed when no structure exists. Strong models now exceed the 72% human baseline on OSWorld in vendor reports. Splitting a grounding model from the planner (Agent S) helps.

**5. Act through the automation protocol, not synthetic OS input, when possible.** Used by: CDP or Playwright (most browser agents), ADB (mobile), UIA and COM (UFO). Deterministic, fast and observable. OS level input injection (xdotool, pyautogui) is for full desktops inside a sandbox VM.

**6. Confirm sensitive actions, with a server or policy deciding what is sensitive.** Used by: Gemini safety_decision, OpenAI CUA (logins and payments), Magentic-UI action guards, Claude in Chrome permissions, Open Interpreter confirm before run. Best contracts return a risk label the client must honour. Add takeover mode that stops capture while the user types credentials.

**7. Sandbox or scope the agent.** Used by: cua VMs, E2B Surf, OpenHands Docker, Home Assistant entity exposure, domain allow lists (Playwright MCP, browser-use). The page's own atlas manifest is a scope: the agent can only do what the page declares.

**8. Cascaded voice loop: VAD, STT, LLM, TTS, with semantic turn detection.** Used by: Pipecat, LiveKit Agents, Vapi, Retell, ElevenLabs, Unmute, Home Assistant Wyoming. Most flexible and swappable; latency is the cost. Turn detection beyond silence (semantic VAD, trained turn models) is where products differ.

**9. Speech to speech loop with tool calls mid speech.** Used by: OpenAI Realtime, Gemini Live, Moshi (no tools), Ultravox (speech in). Lowest latency and natural barge in. Tool calls can run while the model keeps talking; ephemeral keys let the browser run tools itself.

**10. Barge in cancels output and truncates what was already spoken.** Used by: Pipecat interruption frames, LiveKit, OpenAI Realtime truncation, Moshi full duplex. Pair with per tool interruption policy so a destructive action is not abandoned halfway (ElevenLabs).

**11. Spoken grounding: numbers, names, hat marks and grids.** Used by: macOS Voice Control, Windows Voice Access, Android Voice Access, Cursorless, Talon. Proven by accessibility products for years. 'Click 14' works with no vision model at all, and the atlas can supply the numbers.

**12. Typed action declarations the assistant can call.** Used by: Apple App Intents, MCP tools, Home Assistant services, OpenAI function tools. Matches the atlas manifest directly: each atlas entry becomes a typed tool with an id.

## What Platform Ontology should take from this

1. Serve a snapshot tool that returns controls as an indexed list with stable refs, plus an action tool that takes a ref (the Playwright MCP shape). This is what the in page MCP should mirror.
2. Add a per action risk label (allowed, confirm, blocked) in the manifest, following Gemini's contract, so any client agent knows when to ask the user.
3. Publish numbered overlays and spoken names from the same ids, so voice can say 'press 14' with no vision model (OS voice control pattern).
4. Support per tool interruption policy for voice (ElevenLabs pattern) on actions like submit, delete, pay.
5. Keep a screenshot plus set of marks path as the fallback for pages without an atlas entry.
6. Use OSWorld, AndroidWorld and WebArena style programmatic task checks to score the atlas, rather than anecdotes.

## Entries

GitHub stars, licenses and last push dates were read from the GitHub API on 2026-11-17 (open source only). Everything else is from vendor docs, READMEs and papers; see Caveats.

### Group A: AI controls the screen (36)

| Entry | Open? | License | Stars | Last commit | Perception | Action | Grounding |
|---|---|---|---|---|---|---|---|
| [Browser Use](https://github.com/browser-use/browser-use) | open | MIT | 121,233 | 2026-11-16 | DOM plus accessibility tree flattened to indexed interactive elements; screenshots optional | CDP (own harness, earlier Playwright) | Element ids (numeric index) |
| [Skyvern](https://github.com/Skyvern-AI/skyvern) | open | AGPL-3.0 | 23,434 | 2026-11-17 | Screenshots plus DOM element extraction; vision LLM | Playwright | Element ids resolved from DOM, vision picks the target |
| [Stagehand](https://github.com/browserbase/stagehand) | open | MIT | 26,072 | 2026-11-16 | Accessibility tree and DOM chunks, screenshot optional | Playwright / CDP | Element ids from accessibility tree |
| [Playwright MCP](https://github.com/microsoft/playwright-mcp) | open | Apache-2.0 | 39,751 | 2026-11-16 | Accessibility snapshot as YAML with ref ids; screenshots as an opt in vision mode | Playwright | Element refs from the snapshot |
| [Midscene.js](https://github.com/web-infra-dev/midscene) | open | MIT | 15,623 | 2026-11-16 | Screenshots only (visual grounding model, e.g. Qwen VL or UI-TARS) | Playwright, Puppeteer, ADB, iOS WebDriverAgent | Pixel coordinates from a VLM |
| [Nanobrowser](https://github.com/nanobrowser/nanobrowser) | open | Apache-2.0 | 14,327 | 2026-11-10 | DOM tree with highlighted indexed elements, optional vision | Chrome extension APIs and CDP | Element ids |
| [OpenManus](https://github.com/FoundationAgents/OpenManus) | open | MIT | 58,973 | 2026-11-02 | Browser tool built on browser-use plus shell and file tools | Playwright, shell, Python | Element ids |
| [Magentic-UI](https://github.com/microsoft/magentic-ui) | open | MIT | 10,118 | 2026-11-16 | Screenshots with set of marks boxes plus page text | Playwright in a Docker browser | Marked element ids |
| [OpenHands](https://github.com/OpenHands/OpenHands) | open | MIT | 93,609 | 2026-11-17 | Accessibility tree and DOM through BrowserGym | Playwright in a Docker sandbox | Element ids (bid) |
| [WebVoyager](https://github.com/MinorJerry/WebVoyager) | open | Apache-2.0 | 1,130 | 2024-03-04 | Screenshots with set of marks overlay | Selenium | Numeric labels drawn on the screenshot |
| [SeeAct](https://github.com/OSU-NLP-Group/SeeAct) | open | NOASSERTION | 853 | 2025-02-03 | Screenshot plus ranked DOM candidates | Playwright | Two stage: describe action, then ground to candidate element |
| [Amazon Nova Act](https://github.com/aws/nova-act) | open | Apache-2.0 | n/a | n/a | Screenshots and page state | Playwright | Pixel and element targets chosen by the Nova model |
| [Anthropic computer use](https://github.com/anthropics/claude-quickstarts) | open | MIT | 21,071 | 2026-11-06 | Screenshots | OS input injection (xdotool in a Docker X11 desktop) via computer tool actions | Pixel coordinates |
| [Claude in Chrome](https://www.anthropic.com/news/claude-for-chrome) | closed | Closed | n/a | n/a | Page content, accessibility structure and screenshots | Chrome extension actions | Element refs and coordinates |
| [OpenAI CUA / Operator / ChatGPT agent](https://openai.com/index/introducing-operator/) | closed | Closed | n/a | n/a | Screenshots | Virtual mouse and keyboard in a remote browser | Pixel coordinates |
| [Gemini computer use](https://github.com/google-gemini/computer-use-preview) | open | Apache-2.0 | 3,286 | 2026-07-28 | Screenshots | Client executes predefined actions via Playwright | Normalized coordinates on a 1000 grid |
| [UI-TARS](https://github.com/bytedance/UI-TARS) | open | Apache-2.0 | 11,697 (archived) | 2026-01-27 | Screenshots only, end to end VLM with chain of thought | Emits actions executed by a harness (pyautogui, ADB, browser) | Pixel coordinates |
| [UI-TARS Desktop / Agent TARS](https://github.com/bytedance/UI-TARS-desktop) | open | Apache-2.0 | 39,602 (archived) | 2026-10-09 | Screenshots (GUI mode), DOM and MCP tools (Agent TARS) | Native input injection, browser control, MCP | Pixel coordinates |
| [Agent S (Simular)](https://github.com/simular-ai/Agent-S) | open | Apache-2.0 | 12,985 | 2026-11-13 | Screenshot plus accessibility tree, separate grounding model | pyautogui style OS input, code agent | Pixel coordinates from a grounding model |
| [OmniParser](https://github.com/microsoft/OmniParser) | open | CC-BY-4.0 | 25,629 | 2026-11-14 | Screenshot parsed to boxes and captions (icon detector plus captioner plus OCR) | None (parser only, used with any agent) | Element ids over detected boxes (set of marks) |
| [Microsoft UFO](https://github.com/microsoft/UFO) | open | MIT | 10,219 | 2026-10-30 | Windows UI Automation tree plus screenshots (hybrid) | UIA control patterns, Win32 and COM APIs, plus mouse and keyboard | Control ids from UIA, with vision fallback |
| [Open Interpreter](https://github.com/openinterpreter/openinterpreter) | open | Apache-2.0 | 68,896 | 2026-11-15 | Screenshots in OS mode, plus code output | Runs generated code locally; OS mode uses pyautogui style control | Pixel coordinates |
| [trycua Cua](https://github.com/trycua/cua) | open | MIT | 32,456 | 2026-11-17 | Screenshots from macOS, Linux or Windows VMs | VM level input injection | Pixel coordinates, model agnostic |
| [E2B Surf](https://github.com/e2b-dev/surf) | open | Apache-2.0 | 882 | 2026-10-13 | Screenshots of a cloud desktop | xdotool in an E2B desktop sandbox | Pixel coordinates |
| [OpenAdapt](https://github.com/OpenAdaptAI/OpenAdapt) | open | MIT | 1,884 | 2026-11-16 | Screenshots, window and accessibility metadata, input events | OS input injection | Element and pixel via a VLM |
| [OpenCUA](https://github.com/xlang-ai/OpenCUA) | open | MIT | 877 | 2026-05-25 | Screenshots | Emits pyautogui style actions | Pixel coordinates |
| [ShowUI](https://github.com/showlab/ShowUI) | open | Apache-2.0 | 1,930 | 2026-04-24 | Screenshots with UI guided token selection (2B model) | Emits actions | Pixel coordinates |
| [CogAgent](https://github.com/zai-org/CogAgent) | open | Apache-2.0 | 1,202 | 2026-10-12 | Screenshots, high resolution | Emits actions (web, phone) | Pixel coordinates |
| [Open-AutoGLM (Phone Agent)](https://github.com/zai-org/Open-AutoGLM) | open | Apache-2.0 | 26,613 | 2026-03-06 | Screenshots | ADB (and HDC for HarmonyOS) | Pixel coordinates from the AutoGLM-Phone model |
| [Mobile-Agent (X-PLUG)](https://github.com/X-PLUG/MobileAgent) | open | MIT | 9,386 | 2026-11-03 | Screenshots, OCR and icon detection in early versions; end to end GUI-Owl in v3 | ADB | Pixel coordinates / detected boxes |
| [AppAgent](https://github.com/TencentQQGYLab/AppAgent) | open | MIT | 6,923 | 2025-03-19 | Screenshots with numbered overlays built from the Android XML UI tree | ADB | Numbered element ids |
| [Mobilerun (formerly droidrun)](https://github.com/droidrun/mobilerun) | open | MIT | 10,055 | 2026-11-16 | Accessibility tree via a Portal app plus screenshots | ADB and the Portal accessibility service | Element indexes |
| [Minitap mobile-use](https://github.com/minitap-ai/mobile-use) | open | Apache-2.0 | 3,400 | 2026-11-15 | UI hierarchy plus screenshots | ADB / iOS tooling | Element ids |
| [Microsoft Copilot Studio computer use](https://www.microsoft.com/microsoft-copilot/blog/copilot-studio/announcing-computer-use-microsoft-copilot-studio-ui-automation/) | closed | Closed | n/a | n/a | Screenshots and reasoning traces captured per step | Virtual machine or hosted browser input | Pixel coordinates |
| [UiPath agentic automation (UI agent)](https://www.uipath.com/) | closed | Closed | n/a | n/a | UI selectors from its automation library plus screenshots for the computer use path | Selector based UI automation, with LLM planned steps | Selectors (stable ids) with vision fallback |
| [Robocorp (Sema4.ai)](https://github.com/robocorp/robocorp) | open | Apache-2.0 | 651 | 2026-11-01 | DOM, window trees | Playwright, Windows UIA | Locators |

| Entry | Voice pipeline | Safety model | Benchmarks | What the atlas can learn |
|---|---|---|---|---|
| Browser Use | None | Domain allow lists, placeholders for secrets so the model never sees them, human in the loop hooks | Self reported WebVoyager and Online-Mind2Web scores (vendor judge, not comparable) | A numbered list of interactive elements is the cheapest grounding; the atlas can emit exactly this list per page. |
| Skyvern | None | Planner, actor and validator loop; hosted version adds credential vault | Reports WebBench and WebVoyager results on its blog (self reported) | A validator step that re checks page state after each action catches silent failures. |
| Stagehand | None | Developer scripted, cached actions replay without the LLM | Browserbase publishes its own evals | Three verbs (act, extract, observe) with replay caching is a clean tool surface for an agent. |
| Playwright MCP | None | Origin allow and block lists, sandboxed profile, client decides tool approval | None published | The de facto MCP shape: snapshot tool returns refs, action tools take a ref. Mirror this for the in page MCP. |
| Midscene.js | None | Scripts in YAML or JS, reports with replay video | Reports ScreenSpot style grounding results with open models | One visual loop covers web, Android and iOS; useful as the fallback when the atlas has no id for a target. |
| Nanobrowser | None | Runs locally with the user's own keys; planner and navigator agents | None published | An extension runs inside the user's real logged in session, which is the deployment the console is closest to. |
| OpenManus | None | Sandbox optional | None published | A general agent is mostly tools plus a loop; the atlas is a tool catalog for such a loop. |
| Magentic-UI | None | Action guards: user approves risky steps, co planning, plan editing, allow listed sites | Microsoft evaluates on GAIA, WebVoyager and WebGames | Best published human in the loop UX: plan first, approve per risky step, always interruptible. |
| OpenHands | None | Docker sandbox, confirmation mode for risky commands | SWE-bench for code; WebArena through BrowserGym | BrowserGym's bid attribute is a prior art for stable element ids. |
| WebVoyager | None | None | Defines its own 643 task benchmark; original paper 59.1% success; repo last commit 2024-03 | Origin of the set of marks recipe for web agents; stale but historically central. |
| SeeAct | None | None | Mind2Web and Online-Mind2Web | Separating what to do from which element is a useful split that the atlas can serve (the element side). |
| Amazon Nova Act | None | Developer scripted act() steps, human handoff hooks | Amazon reports its own reliability numbers | Small atomic act() steps are more reliable than free running goals. |
| Anthropic computer use | None | Run in a VM or container, prompt injection classifiers, user confirmation for consequential actions per docs | Claimed top OSWorld results across model generations; verify on the official OSWorld board | Reference loop: screenshot, model, action, screenshot. The atlas adds ids so the model need not guess pixels. |
| Claude in Chrome | None | Per site permissions, confirmation for high risk actions; pilot cut injection attack success from 23.6% to 11.2%; a 2026 extension messaging flaw (fixed May 2026) shows the extension itself is attack surface | Vendor reports injection rates, not task benchmarks | Permissions per origin plus confirm on high risk is the shipped norm; lock down who may message the agent. |
| OpenAI CUA / Operator / ChatGPT agent | None | Asks before login and payments, watch mode on sensitive sites, takeover mode without screenshots. Help center now reports ChatGPT agent mode as no longer available (replaced by ChatGPT Work); Operator was retired in 2025 | Launch figures: OSWorld 38.1%, WebArena 58.1%, WebVoyager 87% (OpenAI, Jan 2025); Online-Mind2Web 61.3% in the independent paper | Takeover mode that stops screenshotting during user input is a privacy pattern worth copying. |
| Gemini computer use | None | Per action safety_decision: allowed, require_confirmation or blocked; client must ask the user | Vendor reports Online-Mind2Web and WebVoyager at launch | A server side per action risk label the client must honour is a clean confirmation contract. |
| UI-TARS | None | None in model | OSWorld, AndroidWorld, ScreenSpot, WebVoyager reported in the UI-TARS 1.5 release (OSWorld about 42% at 100 steps, per the release) | End to end pixel models are strong but depend on screenshots; repo archived 2026-01, so check forks. |
| UI-TARS Desktop / Agent TARS | Early versions let the user dictate tasks (voice entry); check current build | Local operator mode, user can pause; repo archived 2026-10 | Uses UI-TARS benchmarks | Hybrid GUI plus MCP tool use in one agent is the direction the field took. |
| Agent S (Simular) | None | Local code execution is a risk the docs flag | README: Agent S3 72.60% on OSWorld (above the 72% human baseline); Sai 73% on OSWorld 2.0 (vendor claims) | Split planner and grounding model is the winning design; best open OSWorld result. |
| OmniParser | None | None | V2: 39.5% on ScreenSpot Pro with GPT-4o (README) | Turns any pixels into a structured element list; the atlas does the same job from the DOM for free. |
| Microsoft UFO | None | Safeguards and approval for sensitive actions, documented | Evaluated on Windows Agent Arena | Prefer the accessibility API and fall back to vision; native APIs beat clicks when they exist. |
| Open Interpreter | None | Asks before running each code block unless auto_run is on | None published | Confirm before execute is the oldest safety UX in this space. |
| trycua Cua | None | Agents run in isolated VMs, not on the user's desktop | Ships cua-bench and reports OSWorld and ScreenSpot with several models | Run the agent in a sandbox and give it the page's own tool surface; separates risk from capability. |
| E2B Surf | Demo accepts microphone input (check repo); text first | Disposable sandbox | None | Disposable cloud desktops make 'undo' trivial; the atlas console is a safe sandbox by construction. |
| OpenAdapt | None | Local data scrubbing (PII) is a stated feature | None | Recording human demos yields training data; the console's event stream could do the same for page controls. |
| OpenCUA | None | None | README: OpenCUA-72B reaches 45.0% on OSWorld-Verified, 60.8% on ScreenSpot-Pro | Open data (AgentNet) plus open weights make a fully local agent possible. |
| ShowUI | None | None | ScreenSpot grounding; Mind2Web and AITW navigation | Small local models can ground well; relevant for in browser inference later. |
| CogAgent | None | None | Mind2Web, AITW (papers) | Early open high resolution GUI VLM; shows resolution matters for small controls. |
| Open-AutoGLM (Phone Agent) | Voice or text task in the product line; the open repo is text driven | Human takeover for logins and captchas, sensitive action confirmation | AndroidLab and similar (repo) | Hand control back to the human for logins; same rule applies to a console that has sign in flows. |
| Mobile-Agent (X-PLUG) | None | None noted | AndroidWorld and AndroidLab (v3 reports strong open model results) | Shows the progression: tool pipelines (OCR plus detectors) then end to end models. |
| AppAgent | None | None | Own benchmark of 50 tasks (paper) | Exploration phase writes per app documentation the agent reads later: the atlas is that documentation, made ahead of time. |
| Mobilerun (formerly droidrun) | None | Self hosted device, optional cloud phones | Vendor reports AndroidWorld results on its blog | Accessibility tree first, screenshots second; ships an agent skill so coding agents can drive phones. |
| Minitap mobile-use | None | None noted | README claims 100% on AndroidWorld (vendor claim, independent run not found) | Multi agent planner, cortex and executor split; treat headline benchmark numbers as vendor claims. |
| Microsoft Copilot Studio computer use | None | Makers review screenshots and reasoning, admin controls; reported generally available (secondary sources) | None published | Audit trail of screenshot plus reasoning per step is what enterprises expect from agent actions. |
| UiPath agentic automation (UI agent) | None | Governance and approval inside Orchestrator | None published | RPA's selector idea (durable ids, not coordinates) is what an atlas id gives the model. |
| Robocorp (Sema4.ai) | None | Run controls in cloud | None | Open RPA stacks reuse locator strategies; useful reference for selector fallbacks. |

### Group A+B: screen and voice together (4)

| Entry | Open? | License | Stars | Last commit | Perception | Action | Grounding |
|---|---|---|---|---|---|---|---|
| [Self-Operating Computer](https://github.com/OthersideAI/self-operating-computer) | open | MIT | 10,312 | 2026-10-19 | Screenshots, optional grid overlay, OCR and set of marks modes | pyautogui OS input | Pixel coordinates (or marked ids) |
| [Gemini Live API](https://ai.google.dev/gemini-api/docs/live) | closed | Closed | n/a | n/a | Audio, video and screen share frames | Function calling, code execution, search | n/a (function names) |
| [Rabbit r1 LAM playground](https://www.rabbit.tech/lam-playground) | closed | Closed | n/a | n/a | Screenshots of a cloud browser (Rabbit says its playground is based on WebVoyager) | Cloud browser automation | Marked elements (WebVoyager lineage) |
| [Open Interpreter 01](https://github.com/openinterpreter/01) | open | AGPL-3.0 | 5,166 | 2024-11-01 | Audio in, plus whatever the interpreter sees | Runs generated code on the host | Code, not UI targets |

| Entry | Voice pipeline | Safety model | Benchmarks | What the atlas can learn |
|---|---|---|---|---|
| Self-Operating Computer | Optional voice mode (-voice flag) transcribes a spoken objective, then runs the loop; no barge in | Press Ctrl+C to stop; no confirmations | None published | Voice only sets the goal; the loop afterwards is silent. A thin precedent for A plus B. |
| Gemini Live API | Native audio speech to speech over WebSocket; built in VAD and interruption; ephemeral tokens for browsers | Developer controlled | None | Sibling session picked this for the AI page; screen share plus tools is the only A plus B hosted API. |
| Rabbit r1 LAM playground | Push to talk voice prompt on device, cloud STT and LLM; no barge in documented | Teach mode scoped per site; CAPTCHAs and logins limited; CEO admitted launch overpromised | None independent | Cautionary tale: voice front end over a weak action layer fails on reliability, not UX. |
| Open Interpreter 01 | Push to talk STT, LLM, TTS streamed over a WebSocket server | Asks before running code unless auto run | None | A+B in one open repo; last commit 2024-11, so a reference, not a base. |

### Group B: voice to actions (20)

| Entry | Open? | License | Stars | Last commit | Perception | Action | Grounding |
|---|---|---|---|---|---|---|---|
| [Pipecat](https://github.com/pipecat-ai/pipecat) | open | BSD-2-Clause | 17,298 | 2026-11-16 | Audio frames (and video) | Function calls to your code; transports WebRTC (Daily), WebSocket, telephony | n/a (tool calls by name) |
| [LiveKit Agents](https://github.com/livekit/agents) | open | Apache-2.0 | 15,251 | 2026-11-16 | Audio, video, text over WebRTC rooms | Function tools, RPC to frontend participants | n/a |
| [OpenAI Realtime API (gpt-realtime)](https://platform.openai.com/docs/guides/realtime) | open | MIT | 30,720 | 2026-11-16 | Audio, text, images | Function calling over WebRTC, WebSocket, SIP | n/a (function names) |
| [Vapi](https://vapi.ai) | closed | Closed (some open SDKs) | n/a | n/a | Phone and web audio | Server URL webhooks for tool calls, custom LLM endpoints | n/a |
| [Retell AI](https://www.retellai.com) | closed | Closed | n/a | n/a | Phone and web audio | Functions via webhooks; custom LLM over WebSocket | n/a |
| [ElevenLabs Agents](https://elevenlabs.io/docs/eleven-agents/overview) | closed | Closed (SDKs open) | n/a | n/a | Audio, text | Client tools (run in the browser), server tools, system tools, MCP servers | n/a (tool names) |
| [Ultravox](https://github.com/fixie-ai/ultravox) | open | MIT | 4,589 | 2025-12-12 | Audio goes straight into the LLM (no separate STT) | Tool calls through hosted API | n/a |
| [Moshi](https://github.com/kyutai-labs/moshi) | open | Apache-2.0 | 11,538 | 2026-09-09 | Audio, full duplex | None native | n/a |
| [Kyutai Unmute](https://github.com/kyutai-labs/unmute) | open | MIT | 1,552 | 2026-09-09 | Audio | Wraps any text LLM; no tool layer documented | n/a |
| [OpenAI Whisper](https://github.com/openai/whisper) | open | MIT | 112,853 | 2026-08-31 | Audio files (not streaming by itself) | n/a | n/a |
| [Talon Voice](https://talonvoice.com) | closed | Closed freeware, paid Patreon beta | n/a | n/a | Active window, accessibility tree on macOS and Windows, app context for scoped commands | OS input injection plus accessibility actions; Python scripts | Command grammar plus on screen labels |
| [Cursorless](https://github.com/cursorless-dev/cursorless) | open | MIT | 1,345 | 2026-11-16 | Editor text, with spoken hat marks over tokens | Editor APIs (VS Code) | Colored hats over tokens: spoken ids |
| [macOS Voice Control](https://support.apple.com/guide/mac-help/use-voice-control-mchl5a6e2b4e/mac) | closed | Closed | n/a | n/a | Accessibility tree of the front app | Accessibility APIs | Names, numbered overlays, grid |
| [Windows Voice Access](https://support.microsoft.com/windows/use-voice-access-to-control-your-pc-author-text-with-your-voice-4dcd2a2f) | closed | Closed | n/a | n/a | UI Automation tree | UI Automation, input injection | Names, numbered overlays, grid |
| [Android Voice Access](https://support.google.com/accessibility/android/answer/6151848) | closed | Closed | n/a | n/a | Accessibility tree | AccessibilityService actions | Numbered overlays and element names |
| [Apple App Intents / Siri](https://developer.apple.com/documentation/appintents) | closed | Closed | n/a | n/a | App declared actions, entities and on screen content | App Intents (typed actions apps register) | Typed entities with identifiers |
| [Home Assistant Assist](https://github.com/home-assistant/core) | open | Apache-2.0 | 92,302 | 2026-11-16 | Entity registry states | Service calls on named entities | Entity ids and aliases (names resolved by exposed entity list) |
| [Willow](https://github.com/HeyWillow/willow) | open | Apache-2.0 | 3,140 | 2026-11-01 | Microphone on ESP32 devices | REST and Home Assistant integration | n/a |
| [Leon](https://github.com/leon-ai/leon) | open | MIT | 17,685 | 2026-11-16 | Text and voice | Skills (Node and Python modules) | n/a |
| [OpenVoiceOS](https://github.com/OpenVoiceOS/ovos-core) | open | Apache-2.0 | 301 | 2026-11-02 | Audio | Skills with intent parsers | n/a |

| Entry | Voice pipeline | Safety model | Benchmarks | What the atlas can learn |
|---|---|---|---|---|
| Pipecat | Cascaded STT, LLM, TTS or speech to speech services; pluggable VAD (Silero) and smart turn model; interruptions cancel TTS frames | Developer controlled | None | Frame pipeline with interruption frames is the clearest open design for barge in. |
| LiveKit Agents | STT, LLM, TTS or realtime models; VAD plus open weights turn detector model; interruption handling; MCP support | Developer controlled | None | Frontend RPC from agent to browser participant is exactly the voice to in page action path. |
| OpenAI Realtime API (gpt-realtime) | Speech to speech; server VAD or semantic VAD; barge in truncates output; async function calls | Developer controlled; ephemeral client secrets for browsers | ComplexFuncBench audio 66.5% (OpenAI) | Ephemeral keys plus client side tool execution lets the browser run the tools. |
| Vapi | Cascaded STT, LLM, TTS with provider choice; interruption and endpointing settings; can use OpenAI Realtime | Developer controlled | None | Tool calls as webhooks are simple but add latency; a client side tool avoids the round trip. |
| Retell AI | Cascaded with a proprietary turn taking model tuned for barge in | Developer controlled; compliance features | None | Dedicated turn taking model is the differentiator vendors compete on. |
| ElevenLabs Agents | Cascaded with proprietary turn taking model; per tool interruption modes (lock interruptions during critical tools); skip_turn tool | Developer controlled | None | Per tool interruption policy (do not let barge in cancel a destructive action mid flight) is a smart safety hook. |
| Ultravox | Speech in, text out; separate TTS; hosted API adds turn handling | Hosted | None | Skipping STT saves latency and keeps tone; text out still needs TTS. |
| Moshi | Full duplex speech to speech, listens while it speaks so barge in is native | None | None | Full duplex removes turn detection entirely but lacks tools today. |
| Kyutai Unmute | Open STT and TTS around an LLM, semantic VAD, interruptions | None | None | Fully open cascade for self hosting. |
| OpenAI Whisper | STT only; streaming needs wrappers (faster-whisper, whisper.cpp) | n/a | LibriSpeech etc. | The default offline STT; relevant for a local mode. |
| Talon Voice | Own speech engine, command grammar (not an LLM); noise and eye tracking input | No confirmation; deterministic grammar | None | Deterministic grammars are fast and safe; an LLM should map free speech onto such a grammar, not replace it. |
| Cursorless | Runs on Talon (or other speech tools) | Undo in editor | None | Spoken hat marks are the best precedent for 'say the id of the thing'. |
| macOS Voice Control | On device speech recognition, commands plus dictation; no LLM planning | Built in; confirmations for destructive ones | None | Show numbers / show names overlays are the template for voice grounding on any UI. |
| Windows Voice Access | On device speech; newer builds add natural language commands | Built in | None | Same overlay idea; both desktop OS vendors converged on it. |
| Android Voice Access | Speech recognition plus commands | Built in | None | Accessibility service plus numbered overlays is the mobile twin of the same pattern. |
| Apple App Intents / Siri | On device and cloud speech; Siri LLM features reported | Intents carry confirmation and authentication requirements | None | Apps declare typed actions for the assistant: this is what the atlas manifest can become for a web page. |
| Home Assistant Assist | Wyoming protocol: wake word, STT, intent or LLM, TTS satellites; local or cloud | Only exposed entities can be controlled; user chooses exposure | None | The exposure list (user picks what the assistant may control) is a strong model for per site agent scopes. |
| Willow | On device wake word and VAD, streaming STT server, TTS | Local only | None | Edge wake word plus local server is the privacy preserving shape. |
| Leon | STT and TTS options, skill routing | Local first | None | Skill registry mirrors a tool catalog. |
| OpenVoiceOS | Wake word, STT, intents, TTS plugins; Mycroft successor (mycroft-core archived) | Local first | None | Plugin architecture for every stage. |

### Benchmarks used to judge group A (3)

| Entry | Open? | License | Stars | Last commit | Perception | Action | Grounding |
|---|---|---|---|---|---|---|---|
| [OSWorld / OSWorld-Verified](https://github.com/xlang-ai/OSWorld) | open | Apache-2.0 | 3,263 | 2026-11-14 | 369 tasks across real Ubuntu, Windows, macOS apps | n/a | n/a |
| [WebArena](https://github.com/web-arena-x/webarena) | open | Apache-2.0 | 1,645 | 2025-11-26 | 812 tasks on self hosted sites | n/a | n/a |
| [AndroidWorld](https://github.com/google-research/android_world) | open | Apache-2.0 | 1,014 | 2026-11-10 | 116 tasks across 20 apps on an emulator, with accessibility tree access | ADB | n/a |

| Entry | Voice pipeline | Safety model | Benchmarks | What the atlas can learn |
|---|---|---|---|---|
| OSWorld / OSWorld-Verified | None | n/a | Human baseline about 72%. Trackers (Oct 2026) report top agents between 85% and 90%, with different setups, so use the official board for comparison | The yardstick desktop agents are judged on. |
| WebArena | None | n/a | Operator launch figure 58.1%; June 2026 paper reports 56.3% with open weights | Self hosted fake sites give repeatable web evals; the console could host its own task set. |
| AndroidWorld | None | n/a | Scores vary by board and metric; vendor claims range from about 75% to above 90% | Task generators with programmatic rewards are the right way to score page controls too. |

## Caveats

- **Benchmarks are reported snapshots.** OSWorld-Verified leaderboards disagree: the human baseline is about 72%, Agent S3 reports 72.6%, some trackers in October 2026 list models between 85% and 90%, and OSWorld 2.0 is much harder. Use the official board before quoting. AndroidWorld, Online-Mind2Web and WebVoyager numbers are mostly self reported with custom judges and are not comparable.
- Vendor claims (for example minitap mobile-use 100% on AndroidWorld) are marked as claims.
- Products change fast: OpenAI Operator was folded into ChatGPT agent and the help center now says agent mode is no longer available (ChatGPT Work replaces it, reported); the ByteDance UI-TARS repos are archived; Open Interpreter 01 and vocode-core saw no commits since 2024. Check the live page before building on any entry.
- Some descriptions of closed products (Talon internals, Vapi and Retell turn taking, Rabbit LAM) come from vendor pages and secondary sources, not code.
- Entries not found and dropped: THUDM/AutoGLM and the Pangu agent repo (404).

## Where it lives

- Lake: Supabase `cd-lake-prod`. Entities are `product:agentctl-<id>` (63 products, 126 observations). Run `run:research-agent-control-census-2026-11:20261117T002044.382Z`. Document `doc:9ce04284407fff78` (condensed summary). Report Artifact: https://claude.ai/artifact/Wkf3arXacA69qR2XfuVAPq
- Data file: `docs/research/agent-control-census.json` (same rows as the tables).
