import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const DOCS_DIR = join(ROOT, "docs");
const validPageTypes = new Set(["home", "collection", "guides-index", "guide", "card"]);
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
];

const htmlFiles = (await walk(DOCS_DIR)).filter((path) => path.endsWith(".html"));
const errors = [];
const pageTypeCounts = new Map();

for (const path of htmlFiles) {
  const html = await readFile(path, "utf8");
  const label = relative(ROOT, path);
  const pageType = html.match(/data-page-type="([^"]+)"/)?.[1];
  if (!pageType || !validPageTypes.has(pageType)) errors.push(`${label}: missing or invalid page type`);
  else pageTypeCounts.set(pageType, (pageTypeCounts.get(pageType) || 0) + 1);
  if (!/analytics\.js\?v=2/.test(html)) errors.push(`${label}: analytics script is not versioned at v2`);
  if (!/data-analytics-event="navigation_clicked"[^>]+data-analytics-source="global_header"/.test(html)) {
    errors.push(`${label}: shared header navigation tracking is missing`);
  }
  if (!/data-analytics-event="studio_link_clicked"/.test(html) || !/data-analytics-event="coffee_clicked"/.test(html)) {
    errors.push(`${label}: shared footer tracking is incomplete`);
  }
  if (pageType === "card" && !/data-card-number=/.test(html)) errors.push(`${label}: card analytics metadata is incomplete`);
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
