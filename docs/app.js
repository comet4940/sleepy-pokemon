const DEFAULT_LANGUAGE = "English";
const PUBLIC_DEFAULT_SORT = "price-high";

const priorityRank = {
  High: 0,
  Medium: 1,
  Low: 2,
};

const state = {
  cards: [],
  filters: {
    search: "",
    pokemon: "all",
    set: "all",
    rarity: "all",
    language: "all",
    maxPrice: "",
    sort: PUBLIC_DEFAULT_SORT,
  },
};

const elements = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheElements();
  bindEvents();
  state.cards = await loadPublishedCards();
  render();
}

function cacheElements() {
  elements.resultCount = document.querySelector("#resultCount");
  elements.priceStatus = document.querySelector("#priceStatus");
  elements.cardGrid = document.querySelector("#cardGrid");
  elements.emptyState = document.querySelector("#emptyState");
  elements.openFiltersButton = document.querySelector("#openFiltersButton");
  elements.downloadChecklistButton = document.querySelector("#downloadChecklistButton");
  elements.filtersDialog = document.querySelector("#filtersDialog");
  elements.searchFilter = document.querySelector("#searchFilter");
  elements.pokemonFilter = document.querySelector("#pokemonFilter");
  elements.setFilter = document.querySelector("#setFilter");
  elements.rarityFilter = document.querySelector("#rarityFilter");
  elements.languageFilter = document.querySelector("#languageFilter");
  elements.maxPriceFilter = document.querySelector("#maxPriceFilter");
  elements.sortSelect = document.querySelector("#sortSelect");
  elements.clearFiltersButton = document.querySelector("#clearFiltersButton");
  elements.toast = document.querySelector("#toast");
  elements.cardDetailDialog = document.querySelector("#cardDetailDialog");
  elements.closeCardDetailButton = document.querySelector("#closeCardDetailButton");
  elements.detailImageFrame = document.querySelector("#detailImageFrame");
  elements.detailEyebrow = document.querySelector("#detailEyebrow");
  elements.detailTitle = document.querySelector("#detailTitle");
  elements.detailSubtitle = document.querySelector("#detailSubtitle");
  elements.detailMetaGrid = document.querySelector("#detailMetaGrid");
  elements.detailNotes = document.querySelector("#detailNotes");
}

function bindEvents() {
  bind(elements.searchFilter, "input", () => {
    state.filters.search = elements.searchFilter.value.trim();
    renderCards();
  });

  [
    [elements.pokemonFilter, "pokemon"],
    [elements.setFilter, "set"],
    [elements.rarityFilter, "rarity"],
    [elements.languageFilter, "language"],
    [elements.maxPriceFilter, "maxPrice"],
    [elements.sortSelect, "sort"],
  ].forEach(([element, key]) => {
    bind(element, "change", () => {
      state.filters[key] = element.value;
      renderCards();
    });
  });

  bind(elements.clearFiltersButton, "click", clearFilters);
  bind(elements.downloadChecklistButton, "click", downloadChecklist);
  bind(elements.openFiltersButton, "click", openFiltersDialog);
  bind(elements.cardGrid, "click", handleCardGridClick);
  bind(elements.cardGrid, "keydown", handleCardGridKeydown);
  bind(elements.closeCardDetailButton, "click", closeCardDetail);
  bind(elements.cardDetailDialog, "click", (event) => {
    if (event.target === elements.cardDetailDialog) closeCardDetail();
  });
}


function bind(element, eventName, handler) {
  if (!element) return;
  element.addEventListener(eventName, handler);
}

function openFiltersDialog() {
  elements.filtersDialog.showModal();
  window.setTimeout(() => elements.searchFilter.focus(), 50);
}

