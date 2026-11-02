import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import vm from "node:vm";
import { getCardIdentity } from "./card-identity.mjs";
import { MOODS } from "./moods.mjs";
import { ASSET_VERSIONS, CARDS_PATH, CARD_SLUGS_PATH, PUBLIC_CARD_FIELDS, PUBLISHED_CARDS_PATH, assignSlugs, loadPublishedSlugs, publicCardsJson, slugify, toPublicCard } from "./build-helpers.mjs";

const ROOT = process.cwd();
const DOCS_DIR = join(ROOT, "docs");
const validPageTypes = new Set(["home", "collection", "guides-index", "guide", "sets-index", "set", "card", "about"]);
const errors = [];
const sourceCards = await loadSourceCards();
const catalogIdentities = new Set(sourceCards.map(getCardIdentity));
// What browsers get: the generated copy in docs/, with only PUBLIC_CARD_FIELDS.
const browserCards = assignSlugs(sourceCards).map(toPublicCard);
const browserCardJson = new Map(browserCards.map((card) => [getCardIdentity(card), JSON.stringify(card)]));
// The binder (docs/binder.js) saves cards by slug, so every card display carries data-card-slug.
const slugByIdentity = new Map(assignSlugs(sourceCards).map((card) => [getCardIdentity(card), card.slug]));
const currentSlugs = new Set(slugByIdentity.values());
// Elements that show a card and so carry its data-card-slug (see checkCardSlugs).
const CARD_DISPLAY_CLASSES = ["card-tile", "hero-card", "about-favorite", "about-chase-art", "card-page-detail"];
await checkPublishedSlugs();
await checkPublishedCopy();
checkCardMoods();
await checkSetIntros();
await checkGuideDates();
await checkCardFields();
await checkPrices();
await checkFeatured();
checkCardPageSlugs();
const legacyEvents = [
  "search_used",
  "header_search_submitted",
  "mood_filter_applied",
  "filter_applied",
  "sleepy_card_suggestion_clicked",
  "sleepy_card_submit_clicked",
  "guide_card_clicked",
];
const requiredAppEvents = [
  "catalog_loaded",
  "search_results_viewed",
  "search_cleared",
  "filters_opened",
  "filter_changed",
  "sort_changed",
  "filters_cleared",
  "card_opened",
  "card_navigated",
  "random_sleeper_clicked",
  "suggestion_opened",
  "suggestion_lookup_completed",
  "suggestion_card_selected",
  "suggestion_card_removed",
  "suggestion_submitted",
  "suggestion_submit_failed",
  "checklist_downloaded",
  "wishlist_toggled",
];

await checkChromeStyles();

const htmlFiles = (await walk(DOCS_DIR)).filter((path) => path.endsWith(".html"));
const pageTypeCounts = new Map();

for (const path of htmlFiles) {
  const html = await readFile(path, "utf8");
  const label = relative(ROOT, path);
  const pageType = html.match(/data-page-type="([^"]+)"/)?.[1];
  if (!pageType || !validPageTypes.has(pageType)) errors.push(`${label}: missing or invalid page type`);
  else pageTypeCounts.set(pageType, (pageTypeCounts.get(pageType) || 0) + 1);
  if (!html.includes(`analytics.js?v=${ASSET_VERSIONS["analytics.js"]}`)) errors.push(`${label}: analytics script is not versioned at v${ASSET_VERSIONS["analytics.js"]}`);
  // The header's wishlist entry (★ beside ☰ on phones, "Wishlist" in the menu) and the binder.js that feeds its count.
  if ((html.match(/data-analytics-destination="wishlist"/g) || []).length !== 2 || (html.match(/data-wishlist-count/g) || []).length !== 2) errors.push(`${label}: header wishlist entry (phone ★ and menu link, each with a count) is missing`);
  if (!html.includes(`binder.js?v=${ASSET_VERSIONS["binder.js"]}`)) errors.push(`${label}: doesn't load binder.js?v=${ASSET_VERSIONS["binder.js"]} (the header's wishlist count needs it)`);
  // The header's phone menu (☰) only opens with site-header.js.
  if (!html.includes(`site-header.js?v=${ASSET_VERSIONS["site-header.js"]}`)) errors.push(`${label}: header menu script is missing or not versioned at v${ASSET_VERSIONS["site-header.js"]}`);
  // The header and footer are styled by site-chrome.css alone (checkChromeStyles), loaded on every page.
  if (!html.includes(`site-chrome.css?v=${ASSET_VERSIONS["site-chrome.css"]}`)) errors.push(`${label}: site-chrome.css is missing or not versioned at v${ASSET_VERSIONS["site-chrome.css"]}`);
  // Price slots stay empty unless prices.js fills them, and each must name a published card.
  const priceSlots = [...html.matchAll(/data-price-for="([^"]*)"/g)].map(([, id]) => id.replaceAll("&amp;", "&").replaceAll("&#39;", "'").replaceAll("&quot;", '"'));
  if (priceSlots.length && !html.includes("prices.js?v=")) errors.push(`${label}: has price slots but doesn't load prices.js`);
  for (const id of priceSlots) if (!catalogIdentities.has(id)) errors.push(`${label}: price slot for unknown card ${id}`);
  if (!/data-analytics-event="navigation_clicked"[^>]+data-analytics-source="global_header"/.test(html)) {
    errors.push(`${label}: shared header navigation tracking is missing`);
  }
  const footer = html.match(/<!-- SITE_FOOTER_START -->([\s\S]*?)<!-- SITE_FOOTER_END -->/)?.[1];
  if (!footer) {
    errors.push(`${label}: shared footer is missing`);
  } else {
    if (!/data-analytics-event="studio_link_clicked"/.test(footer)) {
      errors.push(`${label}: shared footer studio-link tracking is missing`);
    }
    if (!/data-name="BMC-Widget"/.test(footer) || !/data-id="cometakira"/.test(footer) || !/data-color="#F36B9B"/.test(footer)) {
      errors.push(`${label}: Buy Me a Coffee widget is missing or off-brand`);
    }
    if (!footer.includes("Fan-made collection checklist. Pokémon and card art belong to their respective owners. Not affiliated with Pokémon or TCGplayer.")) {
      errors.push(`${label}: fan-made copyright disclaimer is missing`);
    }
    if (/class="footer-coffee"/.test(footer)) {
      errors.push(`${label}: legacy footer coffee link remains`);
    }
  }
  if (pageType === "card" && !/data-card-number=/.test(html)) errors.push(`${label}: card analytics metadata is incomplete`);
  if (pageType === "guide" && !/id="downloadChecklistButton"/.test(html)) {
    errors.push(`${label}: guide checklist download control is missing`);
  }
  if (pageType === "guide" || pageType === "set") checkGuideCards(html, label);
  checkCardSlugs(html, label, path);
  await checkPageCardData(path, html, label);
  for (const [, mood] of html.matchAll(/class="mood-chip"[^>]*data-mood="([^"]+)"/g)) {
    if (!MOODS.some((name) => slugify(name) === mood)) errors.push(`${label}: mood chip "${mood}" matches no mood in scripts/moods.mjs`);
  }
}

