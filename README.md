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
- Eligible `initplayback` POST requests are handed directly to the Worker with their binary body.
- The Worker removes encrypted playback advertisements and returns the response to YouTube.

### Important Decisions

- Loon uses a native request rewrite instead of `$httpClient` to avoid buffering the complete playback response in a script callback.
- The Worker implementation and deployment remain shared with the Surge project.

### Recent Significant Changes

- `2026-09-10` — Replaced the buffered Loon Worker request with a native request handoff.

### Start Here

- `Rewrite/Youtube/YouTube.Enhance.plugin`
- `Rewrite/Youtube/youtube.request.js`
- `Rewrite/Youtube/youtube.response.js`
