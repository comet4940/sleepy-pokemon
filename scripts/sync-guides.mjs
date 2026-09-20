import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { renderSiteHeader } from "./site-header.mjs";
import { renderSiteFooter } from "./site-footer.mjs";

const SITE_URL = "https://www.sleepypokemon.com";
const GUIDE_PATH = "docs/published-cards.json";
const GUIDES_PATH = "docs/guides.json";
const INDEX_PATH = "docs/index.html";
const GUIDES_DIR = "docs/guides";
const SITEMAP_PATH = "docs/sitemap.xml";
const CARD_INDEX_START = "<!-- SEO_CARD_INDEX_START -->";
const GUIDE_INDEX_START = "<!-- SEO_GUIDE_INDEX_START -->";
const GUIDE_INDEX_END = "<!-- SEO_GUIDE_INDEX_END -->";

const guideData = JSON.parse(await readFile(GUIDE_PATH, "utf8"));
const cards = Array.isArray(guideData) ? guideData : guideData.cards;
const guideDefs = await loadGuideDefs();

if (!Array.isArray(cards)) {
  throw new Error(`${GUIDE_PATH} does not contain a cards array.`);
}

const cardsWithSlugs = assignSlugs(cards);
const cardBySlug = new Map(cardsWithSlugs.map((card) => [card.slug, card]));
const guides = guideDefs
  .map((guide) => resolveGuide(guide, cardBySlug))
  .filter((guide) => guide.slug && guide.cards.length);

await writeGuidePages(guides);
await syncHomepageGuideIndex(guides);
await writeSitemap(cardsWithSlugs, guides);

console.log(`Synced ${guides.length} guide pages.`);