// Pages that load a card subset (data-guide-path) must find every card they link to in it, or the lightbox and
// checklist come up short.
async function checkPageCardData(path, html, label) {
  if (!html.includes("app.js?v=")) return;
  const dataPath = html.match(/data-guide-path="([^"]+)"/)?.[1] || "published-cards.json";
  let cards;
  try {
    const payload = JSON.parse(await readFile(join(path, "..", dataPath), "utf8"));
    cards = Array.isArray(payload) ? payload : payload.cards;
  } catch (error) {
    errors.push(`${label}: can't read its card data ${dataPath} (${error.message})`);
    return;
  }
  const loaded = new Set(cards.map(getCardIdentity));
  // Each copy must match published-cards.json card for card: no stale values, no fields beyond PUBLIC_CARD_FIELDS.
  const stale = cards.filter((card) => JSON.stringify(card) !== browserCardJson.get(getCardIdentity(card)));
  if (stale.length) errors.push(`${label}: ${dataPath} doesn't match ${CARDS_PATH} for ${stale.length} card(s), e.g. ${stale[0].name}; run scripts/sync-seo-index.mjs`);
  const missing = [...new Set([...html.matchAll(/data-card-id="([^"]*)"/g)].map(([, id]) => decodeHtmlAttribute(id)))].filter((id) => !loaded.has(id));
  if (missing.length) errors.push(`${label}: ${dataPath} is missing ${missing.length} card(s) the page links to, e.g. ${missing[0]}`);
}

const appSource = await readFile(join(DOCS_DIR, "app.js"), "utf8");
const analyticsSource = await readFile(join(DOCS_DIR, "analytics.js"), "utf8");
const guideSource = await readFile(join(ROOT, "scripts", "sync-guides.mjs"), "utf8");
const activeSources = `${appSource}\n${analyticsSource}\n${guideSource}`;

for (const eventName of legacyEvents) {
  if (activeSources.includes(`"${eventName}"`)) errors.push(`legacy event remains active: ${eventName}`);
}
for (const eventName of requiredAppEvents) {
  if (!appSource.includes(`"${eventName}"`)) errors.push(`missing app event: ${eventName}`);
}
if (!analyticsSource.includes('"search_submitted"')) errors.push("missing global search submission event");
checkAppCardIdentity(appSource);
checkRarityGroups(appSource);
checkChecklistDownloads(appSource);
checkAppCardSlugs(appSource);
const binderSource = await readFile(join(DOCS_DIR, "binder.js"), "utf8");
checkBinder(binderSource);
checkWishlistStar(appSource, binderSource);
checkCardPageWish(await readFile(join(DOCS_DIR, "card-page.js"), "utf8"), binderSource);
if (!analyticsSource.includes("productionHosts")) errors.push("local analytics traffic is not guarded");
if (!analyticsSource.includes("SLEEPY_ANALYTICS_VERSION")) errors.push("analytics contract version is missing");

if (errors.length) {
  console.error(`Analytics validation failed with ${errors.length} issue(s):`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

const counts = [...pageTypeCounts.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([type, count]) => `${type}: ${count}`)
  .join(", ");
console.log(`Analytics validation passed for ${htmlFiles.length} pages (${counts}).`);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  }));
  return paths.flat();
}

// docs/published-cards.json is generated from data/cards.json; an edit made there directly would be overwritten.
async function checkPublishedCopy() {
  const published = await readFile(join(ROOT, PUBLISHED_CARDS_PATH), "utf8").catch(() => "");
  if (published !== publicCardsJson(assignSlugs(sourceCards))) {
    errors.push(`${PUBLISHED_CARDS_PATH} doesn't match ${CARDS_PATH}: edit ${CARDS_PATH}, then run scripts/sync-seo-index.mjs`);
  }
}

async function loadSourceCards() {
  try {
    const payload = JSON.parse(await readFile(join(ROOT, CARDS_PATH), "utf8"));
    const cards = Array.isArray(payload) ? payload : payload?.cards;
    if (!Array.isArray(cards)) throw new Error("expected an array of cards or an object with a cards array");
    return cards;
  } catch (error) {
    errors.push(`${CARDS_PATH}: ${error.message}`);
    return [];
  }
}

