// Market prices live in prices.json, which only the daily refresh (scripts/refresh-prices.mjs) writes, so a
// price change touches one file instead of every page that shows it. This script loads it and fills in each
// [data-price-for] slot on card, guide and set pages; app.js uses window.sleepyPrices for the lightbox,
// price filters and sorting.
(function () {
  const pricesUrl = new URL("prices.json", document.currentScript.src);
  const NEW_SET_DAYS = 90;

  const ready = fetch(pricesUrl, { cache: "no-cache" })
    .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`prices.json returned ${response.status}`))))
    .then((payload) => new Map(Object.entries(payload.prices || {})))
    .catch((error) => {
      console.error(error);
      return new Map();
    });

  // A card identity (scripts/card-identity.mjs) -> { market, source, updatedAt }, or null.
  async function get(cardId) {
    const entry = (await ready).get(cardId);
    return entry && Number.isFinite(entry.market) ? entry : null;
  }

  // The price row on card pages and in the lightbox. Cards from a recent set usually have no sales yet. A
  // Manual price is the curator's estimate for a card TCGplayer doesn't sell, so it never says "market".
  function renderRow(entry, setReleaseDate) {
    if (!entry) return `<span class="detail-no-price">${escapeHtml(noPriceLabel(setReleaseDate))}</span>`;
    const label = isEstimate(entry) ? "curator's estimate" : `market · ${entry.source === "TCGplayer" ? "TCGplayer via TCGCSV" : entry.source || "TCGplayer"}`;
    const asOf = entry.updatedAt ? ` · as of ${escapeHtml(formatDate(entry.updatedAt))}` : "";
    return `<strong>${escapeHtml(formatCurrency(entry.market))}</strong><span>${escapeHtml(label)}${asOf}</span>`;
  }

  // The short price pill on guide and set page cards.
  function renderPill(entry, setReleaseDate) {
    if (!entry) return escapeHtml(noPriceLabel(setReleaseDate));
    return escapeHtml(`${formatCurrency(entry.market)}${isEstimate(entry) ? " (est.)" : ""}`);
  }

  function isEstimate(entry) {
    return entry.source === "Manual";
  }

  function noPriceLabel(setReleaseDate) {
    const match = String(setReleaseDate || "").match(/^(\d{4})[/-](\d{2})[/-](\d{2})/);
    const days = match ? (Date.now() - Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) / 86400000 : -1;
    return days >= 0 && days <= NEW_SET_DAYS ? "New set, price coming soon" : "No current market price";
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
  }

  function formatDate(value) {
    const match = String(value).match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
    if (!match) return value;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
      .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function fillSlots() {
    document.querySelectorAll("[data-price-for]").forEach(async (slot) => {
      const entry = await get(slot.dataset.priceFor);
      const render = slot.dataset.priceStyle === "pill" ? renderPill : renderRow;
      slot.innerHTML = render(entry, slot.dataset.setRelease);
    });
  }

  window.sleepyPrices = { ready, get, renderRow };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fillSlots);
  else fillSlots();
})();
