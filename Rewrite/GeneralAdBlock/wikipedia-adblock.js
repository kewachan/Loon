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
let body = $response.body || "";
const url = $request.url || "";

const isVariantDialog =
  /https?:\/\/zh\.wikipedia\.org\/w\/load\.php/i.test(url) &&
  /(?:[?&]|%26)modules=ext\.gadget\.VariantAllyDialog(?:[&%]|$)/i.test(url);

const isCentralNotice =
  /https?:\/\/meta\.wikimedia\.org\/w\/index\.php/i.test(url) &&
  /(?:[?&]|%26)title=Special(?::|%3A)BannerLoader(?:[&%]|$)/i.test(url);

const isAdvancedSiteNotices =
  /https?:\/\/zh\.wikipedia\.org\/w\/api\.php/i.test(url) &&
  /(?:[?&]|%26)page=Template(?::|%3A)AdvancedSiteNotices(?:\/|%2F)ajax(?:[&%]|$)/i.test(url);

if (isVariantDialog || isCentralNotice) {
  body = "";
} else if (isAdvancedSiteNotices && body) {
  try {
    const json = JSON.parse(body);
    if (json.parse && typeof json.parse === "object") {
      json.parse.text = "";
      body = JSON.stringify(json);
    }
  } catch (error) {
    // Preserve an unexpected response instead of breaking the page.
  }
}

$done({ body });

})($done, $httpClient, typeof $argument === 'undefined' ? null : $argument,
   typeof $environment === 'undefined' ? {} : $environment);
