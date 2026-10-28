import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { renderSiteHeader } from "./site-header.mjs";
import { renderSiteFooter } from "./site-footer.mjs";
import { getCardIdentity } from "./card-identity.mjs";
import { ABOUT_CARD_SLUGS, renderAboutPage } from "./about-page.mjs";
import { renderCardDetailDialog } from "./card-detail-dialog.mjs";
import { getSetHubs, loadSetDefs, writeSetPages } from "./set-pages.mjs";
import {
  SITE_URL,
  assetUrl,
  dataAttributes,
  escapeAttribute,
  escapeHtml,
  escapeRegExp,
  getCardLastmod,
  getNewestDate,
  loadCardData,
  loadGuideDefs,
  renderCardEntry,
  renderHead,
  sitemapUrl,
} from "./build-helpers.mjs";

const INDEX_PATH = "docs/index.html";
const GUIDES_DIR = "docs/guides";
const ABOUT_DIR = "docs/about";
const SITEMAP_PATH = "docs/sitemap.xml";
const CARD_INDEX_START = "<!-- SEO_CARD_INDEX_START -->";
const GUIDE_INDEX_START = "<!-- SEO_GUIDE_INDEX_START -->";
const GUIDE_INDEX_END = "<!-- SEO_GUIDE_INDEX_END -->";

const { payload: guideData, cards: cardsWithSlugs } = await loadCardData();
const guideDefs = await loadGuideDefs();
const cardBySlug = new Map(cardsWithSlugs.map((card) => [card.slug, card]));
const guides = guideDefs
  .map((guide) => resolveGuide(guide, cardBySlug))
  .filter((guide) => guide.slug && guide.cards.length);

const setHubs = getSetHubs(cardsWithSlugs, await loadSetDefs());

await writeGuidePages(guides);
await writeSetPages(setHubs);
await mkdir(ABOUT_DIR, { recursive: true });
await writeFile(`${ABOUT_DIR}/index.html`, renderAboutPage(cardBySlug), "utf8");
// The About lightbox only needs its own cards, so it loads this small subset instead of the full catalog.
await writeFile(`${ABOUT_DIR}/cards.json`, `${JSON.stringify({ cards: ABOUT_CARD_SLUGS.map((slug) => cardBySlug.get(slug)) }, null, 2)}\n`, "utf8");
await syncHomepageGuideIndex(guides);
await writeSitemap(cardsWithSlugs, guides, setHubs);

console.log(`Synced ${guides.length} guide pages and ${setHubs.length} set pages.`);

function resolveGuide(guide, cardsBySlug) {
  return {
    ...guide,
    cards: (guide.cards || [])
      .map((entry) => {
        const card = cardsBySlug.get(entry.slug);
        return card ? { ...entry, card } : null;
      })
      .filter(Boolean),
  };
}

async function writeGuidePages(guideList) {
  await rm(GUIDES_DIR, { recursive: true, force: true });
  await mkdir(GUIDES_DIR, { recursive: true });

  await writeFile(`${GUIDES_DIR}/index.html`, renderGuidesIndex(guideList), "utf8");

  await Promise.all(guideList.map(async (guide) => {
    const dir = `${GUIDES_DIR}/${guide.slug}`;
    await mkdir(dir, { recursive: true });
    await writeFile(`${dir}/index.html`, renderGuidePage(guide), "utf8");
  }));
}

async function syncHomepageGuideIndex(guideList) {
  const guideItems = guideList.map((guide) => {
    const description = guide.description || "Curated sleepy Pokemon card guide.";
    return `              <li><a href="guides/${escapeAttribute(guide.slug)}/" data-analytics-event="guide_opened" data-analytics-source="homepage_guide_index" data-analytics-guide-slug="${escapeAttribute(guide.slug)}" data-analytics-guide-title="${escapeAttribute(guide.title)}"><strong>${escapeHtml(guide.title)}</strong><span>${escapeHtml(description)}</span></a></li>`;
  }).join("\n");

  const section = guideItems ? `${GUIDE_INDEX_START}
        <section class="seo-card-index seo-guide-index" aria-labelledby="seoGuideIndexTitle">
          <div class="seo-card-index-inner">
            <p class="eyebrow">Collector guides</p>
            <h2 id="seoGuideIndexTitle">Sleepy Pokemon card guides</h2>
            <p class="notes">Curated guide pages for collectors looking for themes, budgets, and standout cards.</p>
            <ol>
${guideItems}
            </ol>
          </div>
        </section>
        ${GUIDE_INDEX_END}` : "";

  let html = await readFile(INDEX_PATH, "utf8");
  if (html.includes(GUIDE_INDEX_START) && html.includes(GUIDE_INDEX_END)) {
    html = html.replace(new RegExp(`${escapeRegExp(GUIDE_INDEX_START)}[\\s\\S]*?${escapeRegExp(GUIDE_INDEX_END)}`), section);
  } else if (section && html.includes(CARD_INDEX_START)) {
    html = html.replace(CARD_INDEX_START, `${section}\n\n${CARD_INDEX_START}`);
  }
  await writeFile(INDEX_PATH, html, "utf8");
}

