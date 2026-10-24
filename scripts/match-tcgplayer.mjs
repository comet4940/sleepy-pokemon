// Finds each English card's TCGplayer product on TCGCSV, so the price refresh can look prices up by ID.
//
//   node scripts/match-tcgplayer.mjs            report matches for cards without a tcgplayerProductId
//   node scripts/match-tcgplayer.mjs --all      report for every English card, including matched ones
//   node scripts/match-tcgplayer.mjs --write    also save the matches to docs/published-cards.json
//
// Review the report before writing: it flags guesses (no clear printing, big price changes, no match).
import { readFile, writeFile } from "node:fs/promises";
import { CARDS_PATH } from "./build-helpers.mjs";
import { fetchGroups, fetchPrices, fetchProducts, pickPrice } from "./tcgcsv.mjs";

const WRITE = process.argv.includes("--write");
const ALL = process.argv.includes("--all");

// Our set name -> TCGplayer group names, where stripping the "SV01:"-style prefix isn't enough.
const SET_ALIASES = {
  "151": ["SV: Scarlet & Violet 151"],
  "Scarlet & Violet": ["SV01: Scarlet & Violet Base Set"],
  "Sword & Shield": ["SWSH01: Sword & Shield Base Set"],
  "Expedition Base Set": ["Expedition"],
  "HS—Triumphant": ["Triumphant"],
  "HS—Undaunted": ["Undaunted"],
  "Legendary Treasures": ["Legendary Treasures", "Legendary Treasures: Radiant Collection"],
  "Scarlet & Violet Black Star Promos": ["SV: Scarlet & Violet Promo Cards"],
  "SWSH Black Star Promos": ["SWSH: Sword & Shield Promo Cards"],
  "Sun & Moon Promos": ["SM Promos"],
  "XY Black Star Promos": ["XY Promos"],
  "Wizards Black Star Promos": ["WoTC Promo"],
};

// The printing we used before (pokemontcg.io's names) -> TCGplayer's, most likely first.
const PRINTING_NAMES = {
  normal: ["Normal", "Unlimited"],
  holofoil: ["Holofoil", "Unlimited Holofoil"],
  reverseHolofoil: ["Reverse Holofoil"],
  "1stEdition": ["1st Edition", "1st Edition Holofoil", "1st Edition Normal"],
  "1stEditionHolofoil": ["1st Edition Holofoil"],
  "1stEditionNormal": ["1st Edition Normal", "1st Edition"],
};
// With no earlier printing to go on, assume the common copy: the regular print, not reverse holo or 1st edition.
const DEFAULT_PRINTINGS = ["Holofoil", "Normal", "Unlimited Holofoil", "Unlimited", "1st Edition Holofoil", "1st Edition", "Reverse Holofoil"];

const raw = await readFile(CARDS_PATH, "utf8");
const payload = JSON.parse(raw);
const cards = payload.cards.filter((card) => (card.language || "English") === "English" && (ALL || !card.tcgplayerProductId));

const groups = await fetchGroups();
const groupsByKey = new Map();
for (const group of groups) {
  for (const key of new Set([normalize(group.name), normalize(stripSetCode(group.name))])) {
    groupsByKey.set(key, [...(groupsByKey.get(key) || []), group]);
  }
}

const groupData = new Map();
async function loadGroup(groupId) {
  if (!groupData.has(groupId)) {
    const products = await fetchProducts(groupId);
    const prices = await fetchPrices(groupId);
    groupData.set(groupId, { products, prices });
  }
  return groupData.get(groupId);
}

const rows = [];
for (const card of cards) {
  rows.push({ card, ...(await matchCard(card)) });
}

const flagged = rows.filter((row) => row.flags.length);
console.log(`# TCGplayer matches\n`);
console.log(`${rows.length} English cards checked: ${rows.filter((row) => row.product).length} matched, ${flagged.length} to review.\n`);
console.log(`## To review\n`);
console.log(`| Card | Match | Printing | Price now → TCGCSV | Why |\n| --- | --- | --- | --- | --- |`);
flagged.forEach((row) => console.log(tableRow(row)));
console.log(`\n## Matched\n`);
console.log(`| Card | Match | Printing | Price now → TCGCSV | |\n| --- | --- | --- | --- | --- |`);
rows.filter((row) => !row.flags.length).forEach((row) => console.log(tableRow(row)));