// Moods come from the fixed list in scripts/moods.mjs; retired curation fields stay retired.
function checkCardMoods() {
  const retired = ["sleepinessBasis", "sleepLocation", "sleepiness", "priority", "suggestionIssue", "priceLow", "priceMid", "priceHigh", "priceMarket", "priceSource", "priceUpdatedAt"];
  for (const card of sourceCards) {
    const label = `${CARDS_PATH}: ${card.name} (${[card.setName, card.number].filter(Boolean).join(" ")})`;
    if (!Array.isArray(card.moods)) {
      errors.push(`${label} has no moods array (use [] for none)`);
      continue;
    }
    const unknown = card.moods.filter((mood) => !MOODS.includes(mood));
    if (unknown.length) errors.push(`${label} has unknown moods: ${unknown.join(", ")}`);
    if (new Set(card.moods).size !== card.moods.length) errors.push(`${label} lists a mood twice`);
    // A form prefix ("Light", "Alolan") on its own is never the Pokémon. Owner names can't be checked this way:
    // trainer cards like Bianca's Devotion rightly list the trainer.
    if (/^(Light|Dark|Shining|Alolan|Galarian|Hisuian|Paldean)$/.test(card.pokemon)) {
      errors.push(`${label} has pokemon "${card.pokemon}", which is a prefix of the name, not the Pokémon`);
    }
    for (const field of ["tcgplayerProductId", "tcgplayerGroupId"]) {
      if (field in card && !(Number.isInteger(card[field]) && card[field] > 0)) errors.push(`${label} has ${field} ${card[field]}, which is not a TCGplayer ID`);
    }
    if (("tcgplayerProductId" in card) !== ("tcgplayerGroupId" in card)) errors.push(`${label} needs both tcgplayerProductId and tcgplayerGroupId`);
    if (card.tcgplayerProductId && !card.priceType) errors.push(`${label} has a TCGplayer product but no priceType (printing) to price`);
    const stale = retired.filter((field) => field in card);
    if (stale.length) errors.push(`${label} still has retired fields: ${stale.join(", ")}`);
    for (const image of new Set([card.imageSmall, card.imageLarge])) {
      if (String(image || "").startsWith("/") && !existsSync(join(DOCS_DIR, image))) errors.push(`${label} points to a missing image: ${image}`);
    }
  }
}

// A slug the generator had to de-duplicate ("-2") depends on the order of the cards, so a later edit could move
// that card's page. Two cards that would share one must pin distinct slugs.
function checkCardPageSlugs() {
  assignSlugs(sourceCards).forEach((card, index) => {
    const raw = sourceCards[index];
    const expected = raw.slug || slugify([raw.name, raw.setName, raw.number].filter(Boolean).join(" "));
    if (card.slug !== expected) errors.push(`${CARDS_PATH}: ${raw.name} (${raw.setName} ${raw.number}) shares its page address with another card; give one of them a distinct slug`);
  });
}

// docs/featured.json lists the curator's featured-sleeper batches by card slug (see DATA-MODEL.md).
async function checkFeatured() {
  let featured;
  try {
    featured = JSON.parse(await readFile(join(DOCS_DIR, "featured.json"), "utf8"));
  } catch (error) {
    errors.push(`docs/featured.json: ${error.message}`);
    return;
  }
  const slugs = new Set(assignSlugs(sourceCards).map((card) => card.slug));
  const check = (slug, where) => {
    if (!slugs.has(slug)) errors.push(`docs/featured.json: ${where} "${slug}" is not a published card's slug`);
  };
  check(featured.showing, "showing");
  for (const [name, batch] of [["current", featured.current], ["upcoming", featured.upcoming]]) {
    if (!batch) continue;
    if (!Array.isArray(batch.cards) || !batch.cards.length) errors.push(`docs/featured.json: ${name} needs a non-empty cards list`);
    (batch.cards || []).forEach((slug, index) => check(slug, `${name} card ${index + 1}`));
  }
  const startsOn = featured.current?.startsOn || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn) || new Date(`${startsOn}T00:00:00Z`).getUTCDay() !== 0) {
    errors.push(`docs/featured.json: current.startsOn "${startsOn}" must be a Sunday (YYYY-MM-DD)`);
  }
}

// docs/prices.json holds one entry per priced card, keyed by card identity (see DATA-MODEL.md).
async function checkPrices() {
  let payload;
  try {
    payload = JSON.parse(await readFile(join(DOCS_DIR, "prices.json"), "utf8"));
  } catch (error) {
    errors.push(`docs/prices.json: ${error.message}`);
    return;
  }
  for (const [id, entry] of Object.entries(payload.prices || {})) {
    const label = `docs/prices.json: ${id}`;
    if (!catalogIdentities.has(id)) errors.push(`${label} matches no published card (renamed? move its price to the new identity)`);
    if (!(Number.isFinite(entry.market) && entry.market >= 0)) errors.push(`${label} has market ${entry.market}, which is not a price`);
    if (!["TCGplayer", "Manual"].includes(entry.source)) errors.push(`${label} has source "${entry.source}" (use TCGplayer or Manual)`);
    if (!/^\d{4}\/\d{2}\/\d{2}$/.test(entry.updatedAt || "")) errors.push(`${label} has updatedAt "${entry.updatedAt}" (use YYYY/MM/DD)`);
  }
}

// Every intro in docs/sets.json must name a real set, so renaming a set can't silently drop its intro.
async function checkSetIntros() {
  const setDefs = JSON.parse(await readFile(join(DOCS_DIR, "sets.json"), "utf8"));
  if (!Number.isInteger(setDefs.minCards) || setDefs.minCards < 1) errors.push("docs/sets.json: minCards must be a positive whole number");
  const setNames = new Set(sourceCards.map((card) => card.setName));
  for (const name of Object.keys(setDefs.intros || {})) {
    if (!setNames.has(name)) errors.push(`docs/sets.json: intro for "${name}" matches no set in ${CARDS_PATH}`);
  }
}

