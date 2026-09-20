const SLEEPY_ANALYTICS_ID = "G-3HFVE8BEZH";
const SLEEPY_ANALYTICS_VERSION = "redesign_v1";

(function initSleepyAnalytics() {
  const productionHosts = new Set(["sleepypokemon.com", "www.sleepypokemon.com"]);
  const debugRequested = new URLSearchParams(window.location.search).has("analytics_debug");
  if (debugRequested) window.sessionStorage.setItem("sleepy_analytics_debug", "1");
  const debugMode = debugRequested || window.sessionStorage.getItem("sleepy_analytics_debug") === "1";
  if (!SLEEPY_ANALYTICS_ID || window.location.protocol === "file:" || (!productionHosts.has(window.location.hostname) && !debugMode)) return;

  const script = document.currentScript;
  const pageContext = script?.dataset || {};

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag(){ window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", SLEEPY_ANALYTICS_ID, {
    page_type: pageContext.pageType || "unknown",
    card_name: pageContext.cardName || undefined,
    card_pokemon: pageContext.cardPokemon || undefined,
    card_set: pageContext.cardSet || undefined,
    card_number: pageContext.cardNumber || undefined,
    card_rarity: pageContext.cardRarity || undefined,
    card_language: pageContext.cardLanguage || undefined,
    guide_slug: pageContext.guideSlug || undefined,
    debug_mode: debugMode || undefined,
  });

  window.sleepyAnalytics = {
    track(eventName, params = {}) {
      if (!window.gtag) return;
      window.gtag("event", eventName, cleanParams({
        page_type: pageContext.pageType || "unknown",
        analytics_version: SLEEPY_ANALYTICS_VERSION,
        ...params,
      }));
    },
  };

  loadGoogleAnalytics();
  trackStaticPageView(pageContext);
  bindDeclarativeEvents();
  bindHeaderSearch();
})();

function loadGoogleAnalytics() {
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(SLEEPY_ANALYTICS_ID)}`;
  document.head.append(script);
}

function trackStaticPageView(pageContext) {
  if (pageContext.pageType === "card") {
    window.sleepyAnalytics.track("card_page_view", {
      card_name: pageContext.cardName,
      card_pokemon: pageContext.cardPokemon,
      card_set: pageContext.cardSet,
      card_number: pageContext.cardNumber,
      card_rarity: pageContext.cardRarity,
      card_language: pageContext.cardLanguage,
    });
  }

  if (pageContext.pageType === "guide") {
    window.sleepyAnalytics.track("guide_page_view", {
      guide_slug: pageContext.guideSlug,
      guide_title: pageContext.guideTitle,
    });
  }
}

function bindDeclarativeEvents() {
  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-analytics-event]");
    if (!target || !window.sleepyAnalytics) return;

    window.sleepyAnalytics.track(target.dataset.analyticsEvent, {
      destination_path: getDestinationPath(target.href),
      interaction_source: target.dataset.analyticsSource,
      destination: target.dataset.analyticsDestination,
      card_name: target.dataset.analyticsCardName,
      card_pokemon: target.dataset.analyticsCardPokemon,
      card_set: target.dataset.analyticsCardSet,
      guide_slug: target.dataset.analyticsGuideSlug,
      guide_title: target.dataset.analyticsGuideTitle,
    });
  });
}

function bindHeaderSearch() {
  document.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-header-search]");
    if (!form || !window.sleepyAnalytics) return;
    const query = form.querySelector("[data-header-search-input]")?.value.trim() || "";
    if (!query) return;
    window.sleepyAnalytics.track("search_submitted", {
      interaction_source: "global_header",
      query_length: query.length,
    });
  });
}

function getDestinationPath(href) {
  if (!href) return undefined;
  try {
    const url = new URL(href, window.location.href);
    return url.origin === window.location.origin ? url.pathname : url.hostname;
  } catch (error) {
    return undefined;
  }
}

function cleanParams(params) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== "")
  );
}
