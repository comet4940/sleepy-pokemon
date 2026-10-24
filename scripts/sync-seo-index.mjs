import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { renderSiteHeader } from "./site-header.mjs";
import { renderSiteFooter, syncSiteFooter } from "./site-footer.mjs";
import {
  SITE_URL,
  buildImageAlt,
  escapeAttribute,
  escapeHtml,
  escapeRegExp,
  formatCurrency,
  loadCardData,
  noPriceLabel,
  priceCredit,
  loadGuideDefs,
  normalizeDate,
  numericOrNull,
  renderHead,
  slugify,
  syncAssetVersions,
} from "./build-helpers.mjs";
import { getSetHubs, loadSetDefs } from "./set-pages.mjs";

const INDEX_PATH = "docs/index.html";
const COLLECTION_PATH = "docs/collection/index.html";
const CARDS_DIR = "docs/cards";
const START = "<!-- SEO_CARD_INDEX_START -->";
const END = "<!-- SEO_CARD_INDEX_END -->";

const { payload: cardData, cards: cardsWithSlugs } = await loadCardData();
const guideDefinitions = await loadGuideDefs();
const guideMemberships = buildGuideMemberships(guideDefinitions);
const setHubByName = new Map(getSetHubs(cardsWithSlugs, await loadSetDefs()).map((hub) => [hub.name, hub]));
const sortedCards = [...cardsWithSlugs].sort((a, b) => {
  return String(a.pokemon || "").localeCompare(String(b.pokemon || ""))
    || String(a.name || "").localeCompare(String(b.name || ""))
    || String(a.setName || "").localeCompare(String(b.setName || ""));
});

await writeCardPages(cardsWithSlugs);
await syncHomepage();
await syncCollectionIndex(sortedCards);

console.log(`Synced ${cardsWithSlugs.length} card pages and the crawlable index.`);
// sync-guides.mjs writes the guide, About and sitemap pages, so one run of this script rebuilds everything.
await import("./sync-guides.mjs");

async function writeCardPages(cardList) {
  await rm(CARDS_DIR, { recursive: true, force: true });
  await mkdir(CARDS_DIR, { recursive: true });

  await Promise.all(cardList.map(async (card) => {
    const dir = `${CARDS_DIR}/${card.slug}`;
    await mkdir(dir, { recursive: true });
    await writeFile(`${dir}/index.html`, renderCardPage(card, guideMemberships), "utf8");
  }));
}

async function syncHomepage() {
  let html = await readFile(INDEX_PATH, "utf8");
  html = html.replace(
    /      <!-- SITE_HEADER_START -->[\s\S]*?      <!-- SITE_HEADER_END -->/,
    `      <!-- SITE_HEADER_START -->\n${renderSiteHeader()}\n      <!-- SITE_HEADER_END -->`,
  );
  html = syncAssetVersions(syncSiteFooter(html));
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
  html = syncAssetVersions(syncSiteFooter(html));
  html = html.replace(
    /(<span class="collection-meta" id="collectionMeta">)[^<]*(<\/span>)/,
    `$1${cardList.length} cards · zero alarm clocks$2`,
  );
  if (html.includes(START) && html.includes(END)) {
    html = html.replace(new RegExp(`${escapeRegExp(START)}[\\s\\S]*?${escapeRegExp(END)}`), section);
  } else {
    html = html.replace("    </div>", `${section}\n    </div>`);
  }
  await writeFile(COLLECTION_PATH, html, "utf8");
}

