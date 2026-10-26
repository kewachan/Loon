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

if (!body || !/https?:\/\/comicapi\.manhuashe\.com\//i.test(url)) {
  $done({ body });
  return;
}

const setWelfareTabbar = (obj) => {
  if (!obj || typeof obj !== "object") {
    return false;
  }

  let changed = false;
  if (obj.base && typeof obj.base === "object") {
    if (obj.base.welfare_tabbar_show !== 0) {
      obj.base.welfare_tabbar_show = 0;
      changed = true;
    }
  }
  return changed;
};

let changed = false;

try {
  const json = JSON.parse(body);
  const target = json.response && typeof json.response === "object" ? json.response : json;
  changed = setWelfareTabbar(target);
  body = JSON.stringify(json);
} catch (err) {
  if (/"welfare_tabbar_show"\s*:\s*\d+/i.test(body)) {
    body = body.replace(/("welfare_tabbar_show"\s*:\s*)\d+/gi, "$10");
    changed = true;
  } else if (/"base"\s*:\s*\{[^}]*\}/i.test(body)) {
    body = body.replace(/("base"\s*:\s*\{)/i, "$1\"welfare_tabbar_show\":0,");
    changed = true;
  }
}

if (!changed) {
  // keep raw body unchanged
}

$done({ body });

})($done, $httpClient, typeof $argument === 'undefined' ? null : $argument,
   typeof $environment === 'undefined' ? {} : $environment);