// DATA-MODEL.md is the source of truth for card fields: a card may only use documented fields,
// and fields the table marks Required must be non-empty.
async function checkCardFields() {
  const doc = await readFile(join(ROOT, "DATA-MODEL.md"), "utf8").catch(() => "");
  const section = doc.split(/^## Card fields$/m)[1]?.split(/^## /m)[0] || "";
  const fields = new Map([...section.matchAll(/^\| `(\w+)` \| (Yes|No) \|/gm)].map(([, field, required]) => [field, required === "Yes"]));
  if (!fields.size) {
    errors.push("DATA-MODEL.md: no card field table found under \"## Card fields\"");
    return;
  }
  for (const card of sourceCards) {
    const label = `${CARDS_PATH}: ${card.name} (${[card.setName, card.number].filter(Boolean).join(" ")})`;
    const undocumented = Object.keys(card).filter((field) => !fields.has(field));
    if (undocumented.length) errors.push(`${label} has fields not documented in DATA-MODEL.md: ${undocumented.join(", ")}`);
    const missing = [...fields].filter(([field, required]) => required && (card[field] === undefined || card[field] === null || card[field] === ""));
    if (missing.length) errors.push(`${label} is missing required fields: ${missing.map(([field]) => field).join(", ")}`);
  }
}

// Guide pages are dated in the sitemap by the guide's own updatedAt, so every guide needs a valid one.
async function checkGuideDates() {
  const guides = JSON.parse(await readFile(join(ROOT, "docs", "guides.json"), "utf8"));
  for (const guide of Array.isArray(guides) ? guides : guides.guides || []) {
    if (!/^\d{4}-\d{2}-\d{2}T/.test(guide.updatedAt || "") || Number.isNaN(Date.parse(guide.updatedAt))) {
      errors.push(`docs/guides.json: guide "${guide.slug}" needs updatedAt as an ISO 8601 date (when its cards, order or text last changed)`);
    }
  }
}

// Every guide card must carry exactly one card ID, and it must be a published card.
function checkGuideCards(html, label) {
  const guideCards = [...html.matchAll(/<article\b[^>]*\bclass="[^"]*\bguide-card\b[^"]*"[^>]*>[\s\S]*?<\/article>/g)];
  if (!guideCards.length) errors.push(`${label}: no guide cards found`);
  guideCards.forEach(([block], index) => {
    const cardIds = new Set([...block.matchAll(/data-card-id="([^"]*)"/g)].map(([, id]) => decodeHtmlAttribute(id)));
    const position = `guide card ${index + 1}`;
    if (cardIds.size === 0) errors.push(`${label}: ${position} has no data-card-id`);
    else if (cardIds.size > 1) errors.push(`${label}: ${position} has conflicting card IDs: ${[...cardIds].join(" | ")}`);
    else {
      const [cardId] = cardIds;
      if (!catalogIdentities.has(cardId)) errors.push(`${label}: ${position} ID is not a published card: ${cardId}`);
      const slug = block.match(/^<article\b[^>]*\bdata-card-slug="([^"]*)"/)?.[1];
      if (slug !== slugByIdentity.get(cardId)) errors.push(`${label}: ${position} has data-card-slug "${slug ?? ""}", expected "${slugByIdentity.get(cardId)}"`);
    }
  });
}

// data/card-slugs.json records every card page address ever published. A recorded address must still have its
// card (a page, and the binder marks saved against it, must never disappear), and every card must be recorded.
async function checkPublishedSlugs() {
  const recorded = await loadPublishedSlugs();
  if (!recorded.length) {
    errors.push(`${CARD_SLUGS_PATH} is missing or empty; run scripts/sync-seo-index.mjs`);
    return;
  }
  const gone = recorded.filter((slug) => !currentSlugs.has(slug));
  if (gone.length) errors.push(`${CARD_SLUGS_PATH}: ${gone.length} published card page(s) no longer exist, e.g. cards/${gone[0]}/. Card page URLs never change: set the card's \`slug\` to its old address (DATA-MODEL.md)`);
  const unrecorded = [...currentSlugs].filter((slug) => !recorded.includes(slug));
  if (unrecorded.length) errors.push(`${CARD_SLUGS_PATH} doesn't record ${unrecorded.length} card page(s), e.g. ${unrecorded[0]}; run scripts/sync-seo-index.mjs`);
  const malformed = [...currentSlugs].filter((slug) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug));
  if (malformed.length) errors.push(`${CARDS_PATH}: slug "${malformed[0]}" isn't lowercase words joined by hyphens, so the binder can't save it`);
}

