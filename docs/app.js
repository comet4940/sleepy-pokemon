const DEFAULT_LANGUAGE = "English";
const PUBLIC_DEFAULT_SORT = "random";
const CARD_RENDER_BATCH_SIZE = 24;
const TCGDEX_API = "https://api.tcgdex.net/v2/en/cards";

const priorityRank = {
  High: 0,
  Medium: 1,
  Low: 2,
};

const state = {
  cards: [],
  guideMemberships: new Map(),
  randomOrder: new Map(),
  filters: {
    search: "",
    mood: "all",
    pokemon: "all",
    set: "all",
    rarity: "all",
    language: "all",
    maxPrice: "",
    sort: PUBLIC_DEFAULT_SORT,
  },
  renderToken: 0,
  showAllCards: false,
  suggestionLookupUsed: false,
  catalogLoadFailed: false,
};

const elements = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheElements();
  applyInitialSearch();
  bindEvents();
  [state.cards, state.guideMemberships] = await Promise.all([
    loadPublishedCards(),
    loadGuideMemberships(),
  ]);
  assignRandomOrder();
  render();
  const catalogSurface = getCatalogSurface();
  if (catalogSurface && !state.catalogLoadFailed) {
    trackEvent("catalog_loaded", {
      catalog_surface: catalogSurface,
      card_count: state.cards.length,
    });
  }
  if (elements.cardGrid && state.filters.search && !state.catalogLoadFailed) {
    trackEvent("search_results_viewed", {
      interaction_source: "collection_url",
      query_length: state.filters.search.length,
      result_count: getFilteredCards().length,
    });
  }
}

function cacheElements() {
  elements.resultCount = document.querySelector("#resultCount");
  elements.priceStatus = document.querySelector("#priceStatus");
  elements.cardGrid = document.querySelector("#cardGrid");
  elements.latestGrid = document.querySelector("#latestGrid");
  elements.collectionTitle = document.querySelector("#collectionTitle");
  elements.collectionMeta = document.querySelector("#collectionMeta");
  elements.clearCollectionButton = document.querySelector("#clearCollectionButton");
  elements.activeSearchChip = document.querySelector("#activeSearchChip");
  elements.clearFiltersLink = document.querySelector("#clearFiltersLink");
  elements.heroCardCount = document.querySelector("#heroCardCount");
  elements.emptyState = document.querySelector("#emptyState");
  elements.searchSuggestionPrompt = document.querySelector("#searchSuggestionPrompt");
  elements.searchSuggestionLink = document.querySelector("#searchSuggestionLink");
  elements.suggestionLinks = [...document.querySelectorAll("[data-suggestion-source]")];
  elements.openFiltersButton = document.querySelector("#openFiltersButton");
  elements.moodChips = [...document.querySelectorAll(".mood-chip[data-mood]")];
  elements.surpriseButton = document.querySelector("#surpriseButton");
  elements.browseCollectionButton = document.querySelector("#browseCollectionButton");
  elements.viewAllLink = document.querySelector(".view-all-link");
  elements.downloadChecklistButton = document.querySelector("#downloadChecklistButton");
  elements.filtersDialog = document.querySelector("#filtersDialog");
  elements.searchFilter = document.querySelector("#searchFilter");
  elements.headerSearchForm = document.querySelector("[data-header-search]");
  elements.headerSearchInput = document.querySelector("[data-header-search-input]");
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
  elements.detailPriceRow = document.querySelector("#detailPriceRow");
  elements.detailCurationNote = document.querySelector("#detailCurationNote");
  elements.detailGuideLinks = document.querySelector("#detailGuideLinks");
  elements.detailCurationFacts = document.querySelector("#detailCurationFacts");
  elements.detailMoods = document.querySelector("#detailMoods");
  elements.detailMetaGrid = document.querySelector("#detailMetaGrid");
  elements.suggestionDialog = document.querySelector("#suggestionDialog");
  elements.suggestionForm = document.querySelector("#suggestionForm");
  elements.closeSuggestionButton = document.querySelector("#closeSuggestionButton");
  elements.suggestionCardSearch = document.querySelector("#suggestionCardSearch");
  elements.suggestionSearchStatus = document.querySelector("#suggestionSearchStatus");
  elements.suggestionResults = document.querySelector("#suggestionResults");
  elements.suggestionSelected = document.querySelector("#suggestionSelected");
  elements.suggestionCard = document.querySelector("#suggestionCard");
  elements.suggestionReason = document.querySelector("#suggestionReason");
  elements.suggestionNotes = document.querySelector("#suggestionNotes");
  elements.suggestionSuccess = document.querySelector("#suggestionSuccess");
  elements.suggestionDoneButton = document.querySelector("#suggestionDoneButton");
  elements.guideCardList = document.querySelector(".guide-card-list");
}

