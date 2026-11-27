// Most-wished cards: which sleepy cards people put on their wishlists, month by month, from the GA4 BigQuery export.
// Written to data/most-wished.json, ready for a "most wished this month" list on the site.
//
//   node scripts/most-wished.mjs                         last month, printed (needs the bq CLI, signed in)
//   node scripts/most-wished.mjs --month 2026-12         that month
//   node scripts/most-wished.mjs --month 2026-12 --write also save it to data/most-wished.json
//   node scripts/most-wished.mjs --from events.json ...  read the events from a file (the query's rows as JSON)
//                                                        instead of running the query
//
// How a card is counted: each browser counts once for a card if its last wishlist_toggled for that card in the month
// was "added". One visitor adding 200 cards adds 1 to each of them, not 200 to the top of the list, and adding a card
// then taking it off again counts for nothing. A browser is GA4's user_pseudo_id; nothing about who it is is used.
//
// Which card: wishlist_toggled carries the card parameters from 2026-11-17 (ANALYTICS.md). Earlier events don't, but
// lightbox and card-page wishes have the card's page (/cards/<slug>/) in page_location, so those still count. Earlier
// wishes from a tile star can't be placed, so November 2026 undercounts tile-star cards; December is the first full
// month.
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const OUT_PATH = join(ROOT, "data", "most-wished.json");
const CARDS_PATH = join(ROOT, "docs", "published-cards.json");
const EVENTS_TABLE = "sleep-pokemon-analytics.analytics_536644618.events_*";

// One row per wishlist_toggled in the month. debug_mode events are test sessions (?analytics_debug=1).
function monthQuery(month) {
  const [year, mon] = month.split("-").map(Number);
  const first = `${month}-01`.replaceAll("-", "");
  const last = new Date(Date.UTC(year, mon, 0)).toISOString().slice(0, 10).replaceAll("-", "");
  // GA4 stores a value that looks like a number as one (the set "151" arrives as int_value 151), so read them all.
  const param = (key) => `(SELECT COALESCE(value.string_value, CAST(value.int_value AS STRING), CAST(value.double_value AS STRING)) FROM UNNEST(event_params) WHERE key = '${key}')`;
  return `
SELECT
  user_pseudo_id AS browser,
  event_timestamp AS ts,
  batch_event_index AS seq,
  ${param("action")} AS action,
  ${param("card_name")} AS card_name,
  ${param("card_set")} AS card_set,
  ${param("card_number")} AS card_number,
  ${param("card_language")} AS card_language,
  ${param("page_location")} AS page_location
FROM \`${EVENTS_TABLE}\`
WHERE _TABLE_SUFFIX BETWEEN '${first}' AND '${last}'
  AND event_name = 'wishlist_toggled'
  AND NOT EXISTS (SELECT 1 FROM UNNEST(event_params) WHERE key = 'debug_mode')
ORDER BY ts, seq`;
}

// The card page slug an event is about: its card parameters, or else the /cards/<slug>/ page it was sent from.
function eventSlug(event, slugByCard, slugs) {
  const fromCard = event.card_name && slugByCard.get(cardKey(event.card_name, event.card_set, event.card_number, event.card_language));
  if (fromCard) return fromCard;
  const fromPage = String(event.page_location || "").match(/\/cards\/([^/?#]+)\//)?.[1];
  return fromPage && slugs.has(fromPage) ? fromPage : null;
}

function later(a, b) {
  return Number(a.ts) - Number(b.ts) > 0 || (Number(a.ts) === Number(b.ts) && Number(a.seq || 0) >= Number(b.seq || 0));
}

function cardKey(name, set, number, language) {
  return [name, set, number, language].join("::");
}

// The ranking. Events in any order; cards from published-cards.json. Exported for scripts/validate-analytics.mjs.
export function countMostWished(events, cards) {
  const slugByCard = new Map(cards.map((card) => [cardKey(card.name, card.setName, card.number, card.language), card.slug]));
  const cardBySlug = new Map(cards.map((card) => [card.slug, card]));
  const last = new Map(); // browser::slug → its latest event
  let unplaced = 0;
  for (const event of events) {
    if (event.action !== "added" && event.action !== "removed") continue;
    const slug = eventSlug(event, slugByCard, cardBySlug);
    if (!slug) {
      unplaced += 1;
      continue;
    }
    const key = `${event.browser}::${slug}`;
    const seen = last.get(key);
    // GA4 sends events in batches that can share a timestamp (add, remove, add again in one batch), so the order
    // within a batch (batch_event_index) breaks ties.
    if (!seen || later(event, seen)) last.set(key, { ts: event.ts, seq: event.seq, action: event.action, slug, browser: event.browser });
  }
  const wishers = new Map();
  const browsers = new Set();
  for (const { action, slug, browser } of last.values()) {
    if (action !== "added") continue;
    wishers.set(slug, (wishers.get(slug) || 0) + 1);
    browsers.add(browser);
  }
  const ranked = [...wishers]
    .map(([slug, count]) => {
      const card = cardBySlug.get(slug);
      return { slug, name: card.name, pokemon: card.pokemon, setName: card.setName, number: card.number, wishers: count };
    })
    // Most wishers first; ties in catalog order, so the file only changes when the counts do.
    .sort((a, b) => b.wishers - a.wishers || cards.indexOf(cardBySlug.get(a.slug)) - cards.indexOf(cardBySlug.get(b.slug)));
  let rank = 0;
  ranked.forEach((entry, index) => {
    if (index === 0 || entry.wishers !== ranked[index - 1].wishers) rank = index + 1;
    entry.rank = rank;
  });
  return { wishingBrowsers: browsers.size, unplacedEvents: unplaced, cards: ranked };
}

function lastMonth() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
}

function runQuery(sql) {
  return new Promise((resolve, reject) => {
    execFile("bq", ["query", "--use_legacy_sql=false", "--format=json", "--max_rows=1000000", "--quiet", sql], { maxBuffer: 256 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr.trim() || error.message));
      else resolve(JSON.parse(stdout || "[]"));
    });
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const option = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const month = option("--month") || lastMonth();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error(`--month should look like 2026-12, got ${month}`);
  const from = option("--from");
  const events = from ? JSON.parse(await readFile(from, "utf8")) : await runQuery(monthQuery(month));
  const payload = JSON.parse(await readFile(CARDS_PATH, "utf8"));
  const cards = Array.isArray(payload) ? payload : payload.cards;
  const result = countMostWished(events, cards);

  console.log(`Most wished, ${month}: ${result.wishingBrowsers} browsers wishing, ${result.cards.length} cards wished for.`);
  for (const entry of result.cards.slice(0, 15)) {
    console.log(`${String(entry.rank).padStart(3)}. ${entry.name} (${entry.setName} ${entry.number}): ${entry.wishers}`);
  }
  if (result.unplacedEvents) console.log(`${result.unplacedEvents} event(s) couldn't be matched to a card (tile-star wishes before 2026-11-17, or cards no longer published).`);

  if (argv.includes("--write")) {
    let all = {};
    try {
      all = JSON.parse(await readFile(OUT_PATH, "utf8"));
    } catch {}
    all[month] = { generatedAt: new Date().toISOString(), ...result };
    const sorted = Object.fromEntries(Object.entries(all).sort(([a], [b]) => a.localeCompare(b)));
    await writeFile(OUT_PATH, `${JSON.stringify(sorted, null, 2)}\n`);
    console.log(`Saved to data/most-wished.json.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

export { monthQuery };