// Card displays (tiles, guide and set cards, the featured card, About cards, card pages) carry the card's slug, and
// any page that has them loads binder.js before app.js.
function checkCardSlugs(html, label, path) {
  const tags = [...html.matchAll(/<(?:a|article)\b[^>]*>/g)].map(([tag]) => tag);
  for (const tag of tags) {
    const classes = tag.match(/\bclass="([^"]*)"/)?.[1].split(/\s+/) || [];
    if (!classes.some((name) => CARD_DISPLAY_CLASSES.includes(name))) continue;
    const slug = tag.match(/\bdata-card-slug="([^"]*)"/)?.[1];
    const id = tag.match(/\bdata-card-id="([^"]*)"/)?.[1];
    const what = `${label}: a .${classes.find((name) => CARD_DISPLAY_CLASSES.includes(name))}`;
    if (!slug) errors.push(`${what} has no data-card-slug`);
    else if (!currentSlugs.has(slug)) errors.push(`${what} has data-card-slug "${slug}", which is no card's slug`);
    else if (id && slugByIdentity.get(decodeHtmlAttribute(id)) !== slug) errors.push(`${what} has data-card-slug "${slug}" but data-card-id ${decodeHtmlAttribute(id)}`);
  }
  if (classesOnPage(html).has("card-page-detail")) {
    const pageSlug = relative(join(DOCS_DIR, "cards"), path).split(/[\\/]/)[0];
    if (!new RegExp(`card-page-detail"[^>]*data-card-slug="${pageSlug}"`).test(html)) errors.push(`${label}: the card page's data-card-slug isn't its own address (${pageSlug})`);
    // "Add to wishlist" (#119): one per card page, for this card, and card-page.js to run it (the lightbox uses app.js).
    const wishButtons = [...html.matchAll(/<button class="detail-wish"[^>]*data-wish-slug="([^"]*)"/g)].map(([, slug]) => slug);
    if (wishButtons.length !== 1 || wishButtons[0] !== pageSlug) errors.push(`${label}: needs exactly one "Add to wishlist" button for ${pageSlug}, found ${JSON.stringify(wishButtons)}`);
    if (!html.includes(`card-page.js?v=${ASSET_VERSIONS["card-page.js"]}`)) errors.push(`${label}: doesn't load card-page.js?v=${ASSET_VERSIONS["card-page.js"]} (its wishlist button needs it)`);
  }
  if (/data-card-slug="/.test(html)) {
    const binderAt = html.indexOf(`binder.js?v=${ASSET_VERSIONS["binder.js"]}`);
    if (binderAt === -1) errors.push(`${label}: shows cards but doesn't load binder.js?v=${ASSET_VERSIONS["binder.js"]}`);
    else if (html.includes("app.js?v=") && html.indexOf("app.js?v=") < binderAt) errors.push(`${label}: loads app.js before binder.js`);
  }
}

function classesOnPage(html) {
  return new Set([...html.matchAll(/\bclass="([^"]*)"/g)].flatMap(([, value]) => value.split(/\s+/)));
}

// Collection and homepage tiles are drawn by app.js, so check its tile carries the slug too.
function checkAppCardSlugs(appSource) {
  const app = loadApp(appSource);
  const card = app.context.normalizeCard(browserCards[0]);
  const tile = app.context.renderCard(card);
  if (!tile.includes(`data-card-slug="${slugByIdentity.get(getCardIdentity(browserCards[0]))}"`)) errors.push("docs/app.js: renderCard's .card-tile has no data-card-slug (the binder needs it)");
  if (!/cardDetailDialog\.dataset\.cardSlug = card\.slug/.test(appSource)) errors.push("docs/app.js: the card lightbox no longer sets data-card-slug on #cardDetailDialog");
}

// The wishlist star (#119), run through app.js with the real binder.js: tiles draw the star in the right state,
// toggling saves and offers Undo on removal, and the analytics event never says which card it was.
function checkWishlistStar(appSource, binderSource) {
  const fail = (message) => errors.push(`docs/app.js (wishlist): ${message}`);
  try {
    const app = loadApp(appSource);
    const store = new Map();
    const listeners = new Map();
    Object.assign(app.context.window, {
      localStorage: { getItem: (key) => (store.has(key) ? store.get(key) : null), setItem: (key, value) => store.set(key, String(value)) },
      addEventListener: (type, fn) => listeners.set(type, [...(listeners.get(type) || []), fn]),
      removeEventListener() {},
      dispatchEvent: (event) => (listeners.get(event.type) || []).forEach((fn) => fn(event)),
    });
    app.context.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
    vm.runInContext(binderSource, app.context, { filename: "docs/binder.js" });
    const events = [];
    app.context.window.sleepyAnalytics = { track: (name, params) => events.push({ name, params }) };
    const toasts = [];
    app.run("showToast = (message, options) => globalThis.__toasts.push({ message, options })");
    app.context.__toasts = toasts;
    const card = app.context.normalizeCard(browserCards[0]);
    const slug = slugByIdentity.get(getCardIdentity(browserCards[0]));
    if (!/class="wish-toggle"[^>]*aria-pressed="false"/.test(app.context.renderCard(card))) fail("a tile doesn't draw an unpressed star");
    if (/<article[^>]*role="button"/.test(app.context.renderCard(card))) fail("the tile is a button again, so the star would be a button inside a button");
    const button = { dataset: { wishSlug: slug, wishName: card.name } };
    app.context.toggleWish(button);
    if (!app.context.window.sleepyBinder.has("wished", slug)) fail("tapping the star doesn't save the card");
    const tile = app.context.renderCard(card);
    if (!/class="card-tile is-wished"/.test(tile) || !/aria-pressed="true"/.test(tile)) fail("a wished card's tile isn't drawn wished (starry frame, pressed star)");
    if (!/class="wish-sky"/.test(tile)) fail("a tile doesn't draw the twinkling sky its frame shows when wished");
    app.context.toggleWish(button);
    if (app.context.window.sleepyBinder.has("wished", slug)) fail("tapping the star again doesn't remove the card");
    const undo = toasts.at(-1)?.options?.onAction;
    if (!undo) fail("removing a card doesn't offer Undo");
    else {
      undo();
      if (!app.context.window.sleepyBinder.has("wished", slug)) fail("Undo doesn't put the card back");
    }
    const wishEvents = events.filter((event) => event.name === "wishlist_toggled");
    if (wishEvents.length !== 2) fail(`expected 2 wishlist_toggled events, got ${wishEvents.length}`);
    for (const { params } of wishEvents) {
      const extra = Object.keys(params).filter((key) => !["action", "interaction_source"].includes(key));
      if (extra.length) fail(`wishlist_toggled must never say which card it was, but sends ${extra.join(", ")}`);
    }
  } catch (error) {
    fail(`threw ${error.message}`);
  }
}

// card-page.js runs the card page's "Add to wishlist" button: a click saves, a second removes, the label follows,
// and the analytics event never says which card it was.
function checkCardPageWish(source, binderSource) {
  const fail = (message) => errors.push(`docs/card-page.js: ${message}`);
  try {
    const store = new Map();
    const listeners = new Map();
    const events = [];
    const attributes = {};
    const label = { textContent: "Add to wishlist" };
    let click = null;
    const button = {
      dataset: { wishSlug: "test-card-slug", wishName: "Test Card" },
      setAttribute: (name, value) => { attributes[name] = value; },
      querySelector: () => label,
      addEventListener: (type, fn) => { if (type === "click") click = fn; },
    };
    const window = {
      localStorage: { getItem: (key) => (store.has(key) ? store.get(key) : null), setItem: (key, value) => store.set(key, String(value)) },
      addEventListener: (type, fn) => listeners.set(type, [...(listeners.get(type) || []), fn]),
      removeEventListener() {},
      dispatchEvent: (event) => (listeners.get(event.type) || []).forEach((fn) => fn(event)),
      sleepyAnalytics: { track: (name, params) => events.push({ name, params }) },
    };
    const context = vm.createContext({ window, document: { querySelectorAll: () => [button] }, Date, JSON, Object, Array, Error, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } } });
    vm.runInContext(binderSource, context, { filename: "docs/binder.js" });
    vm.runInContext(source, context, { filename: "docs/card-page.js" });
    if (!click) return fail("doesn't listen for clicks on the wishlist button");
    click();
    if (!context.window.sleepyBinder.has("wished", "test-card-slug")) fail("a click doesn't add the card to the wishlist");
    if (attributes["aria-pressed"] !== "true" || label.textContent !== "On your wishlist") fail("the button doesn't show the card is on the wishlist");
    click();
    if (context.window.sleepyBinder.has("wished", "test-card-slug") || label.textContent !== "Add to wishlist") fail("a second click doesn't remove the card");
    const wishEvents = events.filter((event) => event.name === "wishlist_toggled");
    if (wishEvents.length !== 2 || wishEvents.some(({ params }) => params.interaction_source !== "card_page")) fail("should send wishlist_toggled with interaction_source card_page for each click");
    for (const { params } of wishEvents) {
      const extra = Object.keys(params).filter((key) => !["action", "interaction_source"].includes(key));
      if (extra.length) fail(`wishlist_toggled must never say which card it was, but sends ${extra.join(", ")}`);
    }
  } catch (error) {
    fail(`threw ${error.message}`);
  }
}

