# UX mechanisms of gaming and media platforms

Research of 2026-11-16. Lists the user experience mechanisms that innovative gaming and media platforms depend on, mapped to the capability ids already in `data/web/`. Source of truth: the lake `cd-lake-prod` (run named `ux-mechanisms-2026-11-16`); this file and `ux-mechanisms.json` are the in-repo copy.

**122 mechanisms, 68 companies, 43 award or case study source rows.**

## Where the list lives

- Lake rows are the source of truth. Each mechanism is a `product_feature` entity (`product_feature:ux-<slug>`), each platform a `company` entity, linked by `uses_ux_mechanism` relations whose detail holds importance, API, atlas ids, source and date. Atlas links are `maps_to_atlas` relations to `dataset` style keyword entities `keyword:atlas-web-<id>`.
- No new lake attributes were created: attributes are a registry and adding one is a migration PR in `CUSTOM-DOMAIN-APP/customdomain-internal-workspace`, not an `api.*` call. If the atlas wants typed fields later (importance, atlas id), that PR is the follow up.
- A new atlas group under `data/web/` was not used: mechanisms are product experiences, not browser capabilities, so they would break the capability schema. They should link to capabilities, not live among them.

## Method

1. Company lists: top platforms per vertical plus winners of Apple Design Awards, Google Play Best of, Webby, Fast Company lists (see the source table in the JSON).
2. Per vertical, search for engineering blogs, MDN, web.dev and vendor docs; open the page where possible. `evidence` records `page_read` (opened), `search_snippet` (seen in results only) or `agent_recall` (memory, weakest).
3. Each mechanism is mapped to existing atlas ids by hand; `new` means no atlas entry fits; `partial` means related but not the same thing.

## Limits

- About half the rows rest on search snippets; Netflix TechBlog and Fast Company returned HTTP 403.
- `confidence`: confirmed means a source states it; documented means a vendor or MDN page describes it; inferred means deduced from product behavior.
- Platforms that ship native apps use OS APIs; web columns show what the browser equivalent is.

## Mechanisms

### creative-tools (16)