// The only sitemap writer: it lists every generated page.
async function writeSitemap(cardList, guideList, hubs) {
  const homepageLastmod = getNewestDate([
    guideData.exportedAt,
    ...cardList.map((card) => getCardLastmod(card, guideData.exportedAt)),
  ]);
  const urls = [
    sitemapUrl(`${SITE_URL}/`, homepageLastmod, "daily", "1.0"),
    sitemapUrl(`${SITE_URL}/collection/`, homepageLastmod, "daily", "0.9"),
    sitemapUrl(`${SITE_URL}/guides/`, homepageLastmod, "monthly", "0.9"),
    sitemapUrl(`${SITE_URL}/about/`, homepageLastmod, "monthly", "0.6"),
    ...guideList.map((guide) => sitemapUrl(`${SITE_URL}/guides/${guide.slug}/`, homepageLastmod, "monthly", "0.9")),
    sitemapUrl(`${SITE_URL}/sets/`, homepageLastmod, "monthly", "0.8"),
    ...hubs.map((hub) => sitemapUrl(`${SITE_URL}/sets/${hub.slug}/`, getNewestDate(hub.cards.map((card) => getCardLastmod(card, guideData.exportedAt))), "weekly", "0.8")),
    ...cardList.map((card) => sitemapUrl(`${SITE_URL}/cards/${card.slug}/`, getCardLastmod(card, guideData.exportedAt), "weekly", "0.8")),
  ].join("\n");
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
  await writeFile(SITEMAP_PATH, sitemap, "utf8");
}

function renderGuidesIndex(guideList) {
  const description = "Collector notes, themed card lists, and favorite sleepy Pokemon finds from the stack.";
  return `<!doctype html>
<html lang="en">
  <head>
${renderHead({
  root: "../",
  title: "Sleepy Pokemon Card Guides",
  description,
  canonicalUrl: `${SITE_URL}/guides/`,
  image: guideList[0]?.cards[0]?.card.imageLarge || `${SITE_URL}/assets/sleepy-pokemon.png`,
  pageType: "guides-index",
  stylesheets: ["styles.css", "home-v3.css", "guides.css", "site-chrome.css"],
})}
  </head>
  <body data-app-mode="guides-index">
    <div class="app-shell guides-shell">
      ${renderSiteHeader("../")}
      <main class="guides-index-main">
        <header class="guides-index-intro">
          <p class="eyebrow">Field notes from the sleepy stack</p>
          <h1>Collector guides</h1>
          <p>${escapeHtml(description)}</p>
        </header>
        <section class="guide-directory" aria-label="Sleepy Pokemon card guides">
${guideList.map((guide, index) => renderGuideDirectoryItem(guide, index)).join("\n")}
        </section>
      </main>
${renderSiteFooter()}
    </div>
  </body>
</html>
`;
}

function renderGuideDirectoryItem(guide, index) {
  const previewCards = guide.cards.slice(0, 3);
  return `          <article class="guide-directory-item">
            <a class="guide-directory-art" href="${escapeAttribute(guide.slug)}/" aria-label="Read ${escapeAttribute(guide.title)}" data-analytics-event="guide_opened" data-analytics-source="guides_index_art" data-analytics-guide-slug="${escapeAttribute(guide.slug)}" data-analytics-guide-title="${escapeAttribute(guide.title)}">
${previewCards.map(({ card }, cardIndex) => {
  const image = card.imageSmall || card.imageLarge;
  return image ? `              <img src="${escapeAttribute(image)}" alt="" loading="${index === 0 && cardIndex === 0 ? "eager" : "lazy"}" />` : "";
}).join("\n")}
            </a>
            <div class="guide-directory-copy">
              <p class="eyebrow">${escapeHtml(guide.eyebrow || "Collector guide")} · ${guide.cards.length} cards</p>
              <h2><a href="${escapeAttribute(guide.slug)}/" data-analytics-event="guide_opened" data-analytics-source="guides_index_title" data-analytics-guide-slug="${escapeAttribute(guide.slug)}" data-analytics-guide-title="${escapeAttribute(guide.title)}">${escapeHtml(guide.title)}</a></h2>
              <p>${escapeHtml(guide.description || "Curated sleepy Pokemon card guide.")}</p>
              <a class="guide-read-link" href="${escapeAttribute(guide.slug)}/" data-analytics-event="guide_opened" data-analytics-source="guides_index_cta" data-analytics-guide-slug="${escapeAttribute(guide.slug)}" data-analytics-guide-title="${escapeAttribute(guide.title)}">Read the guide <span aria-hidden="true">→</span></a>
            </div>
          </article>`;
}

