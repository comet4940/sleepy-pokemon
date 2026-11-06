import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { renderSiteHeader } from "./site-header.mjs";
import { renderSiteFooter, syncSiteFooter } from "./site-footer.mjs";
import {
  SITE_URL,
  buildImageAlt,
  escapeAttribute,
  escapeHtml,
  escapeRegExp,
  assetUrl,
  CARD_SLUGS_PATH,
  loadCardData,
  loadPublishedSlugs,
  publishedSlugsJson,
  loadGuideDefs,
  normalizeDate,
  renderHead,
  renderPriceSlot,
  slugify,
  syncAssetVersions,
} from "./build-helpers.mjs";
import { getSetHubs, loadSetDefs } from "./set-pages.mjs";
import { getCardIdentity } from "./card-identity.mjs";
import { renderCardDetailDialog } from "./card-detail-dialog.mjs";

// The hand-written homepage and collection carry the shared lightbox markup too.
const CARD_DETAIL_DIALOG = /<dialog id="cardDetailDialog"[\s\S]*?<\/dialog>/;

const INDEX_PATH = "docs/index.html";
const FEATURED_PATH = "docs/featured.json";
const COLLECTION_PATH = "docs/collection/index.html";
const CARDS_DIR = "docs/cards";
const START = "<!-- SEO_CARD_INDEX_START -->";
const END = "<!-- SEO_CARD_INDEX_END -->";

const { cards: cardsWithSlugs } = await loadCardData();
const guideDefinitions = await loadGuideDefs();
const guideMemberships = buildGuideMemberships(guideDefinitions);
const setHubByName = new Map(getSetHubs(cardsWithSlugs, await loadSetDefs()).map((hub) => [hub.name, hub]));
// Card page related rows (#249, renderRelatedCards): up to this many other cards per row. Four plus the card you're
// on makes five, the size at which a set gets its own page, so every set with a page shows the same row.
const RELATED_LIMIT = 4;
// Pokémon with a guide of their own: their row links to it instead of a collection search.
const POKEMON_GUIDES = { Snorlax: "sleepy-snorlax-cards", Pikachu: "sleepiest-pikachu-cards" };
const cardsByPokemon = groupBy(cardsWithSlugs, (card) => card.pokemon);
const cardsBySet = groupBy(cardsWithSlugs, (card) => card.setName);
const guideBySlug = new Map(guideDefinitions.map((guide) => [guide.slug, guide]));
const sortedCards = [...cardsWithSlugs].sort((a, b) => {
  return String(a.pokemon || "").localeCompare(String(b.pokemon || ""))
    || String(a.name || "").localeCompare(String(b.name || ""))
    || String(a.setName || "").localeCompare(String(b.setName || ""));
});

await writeCardPages(cardsWithSlugs);
await recordPublishedSlugs(cardsWithSlugs);
await syncHomepage();
await syncCollectionIndex(sortedCards);

console.log(`Synced ${cardsWithSlugs.length} card pages and the crawlable index.`);
// sync-guides.mjs writes the guide, About and sitemap pages, so one run of this script rebuilds everything.
await import("./sync-guides.mjs");

// Adds new card page addresses to data/card-slugs.json. Never removes one: the validator fails if a recorded
// address no longer has a card (pin the card's old slug instead, as DATA-MODEL.md describes).
async function recordPublishedSlugs(cardList) {
  const recorded = await loadPublishedSlugs();
  const next = publishedSlugsJson([...recorded, ...cardList.map((card) => card.slug)]);
  const current = await readFile(CARD_SLUGS_PATH, "utf8").catch(() => "");
  if (next !== current) await writeFile(CARD_SLUGS_PATH, next, "utf8");
}

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
  html = syncAssetVersions(syncSiteFooter(html)).replace(CARD_DETAIL_DIALOG, renderCardDetailDialog());
  html = html.replace(
    /            <!-- FEATURED_START -->[\s\S]*?            <!-- FEATURED_END -->/,
    `            <!-- FEATURED_START -->\n${await renderFeaturedCard()}\n            <!-- FEATURED_END -->`,
  );
  if (html.includes(START) && html.includes(END)) {
    html = html.replace(new RegExp(`\\s*${escapeRegExp(START)}[\\s\\S]*?${escapeRegExp(END)}`), "");
  }
  await writeFile(INDEX_PATH, html, "utf8");
}