| Mechanism | Companies | Importance | API | Atlas | Source | Date | Confidence |
|---|---|---|---|---|---|---|---|
| Autosave and offline drafts | Figma, Canva, Descript | critical | IndexedDB, Service Worker, Page Lifecycle events, sendBeacon | web.storage.indexeddb, web.actions.service-worker-cache, web.timing.page-lifecycle-bfcache, web.actions.send-beacon (partial) | [link](https://www.liveblocks.io/blog/understanding-sync-engines-how-figma-linear-and-google-docs-work) | 2025 | documented |
| Drag and drop import of media | Canva, CapCut, Figma, Adobe Express | critical | HTML Drag and Drop, DataTransfer, File API | web.actions.drag-and-drop, web.files.drop-files | [link](https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API) | 2024 | documented |
| In browser video export | CapCut, Canva, Descript, Clipchamp | critical | WebCodecs, OffscreenCanvas, Web Workers, FFmpeg WASM | web.actions.webcodecs, web.actions.web-workers | [link](https://developer.chrome.com/articles/webcodecs) | 2021 | confirmed |
| GPU accelerated canvas rendering | Figma, Canva | critical | WebGPU, WebGL, OffscreenCanvas | web.ai.webgpu-compute, web.render.webgl, web.render.webgpu-features-limits (partial) | [link](https://www.figma.com/blog/figma-rendering-powered-by-webgpu/) | 2025-09-18 | confirmed |
| Multiplayer cursors and presence | Figma, Canva | critical | WebRTC data channels, WebSocket | web.actions.webrtc-data-channel, web.actions.websockets (partial) | [link](https://canva.dev/blog/engineering/realtime-mouse-pointers) | 2024-08-15 | confirmed |
| Pen pressure, tilt and coalesced input | Procreate-like web tools, Figma, Canva | critical | Pointer Events, getCoalescedEvents, pointerrawupdate | web.input.pointer-events | [link](https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent) | 2024 | confirmed |
| Real-time document sync (last writer wins registers) | Figma | critical | WebSocket, CRDT inspired data model | web.actions.websockets (partial) | [link](https://madebyevan.com/figma/how-figmas-multiplayer-technology-works/) | 2019-10-16 | confirmed |
| Edit audio and video by editing text | Descript, CapCut | critical | Speech to text service, Web Audio API, WebCodecs | web.actions.web-audio, web.actions.webcodecs | [link](https://elevenlabs.io/blog/descript) | 2024 | documented |
| Undo, redo and version history | Figma, Canva, Descript, CapCut | critical | Command pattern, IndexedDB, Keyboard events | web.input.keyboard-events, web.storage.indexeddb | [link](https://www.figma.com/blog/building-figmas-code-layers/) | 2024 | inferred |
| WebAssembly engine core | Figma, Descript | critical | WebAssembly, Web Workers | web.actions.webassembly, web.actions.web-workers | [link](https://www.figma.com/blog/figma-rendering-powered-by-webgpu/) | 2025-09-18 | confirmed |
| AI generation and enhancement panels | Canva, Adobe Express, Descript, Figma | helpful | fetch streaming, Prompt API, Writer API, Rewriter API | web.ai.prompt-api, web.ai.writer-api, web.ai.rewriter-api | [link](https://elevenlabs.io/blog/descript) | 2024 | documented |
| Auto generated editable captions | CapCut, Descript, Canva | helpful | Web Speech API, server ASR, Canvas text rendering | web.camera.speech-recognition (partial) | [link](https://www.capcut.com/help/how-to-recognise-subtitles) | 2024 | documented |
| Templates, brand kit and one click resize | Canva, Adobe Express | helpful | Design tokens, Canvas layout engine | new | [link](https://moda.app/blog/canva-vs-adobe-express) | 2025 | documented |
| Open and save real files from disk | Figma, Descript, Adobe Express | helpful | File System Access API, File Handling API | web.files.file-system-access-pickers, web.os.file-handling | [link](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API) | 2024 | documented |
| Installed font access | Figma, Canva, Adobe Express | helpful | Local Font Access API queryLocalFonts | web.input.local-fonts, web.device.installed-fonts | [link](https://developer.chrome.com/articles/local-fonts) | 2024 | documented |
| Rich clipboard copy and paste | Figma, Canva, Descript | helpful | Async Clipboard API, paste event, ClipboardItem | web.input.clipboard-read, web.input.clipboard-write, web.input.paste-event | [link](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API) | 2024 | documented |

### cross-cutting (19)

| Mechanism | Companies | Importance | API | Atlas | Source | Date | Confidence |
|---|---|---|---|---|---|---|---|
| Device capability and network detection | Netflix, YouTube, Tubi | critical | MediaCapabilities.decodingInfo, navigator.connection, Save-Data | web.device.media-capabilities, web.network.network-information, web.network.save-data-header, web.device.codec-support | [link](https://developer.mozilla.org/en-US/docs/Web/API/Media_Capabilities_API) | 2020 | confirmed |
| Passkey sign in | Spotify, YouTube, Pokemon TCG Pocket | critical | navigator.credentials.create, navigator.credentials.get, WebAuthn conditional UI | web.auth.passkeys, web.identity.webauthn-create, web.identity.webauthn-get | [link](https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API) | 2021 | confirmed |
| Payments and subscriptions | Taobao, Tiimo, HBO Max | critical | PaymentRequest, Digital Goods API, Payment Handler | web.payments.payment-request, web.payments.digital-goods, web.payments.google-pay, web.payments.apple-pay-js | [link](https://developer.mozilla.org/en-US/docs/Web/API/Payment_Request_API) | 2025 | documented |
| Push notifications for new content | YouTube, Twitch, StoryGraph | critical | Push API, Notifications API, Service Worker | web.notify.push-api, web.notify.notifications, web.notify.notification-triggers | [link](https://developer.mozilla.org/en-US/docs/Web/API/Push_API) | 2025 | confirmed |
| Low latency sync with WebTransport and WebSocket | Twitch, YouTube Live, Disney Speedstorm | critical | WebTransport, WebSocket, WebRTC data channel | web.actions.webtransport, web.actions.websockets, web.actions.webrtc-data-channel | [link](https://developer.mozilla.org/en-US/docs/Web/API/WebTransport_API) | 2026 | confirmed |
| Reduced motion and accessibility | HBO Max, Art of Fauna, Speechify | critical | prefers-reduced-motion, prefers-contrast, forced-colors | web.display.prefers-reduced-motion, web.display.prefers-contrast, web.display.forced-colors, web.locale.accessibility-inference | [link](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion) | 2025 | confirmed |
| Storage persistence and quota | Netflix, Goodnotes, Procreate Dreams | critical | navigator.storage.persist, navigator.storage.estimate | web.storage.persistent-storage, web.storage.persistence-eviction, web.device.storage-estimate, web.storage.storage-quota | [link](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API) | 2021 | confirmed |
| Screen wake lock during play | YouTube, Twitch, Explore POV | critical | navigator.wakeLock.request, WakeLockSentinel | web.display.wake-lock, web.notify.screen-wake-lock | [link](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API) | 2025 | confirmed |
| App badging | Spotify, SoundCloud | helpful | navigator.setAppBadge, navigator.clearAppBadge | web.notify.badging | [link](https://developer.mozilla.org/en-US/docs/Web/API/Badging_API) | 2025 | confirmed |
| Background fetch for downloads | Netflix, Wiser (15 Minute Audio Books), Tubi | helpful | BackgroundFetchManager, Service Worker | web.notify.background-fetch, web.notify.background-sync | [link](https://developer.mozilla.org/en-US/docs/Web/API/Background_Fetch_API) | 2025 | confirmed |
| Compute Pressure adaptation | Disney Speedstorm, Twitch, Detail | helpful | PressureObserver | web.compute.compute-pressure | [link](https://developer.mozilla.org/en-US/docs/Web/API/Compute_Pressure_API) | 2025 | confirmed |
| WebGPU and WebGL rendering | Infinity Nikki, Feather: Draw in 3D, Procreate Dreams | helpful | navigator.gpu, WebGL2RenderingContext | web.render.webgl, web.ai.webgpu-compute, web.render.webgpu-features-limits, web.device.webgpu-adapter | [link](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API) | 2025 | confirmed |
| Haptics and vibration feedback | PBJ: The Musical, Art of Fauna, Pokemon TCG Pocket | helpful | navigator.vibrate | web.actions.vibrate | [link](https://developer.mozilla.org/en-US/docs/Web/API/Vibration_API) | 2025 | documented |
| Screen orientation lock | DREDGE, Disney Speedstorm, YouTube | helpful | screen.orientation.lock, requestFullscreen | web.peripherals.screen-orientation-lock, web.display.screen-orientation, web.display.fullscreen | [link](https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation/lock) | 2025 | confirmed |
| Install as PWA | Spotify, Tubi, Strava | helpful | Web App Manifest, beforeinstallprompt, display-mode media query | web.os.install-prompt, web.display.display-mode, web.os.web-install-api | [link](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Installing) | 2025 | documented |
| View transitions between screens | Spotify, TikTok, Procreate Dreams | helpful | document.startViewTransition, @view-transition | web.actions.view-transitions | [link](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API) | 2025 | documented |
| Speech recognition voice search | Speechify, Be My Eyes, SoundCloud | helpful | SpeechRecognition, SpeechSynthesis | web.camera.speech-recognition, web.actions.speech-synthesis | [link](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API) | 2025 | documented |
| Web Share and share targets | Spotify, Edits (Instagram), TikTok | helpful | navigator.share, navigator.canShare, share_target manifest | web.os.web-share, web.os.web-share-target | [link](https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API) | 2025 | documented |
| WebXR immersive sessions | Explore POV, Porta Nubi, Taobao, Calm | helpful | navigator.xr, XRSession | web.peripherals.webxr-immersive, web.peripherals.webxr-hand-tracking, web.peripherals.webxr-world-sensing | [link](https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API) | 2025 | confirmed |

### games (23)

| Mechanism | Companies | Importance | API | Atlas | Source | Date | Confidence |
|---|---|---|---|---|---|---|---|
| Cloud game streaming over WebRTC | Xbox Cloud Gaming, GeForce NOW | critical | WebRTC, RTCPeerConnection, RTCDataChannel | web.actions.webrtc-data-channel (partial) | [link](https://developer.microsoft.com/en-us/games/articles/2025/03/gdc-2025-xbox-cloud-gaming-beta-expanding-your-reach-enhancing-your-game/) | 2025-03-21 | confirmed |
| Deep links into a game or server | Roblox, Discord, Steam | critical | custom URL protocol, universal links, launchData | web.os.protocol-handlers (partial) | [link](https://create.roblox.com/docs/production/promotion/deeplinking) | 2025 | documented |
| Embedded multiplayer activities in an iframe | Discord | critical | iframe, postMessage, Embedded App SDK | web.display.iframe-embedding (partial) | [link](https://docs.discord.com/developers/activities/overview) | 2026 | confirmed |
| Fullscreen immersive play | GeForce NOW, Xbox Cloud Gaming, itch.io, Roblox | critical | requestFullscreen, exitFullscreen, fullscreenchange | web.actions.fullscreen, web.display.fullscreen | [link](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API) | 2026-10-30 | confirmed |
| Gamepad input mapping and hot plug | Steam, Xbox Cloud Gaming, GeForce NOW, Epic Games Store | critical | Gamepad API, navigator.getGamepads, gamepadconnected | web.peripherals.gamepad, web.device.gamepad-presence | [link](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API) | 2026 | confirmed |
| Keyboard lock in fullscreen | GeForce NOW, Xbox Cloud Gaming | critical | navigator.keyboard.lock, Keyboard Map API | web.input.keyboard-lock, web.display.keyboard-lock | [link](https://developer.mozilla.org/en-US/docs/Web/API/Keyboard_API) | 2026-08-22 | confirmed |
| Pointer lock for mouse look | GeForce NOW, Xbox Cloud Gaming, itch.io | critical | requestPointerLock, movementX, movementY, pointerlockchange | web.input.pointer-lock | [link](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API) | 2025-09-18 | confirmed |
| Live presence and chat over WebSocket | Discord, Steam, Roblox | critical | WebSocket, message events | web.actions.websockets | [link](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket) | 2026 | documented |
| Keep screen awake during play | Xbox Cloud Gaming, GeForce NOW, Twitch, YouTube Live | critical | navigator.wakeLock.request, WakeLockSentinel | web.display.wake-lock, web.notify.screen-wake-lock | [link](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API) | 2026-11-12 | confirmed |
| Controller first spatial navigation | Steam, PlayStation, Xbox Cloud Gaming | critical | CSS Spatial Navigation, nav-up nav-down, focus management | new | [link](https://engineering.atspotify.com/2023/5/tv-spatial-navigation) | 2023-05 | documented |
| On screen touch controls for streamed games | Xbox Cloud Gaming, Steam | critical | Touch Events, Pointer Events, virtual gamepad overlay | web.input.touch-events, web.device.touch-support (partial) | [link](https://developer.microsoft.com/en-us/games/articles/2025/03/gdc-2025-xbox-cloud-gaming-beta-expanding-your-reach-enhancing-your-game/) | 2025-03-21 | confirmed |
| Achievement unlock toasts and progress | Steam, PlayStation, Xbox Cloud Gaming | helpful | Steamworks ISteamUserStats, in-app toast | new | [link](https://partner.steamgames.com/doc/features/achievements) | 2024 | documented |
| Supported browser and codec gating | GeForce NOW, Xbox Cloud Gaming | helpful | User-Agent Client Hints, MediaCapabilities | web.device.codec-support, web.device.media-capabilities (partial) | [link](https://www.nvidia.com/en-gb/geforce-now/system-reqs/) | 2026 | documented |
| Clip and highlight recording | Xbox Cloud Gaming, Steam, Twitch | helpful | MediaRecorder, dataavailable, Blob | web.camera.media-recorder | [link](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder) | 2026-10-07 | confirmed |
| Always on top mini window overlay | Discord, Twitch, YouTube Live | helpful | Document Picture-in-Picture, documentPictureInPicture.requestWindow | web.display.document-pip, web.camera.picture-in-picture | [link](https://developer.mozilla.org/en-US/docs/Web/API/Document_Picture-in-Picture_API) | 2026 | confirmed |
| Push notifications for friends and releases | Steam, Discord, Epic Games Store, Twitch | helpful | Notifications API, Push API, service worker | web.notify.notifications, web.notify.push-api | [link](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API) | 2026-05-25 | confirmed |
| Controller haptic feedback (rumble) | Xbox Cloud Gaming, GeForce NOW | helpful | GamepadHapticActuator, vibrationActuator, playEffect | web.peripherals.gamepad (partial) | [link](https://developer.mozilla.org/docs/Web/API/GamepadHapticActuator) | 2026 | documented |
| Embeddable HTML5 game frame with fullscreen button | itch.io | helpful | iframe allowfullscreen, Fullscreen API | web.display.iframe-embedding, web.display.fullscreen (partial) | [link](https://itch.io/updates/more-embed-options-for-html5-games) | 2019 | documented |
| Media keys and lock screen controls | Twitch, YouTube Live, Steam | helpful | Media Session API, MediaMetadata, setActionHandler | web.os.web-locks-media-session (partial) | [link](https://developer.mozilla.org/en-US/docs/Web/API/Media_Session_API) | 2024-08-07 | confirmed |
| Remote Play with Steam Input configs | Steam | helpful | Steam Input, Remote Play, ISteamRemotePlay | new | [link](https://partner.steamgames.com/doc/features/remoteplay) | 2024 | documented |
| Screen and tab capture for sharing | Discord, Steam, Xbox Cloud Gaming | helpful | getDisplayMedia, MediaStream | web.camera.display-capture | [link](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Capture_API) | 2026 | confirmed |
| Hardware decode with per frame control | Xbox Cloud Gaming, GeForce NOW, Twitch | helpful | WebCodecs, VideoDecoder, Web Workers | web.actions.webcodecs, web.device.codec-support | [link](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API) | 2026 | documented |
| Unreliable datagrams for real time state | Roblox, Xbox Cloud Gaming | helpful | WebTransport, datagrams, HTTP/3 | web.actions.webtransport | [link](https://developer.mozilla.org/en-US/docs/Web/API/WebTransport_API) | 2026 | documented |

### live-streaming (12)

| Mechanism | Companies | Importance | API | Atlas | Source | Date | Confidence |
|---|---|---|---|---|---|---|---|
| Real time channel events via EventSub | Twitch | critical | EventSub, WebSocket transport, Conduits | web.actions.websockets (partial) | [link](https://discuss.dev.twitch.tv/t/eventsub-websockets-are-now-available-in-open-beta/41639) | 2022 | documented |
| Adaptive bitrate tuned for low latency | Twitch, YouTube Live | critical | adaptive bitrate, MSE, Network Information API | web.network.network-information (partial) | [link](https://blog.twitch.tv/en/2020/01/15/twitch-invites-you-to-take-on-our-acm-mmsys-2020-grand-challenge) | 2020-01-15 | documented |
| Low latency HLS delivery | Twitch, YouTube Live, Kick | critical | LL-HLS, _HLS_msn, _HLS_part, Media Source Extensions | new | [link](https://developer.apple.com/documentation/http-live-streaming/enabling-low-latency-http-live-streaming-hls.md) | 2019 | documented |
| Adaptive playback through Media Source | Twitch, YouTube Live, Kick | critical | MediaSource, SourceBuffer, HTMLVideoElement | new | [link](https://developer.mozilla.org/en-US/docs/Web/API/Media_Source_Extensions_API) | 2026 | documented |
| Server streamed live chat | YouTube Live | critical | liveChatMessages.streamList, pageToken | web.actions.websockets (partial) | [link](https://developers.google.com/youtube/data/live/reference/rest/v3/liveChatMessages/streamList) | 2025-07-14 | confirmed |
| Channel predictions voting | Twitch, YouTube Live | helpful | Predictions API, channel:manage:predictions | new | [link](https://dev.twitch.tv/docs/api/reference/) | 2026 | inferred |
| Hype train engagement meter | Twitch | helpful | channel.hype_train.begin, channel.hype_train.progress, channel.hype_train.end | new | [link](https://dev.twitch.tv/docs/api/reference/) | 2026 | documented |
| Webhook events and unofficial chat socket | Kick | helpful | webhooks, Ed25519 signature, WebSocket | web.actions.websockets (partial) | [link](https://skills.sh/goncy/skills/kick-api) | 2026 | inferred |
| Client side multi rendition encoding | Twitch | helpful | Enhanced Broadcasting, AV1, multi-encode | new | [link](https://blog.twitch.tv/2024/01/08/introducing-the-enhanced-broadcasting-beta/) | 2024-01-08 | documented |
| Drops reward campaigns | Twitch | helpful | Drops entitlements, EventSub, Helix API | new | [link](https://dev.twitch.tv/docs/drops/technical-guide/) | 2026 | documented |
| Interactive extensions on the video player | Twitch | helpful | Extensions Helper, iframe, JWT | web.display.iframe-embedding (partial) | [link](https://dev.twitch.tv/docs/extensions/reference) | 2026 | confirmed |
| WebRTC ingest with WHIP | Twitch, YouTube Live, Kick | helpful | WHIP, RTCPeerConnection, SDP | web.actions.webrtc-data-channel (partial) | [link](https://www.rfc-editor.org/rfc/rfc9725) | 2025-03 | confirmed |

### music-audio (10)

| Mechanism | Companies | Importance | API | Atlas | Source | Date | Confidence |
|---|---|---|---|---|---|---|---|
| Background audio continuity | Spotify, Apple Music, Audible, Pocket Casts | critical | Page Visibility API, Media Session API, Web Audio API | web.actions.page-visibility-throttling, web.perf.page-visibility-focus, web.os.web-locks-media-session (partial) | [link](https://web.dev/articles/media-session) | 2023 | documented |
| Cross-device playback handoff (Connect) | Spotify, YouTube Music | critical | WebSocket, Remote Playback API, Web Playback SDK | web.actions.websockets, web.peripherals.remote-playback (partial) | [link](https://developer.spotify.com/documentation/commercial-hardware/implementation/guides/connect-basics) | 2024 | documented |
| Gapless playback and crossfade | Spotify, Apple Music, Tidal, Deezer | critical | Web Audio API, AudioParam, AudioBufferSourceNode | web.actions.web-audio, web.rendering.audio-base-latency (partial) | [link](https://web.dev/articles/webaudio-intro) | 2023 | documented |
| Lock screen and media key controls | Spotify, Apple Music, SoundCloud, Pocket Casts, Apple Podcasts | critical | Media Session API, MediaMetadata, setActionHandler | web.os.web-locks-media-session (partial) | [link](https://web.dev/articles/media-session) | 2023 | confirmed |
| Offline downloads of tracks and episodes | Spotify, Apple Music, Tidal, Deezer, Pocket Casts | critical | Service Worker, Cache API, OPFS, Background Fetch API | web.actions.service-worker-cache, web.storage.cache-storage, web.files.opfs, web.notify.background-fetch | [link](https://web.dev/pwa-with-offline-streaming) | 2021-07-05 | documented |
| Collaborative playlists | Spotify | helpful | WebSocket, CRDT or server ordering | web.actions.websockets (partial) | [link](https://newsroom.spotify.com/tag/collaborative-playlists) | 2024 | documented |
| Selectable lossless and hi-res quality tiers | Tidal, Deezer, Apple Music, Spotify | helpful | Media Capabilities API, MediaSource Extensions, Network Information API | web.device.media-capabilities, web.device.codec-support, web.network.network-information (partial) | [link](https://support.tidal.com/hc/en-us/articles/17412130162961-HiRes-FLAC-audio) | 2024 | documented |
| Name your price purchase and fan collection | Bandcamp | helpful | Payment Request API, Web Share API | web.payments.payment-request (partial) | [link](https://blog.bandcamp.com/2009/04/16/minimum-name-your-price-minimum-now-zero) | 2009-04-16 | documented |
| Time-synced and karaoke lyrics | Apple Music, Spotify | helpful | requestAnimationFrame, HTMLMediaElement timeupdate, Web Audio API | web.timing.request-animation-frame (partial) | [link](https://www.techradar.com/news/apple-music-sing) | 2022-12 | documented |
| Waveform with timed comments | SoundCloud | helpful | Canvas 2D, SVG, Pointer Events | web.render.canvas, web.input.pointer-events | [link](https://developers.soundcloud.com/blog/wave-raid) | 2014 | documented |

### reading-podcasts (8)

| Mechanism | Companies | Importance | API | Atlas | Source | Date | Confidence |
|---|---|---|---|---|---|---|---|
| Variable playback speed with pitch preservation | Pocket Casts, Apple Podcasts, Audible | critical | HTMLMediaElement playbackRate, preservesPitch | web.actions.web-audio (partial) | [link](https://support.pocketcasts.com/article/playback-effects/) | 2024 | confirmed |
| Reading and listening position sync across devices | Kindle, Audible, Apple Podcasts, Pocket Casts | critical | fetch, IndexedDB, BroadcastChannel, Page Lifecycle events | web.storage.indexeddb, web.storage.broadcastchannel, web.timing.page-lifecycle-bfcache, web.actions.send-beacon (partial) | [link](https://www.guidingtech.com/fix-kindle-books-not-syncing-between-devices/) | 2024 | documented |
| Chapters, bookmarks and audio clips | Audible, Apple Podcasts, Pocket Casts | helpful | Media Session seek actions, WebVTT chapters | web.os.web-locks-media-session | [link](https://forums.pocketcasts.com/forums/topic/end-of-chapter-option-for-sleep-timer) | 2024 | inferred |
| Background episode downloads and auto download | Pocket Casts, Apple Podcasts | helpful | Background Fetch API, Periodic Background Sync, Push API | web.notify.background-fetch, web.notify.periodic-background-sync, web.notify.push-api | [link](https://developer.mozilla.org/en-US/docs/Web/API/Background_Fetch_API) | 2024 | documented |
| Silence trimming and volume boost | Pocket Casts, Overcast | helpful | Web Audio API, AudioWorklet, DynamicsCompressorNode | web.actions.web-audio (partial) | [link](https://support.pocketcasts.com/article/playback-effects/) | 2024 | confirmed |
| Sleep timer with end of episode option | Apple Podcasts, Pocket Casts, Audible | helpful | setTimeout, Media Session API, Screen Wake Lock | web.notify.screen-wake-lock, web.os.web-locks-media-session | [link](https://support.pocketcasts.com/article/sleep-timer/) | 2024 | documented |
| Text selection highlights and shared quotes | Medium, Kindle, Substack | helpful | Selection API, Range, Text Fragments, Clipboard API | web.input.selection, web.actions.text-fragments, web.input.clipboard-write (partial) | [link](https://blog.medium.com/is-it-ok-to-highlight-your-own-stuff-fd3768dace9a) | 2015 | documented |
| Text to speech and voiceover for articles | Substack, Medium, Audible | helpful | Web Speech API speechSynthesis, MediaRecorder | web.actions.speech-synthesis, web.camera.media-recorder | [link](https://on.substack.com/p/new-ways-to-listen-to-your-favorite) | 2022 | documented |

### short-form (13)

| Mechanism | Companies | Importance | API | Atlas | Source | Date | Confidence |
|---|---|---|---|---|---|---|---|
| Real time AR lenses on the camera feed | Snapchat, TikTok, Instagram Reels | critical | getUserMedia, WebAssembly, WebGL, Camera Kit | web.camera.camera, web.actions.webassembly, web.render.webgl (partial) | [link](https://developers.snap.com/reference/CameraKit/web/1.21.0/index.html) | 2024 | documented |
| Duet and Stitch reaction recording | TikTok | critical | getUserMedia, MediaRecorder, WebCodecs | web.camera.camera, web.camera.microphone, web.camera.media-recorder (partial) | [link](https://www.shopify.com/blog/how-to-stitch-on-tiktok) | 2024 | documented |
| First chunk prefetch of upcoming videos | TikTok, Douyin, Kuaishou | critical | HTTP range requests, fetch priority | web.actions.speculation-rules (partial) | [link](https://www.theregister.com/2025/09/23/short_video_prefetch_research/) | 2025-09-23 | documented |
| For You feed ranked on interaction signals | TikTok | critical | recommendation service | new | [link](https://newsroom.tiktok.com/en-us/how-tiktok-recommends-videos-for-you/) | 2023-11-01 | documented |
| Remix tools: green screen, cut and collab | YouTube Shorts | critical | getUserMedia, MediaRecorder, canvas compositing | web.camera.camera, web.camera.media-recorder (partial) | [link](https://support.google.com/youtube/answer/10623810) | 2024 | confirmed |
| Sound off by default, tap to unmute | TikTok, Instagram Reels, YouTube Shorts, Snapchat | critical | autoplay policy, video.muted, user activation | web.actions.autoplay | [link](https://developer.chrome.com/blog/autoplay) | 2018 | confirmed |
| Vertical swipe feed with adjacent video preload | Instagram Reels, TikTok, YouTube Shorts | critical | Media3 PreloadManager, ExoPlayer, scroll snap | new | [link](https://android-developers.googleblog.com/2026/03/instagram-and-facebook-deliver-instant.html) | 2026-03-05 | confirmed |
| Preloading paused under CPU or I/O pressure | Instagram Reels, Facebook Reels | helpful | Compute Pressure | web.perf.compute-pressure (partial) | [link](https://android-developers.googleblog.com/2026/03/instagram-and-facebook-deliver-instant.html) | 2026-03-05 | documented |
| Prefetch depth tied to connection quality and data saver | TikTok, Instagram Reels, YouTube Shorts | helpful | Network Information, Save-Data | web.network.network-information, web.network.save-data-header, web.display.prefers-reduced-data | [link](https://www.techinterview.org/post/3233474985/design-tiktok-video-feed-mobile/) | 2025 | inferred |
| Creator controls over who can duet, stitch or remix | TikTok, YouTube Shorts | helpful | account settings | new | [link](https://www.shopify.com/blog/how-to-stitch-on-tiktok) | 2024 | documented |
| Shorts feed ranked on viewed versus swiped away | YouTube Shorts | helpful | recommendation service | new | [link](https://support.google.com/youtube/answer/16089387) | 2025 | documented |
| One player instance serving many preloaded clips | Instagram Reels, TikTok | helpful | Media3 PreloadManager, MediaSource | new | [link](https://android-developers.googleblog.com/2026/03/instagram-and-facebook-deliver-instant.html) | 2026-03-05 | confirmed |
| Trial Reels shown to non-followers first | Instagram Reels | helpful | experimentation service | new | [link](https://www.tubefilter.com/2024/12/12/instagram-trial-reels-for-creator-a-b-tests/amp/) | 2024-12-12 | documented |

### video-streaming (21)

| Mechanism | Companies | Importance | API | Atlas | Source | Date | Confidence |
|---|---|---|---|---|---|---|---|
| Adaptive bitrate streaming over Media Source Extensions | Netflix, YouTube, Disney+, Max, Prime Video | critical | MSE, DASH, HLS, ManagedMediaSource | new | [link](https://developer.mozilla.org/en-US/docs/Web/API/Media_Source_Extensions_API) | 2025 | documented |
| Caption and subtitle tracks with user styling | Netflix, YouTube, Disney+, Max, Prime Video, Apple TV+ | critical | WebVTT, TextTrack, ::cue | new | [link](https://developer.mozilla.org/docs/Web/API/WebVTT_API) | 2025 | documented |
| Codec, HDR and hardware capability negotiation | Netflix, Disney+, Max, Prime Video, Apple TV+ | critical | MediaCapabilities, canPlayType, matchMedia dynamic-range | web.device.media-capabilities, web.device.codec-support, web.display.dynamic-range, web.display.color-gamut | [link](https://helgeklein.com/blog/browser-video-codecs-formats-hardware-acceleration/) | 2024 | inferred |
| DRM via Encrypted Media Extensions | Netflix, Disney+, Max, Prime Video, Apple TV+ | critical | EME, MediaKeys, Widevine, FairPlay, PlayReady | new | [link](https://web.dev/articles/eme-basics) | 2014 | confirmed |
| Lock screen and notification media controls | YouTube, Netflix, Disney+, Max, Prime Video, Apple TV+ | critical | navigator.mediaSession, MediaMetadata, setActionHandler | web.os.web-locks-media-session | [link](https://web.dev/articles/media-session) | 2019 | confirmed |
| Muted autoplay previews on hover and in rows | Netflix, Disney+, Max, Prime Video, Apple TV+, YouTube | critical | autoplay attribute, muted, playsinline, HTMLMediaElement.play | web.actions.autoplay | [link](https://developer.chrome.com/blog/autoplay) | 2018 | confirmed |
| Offline downloads with expiry licenses | Netflix, Disney+, Max, Prime Video, Apple TV+, YouTube | critical | Background Fetch, StorageManager.persist, OPFS, EME persistent-license | web.notify.background-fetch, web.storage.persistent-storage, web.storage.opfs, web.storage.cache-storage (partial) | [link](https://help.netflix.com/en/node/119204) | 2021 | documented |
| Personalized home and up next recommendations | YouTube, Netflix | critical | recommendation service | new | [link](https://support.google.com/youtube/answer/16089387) | 2025 | documented |
| Cast to a TV with Remote Playback | YouTube, Netflix, Disney+, Max, Prime Video | critical | RemotePlayback, watchAvailability, prompt | web.peripherals.remote-playback | [link](https://developer.mozilla.org/en-US/docs/Web/API/Remote_Playback_API) | 2025 | confirmed |
| Skip intro and skip recap button | Netflix, Disney+, Max, Prime Video, Apple TV+ | critical | timed metadata, overlay UI | new | [link](https://www.tvbeurope.com/media-consumption/netflixs-skip-intro-button-is-pressed-136-million-times-a-day) | 2019 | documented |
| Automatic downloads of next episode and recommendations | Netflix | helpful | Periodic Background Sync, Background Fetch, Network Information | web.notify.periodic-background-sync, web.notify.background-fetch, web.network.network-information (partial) | [link](https://about.netflix.com/news/downloads-for-you-takes-on-the-go-to-the-next-level) | 2021 | documented |
| Google Cast sender and Presentation API sessions | YouTube, Netflix, Max | helpful | Cast Web Sender, Presentation API | web.peripherals.presentation-api (partial) | [link](https://developers.google.com/cast/docs/web_sender/integrate) | 2024 | documented |
| Document Picture in Picture for custom player UI | YouTube, Netflix | helpful | documentPictureInPicture.requestWindow | web.display.document-pip | [link](https://developer.chrome.com/docs/web-platform/document-picture-in-picture) | 2024 | confirmed |
| Live origin plus ISP embedded CDN delivery | Netflix | helpful | Open Connect, nginx proxy cache | new | [link](https://www.infoq.com/news/2025/12/netflix-live-streaming-pipeline) | 2025 | documented |
| Low latency live streaming with partial segments | Apple TV+, Netflix, Prime Video, YouTube | helpful | LL-HLS, EXT-X-SERVER-CONTROL, CMAF | new | [link](https://developer.apple.com/documentation/http-live-streaming/enabling-low-latency-http-live-streaming-hls) | 2019 | documented |
| Per-title and per-shot encoding ladders | Netflix | helpful | VMAF, HEVC, VP9, AV1 | new | [link](https://streamingmedia.com/Articles/Editorial/Featured-Articles/How-Netflix-Pioneered-Per-Title-Video-Encoding-Optimization-108547.aspx) | 2018 | documented |
| Personalized title artwork via contextual bandits | Netflix | helpful | contextual bandits, image CDN | new | [link](https://netflixtechblog.com/artwork-personalization-c589f074ad76) | 2017 | documented |
| Picture in Picture video window | YouTube, Netflix, Disney+, Max, Prime Video, Apple TV+ | helpful | requestPictureInPicture, enterpictureinpicture, Media Session | web.camera.picture-in-picture, web.display.picture-in-picture | [link](https://web.dev/patterns/media/picture-in-picture) | 2021 | documented |
| Watch together sessions (SharePlay, group watch) | Disney+, Apple TV+, Max | helpful | GroupActivities, SharePlay, WebSocket sync | new | [link](https://appleinsider.com/articles/21/12/15/disney-adds-support-for-shareplay-on-iphone-ipad-and-apple-tv) | 2021 | documented |
| Hardware decoded video via WebCodecs | YouTube, Netflix | helpful | VideoDecoder, hardwareAcceleration, isConfigSupported | web.actions.webcodecs | [link](https://developer.mozilla.org/Web/API/WebCodecs_API) | 2025 | documented |
| X-Ray cast, music and trivia overlay on pause | Prime Video | helpful | timed metadata, overlay UI | new | [link](https://www.aboutamazon.com/news/entertainment/what-is-x-ray-on-prime-video) | 2024 | documented |

## Award and case study sources

| Vertical | Company | Why innovative | Source | Date |
|---|---|---|---|---|
| creative tools | Adobe Frame.io V4 | Webby 2025 win for Creative Production, Software Services and Platforms | [link](https://www.webbyawards.com/press/press-releases/29th-annual-webby-awards-announce-2025-winners/) | 2025-04-22 |
| creative tools | Feather: Draw in 3D (Sketchsoft) | Turns 2D drawings into 3D with touch and Apple Pencil; ADA Visuals and Graphics | [link](https://www.apple.com/newsroom/2025/06/apple-unveils-winners-and-finalists-of-the-2025-apple-design-awards/) | 2025-06-03 |
| creative tools | Goodnotes | Google Play Best for Large Screens 2025 | [link](https://blog.google/products-and-platforms/platforms/google-play/best-apps-games-2025/) | 2025-11-18 |
| creative tools | Luminar: Photo Editor | AI tools for beginners and pros on any device; Google Play Best Multi-device App | [link](https://blog.google/products-and-platforms/platforms/google-play/best-apps-games-2025/) | 2025-11-18 |
| creative tools | Play (Rabbit 3 Times) | Interactive SwiftUI prototypes syncing in real time Mac to iPhone; ADA Innovation | [link](https://www.apple.com/newsroom/2025/06/apple-unveils-winners-and-finalists-of-the-2025-apple-design-awards/) | 2025-06-03 |
| creative tools | Procreate Dreams | 2D animation app; 2024 Apple Design Award for Innovation | [link](https://bgr.com/tech/2024-apple-design-awards-winners-announced-procreate-dreams-gentler-streak-more/) | 2024-06-06 |
| games | Art of Fauna (Klemens Strasser) | Puzzle game with full VoiceOver and haptic feedback; Apple Design Award for Inclusivity | [link](https://www.apple.com/newsroom/2025/06/apple-unveils-winners-and-finalists-of-the-2025-apple-design-awards/) | 2025-06-03 |
| games | Balatro (LocalThunk) | Poker hands plus joker cards as a roguelike deckbuilder; Apple Design Award for Delight and Fun | [link](https://www.apple.com/newsroom/2025/06/apple-unveils-winners-and-finalists-of-the-2025-apple-design-awards/) | 2025-06-03 |
| games | Chants of Sennaar (Playdigious) | Thought provoking adventure about the power of language; Apple Cultural Impact and Google Play Best Indie | [link](https://www.apple.com/newsroom/2025/12/apple-unveils-the-winners-of-the-2025-app-store-awards/) | 2025-12-04 |
| games | DREDGE (Black Salt Games) | Smooth controls across iPhone, iPad and Mac; Apple Design Award for Interaction | [link](https://www.apple.com/newsroom/2025/06/apple-unveils-winners-and-finalists-of-the-2025-apple-design-awards/) | 2025-06-03 |
| games | Disney Speedstorm | Optimized for play across PC, tablet and mobile; Google Play Best Multi-device Game | [link](https://blog.google/products-and-platforms/platforms/google-play/best-apps-games-2025/) | 2025-11-18 |
| games | Infinity Nikki (Infold Games) | Open world praised for color, detail and rendering; Apple Design Award for Visuals and Graphics | [link](https://www.apple.com/newsroom/2025/06/apple-unveils-winners-and-finalists-of-the-2025-apple-design-awards/) | 2025-06-03 |
| games | Lost in Play (Happy Juice Games) | Hand drawn point and tap adventure; 2024 Apple Design Award for Innovation | [link](https://bgr.com/tech/2024-apple-design-awards-winners-announced-procreate-dreams-gentler-streak-more/) | 2024-06-06 |
| games | PBJ: The Musical (Philipp Stollenmayer) | Rhythm game that uses haptics and soundtrack; Apple Design Award for Innovation | [link](https://www.apple.com/newsroom/2025/06/apple-unveils-winners-and-finalists-of-the-2025-apple-design-awards/) | 2025-06-03 |
| games | Pokemon TCG Pocket (The Pokemon Company) | Tactile booster pack opening and phone friendly card battles; iPhone Game of the Year and Google Play Best Game | [link](https://www.apple.com/newsroom/2025/12/apple-unveils-the-winners-of-the-2025-app-store-awards/) | 2025-12-04 |
| games | Porta Nubi (Michael Temper) | Transforms the player's surroundings into atmospheric puzzles; Apple Vision Pro Game of the Year | [link](https://www.apple.com/newsroom/2025/12/apple-unveils-the-winners-of-the-2025-app-store-awards/) | 2025-12-04 |
| games | Roblox | Named to Fast Company gaming lists in 2022 and 2024 | [link](https://www.fastcompany.com/91039670/gaming-most-innovative-companies-2024) | 2024 |
| live streaming | Twitch | Vertical live format, dual format streaming and TikTok style Discovery Feed announced at TwitchCon | [link](https://www.lindseygamble.com/blog/twitch-announces-dual-format-streaming-clip-recommendations-and-more-at-twitchcon-rotterdam) | 2025 |
| live streaming | YouTube Live | Playables mini games in Live and a practice mode, announced at Made on YouTube 2025 | [link](https://www.aol.com/articles/youtube-live-gets-twitch-tiktok-224611441.html) | 2025 |
| music | Music AI (Moises) | 50 plus AI audio models power stem separation for practice; Fast Company music list 2025 and ADA Innovation finalist | [link](https://www.hypebot.com/hypebot/2025/03/fast-company-names-10-most-innovative-music-companies-2025.html) | 2025-03-18 |
| music | SoundCloud | AI powered First Fans recommendations; on Fast Company music list 2025; Google Play Best for Cars | [link](https://www.hypebot.com/hypebot/2025/03/fast-company-names-10-most-innovative-music-companies-2025.html) | 2025-03-18 |
| music | Spotify | 10 Years of Wrapped won two 2025 Webby People's Voice awards (Best User Experience, Best Data Visualization) | [link](https://winners.webbyawards.com/2025/websites-and-mobile-sites/features-design/best-user-experience/338531/10-years-of-wrapped) | 2025 |
| music | Tone | Turns label payment data into artist earnings insights; Fast Company music list 2025 | [link](https://www.hypebot.com/hypebot/2025/03/fast-company-names-10-most-innovative-music-companies-2025.html) | 2025-03-18 |
| music | djay pro (Algoriddim) | Spatial computing winner at 2024 Apple Design Awards | [link](https://www.apple.com/in/newsroom/2024/06/apple-announces-winners-of-the-2024-apple-design-awards/) | 2024-06-06 |
| music | pgLang | No. 1 on Fast Company music list 2025 for creative company work and video | [link](https://www.hypebot.com/hypebot/2025/03/fast-company-names-10-most-innovative-music-companies-2025.html) | 2025-03-18 |
| reading and podcasts | Ground News (Snapwise) | Apple Design Awards 2025 finalist, Social Impact | [link](https://www.apple.com/newsroom/2025/06/apple-unveils-winners-and-finalists-of-the-2025-apple-design-awards/) | 2025-06-03 |
| reading and podcasts | Speechify | Text to audio with hundreds of voices in 50 plus languages; Apple Design Award for Inclusivity | [link](https://www.apple.com/newsroom/2025/06/apple-unveils-winners-and-finalists-of-the-2025-apple-design-awards/) | 2025-06-03 |
| reading and podcasts | StoryGraph | Inclusive book community; Apple Cultural Impact award | [link](https://www.apple.com/newsroom/2025/12/apple-unveils-the-winners-of-the-2025-app-store-awards/) | 2025-12-04 |
| reading and podcasts | The New York Times app and NYT Games | Redesigned NYT app won Fast Company Innovation by Design 2025; NYT Games won 2024 ADA Delight and Fun | [link](https://www.fastcompany.com/innovation-by-design/2025) | 2025 |
| reading and podcasts | Wiser (15 Minute Audio Books) | Google Play Best Everyday Essential 2025 | [link](https://blog.google/products-and-platforms/platforms/google-play/best-apps-games-2025/) | 2025-11-18 |
| short-form video | Edits (Instagram) | Google Play Best for Fun 2025 for short video creation | [link](https://blog.google/products-and-platforms/platforms/google-play/best-apps-games-2025/) | 2025-11-18 |
| short-form video | TikTok | Vertical snap paged feed, preloading adjacent clips and swipe to next video analyzed in UX teardowns | [link](https://raw.studio/blog/how-tiktok-uses-3-algorithm-driven-ux-systems-to-maximize-engagement/) | 2025 |
| short-form video | Xiaohongshu (Little Red Book) | UX Collective case study of the feed design that competes with TikTok | [link](https://uxdesign.cc/analyzing-tiktoks-biggest-competitor-s-ux-4728dca0f844) | 2024 |
| video | Detail (Detail Technologies) | AI video editing tools for beginners and pros; iPad App of the Year | [link](https://www.apple.com/newsroom/2025/12/apple-unveils-the-winners-of-the-2025-app-store-awards/) | 2025-12-04 |
| video | Explore POV (James Hustler) | Apple Immersive Video travel on Vision Pro; Vision Pro App of the Year | [link](https://www.apple.com/newsroom/2025/12/apple-unveils-the-winners-of-the-2025-app-store-awards/) | 2025-12-04 |
| video | HBO Max | Apple TV App of the Year for inclusive streaming including American Sign Language additions | [link](https://www.apple.com/newsroom/2025/12/apple-unveils-the-winners-of-the-2025-app-store-awards/) | 2025-12-04 |
| video | Netflix | Appears on Fast Company film and television most innovative list 2025 | [link](https://www.fastcompany.com/91271138/youtube-most-innovative-companies-2025) | 2025-03 |
| video | Taobao | Immersive shopping video and 3D models on Vision Pro; Apple Design Award for Interaction | [link](https://www.apple.com/newsroom/2025/06/apple-unveils-winners-and-finalists-of-the-2025-apple-design-awards/) | 2025-06-03 |
| video | Tubi | Ranked No. 33 on Fast Company World's 50 Most Innovative Companies 2025 and on its video list | [link](https://www.fastcompany.com/91271134/tubi-most-innovative-companies-2025) | 2025-03 |
| video | YouTube | Named to Fast Company 10 most innovative companies in video 2025 and No. 11 overall; creator tools for TV screens | [link](https://www.fastcompany.com/91270234/video-most-innovative-companies-2025) | 2025-03 |
| wellness and focus | Focus Friend (Hank Green) | Gamifies focus sessions; Google Play Best App and Apple Cultural Impact | [link](https://www.apple.com/newsroom/2025/12/apple-unveils-the-winners-of-the-2025-app-store-awards/) | 2025-12-04 |
| wellness and focus | Strava | Community and real time segment tracking; Apple Watch App of the Year | [link](https://www.apple.com/newsroom/2025/12/apple-unveils-the-winners-of-the-2025-app-store-awards/) | 2025-12-04 |
| wellness and focus | Tiimo | Visual planner with AI; iPhone App of the Year 2025 | [link](https://www.apple.com/newsroom/2025/12/apple-unveils-the-winners-of-the-2025-app-store-awards/) | 2025-12-04 |
