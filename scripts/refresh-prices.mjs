// Daily price refresh: TCGplayer market prices from TCGCSV for every card with a tcgplayerProductId,
// written to docs/prices.json. Pages read prices from that file in the browser (docs/prices.js), so a
// refresh changes one file and regenerates nothing.
//
//   node scripts/refresh-prices.mjs             refresh if TCGCSV has new data since the last run
//   node scripts/refresh-prices.mjs --force     refresh even if TCGCSV hasn't changed
//   node scripts/refresh-prices.mjs --dry-run   report what would change without writing anything
//
// A card keeps its last price when TCGCSV can't be reached or has no market price for it; a price that
// hasn't been confirmed for STALE_AFTER_DAYS is removed, so the site never shows a misleading number.
// Prices with source "Manual" are the curator's and are left alone.
import { appendFile, writeFile } from "node:fs/promises";
import { PRICES_PATH, loadCardData, loadPrices } from "./build-helpers.mjs";
import { getCardIdentity } from "./card-identity.mjs";
import { fetchLastUpdated, fetchPrices } from "./tcgcsv.mjs";

const STALE_AFTER_DAYS = 30;
// More failed cards than this turns the workflow run red, so a broken refresh can't go unnoticed.
const MAX_FAILED_SHARE = 0.2;
const DRY_RUN = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");

const { cards: allCards } = await loadCardData();
const payload = await loadPrices();
const previous = payload.prices;
const cards = allCards.filter((card) => card.tcgplayerProductId && previous[getCardIdentity(card)]?.source !== "Manual");

let dataUpdatedAt;
try {
  dataUpdatedAt = await fetchLastUpdated();
} catch (error) {
  await finish({ problem: `Couldn't reach TCGCSV: ${error.message}. Prices were left as they were.` });
}
if (!FORCE && payload.dataUpdatedAt === dataUpdatedAt) {
  await finish({ note: `TCGCSV hasn't changed since the last refresh (${dataUpdatedAt}). Nothing to do.` });
}
const priceDate = dataUpdatedAt.slice(0, 10).replaceAll("-", "/");

// One request per TCGplayer set we use. A set that fails leaves its cards' prices as they were.
const pricesByGroup = new Map();
const failedGroups = [];
for (const groupId of new Set(cards.map((card) => card.tcgplayerGroupId))) {
  try {
    pricesByGroup.set(groupId, await fetchPrices(groupId));
  } catch (error) {
    failedGroups.push(`${groupId}: ${error.message}`);
  }
}

// Rebuilt in catalog order, so the daily diff only shows prices that changed. Entries for cards that left
// the catalog drop out; the curator's Manual prices carry over as they are.
const next = {};
const results = { changed: [], unchanged: [], noMarketPrice: [], failed: [], hidden: [] };
for (const card of allCards) {
  const id = getCardIdentity(card);
  const entry = previous[id];
  if (!cards.includes(card)) {
    if (entry) next[id] = entry;
    continue;
  }
  const label = `${card.name} (${card.setName} ${card.number})`;
  const prices = pricesByGroup.get(card.tcgplayerGroupId);
  const row = prices?.find((price) => price.productId === card.tcgplayerProductId && price.subTypeName === card.priceType);
  const market = Number.isFinite(row?.marketPrice) ? row.marketPrice : null;
  if (market !== null) {
    results[entry?.market === market ? "unchanged" : "changed"].push(label);
    next[id] = { market, source: "TCGplayer", updatedAt: priceDate };
    continue;
  }
  results[prices ? "noMarketPrice" : "failed"].push(label);
  if (!entry) continue;
  if (daysBetween(entry.updatedAt, priceDate) > STALE_AFTER_DAYS) results.hidden.push(label);
  else next[id] = entry;
}

payload.refreshedAt = new Date().toISOString();
// Only remember TCGCSV's timestamp after a clean run, so a re-run retries the sets that failed.
if (!failedGroups.length) payload.dataUpdatedAt = dataUpdatedAt;
payload.prices = next;

if (!DRY_RUN) await writeFile(PRICES_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

const failedShare = cards.length ? results.failed.length / cards.length : 0;
await finish({
  problem: failedShare > MAX_FAILED_SHARE
    ? `${results.failed.length} of ${cards.length} cards couldn't be refreshed (more than ${MAX_FAILED_SHARE * 100}%).`
    : "",
});

// Prints the run summary (also to the GitHub Actions run page) and exits. A problem sets the `problem`
// step output, which refresh-prices.yml turns into a failed run after committing whatever did refresh.
async function finish({ note = "", problem = "" }) {
  const lines = [`## Price refresh${DRY_RUN ? " (dry run)" : ""}`, ""];
  if (note) lines.push(note, "");
  if (problem) lines.push(`**Problem:** ${problem}`, "");
  if (dataUpdatedAt && !note) {
    lines.push(
      `TCGCSV data from ${dataUpdatedAt}, ${cards.length} cards with a TCGplayer product:`,
      "",
      "| Result | Cards |",
      "| --- | --- |",
      `| Price changed | ${results.changed.length} |`,
      `| Price unchanged | ${results.unchanged.length} |`,
      `| No market price on TCGplayer (kept last price) | ${results.noMarketPrice.length} |`,
      `| Couldn't refresh (kept last price) | ${results.failed.length} |`,
      `| Price hidden, not confirmed for ${STALE_AFTER_DAYS}+ days | ${results.hidden.length} |`,
      "",
    );
    for (const [title, list] of [
      ["Sets that failed", failedGroups],
      ["No market price", results.noMarketPrice],
      ["Price hidden", results.hidden],
    ]) {
      if (list.length) lines.push(`**${title}:** ${list.join("; ")}`, "");
    }
  }
  const summary = lines.join("\n");
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  if (problem && process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, "problem=true\n");
  process.exit(problem && !process.env.GITHUB_OUTPUT ? 1 : 0);
}

function daysBetween(from, to) {
  const start = new Date(String(from || "").replaceAll("/", "-"));
  const end = new Date(String(to).replaceAll("/", "-"));
  if (Number.isNaN(start.getTime())) return Infinity;
  return (end - start) / 86400000;
}
