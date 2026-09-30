// Loon-specific YouTube request handler.
// Removes stale compression and hot-hash headers from key-refresh requests.

(function () {
  "use strict";

  const CONFIG_KEY = "YouTubeConfig";
  const HOT_HASH_HEADER = "x-youtube-hot-hash-data";

  function readConfig() {
    try {
      return JSON.parse($persistentStore.read(CONFIG_KEY) || "{}");
    } catch (error) {
      console.log(`YouTube config read failed: ${String(error)}`);
      return {};
    }
  }

  function findHeader(headers, name) {
    const expected = name.toLowerCase();
    for (const key of Object.keys(headers || {})) {
      if (key.toLowerCase() === expected) return headers[key];
    }
    return "";
  }

  function deleteHeaders(headers, names) {
    const blocked = new Set(names.map((name) => name.toLowerCase()));
    for (const key of Object.keys(headers)) {
      if (blocked.has(key.toLowerCase())) delete headers[key];
    }
    return headers;
  }

  function hasValidClientKey(config, platformKey) {
    const value = config[platformKey]?.clientKey;
    if (typeof value !== "string" || !value.length) return false;
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/").replace(/\s/g, "");
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) return false;
    const payload = normalized.replace(/=+$/, "");
    return payload.length % 4 !== 1 && Math.floor(payload.length * 6 / 8) === 32;
  }

  try {
    const config = readConfig();
    const platformKey = String(findHeader($request.headers, "user-agent")).toLowerCase().includes("music")
      ? "youtubeMusic"
      : "youtube";
    const headers = deleteHeaders({ ...($request.headers || {}) }, ["content-encoding"]);
    if (!hasValidClientKey(config, platformKey)) deleteHeaders(headers, [HOT_HASH_HEADER]);
    $done({ headers });
  } catch (error) {
    console.log(`YouTube request handler failed: ${String(error)}`);
    $done({});
  }
})();
