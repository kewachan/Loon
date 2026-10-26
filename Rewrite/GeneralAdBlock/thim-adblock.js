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
 * THIM AdBlock for Surge — v1.0.3
 * Removes the Home screen's complete Privilege Offers carousel by emptying only
 * the dedicated exclusive-banners placement response.
 */

(function () {
  "use strict";

  const ENDPOINT = /^https:\/\/service(?:\.global)?\.thim\.immigration\.go\.th\/api\/v1\/explore\/coupons\/exclusive-banners(?:\?[^#]*)?$/;

  if ($request.method !== "GET" || !ENDPOINT.test($request.url) ||
      Number($response.status) !== 200 || typeof $response.body !== "string") {
    $done({});
    return;
  }

  try {
    const payload = JSON.parse($response.body);
    if (!payload || payload.code !== "200.00" || payload.status !== "SUCCESS" ||
        !Array.isArray(payload.data) || payload.data.length === 0) {
      $done({});
      return;
    }

    payload.data = [];
    $done({ body: JSON.stringify(payload) });
  } catch (_) {
    // Preserve malformed or future response layouts instead of affecting THIM.
    $done({});
  }
})();

})($done, $httpClient, typeof $argument === 'undefined' ? null : $argument,
   typeof $environment === 'undefined' ? {} : $environment);
