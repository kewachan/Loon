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
 * Remove mFood launch-screen, popup, floating, and in-page advertisements.
 *
 * Intercept requests before the real advertising payload reaches the app,
 * with a response-stage fallback for already-started requests. The splash
 * endpoint uses base64-encoded zlib data, most ad lists use
 * JSON arrays, and special/floating-banner endpoints use an empty body when no
 * ad exists.
 */

const EMPTY_COMPRESSED_LIST = "eJyLjgUAARUAuQ==";
const requestURL = $request.url || "";
const requestMethod = ($request.method || "").toUpperCase();
const isCompressedList = requestURL.includes("/_list_spread-compress");
const isJSONList =
  requestURL.includes("/_comprehensive_pop_list") ||
  requestURL.includes("/getGroupPopList") ||
  requestURL.includes("/_get_pop_list") ||
  requestURL.includes("/activity/activity/topPop/list") ||
  requestURL.includes("/market/user_side/banner/_get_banner_list") ||
  requestURL.includes("/orgs/banner/advertisement/_get_banner_list") ||
  requestURL.includes("/orgs/banner/advertisement/_get_advertisement_list") ||
  requestURL.includes(
    "/orgs/banner/advertisement/_activity_advertisement_list"
  );
const isEmptyBodyBanner =
  requestURL.includes("/_special_list") ||
  requestURL.includes("/_new_special_list") ||
  requestURL.includes("/_list_suspend") ||
  requestURL.includes("/_list_smart") ||
  requestURL.includes("/orgs/basic/banner/bottom/banner/_list") ||
  requestURL.includes("/activity/userActivity/getPop");
const isNewPeopleAd = requestURL.includes(
  "/market/market/zone/_new-people-ad"
);

if (requestMethod === "OPTIONS") {
  $done({});
} else if (isCompressedList || isJSONList || isEmptyBodyBanner || isNewPeopleAd) {
  const body = isCompressedList
    ? EMPTY_COMPRESSED_LIST
    : isEmptyBodyBanner
      ? ""
      : isNewPeopleAd
        ? '{"imgUrl":null}'
        : "[]";
  const contentType = isCompressedList
    ? "text/plain;charset=UTF-8"
    : isEmptyBodyBanner
      ? ""
      : "application/json;charset=UTF-8";

  if (typeof $response === "undefined") {
    const headers = { "Cache-Control": "no-store" };
    if (contentType) {
      headers["Content-Type"] = contentType;
    }

    $done({
      response: {
        status: 200,
        headers,
        body
      }
    });
  } else {
    const headers = { ...($response.headers || {}) };

    for (const name of Object.keys(headers)) {
      const lowerName = name.toLowerCase();
      if (
        lowerName === "content-length" ||
        (isEmptyBodyBanner && lowerName === "content-type")
      ) {
        delete headers[name];
      }
    }

    headers["Cache-Control"] = "no-store";
    if (contentType) {
      headers["Content-Type"] = contentType;
    }
    $done({ headers, body });
  }
} else {
  $done({});
}

})($done, $httpClient, typeof $argument === 'undefined' ? null : $argument,
   typeof $environment === 'undefined' ? {} : $environment);