function bindEvents() {
  bind(elements.searchFilter, "input", () => {
    state.filters.search = elements.searchFilter.value.trim();
    if (elements.headerSearchInput) elements.headerSearchInput.value = state.filters.search;
    state.showAllCards = true;
    renderCards();
  });

  elements.moodChips.forEach((chip) => {
    bind(chip, "click", () => {
      state.filters.mood = chip.classList.contains("is-active") ? "all" : (chip.dataset.mood || "all");
      state.showAllCards = true;
      if (elements.searchFilter) elements.searchFilter.value = state.filters.search;
      elements.moodChips.forEach((item) => item.classList.toggle("is-active", item === chip && state.filters.mood !== "all"));
      renderCards();
      trackEvent("filter_changed", {
        filter_name: "mood",
        filter_value: state.filters.mood,
        filter_action: state.filters.mood === "all" ? "removed" : "applied",
        result_count: getFilteredCards().length,
      });
    });
  });

  [elements.pokemonFilter, elements.setFilter, elements.rarityFilter, elements.languageFilter, elements.maxPriceFilter, elements.sortSelect]
    .forEach((element) => bind(element, "change", () => { state.showAllCards = true; }));

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
      trackEvent(key === "sort" ? "sort_changed" : "filter_changed", {
        filter_name: key,
        filter_value: getAnalyticsFilterValue(key, element.value),
        filter_action: element.value === "all" || element.value === "" ? "removed" : "applied",
        result_count: getFilteredCards().length,
      });
    });
  });

  bind(elements.clearFiltersButton, "click", clearFilters);
  bind(elements.clearFiltersLink, "click", clearFilters);
  bind(elements.headerSearchInput, "input", handleHeaderSearchClear);
  bind(elements.headerSearchInput, "search", handleHeaderSearchClear);
  bind(elements.headerSearchForm, "submit", handleHeaderSearchSubmit);
  elements.suggestionLinks.forEach((link) => {
    bind(link, "click", (event) => {
      if (link.hasAttribute("data-open-suggestion-form")) {
        event.preventDefault();
        openSuggestionDialog();
      }
      trackEvent("suggestion_opened", {
        interaction_source: link.dataset.suggestionSource || "unknown",
        has_active_search: Boolean(state.filters.search),
        result_count: getFilteredCards().length,
      });
    });
  });
  bind(elements.closeSuggestionButton, "click", closeSuggestionDialog);
  bind(elements.suggestionDialog, "click", (event) => {
    if (event.target === elements.suggestionDialog) closeSuggestionDialog();
  });
  bind(elements.suggestionDialog, "close", () => {
    resetSuggestionForm();
  });
  bind(elements.suggestionCardSearch, "input", handleSuggestionSearch);
  bind(elements.suggestionForm, "submit", handleSuggestionSubmit);
  bind(elements.suggestionDoneButton, "click", closeSuggestionDialog);
  bind(elements.downloadChecklistButton, "click", downloadChecklist);
  bind(elements.openFiltersButton, "click", openFiltersDialog);
  bind(elements.surpriseButton, "click", showRandomSleeper);
  bind(elements.clearCollectionButton, "click", clearFilters);
  bind(elements.cardGrid, "click", handleCardGridClick);
  bind(elements.cardGrid, "keydown", handleCardGridKeydown);
  bind(elements.latestGrid, "click", handleCardGridClick);
  bind(elements.latestGrid, "keydown", handleCardGridKeydown);
  bind(elements.guideCardList, "click", handleGuideCardClick);
  bind(elements.closeCardDetailButton, "click", closeCardDetail);
  bind(elements.cardDetailDialog, "click", (event) => {
    if (event.target === elements.cardDetailDialog) closeCardDetail();
  });
}

function applyInitialSearch() {
  const query = new URLSearchParams(window.location.search).get("q")?.trim() || "";
  if (!query) return;
  state.filters.search = query;
  state.showAllCards = true;
  if (elements.searchFilter) elements.searchFilter.value = query;
  if (elements.headerSearchInput) elements.headerSearchInput.value = query;
}

function handleHeaderSearchSubmit(event) {
  if (!elements.cardGrid) return;
  event.preventDefault();
  const query = elements.headerSearchInput.value.trim();
  // Blur before the result scroll so iOS Safari closes its keyboard and restores the viewport.
  elements.headerSearchInput?.blur();
  const previousQuery = state.filters.search;
  if (!query) {
    if (previousQuery) clearSearchFilter("global_header");
    return;
  }
  state.filters = {
    ...state.filters,
    search: query,
    mood: "all",
    pokemon: "all",
    set: "all",
    rarity: "all",
    language: "all",
    maxPrice: "",
  };
  state.showAllCards = true;
  elements.moodChips.forEach((chip) => chip.classList.remove("is-active"));
  render();
  syncSearchUrl(query);
  document.querySelector("#collection")?.scrollIntoView({ behavior: "smooth", block: "start" });
  if (query) {
    trackEvent("search_results_viewed", {
      interaction_source: "global_header",
      query_length: query.length,
      result_count: getFilteredCards().length,
    });
  }
}

function handleHeaderSearchClear() {
  if (elements.headerSearchInput?.value.trim() || !state.filters.search.trim()) return;
  clearSearchFilter("global_header");
}

function clearSearchFilter(interactionSource) {
  if (!state.filters.search.trim()) return;
  state.filters.search = "";
  state.showAllCards = true;
  if (elements.searchFilter) elements.searchFilter.value = "";
  if (elements.headerSearchInput) elements.headerSearchInput.value = "";
  syncSearchUrl("");
  renderCards();
  trackEvent("search_cleared", {
    interaction_source: interactionSource,
    result_count: getFilteredCards().length,
  });
}

