const SLEEPY_ANALYTICS_ID = "G-3HFVE8BEZH";

(function initSleepyAnalytics() {
  if (!SLEEPY_ANALYTICS_ID || window.location.protocol === "file:") return;

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
    guide_slug: pageContext.guideSlug || undefined,
  });

  window.sleepyAnalytics = {
    track(eventName, params = {}) {
      if (!window.gtag) return;
      window.gtag("event", eventName, cleanParams({
        page_type: pageContext.pageType || "unknown",
        ...params,
      }));
    },
  };

  loadGoogleAnalytics();
  trackStaticPageView(pageContext);
  bindDeclarativeEvents();
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
      link_url: target.href || undefined,
      card_name: target.dataset.analyticsCardName,
      card_pokemon: target.dataset.analyticsCardPokemon,
      card_set: target.dataset.analyticsCardSet,
      guide_slug: target.dataset.analyticsGuideSlug,
    });
  });
}

function cleanParams(params) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== "")
  );
}