async function loadGuideDefs() {
  try {
    const payload = JSON.parse(await readFile(GUIDES_PATH, "utf8"));
    return Array.isArray(payload) ? payload : payload.guides || [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

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

function assignSlugs(cardList) {
  const used = new Map();
  return cardList.map((card) => {
    const baseSlug = slugify([card.name, card.setName, card.number].filter(Boolean).join(" ")) || "card";
    const count = used.get(baseSlug) || 0;
    used.set(baseSlug, count + 1);
    return {
      ...card,
      slug: count ? `${baseSlug}-${count + 1}` : baseSlug,
    };
  });
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

async function writeSitemap(cardList, guideList) {
  const homepageLastmod = getNewestDate([
    guideData.priceRefreshedAt,
    guideData.exportedAt,
    ...cardList.map(getCardLastmod),
  ]);
  const urls = [
    sitemapUrl(`${SITE_URL}/`, homepageLastmod, "daily", "1.0"),
    sitemapUrl(`${SITE_URL}/collection/`, homepageLastmod, "daily", "0.9"),
    sitemapUrl(`${SITE_URL}/guides/`, homepageLastmod, "monthly", "0.9"),
    ...guideList.map((guide) => sitemapUrl(`${SITE_URL}/guides/${guide.slug}/`, homepageLastmod, "monthly", "0.9")),
    ...cardList.map((card) => sitemapUrl(`${SITE_URL}/cards/${card.slug}/`, getCardLastmod(card), "weekly", "0.8")),
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
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sleepy Pokemon Card Guides</title>
    <meta name="description" content="${escapeAttribute(description)}" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${SITE_URL}/guides/" />
    <link rel="icon" href="../assets/favicon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="../assets/sleepy-pokemon.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Sleepy Pokemon Cards" />
    <meta property="og:title" content="Sleepy Pokemon Card Guides" />
    <meta property="og:description" content="${escapeAttribute(description)}" />
    <meta property="og:url" content="${SITE_URL}/guides/" />
    <meta property="og:image" content="${escapeAttribute(guideList[0]?.cards[0]?.card.imageLarge || `${SITE_URL}/assets/sleepy-pokemon.png`)}" />
    <script defer src="../analytics.js?v=2" data-page-type="guides-index"></script>
    <link rel="stylesheet" href="../styles.css?v=3" />
    <link rel="stylesheet" href="../home-v3.css?v=3" />
    <link rel="stylesheet" href="../guides.css?v=1" />
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
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} | Sleepy Pokemon Cards</title>
    <meta name="description" content="${escapeAttribute(description)}" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${escapeAttribute(canonicalUrl)}" />
    <link rel="icon" href="../../assets/favicon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="../../assets/sleepy-pokemon.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />

    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="Sleepy Pokemon Cards" />
    <meta property="og:title" content="${escapeAttribute(title)}" />
    <meta property="og:description" content="${escapeAttribute(description)}" />
    <meta property="og:url" content="${escapeAttribute(canonicalUrl)}" />
    <meta property="og:image" content="${escapeAttribute(image)}" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeAttribute(title)}" />
    <meta name="twitter:description" content="${escapeAttribute(description)}" />
    <meta name="twitter:image" content="${escapeAttribute(image)}" />

    <script type="application/ld+json">${escapeScriptJson(JSON.stringify(jsonLd))}</script>
    <script defer src="../../analytics.js?v=2" data-page-type="guide" data-guide-slug="${escapeAttribute(guide.slug || "")}" data-guide-title="${escapeAttribute(title)}"></script>
    <link rel="stylesheet" href="../../styles.css?v=3" />
    <link rel="stylesheet" href="../../home-v3.css?v=3" />
    <link rel="stylesheet" href="../../guides.css?v=1" />
    <link rel="stylesheet" href="../../card-detail-v3.css" />
  </head>
  <body data-app-mode="guide-page" data-guide-path="../../published-cards.json" data-guides-path="../../guides.json" data-site-root="../../">
    <div class="app-shell guide-page-shell">
      ${renderSiteHeader("../../")}

      <main class="guide-page-main">
        <section class="guide-hero" aria-labelledby="guideTitle">
          <div class="guide-hero-copy">
            <a class="guide-back-link" href="../" data-analytics-event="navigation_clicked" data-analytics-source="guide_page" data-analytics-destination="guides"><span aria-hidden="true">←</span> All guides</a>
            <p class="eyebrow">${escapeHtml(guide.eyebrow || "Collector guide")} · ${guide.cards.length} cards</p>
            <h1 id="guideTitle">${escapeHtml(title)}</h1>
            <p>${escapeHtml(guide.description || description)}</p>
          </div>
          <div class="guide-hero-stack" aria-hidden="true">
${guide.cards.slice(0, 3).map(({ card }, index) => {
  const previewImage = card.imageSmall || card.imageLarge;
  return previewImage ? `            <img src="${escapeAttribute(previewImage)}" alt="" class="guide-stack-card guide-stack-card-${index + 1}" />` : "";
}).join("\n")}
          </div>
        </section>

        <section class="guide-card-list" aria-label="Cards in this guide">
${guide.cards.map((entry, index) => renderGuideCard(entry, index, guide.slug, title)).join("\n")}
        </section>
      </main>
${renderSiteFooter()}
    </div>
    ${renderCardDetailDialog()}
    <div class="toast hidden" id="toast" role="status" aria-live="polite"></div>
    <script src="../../app.js?v=12"></script>
  </body>
</html>
`;
}

function renderCardDetailDialog() {
  return `<dialog id="cardDetailDialog" class="card-detail-dialog">
      <div class="card-detail-frame card-detail-v3">
        <button class="icon-button detail-close" id="closeCardDetailButton" type="button" aria-label="Close card preview">×</button>
        <div class="detail-art-column"><div class="detail-image-frame" id="detailImageFrame"></div></div>
        <div class="detail-copy">
          <p class="detail-kicker" id="detailEyebrow">Caught napping</p>
          <h2 id="detailTitle"></h2>
          <p class="card-subtitle" id="detailSubtitle"></p>
          <div class="detail-price-row" id="detailPriceRow"></div>
          <div class="curation-note" id="detailCurationNote"></div>
          <div class="detail-guide-links" id="detailGuideLinks"></div>
          <div class="curation-facts" id="detailCurationFacts"></div>
          <div class="detail-moods" id="detailMoods"></div>
          <div class="meta-grid" id="detailMetaGrid"></div>
        </div>
      </div>
    </dialog>`;
}

function renderGuideCard(entry, index, guideSlug, guideTitle) {
  const card = entry.card;
  const image = card.imageSmall || card.imageLarge;
  const price = numericOrNull(card.priceMarket);
  const priceLabel = price === null ? "No current market price" : formatCurrency(price);
  const details = [card.setName, card.number, card.rarity].filter(Boolean).join(" / ");
  const cardUrl = `../../cards/${card.slug}/?fromGuide=${encodeURIComponent(guideSlug || "")}&guideTitle=${encodeURIComponent(guideTitle || "")}`;
  const cardId = getCardIdentity(card);
  return `          <article class="guide-card" id="card-${escapeAttribute(card.slug)}">
            <a class="guide-card-image" href="${escapeAttribute(cardUrl)}" aria-label="Preview ${escapeAttribute(card.name)} card details" data-card-id="${escapeAttribute(cardId)}" data-analytics-event="guide_card_selected" data-analytics-source="guide_card_art" data-analytics-guide-slug="${escapeAttribute(guideSlug || "")}" data-analytics-card-name="${escapeAttribute(card.name || "")}" data-analytics-card-pokemon="${escapeAttribute(card.pokemon || "")}" data-analytics-card-set="${escapeAttribute(card.setName || "")}">
              ${image ? `<img src="${escapeAttribute(image)}" alt="${escapeAttribute(buildImageAlt(card))}" loading="lazy" />` : `<div class="image-fallback">${escapeHtml(card.name)}</div>`}
            </a>
            <div class="guide-card-copy">
              <p class="eyebrow">#${index + 1} / ${escapeHtml(details || "Sleepy Pokemon card")}</p>
              <h2><a href="${escapeAttribute(cardUrl)}" data-card-id="${escapeAttribute(cardId)}" data-analytics-event="guide_card_selected" data-analytics-source="guide_card_title" data-analytics-guide-slug="${escapeAttribute(guideSlug || "")}" data-analytics-card-name="${escapeAttribute(card.name || "")}" data-analytics-card-pokemon="${escapeAttribute(card.pokemon || "")}" data-analytics-card-set="${escapeAttribute(card.setName || "")}">${escapeHtml(card.name)}</a></h2>
              <p class="card-subtitle">${escapeHtml([card.pokemon, card.language, card.artist || "Unknown artist"].filter(Boolean).join(" / "))}</p>
              <div class="price-pill guide-card-price">${escapeHtml(priceLabel)}</div>
              <p>${escapeHtml(entry.reason || card.notes || buildVisibleSummary(card))}</p>
            </div>
          </article>`;
}

function getCardIdentity(card) {
  return [card.apiId, card.tcgdexId, card.language, card.setName, card.number, card.name]
    .filter(Boolean)
    .join("::");
}

function buildVisibleSummary(card) {
  const cardName = card.name || card.pokemon || "This card";
  const setAndNumber = [card.setName, card.number].filter(Boolean).join(" ");
  const origin = setAndNumber ? ` from ${setAndNumber}` : "";
  const artist = card.artist ? ` illustrated by ${card.artist}` : "";
  const rarity = card.rarity ? ` This ${card.rarity} card` : " This card";
  return `${cardName}${origin} is a sleepy Pokemon card${artist}.${rarity} is part of the curated Sleepy Pokemon Cards guide.`.replace(/\s+/g, " ").trim();
}

function buildImageAlt(card) {
  const cardName = card.name || card.pokemon || "Pokemon";
  const setPart = card.setName ? ` from ${card.setName}` : "";
  return `${cardName} sleepy Pokemon card${setPart}`.replace(/\s+/g, " ").trim();
}

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90)
    .replace(/-+$/g, "");
}

function getCardLastmod(card) {
  return getNewestDate([
    card.updatedAt,
    card.priceUpdatedAt,
    card.createdAt,
    guideData.exportedAt,
  ]);
}

function getNewestDate(values) {
  const dates = values
    .map(normalizeDate)
    .filter(Boolean)
    .sort();
  return dates.at(-1) || "2026-05-01";
}

function sitemapUrl(loc, lastmod, changefreq, priority) {
  return `  <url>
    <loc>${escapeHtml(loc)}</loc>
    <lastmod>${escapeHtml(lastmod)}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

function normalizeDate(value) {
  if (!value) return "";
  const normalized = String(value).replaceAll("/", "-").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return "";
  const date = new Date(`${normalized}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? "" : normalized;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function numericOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

function escapeScriptJson(value) {
  return value.replace(/</g, "\\u003c");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
