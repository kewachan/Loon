# Loon

## Codex Project Context

### Purpose

- Provide Loon plugins for YouTube and YouTube Music enhancements.

### Architecture

- YouTube app -> Loon request/response scripts -> YouTube API or playback Worker.

### Key Files

- `Rewrite/Youtube/YouTube.Enhance.plugin` — Loon plugin configuration.
- `Rewrite/Youtube/youtube.request.js` — playback request handoff and key handling.
- `Rewrite/Youtube/youtube.response.js` — protobuf response filtering and enhancements.
- `Rewrite/Youtube/youtube.caption.js` — caption translation handling.

### Core Logic

- Response scripts cache the current YouTube playback encryption keys.
- Eligible `initplayback` POST requests are sent to the Worker over a dedicated binary HTTP/2 connection that follows the active routing policy.
- The Worker removes encrypted playback advertisements before Loon returns a sanitized response to YouTube.

### Important Decisions

- Loon keeps `$httpClient` because native cross-host rewrites can reset large binary playback responses.
- Worker requests retain the current YouTube route because Music playback responses can be bound to the original proxy egress.
- HTTP/2 remains enabled to reduce callback buffering delay.
- The Worker implementation and deployment remain shared with the Surge project.

### Recent Significant Changes

- `2026-09-11` — Kept buffered HTTP/2 Worker requests but removed forced DIRECT routing to preserve YouTube Music playback.

### Start Here

- `Rewrite/Youtube/YouTube.Enhance.plugin`
- `Rewrite/Youtube/youtube.request.js`
- `Rewrite/Youtube/youtube.response.js`
