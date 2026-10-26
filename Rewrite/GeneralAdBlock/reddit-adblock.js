// Native Loon adapter: plugin arguments, HTTP timeouts, and generic results.
((nativeDone, nativeHTTP, nativeArgument, nativeEnvironment) => {
  const $argument = nativeArgument && typeof nativeArgument === 'object'
    ? Object.keys(nativeArgument).map(key => key + '=' + encodeURIComponent(String(nativeArgument[key] ?? ''))).join('&')
    : String(nativeArgument || '');
  const $httpClient = {};
  for (const method of ['get', 'post', 'head', 'put', 'delete', 'patch', 'options']) {
    if (typeof nativeHTTP[method] !== 'function') continue;
    $httpClient[method] = (input, callback) => {
      const options = typeof input === 'string' ? {url: input} : Object.assign({}, input);
      if (Number.isFinite(Number(options.timeout)) && Number(options.timeout) > 0) options.timeout = Number(options.timeout) * 1000;
      if (options.policy !== undefined) { options.node = options.policy; delete options.policy; }
      if (options.insecure === undefined) options.insecure = false;
      return nativeHTTP[method](options, callback);
    };
  }
  const $done = value => {
    const isHTTP = typeof $request !== 'undefined';
    if (value === undefined) return nativeDone(isHTTP ? {} : undefined);
    const result = Object.assign({}, value);
    if (typeof result.status === 'string') {
      const status = result.status.match(/^HTTP\/\S+\s+(\d{3})/);
      if (status) result.status = Number(status[1]);
    }
    if (!isHTTP && result.content) {
      const escape = text => String(text).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
      result.htmlMessage = '<div style="font-family:-apple-system;white-space:pre-wrap">' + escape(result.content) + '</div>';
    }
    return nativeDone(result);
  };
/**
 * Reddit AdBlock for Surge — v1.0.0
 * Removes promoted posts from JSON and GraphQL multipart responses while
 * preserving normal feed entries and disabling NSFW content prompts.
 */

(function () {
  "use strict";

  const DROP = {};

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function hasAdCell(cells) {
    return Array.isArray(cells) && cells.some(function (cell) {
      return isObject(cell) &&
        (cell.__typename === "AdMetadataCell" || cell.isAdPost === true);
    });
  }

  function isAdObject(value) {
    if (!isObject(value)) return false;

    if (value.__typename === "AdPost" || value.isAdPost === true ||
        isObject(value.adPayload) || hasAdCell(value.cells)) {
      return true;
    }

    const node = value.node;
    return isObject(node) &&
      (node.__typename === "AdPost" || node.isAdPost === true ||
       isObject(node.adPayload) || hasAdCell(node.cells));
  }

  function cleanValue(value, state) {
    if (Array.isArray(value)) {
      const result = [];
      value.forEach(function (item) {
        const cleaned = cleanValue(item, state);
        if (cleaned !== DROP) result.push(cleaned);
      });
      return result;
    }

    if (!isObject(value)) return value;

    if (isAdObject(value)) {
      state.changed = true;
      return DROP;
    }

    if (value.isNsfw === true) {
      value.isNsfw = false;
      state.changed = true;
    }
    if (value.isNsfwMediaBlocked === true) {
      value.isNsfwMediaBlocked = false;
      state.changed = true;
    }
    if (value.isNsfwContentShown === false) {
      value.isNsfwContentShown = true;
      state.changed = true;
    }
    if (Array.isArray(value.commentsPageAds) && value.commentsPageAds.length > 0) {
      value.commentsPageAds = [];
      state.changed = true;
    }

    Object.keys(value).forEach(function (key) {
      const cleaned = cleanValue(value[key], state);
      if (cleaned === DROP) {
        delete value[key];
      } else {
        value[key] = cleaned;
      }
    });

    return value;
  }

  function transformJson(text) {
    try {
      const state = { changed: false };
      const cleaned = cleanValue(JSON.parse(text), state);
      if (cleaned === DROP || !state.changed) return null;
      return JSON.stringify(cleaned);
    } catch (_) {
      return null;
    }
  }

  function headerValue(headers, name) {
    const target = name.toLowerCase();
    const key = Object.keys(headers || {}).find(function (candidate) {
      return candidate.toLowerCase() === target;
    });
    return key ? String(headers[key]) : "";
  }

  function multipartBoundary(contentType) {
    const match = contentType.match(/boundary\s*=\s*"?([^";\s]+)"?/i);
    return match ? match[1] : "";
  }

  function transformMultipart(body, boundary) {
    const delimiter = "--" + boundary;
    if (!boundary || body.indexOf(delimiter) === -1) return null;

    let changed = false;
    const segments = body.split(delimiter).map(function (segment) {
      let separator = "\r\n\r\n";
      let separatorIndex = segment.indexOf(separator);
      if (separatorIndex === -1) {
        separator = "\n\n";
        separatorIndex = segment.indexOf(separator);
      }
      if (separatorIndex === -1) return segment;

      const prefixEnd = separatorIndex + separator.length;
      const content = segment.slice(prefixEnd);
      const leading = (content.match(/^\s*/) || [""])[0];
      const trailing = (content.match(/\s*$/) || [""])[0];
      const jsonEnd = content.length - trailing.length;
      const jsonText = content.slice(leading.length, jsonEnd);
      if (!jsonText) return segment;

      const transformed = transformJson(jsonText);
      if (transformed === null) return segment;

      changed = true;
      return segment.slice(0, prefixEnd) + leading + transformed + trailing;
    });

    return changed ? segments.join(delimiter) : null;
  }

  if (typeof $response.body !== "string") {
    $done({});
    return;
  }

  const contentType = headerValue($response.headers, "content-type");
  let body = null;

  if (/multipart\/mixed/i.test(contentType)) {
    body = transformMultipart($response.body, multipartBoundary(contentType));
  } else {
    body = transformJson($response.body);
  }

  $done(body === null ? {} : { body: body });
})();

})($done, $httpClient, typeof $argument === 'undefined' ? null : $argument,
   typeof $environment === 'undefined' ? {} : $environment);
