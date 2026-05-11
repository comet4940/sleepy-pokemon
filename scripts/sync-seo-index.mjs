import { mkdir, readFile, rm, writeFile } from "node:fs/promises";

const SITE_URL = "https://www.sleepypokemon.com";
const GUIDE_PATH = "docs/published-cards.json";
const INDEX_PATH = "docs/index.html";
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
await syncIndex(sortedCards);
await writeSitemap(cardsWithSlugs);

console.log(`Synced ${cardsWithSlugs.length} card pages, crawlable index, and sitemap.`);

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

async function syncIndex(cardList) {
  const items = cardList.map((card) => {
    const title = [card.name, card.number ? `#${card.number}` : ""].filter(Boolean).join(" ");
    const details = [card.pokemon, card.setName, card.rarity, card.language].filter(Boolean).join(" • ");
    return `              <li><a href="cards/${escapeAttribute(card.slug)}/"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(details)}</span></a></li>`;
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

  let html = await readFile(INDEX_PATH, "utf8");
  if (html.includes(START) && html.includes(END)) {
    html = html.replace(new RegExp(`${escapeRegExp(START)}[\\s\\S]*?${escapeRegExp(END)}`), section);
  } else {
    html = html.replace("      </main>", `      </main>\n\n${section}`);
  }
  await writeFile(INDEX_PATH, html, "utf8");
}

async function writeSitemap(cardList) {
  const homepageLastmod = getNewestDate([
    guide.priceRefreshedAt,
    guide.exportedAt,
    ...cardList.map(getCardLastmod),
  ]);
  const urls = [
    sitemapUrl(`${SITE_URL}/`, homepageLastmod, "daily", "1.0"),
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
    <link rel="stylesheet" href="../../styles.css" />
  </head>
  <body data-app-mode="card-page">
    <div class="app-shell card-page-shell">
      <header class="topbar">
        <a class="brand-lockup card-page-brand" href="../../" aria-label="Back to Sleepy Pokemon Cards guide">
          <span class="brand-mark" aria-hidden="true"></span>
          <div>
            <p class="eyebrow">Sleepy card detail</p>
            <p class="brand-title">Sleepy Pokemon Cards</p>
          </div>
        </a>
        <div class="topbar-actions">
          <a class="button subtle" href="../../">Back to guide</a>
        </div>
      </header>

      <main class="card-page-main">
        <article class="card-detail-frame card-page-detail">
          <div class="detail-image-frame">
            ${image ? `<img src="${escapeAttribute(image)}" alt="${escapeAttribute(imageAlt)}" />` : `<div class="image-fallback">${escapeHtml(card.name)}</div>`}
          </div>
          <div class="detail-copy">
            <p class="eyebrow">${escapeHtml([card.setName, card.number].filter(Boolean).join(" / ") || "Card preview")}</p>
            <h1>${escapeHtml(pageHeading)}</h1>
            <p class="card-subtitle">${escapeHtml([card.pokemon, card.language, card.rarity].filter(Boolean).join(" / "))}</p>
            <p class="card-page-summary">${escapeHtml(visibleDescription)}</p>
            <div class="price-pill card-page-price">${escapeHtml(priceLabel)}</div>
            <div class="meta-grid">
              ${metaItem("Set", card.setName)}
              ${metaItem("Number", card.number)}
              ${metaItem("Rarity", card.rarity)}
              ${metaItem("Artist", card.artist || "Unknown")}
              ${metaItem("Release", release)}
              ${metaItem("Language", card.language || "English")}
            </div>
            ${card.notes ? `<p class="notes">${escapeHtml(card.notes)}</p>` : ""}
          </div>
        </article>
      </main>
    </div>
  </body>
</html>
`;
}

function metaItem(label, value) {
  return `
              <div class="meta-item">
                <span>${escapeHtml(label)}</span>
                <strong>${escapeHtml(value || "-")}</strong>
              </div>`;
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
