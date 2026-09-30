// Loon playback key recovery. Account headers stay on the YouTube API route.
(function () {
  "use strict";
  const PREFIX = "YouTubePlaybackKeys.v2.";
  const LIMIT = 8;
  const BOOTSTRAP_COOLDOWN_MS = 10000;
  const platform = /music/i.test(header($request.headers, "user-agent")) ? "youtubeMusic" : "youtube";
  const storeKey = PREFIX + platform;

  function header(headers, name) {
    const key = Object.keys(headers || {}).find((key) => key.toLowerCase() === name);
    return key ? String(headers[key]) : "";
  }
  function readState() {
    try {
      const state = JSON.parse($persistentStore.read(storeKey) || "{}");
      state.entries = (Array.isArray(state.entries) ? state.entries : [])
        .filter((entry) => entry && Number.isFinite(entry.expiresAt) && entry.expiresAt > Date.now()).slice(0, LIMIT);
      return state;
    } catch (_) { return { entries: [] }; }
  }
  function saveState(state) {
    if (!$persistentStore.write(JSON.stringify(state), storeKey)) throw new Error("Playback key cache write failed");
  }
  function bytes(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    return null;
  }
  function base64(value) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let out = "";
    for (let i = 0; i < value.length; i += 3) {
      const a = value[i], b = value[i + 1], c = value[i + 2];
      out += alphabet[a >>> 2] + alphabet[((a & 3) << 4) | ((b || 0) >>> 4)]
        + (i + 1 < value.length ? alphabet[((b & 15) << 2) | ((c || 0) >>> 6)] : "=")
        + (i + 2 < value.length ? alphabet[c & 63] : "=");
    }
    return out;
  }
  function varint(data, offset) {
    let value = 0, multiplier = 1;
    for (let n = 0; n < 10 && offset < data.length; n++) {
      const byte = data[offset++];
      value += (byte & 127) * multiplier;
      if (!(byte & 128)) return [value, offset];
      multiplier *= 128;
    }
    throw new Error("Invalid protobuf varint");
  }
  function fields(data) {
    const output = [];
    let position = 0;
    while (position < data.length) {
      const start = position;
      let tag;
      [tag, position] = varint(data, position);
      const no = Math.floor(tag / 8), wire = tag % 8;
      let value;
      if (no < 1) throw new Error("Invalid protobuf field");
      if (wire === 0) [value, position] = varint(data, position);
      else if (wire === 1) position += 8;
      else if (wire === 5) position += 4;
      else if (wire === 2) {
        let length;
        [length, position] = varint(data, position);
        if (length > data.length - position) throw new Error("Truncated protobuf field");
        value = data.subarray(position, position + length);
        position += length;
      } else throw new Error("Unsupported protobuf wire type");
      if (position > data.length) throw new Error("Truncated protobuf field");
      output.push({ no, wire, value, raw: data.subarray(start, position) });
    }
    return output;
  }
  function field(data, no, wire = 2) {
    return fields(data).find((item) => item.no === no && item.wire === wire)?.value;
  }
  function extractConfig(data) {
    if (data[0] === 31 && data[1] === 139) data = $utils.ungzip(data);
    const context = field(data, 1);
    const global = context && field(context, 16);
    if (!global || global.length > 128 * 1024) return null;
    let onesie = global;
    for (const no of [7, 138536474, 146311580]) {
      onesie = field(onesie, no);
      if (!onesie) return null;
    }
    const clientKey = field(onesie, 1), encryptKey = field(onesie, 2);
    if (clientKey?.length !== 32 || !encryptKey?.length || encryptKey.length > 256) return null;
    const hotHash = field(global, 4);
    const savedAt = Date.now();
    const seconds = field(onesie, 3, 0) ?? 86400;
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    const lifetime = Math.min(259200, seconds);
    return {
      globalConfig: base64(global),
      entry: {
        clientKey: base64(clientKey), encryptKey: base64(encryptKey),
        hotHashData: hotHash ? new TextDecoder().decode(hotHash) : "",
        savedAt, expiresAt: savedAt + lifetime * 1000,
      },
    };
  }
  function remember(config, pendingHash) {
    const state = readState();
    state.entries = [config.entry, ...state.entries.filter((entry) => entry.encryptKey !== config.entry.encryptKey)].slice(0, LIMIT);
    state.refreshNeeded = false;
    if (pendingHash !== undefined) {
      state.pending = { globalConfig: config.globalConfig, requestHash: pendingHash, savedAt: Date.now() };
    }
    saveState(state);
  }
  function cleanHeaders(headers, names) {
    const blocked = new Set(names);
    return Object.fromEntries(Object.entries(headers || {}).filter(([key]) => !blocked.has(key.toLowerCase())));
  }
  function nextPassthrough() {
    const data = bytes($request.body);
    // Loon may supply an already decoded body with the old gzip header.
    // Do not strip the encoding if the body still contains actual gzip bytes.
    return header($request.headers, "content-encoding") && data && !(data[0] === 31 && data[1] === 139)
      ? { headers: cleanHeaders($request.headers, ["content-encoding", "content-length"]) } : {};
  }
  function bootstrapNext() {
    const state = readState();
    const hotHash = header($request.headers, "x-youtube-hot-hash-data");
    if (!state.refreshNeeded && state.entries.some((entry) => hotHash && entry.hotHashData === hotHash)) return $done(nextPassthrough());
    if (Date.now() - (state.bootstrapAt || 0) < BOOTSTRAP_COOLDOWN_MS) return $done(nextPassthrough());
    let input = bytes($request.body);
    if (!input || typeof $httpClient === "undefined") return $done(nextPassthrough());
    if (input[0] === 31 && input[1] === 139) input = $utils.ungzip(input);
    const context = fields(input).find((item) => item.no === 1 && item.wire === 2)?.raw;
    if (!context) return $done(nextPassthrough());
    state.bootstrapAt = Date.now();
    saveState(state);
    $httpClient.post({
      url: $request.url.replace(/\/next(?=\?|$)/, "/config"),
      headers: cleanHeaders($request.headers, ["host", "content-length", "content-encoding", "accept-encoding", "x-youtube-hot-hash-data", "x-youtube-cold-hash-data"]),
      body: context,
      "binary-mode": true,
      timeout: 3000,
    }, (error, response, body) => {
      try {
        if (!error && Number(response?.status || response?.statusCode) === 200) {
          const data = bytes(body);
          const config = data && extractConfig(data);
          if (config) remember(config, hotHash);
        }
      } catch (failure) { console.log("YouTube key bootstrap: " + String(failure)); }
      $done(nextPassthrough());
    });
  }
  try {
    if (typeof $response !== "undefined") {
      const data = bytes($response.body);
      if (Number($response.status || $response.statusCode) === 200 && data) {
        const config = extractConfig(data);
        if (config) remember(config);
      }
      $done({});
    } else if (/\/next(?:\?|$)/.test($request.url)) {
      bootstrapNext();
    } else {
      const state = readState();
      const hotHash = header($request.headers, "x-youtube-hot-hash-data");
      const data = bytes($request.body);
      const names = data?.[0] === 31 && data?.[1] === 139 ? [] : ["content-encoding", "content-length"];
      if (state.refreshNeeded || !state.entries.some((entry) => hotHash && entry.hotHashData === hotHash)) names.push("x-youtube-hot-hash-data");
      $done({ headers: cleanHeaders($request.headers, names) });
    }
  } catch (error) {
    console.log("YouTube key handler: " + String(error));
    $done({});
  }
})();