function showRandomSleeper() {
  const cards = getFilteredCards();
  const card = cards[Math.floor(Math.random() * cards.length)] || state.cards[0];
  if (!card) return;
  openCardDetail(card, "random_sleeper");
  trackEvent("random_sleeper_clicked", getCardAnalyticsParams(card));
}

function expandCollection(event) {
  state.showAllCards = true;
  renderCards();
}


function bind(element, eventName, handler) {
  if (!element) return;
  element.addEventListener(eventName, handler);
}

function openFiltersDialog() {
  if (!elements.filtersDialog) return;
  elements.filtersDialog.showModal();
  trackEvent("filters_opened");
  window.setTimeout(() => elements.pokemonFilter?.focus(), 50);
}

function openSuggestionDialog() {
  if (!elements.suggestionDialog) return;
  elements.suggestionDialog.showModal();
  window.setTimeout(() => elements.suggestionCardSearch?.focus(), 50);
}

function closeSuggestionDialog() {
  elements.suggestionDialog?.close();
}

function resetSuggestionForm() {
  suggestionFormSessionId += 1;
  suggestionLookupRequestId += 1;
  suggestionSelectionRequestId += 1;
  suggestionSelectionPromise = null;
  window.clearTimeout(suggestionSearchTimer);
  elements.suggestionForm?.reset();
  elements.suggestionForm?.classList.remove("is-success");
  elements.suggestionResults.innerHTML = "";
  elements.suggestionSelected.hidden = true;
  elements.suggestionSearchStatus.textContent = "";
  elements.suggestionSuccess.hidden = true;
  state.suggestionLookupUsed = false;
}

let suggestionSearchTimer = 0;
let suggestionLookupRequestId = 0;
let suggestionSelectionRequestId = 0;
let suggestionSelectionPromise = null;
let suggestionFormSessionId = 0;

function handleSuggestionSearch() {
  const query = elements.suggestionCardSearch.value.trim();
  const requestId = ++suggestionLookupRequestId;
  suggestionSelectionRequestId += 1;
  elements.suggestionCard.value = "";
  elements.suggestionSelected.hidden = true;
  window.clearTimeout(suggestionSearchTimer);
  if (query.length < 2) {
    elements.suggestionResults.innerHTML = "";
    elements.suggestionSearchStatus.textContent = query ? "Keep typing..." : "";
    return;
  }
  elements.suggestionSearchStatus.textContent = "Looking through the card catalog...";
  suggestionSearchTimer = window.setTimeout(() => searchSuggestionCards(query, requestId), 350);
}

async function searchSuggestionCards(query, requestId) {
  state.suggestionLookupUsed = true;
  const lookupType = getSuggestionLookupType(query);
  try {
    const numberMatch = query.match(/(?:^|\s)([A-Za-z]*\d[A-Za-z0-9]*(?:\/[A-Za-z0-9]+)?)$/);
    const name = query.replace(numberMatch?.[1] || "", "").trim();
    const params = new URLSearchParams({ "pagination:page": "1", "pagination:itemsPerPage": "8" });
    if (name) params.set("name", name);
    if (numberMatch) params.set("localId", numberMatch[1].split("/")[0]);
    if (!name && !numberMatch) params.set("name", query);
    const response = await fetch(`${TCGDEX_API}?${params}`, { mode: "cors" });
    if (!response.ok) throw new Error("Card lookup failed");
    const cards = await response.json();
    if (requestId !== suggestionLookupRequestId) return;
    elements.suggestionSearchStatus.textContent = cards.length ? "Choose the card you spotted." : "No cards found yet. Try a Pokemon name or collector number.";
    renderSuggestionResults(cards);
    trackEvent("suggestion_lookup_completed", {
      lookup_type: lookupType,
      lookup_outcome: cards.length ? "matches" : "no_matches",
      result_count: cards.length,
    });
  } catch (error) {
    if (requestId !== suggestionLookupRequestId) return;
    elements.suggestionSearchStatus.textContent = "Lookup is taking a nap. Your typed card details will still be sent.";
    elements.suggestionResults.innerHTML = "";
    trackEvent("suggestion_lookup_completed", {
      lookup_type: lookupType,
      lookup_outcome: "error",
      result_count: 0,
    });
  }
}

function getSuggestionLookupType(query) {
  const hasNumber = /(?:^|\s)[A-Za-z]*\d[A-Za-z0-9]*(?:\/[A-Za-z0-9]+)?$/.test(query);
  const hasName = query.replace(/(?:^|\s)[A-Za-z]*\d[A-Za-z0-9]*(?:\/[A-Za-z0-9]+)?$/, "").trim().length > 0;
  if (hasNumber && hasName) return "name_and_number";
  if (hasNumber) return "number";
  return "name";
}

function renderSuggestionResults(cards) {
  elements.suggestionResults.innerHTML = cards.map((card, index) => `<button type="button" class="suggestion-result" data-suggestion-card-index="${index}"><strong>${escapeHtml(card.name)}</strong><span>Card ${escapeHtml(card.localId || card.number || "number unavailable")}</span></button>`).join("");
  elements.suggestionResults.querySelectorAll("[data-suggestion-card-index]").forEach((button, index) => button.addEventListener("click", () => selectSuggestionCard(cards[index])));
}

