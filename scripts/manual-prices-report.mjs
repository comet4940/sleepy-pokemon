// Writes the monthly "Check curator prices" issue: every Manual price in docs/prices.json, oldest first.
// The daily refresh never touches Manual prices, so this is the only reminder that they age (#164).
//
//   node scripts/manual-prices-report.mjs [--today YYYY-MM-DD]
//
// Prints the issue title on the first line and the body after it. --today is for testing; it defaults to today (UTC).
import { readFile } from "node:fs/promises";
import { getCardIdentity } from "./card-identity.mjs";
import { CARDS_PATH, PRICES_PATH } from "./build-helpers.mjs";

// Prices checked this recently are listed as fresh, so a month's review can skip them.
const FRESH_DAYS = 7;

const todayArg = process.argv.indexOf("--today");
const today = todayArg > -1 ? process.argv[todayArg + 1] : new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error(`--today must be YYYY-MM-DD, got "${today}"`);

const { cards } = JSON.parse(await readFile(CARDS_PATH, "utf8"));
const { prices } = JSON.parse(await readFile(PRICES_PATH, "utf8"));
const cardById = new Map(cards.map((card) => [getCardIdentity(card), card]));

const daysOld = (date) => Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date.replaceAll("/", "-")}T00:00:00Z`)) / 86400000);
const usd = (value) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const rows = Object.entries(prices)
  .filter(([, entry]) => entry.source === "Manual")
  .map(([id, entry]) => ({ id, entry, card: cardById.get(id), age: daysOld(entry.updatedAt) }))
  .sort((a, b) => b.age - a.age || a.id.localeCompare(b.id));

const month = new Date(`${today}T00:00:00Z`).toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const stale = rows.filter((row) => row.age >= FRESH_DAYS);
const table = rows.map(({ id, entry, card, age }) => {
  const name = card ? `${card.name} | ${card.setName} ${card.number} | ${card.language}` : `\`${id}\` (no matching card) | | `;
  return `| ${name} | ${usd(entry.market)} | ${entry.updatedAt} | ${age} days${age < FRESH_DAYS ? " · fresh" : ""} |`;
});

console.log(`Check curator prices (${month})`);
console.log(`The daily refresh never updates **Manual** prices in \`docs/prices.json\`, so they're re-checked by hand once a month (#164). On the site they show as "curator's estimate · as of <date>".

**${stale.length} of ${rows.length}** need a look${rows.length > stale.length ? ` (the ${rows.length - stale.length} marked *fresh* were checked in the last ${FRESH_DAYS} days and can be skipped)` : ""}:

| Card | Set | Language | Price | As of | Age |
|---|---|---|---|---|---|
${table.join("\n")}

**To update:** reply with a new price per card, or "unchanged". Either way the entry gets today's date, so "as of" stays current. Then close this issue. See "Prices → Manual prices" in DATA-MODEL.md.`);
