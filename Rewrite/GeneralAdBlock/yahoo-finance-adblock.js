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
 * Yahoo Finance AdBlock for Surge
 *
 * Disables native ad placements through Yahoo's remote configuration.
 */

const isYahooConfig = /^https:\/\/config\.mobile\.yahoo\.com\/V3\/getconfig(?:\?.*)?$/i.test(
  $request.url
);

if (!isYahooConfig) {
  $done({});
} else if (typeof $response === "undefined") {
  const headers = Object.assign({}, $request.headers);

  Object.keys(headers).forEach(function(key) {
    if (/^if-(?:none-match|modified-since)$/i.test(key)) {
      delete headers[key];
    }
  });

  $done({ headers: headers });
} else {
  try {
    const response = JSON.parse($response.body || "{}");
    const features =
      response.feature &&
      response.feature["com.yahoo.finance"];

    if (!features) {
      $done({});
    } else {
      [
        "ArticleKit_EnableLargeCardAdOnOffnetArticle",
        "ArticleKit_EnableMoreStoriesAd",
        "ArticleKit_EnablePencilAds",
        "ArticleKit_EnableSponsoredMoments",
        "enableUPCHomePencilAd",
        "homeAdsModuleUpdate",
        "homeNewsForYouAdsUpdate",
        "pencilAdEnabled",
        "prefetchTopMarketsAd",
        "prefetchTopQSPAd",
        "sponsored_moments_ad_enabled",
        "sponsored_moments_gam_edge_to_edge_article_ad_enabled",
        "sponsored_moments_gam_edge_to_edge_stream_ad_enabled",
        "sponsored_moments_native_qsp_pencil_ad_enabled",
        "sponsored_moments_prebidsdk_support",
        "sponsored_moments_taboola_article_pencil_ad_enabled",
        "sponsored_moments_taboola_article_recirc_ad_enabled",
        "sponsored_moments_taboola_new_home_stream_ad_enabled",
        "sponsored_moments_taboola_stream_ad_enabled",
        "topAdPlacementQSP",
        "topMarketsAd"
      ].forEach(function(key) {
        features[key] = false;
      });

      features.sponsored_moments_news_stream_ad_position = 9999;
      features.sponsored_moments_quotes_stream_ad_position = 9999;
      features.streamAdFetchCount = 0;

      $done({ body: JSON.stringify(response) });
    }
  } catch (_) {
    $done({});
  }
}

})($done, $httpClient, typeof $argument === 'undefined' ? null : $argument,
   typeof $environment === 'undefined' ? {} : $environment);
