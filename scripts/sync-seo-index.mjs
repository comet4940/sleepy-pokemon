import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { renderSiteHeader } from "./site-header.mjs";
import { renderSiteFooter, syncSiteFooter } from "./site-footer.mjs";

const SITE_URL = "https://www.sleepypokemon.com";
const GUIDE_PATH = "docs/published-cards.json";
const INDEX_PATH = "docs/index.html";
const COLLECTION_PATH = "docs/collection/index.html";
const CARDS_DIR = "docs/cards";
const SITEMAP_PATH = "docs/sitemap.xml";
const START = "<!-- SEO_CARD_INDEX_START -->";
const END = "<!-- SEO_CARD_INDEX_END -->";

const guide = JSON.parse(await readFile(GUIDE_PATH, "utf8"));
const cards = Array.isArray(guide) ? guide : guide.cards;

if (!Array.isArray(cards)) {
  throw new Error(`${GUIDE_PATH} does not contain a cards array.`);
}

const cardsWithSlugs = assignSlugs(cards);
const sortedCards = [...cardsWithSlugs].sort((a, b) => {
  return String(a.pokemon || "").localeCompare(String(b.pokemon || ""))
    || String(a.name || "").localeCompare(String(b.name || ""))
    || String(a.setName || "").localeCompare(String(b.setName || ""));
});

await writeCardPages(cardsWithSlugs);
await syncHomepage();
await syncCollectionIndex(sortedCards);
await writeSitemap(cardsWithSlugs);

console.log(`Synced ${cardsWithSlugs.length} card pages, crawlable index, and sitemap.`);
await import("./sync-guides.mjs");

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

async function writeCardPages(cardList) {
  await rm(CARDS_DIR, { recursive: true, force: true });
  await mkdir(CARDS_DIR, { recursive: true });

  await Promise.all(cardList.map(async (card) => {
    const dir = `${CARDS_DIR}/${card.slug}`;
    await mkdir(dir, { recursive: true });
    await writeFile(`${dir}/index.html`, renderCardPage(card), "utf8");
  }));
}

async function syncHomepage() {
  let html = await readFile(INDEX_PATH, "utf8");
  html = html.replace(
    /      <!-- SITE_HEADER_START -->[\s\S]*?      <!-- SITE_HEADER_END -->/,
    `      <!-- SITE_HEADER_START -->\n${renderSiteHeader()}\n      <!-- SITE_HEADER_END -->`,
  );
  html = syncSiteFooter(html);
  if (html.includes(START) && html.includes(END)) {
    html = html.replace(new RegExp(`\\s*${escapeRegExp(START)}[\\s\\S]*?${escapeRegExp(END)}`), "");
  }
  await writeFile(INDEX_PATH, html, "utf8");
}

async function syncCollectionIndex(cardList) {
  const items = cardList.map((card) => {
    const title = [card.name, card.number ? `#${card.number}` : ""].filter(Boolean).join(" ");
    const details = [card.pokemon, card.setName, card.rarity, card.language].filter(Boolean).join(" • ");
    return `              <li><a href="../cards/${escapeAttribute(card.slug)}/"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(details)}</span></a></li>`;
  }).join("\n");

  const section = `${START}
        <section class="seo-card-index" aria-labelledby="seoCardIndexTitle">
          <div class="seo-card-index-inner">
            <p class="eyebrow">Crawlable card index</p>
            <h2 id="seoCardIndexTitle">All ${cardList.length} sleepy Pokemon cards in this guide</h2>
            <p class="notes">A text index of the curated sleepy Pokemon card list for collectors and search engines.</p>
            <ol>
${items}
            </ol>
          </div>
        </section>
        ${END}`;

  let html = await readFile(COLLECTION_PATH, "utf8");
  html = html.replace(
    /      <!-- SITE_HEADER_START -->[\s\S]*?      <!-- SITE_HEADER_END -->/,
    `      <!-- SITE_HEADER_START -->\n${renderSiteHeader("../")}\n      <!-- SITE_HEADER_END -->`,
  );
  html = syncSiteFooter(html);
  if (html.includes(START) && html.includes(END)) {
    html = html.replace(new RegExp(`${escapeRegExp(START)}[\\s\\S]*?${escapeRegExp(END)}`), section);
  } else {
    html = html.replace("    </div>", `${section}\n    </div>`);
  }
  await writeFile(COLLECTION_PATH, html, "utf8");
}

async function writeSitemap(cardList) {
  const homepageLastmod = getNewestDate([
    guide.priceRefreshedAt,
    guide.exportedAt,
    ...cardList.map(getCardLastmod),
  ]);
  const urls = [
    sitemapUrl(`${SITE_URL}/`, homepageLastmod, "daily", "1.0"),
    sitemapUrl(`${SITE_URL}/collection/`, homepageLastmod, "daily", "0.9"),
    ...cardList.map((card) => sitemapUrl(`${SITE_URL}/cards/${card.slug}/`, getCardLastmod(card), "weekly", "0.8")),
  ].join("\n");
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
  await writeFile(SITEMAP_PATH, sitemap, "utf8");
}