function selectSuggestionCard(card) {
  const selectionRequestId = ++suggestionSelectionRequestId;
  const selectionPromise = resolveSuggestionCardSelection(card, selectionRequestId);
  suggestionSelectionPromise = selectionPromise;
  const clearPendingSelection = () => {
    if (suggestionSelectionPromise === selectionPromise) suggestionSelectionPromise = null;
  };
  selectionPromise.then(clearPendingSelection, clearPendingSelection);
  return selectionPromise;
}

async function resolveSuggestionCardSelection(card, selectionRequestId) {
  let selectedCard = card;
  if (card.id && !card.set) {
    try {
      const response = await fetch(`${TCGDEX_API}/${encodeURIComponent(card.id)}`, { mode: "cors" });
      if (response.ok) selectedCard = await response.json();
    } catch (error) {
      console.warn("Could not load full card details", error);
    }
  }
  if (selectionRequestId !== suggestionSelectionRequestId) return;
  const setName = selectedCard.setName || selectedCard.set?.name || "Set unavailable";
  const number = selectedCard.localId || selectedCard.number || "No number";
  const details = `${selectedCard.name} — ${setName} · ${number}`;
  elements.suggestionCard.value = details;
  elements.suggestionSelected.hidden = false;
  const image = selectedCard.image ? `${selectedCard.image}/low.webp` : (selectedCard.images?.small || selectedCard.imageSmall || "");
  elements.suggestionSelected.innerHTML = `${image ? `<img src="${escapeHtml(image)}" alt="" />` : ""}<div><strong>${escapeHtml(selectedCard.name)}</strong><span>${escapeHtml(setName)} · ${escapeHtml(number)}</span></div><button type="button" aria-label="Remove selected card">×</button>`;
  elements.suggestionSelected.querySelector("button").addEventListener("click", () => {
    elements.suggestionCard.value = "";
    elements.suggestionSelected.hidden = true;
    trackEvent("suggestion_card_removed");
  });
  elements.suggestionResults.innerHTML = "";
  elements.suggestionSearchStatus.textContent = "Card tucked in.";
  trackEvent("suggestion_card_selected", getCardAnalyticsParams({
    ...selectedCard,
    setName,
    number,
    pokemon: selectedCard.name,
    language: selectedCard.language || DEFAULT_LANGUAGE,
  }));
}

async function handleSuggestionSubmit(event) {
  event.preventDefault();
  const submissionSessionId = suggestionFormSessionId;
  while (suggestionSelectionPromise) {
    const pendingSelection = suggestionSelectionPromise;
    await pendingSelection;
    if (submissionSessionId !== suggestionFormSessionId) return;
    if (pendingSelection === suggestionSelectionPromise) break;
  }
  if (submissionSessionId !== suggestionFormSessionId) return;
  const manualCard = elements.suggestionCardSearch.value.trim();
  if (!elements.suggestionCard.value && !manualCard) {
    elements.suggestionSearchStatus.textContent = "Tell us which card you spotted first.";
    elements.suggestionCardSearch.focus();
    return;
  }
  if (!elements.suggestionCard.value) elements.suggestionCard.value = manualCard;
  const submissionParams = {
    selection_method: elements.suggestionSelected.hidden ? "manual" : "catalog_lookup",
    lookup_used: state.suggestionLookupUsed,
    has_notes: Boolean(elements.suggestionNotes.value.trim()),
  };
  const endpoint = elements.suggestionForm.dataset.emailEndpoint;
  if (!endpoint || endpoint === "EMAIL_FORM_ENDPOINT_PLACEHOLDER") {
    trackEvent("suggestion_submit_failed", { ...submissionParams, error_type: "configuration" });
    showToast("That suggestion did not send. Please try again in a moment.");
    return;
  }
  try {
    const response = await fetch(endpoint, { method: "POST", body: new FormData(elements.suggestionForm), headers: { Accept: "application/json" } });
    if (!response.ok) {
      trackEvent("suggestion_submit_failed", { ...submissionParams, error_type: "http" });
      showToast("That suggestion did not send. Please try again in a moment.");
      return;
    }
  } catch (error) {
    trackEvent("suggestion_submit_failed", { ...submissionParams, error_type: "network" });
    showToast("That suggestion did not send. Please try again in a moment.");
    return;
  }
  trackEvent("suggestion_submitted", submissionParams);
  showSuggestionSuccess();
}

function showSuggestionSuccess() {
  elements.suggestionForm.classList.add("is-success");
  elements.suggestionSuccess.hidden = false;
  elements.suggestionDoneButton.focus();
}

async function loadPublishedCards() {
  try {
    const guidePath = document.body.dataset.guidePath || "published-cards.json";
    const response = await fetch(guidePath, { cache: "no-store" });
    if (!response.ok) throw new Error(`Guide load failed with ${response.status}`);
    const payload = await response.json();
    const cards = Array.isArray(payload) ? payload : payload.cards;
    if (!Array.isArray(cards)) throw new Error("No cards array found");
    return cards.map(normalizeCard);
  } catch (error) {
    console.error(error);
    state.catalogLoadFailed = true;
    showToast("Could not load the card guide.");
    return [];
  }
}