// The homepage's "Featured sleeper": the card scripts/rotate-featured.mjs picked for this week. It links to the
// card page and opens the lightbox on the homepage (card_opened, interaction_source homepage_featured).
async function renderFeaturedCard() {
  const { showing } = JSON.parse(await readFile(FEATURED_PATH, "utf8"));
  const card = cardsWithSlugs.find((item) => item.slug === showing);
  if (!card) throw new Error(`${FEATURED_PATH}: showing ${showing} is not a published card.`);
  return `            <a class="hero-card" href="cards/${escapeAttribute(card.slug)}/" data-card-id="${escapeAttribute(getCardIdentity(card))}" data-card-slug="${escapeAttribute(card.slug)}" data-lightbox-source="homepage_featured" aria-label="Open ${escapeAttribute(card.name)}, this week's featured sleeper">
              <img src="${escapeAttribute(card.imageLarge || card.imageSmall)}" alt="${escapeAttribute(buildImageAlt(card))}" />
              <div class="hero-card-meta"><strong>${escapeHtml(card.name)}</strong><span>${escapeHtml([card.setName, card.number].filter(Boolean).join(" · "))}</span></div>
            </a>`;
}

// "Add to wishlist" on the card page and in the lightbox (which shows this page's details). Written unpressed;
// card-page.js (card pages) or app.js (the lightbox) sets its state from the visitor's wishlist (#119).
function renderWishButton(card) {
  return `<div class="detail-wish-row"><button class="detail-wish" type="button" data-wish-slug="${escapeAttribute(card.slug)}" data-wish-name="${escapeAttribute(card.name || card.pokemon || "this card")}" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2.8l2.75 5.6 6.15.9-4.45 4.33 1.05 6.12L12 16.87l-5.5 2.88 1.05-6.12L3.1 9.3l6.15-.9z" /></svg><span class="detail-wish-label">Add to wishlist</span></button><span class="sr-only" role="status" aria-live="polite" data-wish-status></span></div>`;
}

