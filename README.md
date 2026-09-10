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
- Eligible `initplayback` POST requests are sent to the Worker over a dedicated DIRECT HTTP/2 connection.
- The Worker removes encrypted playback advertisements before Loon returns a sanitized response to YouTube.

### Important Decisions

- Loon keeps `$httpClient` because native cross-host rewrites can reset large binary playback responses.
- Worker requests use DIRECT and HTTP/2 to reduce the callback buffering delay.
- The Worker implementation and deployment remain shared with the Surge project.

### Recent Significant Changes

- `2026-09-11` — Restored the buffered Worker request with DIRECT HTTP/2 after native handoff caused stream resets.

### Start Here

- `Rewrite/Youtube/YouTube.Enhance.plugin`
- `Rewrite/Youtube/youtube.request.js`
- `Rewrite/Youtube/youtube.response.js`