// Runs docs/binder.js against a fake browser and checks how it saves: the binder must never lose or corrupt
// what a visitor saved, and must never break the page.
function checkBinder(binderSource) {
  const fail = (message) => errors.push(`docs/binder.js: ${message}`);
  const load = ({ store = new Map(), broken = false } = {}) => {
    const listeners = new Map();
    const localStorage = {
      getItem: (key) => { if (broken) throw new Error("blocked"); return store.has(key) ? store.get(key) : null; },
      setItem: (key, value) => { if (broken) throw new Error("blocked"); store.set(key, String(value)); },
    };
    const window = {
      localStorage,
      addEventListener: (type, fn) => listeners.set(type, [...(listeners.get(type) || []), fn]),
      removeEventListener: (type, fn) => listeners.set(type, (listeners.get(type) || []).filter((item) => item !== fn)),
      dispatchEvent: (event) => (listeners.get(event.type) || []).forEach((fn) => fn(event)),
    };
    const context = vm.createContext({ window, Date, JSON, Object, Array, Error, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } } });
    vm.runInContext(binderSource, context, { filename: "docs/binder.js" });
    return { binder: context.window.sleepyBinder, store, window };
  };
  const saved = (store) => JSON.parse(store.get("sleepy_binder_v1") || "{}");
  try {
    // Adding, wishing, exclusivity.
    let { binder, store } = load();
    binder.add("wished", "pikachu-a");
    if (!binder.has("wished", "pikachu-a")) fail("a wished card isn't saved");
    const events = [];
    binder.onChange((detail) => events.push(detail));
    binder.add("owned", "pikachu-a");
    if (!binder.has("owned", "pikachu-a") || binder.has("wished", "pikachu-a") || saved(store).wished["pikachu-a"]) fail("tucking in a wished card must move it from wished to owned");
    if (!events.some((event) => event.wishCameTrue)) fail("tucking in a wished card doesn't announce wishCameTrue");
    if (binder.add("wished", "pikachu-a")) fail("a card someone has can't also be wished for");
    if (binder.add("owned", "Not A Slug")) fail("saves something that isn't a card slug");
    if (binder.toggle("owned", "pikachu-a") !== false || binder.has("owned", "pikachu-a")) fail("toggle doesn't take a card out");
    // Unknown slugs and unknown fields are kept, not dropped.
    ({ binder, store } = load({ store: new Map([["sleepy_binder_v1", JSON.stringify({ version: 1, owned: { "card-from-the-future": "2030-01-01" }, wished: {}, hints: {}, later: { kept: true } })]]) }));
    binder.add("owned", "snorlax-b");
    if (!saved(store).owned["card-from-the-future"] || !saved(store).later?.kept) fail("drops saved cards or fields it doesn't know");
    // Another tab's save is never overwritten: every write starts from what's saved now.
    store.set("sleepy_binder_v1", JSON.stringify({ version: 1, owned: { "snorlax-b": "2026-11-01", "from-other-tab": "2026-11-01" }, wished: {}, hints: {} }));
    binder.add("owned", "munna-c");
    if (!saved(store).owned["from-other-tab"]) fail("overwrites a save made in another tab");
    // Progress counts only the page's own cards.
    if (binder.count("owned", ["munna-c", "not-owned"]) !== 1) fail("count() for a page's cards is wrong");
    // Unreadable saved data doesn't break the page and isn't thrown away.
    ({ binder, store } = load({ store: new Map([["sleepy_binder_v1", "{not json"]]) }));
    if (binder.count("owned") !== 0) fail("unreadable saved data isn't treated as an empty binder");
    binder.add("owned", "eevee-d");
    if (store.get("sleepy_binder_v1_unreadable") !== "{not json") fail("unreadable saved data is lost instead of kept aside");
    // Blocked storage: the binder works for the visit and says so.
    ({ binder } = load({ broken: true }));
    binder.add("owned", "eevee-d");
    if (!binder.has("owned", "eevee-d")) fail("doesn't keep working for the visit when the browser can't save");
    if (binder.isPersistent()) fail("doesn't report that the browser couldn't save");
    // Hints are seen once.
    ({ binder } = load());
    binder.markHintSeen("collection_strip");
    if (!binder.hintSeen("collection_strip") || binder.markHintSeen("collection_strip")) fail("a one-time hint isn't remembered");
  } catch (error) {
    fail(`threw ${error.message}`);
  }
}

