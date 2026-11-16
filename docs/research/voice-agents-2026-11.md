# Realtime voice agent options, November 2026

Scored for the ai.platformontology.lol voice page: one person in one browser tab, talking to an agent that drives the page through the in-page MCP server.

Weights: latency 0.2, tool_calling 0.2, cost 0.15, value 0.15, asr 0.1, bundle 0.1, browser 0.05, speed 0.05.

| Rank | Option | Overall | First audio (ms) | USD per minute | Client KB | Tool calling |
|---|---|---|---|---|---|---|
| 1 | Google Gemini Live API (gemini-3.8-live, browser WebSocket) | 9.1 | 790 | 0.03 | 0 | 9/10 |
| 2 | OpenAI Realtime API over WebRTC (gpt-realtime-2.1) | 8.25 | 900 | 0.15 | 0 | 10/10 |
| 3 | Deepgram Voice Agent API | 7.75 | 800 | 0.075 | 29 | 9/10 |
| 4 | Ultravox Realtime | 7.4 | 800 | 0.05 | 135 | 9/10 |
| 5 | LiveKit Agents (LiveKit Cloud) | 7.3 | 900 | 0.04 | 151 | 9/10 |
| 6 | Cartesia Managed Agents (successor to Line) | 7.25 | 800 | 0.045 | 0 | 8/10 |
| 7 | Pipecat (Daily transport) | 7.1 | 850 | 0.04 | 107 | 8/10 |
| 8 | ElevenLabs Agents Platform (ElevenAgents) | 6.6 | 1100 | 0.1 | 160 | 9/10 |
| 9 | Hume EVI | 6.5 | 900 | 0.08 | 47 | 8/10 |
| 10 | Vapi Web SDK | 5.0 | 1558 | 0.1 | 84 | 4/10 |

## Recommendation

Pick: **Google Gemini Live API (gemini-3.8-live) direct from the browser over WebSocket with an ephemeral token minted by one Vercel function; client side tool calls executed in the page.** Runner up: **OpenAI Realtime over WebRTC (gpt-realtime-2.1, or gpt-realtime-2.1-mini to cut cost): zero SDK, best client side function calling, about 3x to 5x the cost.**

Gemini Live is about $0.03/min versus $0.15 for gpt-realtime-2.1, needs 0 KB of SDK if you use raw WebSocket (about 75 KB gzip with @google/genai), is under 800 ms median in an independent test, and returns tool results to the model from client JS, which fits 200 in-page tools. Ephemeral tokens can be locked to model and config so the system prompt stays server side. No paid plan is strictly needed to prototype: Gemini 2.5 Flash Native Audio is free tier (content may be used by Google); gemini-3.8-live needs a paid key, so the owner must approve billing first. OpenAI needs prepaid billing, ElevenLabs paid beyond 15 minutes, Ultravox beyond 30 minutes, Deepgram uses $200 credit with no card, LiveKit Build is free with no card. Do not register 200 tool schemas: expose about 6 meta tools (list_capabilities, describe_capability, start_demo, stop_demo, read_stream, list_active) and resolve by id in the page, which cuts context tokens and improves tool selection for every option.

## Per option notes

### 1. Google Gemini Live API (gemini-3.8-live, browser WebSocket) (Google)

Direct browser WebSocket to Gemini Live API (client to server mode). 16 kHz PCM in, 24 kHz PCM out; you write an AudioWorklet or use the SDK. Backend mints an ephemeral token.

Pros: Cheapest high quality S2S; Native client side tools with async mode; Locked ephemeral tokens keep system prompt server side; Free tier for 2.5 native audio.

Cons: Ephemeral tokens are v1beta; You own the audio capture and playback code unless you pull the SDK; Session length limits; needs session resumption.

Cost: gemini-3.8-live list price about $0.005/min audio in and $0.018/min audio out ($3 and $12 per 1M audio tokens). Assuming the agent talks half the time, about $0.015/min; $0.03 allowed for tool and context tokens.

Sources: https://aistudio.google.com/docs/live-api, https://aistudio.google.com/docs/live-api/ephemeral-tokens, https://aistudio.google.com/docs/live-api/tools, https://aistudio.google.com/docs/pricing, https://www.codebridge.tech/articles/voice-ai-phone-agents-latency-benchmark

### 2. OpenAI Realtime API over WebRTC (gpt-realtime-2.1) (OpenAI)

Direct browser to OpenAI over WebRTC (mic track in, agent audio track out, JSON events on an 'oai-events' data channel). Backend only mints a short lived client secret or relays the SDP offer. No media room, no long running server.

