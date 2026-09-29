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
- `Rewrite/Youtube/youtube.request.js` — telemetry request header cleanup.
- `Rewrite/Youtube/youtube.response.js` — protobuf response filtering and enhancements.
- `Rewrite/Youtube/youtube.navigation.response.js` — external-link playback advertisement cleanup.
- `Rewrite/Youtube/youtube.caption.js` — caption translation handling.

### Core Logic

- Response scripts cache the current YouTube playback encryption keys.
- External-link navigation responses have embedded ad placements, ad slots, and page-ad tracking removed locally.
- Loon Build 988+ validates, decrypts, filters, re-encrypts, and re-signs encrypted `initplayback` responses locally.
- Playback requests and media therefore stay on the same selected YouTube route; the Worker is used only for small translation payloads.

### Important Decisions

- Playback bodies are never uploaded to the Worker, avoiding callback buffering resets and Worker/media egress mismatches.
- HMAC verification is fail-open: any unknown, unauthenticated, or unsupported encrypted part remains byte-for-byte unchanged.
- Every modified AES-CTR part receives a new locally derived IV and a new HMAC-SHA256 signature.
- The translation Worker implementation and deployment remain shared with the Surge project.

### Recent Significant Changes

- `2026-09-29` — Moved encrypted `initplayback` processing into Loon Build 988+ and removed the playback Worker handoff.
- `2026-09-28` — Added local cleanup for advertisements embedded when external links open in YouTube.
- `2026-09-11` — Kept buffered HTTP/2 Worker requests but removed forced DIRECT routing to preserve YouTube Music playback.

### Start Here

- `Rewrite/Youtube/YouTube.Enhance.plugin`
- `Rewrite/Youtube/youtube.navigation.response.js`
- `Rewrite/Youtube/youtube.init.response.js`
- `Rewrite/Youtube/youtube.request.js`
- `Rewrite/Youtube/youtube.response.js`