function renderCardPage(card, memberships) {
  const title = `${card.name} Sleepy Pokemon Card - ${[card.setName, card.number].filter(Boolean).join(" ")}`.trim();
  const description = buildDescription(card);
  const pageHeading = `${card.name || card.pokemon || "Pokemon"} Sleepy Pokemon Card`;
  const imageAlt = buildImageAlt(card);
  const canonicalUrl = `${SITE_URL}/cards/${card.slug}/`;
  const image = card.imageLarge || card.imageSmall || `${SITE_URL}/assets/sleepy-pokemon.png`;
  const price = numericOrNull(card.priceMarket);
  const priceLabel = price === null ? noPriceLabel(card, cardData.priceRefreshedAt) : formatCurrency(price);
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
${renderHead({
  root: "../../",
  title,
  description,
  canonicalUrl,
  image,
  ogType: "article",
  twitter: true,
  // Card pages don't load the site fonts yet (to-do: shared header/footer styling).
  fonts: false,
  jsonLd,
  pageType: "card",
  analyticsData: {
    "card-name": card.name || "",
    "card-pokemon": card.pokemon || "",
    "card-set": card.setName || "",
    "card-number": card.number || "",
    "card-rarity": card.rarity || "",
    "card-language": card.language || "",
  },
  stylesheets: ["styles.css", "card-detail-v3.css"],
})}
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
            <a class="detail-full-link" href="../../collection/" data-analytics-event="navigation_clicked" data-analytics-source="card_page" data-analytics-destination="collection"><span aria-hidden="true">←</span> Back to the sleepy stack</a>
          </div>
          <div class="detail-copy">
            <p class="detail-kicker">Caught napping</p>
            <h1>${escapeHtml(card.name || card.pokemon || "Pokemon")}</h1>
            <p class="card-subtitle">${escapeHtml([card.setName, card.number, card.rarity].filter(Boolean).join(" · "))}</p>
            <div class="detail-price-row">
              ${price === null
                ? `<span class="detail-no-price">${escapeHtml(priceLabel)}</span>`
                : `<strong>${escapeHtml(priceLabel)}</strong><span>market · ${escapeHtml(priceCredit(card))}${card.priceUpdatedAt ? ` · as of ${escapeHtml(formatShortDate(card.priceUpdatedAt))}` : ""}</span>`}
            </div>
            <div class="curation-note">
              <strong>Why it belongs.</strong>${renderCurationNoteBody(card.whyItBelongs || "A curator's note is coming soon.")}
            </div>
${renderFieldNotes(card, memberships)}
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

function buildGuideMemberships(guideList) {
  const memberships = new Map();
  guideList.forEach((guide) => {
    (guide.cards || []).forEach((entry) => {
      const existing = memberships.get(entry.slug) || [];
      existing.push({ slug: guide.slug, title: guide.title });
      memberships.set(entry.slug, existing);
    });
  });
  return memberships;
}

// "In the field notes": the guides a card appears in, and its set page when the set has one.
function renderFieldNotes(card, memberships) {
  const guides = memberships.get(card.slug) || [];
  const hub = setHubByName.get(card.setName);
  if (!guides.length && !hub) return "";
  const lines = [];
  if (guides.length) {
    const links = guides.map((guide) => `<a href="../../guides/${escapeAttribute(guide.slug)}/" data-analytics-event="guide_opened" data-analytics-source="card_page" data-analytics-guide-slug="${escapeAttribute(guide.slug)}" data-analytics-guide-title="${escapeAttribute(guide.title)}">${escapeHtml(guide.title)}</a>`).join(" and ");
    lines.push(`<p>This card can be found in ${links}.</p>`);
  }
  if (hub) {
    lines.push(`<p>It's one of ${hub.cards.length} sleepy cards from <a href="../../sets/${escapeAttribute(hub.slug)}/" data-analytics-event="navigation_clicked" data-analytics-source="card_page" data-analytics-destination="set_page">${escapeHtml(hub.name)}</a>.</p>`);
  }
  return `            <div class="detail-guide-links"><p class="detail-guide-kicker">In the field notes</p>${lines.join("")}</div>\n`;
}

function metaItem(label, value) {
  return `              <div class="meta-item">
                <span>${escapeHtml(label)}</span>
                <strong>${escapeHtml(value || "-")}</strong>
              </div>`;
}

function renderMoods(card) {
  if (!Array.isArray(card.moods) || !card.moods.length) return "";
  // Each pill links to the collection filtered to that mood, matching the card lightbox.
  return `<div class="detail-moods">${card.moods.map((mood) => `<a class="mood-tag" href="../../collection/?mood=${escapeAttribute(slugify(mood))}" data-analytics-event="navigation_clicked" data-analytics-source="card_mood_pill" data-analytics-destination="collection" data-analytics-filter-value="${escapeAttribute(slugify(mood))}">${escapeHtml(mood)}</a>`).join("")}</div>`;
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


function formatDate(value) {
  const normalized = normalizeDate(value);
  if (!normalized) return "";
  const date = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric" }).format(date);
}

function renderCurationNoteBody(value) {
  const paragraphs = String(value).split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
  if (paragraphs.length < 2) {
    return ` ${escapeHtml(paragraphs[0] || "")}`;
  }
  return paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("");
}