async function loadPublishedCards() {
  try {
    const response = await fetch("published-cards.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Guide load failed with ${response.status}`);
    const payload = await response.json();
    const cards = Array.isArray(payload) ? payload : payload.cards;
    if (!Array.isArray(cards)) throw new Error("No cards array found");
    return cards.map(normalizeCard);
  } catch (error) {
    console.error(error);
    showToast("Could not load the card guide.");
    return [];
  }
}

function normalizeCard(card) {
  return {
    apiId: card.apiId || "",
    tcgdexId: card.tcgdexId || "",
    name: card.name || card.pokemon || "Unknown card",
    pokemon: card.pokemon || derivePokemonName(card.name || ""),
    setName: card.setName || "",
    setSeries: card.setSeries || "",
    setId: card.setId || "",
    number: card.number || "",
    rarity: card.rarity || "",
    language: card.language || DEFAULT_LANGUAGE,
    artist: card.artist || "",
    imageSmall: card.imageSmall || card.imageLarge || "",
    imageLarge: card.imageLarge || card.imageSmall || "",
    priceMarket: numericOrNull(card.priceMarket),
    priceLow: numericOrNull(card.priceLow),
    priceMid: numericOrNull(card.priceMid),
    priceHigh: numericOrNull(card.priceHigh),
    priceType: card.priceType || "",
    priceSource: card.priceSource || "",
    priceUpdatedAt: card.priceUpdatedAt || "",
    setReleaseDate: card.setReleaseDate || "",
    priority: card.priority || "Medium",
    notes: card.notes || "",
    createdAt: card.createdAt || "",
    updatedAt: card.updatedAt || "",
  };
}

function render() {
  renderFilters();
  renderCards();
}

function renderFilters() {
  syncFilterInputs();
  fillSelect(elements.pokemonFilter, uniqueValues("pokemon"), state.filters.pokemon, "All Pokemon");
  fillSelect(elements.setFilter, uniqueValues("setName"), state.filters.set, "All sets");
  fillSelect(elements.rarityFilter, uniqueValues("rarity"), state.filters.rarity, "All rarities");
  fillSelect(elements.languageFilter, uniqueValues("language"), state.filters.language, "All languages");
}

function syncFilterInputs() {
  elements.searchFilter.value = state.filters.search;
  elements.maxPriceFilter.value = state.filters.maxPrice;
  elements.sortSelect.value = state.filters.sort;
}

function fillSelect(element, values, currentValue, allLabel) {
  if (!element) return;
  const currentExists = currentValue === "all" || values.includes(currentValue);
  const safeValue = currentExists ? currentValue : "all";
  if (safeValue !== currentValue) {
    state.filters[elementToFilterKey(element)] = safeValue;
  }

  element.innerHTML = [
    `<option value="all">${escapeHtml(allLabel)}</option>`,
    ...values.map((value) => {
      const selected = value === safeValue ? " selected" : "";
      return `<option value="${escapeAttribute(value)}"${selected}>${escapeHtml(value)}</option>`;
    }),
  ].join("");
}

function elementToFilterKey(element) {
  return {
    pokemonFilter: "pokemon",
    setFilter: "set",
    rarityFilter: "rarity",
    languageFilter: "language",
  }[element.id];
}

function renderCards() {
  const cards = getFilteredCards();
  elements.resultCount.textContent = `${cards.length} ${cards.length === 1 ? "card" : "cards"}`;
  elements.emptyState.classList.toggle("hidden", cards.length > 0);
  elements.cardGrid.innerHTML = cards.map(renderCard).join("");
}

function getFilteredCards() {
  const search = state.filters.search.toLowerCase();
  const maxPrice = numericOrNull(state.filters.maxPrice);

  return state.cards
    .filter((card) => {
      const searchable = [
        card.name,
        card.pokemon,
        card.setName,
        card.setSeries,
        card.number,
        card.rarity,
        card.language,
        card.artist,
        card.notes,
      ].join(" ").toLowerCase();

      if (search && !searchable.includes(search)) return false;
      if (state.filters.pokemon !== "all" && card.pokemon !== state.filters.pokemon) return false;
      if (state.filters.set !== "all" && card.setName !== state.filters.set) return false;
      if (state.filters.rarity !== "all" && card.rarity !== state.filters.rarity) return false;
      if (state.filters.language !== "all" && card.language !== state.filters.language) return false;
      if (maxPrice !== null && getDisplayPrice(card) > maxPrice) return false;
      return true;
    })
    .sort(compareCards);
}

function compareCards(a, b) {
  if (state.filters.sort === "price-low") {
    return getDisplayPrice(a) - getDisplayPrice(b);
  }
  if (state.filters.sort === "price-high") {
    return getDisplayPrice(b) - getDisplayPrice(a);
  }
  if (state.filters.sort === "pokemon") {
    return a.pokemon.localeCompare(b.pokemon) || a.name.localeCompare(b.name);
  }
  if (state.filters.sort === "language") {
    return a.language.localeCompare(b.language) || a.pokemon.localeCompare(b.pokemon);
  }
  if (state.filters.sort === "set") {
    return a.setName.localeCompare(b.setName) || compareDates(a.setReleaseDate, b.setReleaseDate);
  }
  if (state.filters.sort === "newest") {
    return compareDates(b.setReleaseDate, a.setReleaseDate);
  }
  return (priorityRank[a.priority] ?? 1) - (priorityRank[b.priority] ?? 1)
    || a.pokemon.localeCompare(b.pokemon)
    || a.setName.localeCompare(b.setName);
}

function renderCard(card) {
  const price = getDisplayPrice(card);
  const priceText = price ? formatCurrency(price) : "No price";
  const sourceText = [card.priceSource, card.priceType].filter(Boolean).join(" / ");

  return `
    <article class="card-tile" data-card-id="${escapeAttribute(getCardIdentity(card))}" tabindex="0" role="button" aria-label="Open ${escapeAttribute(card.name)} preview">
      <div class="card-image-frame">
        ${card.imageLarge || card.imageSmall
          ? `<img src="${escapeAttribute(card.imageLarge || card.imageSmall)}" alt="${escapeAttribute(`${card.name} card`)}" loading="lazy" />`
          : `<div class="image-fallback">${escapeHtml(card.name)}</div>`}
      </div>
      <div class="card-body">
        <div class="card-title-row">
          <div>
            <h3>${escapeHtml(card.name)}</h3>
            <p class="card-subtitle">${escapeHtml(card.pokemon)} / ${escapeHtml(card.language)}</p>
          </div>
          <div class="price-pill">${escapeHtml(priceText)}</div>
        </div>
        <div class="meta-grid">
          ${metaItem("Set", card.setName)}
          ${metaItem("Number", card.number)}
          ${metaItem("Rarity", card.rarity)}
          ${metaItem("Artist", card.artist || "Unknown")}
          ${metaItem("Release", formatDate(card.setReleaseDate) || "Unknown")}
          ${metaItem("Price", sourceText || "Manual")}
        </div>
        ${card.notes ? `<p class="notes">${escapeHtml(card.notes)}</p>` : ""}
      </div>
    </article>
  `;
}

function handleCardGridKeydown(event) {
  if (event.key !== "Enter" && event.key !== " ") return;
  const tile = event.target.closest(".card-tile[data-card-id]");
  if (!tile) return;
  event.preventDefault();
  const card = state.cards.find((item) => getCardIdentity(item) === tile.dataset.cardId);
  if (card) openCardDetail(card);
}

function handleCardGridClick(event) {
  const tile = event.target.closest(".card-tile[data-card-id]");
  if (!tile) return;
  const card = state.cards.find((item) => getCardIdentity(item) === tile.dataset.cardId);
  if (card) openCardDetail(card);
}

function openCardDetail(card) {
  const price = getDisplayPrice(card);
  const priceText = price ? formatCurrency(price) : "No price";
  const image = card.imageLarge || card.imageSmall;
  elements.detailEyebrow.textContent = [card.setName, card.number].filter(Boolean).join(" / ") || "Card preview";
  elements.detailTitle.textContent = card.name;
  elements.detailSubtitle.textContent = [card.pokemon, card.language, card.rarity].filter(Boolean).join(" / ");
  elements.detailImageFrame.innerHTML = image
    ? `<img src="${escapeAttribute(image)}" alt="${escapeAttribute(`${card.name} card`)}" />`
    : `<div class="image-fallback">${escapeHtml(card.name)}</div>`;
  elements.detailMetaGrid.innerHTML = [
    metaItem("Set", card.setName),
    metaItem("Number", card.number),
    metaItem("Rarity", card.rarity),
    metaItem("Artist", card.artist || "Unknown"),
    metaItem("Release", formatDate(card.setReleaseDate) || "Unknown"),
    metaItem("Price", priceText),
  ].join("");
  elements.detailNotes.textContent = card.notes || "";
  elements.detailNotes.classList.toggle("hidden", !card.notes);
  elements.cardDetailDialog.showModal();
}

function closeCardDetail() {
  elements.cardDetailDialog.close();
}

function getCardIdentity(card) {
  return [card.apiId, card.tcgdexId, card.language, card.setName, card.number, card.name]
    .filter(Boolean)
    .join("::");
}

function metaItem(label, value) {
  return `
    <div class="meta-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "-")}</strong>
    </div>
  `;
}

function downloadChecklist() {
  const columns = [
    "Collected",
    "Pokemon",
    "Card Name",
    "Set",
    "Number",
    "Rarity",
    "Language",
    "Artist",
    "Market Price",
    "Price Source",
    "Release Date",
    "Notes",
    "Image URL",
  ];
  const rows = state.cards.map((card) => [
    "",
    card.pokemon,
    card.name,
    card.setName,
    card.number,
    card.rarity,
    card.language,
    card.artist,
    getDisplayPrice(card) || "",
    [card.priceSource, card.priceType].filter(Boolean).join(" / "),
    card.setReleaseDate,
    card.notes,
    card.imageLarge || card.imageSmall,
  ]);
  const csv = [columns, ...rows]
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\n");
  const blob = new Blob([`\uFEFF${csv}\n`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "sleepy-pokemon-checklist.csv";
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("Checklist downloaded.");
}

function escapeCsvCell(value) {
  const cell = String(value ?? "");
  if (!/[",\n\r]/.test(cell)) return cell;
  return `"${cell.replace(/"/g, '""')}"`;
}

function clearFilters() {
  state.filters = {
    search: "",
    pokemon: "all",
    set: "all",
    rarity: "all",
    language: "all",
    maxPrice: "",
    sort: PUBLIC_DEFAULT_SORT,
  };
  render();
}

function uniqueValues(key) {
  return [...new Set(state.cards.map((card) => card[key]).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function derivePokemonName(name) {
  if (!name) return "";
  return name
    .replace(/\b(VMAX|VSTAR|V-UNION|ex|EX|GX|V)\b/g, "")
    .replace(/'s\b.*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")[0];
}

function getDisplayPrice(card) {
  return numericOrNull(card.priceMarket ?? card.priceMid ?? card.priceLow) || 0;
}

function numericOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function compareDates(a, b) {
  const left = a ? new Date(a).getTime() : 0;
  const right = b ? new Date(b).getTime() : 0;
  return left - right;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value.replaceAll("/", "-"));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatCurrency(value) {
  const number = numericOrNull(value) || 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(number);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.remove("hidden");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    elements.toast.classList.add("hidden");
  }, 3200);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