function renderGuidePage(guide) {
  const title = guide.title || "Sleepy Pokemon Card Guide";
  const description = guide.metaDescription || guide.description || "A curated Sleepy Pokemon card guide for collectors.";
  const canonicalUrl = `${SITE_URL}/guides/${guide.slug}/`;
  const image = guide.cards[0]?.card.imageLarge || guide.cards[0]?.card.imageSmall || `${SITE_URL}/assets/sleepy-pokemon.png`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    url: canonicalUrl,
    description,
    image,
    mainEntity: guide.cards.map(({ card }) => ({
      "@type": "Thing",
      name: `${card.name} Sleepy Pokemon Card`,
      url: `${SITE_URL}/cards/${card.slug}/`,
    })),
  };

  return `<!doctype html>
<html lang="en">
  <head>
${renderHead({
  root: "../../",
  title: `${title} | Sleepy Pokemon Cards`,
  socialTitle: title,
  description,
  canonicalUrl,
  image,
  ogType: "article",
  twitter: true,
  jsonLd,
  pageType: "guide",
  stylesheets: ["styles.css", "home-v3.css", "guides.css", "card-detail-v3.css", "site-chrome.css"],
})}
  </head>
  <body data-app-mode="guide-page" data-guide-slug="${escapeAttribute(guide.slug || "")}" data-guide-title="${escapeAttribute(title)}" data-guide-path="../../published-cards.json" data-site-root="../../">
    <div class="app-shell guide-page-shell">
      ${renderSiteHeader("../../")}

      <main class="guide-page-main">
        <section class="guide-hero" aria-labelledby="guideTitle">
          <div class="guide-hero-copy">
            <a class="guide-back-link" href="../" data-analytics-event="navigation_clicked" data-analytics-source="guide_page" data-analytics-destination="guides"><span aria-hidden="true">←</span> All guides</a>
            <p class="eyebrow">${escapeHtml(guide.eyebrow || "Collector guide")} · ${guide.cards.length} cards</p>
            <h1 id="guideTitle">${escapeHtml(title)}</h1>
            <p>${escapeHtml(guide.description || description)}</p>
            <div class="guide-actions">
              <button class="button subtle" id="downloadChecklistButton" type="button" disabled>Download checklist (${guide.cards.length})</button>
            </div>
          </div>
          <div class="guide-hero-stack" aria-hidden="true">
${guide.cards.slice(0, 3).map(({ card }, index) => {
  const previewImage = card.imageSmall || card.imageLarge;
  return previewImage ? `            <img src="${escapeAttribute(previewImage)}" alt="" class="guide-stack-card guide-stack-card-${index + 1}" />` : "";
}).join("\n")}
          </div>
        </section>

        <section class="guide-card-list" aria-label="Cards in this guide">
${guide.cards.map((entry, index) => renderGuideCard(entry, index, guide.slug)).join("\n")}
        </section>
      </main>
${renderSiteFooter()}
    </div>
    ${renderCardDetailDialog()}
    <div class="toast hidden" id="toast" role="status" aria-live="polite"></div>
    <script src="${assetUrl("../../", "prices.js")}"></script>
    <script src="${assetUrl("../../", "app.js")}"></script>
  </body>
</html>
`;
}


function renderGuideCard(entry, index, guideSlug) {
  return renderCardEntry({
    card: entry.card,
    index,
    text: entry.reason || entry.card.whyItBelongs,
    linkAttributes: (part) => guideCardLinkAttributes(entry.card, guideSlug, `guide_card_${part}`),
  });
}

// Lets the page open the card in the lightbox (data-card-id) and tracks guide_card_selected.
function guideCardLinkAttributes(card, guideSlug, source) {
  const attributes = {
    "card-id": getCardIdentity(card),
    "analytics-event": "guide_card_selected",
    "analytics-source": source,
    "analytics-guide-slug": guideSlug || "",
    "analytics-card-name": card.name || "",
    "analytics-card-pokemon": card.pokemon || "",
    "analytics-card-set": card.setName || "",
    "analytics-card-number": card.number || "",
    "analytics-card-rarity": card.rarity || "",
    "analytics-card-language": card.language || "",
  };
  return dataAttributes(attributes);
}
