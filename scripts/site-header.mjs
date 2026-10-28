import { assetUrl } from "./build-helpers.mjs";

// The header on every page. Wider screens show Browse, Guides, About and Suggest in the header; phones put them
// behind the ☰ button (site-header.js opens it; the CSS for each layout is in home-v3.css and card-detail-v3.css).
export function renderSiteHeader(basePath = "") {
  return `
      <header class="topbar">
        <a class="brand-lockup" href="${basePath}" aria-label="Sleepy Pokemon home" data-analytics-event="navigation_clicked" data-analytics-source="global_header" data-analytics-destination="home">
          <svg class="sparkle-mark" viewBox="0 0 76 68" aria-hidden="true" focusable="false">
            <rect x="7" y="13" width="34" height="47" rx="9" fill="var(--soft-mint)" stroke="currentColor" stroke-width="4" transform="rotate(-15 24 36)" />
            <rect x="19" y="5" width="38" height="51" rx="9" fill="var(--lavender)" stroke="currentColor" stroke-width="4" transform="rotate(7 38 30)" />
            <rect x="26" y="12" width="42" height="52" rx="10" fill="var(--cream)" stroke="currentColor" stroke-width="4" />
            <path d="M36 32q4 6 8 0M50 32q4 6 8 0" fill="none" stroke="var(--ink)" stroke-width="3.5" stroke-linecap="round" />
            <path d="M45 44q4 4 8 0" fill="none" stroke="var(--pink)" stroke-width="3.5" stroke-linecap="round" />
            <path d="M19 39l3 3 3-3M62 25l3 3 3-3" fill="none" stroke="var(--pink)" stroke-width="2.5" stroke-linecap="round" />
          </svg>
          <div>
            <h1>Sleepy Pokemon</h1>
            <p class="brand-byline">A collection by Comet</p>
          </div>
        </a>
        <nav class="topbar-actions" aria-label="Main navigation">
          <form class="header-search" action="${basePath}collection/" method="get" role="search" data-header-search>
            <label class="header-search-field">
              <span class="sr-only">Search sleepy Pokemon cards</span>
              <svg class="header-search-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input type="search" name="q" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" placeholder="Search cards" data-header-search-input />
              <button type="submit" aria-label="Search sleepy Pokemon cards">
                <span aria-hidden="true">→</span>
              </button>
            </label>
          </form>
          <button class="site-menu-toggle" type="button" aria-label="Menu" aria-expanded="false" aria-controls="siteMenu">
            <span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span>
          </button>
          <div class="site-menu" id="siteMenu">
            <a href="${basePath}collection/" data-analytics-event="navigation_clicked" data-analytics-source="global_header" data-analytics-destination="collection">Browse</a>
            <a href="${basePath}guides/" data-analytics-event="navigation_clicked" data-analytics-source="global_header" data-analytics-destination="guides">Guides</a>
            <a href="${basePath}about/" data-analytics-event="navigation_clicked" data-analytics-source="global_header" data-analytics-destination="about">About</a>
            <a class="header-cta" href="${basePath}collection/?suggest=header" data-header-suggest><span aria-hidden="true">✦</span> Suggest</a>
          </div>
        </nav>
      </header>
      <script defer src="${assetUrl(basePath, "site-header.js")}"></script>
`.trim();
}