// Runs docs/app.js in a sandbox. Its only top-level side effect is registering
// the DOMContentLoaded handler, so its functions and state can be called directly.
function loadApp(appSource, bodyDataset = {}) {
  const downloads = [];
  const sandbox = {
    console,
    document: {
      body: { dataset: { ...bodyDataset }, append() {} },
      addEventListener() {},
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ style: {}, click() {}, remove() {} }),
    },
    window: { setTimeout() {}, location: { href: "https://www.sleepypokemon.com/collection/" } },
    URL: { createObjectURL: () => "blob:checklist", revokeObjectURL() {} },
    Blob: class {
      constructor(parts) {
        downloads.push(parts.join(""));
      }
    },
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(appSource, context, { filename: "docs/app.js" });
  return {
    context,
    downloads,
    run: (code) => vm.runInContext(code, context),
  };
}

// A rarity outside RARITY_GROUPS gets a drawer pill of its own (one card's "Rare Ultra" did, #153), so every rarity must be grouped.
function checkRarityGroups(appSource) {
  const app = loadApp(appSource);
  const grouped = new Set(app.run("RARITY_GROUPS").flatMap((group) => group.rarities));
  const ungrouped = [...new Set(sourceCards.map((card) => card.rarity).filter((rarity) => rarity && !grouped.has(rarity)))];
  if (ungrouped.length) errors.push(`docs/app.js: rarities not in any RARITY_GROUPS group (each would get its own drawer pill): ${ungrouped.join(", ")}`);
  const groupIds = new Set(app.run("RARITY_GROUPS").map((group) => group.id));
  Object.entries(app.run("RARITY_ALIASES")).forEach(([from, to]) => {
    if (!groupIds.has(to)) errors.push(`docs/app.js: RARITY_ALIASES maps "${from}" to "${to}", which is not a rarity group`);
  });
}

// The browser's catalogIdentity must equal the data-card-id the build scripts write.
// Also covers cards with optional fields missing, which normalizeCard fills in.
function checkAppCardIdentity(appSource) {
  const app = loadApp(appSource);
  const sparseCards = browserCards.slice(0, 1).flatMap((card) => [
    { ...card, language: undefined },
    { ...card, name: undefined },
    { ...card, apiId: undefined, tcgdexId: undefined },
  ]);
  const mismatches = [...browserCards, ...sparseCards]
    .filter((card) => app.context.normalizeCard(card).catalogIdentity !== getCardIdentity(card));
  if (mismatches.length) {
    errors.push(`docs/app.js: card identity differs from scripts/card-identity.mjs for ${mismatches.length} card(s), e.g. ${getCardIdentity(mismatches[0])}`);
  }
  // The lightbox loads cards/<slug>/, so app.js must land on the same page address as the generators.
  const pages = assignSlugs(sourceCards);
  const wrongPage = browserCards.filter((card, index) => app.context.normalizeCard(card).slug !== pages[index].slug);
  if (wrongPage.length) errors.push(`docs/app.js: works out a different card page address for ${wrongPage.length} card(s), e.g. ${pages[browserCards.indexOf(wrongPage[0])].slug}`);
  checkPublicFields(app);
}

// PUBLIC_CARD_FIELDS must be exactly the card fields normalizeCard reads: one it reads but browsers don't get
// would always be empty, and one browsers get but it never reads is downloaded for nothing.
function checkPublicFields(app) {
  const read = new Set();
  for (const card of sourceCards) {
    app.context.normalizeCard(new Proxy(card, { get: (target, key) => (read.add(key), target[key]) }));
  }
  const cardFields = new Set(sourceCards.flatMap(Object.keys));
  const missing = [...read].filter((field) => cardFields.has(field) && !PUBLIC_CARD_FIELDS.includes(field));
  if (missing.length) errors.push(`docs/app.js reads card fields browsers don't get; add them to PUBLIC_CARD_FIELDS: ${missing.join(", ")}`);
  const unused = PUBLIC_CARD_FIELDS.filter((field) => !read.has(field));
  if (unused.length) errors.push(`PUBLIC_CARD_FIELDS publishes fields docs/app.js never reads: ${unused.join(", ")}`);
}