// The starry sky a wished card's art frame twinkles with. Written into the card page's frame so the lightbox
// (which shows this page's details) gets it too. Must match renderWishSky() in docs/app.js (the validator checks).
function renderWishSky() {
  const WISH_SPARKLE_PATH = "M12 0c1 7 5 11 12 12-7 1-11 5-12 12-1-7-5-11-12-12 7-1 11-5 12-12z";
  const WISH_SKY_STARS = [[8, 4, 2.4, 0], [26, 2.5, 1.6, 0.9], [50, 3, 2, 0.4], [74, 2.5, 1.8, 1.4], [93, 6, 2.2, 0.2], [3, 22, 1.8, 1.1], [97, 30, 2, 0.7], [2.5, 48, 2.2, 1.8], [97.5, 62, 1.6, 0.3], [3, 80, 2, 1.3], [96, 88, 2.4, 0.6], [18, 97, 2, 1.6], [44, 97.5, 1.6, 0.1], [70, 97, 2.2, 1], [88, 98, 1.8, 1.9]];
  const sparkle = `<svg viewBox="0 0 24 24" focusable="false"><path d="${WISH_SPARKLE_PATH}" /></svg>`;
  const stars = WISH_SKY_STARS.map(([x, y, size, delay]) => `<i style="left:${x}%;top:${y}%;--size:${size}px;--delay:${delay}s;--length:${(2.4 + (delay % 1.2)).toFixed(1)}s"></i>`).join("");
  return `<span class="wish-sky" aria-hidden="true">${stars}<b class="wish-sparkle is-cream">${sparkle}</b><b class="wish-sparkle is-pink">${sparkle}</b><b class="wish-sparkle is-lavender">${sparkle}</b></span>`;
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
  html = syncAssetVersions(syncSiteFooter(html)).replace(CARD_DETAIL_DIALOG, renderCardDetailDialog());
  html = html.replace(
    /(<span class="collection-meta" id="collectionMeta">)[^<]*(<\/span>)/,
    `$1${cardList.length} cards · zero alarm clocks$2`,
  );
  // The title, description and social titles name the live card count ("All 261 Sleeping Pokemon Cards…").
  html = html
    .replace(/(<title>All )\d+( Sleeping Pokemon Cards)/, `$1${cardList.length}$2`)
    .replace(/(<meta (?:property="og:title"|name="twitter:title") content="All )\d+( Sleeping Pokemon Cards)/g, `$1${cardList.length}$2`)
    .replace(/(<meta name="description" content="[^"]*all )\d+( in one place)/, `$1${cardList.length}$2`);
  if (html.includes(START) && html.includes(END)) {
    html = html.replace(new RegExp(`${escapeRegExp(START)}[\\s\\S]*?${escapeRegExp(END)}`), section);
  } else {
    html = html.replace("    </div>", `${section}\n    </div>`);
  }
  await writeFile(COLLECTION_PATH, html, "utf8");
}

function renderCardPage(card, memberships) {
  const title = buildCardTitle(card);
  const description = buildDescription(card);
  const pageHeading = `${card.name || card.pokemon || "Pokemon"} Sleepy Pokemon Card`;
  const imageAlt = buildImageAlt(card);
  const canonicalUrl = `${SITE_URL}/cards/${card.slug}/`;
  const image = card.imageLarge || card.imageSmall || `${SITE_URL}/assets/sleepy-pokemon.png`;
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
  stylesheets: ["styles.css", "card-detail-v3.css", "site-chrome.css"],
})}
  </head>
  <body data-app-mode="card-page">
    <div class="app-shell card-page-shell">
      ${renderSiteHeader("../../")}

      <main class="card-page-main">
        <article class="card-detail-frame card-detail-v3 card-page-detail" data-card-slug="${escapeAttribute(card.slug)}">
          <div class="detail-art-column">
            <div class="detail-image-frame">
            ${renderWishSky()}
            ${image ? `<img src="${escapeAttribute(image)}" alt="${escapeAttribute(imageAlt)}" />` : `<div class="image-fallback">${escapeHtml(card.name)}</div>`}
            </div>
            <a class="detail-full-link" href="../../collection/" data-analytics-event="navigation_clicked" data-analytics-source="card_page" data-analytics-destination="collection"><span aria-hidden="true">←</span> Back to the sleepy stack</a>
          </div>
          <div class="detail-copy">
            <p class="detail-kicker">Caught napping</p>
            <h1>${escapeHtml(card.name || card.pokemon || "Pokemon")}</h1>
            <p class="card-subtitle">${escapeHtml([card.setName, card.number, card.rarity].filter(Boolean).join(" · "))}</p>
            ${renderPriceSlot(card, "row", "detail-price-row")}
            ${renderWishButton(card)}
            <div class="curation-note">
              <strong>Why it belongs.</strong>${renderCurationNoteBody(card.whyItBelongs || "A curator's note is coming soon.")}
            </div>
${renderFieldNotes(card, memberships)}
${renderMoods(card)}
            <div class="meta-grid">
              ${metaItem("Set", card.setName)}
              ${metaItem("Number", card.number)}
              ${metaItem("Rarity", card.rarity)}
              ${card.artist ? metaItem("Artist", card.artist, artistLink(card.artist)) : metaItem("Artist", "Unknown")}
              ${metaItem("Release", release)}
              ${metaItem("Language", card.language || "English")}
            </div>
          </div>
        </article>
${renderRelatedCards(card)}
      </main>
${renderSiteFooter()}
    </div>
    <script src="${assetUrl("../../", "prices.js")}"></script>
    <script src="${assetUrl("../../", "card-page.js")}"></script>
    <script>
      // The lightbox shows this page's address while it's open. Reloading there loads this page, and Back can then
      // land on the earlier page's history entry without loading it; load it.
      (() => {
        const path = location.pathname;
        addEventListener("popstate", () => {
          if (location.pathname !== path) location.reload();
        });
      })();
    </script>
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

// "More sleepy {Pokémon}" and "More from {set}" (#249): plain links to sibling card pages, so Google can reach every
// card page from others and visitors get a next click. They sit below the article, so the collection's lightbox
// (which copies the article) doesn't show them. Each row shows up to RELATED_LIMIT cards, then a link to see the rest.