async function loadGuideMemberships() {
  try {
    const guidesPath = document.body.dataset.guidesPath || "guides.json";
    const response = await fetch(guidesPath, { cache: "no-store" });
    if (!response.ok) throw new Error(`Guide definitions failed with ${response.status}`);
    const payload = await response.json();
    const guides = Array.isArray(payload) ? payload : payload.guides;
    if (!Array.isArray(guides)) return new Map();
    const memberships = new Map();
    guides.forEach((guide) => {
      (guide.cards || []).forEach((entry) => {
        const existing = memberships.get(entry.slug) || [];
        existing.push({ slug: guide.slug, title: guide.title });
        memberships.set(entry.slug, existing);
      });
    });
    return memberships;
  } catch (error) {
    console.error(error);
    return new Map();
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
    sleepinessBasis: card.sleepinessBasis || card.curation?.sleepinessBasis || "",
    sleepLocation: card.sleepLocation || card.curation?.sleepLocation || "",
    sleepiness: card.sleepiness || card.curation?.sleepiness || "",
    whyItBelongs: card.whyItBelongs || card.curation?.whyItBelongs || "",
    createdAt: card.createdAt || "",
    updatedAt: card.updatedAt || "",
    slug: card.slug || slugify([card.name, card.setName, card.number].filter(Boolean).join(" ")),
    moods: Array.isArray(card.moods) ? card.moods : (Array.isArray(card.curation?.moods) ? card.curation.moods : deriveMoods(card)),
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
  if (elements.searchFilter) elements.searchFilter.value = state.filters.search;
  if (elements.headerSearchInput) elements.headerSearchInput.value = state.filters.search;
  if (elements.maxPriceFilter) elements.maxPriceFilter.value = state.filters.maxPrice;
  if (elements.sortSelect) elements.sortSelect.value = state.filters.sort;
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
  const filteredCards = getFilteredCards();
  const renderToken = state.renderToken + 1;
  state.renderToken = renderToken;
  const cards = filteredCards;
  const latestCards = getRecentlyAddedCards();
  if (elements.heroCardCount) elements.heroCardCount.textContent = state.cards.length;
  if (elements.resultCount) elements.resultCount.textContent = `${filteredCards.length} ${filteredCards.length === 1 ? "card" : "cards"}`;
  updateCollectionHeading(filteredCards.length);
  updateChecklistButton(filteredCards.length);
  renderActiveFilterControls();
  if (elements.latestGrid) elements.latestGrid.innerHTML = latestCards.map(renderCard).join("");
  if (!elements.cardGrid) return;
  if (state.catalogLoadFailed) {
    elements.emptyState.classList.remove("hidden");
    elements.emptyState.querySelector("h3").textContent = "Collection unavailable";
    elements.emptyState.querySelector("p").textContent = "The sleepy stack is taking a nap. Please try again shortly.";
    if (elements.searchSuggestionPrompt) elements.searchSuggestionPrompt.hidden = true;
    elements.cardGrid.innerHTML = "";
    return;
  }
  elements.emptyState.classList.toggle("hidden", cards.length > 0);
  if (elements.searchSuggestionPrompt) {
    elements.searchSuggestionPrompt.hidden = !state.filters.search.trim();
  }
  elements.cardGrid.innerHTML = "";

  if (!cards.length) return;

  const renderBatch = (startIndex) => {
    if (state.renderToken !== renderToken) return;
    const nextCards = cards.slice(startIndex, startIndex + CARD_RENDER_BATCH_SIZE);
    elements.cardGrid.insertAdjacentHTML("beforeend", nextCards.map(renderCard).join(""));
    const nextIndex = startIndex + CARD_RENDER_BATCH_SIZE;
    if (nextIndex < cards.length) {
      window.requestAnimationFrame(() => renderBatch(nextIndex));
    }
  };

  renderBatch(0);
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
      if (state.filters.mood !== "all") {
        const moodMatches = card.moods.some((mood) => slugify(mood) === state.filters.mood);
        const basisMatches = slugify(card.sleepinessBasis) === state.filters.mood;
        const priceMatches = state.filters.mood === "under-5" && getDisplayPrice(card) > 0 && getDisplayPrice(card) <= 5;
        if (!moodMatches && !basisMatches && !priceMatches) return false;
      }
      if (state.filters.pokemon !== "all" && card.pokemon !== state.filters.pokemon) return false;
      if (state.filters.set !== "all" && card.setName !== state.filters.set) return false;
      if (state.filters.rarity !== "all" && card.rarity !== state.filters.rarity) return false;
      if (state.filters.language !== "all" && card.language !== state.filters.language) return false;
      if (maxPrice !== null && getDisplayPrice(card) > maxPrice) return false;
      return true;
    })
    .sort(compareCards);
}

function hasActiveFilters() {
  return Boolean(
    state.filters.search
    || state.filters.mood !== "all"
    || state.filters.pokemon !== "all"
    || state.filters.set !== "all"
    || state.filters.rarity !== "all"
    || state.filters.language !== "all"
    || state.filters.maxPrice,
  );
}