Pros: Zero dependencies, zero SDK bytes; Best fit for client side tool calls with results returned; Vercel serverless is enough; Mini tier cuts cost about 3x.

Cons: Most expensive per minute among the S2S options at full tier; 200 tool schemas bloat context and latency; needs tool grouping; No free tier.

Cost: Token billing, audio in $32/M, audio out $64/M, cached $0.40/M (gpt-realtime-2.1). OpenAI quotes about $0.30/min before caching; other analyses $0.15 to $0.20. 0.15 assumed with caching. gpt-realtime-2.1-mini is $10/M in, $20/M out, roughly $0.05/min. Audio is about 1 token per 100 ms in and 1 token per 50 ms out. 200 tool schemas add thousands of cached input tokens every turn.

Sources: https://developers.openai.com/api/docs/guides/realtime-webrtc, https://developers.openai.com/api/docs/pricing, https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini, https://developers.openai.com/api/docs/guides/realtime-conversations, https://www.codebridge.tech/articles/voice-ai-phone-agents-latency-benchmark, https://developers.openai.com/api/docs/guides/voice-latency-cost

### 3. Deepgram Voice Agent API (Deepgram)

Browser connects by WebSocket (@deepgram/agents browser SDK or raw) to a single Deepgram agent endpoint that runs Flux/Nova-3 STT, your chosen LLM and Aura-2 TTS. No media room.

Pros: Single bundled price; Big no card free credit; Small SDK, client side functions.

Cons: Browser SDK is new (v0.2); ASR not best in independent tests; LLM choice limited vs DIY.

Cost: Pay as you go Standard $0.075/min bundled STT, LLM and TTS; BYO TTS $0.065; Growth $0.068 and $0.051.

Sources: https://deepgram.com/pricing, https://developers.deepgram.com/docs/browser-agent-javascript, https://developers.deepgram.com/docs/voice-agent-function-call-request, https://developers.deepgram.com/guides/fundamentals/token-based-authentication, https://bundlephobia.com/package/@deepgram/agents, https://artificialanalysis.ai/articles/new-streaming-speech-to-text-benchmark-aa-wer-streaming

### 4. Ultravox Realtime (Ultravox (acquired by Inworld))

Server creates a call (POST calls) and returns a joinUrl; browser ultravox-client joins over WebRTC (LiveKit based). Audio native open weight model, hosted.

Pros: Flat $0.05/min all in; Client tools with results; Simple server step.

Cons: Latency not independently benchmarked; Heavy SDK; Ownership change to Inworld adds roadmap risk.

Cost: $0.05/min flat pay as you go; 30 free minutes; Pro $100/month removes concurrency cap; model hosted tools extra only for Threads LLM tokens ($2 / $15 per 1M).

Sources: https://www.ultravox.ai/pricing, https://docs.ultravox.ai/tutorials/clienttools.md, https://docs.ultravox.ai/llms.txt, https://bundlephobia.com/package/ultravox-client

### 5. LiveKit Agents (LiveKit Cloud) (LiveKit)

Browser joins a LiveKit room over WebRTC with livekit-client; an agent worker (Python or Node, separate process, hosted on LiveKit Cloud or yours) is dispatched into the room and runs STT, LLM, TTS or a realtime model. Backend mints a room JWT.

Pros: Generous free tier; Frontend RPC tools are first class; Mix any STT, LLM, TTS or S2S model.

Cons: Needs a deployed agent worker (not Vercel serverless); Large client bundle; Most moving parts.

Cost: Build plan: agent session $0.01/min after 1,000 free, Nova-3 STT about $0.005, Sonic or Aura TTS $0.009 to $0.03, small LLM $0.001 to $0.003, WebRTC $0.0005. About $0.03 to $0.05.

Sources: https://docs.livekit.io/agents/, https://docs.livekit.io/agents/logic/tools/forwarding.md, https://livekit.com/pricing, https://bundlephobia.com/package/livekit-client, https://www.codebridge.tech/articles/voice-ai-phone-agents-latency-benchmark

### 6. Cartesia Managed Agents (successor to Line) (Cartesia)

Browser WebSocket directly to wss://api.cartesia.ai/v1/agents/websocket/{agent_id} with a short lived agent access token; base64 audio_input and audio_output events. Hosted agent with Ink STT and Sonic TTS.

Pros: Cheap; No SDK needed; Client tools return data.

Cons: Hosted Line SDK agents stop Dec 1 2026; API moved twice this year; 4 KiB tool result cap; Least documented browser path, DIY audio code.

Cost: $0.03/min agent call (cut from $0.06 on 2026-11-02 per docs and a tracker) plus LLM tokens billed separately, about $0.01 to $0.015. No telephony needed for web.

