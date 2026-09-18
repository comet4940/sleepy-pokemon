import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";

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
  await mkdir(GUIDES_DIR, { recursive: true });

  const existingEntries = await readdir(GUIDES_DIR, { withFileTypes: true });
  await Promise.all(existingEntries
    .filter((entry) => !entry.name.startsWith("."))
    .map((entry) => rm(`${GUIDES_DIR}/${entry.name}`, { recursive: true, force: true })));

  await writeFile(`${GUIDES_DIR}/index.html`, renderGuideIndex(guideList), "utf8");

  await Promise.all(guideList.map(async (guide) => {
    const dir = `${GUIDES_DIR}/${guide.slug}`;
    await mkdir(dir, { recursive: true });
    await writeFile(`${dir}/index.html`, renderGuidePage(guide), "utf8");
  }));
}

async function syncHomepageGuideIndex(guideList) {
  const guideItems = guideList.map((guide) => {
    const description = guide.description || "Curated sleepy Pokemon card guide.";
    return `              <li><a href="guides/${escapeAttribute(guide.slug)}/"><strong>${escapeHtml(guide.title)}</strong><span>${escapeHtml(description)}</span></a></li>`;
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
    sitemapUrl(`${SITE_URL}/guides/`, homepageLastmod, "weekly", "0.9"),
    sitemapUrl(`${SITE_URL}/about/`, homepageLastmod, "monthly", "0.7"),
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

function renderGuideIndex(guideList) {
  const title = "Sleepy Pokemon Guides";
  const description = "A growing collection of Sleepy Pokemon card guides, curated by Comet for collectors who like a little more cozy in their binders.";
  const guideItems = guideList.map((guide) => `
          <article class="guide-index-item">
            <p class="eyebrow">${escapeHtml(guide.eyebrow || "Collector guide")}</p>
            <h2><a href="${escapeAttribute(guide.slug)}/">${escapeHtml(guide.title)}</a></h2>
            <p>${escapeHtml(guide.description || "A curated Sleepy Pokemon card guide for collectors.")}</p>
            <a class="button subtle" href="${escapeAttribute(guide.slug)}/">Read guide</a>
          </article>`).join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} | Sleepy Pokemon</title>
    <meta name="description" content="${escapeAttribute(description)}" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${SITE_URL}/guides/" />
    <link rel="icon" href="../assets/brand/sleepy-pokemon-favicon-v2.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="../styles.css" />
    <link rel="stylesheet" href="../home-v2.css" />
    <link rel="stylesheet" href="../guides-index.css" />
    <script defer src="../analytics.js" data-page-type="guides-index"></script>
    <script defer src="../home-theme.js?v=2"></script>
  </head>
  <body data-app-mode="guides-index">
    <div class="app-shell guides-index-shell">
      <header class="topbar">
        <a class="brand-lockup" href="../" aria-label="Sleepy Pokemon home">
          <svg class="sparkle-mark" viewBox="0 0 64 64" width="56" height="56" aria-hidden="true" focusable="false">
            <g transform="translate(51,11)"><path d="M 0 -7 C 0.8 -2.6 2.6 -0.8 7 0 C 2.6 0.8 0.8 2.6 0 7 C -0.8 2.6 -2.6 0.8 -7 0 C -2.6 -0.8 -0.8 -2.6 0 -7 Z" fill="currentColor"/></g>
            <g transform="translate(32,35.5) scale(0.86) translate(-32,-32)"><g transform="translate(2.4,-1)" stroke="currentColor" stroke-width="3.49" stroke-linejoin="round">
              <rect x="10" y="17" width="24" height="34" rx="6" fill="#E29684" transform="rotate(-14 22 34)"/>
              <rect x="27" y="14" width="24" height="34" rx="6" fill="#9FC8BC" transform="rotate(7 39 31)"/>
            </g></g>
          </svg>
          <div>
            <h1>Sleepy Pokemon</h1>
            <p class="brand-byline">A collection by Comet</p>
          </div>
        </a>
        <nav class="topbar-actions" aria-label="Main navigation">
          <a href="../#collection">Collection</a>
          <a href="./" aria-current="page">Guides</a>
          <a href="../about/">About</a>
          <button id="themeToggle" class="theme-toggle" type="button" role="switch" aria-checked="false" aria-label="Dark mode" title="Switch to dark mode"><span aria-hidden="true">Light</span><span class="theme-track" aria-hidden="true"><span class="theme-thumb"></span></span><span aria-hidden="true">Dark</span></button>
        </nav>
      </header>

      <main class="guides-index-main">
        <section class="guides-index-intro" aria-labelledby="guidesIndexTitle">
          <p class="eyebrow">Collector guides</p>
          <h2 id="guidesIndexTitle">Sleepy Pokemon guides</h2>
          <p>${escapeHtml(description)}</p>
        </section>
        <section class="guide-index-list" aria-label="Available guides">
${guideItems}
        </section>
      </main>
    </div>
  </body>
</html>
`;
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
    <link rel="icon" href="../../assets/brand/sleepy-pokemon-favicon-v2.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="../../assets/sleepy-pokemon.png" />

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
    <script defer src="../../analytics.js" data-page-type="guide" data-guide-slug="${escapeAttribute(guide.slug || "")}" data-guide-title="${escapeAttribute(title)}"></script>
    <link rel="stylesheet" href="../../styles.css" />
    <link rel="stylesheet" href="../../home-v2.css" />
    <script defer src="../../home-theme.js?v=2"></script>
  </head>
  <body data-app-mode="guide-page">
    <div class="app-shell guide-page-shell">
      <header class="topbar">
        <a class="brand-lockup" href="../../" aria-label="Sleepy Pokemon home">
          <svg class="sparkle-mark" viewBox="0 0 64 64" width="56" height="56" aria-hidden="true" focusable="false">
            <g transform="translate(51,11)"><path d="M 0 -7 C 0.8 -2.6 2.6 -0.8 7 0 C 2.6 0.8 0.8 2.6 0 7 C -0.8 2.6 -2.6 0.8 -7 0 C -2.6 -0.8 -0.8 -2.6 0 -7 Z" fill="currentColor"/></g>
            <g transform="translate(32,35.5) scale(0.86) translate(-32,-32)"><g transform="translate(2.4,-1)" stroke="currentColor" stroke-width="3.49" stroke-linejoin="round">
              <rect x="10" y="17" width="24" height="34" rx="6" fill="#E29684" transform="rotate(-14 22 34)"/>
              <rect x="27" y="14" width="24" height="34" rx="6" fill="#9FC8BC" transform="rotate(7 39 31)"/>
            </g></g>
          </svg>
          <div>
            <h1>Sleepy Pokemon</h1>
            <p class="brand-byline">A collection by Comet</p>
          </div>
        </a>
        <nav class="topbar-actions" aria-label="Main navigation">
          <a href="../../#collection">Collection</a>
          <a href="../../guides/">Guides</a>
          <a href="../../about/">About</a>
          <button id="themeToggle" class="theme-toggle" type="button" role="switch" aria-checked="false" aria-label="Dark mode" title="Switch to dark mode"><span aria-hidden="true">Light</span><span class="theme-track" aria-hidden="true"><span class="theme-thumb"></span></span><span aria-hidden="true">Dark</span></button>
        </nav>
      </header>

      <main class="guide-page-main">
        <section class="guide-hero" aria-labelledby="guideTitle">
          <p class="eyebrow">${escapeHtml(guide.eyebrow || "Collector guide")}</p>
          <h1 id="guideTitle">${escapeHtml(title)}</h1>
          <p>${escapeHtml(guide.description || description)}</p>
        </section>

        <section class="guide-card-list" aria-label="Cards in this guide">
${guide.cards.map((entry, index) => renderGuideCard(entry, index, guide.slug)).join("\n")}
        </section>
      </main>
    </div>
  </body>
</html>
`;
}

function renderGuideCard(entry, index, guideSlug) {
  const card = entry.card;
  const image = card.imageSmall || card.imageLarge;
  const price = numericOrNull(card.priceMarket);
  const priceLabel = price === null ? "No current market price" : formatCurrency(price);
  const details = [card.setName, card.number, card.rarity].filter(Boolean).join(" / ");
  return `          <article class="guide-card">
            <a class="guide-card-image" href="../../cards/${escapeAttribute(card.slug)}/" aria-label="View ${escapeAttribute(card.name)} card details" data-analytics-event="guide_card_clicked" data-analytics-guide-slug="${escapeAttribute(guideSlug || "")}" data-analytics-card-name="${escapeAttribute(card.name || "")}" data-analytics-card-pokemon="${escapeAttribute(card.pokemon || "")}" data-analytics-card-set="${escapeAttribute(card.setName || "")}">
              ${image ? `<img src="${escapeAttribute(image)}" alt="${escapeAttribute(buildImageAlt(card))}" loading="lazy" />` : `<div class="image-fallback">${escapeHtml(card.name)}</div>`}
            </a>
            <div class="guide-card-copy">
              <p class="eyebrow">#${index + 1} / ${escapeHtml(details || "Sleepy Pokemon card")}</p>
              <h2><a href="../../cards/${escapeAttribute(card.slug)}/" data-analytics-event="guide_card_clicked" data-analytics-guide-slug="${escapeAttribute(guideSlug || "")}" data-analytics-card-name="${escapeAttribute(card.name || "")}" data-analytics-card-pokemon="${escapeAttribute(card.pokemon || "")}" data-analytics-card-set="${escapeAttribute(card.setName || "")}">${escapeHtml(card.name)} Sleepy Pokemon Card</a></h2>
              <p class="card-subtitle">${escapeHtml([card.pokemon, card.language, card.artist || "Unknown artist"].filter(Boolean).join(" / "))}</p>
              <div class="price-pill guide-card-price">${escapeHtml(priceLabel)}</div>
              <p>${escapeHtml(entry.reason || card.notes || buildVisibleSummary(card))}</p>
            </div>
          </article>`;
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
