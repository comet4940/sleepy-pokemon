// TCGCSV (https://tcgcsv.com) mirrors TCGplayer's catalog and market prices once a day, around 20:00 UTC.
// Following its usage guidelines (https://tcgcsv.com/docs#usage-guidelines): identify the site in the
// User-Agent, one request at a time with a pause between them, and only fetch what we need.
const BASE_URL = "https://tcgcsv.com";
const POKEMON_CATEGORY = 3;
const USER_AGENT = "SleepyPokemon/1.0 (+https://www.sleepypokemon.com)";
const PAUSE_MS = 250;
const ATTEMPTS = 3;

let lastRequestAt = 0;

async function request(path) {
  let lastError;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const wait = lastRequestAt + PAUSE_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    try {
      const response = await fetch(`${BASE_URL}${path}`, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(30000),
      });
      if (response.ok) return response;
      lastError = new Error(`TCGCSV returned ${response.status} for ${path}`);
      // A 4xx other than rate limiting won't get better by asking again.
      if (response.status < 500 && response.status !== 429) break;
    } catch (error) {
      lastError = error;
    }
    if (attempt < ATTEMPTS) await sleep(2000 * attempt);
  }
  throw lastError;
}

async function results(path) {
  const payload = await (await request(path)).json();
  if (!Array.isArray(payload.results)) throw new Error(`TCGCSV returned no results for ${path}`);
  return payload.results;
}

// When TCGCSV last rebuilt its files, as an ISO timestamp. Check this before downloading anything else.
export async function fetchLastUpdated() {
  const text = (await (await request("/last-updated.txt")).text()).trim();
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw new Error(`Unexpected last-updated.txt: ${text}`);
  return date.toISOString();
}

export function fetchGroups() {
  return results(`/tcgplayer/${POKEMON_CATEGORY}/groups`);
}

export function fetchProducts(groupId) {
  return results(`/tcgplayer/${POKEMON_CATEGORY}/${groupId}/products`);
}

// One row per product and printing: { productId, subTypeName, marketPrice, midPrice, lowPrice, ... }.
export function fetchPrices(groupId) {
  return results(`/tcgplayer/${POKEMON_CATEGORY}/${groupId}/prices`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