Sources: https://docs.cartesia.ai/line/integrations/web-calls, https://docs.cartesia.ai/agents/client-tools, https://docs.cartesia.ai/pricing.md, https://docs.cartesia.ai/agents/migrate-from-line-sdk, https://www.coval.ai/blog/best-text-to-speech-providers-in-2026-how-to-choose-(and-why-vendor-benchmarks-lie)/

### 7. Pipecat (Daily transport) (Daily / Pipecat)

Open source Python bot (STT, LLM, TTS pipeline) must run on a long running server or Pipecat Cloud; browser uses @pipecat-ai/client-js plus Daily or SmallWebRTC transport and RTVI messages.

Pros: Open source, fully flexible; Client side tool handlers with result; Cheap.

Cons: You build and deploy a Python bot; Not Vercel friendly; Sharp edges on client function results.

Cost: Pipecat Cloud agent-1x $0.01/min active; Deepgram STT about $0.006, TTS about $0.015, small LLM about $0.005; Daily 1:1 voice WebRTC free with Pipecat Cloud key. Self hosting removes the $0.01 but you run the server.

Sources: https://docs.pipecat.ai/client/js/introduction, https://docs.pipecat.ai/client/js/api-reference/client-methods, https://github.com/pipecat-ai/pipecat-examples/pull/241, https://www.daily.co/pricing/pipecat-cloud/, https://bundlephobia.com/package/@pipecat-ai/daily-transport

### 8. ElevenLabs Agents Platform (ElevenAgents) (ElevenLabs)

Browser uses @elevenlabs/client over WebRTC (LiveKit based) or WebSocket to ElevenLabs hosted agent. Agent, tools and prompt are configured in their cloud. Backend mints a conversation token or signed URL.

Pros: Best measured ASR; Polished SDK and React hooks; Client tools return data to the agent.

Cons: Heavy SDK (livekit inside); $0.08/min platform fee plus LLM; Every tool must be pre-declared on the agent (200 definitions via API).

Cost: $0.08 per connected minute (burst $0.16 over concurrency) plus LLM tokens. Realtime v1 Mini tokens $0.20 in / $6 out per 1M; Max $1.80 / $9. Typical total about $0.09 to $0.12.

Sources: https://elevenlabs.io/pricing/api, https://elevenlabs.io/docs/eleven-agents/customization/tools/client-tools.md, https://elevenlabs.io/docs/eleven-agents/customization/realtime-models.md, https://elevenlabs.io/docs/eleven-agents/api-reference/conversations/get-webrtc-token.md, https://bundlephobia.com/package/@elevenlabs/client, https://artificialanalysis.ai/articles/new-streaming-speech-to-text-benchmark-aa-wer-streaming, https://openbenchmarks.com/voice-agent-latency

### 9. Hume EVI (Hume AI)

Browser WebSocket (hume SDK or @humeai/voice-react) directly to EVI with a 30 minute access token; EVI orchestrates STT, supplemental LLM and expressive TTS.

Pros: Emotion aware voice; Client tool calls with results.

Cons: Pricing and status unclear, site now emphasizes evaluation tools; No latency figures; Tools need a supplemental LLM.

Cost: Aggregators report $0.07/min on Starter and Creator, $0.06 on Pro ($70 plan, 1,200 min). Official pricing page no longer lists EVI, so unverified. 0.08 includes allowance for the supplemental LLM.

Sources: https://dev.hume.ai/voice/docs/speech-to-speech-evi/features/tool-use, https://dev.hume.ai/docs/introduction/api-key, https://www.activepieces.com/blog/hume-ai-pricing-free-tier-plans-and-costs-2026, https://bundlephobia.com/package/hume

### 10. Vapi Web SDK (Vapi)

Browser SDK (@vapi-ai/web, Daily WebRTC inside) calls Vapi hosted assistant using a public key; Vapi orchestrates third party STT, LLM, TTS.

Pros: Fast to prototype; Many provider choices.

Cons: Client tools are fire and forget; Slowest measured latency; Platform fee on top of providers.

Cost: $0.05/min platform fee plus STT about $0.01, LLM $0.008 to $0.045, voice $0.015 to $0.024; vendor estimate $82 to $129 per 1,000 minutes.

Sources: https://vapi.ai/pricing, https://docs.vapi.ai/tools/client-side-websdk, https://openbenchmarks.com/voice-agent-latency, https://bundlephobia.com/package/@vapi-ai/web

## Dropped

* Daily Bots: 
* Retell AI web call: 

Data file: `docs/research/voice-agents-2026-11.json`. Generated 2026-11-16.