function countActiveFilters() {
  return [
    Boolean(state.filters.search),
    state.filters.mood !== "all",
    state.filters.pokemon !== "all",
    state.filters.set !== "all",
    state.filters.rarity !== "all",
    state.filters.language !== "all",
    Boolean(state.filters.maxPrice),
  ].filter(Boolean).length;
}

function renderActiveFilterControls() {
  if (elements.activeSearchChip) {
    const query = state.filters.search.trim();
    elements.activeSearchChip.hidden = !query;
    if (query) {
      elements.activeSearchChip.innerHTML = `${escapeHtml(query)} <button type="button" aria-label="Remove search filter">×</button>`;
      elements.activeSearchChip.querySelector("button").addEventListener("click", (event) => {
        event.stopPropagation();
        clearSearchFilter("collection_search_chip");
      }, { once: true });
    }
  }
  if (elements.clearFiltersLink) elements.clearFiltersLink.hidden = countActiveFilters() <= 1;
}

function getRecentlyAddedCards() {
  return [...state.cards]
    .sort((a, b) => compareDates(b.createdAt, a.createdAt) || getCardIdentity(a).localeCompare(getCardIdentity(b)))
    .slice(0, 4);
}

function updateCollectionHeading(resultCount) {
  if (!elements.collectionTitle || !elements.collectionMeta) return;
  const active = hasActiveFilters();
  const search = state.filters.search.trim();
  const moodChip = elements.moodChips.find((chip) => chip.dataset.mood === state.filters.mood);
  const mood = moodChip?.textContent.trim();
  if (state.catalogLoadFailed) {
    elements.collectionTitle.textContent = "All sleepy Pokemon";
    return;
  }
  if (!active) {
    elements.collectionTitle.textContent = "All sleepy Pokemon";
    elements.collectionMeta.textContent = `${state.cards.length} cards · zero alarm clocks`;
  } else if (search) {
    elements.collectionTitle.textContent = `Matching “${search}”`;
    elements.collectionMeta.textContent = `${resultCount} ${resultCount === 1 ? "card" : "cards"}`;
  } else if (mood) {
    elements.collectionTitle.textContent = mood;
    elements.collectionMeta.textContent = `${resultCount} ${resultCount === 1 ? "card" : "cards"}`;
  } else {
    elements.collectionTitle.textContent = "Filtered sleepy Pokemon";
    elements.collectionMeta.textContent = `${resultCount} ${resultCount === 1 ? "card" : "cards"}`;
  }
  if (elements.clearCollectionButton) elements.clearCollectionButton.hidden = !active;
}

function updateChecklistButton(resultCount) {
  if (!elements.downloadChecklistButton) return;
  if (state.catalogLoadFailed) {
    elements.downloadChecklistButton.disabled = true;
    elements.downloadChecklistButton.textContent = "Download checklist";
    return;
  }
  const isFiltered = hasActiveFilters();
  if (resultCount === 0) {
    elements.downloadChecklistButton.disabled = true;
    elements.downloadChecklistButton.textContent = "Download checklist (0)";
    elements.downloadChecklistButton.setAttribute("aria-label", "No cards match active filters to download");
  } else if (isFiltered) {
    elements.downloadChecklistButton.disabled = false;
    elements.downloadChecklistButton.textContent = `Download checklist (${resultCount})`;
    elements.downloadChecklistButton.setAttribute(
      "aria-label",
      `Download checklist for ${resultCount} filtered ${resultCount === 1 ? "card" : "cards"}`
    );
  } else {
    elements.downloadChecklistButton.disabled = false;
    elements.downloadChecklistButton.textContent = `Download checklist (${state.cards.length})`;
    elements.downloadChecklistButton.setAttribute(
      "aria-label",
      `Download checklist for all ${state.cards.length} cards`
    );
  }
}

function assignRandomOrder() {
  const shuffledIds = state.cards
    .map(getCardIdentity)
    .sort(() => Math.random() - 0.5);
  state.randomOrder = new Map(shuffledIds.map((id, index) => [id, index]));
}

function getRandomRank(card) {
  return state.randomOrder.get(getCardIdentity(card)) ?? Number.MAX_SAFE_INTEGER;
}

