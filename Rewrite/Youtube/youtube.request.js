// Loon-specific YouTube request handler.
// Hands initplayback to the Worker through Loon's native request rewrite so
// the response can flow directly to YouTube without script-side buffering.

(function () {
  "use strict";

  const CONFIG_KEY = "YouTubeConfig";
  const WORKER_URL = "https://youtube-init.hmtw47cv7m.workers.dev/";
  const HOT_HASH_HEADER = "x-youtube-hot-hash-data";

  function finish(value) {
    $done(value);
  }

  function readArguments() {
    const defaults = { captionLang: "off" };
    if (typeof $argument === "undefined" || !$argument || typeof $argument !== "object") {
      return defaults;
    }
    if (typeof $argument.captionLang === "string" && $argument.captionLang) {
      defaults.captionLang = $argument.captionLang;
    }
    return defaults;
  }

  function readConfig() {
    try {
      return JSON.parse($persistentStore.read(CONFIG_KEY) || "{}");
    } catch (error) {
      console.log(`YouTube config read failed: ${String(error)}`);
      return {};
    }
  }

  function writeConfig(config) {
    $persistentStore.write(JSON.stringify(config), CONFIG_KEY);
  }

  function findHeader(headers, name) {
    const expected = name.toLowerCase();
    for (const key of Object.keys(headers || {})) {
      if (key.toLowerCase() === expected) return headers[key];
    }
    return undefined;
  }

  function deleteHeaders(headers, names) {
    const blocked = new Set(names.map((name) => name.toLowerCase()));
    for (const key of Object.keys(headers)) {
      if (blocked.has(key.toLowerCase())) delete headers[key];
    }
    return headers;
  }

  function toBytes(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) {
      return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }
    return null;
  }

  function decodeBase64(value) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const lookup = Object.create(null);
    for (let index = 0; index < alphabet.length; index += 1) lookup[alphabet[index]] = index;

    const input = String(value).replace(/-/g, "+").replace(/_/g, "/").replace(/\s/g, "");
    const output = [];
    let buffer = 0;
    let bits = 0;

    for (const character of input) {
      if (character === "=") break;
      const decoded = lookup[character];
      if (decoded === undefined) throw new Error("Invalid base64 key");
      buffer = (buffer << 6) | decoded;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        output.push((buffer >> bits) & 0xff);
      }
    }
    return new Uint8Array(output);
  }

  function equalBytes(left, right) {
    if (!left || !right || left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) return false;
    }
    return true;
  }

  function readVarint(bytes, offset) {
    let value = 0;
    let multiplier = 1;
    let position = offset;
    for (let count = 0; count < 10 && position < bytes.length; count += 1) {
      const byte = bytes[position++];
      value += (byte & 0x7f) * multiplier;
      if ((byte & 0x80) === 0) return { value, offset: position };
      multiplier *= 128;
    }
    throw new Error("Invalid protobuf varint");
  }

  function findLengthDelimitedField(bytes, wantedField) {
    let offset = 0;
    while (offset < bytes.length) {
      const tag = readVarint(bytes, offset);
      offset = tag.offset;
      const field = Math.floor(tag.value / 8);
      const wireType = tag.value & 7;

      if (wireType === 0) {
        offset = readVarint(bytes, offset).offset;
      } else if (wireType === 1) {
        offset += 8;
      } else if (wireType === 2) {
        const length = readVarint(bytes, offset);
        offset = length.offset;
        const end = offset + length.value;
        if (end > bytes.length) throw new Error("Invalid protobuf length");
        if (field === wantedField) return bytes.subarray(offset, end);
        offset = end;
      } else if (wireType === 5) {
        offset += 4;
      } else {
        throw new Error(`Unsupported protobuf wire type: ${wireType}`);
      }
      if (offset > bytes.length) throw new Error("Truncated protobuf body");
    }
    return null;
  }

  function encryptedClientKey(body) {
    const encryptedRequest = findLengthDelimitedField(body, 3);
    return encryptedRequest ? findLengthDelimitedField(encryptedRequest, 5) : null;
  }

  function isMusicRequest(headers) {
    return String(findHeader(headers, "user-agent") || "").toLowerCase().includes("music");
  }

  function handleLogEvent(config, platformKey) {
    const headers = { ...($request.headers || {}) };
    deleteHeaders(headers, ["content-encoding"]);
    if (!config[platformKey]?.clientKey) deleteHeaders(headers, [HOT_HASH_HEADER]);
    finish({ headers });
  }

  function returnEmptyFallback(config, platformKey) {
    if (config[platformKey]) {
      delete config[platformKey];
      writeConfig(config);
    }
    finish({
      response: {
        status: 200,
        headers: { "Content-Type": "text/plain" },
        body: new Uint8Array(0),
      },
    });
  }

  function handleInitPlayback(config, platformKey) {
    const keys = config[platformKey];
    const body = toBytes($request.body);
    if (!keys?.clientKey || !keys?.encryptKey || !body) {
      returnEmptyFallback(config, platformKey);
      return;
    }

    let requestKey;
    let expectedKey;
    try {
      requestKey = encryptedClientKey(body);
      expectedKey = decodeBase64(keys.encryptKey);
    } catch (error) {
      console.log(`YouTube initplayback parse failed: ${String(error)}`);
      returnEmptyFallback(config, platformKey);
      return;
    }

    if (!equalBytes(requestKey, expectedKey)) {
      returnEmptyFallback(config, platformKey);
      return;
    }

    const workerUrl = `${WORKER_URL}?ck=${encodeURIComponent(keys.clientKey)}`
      + `&target=${encodeURIComponent($request.url)}`
      + `&captionLang=${encodeURIComponent(readArguments().captionLang)}`;

    const requestHeaders = deleteHeaders(
      { ...($request.headers || {}) },
      ["host", ":authority", "content-length", "connection", "proxy-connection", "transfer-encoding", "te"]
    );

    finish({ url: workerUrl, headers: requestHeaders, body });
  }

  try {
    const url = String($request.url || "");
    const config = readConfig();
    const platformKey = isMusicRequest($request.headers) ? "youtubeMusic" : "youtube";

    if (url.includes("log_event")) {
      handleLogEvent(config, platformKey);
    } else if (url.includes("initplayback")) {
      handleInitPlayback(config, platformKey);
    } else {
      finish({});
    }
  } catch (error) {
    console.log(`YouTube request handler failed: ${String(error)}`);
    finish({});
  }
})();
