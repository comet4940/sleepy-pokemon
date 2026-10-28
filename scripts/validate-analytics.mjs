import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import vm from "node:vm";
import { getCardIdentity } from "./card-identity.mjs";
import { MOODS } from "./moods.mjs";
import { ASSET_VERSIONS, assignSlugs, slugify } from "./build-helpers.mjs";

const ROOT = process.cwd();
const DOCS_DIR = join(ROOT, "docs");
const validPageTypes = new Set(["home", "collection", "guides-index", "guide", "sets-index", "set", "card", "about"]);
const errors = [];
const publishedCards = await loadPublishedCards();
const catalogIdentities = new Set(publishedCards.map(getCardIdentity));
checkCardMoods();
await checkSetIntros();
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
checkChecklistDownloads(appSource);
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

async function loadPublishedCards() {
  try {
    const payload = JSON.parse(await readFile(join(DOCS_DIR, "published-cards.json"), "utf8"));
    const cards = Array.isArray(payload) ? payload : payload?.cards;
    if (!Array.isArray(cards)) throw new Error("expected an array of cards or an object with a cards array");
    return cards;
  } catch (error) {
    errors.push(`docs/published-cards.json: ${error.message}`);
    return [];
  }
}

// Moods come from the fixed list in scripts/moods.mjs; retired curation fields stay retired.
function checkCardMoods() {
  const retired = ["sleepinessBasis", "sleepLocation", "sleepiness", "priority", "suggestionIssue", "priceLow", "priceMid", "priceHigh", "priceMarket", "priceSource", "priceUpdatedAt"];
  for (const card of publishedCards) {
    const label = `docs/published-cards.json: ${card.name} (${[card.setName, card.number].filter(Boolean).join(" ")})`;
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

// The lightbox loads cards/<slug>/ and works the slug out in the browser (docs/app.js normalizeCard) as the pinned
// slug or the name, set and number. A slug the generator had to de-duplicate ("-2") would be out of its reach,
// so two cards that would share one must pin distinct slugs.
function checkCardPageSlugs() {
  assignSlugs(publishedCards).forEach((card, index) => {
    const raw = publishedCards[index];
    const expected = raw.slug || slugify([raw.name, raw.setName, raw.number].filter(Boolean).join(" "));
    if (card.slug !== expected) errors.push(`docs/published-cards.json: ${raw.name} (${raw.setName} ${raw.number}) shares its page address with another card; give one of them a distinct slug`);
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
  const slugs = new Set(assignSlugs(publishedCards).map((card) => card.slug));
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
  const setNames = new Set(publishedCards.map((card) => card.setName));
  for (const name of Object.keys(setDefs.intros || {})) {
    if (!setNames.has(name)) errors.push(`docs/sets.json: intro for "${name}" matches no set in docs/published-cards.json`);
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
  for (const card of publishedCards) {
    const label = `docs/published-cards.json: ${card.name} (${[card.setName, card.number].filter(Boolean).join(" ")})`;
    const undocumented = Object.keys(card).filter((field) => !fields.has(field));
    if (undocumented.length) errors.push(`${label} has fields not documented in DATA-MODEL.md: ${undocumented.join(", ")}`);
    const missing = [...fields].filter(([field, required]) => required && (card[field] === undefined || card[field] === null || card[field] === ""));
    if (missing.length) errors.push(`${label} is missing required fields: ${missing.map(([field]) => field).join(", ")}`);
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
    }
  });
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

// The browser's catalogIdentity must equal the data-card-id the build scripts write.
// Also covers cards with optional fields missing, which normalizeCard fills in.
function checkAppCardIdentity(appSource) {
  const app = loadApp(appSource);
  const sparseCards = publishedCards.slice(0, 1).flatMap((card) => [
    { ...card, language: undefined },
    { ...card, name: undefined },
    { ...card, apiId: undefined, tcgdexId: undefined },
  ]);
  const mismatches = [...publishedCards, ...sparseCards]
    .filter((card) => app.context.normalizeCard(card).catalogIdentity !== getCardIdentity(card));
  if (mismatches.length) {
    errors.push(`docs/app.js: card identity differs from scripts/card-identity.mjs for ${mismatches.length} card(s), e.g. ${getCardIdentity(mismatches[0])}`);
  }
  // The lightbox loads cards/<slug>/, so app.js must land on the same page address as the generators.
  const pages = assignSlugs(publishedCards);
  const wrongPage = publishedCards.filter((card, index) => app.context.normalizeCard(card).slug !== pages[index].slug);
  if (wrongPage.length) errors.push(`docs/app.js: works out a different card page address for ${wrongPage.length} card(s), e.g. ${pages[publishedCards.indexOf(wrongPage[0])].slug}`);
}

// Downloads each checklist scope through app.js and checks the CSV it writes,
// the toast it shows and the analytics event it sends.
function checkChecklistDownloads(appSource) {
  if (!publishedCards.length) return;
  const sampleCard = publishedCards.find((card) => card.setName && card.pokemon) || publishedCards[0];
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
    app.context.__cards = publishedCards;
    app.context.__filters = testCase.filters || {};
    app.run("state.cards = __cards.map(normalizeCard); Object.assign(state.filters, __filters);");
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