function compareCards(a, b) {
  if (state.filters.sort === "random") {
    return getRandomRank(a) - getRandomRank(b);
  }
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
  return `
    <article class="card-tile" data-card-id="${escapeAttribute(getCardIdentity(card))}" tabindex="0" role="button" aria-label="Open ${escapeAttribute(card.name)} preview">
      <div class="card-image-frame">
        ${card.imageSmall || card.imageLarge
          ? `<img src="${escapeAttribute(card.imageSmall || card.imageLarge)}" alt="${escapeAttribute(`${card.name} card`)}" loading="lazy" decoding="async" />`
          : `<div class="image-fallback">${escapeHtml(card.name)}</div>`}
      </div>
      <div class="card-body">
        <div class="card-title-row"><h3>${escapeHtml(card.name)}</h3></div>
        <p class="card-subtitle">${escapeHtml(card.setName)} · ${escapeHtml(card.number)} · ${escapeHtml(card.rarity)}</p>
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
  if (card) openCardDetail(card, getCardDiscoverySource(tile));
}

function handleCardGridClick(event) {
  const tile = event.target.closest(".card-tile[data-card-id]");
  if (!tile) return;
  const card = state.cards.find((item) => getCardIdentity(item) === tile.dataset.cardId);
  if (card) openCardDetail(card, getCardDiscoverySource(tile));
}

function handleGuideCardClick(event) {
  const link = event.target.closest(".guide-card a[data-card-id]");
  if (!link) return;
  const card = state.cards.find((item) => getCardIdentity(item) === link.dataset.cardId);
  if (!card) return;
  event.preventDefault();
  openCardDetail(card, "guide_page");
}

function getCardDiscoverySource(tile) {
  return elements.latestGrid?.contains(tile) ? "freshly_tucked_in" : "collection_grid";
}

function openCardDetail(card, interactionSource = "unknown") {
  const price = getDisplayPrice(card);
  const priceText = price ? formatCurrency(price) : "No price";
  const image = card.imageLarge || card.imageSmall;
  elements.detailEyebrow.textContent = "Caught napping";
  elements.detailTitle.textContent = card.name;
  elements.detailSubtitle.textContent = [card.setName, card.number, card.rarity].filter(Boolean).join(" · ");
  elements.detailImageFrame.innerHTML = image
    ? `<img src="${escapeAttribute(image)}" alt="${escapeAttribute(`${card.name} card`)}" />`
    : `<div class="image-fallback">${escapeHtml(card.name)}</div>`;
  elements.detailPriceRow.innerHTML = price
    ? `<strong>${escapeHtml(priceText)}</strong><span>market · ${escapeHtml(card.priceSource || "TCGPlayer")}${card.priceUpdatedAt ? ` · as of ${escapeHtml(formatShortDate(card.priceUpdatedAt))}` : ""}</span>`
    : `<span class="detail-no-price">No current market price</span>`;
  const whyItBelongs = card.whyItBelongs || card.notes;
  elements.detailCurationNote.innerHTML = whyItBelongs
    ? `<strong>Why it belongs.</strong> ${escapeHtml(whyItBelongs)}`
    : `<strong>Why it belongs.</strong> <span class="detail-pending">A curator's note is coming soon.</span>`;
  if (elements.detailGuideLinks) {
    elements.detailGuideLinks.innerHTML = renderGuideMemberships(card);
  }
  elements.detailCurationFacts.innerHTML = [
    curationFact("Nap classification", card.sleepinessBasis),
    curationFact("Sleep location", card.sleepLocation),
    curationSleepinessFact(card.sleepiness),
  ].filter(Boolean).join("");
  elements.detailMoods.innerHTML = card.moods?.length
    ? card.moods.map((mood) => `<span class="mood-tag">${escapeHtml(formatMoodLabel(mood))}</span>`).join("")
    : "";
  elements.detailMetaGrid.innerHTML = [
    metaItem("Set", card.setName),
    metaItem("Number", card.number),
    metaItem("Rarity", card.rarity),
    metaItem("Artist", card.artist || "Unknown"),
    metaItem("Release", formatDate(card.setReleaseDate) || "Unknown"),
  ].join("");
  elements.cardDetailDialog.showModal();
  trackEvent("card_opened", {
    ...getCardAnalyticsParams(card),
    interaction_source: interactionSource,
  });
}

function renderGuideMemberships(card) {
  const guides = state.guideMemberships.get(card.slug) || [];
  if (!guides.length) return "";
  const root = document.body.dataset.siteRoot || "";
  const links = guides.map((guide) => {
    const href = `${root}guides/${guide.slug}/`;
    return `<a href="${escapeAttribute(href)}" data-analytics-event="guide_opened" data-analytics-source="card_modal" data-analytics-guide-slug="${escapeAttribute(guide.slug)}" data-analytics-guide-title="${escapeAttribute(guide.title)}">${escapeHtml(guide.title)}</a>`;
  });
  const linkedTitles = links.length === 1
    ? links[0]
    : `${links.slice(0, -1).join(", ")}${links.length > 2 ? "," : ""} and ${links.at(-1)}`;
  return `<p class="detail-guide-kicker">In the field notes</p><p>This card can be found in ${linkedTitles}.</p>`;
}

function curationSleepinessFact(value) {
  if (!value) return "";
  const match = String(value).match(/^(\d+)/);
  const level = match ? Math.max(0, Math.min(5, Number(match[1]))) : 0;
  const label = String(value).replace(/^\d+\s*[—-]?\s*/, "");
  const zzz = Array.from({ length: 5 }, (_, index) => `<span class="sleepiness-zzz${index < level ? " is-filled" : ""}">Z</span>`).join("");
  return `<div class="curation-fact curation-fact--sleepiness"><span>Sleepiness</span><strong><span class="sleepiness-meter" aria-label="${escapeAttribute(value)}">${zzz}</span><span class="sleepiness-label">${escapeHtml(label || value)}</span></strong></div>`;
}

