// Shared helpers for the page generators (sync-seo-index.mjs, sync-guides.mjs, about-page.mjs).
// Card page URLs come from slugify() and assignSlugs(), so every generator must use these copies.
import { readFile } from "node:fs/promises";
import { getCardIdentity } from "./card-identity.mjs";

export const SITE_URL = "https://www.sleepypokemon.com";
// The card data we edit. It isn't published: the generators write what browsers need (PUBLIC_CARD_FIELDS) into docs/.
export const CARDS_PATH = "data/cards.json";
export const PUBLISHED_CARDS_PATH = "docs/published-cards.json";
export const GUIDES_PATH = "docs/guides.json";
export const PRICES_PATH = "docs/prices.json";

// Cache-busting versions for every CSS and JS file. Bump a number here and run the generators;
// generated pages and the hand-written homepage and collection page all pick it up.
export const ASSET_VERSIONS = {
  "styles.css": 7,
  "site-chrome.css": 1,
  "home-v3.css": 27,
  "filter-drawer.css": 1,
  "card-detail-v3.css": 14,
  "guides.css": 5,
  "about.css": 4,
  "analytics.js": 5,
  "prices.js": 2,
  "app.js": 59,
  "site-header.js": 1,
};

export function assetUrl(root, file) {
  if (!(file in ASSET_VERSIONS)) throw new Error(`No version for ${file} in ASSET_VERSIONS`);
  return `${root}${file}?v=${ASSET_VERSIONS[file]}`;
}

// Rewrites every "<file>?v=<n>" in a hand-written page to the current version.
export function syncAssetVersions(html) {
  return Object.entries(ASSET_VERSIONS).reduce(
    (result, [file, version]) => result.replace(new RegExp(`${escapeRegExp(file)}\\?v=\\d+`, "g"), `${file}?v=${version}`),
    html,
  );
}

// The card fields browsers get, in docs/published-cards.json and each page's cards.json: exactly the ones
// docs/app.js normalizeCard reads (validate-analytics.mjs checks). Everything else in data/cards.json, such as
// notes, TCGplayer IDs and image sources, stays in the repo. A new field is private until it's added here.
export const PUBLIC_CARD_FIELDS = [
  "apiId",
  "tcgdexId",
  "name",
  "pokemon",
  "setName",
  "setSeries",
  "setId",
  "number",
  "rarity",
  "language",
  "artist",
  "imageSmall",
  "imageLarge",
  "setReleaseDate",
  "whyItBelongs",
  "createdAt",
  "updatedAt",
  "slug",
  "moods",
];

export function toPublicCard(card) {
  return Object.fromEntries(PUBLIC_CARD_FIELDS.filter((field) => field in card).map((field) => [field, card[field]]));
}

// A card data file for the browser (docs/published-cards.json or a page's cards.json).
export function publicCardsJson(cards) {
  return `${JSON.stringify({ cards: cards.map(toPublicCard) }, null, 2)}\n`;
}

export async function loadCardData() {
  const payload = JSON.parse(await readFile(CARDS_PATH, "utf8"));
  const cards = Array.isArray(payload) ? payload : payload.cards;
  if (!Array.isArray(cards)) throw new Error(`${CARDS_PATH} does not contain a cards array.`);
  return { payload, cards: assignSlugs(cards) };
}