function renderRelatedCards(card) {
  const samePokemon = (cardsByPokemon.get(card.pokemon) || [])
    .filter((other) => other.slug !== card.slug)
    .sort((a, b) => String(b.setReleaseDate || "").localeCompare(String(a.setReleaseDate || "")) || a.name.localeCompare(b.name));
  const shownPokemon = samePokemon.slice(0, RELATED_LIMIT);
  const shown = new Set(shownPokemon.map((other) => other.slug));
  const sameSet = (cardsBySet.get(card.setName) || [])
    .filter((other) => other.slug !== card.slug && !shown.has(other.slug))
    .sort((a, b) => String(a.number).localeCompare(String(b.number), "en", { numeric: true }));
  const rows = [];
  if (shownPokemon.length) {
    const guide = guideBySlug.get(POKEMON_GUIDES[card.pokemon]);
    const more = guide
      ? `<a class="related-more" href="../../guides/${escapeAttribute(guide.slug)}/" data-analytics-event="guide_opened" data-analytics-source="card_page_related" data-analytics-guide-slug="${escapeAttribute(guide.slug)}" data-analytics-guide-title="${escapeAttribute(guide.title)}">${escapeHtml(guide.title)} <span aria-hidden="true">→</span></a>`
      : samePokemon.length > RELATED_LIMIT
        ? `<a class="related-more" href="../../collection/?q=${encodeURIComponent(card.pokemon)}" data-analytics-event="navigation_clicked" data-analytics-source="card_page_related" data-analytics-destination="collection">See them all <span aria-hidden="true">→</span></a>`
        : "";
    rows.push(renderRelatedRow(`More sleepy ${card.pokemon}`, "related-pokemon", shownPokemon, (other) => other.setName, more));
  }
  if (sameSet.length) {
    const hub = setHubByName.get(card.setName);
    const shownSet = sameSet.slice(0, RELATED_LIMIT);
    const more = hub
      ? `<a class="related-more" href="../../sets/${escapeAttribute(hub.slug)}/" data-analytics-event="navigation_clicked" data-analytics-source="card_page_related" data-analytics-destination="set_page">See all cards from ${escapeHtml(hub.name)} <span aria-hidden="true">→</span></a>`
      : sameSet.length > RELATED_LIMIT
        ? `<a class="related-more" href="../../collection/?set=${escapeAttribute(slugify(card.setName))}" data-analytics-event="navigation_clicked" data-analytics-source="card_page_related" data-analytics-destination="collection">See them all <span aria-hidden="true">→</span></a>`
        : "";
    rows.push(renderRelatedRow(`More from ${card.setName}`, "related-set", shownSet, (other) => other.number, more));
  }
  if (!rows.length) return "";
  return `        <section class="card-related" aria-label="More sleepy cards">
${rows.join("\n")}
        </section>`;
}

function renderRelatedRow(heading, id, cardList, metaOf, more) {
  const items = cardList.map((other) => `            <li><a class="related-card" href="../../cards/${escapeAttribute(other.slug)}/" data-analytics-event="navigation_clicked" data-analytics-source="card_page_related" data-analytics-destination="card_page">
              ${other.imageSmall ? `<img src="${escapeAttribute(other.imageSmall)}" alt="" loading="lazy" decoding="async" />` : `<span class="related-card-fallback" aria-hidden="true"></span>`}
              <span class="related-card-name">${escapeHtml(other.name)}</span>
              <span class="related-card-meta">${escapeHtml(metaOf(other) || "")}</span>
            </a></li>`).join("\n");
  return `          <div class="related-row" aria-labelledby="${id}">
            <div class="related-row-head"><h2 id="${id}">${escapeHtml(heading)}</h2>${more}</div>
            <ul class="related-cards">
${items}
            </ul>
          </div>`;
}

