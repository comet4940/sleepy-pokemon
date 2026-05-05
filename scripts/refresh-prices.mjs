import { readFile, writeFile } from "node:fs/promises";

const GUIDE_PATH = "docs/published-cards.json";
const API_BASE_URL = "https://api.pokemontcg.io/v2";
const API_SELECT_FIELDS = [
  "id",
  "images",
  "tcgplayer",
  "cardmarket",
].join(",");
const DRY_RUN = process.argv.includes("--dry-run");
const API_KEY = process.env.POKEMON_TCG_API_KEY || "";

const raw = await readFile(GUIDE_PATH, "utf8");
const guide = JSON.parse(raw);
const cards = Array.isArray(guide) ? guide : guide.cards;

if (!Array.isArray(cards)) {
  throw new Error(`${GUIDE_PATH} does not contain a cards array.`);
}

let checked = 0;
let updated = 0;

for (const card of cards) {
  if (!shouldRefresh(card)) continue;
  checked += 1;

  try {
    const apiCard = await fetchCard(card.apiId);
    const nextPrice = selectBestPrice(apiCard);
    const changed = applyUpdates(card, apiCard, nextPrice);
    if (changed) updated += 1;
  } catch (error) {
    console.warn(`Skipped ${card.apiId}: ${error.message}`);
  }
}

if (!Array.isArray(guide)) {
  guide.priceRefreshedAt = new Date().toISOString();
}

if (!DRY_RUN) {
  const next = JSON.stringify(guide, null, 2) + "\n";
  if (next !== raw) {
    await writeFile(GUIDE_PATH, next, "utf8");
  }
}

console.log(`${DRY_RUN ? "Checked" : "Refreshed"} ${checked} API-linked English cards; ${updated} changed.`);

function shouldRefresh(card) {
  return Boolean(card.apiId) && (card.language || "English") === "English";
}

async function fetchCard(apiId) {
  const params = new URLSearchParams({ select: API_SELECT_FIELDS });
  const response = await fetch(`${API_BASE_URL}/cards/${encodeURIComponent(apiId)}?${params}`, {
    headers: API_KEY ? { "X-Api-Key": API_KEY } : {},
  });
  if (!response.ok) {
    throw new Error(`Pokemon TCG API returned ${response.status}`);
  }
  const payload = await response.json();
  return payload.data;
}

function applyUpdates(card, apiCard, nextPrice) {
  const before = JSON.stringify(pickComparableFields(card));
  if (apiCard.images?.small) card.imageSmall = apiCard.images.small;
  if (apiCard.images?.large) card.imageLarge = apiCard.images.large;

  if (nextPrice.market !== null) {
    card.priceMarket = nextPrice.market;
    card.priceLow = nextPrice.low;
    card.priceMid = nextPrice.mid;
    card.priceHigh = nextPrice.high;
    card.priceType = nextPrice.type;
    card.priceSource = nextPrice.source;
    card.priceUpdatedAt = nextPrice.updatedAt;
  }

  const after = JSON.stringify(pickComparableFields(card));
  if (before !== after) {
    card.updatedAt = new Date().toISOString();
    return true;
  }
  return false;
}

function pickComparableFields(card) {
  return {
    imageSmall: card.imageSmall || "",
    imageLarge: card.imageLarge || "",
    priceMarket: numericOrNull(card.priceMarket),
    priceLow: numericOrNull(card.priceLow),
    priceMid: numericOrNull(card.priceMid),
    priceHigh: numericOrNull(card.priceHigh),
    priceType: card.priceType || "",
    priceSource: card.priceSource || "",
    priceUpdatedAt: card.priceUpdatedAt || "",
  };
}

function selectBestPrice(apiCard) {
  const tcgPrices = apiCard.tcgplayer?.prices || {};
  const preferred = [
    "holofoil",
    "normal",
    "reverseHolofoil",
    "1stEditionHolofoil",
    "1stEditionNormal",
  ];

  const sortedEntries = Object.entries(tcgPrices).sort(([a], [b]) => {
    const aRank = preferred.includes(a) ? preferred.indexOf(a) : preferred.length;
    const bRank = preferred.includes(b) ? preferred.indexOf(b) : preferred.length;
    return aRank - bRank;
  });

  for (const [type, values] of sortedEntries) {
    const market = numericOrNull(values.market ?? values.mid ?? values.low);
    if (market !== null) {
      return {
        source: "TCGPlayer",
        type,
        market,
        low: numericOrNull(values.low),
        mid: numericOrNull(values.mid),
        high: numericOrNull(values.high),
        updatedAt: apiCard.tcgplayer?.updatedAt || "",
      };
    }
  }

  const cardmarket = apiCard.cardmarket?.prices;
  if (cardmarket) {
    const market = numericOrNull(cardmarket.averageSellPrice ?? cardmarket.trendPrice ?? cardmarket.lowPrice);
    if (market !== null) {
      return {
        source: "Cardmarket",
        type: "trend",
        market,
        low: numericOrNull(cardmarket.lowPrice),
        mid: numericOrNull(cardmarket.trendPrice),
        high: null,
        updatedAt: apiCard.cardmarket?.updatedAt || "",
      };
    }
  }

  return {
    source: "",
    type: "",
    market: null,
    low: null,
    mid: null,
    high: null,
    updatedAt: "",
  };
}

function numericOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