// Downloads each checklist scope through app.js and checks the CSV it writes,
// the toast it shows and the analytics event it sends.
function checkChecklistDownloads(appSource) {
  if (!sourceCards.length) return;
  const sampleCard = sourceCards.find((card) => card.setName && card.pokemon) || sourceCards[0];
  const guideBody = { appMode: "guide-page", guideSlug: "test-guide", guideTitle: "Test Guide" };
  const collectionEvent = { download_surface: "collection", interaction_source: "collection_header" };
  // expectedCards gets the app's normalized cards; subset cases must export some but not all of them.
  const cases = [
    {
      name: "full collection",
      label: "Full collection",
      expectedCards: (app, cards) => cards,
      expect: { ...collectionEvent, checklist_scope: "full_collection" },
    },
    {
      name: "search results",
      label: "Search results",
      filters: { search: sampleCard.pokemon },
      subset: true,
      expectedCards: (app) => app.context.getFilteredCards(),
      expect: { ...collectionEvent, checklist_scope: "search_results" },
    },
    {
      name: "filtered collection",
      label: "Filtered",
      filters: { set: sampleCard.setName },
      subset: true,
      expectedCards: (app) => app.context.getFilteredCards(),
      expect: { ...collectionEvent, checklist_scope: "filtered_collection" },
    },
    {
      name: "wishlist",
      label: "Wishlist",
      // Two wished cards, plus a search that would match others: the wishlist view downloads only the wished ones.
      wished: (cards) => [cards[0].slug, cards[2].slug],
      filters: { wishlist: true },
      subset: true,
      expectedCards: (app) => app.context.getFilteredCards(),
      expect: { ...collectionEvent, checklist_scope: "wishlist" },
      filename: "sleepy-pokemon-wishlist.csv",
    },
    {
      name: "guide",
      label: "Guide",
      body: guideBody,
      guide: true,
      subset: true,
      expectedCards: (app, cards) => cards.slice(0, 2),
      expect: { checklist_scope: "guide", download_surface: "guide_page", interaction_source: "guide_page", guide_slug: "test-guide", guide_title: "Test Guide" },
    },
  ];
  for (const testCase of cases) {
    const app = loadApp(appSource, testCase.body);
    const events = [];
    const toasts = [];
    app.context.trackEvent = (name, params) => events.push({ name, params });
    app.context.showToast = (message) => toasts.push(message);
    app.context.__cards = browserCards;
    app.context.__filters = testCase.filters || {};
    app.run("state.cards = __cards.map(normalizeCard); Object.assign(state.filters, __filters);");
    if (testCase.wished) {
      const wished = new Set(testCase.wished(app.run("state.cards")));
      app.context.window.sleepyBinder = { has: (list, slug) => list === "wished" && wished.has(slug), count: () => wished.size };
    }
    if (testCase.guide) app.run("state.guideSelection = { cards: state.cards.slice(0, 2), complete: true };");
    const allCards = app.run("state.cards");
    const expectedNames = testCase.expectedCards(app, allCards).map((card) => card.name || card.pokemon || "");
    app.context.downloadChecklist();
    const label = `docs/app.js: ${testCase.name} checklist download`;

    if (!expectedNames.length || (testCase.subset && expectedNames.length >= allCards.length)) {
      errors.push(`${label}: test setup should select some but not all cards, selected ${expectedNames.length} of ${allCards.length}`);
      continue;
    }
    if (app.downloads.length !== 1) {
      errors.push(`${label} wrote ${app.downloads.length} files, expected 1`);
      continue;
    }
    const [header, ...rows] = parseCsv(app.downloads[0].replace(/^\uFEFF/, ""));
    const nameColumn = header.indexOf("Pokemon Card Name");
    const exportedNames = rows.map((row) => row[nameColumn]);
    if (nameColumn === -1) errors.push(`${label} CSV has no "Pokemon Card Name" column`);
    else if (exportedNames.length !== expectedNames.length) {
      errors.push(`${label} exported ${exportedNames.length} cards, expected ${expectedNames.length}`);
    } else {
      const row = exportedNames.findIndex((name, index) => name !== expectedNames[index]);
      if (row !== -1) errors.push(`${label} CSV row ${row + 1} is ${JSON.stringify(exportedNames[row])}, expected ${JSON.stringify(expectedNames[row])}`);
    }
    if (!toasts.some((message) => message.startsWith(`${testCase.label} checklist downloaded (${expectedNames.length} cards)`))) {
      errors.push(`${label} showed ${JSON.stringify(toasts)}, expected "${testCase.label} checklist downloaded (${expectedNames.length} cards)."`);
    }

    if (testCase.filename && app.context.getChecklistContext().filename !== testCase.filename) errors.push(`${label} names its file ${app.context.getChecklistContext().filename}, expected ${testCase.filename}`);
    const event = events.find(({ name }) => name === "checklist_downloaded");
    if (!event) {
      errors.push(`${label} sent no checklist_downloaded event`);
      continue;
    }
    for (const [key, value] of Object.entries({ ...testCase.expect, card_count: expectedNames.length })) {
      if (event.params[key] !== value) errors.push(`${label} sent ${key}=${JSON.stringify(event.params[key])}, expected ${JSON.stringify(value)}`);
    }
    if (!testCase.guide && (event.params.guide_slug !== undefined || event.params.guide_title !== undefined)) {
      errors.push(`${label} sent guide attribution outside a guide page`);
    }
  }
}

// Minimal RFC 4180 parser: quoted cells may contain commas, quotes ("") and newlines.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
}

function decodeHtmlAttribute(value) {
  return value
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

// Only site-chrome.css may style the site header and footer, so they look the same on every page type.
async function checkChromeStyles() {
  const chromeSelector = /\.(topbar|site-footer|footer-[a-z-]+|brand-lockup|brand-byline|sparkle-mark|header-search|header-cta|site-menu)\b/;
  for (const file of (await readdir(DOCS_DIR)).filter((name) => name.endsWith(".css") && name !== "site-chrome.css")) {
    const css = (await readFile(join(DOCS_DIR, file), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");
    for (const [, selector] of css.matchAll(/([^{}]+)\{/g)) {
      if (!selector.trim().startsWith("@") && chromeSelector.test(selector)) {
        errors.push(`docs/${file}: styles the header or footer (${selector.trim().split("\n")[0]}); those rules belong in site-chrome.css`);
      }
    }
  }
}