function renderCardPage(card) {
  const title = `${card.name} Sleepy Pokemon Card - ${[card.setName, card.number].filter(Boolean).join(" ")}`.trim();
  const description = buildDescription(card);
  const visibleDescription = buildVisibleSummary(card);
  const pageHeading = `${card.name || card.pokemon || "Pokemon"} Sleepy Pokemon Card`;
  const imageAlt = buildImageAlt(card);
  const canonicalUrl = `${SITE_URL}/cards/${card.slug}/`;
  const image = card.imageLarge || card.imageSmall || `${SITE_URL}/assets/sleepy-pokemon.png`;
  const price = numericOrNull(card.priceMarket);
  const priceLabel = price === null ? "No current market price" : formatCurrency(price);
  const release = formatDate(card.setReleaseDate) || "Unknown";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemPage",
    name: title,
    url: canonicalUrl,
    description,
    image,
    about: {
      "@type": "Thing",
      name: card.name || card.pokemon || "Pokemon card",
      description,
    },
  };

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeAttribute(description)}" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${escapeAttribute(canonicalUrl)}" />
    <link rel="icon" href="../../assets/favicon.svg" type="image/svg+xml" />
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
    <script defer src="../../analytics.js" data-page-type="card" data-card-name="${escapeAttribute(card.name || "")}" data-card-pokemon="${escapeAttribute(card.pokemon || "")}" data-card-set="${escapeAttribute(card.setName || "")}"></script>
    <link rel="stylesheet" href="../../styles.css?v=3" />
    <link rel="stylesheet" href="../../card-detail-v3.css" />
  </head>
  <body data-app-mode="card-page">
    <div class="app-shell card-page-shell">
      ${renderSiteHeader("../../")}

      <main class="card-page-main">
        <article class="card-detail-frame card-detail-v3 card-page-detail">
          <div class="detail-art-column">
            <div class="detail-image-frame">
            ${image ? `<img src="${escapeAttribute(image)}" alt="${escapeAttribute(imageAlt)}" />` : `<div class="image-fallback">${escapeHtml(card.name)}</div>`}
            </div>
            <a class="detail-full-link" href="../../collection/"><span aria-hidden="true">←</span> Back to the sleepy stack</a>
          </div>
          <div class="detail-copy">
            <p class="detail-kicker">Caught napping</p>
            <h1>${escapeHtml(card.name || card.pokemon || "Pokemon")}</h1>
            <p class="card-subtitle">${escapeHtml([card.setName, card.number, card.rarity].filter(Boolean).join(" · "))}</p>
            <div class="detail-price-row">
              ${price === null
                ? `<span class="detail-no-price">No current market price</span>`
                : `<strong>${escapeHtml(priceLabel)}</strong><span>market · ${escapeHtml(card.priceSource || "TCGPlayer")}${card.priceUpdatedAt ? ` · as of ${escapeHtml(formatShortDate(card.priceUpdatedAt))}` : ""}</span>`}
            </div>
            <div class="curation-note">
              <strong>Why it belongs.</strong> ${escapeHtml(card.whyItBelongs || card.notes || "A curator's note is coming soon.")}
            </div>
${renderCurationFacts(card)}
${renderMoods(card)}
            <div class="meta-grid">
              ${metaItem("Set", card.setName)}
              ${metaItem("Number", card.number)}
              ${metaItem("Rarity", card.rarity)}
              ${metaItem("Artist", card.artist || "Unknown")}
              ${metaItem("Release", release)}
              ${metaItem("Language", card.language || "English")}
            </div>
          </div>
        </article>
      </main>
${renderSiteFooter()}
    </div>
  </body>
</html>
`;
}

function metaItem(label, value) {
  return `              <div class="meta-item">
                <span>${escapeHtml(label)}</span>
                <strong>${escapeHtml(value || "-")}</strong>
              </div>`;
}

function renderCurationFacts(card) {
  const facts = [
    ["Nap classification", card.sleepinessBasis],
    ["Sleep location", card.sleepLocation],
  ].filter(([, value]) => value);
  const factMarkup = facts.map(([label, value]) => `<div class="curation-fact"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`);
  if (card.sleepiness) factMarkup.push(renderSleepinessFact(card.sleepiness));
  return factMarkup.length ? `<div class="curation-facts">${factMarkup.join("")}</div>` : "";
}

function renderSleepinessFact(value) {
  const match = String(value).match(/^(\d+)/);
  const level = match ? Math.max(0, Math.min(5, Number(match[1]))) : 0;
  const label = String(value).replace(/^\d+\s*[—-]?\s*/, "");
  const zzz = Array.from({ length: 5 }, (_, index) => `<span class="sleepiness-zzz${index < level ? " is-filled" : ""}">Z</span>`).join("");
  return `<div class="curation-fact curation-fact--sleepiness"><span>Sleepiness</span><strong><span class="sleepiness-meter" aria-label="${escapeAttribute(value)}">${zzz}</span><span class="sleepiness-label">${escapeHtml(label || value)}</span></strong></div>`;
}

function renderMoods(card) {
  if (!Array.isArray(card.moods) || !card.moods.length) return "";
  return `<div class="detail-moods">${card.moods.map((mood) => `<span class="mood-tag">${escapeHtml(formatMoodLabel(mood))}</span>`).join("")}</div>`;
}

function formatMoodLabel(value) {
  return String(value || "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatShortDate(value) {
  const match = String(value || "").match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function buildDescription(card) {
  const artist = card.artist ? ` illustrated by ${card.artist}` : "";
  const setPart = card.setName ? ` from ${card.setName}` : "";
  return `${card.name || card.pokemon}${setPart} is a sleepy Pokemon card${artist}. View set, number, rarity, release date, and collector details.`.replace(/\s+/g, " ").trim();
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
    guide.exportedAt,
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

function formatDate(value) {
  const normalized = normalizeDate(value);
  if (!normalized) return "";
  const date = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric" }).format(date);
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
