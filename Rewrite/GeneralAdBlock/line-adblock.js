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
 * LINE AdBlock for Surge — v1.0.0
 * Disables the server-controlled News tab without blocking LINE's shared
 * configuration endpoint.
 */

(function () {
  "use strict";

  const KEY = "function.maintab.newsrowtab.enable";
  const YES = 0x59;
  const NO = 0x4e;

  function asciiBytes(text) {
    const bytes = new Uint8Array(text.length);
    for (let index = 0; index < text.length; index += 1) {
      bytes[index] = text.charCodeAt(index);
    }
    return bytes;
  }

  function matchesAt(body, needle, offset) {
    if (offset + needle.length > body.length) return false;
    for (let index = 0; index < needle.length; index += 1) {
      if (body[offset + index] !== needle[index]) return false;
    }
    return true;
  }

  if (Number($response.status) !== 200 || !($response.body instanceof Uint8Array)) {
    $done({});
    return;
  }

  const body = $response.body;
  const key = asciiBytes(KEY);
  let output = null;

  for (let offset = 0; offset <= body.length - key.length - 2; offset += 1) {
    if (offset === 0 || body[offset - 1] !== key.length ||
        !matchesAt(body, key, offset)) continue;

    const valueLengthOffset = offset + key.length;
    const valueOffset = valueLengthOffset + 1;

    // The captured getConfigurations Thrift map stores this flag as a
    // one-byte string. Leave unknown future encodings untouched.
    if (body[valueLengthOffset] !== 0x01 || body[valueOffset] !== YES) continue;

    if (output === null) output = new Uint8Array(body);
    output[valueOffset] = NO;
  }

  $done(output === null ? {} : { body: output });
})();

})($done, $httpClient, typeof $argument === 'undefined' ? null : $argument,
   typeof $environment === 'undefined' ? {} : $environment);
