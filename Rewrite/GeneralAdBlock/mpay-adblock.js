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
 * MPay AdBlock for Surge — v1.0.6
 * Removes the Home screen floating promotion while preserving MPay-provided
 * tabs, icons, animations, and navigation.
 */

(function () {
  "use strict";

  const ENDPOINT = /^https:\/\/pay\.macaupass\.com\/tdrmp\/appMenu\/getAppMenu\.do(?:\?.*)?$/;

  if ($request.method !== "POST" || !ENDPOINT.test($request.url) ||
      Number($response.status) !== 200 || typeof $response.body !== "string") {
    $done({});
    return;
  }

  try {
    const payload = JSON.parse($response.body);
    const data = payload && payload.DATA;
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      $done({});
      return;
    }

    let changed = false;

    if (Array.isArray(data["10"])) {
      const filtered = data["10"].filter(function (item) {
        return !item || item.code !== "fubiao_ios";
      });
      if (filtered.length !== data["10"].length) {
        data["10"] = filtered;
        changed = true;
      }
    }

    $done(changed ? { body: JSON.stringify(payload) } : {});
  } catch (_) {
    // Preserve malformed or future response layouts instead of affecting MPay.
    $done({});
  }
})();

})($done, $httpClient, typeof $argument === 'undefined' ? null : $argument,
   typeof $environment === 'undefined' ? {} : $environment);