// Market prices by card identity, written by scripts/refresh-prices.mjs (see DATA-MODEL.md).
export async function loadPrices() {
  try {
    return JSON.parse(await readFile(PRICES_PATH, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return { prices: {} };
    throw error;
  }
}

export async function loadGuideDefs() {
  try {
    const payload = JSON.parse(await readFile(GUIDES_PATH, "utf8"));
    return Array.isArray(payload) ? payload : payload.guides || [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export function assignSlugs(cardList) {
  const used = new Map();
  return cardList.map((card) => {
    const baseSlug = slugify([card.name, card.setName, card.number].filter(Boolean).join(" ")) || "card";
    const count = used.get(baseSlug) || 0;
    used.set(baseSlug, count + 1);
    return {
      ...card,
      // A stored slug pins the page address, e.g. when a set name is corrected after the page went live.
      slug: card.slug || (count ? `${baseSlug}-${count + 1}` : baseSlug),
    };
  });
}

export function slugify(value) {
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

// The shared <head> for generated pages. `root` is the relative path back to docs/ ("../" or "../../");
// `socialTitle` is the shorter title for link previews when the tab title carries a site suffix.
export function renderHead({
  root,
  title,
  socialTitle = title,
  description,
  canonicalUrl,
  image,
  ogType = "website",
  twitter = false,
  fonts = true,
  jsonLd,
  pageType,
  analyticsData = {},
  stylesheets,
}) {
  const analyticsAttributes = Object.entries(analyticsData)
    .map(([name, value]) => ` data-${name}="${escapeAttribute(value ?? "")}"`)
    .join("");
  return [
    `<meta charset="utf-8" />`,
    `<meta name="viewport" content="width=device-width, initial-scale=1" />`,
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeAttribute(description)}" />`,
    `<meta name="robots" content="index, follow" />`,
    `<link rel="canonical" href="${escapeAttribute(canonicalUrl)}" />`,
    `<link rel="icon" href="${root}assets/favicon.svg" type="image/svg+xml" />`,
    `<link rel="apple-touch-icon" href="${root}assets/sleepy-pokemon.png" />`,
    ...(fonts ? [
      `<link rel="preconnect" href="https://fonts.googleapis.com" />`,
      `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />`,
      `<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />`,
    ] : []),
    `<meta property="og:type" content="${ogType}" />`,
    `<meta property="og:site_name" content="Sleepy Pokemon Cards" />`,
    `<meta property="og:title" content="${escapeAttribute(socialTitle)}" />`,
    `<meta property="og:description" content="${escapeAttribute(description)}" />`,
    `<meta property="og:url" content="${escapeAttribute(canonicalUrl)}" />`,
    `<meta property="og:image" content="${escapeAttribute(image)}" />`,
    ...(twitter ? [
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${escapeAttribute(socialTitle)}" />`,
      `<meta name="twitter:description" content="${escapeAttribute(description)}" />`,
      `<meta name="twitter:image" content="${escapeAttribute(image)}" />`,
    ] : []),
    ...(jsonLd ? [`<script type="application/ld+json">${escapeScriptJson(JSON.stringify(jsonLd))}</script>`] : []),
    `<script defer src="${assetUrl(root, "analytics.js")}" data-page-type="${pageType}"${analyticsAttributes}></script>`,
    ...stylesheets.map((file) => `<link rel="stylesheet" href="${assetUrl(root, file)}" />`),
  ].map((line) => `    ${line}`).join("\n");
}

// One card in a guide or set page list. `linkAttributes(source)` returns the data-* attributes for the
// image and title links (lightbox card ID plus analytics); `text` is the note shown under the card.
export function renderCardEntry({ card, index, text, linkAttributes }) {
  const image = card.imageSmall || card.imageLarge;
  const details = [card.setName, card.number, card.rarity].filter(Boolean).join(" / ");
  const cardUrl = `../../cards/${card.slug}/`;
  return `          <article class="guide-card" id="card-${escapeAttribute(card.slug)}">
            <a class="guide-card-image" href="${escapeAttribute(cardUrl)}" aria-label="Preview ${escapeAttribute(card.name)} card details" ${linkAttributes("art")}>
              ${image ? `<img src="${escapeAttribute(image)}" alt="${escapeAttribute(buildImageAlt(card))}" loading="lazy" />` : `<div class="image-fallback">${escapeHtml(card.name)}</div>`}
            </a>
            <div class="guide-card-copy">
              <p class="eyebrow">#${index + 1} / ${escapeHtml(details || "Sleepy Pokemon card")}</p>
              <h2><a href="${escapeAttribute(cardUrl)}" ${linkAttributes("title")}>${escapeHtml(card.name)}</a></h2>
              <p class="card-subtitle">${escapeHtml([card.pokemon, card.language, card.artist || "Unknown artist"].filter(Boolean).join(" / "))}</p>
              ${renderPriceSlot(card, "pill", "price-pill guide-card-price")}
              <p>${escapeHtml(text)}</p>
            </div>
          </article>`;
}

// An empty slot that docs/prices.js fills from prices.json in the browser: "row" for the card page's
// price line, "pill" for guide and set page cards. Pages that use one must load prices.js.
export function renderPriceSlot(card, style, className) {
  return `<div class="${className}" ${dataAttributes({ "price-for": getCardIdentity(card), "price-style": style, "set-release": card.setReleaseDate || "" })}></div>`;
}

// Data attributes from a { name: value } map, escaped: data-name="value" ...
export function dataAttributes(attributes) {
  return Object.entries(attributes).map(([name, value]) => `data-${name}="${escapeAttribute(value ?? "")}"`).join(" ");
}

export function buildImageAlt(card) {
  const cardName = card.name || card.pokemon || "Pokemon";
  const setPart = card.setName ? ` from ${card.setName}` : "";
  return `${cardName} sleepy Pokemon card${setPart}`.replace(/\s+/g, " ").trim();
}

// Sitemap lastmod for a card: its newest curation change, falling back to when the card list was exported.
// Daily price updates don't count; prices aren't what the pages are about.
export function getCardLastmod(card, exportedAt) {
  return getNewestDate([card.updatedAt, card.createdAt, exportedAt]);
}

export function getNewestDate(values) {
  const dates = values
    .map(normalizeDate)
    .filter(Boolean)
    .sort();
  return dates.at(-1) || "2026-05-01";
}

export function normalizeDate(value) {
  if (!value) return "";
  const normalized = String(value).replaceAll("/", "-").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return "";
  const date = new Date(`${normalized}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? "" : normalized;
}

export function sitemapUrl(loc, lastmod, changefreq, priority) {
  return `  <url>
    <loc>${escapeHtml(loc)}</loc>
    <lastmod>${escapeHtml(lastmod)}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

export function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function numericOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function escapeAttribute(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

export function escapeScriptJson(value) {
  return value.replace(/</g, "\\u003c");
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
