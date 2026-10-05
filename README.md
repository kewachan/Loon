# Loon

## Codex Project Context

### Purpose

- Provide Loon plugins for YouTube and YouTube Music enhancements.

### Architecture

- YouTube app -> Loon request/response scripts -> YouTube API.
- Caption text -> Google Translate public endpoint; lyrics text -> private Bearer token -> dedicated `youtube-lyrics-translate` Worker -> Cache API -> Workers AI, only when translation is enabled.

### Key Files

- `Rewrite/Youtube/YouTube.Enhance.plugin` — Loon plugin configuration.
- `Rewrite/Youtube/youtube.init.response.js` — local encrypted playback response transformation.
- `Rewrite/Youtube/youtube.request.js` — binary config capture, playback key ring, and bounded preflight recovery.
- `Rewrite/Youtube/youtube.response.js` — protobuf response filtering and enhancements.
- `Rewrite/Youtube/youtube.navigation.response.js` — external-link playback advertisement cleanup.
- `Rewrite/Youtube/youtube.caption.js` — caption translation handling.
- `Rewrite/Youtube/youtube.lyrics.js` — deadline-bounded lyric batching, provider fallback, and local cache handling.

### Core Logic

- Config/log_event responses are parsed as raw protobuf fields; unrelated binary fields cannot abort key capture. Each app keeps up to eight expiring playback keys.
- An unknown `/next` hot hash triggers a same-route `/config` preflight using only request context (3-second timeout, 10-second cooldown). The resulting global config is handed to the app in the normal Next response context.
- External-link navigation responses have embedded ad placements, ad slots, and page-ad tracking removed locally.
- Loon Build 988+ selects the request's cached encryptKey, authenticates candidates with HMAC, and filters Player/Next ads inside encrypted `initplayback` without discarding concurrent keys.
- Captions are translated in parallel batches within the client's short response deadline and cached locally for 7 days. Lyrics use logical client batches of at most 12 lines or 600 characters; the shared Worker splits them into parallel AI requests of at most 4 lines or 180 characters while giving every sub-request the complete logical batch as translation context.
- The lyrics Worker applies the user-selected target language and writing system per line. Exact matches are returned unchanged, the client neither duplicates them nor adds an attribution, and `zh-Hant`／`zh-Hans` still convert between scripts.
- No playback routing override is installed: the user's configuration must route API and media consistently. Google Translate and the dedicated lyrics translation Worker are explicitly DIRECT.

### Important Decisions

- Playback bodies are never uploaded to the Worker, avoiding callback buffering resets and Worker/media egress mismatches.
- HMAC verification is fail-open: any unknown, unauthenticated, or unsupported encrypted part remains byte-for-byte unchanged.
- A missing key requests a refresh but never clears the ring. Failed preflight preserves normal playback; no `/player` fallback or synthetic success response is generated.
- Do not force Music media DIRECT while its API uses a proxy. Upstream non-OK player responses remain unchanged.
- Account headers are forwarded only to the original YouTube API and are never persisted. The hot-config handoff still needs real-device confirmation after updates.
- Every modified AES-CTR part receives a new locally derived IV and a new HMAC-SHA256 signature.
- The `youtube-lyrics-translate` implementation and deployment remain shared with the Surge project; captions bypass it. The media Worker has no AI binding or translation route, and the lyrics Worker does not use Durable Objects or proactive translation.
- The shared lyrics access token exists only as a Cloudflare Secret. The public plugin contains no valid token; each authorized user enters it locally.

### Recent Significant Changes

- `2026-10-05` — Made same-language lyric handling follow the exact language／script／locale in `lyricsLang`, preserved Simplified／Traditional conversion, suppressed duplicate unchanged lines, and invalidated target-unaware caches.
- `2026-10-03` — Restored 12-line／600-character logical lyric batches while keeping 4-line／180-character Worker splitting, added full-batch context to every AI sub-request, and reset lyric cache versions so context-free results are not reused; invalid single-line AI output retries once, then returns promptly for device-side Google fallback.
- `2026-10-01` — Added private Bearer-token authentication for lyric translation; unauthorized requests are rejected before Workers AI runs.
- `2026-10-01` — Moved captions back to deadline-bounded Google Translate batches; renamed the lyrics Worker to `youtube-lyrics-translate`, upgraded its model, split it from the media source, and removed the obsolete caption Worker/AI path.
- `2026-09-30` — Switched captions and lyrics to the dedicated cached translation Worker and routed that Worker DIRECT; playback processing remains local.
- `2026-09-30` — Replayed five Loon captures; fixed raw config parsing, concurrent key rotation, startup preflight, and removed the media-only DIRECT override.
- `2026-09-29` — Moved encrypted `initplayback` processing into Loon Build 988+ and removed the playback Worker handoff.
- `2026-09-28` — Added local cleanup for advertisements embedded when external links open in YouTube.
- `2026-09-11` — Kept buffered HTTP/2 Worker requests but removed forced DIRECT routing to preserve YouTube Music playback.

### Start Here

- `Rewrite/Youtube/YouTube.Enhance.plugin`
- `Rewrite/Youtube/youtube.navigation.response.js`
- `Rewrite/Youtube/youtube.init.response.js`
- `Rewrite/Youtube/youtube.request.js`
- `Rewrite/Youtube/youtube.response.js`