if (WRITE) {
  for (const row of rows) {
    if (!row.product) continue;
    row.card.tcgplayerProductId = row.product.productId;
    row.card.tcgplayerGroupId = row.group.groupId;
    if (row.printing) row.card.priceType = row.printing;
  }
  const next = `${JSON.stringify(payload, null, 2)}\n`;
  if (next !== raw) await writeFile(CARDS_PATH, next, "utf8");
  console.log(`\nSaved ${rows.filter((row) => row.product).length} matches to ${CARDS_PATH}.`);
}

async function matchCard(card) {
  const flags = [];
  for (const group of findGroups(card.setName)) {
    const { products, prices } = await loadGroup(group.groupId);
    // Aquapolis and Skyridge print some numbers twice (74a, 74b), so a letter suffix still counts, flagged.
    const sameNumber = products.filter((product) => numberKey(productNumber(product)).replace(/(?<=\d)[a-z]$/, "") === numberKey(card.number));
    // A set can reuse a number (e.g. promos), so the product's name must also match the card. Prefer the plain
    // product over variants like "Eevee - 173 (Pokemon Center Exclusive)".
    const named = sameNumber.filter((candidate) => nameMatches(candidate.name, card));
    const product = named.find((candidate) => !/[([]/.test(candidate.name.split(" - ").slice(1).join(" - "))) || named[0];
    if (!product) continue;
    if (named.length > 1) flags.push(`also: ${named.filter((other) => other !== product).map((other) => other.name).join(", ")}`);

    const rowsForProduct = prices.filter((price) => price.productId === product.productId);
    const available = rowsForProduct.filter((price) => pickPrice(price) !== null).map((price) => price.subTypeName);
    const wanted = PRINTING_NAMES[card.priceType] || [];
    let printing = wanted.find((name) => available.includes(name));
    if (!printing && card.priceType && wanted.length === 0 && available.includes(card.priceType)) printing = card.priceType;
    if (!printing) {
      printing = DEFAULT_PRINTINGS.find((name) => available.includes(name)) || available[0] || "";
      if (available.length > 1) flags.push(`printing guessed from ${available.join(", ")}`);
    }
    const price = pickPrice(rowsForProduct.find((row) => row.subTypeName === printing));
    if (!available.length) flags.push("no TCGplayer price yet");
    const current = card.priceMarket ?? null;
    if (current !== null && price !== null && Math.max(current, price) / Math.max(0.01, Math.min(current, price)) >= 2) {
      flags.push("price differs 2× or more");
    }
    return { group, product, printing, price, flags };
  }
  return { flags: ["no match"] };
}

function findGroups(setName) {
  const aliases = SET_ALIASES[setName];
  if (aliases) return aliases.flatMap((alias) => groups.filter((group) => group.name === alias));
  // TCGplayer names the 2003–2007 sets "EX Deoxys", "EX FireRed & LeafGreen" and so on.
  return [setName, stripSetCode(setName), `EX ${setName}`].map((name) => groupsByKey.get(normalize(name))).find(Boolean) || [];
}

// "SV01: Scarlet & Violet Base Set" -> "Scarlet & Violet Base Set", "SM - Unbroken Bonds" -> "Unbroken Bonds".
function stripSetCode(name) {
  return String(name).replace(/^(?:[A-Z]{1,4}\d{0,2}(?:\.\d)?[a-z]?\s*(?::|\s-)\s*)+/, "");
}

function productNumber(product) {
  return product.extendedData?.find((data) => data.name === "Number")?.value || "";
}

// "043/128" -> "43", "SWSH032" -> "swsh32", "RC16/RC32" -> "rc16".
function numberKey(number) {
  return String(number || "").split("/")[0].toLowerCase().replace(/^([a-z-]*)0+(?=\d)/, "$1");
}

function nameMatches(productName, card) {
  // "Pikachu - 043/128" or "Professor's Research [Professor Birch] - 221": compare the part before the number.
  const name = normalize(String(productName).split(" - ")[0].replace(/\(.*?\)|\[.*?\]/g, ""));
  return [card.name, card.pokemon].some((value) => value && (name === normalize(value) || name.includes(normalize(value))));
}

function normalize(value) {
  return String(value || "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
}

function tableRow({ card, group, product, printing, price, flags }) {
  const money = (value) => (value === null || value === undefined ? "—" : `$${Number(value).toFixed(2)}`);
  const match = product ? `${product.name} (${group.name}, #${product.productId})` : "—";
  return `| ${card.name}, ${card.setName} ${card.number} | ${match} | ${printing || "—"} | ${money(card.priceMarket)} → ${money(price)} | ${flags.join("; ")} |`;
}
