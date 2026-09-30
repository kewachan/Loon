# Loon

## Codex Project Context

### Purpose

- Provide Loon plugins for YouTube and YouTube Music enhancements.

### Architecture

- YouTube app -> Loon request/response scripts -> YouTube API.
- Caption and lyrics text -> translation Worker only when translation is enabled.

### Key Files

- `Rewrite/Youtube/YouTube.Enhance.plugin` — Loon plugin configuration.
- `Rewrite/Youtube/youtube.init.response.js` — local encrypted playback response transformation.
- `Rewrite/Youtube/youtube.request.js` — binary config capture, playback key ring, and bounded preflight recovery.
- `Rewrite/Youtube/youtube.response.js` — protobuf response filtering and enhancements.
- `Rewrite/Youtube/youtube.navigation.response.js` — external-link playback advertisement cleanup.
- `Rewrite/Youtube/youtube.caption.js` — caption translation handling.

### Core Logic

- Config/log_event responses are parsed as raw protobuf fields; unrelated binary fields cannot abort key capture. Each app keeps up to eight expiring playback keys.
- An unknown `/next` hot hash triggers a same-route `/config` preflight using only request context (3-second timeout, 10-second cooldown). The resulting global config is handed to the app in the normal Next response context.
- External-link navigation responses have embedded ad placements, ad slots, and page-ad tracking removed locally.
- Loon Build 988+ selects the request's cached encryptKey, authenticates candidates with HMAC, and filters Player/Next ads inside encrypted `initplayback` without discarding concurrent keys.
- No playback routing override is installed: the user's configuration must route API and media consistently. The Worker is used only for small translation payloads.

### Important Decisions

- Playback bodies are never uploaded to the Worker, avoiding callback buffering resets and Worker/media egress mismatches.
- HMAC verification is fail-open: any unknown, unauthenticated, or unsupported encrypted part remains byte-for-byte unchanged.
- A missing key requests a refresh but never clears the ring. Failed preflight preserves normal playback; no `/player` fallback or synthetic success response is generated.
- Do not force Music media DIRECT while its API uses a proxy. Upstream non-OK player responses remain unchanged.
- Account headers are forwarded only to the original YouTube API and are never persisted. The hot-config handoff still needs real-device confirmation after updates.
- Every modified AES-CTR part receives a new locally derived IV and a new HMAC-SHA256 signature.
- The translation Worker implementation and deployment remain shared with the Surge project.

### Recent Significant Changes

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
