import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import vm from "node:vm";
import { getCardIdentity } from "./card-identity.mjs";

const ROOT = process.cwd();
const DOCS_DIR = join(ROOT, "docs");
const validPageTypes = new Set(["home", "collection", "guides-index", "guide", "card"]);
const errors = [];
const publishedCards = await loadPublishedCards();
const catalogIdentities = new Set(publishedCards.map(getCardIdentity));
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
  "random_sleeper_clicked",
  "suggestion_opened",
  "suggestion_lookup_completed",
  "suggestion_card_selected",
  "suggestion_card_removed",
  "suggestion_submitted",
  "suggestion_submit_failed",
  "checklist_downloaded",
];

const htmlFiles = (await walk(DOCS_DIR)).filter((path) => path.endsWith(".html"));
const pageTypeCounts = new Map();

for (const path of htmlFiles) {
  const html = await readFile(path, "utf8");
  const label = relative(ROOT, path);
  const pageType = html.match(/data-page-type="([^"]+)"/)?.[1];
  if (!pageType || !validPageTypes.has(pageType)) errors.push(`${label}: missing or invalid page type`);
  else pageTypeCounts.set(pageType, (pageTypeCounts.get(pageType) || 0) + 1);
  if (!/analytics\.js\?v=3/.test(html)) errors.push(`${label}: analytics script is not versioned at v3`);
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
  if (pageType === "guide") checkGuideCards(html, label);
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
  const sandbox = {
    console,
    document: {
      body: { dataset: { ...bodyDataset }, append() {} },
      addEventListener() {},
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ style: {}, click() {}, remove() {} }),
    },
    window: { setTimeout() {} },
    URL: { createObjectURL: () => "blob:checklist", revokeObjectURL() {} },
    Blob: class {},
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(appSource, context, { filename: "docs/app.js" });
  return {
    context,
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
}

// Downloads each checklist scope through app.js and checks the analytics event it sends.
function checkChecklistDownloads(appSource) {
  if (!publishedCards.length) return;
  const sampleCard = publishedCards.find((card) => card.setName && card.pokemon) || publishedCards[0];
  const guideBody = { appMode: "guide-page", guideSlug: "test-guide", guideTitle: "Test Guide" };
  const cases = [
    { name: "full collection", expect: { checklist_scope: "full_collection", download_surface: "collection", interaction_source: "collection_header" } },
    { name: "search results", filters: { search: sampleCard.pokemon }, expect: { checklist_scope: "search_results", download_surface: "collection", interaction_source: "collection_header" } },
    { name: "filtered collection", filters: { set: sampleCard.setName }, expect: { checklist_scope: "filtered_collection", download_surface: "collection", interaction_source: "collection_header" } },
    { name: "guide", body: guideBody, guide: true, expect: { checklist_scope: "guide", download_surface: "guide_page", interaction_source: "guide_page", guide_slug: "test-guide", guide_title: "Test Guide" } },
  ];
  for (const testCase of cases) {
    const app = loadApp(appSource, testCase.body);
    const events = [];
    app.context.trackEvent = (name, params) => events.push({ name, params });
    app.context.showToast = () => {};
    app.context.__cards = publishedCards;
    app.context.__filters = testCase.filters || {};
    app.run("state.cards = __cards.map(normalizeCard); Object.assign(state.filters, __filters);");
    if (testCase.guide) app.run("state.guideSelection = { cards: state.cards.slice(0, 2), complete: true };");
    app.context.downloadChecklist();
    const label = `docs/app.js: ${testCase.name} checklist download`;
    const event = events.find(({ name }) => name === "checklist_downloaded");
    if (!event) {
      errors.push(`${label} sent no checklist_downloaded event`);
      continue;
    }
    for (const [key, value] of Object.entries(testCase.expect)) {
      if (event.params[key] !== value) errors.push(`${label} sent ${key}=${JSON.stringify(event.params[key])}, expected ${JSON.stringify(value)}`);
    }
    if (!testCase.guide && (event.params.guide_slug !== undefined || event.params.guide_title !== undefined)) {
      errors.push(`${label} sent guide attribution outside a guide page`);
    }
    if (!(event.params.card_count > 0)) errors.push(`${label} exported no cards`);
  }
}

function decodeHtmlAttribute(value) {
  return value
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