function groupBy(list, keyOf) {
  const groups = new Map();
  for (const item of list) {
    const key = keyOf(item);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

function metaItem(label, value, href = "") {
  const text = escapeHtml(value || "-");
  return `              <div class="meta-item">
                <span>${escapeHtml(label)}</span>
                <strong>${href ? `<a class="meta-link" href="${escapeAttribute(href)}" data-analytics-event="navigation_clicked" data-analytics-source="card_page" data-analytics-destination="artist" data-analytics-filter-value="${escapeAttribute(slugify(value))}">${text}</a>` : text}</strong>
              </div>`;
}

// Every sleepy card by this artist. The collection matches on the slug, so case and punctuation don't matter.
function artistLink(artist) {
  return `../../collection/?artist=${slugify(artist)}`;
}

function renderMoods(card) {
  if (!Array.isArray(card.moods) || !card.moods.length) return "";
  // Each pill links to the collection filtered to that mood, matching the card lightbox.
  return `<div class="detail-moods">${card.moods.map((mood) => `<a class="mood-tag" href="../../collection/?mood=${escapeAttribute(slugify(mood))}" data-analytics-event="navigation_clicked" data-analytics-source="card_mood_pill" data-analytics-destination="collection" data-analytics-filter-value="${escapeAttribute(slugify(mood))}">${escapeHtml(mood)}</a>`).join("")}</div>`;
}

// The card page <title> (and social title), written for how people search for a card (#247):
//   the named Pokemon is the sleeper   "Sleepy Snorlax Card – Vivid Voltage 131/185 | Sleepy Pokemon"
//   the sleeper is someone else        "Lillie Card with a Sleeping Cosmog – Sun & Moon Promos 080/SM-P"
//   Cameo Sleepers (named one awake)   "Lapras Card with a Sleeping Cameo – ME: 30th Celebration 131/128"
// A card's own seoTitle overrides all of this. Gallery set names drop the part the number already shows
// ("Lost Origin TG05/TG30"), and the site name is added only while the title stays short.
function buildCardTitle(card) {
  if (card.seoTitle) return card.seoTitle;
  const name = card.name || card.pokemon || "Pokemon";
  const sleeper = card.pokemon || "";
  let head;
  if (sleeper && !name.toLowerCase().includes(sleeper.toLowerCase())) head = `${name} Card with a Sleeping ${sleeper}`;
  else if ((card.moods || []).includes("Cameo Sleepers")) head = `${name} Card with a Sleeping Cameo`;
  else head = `Sleepy ${name} Card`;
  const where = [shortSetName(card), card.number === "Unnumbered" ? "" : card.number].filter(Boolean).join(" ");
  const base = where ? `${head} – ${where}` : head;
  return base.length <= 44 ? `${base} | Sleepy Pokemon` : base;
}

function shortSetName(card) {
  const setName = card.setName || "";
  const number = String(card.number || "").toUpperCase();
  for (const [suffix, prefix] of [[" Trainer Gallery", "TG"], [" Galarian Gallery", "GG"], [" Radiant Collection", "RC"]]) {
    if (setName.endsWith(suffix) && number.startsWith(prefix)) return setName.slice(0, -suffix.length);
  }
  return setName;
}

// The meta description names the card and set, then the opening of the curator's own note (whyItBelongs).
// Search engines show about 160 characters, so it stops as soon as it can.
function buildDescription(card) {
  const number = card.number && card.number !== "Unnumbered" ? ` ${card.number}` : "";
  const where = card.setName ? `, ${card.setName}${number}` : "";
  const lead = `${card.name || card.pokemon}${where}.`;
  const note = String(card.whyItBelongs || "").replace(/\s+/g, " ").trim();
  if (!note) return `${lead} A sleepy Pokemon card, with set, number, rarity, release date and collector details.`;
  const sentences = note.match(/[^.!?]+(?:[.!?]+["”’)]?|$)\s*/g) || [note];
  // Whole sentences until there are about 100 characters and the nap itself has been mentioned, so a note
  // that opens with the awake character ("Lycanroc stands tall…") still reaches the sleeper; never past ~150.
  const SLEEP_WORDS = /\b(sleep\w*|asleep|nap\w*|doz\w*|snooz\w*|snor\w*|slumber\w*|out cold|dream\w*|drift\w* off|nodd\w* off)/i;
  let text = lead;
  let mentionsSleep = false;
  for (const sentence of sentences) {
    text = `${text} ${sentence.trim()}`;
    mentionsSleep ||= SLEEP_WORDS.test(sentence);
    if ((text.length >= 100 && mentionsSleep) || text.length >= 150) break;
  }
  text = text.trim();
  // A single long sentence can still run over; end it at a word break rather than let a search engine cut mid-word.
  return text.length <= 160 ? text : `${text.slice(0, 158).replace(/[\s,;:–—-]+\S*$/, "")}…`;
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