function closeCardDetail() {
  elements.cardDetailDialog?.close();
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

function curationFact(label, value) {
  if (!value) return "";
  return `<div class="curation-fact"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function formatMoodLabel(value) {
  return String(value || "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatShortDate(value) {
  const match = String(value || "").match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90)
    .replace(/-+$/g, "");
}

function downloadChecklist() {
  const isFiltered = hasActiveFilters();
  const exportCards = isFiltered ? getFilteredCards() : state.cards;
  if (!exportCards.length) {
    showToast("No cards to download.");
    return;
  }

  const columns = [
    "Collected",
    "Pokemon Card Name",
    "Set",
    "Number",
    "Rarity",
    "Language",
    "Artist",
    "Price",
    "Why it belongs",
    "Image url",
  ];
  const rows = exportCards.map((card) => [
    "",
    card.name || card.pokemon || "",
    card.setName || "",
    card.number || "",
    card.rarity || "",
    card.language || "",
    card.artist || "",
    getDisplayPrice(card) ? formatCurrency(getDisplayPrice(card)) : "",
    card.whyItBelongs || card.notes || "",
    card.imageLarge || card.imageSmall || "",
  ]);
  const csv = [columns, ...rows]
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\n");
  const blob = new Blob([`\uFEFF${csv}\n`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = getChecklistFilename();
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  trackEvent("checklist_downloaded", {
    checklist_scope: isFiltered ? "filtered_collection" : "full_collection",
    card_count: exportCards.length,
    file_format: "csv",
    interaction_source: "collection_header",
  });
  showToast(
    isFiltered
      ? `Filtered checklist downloaded (${exportCards.length} cards).`
      : `Checklist downloaded (${exportCards.length} cards).`
  );
}

function getChecklistFilename() {
  const isFiltered = hasActiveFilters();
  if (!isFiltered) return "sleepy-pokemon-checklist.csv";

  const search = state.filters.search.trim();
  if (search) {
    const searchSlug = slugify(search);
    if (searchSlug) {
      return `sleepy-pokemon-${searchSlug}-checklist.csv`;
    }
  }
  if (state.filters.mood !== "all") {
    const moodSlug = slugify(state.filters.mood);
    if (moodSlug) {
      return `sleepy-pokemon-${moodSlug}-checklist.csv`;
    }
  }
  if (state.filters.pokemon !== "all") {
    const pokemonSlug = slugify(state.filters.pokemon);
    if (pokemonSlug) {
      return `sleepy-pokemon-${pokemonSlug}-checklist.csv`;
    }
  }
  if (state.filters.set !== "all") {
    const setSlug = slugify(state.filters.set);
    if (setSlug) {
      return `sleepy-pokemon-${setSlug}-checklist.csv`;
    }
  }
  return "sleepy-pokemon-filtered-checklist.csv";
}

function escapeCsvCell(value) {
  const cell = String(value ?? "");
  if (!/[",\n\r]/.test(cell)) return cell;
  return `"${cell.replace(/"/g, '""')}"`;
}

function clearFilters() {
  const activeFilterCount = countActiveFilters();
  state.filters = {
    search: "",
    mood: "all",
    pokemon: "all",
    set: "all",
    rarity: "all",
    language: "all",
    maxPrice: "",
    sort: PUBLIC_DEFAULT_SORT,
  };
  state.showAllCards = false;
  elements.moodChips.forEach((chip) => chip.classList.remove("is-active"));
  syncSearchUrl("");
  render();
  trackEvent("filters_cleared", {
    active_filter_count: activeFilterCount,
    result_count: state.cards.length,
  });
}

function syncSearchUrl(query) {
  const url = new URL(window.location.href);
  if (query) url.searchParams.set("q", query);
  else url.searchParams.delete("q");
  url.hash = "";
  window.history.replaceState(null, "", url);
}

function getCardAnalyticsParams(card) {
  return {
    card_name: card.name,
    card_pokemon: card.pokemon,
    card_set: card.setName,
    card_number: card.number,
    card_rarity: card.rarity,
    card_language: card.language,
    price_market: getDisplayPrice(card) || undefined,
  };
}

function getCatalogSurface() {
  if (elements.cardGrid) return "collection";
  if (elements.latestGrid) return "homepage_latest";
  return "";
}

function getAnalyticsFilterValue(key, value) {
  if (key === "maxPrice") return numericOrNull(value) ?? "none";
  return value || "all";
}

function trackEvent(eventName, params = {}) {
  if (!window.sleepyAnalytics) return;
  window.sleepyAnalytics.track(eventName, params);
}

function uniqueValues(key) {
  return [...new Set(state.cards.map((card) => card[key]).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function deriveMoods(card) {
  const text = [card.name, card.pokemon, card.setName, card.notes].join(" ").toLowerCase();
  const moods = [];
  const price = getDisplayPrice(card);
  const tinySnoozers = new Set([
    "abra", "dedenne", "eevee", "exeggcute", "joltik", "meowth", "pawmi", "pikachu", "skitty", "togepi", "togedemaru",
  ]);

  if (price > 0 && price <= 5) moods.push("under-5");
  if (/(group|together|family|friends|pile|team|siblings)/.test(text)) moods.push("group-naps");
  if (/(grass|forest|garden|field|outdoor|water|beach|sky|meadow|lake)/.test(text)) moods.push("outdoor-sleepers");
  if (tinySnoozers.has(card.pokemon.toLowerCase())) moods.push("tiny-snoozers");
  return moods;
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
  const match = String(value).match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(value);
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
