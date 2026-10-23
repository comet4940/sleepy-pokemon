const DEFAULT_LANGUAGE = "English";
const PUBLIC_DEFAULT_SORT = "random";
// Rarity filter buckets: each card keeps its exact rarity, the drawer groups related ones.
const RARITY_GROUPS = [
  { id: "common", label: "Common", rarities: ["Common"] },
  { id: "uncommon", label: "Uncommon", rarities: ["Uncommon"] },
  { id: "rare-holo", label: "Rare & Holo", rarities: ["Rare", "Rare Holo"] },
  { id: "illustration-rare", label: "Illustration Rare", rarities: ["Illustration Rare", "Special Illustration Rare", "Art Rare"] },
  { id: "ultra-secret", label: "Ultra & Secret", rarities: ["Ultra Rare", "Secret Rare", "Rare Rainbow", "Triple Rare", "Rare Holo VMAX", "Pikachu Rare"] },
  { id: "trainer-gallery", label: "Trainer Gallery", rarities: ["Trainer Gallery Rare Holo"] },
  { id: "promo", label: "Promo", rarities: ["Promo"] },
];
const PRICE_OPTIONS = [
  { value: "5", label: "Under $5" },
  { value: "10", label: "Under $10" },
  { value: "25", label: "Under $25" },
  { value: "50", label: "Under $50" },
];
// Long option lists start short on phones and desktop alike; "Show all" expands them.
const DRAWER_PREVIEW_LIMITS = { mood: 8, set: 12 };
const SORT_OPTIONS = [
  { value: "random", label: "Shuffle" },
  { value: "newest", label: "Newest sets" },
  { value: "price-low", label: "Price: low to high" },
  { value: "price-high", label: "Price: high to low" },
  { value: "set", label: "Set A–Z" },
  { value: "pokemon", label: "Pokémon A–Z" },
];
const CARD_RENDER_BATCH_SIZE = 24;
const TCGDEX_API = "https://api.tcgdex.net/v2/en/cards";


const CHECKLIST_LABELS = {
  full_collection: "Full collection",
  search_results: "Search results",
  filtered_collection: "Filtered",
  guide: "Guide",
};

const state = {
  cards: [],
  guideMemberships: new Map(),
  guideSelection: null,
  randomOrder: new Map(),
  filters: {
    search: "",
    mood: "all",
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
  modalFilterChanges: 0,
  drawerCloseMethod: "escape",
  expandedDrawerSections: new Set(),
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
  state.guideSelection = isGuidePage() ? getGuideCardSelection() : null;
  // A mood link from a card pill may name a mood no card carries any more.
  if (state.filters.mood !== "all" && !getMoodLabel(state.filters.mood)) state.filters.mood = "all";
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
  elements.activeAdvancedFilters = document.querySelector("#activeAdvancedFilters");
  elements.clearFiltersLink = document.querySelector("#clearFiltersLink");
  elements.heroCardCount = document.querySelector("#heroCardCount");
  elements.emptyState = document.querySelector("#emptyState");
  elements.searchSuggestionPrompt = document.querySelector("#searchSuggestionPrompt");
  elements.searchSuggestionLink = document.querySelector("#searchSuggestionLink");
  elements.suggestionLinks = [...document.querySelectorAll("[data-suggestion-source]")];
  elements.openFiltersButton = document.querySelector("#openFiltersButton");
  elements.moodChipsTrack = document.querySelector("#moodChips");
  elements.moodChips = [...document.querySelectorAll(".mood-chip[data-mood]")];
  elements.priceChip = document.querySelector(".mood-chip[data-max-price]");
  elements.surpriseButton = document.querySelector("#surpriseButton");
  elements.browseCollectionButton = document.querySelector("#browseCollectionButton");
  elements.viewAllLink = document.querySelector(".view-all-link");
  elements.downloadChecklistButton = document.querySelector("#downloadChecklistButton");
  if (elements.downloadChecklistButton && !state.cards.length) {
    elements.downloadChecklistButton.disabled = true;
  }
  elements.filtersDialog = document.querySelector("#filtersDialog");
  elements.searchFilter = document.querySelector("#searchFilter");
  elements.headerSearchForm = document.querySelector("[data-header-search]");
  elements.headerSearchInput = document.querySelector("[data-header-search-input]");
  elements.filterDrawerBody = document.querySelector("#filterDrawerBody");
  elements.filterDrawerTitle = document.querySelector("#filterDrawerTitle");
  elements.closeFiltersButton = document.querySelector("#closeFiltersButton");
  elements.drawerSetSearch = document.querySelector("#drawerSetSearch");
  elements.drawerShowButton = document.querySelector("#drawerShowButton");
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
  elements.aboutMain = document.querySelector(".about-main");
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
      // render() also refreshes the All filters count and the drawer, not just the cards.
      render();
      trackFilterChange("mood", "mood_chip");
    });
  });

  // The "under $5" chip is a shortcut for the drawer's Price filter, so both stay in sync.
  bind(elements.priceChip, "click", () => {
    const value = elements.priceChip.dataset.maxPrice;
    state.filters.maxPrice = state.filters.maxPrice === value ? "" : value;
    state.showAllCards = true;
    render();
    trackFilterChange("maxPrice", "price_chip");
  });

  bind(elements.filterDrawerBody, "click", handleFilterOptionClick);
  bind(elements.drawerSetSearch, "input", () => renderDrawerOptions("set"));
  bind(elements.closeFiltersButton, "click", () => closeFiltersDialog("close_button"));
  bind(elements.drawerShowButton, "click", () => {
    if (getFilteredCards().length) closeFiltersDialog("show_results");
    else clearFilters("filter_drawer_no_matches");
  });
  bind(elements.filtersDialog, "click", (event) => {
    if (event.target === elements.filtersDialog) closeFiltersDialog("backdrop");
  });

  bind(elements.clearFiltersButton, "click", () => clearFilters("filter_drawer_reset"));
  bind(elements.clearFiltersLink, "click", () => clearFilters("collection_clear_all"));
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
  // The header Suggest pill links to collection/?suggest=header; where the form is on the page, open it in place instead.
  document.addEventListener("click", (event) => {
    const link = event.target.closest("[data-header-suggest]");
    if (!link || !elements.suggestionDialog) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    openSuggestionDialog();
    trackEvent("suggestion_opened", { interaction_source: "global_header" });
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
  bind(elements.filtersDialog, "close", () => {
    elements.moodChipsTrack?.scrollTo({ left: 0, behavior: "smooth" });
    if (state.modalFilterChanges === 0) {
      trackEvent("filters_modal_bounced", {
        close_method: state.drawerCloseMethod,
        had_active_filters: hasActiveFilters(),
        active_filter_count: countActiveFilters(),
      });
    } else {
      trackEvent("filters_modal_applied", {
        close_method: state.drawerCloseMethod,
        changes_count: state.modalFilterChanges,
        active_filter_count: countActiveFilters(),
        result_count: getFilteredCards().length,
      });
    }
  });
  bind(elements.surpriseButton, "click", showRandomSleeper);
  bind(elements.clearCollectionButton, "click", () => clearFilters("collection_empty_state"));
  bind(elements.cardGrid, "click", handleCardGridClick);
  bind(elements.cardGrid, "keydown", handleCardGridKeydown);
  bind(elements.latestGrid, "click", handleCardGridClick);
  bind(elements.latestGrid, "keydown", handleCardGridKeydown);
  bind(elements.guideCardList, "click", handleGuideCardClick);
  bind(elements.aboutMain, "click", handleGuideCardClick);
  bind(elements.closeCardDetailButton, "click", closeCardDetail);
  bind(elements.cardDetailDialog, "click", (event) => {
    if (event.target === elements.cardDetailDialog) closeCardDetail();
  });
}

function applyInitialSearch() {
  const params = new URLSearchParams(window.location.search);
  const suggest = params.get("suggest");
  if (suggest && elements.suggestionDialog) {
    openSuggestionDialog();
    // Each form open is tracked once, here: ?suggest=header comes from the header pill, anything else is a shared or bookmarked link.
    trackEvent("suggestion_opened", { interaction_source: suggest === "header" ? "global_header" : "suggest_link" });
    const url = new URL(window.location.href);
    url.searchParams.delete("suggest");
    window.history.replaceState(window.history.state, "", url);
  }
  const mood = slugify(params.get("mood"));
  // Old links used ?mood=under-5 for what is now the Price filter.
  if (mood === "under-5" && elements.cardGrid) {
    state.filters.maxPrice = "5";
    state.showAllCards = true;
  } else if (mood && elements.cardGrid) {
    state.filters.mood = mood;
    state.showAllCards = true;
    elements.moodChips.forEach((chip) => chip.classList.toggle("is-active", chip.dataset.mood === mood));
  }
  const query = params.get("q")?.trim() || "";
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
  state.modalFilterChanges = 0;
  // Escape closes the dialog natively; every other way out names itself in closeFiltersDialog().
  state.drawerCloseMethod = "escape";
  // Chips, search and active-filter pills change filters while the drawer is closed, so redraw it from current state.
  renderFilters();
  elements.filtersDialog.showModal();
  trackEvent("filters_opened", { active_filter_count: countActiveFilters() });
  elements.filterDrawerTitle?.focus();
}

function closeFiltersDialog(closeMethod) {
  state.drawerCloseMethod = closeMethod;
  elements.filtersDialog.close();
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
const suggestionCardDetailsCache = new Map();

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
    renderSuggestionResults(cards, requestId);
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

function renderSuggestionResults(cards, requestId) {
  elements.suggestionResults.innerHTML = cards.map((card, index) => `<button type="button" class="suggestion-result" data-suggestion-card-index="${index}"><strong>${escapeHtml(card.name)}</strong><span data-suggestion-card-meta>${escapeHtml(formatSuggestionCardLabel(card))}</span></button>`).join("");
  elements.suggestionResults.querySelectorAll("[data-suggestion-card-index]").forEach((button, index) => button.addEventListener("click", () => selectSuggestionCard(cards[index])));

  Promise.all(cards.map(fetchSuggestionCardDetails)).then((detailedCards) => {
    if (requestId !== suggestionLookupRequestId) return;
    const buttons = elements.suggestionResults.querySelectorAll("[data-suggestion-card-index]");
    detailedCards.forEach((card, index) => {
      cards[index] = card;
      const label = buttons[index]?.querySelector("[data-suggestion-card-meta]");
      if (label) label.textContent = formatSuggestionCardLabel(card);
    });
  });
}

function fetchSuggestionCardDetails(card) {
  if (!card.id || card.set) return Promise.resolve(card);
  if (!suggestionCardDetailsCache.has(card.id)) {
    const request = fetch(`${TCGDEX_API}/${encodeURIComponent(card.id)}`, { mode: "cors" })
      .then((response) => {
        if (!response.ok) throw new Error("Card details unavailable");
        return response.json();
      })
      .then((details) => {
        if (details?.set) return details;
        suggestionCardDetailsCache.delete(card.id);
        return card;
      })
      .catch(() => {
        suggestionCardDetailsCache.delete(card.id);
        return card;
      });
    suggestionCardDetailsCache.set(card.id, request);
  }
  return suggestionCardDetailsCache.get(card.id);
}

function formatSuggestionCardLabel(card) {
  return `${getSuggestionSetName(card)} · ${formatSuggestionCollectorNumber(card)}`;
}

function getSuggestionSetName(card) {
  const localId = String(card.localId || card.number || "").trim();
  const fallbackSetId = card.id && localId && card.id.endsWith(`-${localId}`)
    ? card.id.slice(0, -(localId.length + 1))
    : card.id;
  return card.setName || card.set?.name || fallbackSetId || "Set unavailable";
}

function formatSuggestionCollectorNumber(card) {
  const localId = String(card.localId || card.number || "").trim();
  if (!localId) return "number unavailable";
  if (localId.includes("/")) return localId;
  const officialCount = Number(card.set?.cardCount?.official);
  if (!/^\d+$/.test(localId) || officialCount <= 0) return localId;
  const total = String(officialCount).padStart(localId.length, "0");
  return `${localId}/${total}`;
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
  const selectedCard = await fetchSuggestionCardDetails(card);
  if (selectionRequestId !== suggestionSelectionRequestId) return;
  const setName = getSuggestionSetName(selectedCard);
  const number = formatSuggestionCollectorNumber(selectedCard);
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
    catalogIdentity: getCardIdentity(card),
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
    notes: card.notes || "",
    whyItBelongs: card.whyItBelongs || card.curation?.whyItBelongs || "",
    createdAt: card.createdAt || "",
    updatedAt: card.updatedAt || "",
    slug: card.slug || slugify([card.name, card.setName, card.number].filter(Boolean).join(" ")),
    moods: Array.isArray(card.moods) ? card.moods : (Array.isArray(card.curation?.moods) ? card.curation.moods : []),
  };
}

function render() {
  renderFilters();
  renderCards();
}

function renderFilters() {
  if (elements.searchFilter) elements.searchFilter.value = state.filters.search;
  if (elements.headerSearchInput) elements.headerSearchInput.value = state.filters.search;
  elements.moodChips.forEach((chip) => chip.classList.toggle("is-active", chip.dataset.mood === state.filters.mood));
  elements.priceChip?.classList.toggle("is-active", elements.priceChip.dataset.maxPrice === state.filters.maxPrice);
  // Counts every filter the drawer can set, moods included (the chip row's moods are drawer filters too).
  const drawerFilterCount = ["mood", "set", "rarity", "language"].filter((key) => state.filters[key] !== "all").length + (state.filters.maxPrice ? 1 : 0);
  if (elements.openFiltersButton) elements.openFiltersButton.textContent = drawerFilterCount ? `All filters · ${drawerFilterCount}` : "All filters";
  ["mood", "rarity", "set", "language", "maxPrice", "sort"].forEach(renderDrawerOptions);
  renderDrawerShowButton();
}

// Filter drawer: each option is a pill showing how many cards it would return with the other filters kept.
function renderDrawerOptions(key) {
  const container = elements.filterDrawerBody?.querySelector(`[data-filter-options="${key}"]`);
  if (!container || !state.cards.length) return;
  const selected = state.filters[key];
  let options = getDrawerOptions(key).map((option) => ({
    ...option,
    count: key === "sort" ? null : filterCards({ ...state.filters, [key]: option.value }).length,
  }));
  const limit = DRAWER_PREVIEW_LIMITS[key];
  if (limit) {
    // Long lists put options that still have matches first; sets with no matches are hidden.
    const available = options.filter((option) => option.count > 0 || option.value === selected);
    options = key === "set" ? available : [...available, ...options.filter((option) => !available.includes(option))];
  }
  const searching = key === "set" && Boolean(elements.drawerSetSearch?.value.trim());
  const collapsible = Boolean(limit) && options.length > limit && !searching;
  const expanded = state.expandedDrawerSections.has(key);
  let visible = collapsible && !expanded ? options.slice(0, limit) : options;
  const selectedOption = options.find((option) => option.value === selected);
  if (selectedOption && !visible.includes(selectedOption)) visible = [selectedOption, ...visible];
  const noun = key === "mood" ? "moods" : "sets";
  const toggle = collapsible
    ? `<button class="drawer-more" type="button" data-expand-section="${key}">${expanded ? "Show fewer" : `Show all ${options.length} ${noun}`}</button>`
    : "";
  container.innerHTML = visible.length
    ? visible.map((option) => {
      const isSelected = option.value === selected;
      const { count } = option;
      const disabled = count === 0 && !isSelected ? " disabled" : "";
      return `<button class="drawer-option" type="button" data-filter-key="${key}" data-filter-value="${escapeAttribute(option.value)}" aria-pressed="${isSelected}"${disabled}>${escapeHtml(option.label)}${count === null ? "" : ` <small>${count}</small>`}</button>`;
    }).join("") + toggle
    : `<p class="drawer-empty">No sets match${searching ? "" : " these filters"}.</p>`;
}

function getDrawerOptions(key) {
  if (key === "sort") return SORT_OPTIONS;
  if (key === "maxPrice") return PRICE_OPTIONS;
  if (key === "rarity") {
    const groups = new Map();
    state.cards.forEach((card) => {
      const group = getRarityGroup(card.rarity);
      groups.set(group.id, group);
    });
    return [...RARITY_GROUPS.filter((group) => groups.has(group.id)), ...[...groups.values()].filter((group) => !RARITY_GROUPS.includes(group))]
      .map((group) => ({ value: group.id, label: group.label }));
  }
  if (key === "mood") return countBy(state.cards.flatMap((card) => card.moods)).map(([mood]) => ({ value: slugify(mood), label: mood }));
  if (key === "language") return countBy(state.cards.map((card) => card.language)).map(([language]) => ({ value: language, label: language }));
  if (key === "set") {
    // Newest sets first; the search box narrows the list but always keeps the selected set.
    const query = elements.drawerSetSearch?.value.trim().toLowerCase() || "";
    const newest = new Map();
    state.cards.forEach((card) => {
      if (!newest.has(card.setName) || compareDates(card.setReleaseDate, newest.get(card.setName)) > 0) newest.set(card.setName, card.setReleaseDate);
    });
    return [...newest.keys()]
      .filter((setName) => !query || setName.toLowerCase().includes(query) || setName === state.filters.set)
      .sort((a, b) => compareDates(newest.get(b), newest.get(a)) || a.localeCompare(b))
      .map((setName) => ({ value: setName, label: setName }));
  }
  return [];
}

function countBy(values) {
  const counts = new Map();
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function getRarityGroup(rarity) {
  return RARITY_GROUPS.find((group) => group.rarities.includes(rarity))
    || { id: slugify(rarity || "unknown"), label: rarity || "Unknown", rarities: [rarity] };
}

function renderDrawerShowButton() {
  if (!elements.drawerShowButton) return;
  const count = getFilteredCards().length;
  elements.drawerShowButton.textContent = count ? `Show ${count} ${count === 1 ? "sleeper" : "sleepers"} →` : "No matches · Reset filters";
  elements.drawerShowButton.classList.toggle("is-empty", !count);
}

function handleFilterOptionClick(event) {
  const expand = event.target.closest("[data-expand-section]");
  if (expand) {
    const key = expand.dataset.expandSection;
    if (state.expandedDrawerSections.has(key)) state.expandedDrawerSections.delete(key);
    else state.expandedDrawerSections.add(key);
    renderDrawerOptions(key);
    restoreDrawerFocus(`[data-expand-section="${key}"]`);
    return;
  }
  const option = event.target.closest("[data-filter-key]");
  if (!option || option.disabled) return;
  const key = option.dataset.filterKey;
  const value = option.dataset.filterValue;
  // Re-tapping the current sort changes nothing, so it is not tracked or counted as a drawer change.
  if (key === "sort" && state.filters.sort === value) return;
  // Tapping the selected option clears it; sort always keeps one choice.
  const cleared = key === "maxPrice" ? "" : "all";
  setFilterValue(key, key !== "sort" && state.filters[key] === value ? cleared : value);
  // Re-rendering replaces the pills, so put keyboard focus back on the one just used.
  restoreDrawerFocus(`[data-filter-key="${key}"][data-filter-value="${CSS.escape(value)}"]`, key);
}

function restoreDrawerFocus(selector, fallbackKey) {
  const target = elements.filterDrawerBody?.querySelector(selector);
  const fallback = fallbackKey && elements.filterDrawerBody?.querySelector(`[data-filter-key="${fallbackKey}"]:not(:disabled)`);
  (target && !target.disabled ? target : fallback)?.focus({ preventScroll: true });
}

function setFilterValue(key, value) {
  state.filters[key] = value;
  state.showAllCards = true;
  // Sorting counts as using the drawer, so a sort-only visit is "applied", not "bounced".
  state.modalFilterChanges += 1;
  render();
  trackFilterChange(key, "filter_drawer");
}

// One place for filter and sort analytics; interaction_source says where the change was made.
function trackFilterChange(key, interactionSource) {
  const value = state.filters[key];
  const params = {
    filter_value: getAnalyticsFilterValue(key, value),
    filter_action: value === "all" || value === "" ? "removed" : "applied",
    result_count: getFilteredCards().length,
    interaction_source: interactionSource,
  };
  trackEvent(key === "sort" ? "sort_changed" : "filter_changed", { filter_name: key, ...params });
  if (key !== "sort") trackEvent(`filter_facet_${key}`, params);
}

function renderCards() {
  syncMoodParam();
  const filteredCards = getFilteredCards();
  const renderToken = state.renderToken + 1;
  state.renderToken = renderToken;
  const cards = filteredCards;
  const latestCards = getRecentlyAddedCards();
  if (elements.heroCardCount) elements.heroCardCount.textContent = state.cards.length;
  if (elements.resultCount) elements.resultCount.textContent = `${filteredCards.length} ${filteredCards.length === 1 ? "card" : "cards"}`;
  updateCollectionHeading(filteredCards.length);
  updateChecklistButton(filteredCards);
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
  return filterCards(state.filters).sort(compareCards);
}

function filterCards(filters) {
  const search = filters.search.toLowerCase();
  const maxPrice = numericOrNull(filters.maxPrice);

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
      if (filters.mood !== "all") {
        if (!card.moods.some((mood) => slugify(mood) === filters.mood)) return false;
      }
      if (filters.set !== "all" && card.setName !== filters.set) return false;
      if (filters.rarity !== "all" && getRarityGroup(card.rarity).id !== filters.rarity) return false;
      if (filters.language !== "all" && card.language !== filters.language) return false;
      if (maxPrice !== null && !(getDisplayPrice(card) > 0 && getDisplayPrice(card) <= maxPrice)) return false;
      return true;
    });
}

function hasActiveFilters() {
  return Boolean(
    state.filters.search
    || state.filters.mood !== "all"
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
        trackEvent("filter_chip_removed", {
          filter_name: "search",
          result_count: getFilteredCards().length,
        });
      }, { once: true });
    }
  }
  if (elements.activeAdvancedFilters) {
    const advancedFilters = ["set", "rarity", "language"].filter((key) => state.filters[key] !== "all");
    // The "under $5" chip already shows that price, so only other prices get a removable chip.
    if (state.filters.maxPrice && state.filters.maxPrice !== elements.priceChip?.dataset.maxPrice) advancedFilters.push("maxPrice");
    // A mood opened from a card pill may have no mood chip of its own, so show it as a removable chip.
    const moodHasChip = elements.moodChips.some((chip) => chip.dataset.mood === state.filters.mood);
    if (state.filters.mood !== "all" && !moodHasChip) advancedFilters.unshift("mood");
    elements.activeAdvancedFilters.replaceChildren(...advancedFilters.map((key) => {
      const chip = document.createElement("span");
      chip.className = "active-filter-chip";
      const label = getFilterLabel(key, state.filters[key]);
      chip.append(document.createTextNode(label));
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.setAttribute("aria-label", `Remove ${label || "filter"} filter`);
      removeButton.textContent = "×";
      removeButton.addEventListener("click", (event) => {
        event.stopPropagation();
        state.filters[key] = key === "maxPrice" ? "" : "all";
        state.showAllCards = true;
        render();
        trackFilterChange(key, "active_filter_chip");
        trackEvent("filter_chip_removed", {
          filter_name: key,
          result_count: getFilteredCards().length,
        });
      });
      chip.append(removeButton);
      return chip;
    }));
  }
  if (elements.clearFiltersLink) elements.clearFiltersLink.hidden = countActiveFilters() === 0;
}

function getFilterLabel(key, value) {
  if (key === "mood") return getMoodLabel(value) || value;
  if (key === "rarity") return RARITY_GROUPS.find((group) => group.id === value)?.label || getRarityGroup(value).label;
  if (key === "maxPrice") return `under $${value}`;
  return value;
}

function getRecentlyAddedCards() {
  const sortedCards = [...state.cards]
    .sort((a, b) => compareDates(b.createdAt, a.createdAt) || getCardIdentity(a).localeCompare(getCardIdentity(b)));
  const uniquePokemon = [];
  const repeats = [];
  const seenPokemon = new Set();

  sortedCards.forEach((card) => {
    const pokemon = String(card.pokemon || card.name || "").trim().toLowerCase();
    if (!pokemon || !seenPokemon.has(pokemon)) {
      uniquePokemon.push(card);
      if (pokemon) seenPokemon.add(pokemon);
    } else {
      repeats.push(card);
    }
  });

  return [...uniquePokemon, ...repeats].slice(0, 4);
}

function updateCollectionHeading(resultCount) {
  if (!elements.collectionTitle || !elements.collectionMeta) return;
  const active = hasActiveFilters();
  const search = state.filters.search.trim();
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
  } else {
    // Name what is filtered: up to two filter names, then "+N".
    const labels = ["mood", "rarity", "set", "language", "maxPrice"]
      .filter((key) => (key === "maxPrice" ? Boolean(state.filters.maxPrice) : state.filters[key] !== "all"))
      .map((key) => getFilterLabel(key, state.filters[key]))
      .map((label) => label.charAt(0).toUpperCase() + label.slice(1));
    elements.collectionTitle.textContent = labels.slice(0, 2).join(" · ") + (labels.length > 2 ? `\u00a0+${labels.length - 2}` : "");
    elements.collectionMeta.textContent = `${resultCount} ${resultCount === 1 ? "card" : "cards"}`;
  }
  if (elements.clearCollectionButton) elements.clearCollectionButton.hidden = !active;
}

function updateChecklistButton(filteredCards) {
  const button = elements.downloadChecklistButton;
  if (!button) return;
  if (state.catalogLoadFailed || !state.cards.length) {
    button.disabled = true;
    button.textContent = "Download checklist";
    return;
  }
  const checklist = getChecklistContext(filteredCards);
  const { text, ariaLabel } = describeChecklistButton(checklist);
  button.disabled = !checklist.complete || !checklist.cards.length;
  button.textContent = text;
  button.setAttribute("aria-label", ariaLabel);
}

function describeChecklistButton(checklist) {
  const count = checklist.cards.length;
  if (checklist.scope === "guide") {
    if (!checklist.complete) {
      return { text: "Checklist unavailable", ariaLabel: "Unable to match every card in this guide" };
    }
    if (!count) return { text: "Download checklist", ariaLabel: "No cards in this guide to download" };
    return {
      text: `Download checklist (${count})`,
      ariaLabel: `Download checklist for all ${count} cards in this guide`,
    };
  }
  if (!count) return { text: "Download checklist (0)", ariaLabel: "No cards match active filters to download" };
  if (checklist.scope === "full_collection") {
    return { text: `Download checklist (${count})`, ariaLabel: `Download checklist for all ${count} cards` };
  }
  return {
    text: `Download checklist (${count})`,
    ariaLabel: `Download checklist for ${count} filtered ${count === 1 ? "card" : "cards"}`,
  };
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
  if (state.filters.sort === "set") {
    return a.setName.localeCompare(b.setName) || compareDates(a.setReleaseDate, b.setReleaseDate);
  }
  if (state.filters.sort === "newest") {
    return compareDates(b.setReleaseDate, a.setReleaseDate);
  }
  return a.pokemon.localeCompare(b.pokemon) || a.setName.localeCompare(b.setName);
}

function renderCard(card) {
  return `
    <article class="card-tile" data-card-id="${escapeAttribute(card.catalogIdentity)}" tabindex="0" role="button" aria-label="Open ${escapeAttribute(card.name)} preview">
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
  const card = findCardByIdentity(tile.dataset.cardId);
  if (card) openCardDetail(card, getCardDiscoverySource(tile));
}

function handleCardGridClick(event) {
  const tile = event.target.closest(".card-tile[data-card-id]");
  if (!tile) return;
  const card = findCardByIdentity(tile.dataset.cardId);
  if (card) openCardDetail(card, getCardDiscoverySource(tile));
}

function handleGuideCardClick(event) {
  // Let modified and non-primary clicks open the card page in a new tab or window.
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest(".guide-card a[data-card-id], .about-main a[data-card-id]");
  if (!link) return;
  const card = findCardByIdentity(link.dataset.cardId);
  if (!card) return;
  event.preventDefault();
  openCardDetail(card, link.dataset.lightboxSource || "guide_page");
}

function findCardByIdentity(cardId) {
  return state.cards.find((item) => item.catalogIdentity === cardId);
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
    ? `<strong>Why it belongs.</strong>${renderCurationNoteBody(whyItBelongs)}`
    : `<strong>Why it belongs.</strong> <span class="detail-pending">A curator's note is coming soon.</span>`;
  if (elements.detailGuideLinks) {
    elements.detailGuideLinks.innerHTML = renderGuideMemberships(card);
  }
  elements.detailMoods.innerHTML = card.moods?.length
    ? card.moods.map((mood) => renderMoodLink(mood)).join("")
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

// Mood pills link to the collection filtered to that mood, from every page.
function renderMoodLink(mood) {
  const root = document.body.dataset.siteRoot || "";
  return `<a class="mood-tag" href="${escapeAttribute(root)}collection/?mood=${escapeAttribute(slugify(mood))}" data-analytics-event="navigation_clicked" data-analytics-source="card_mood_pill" data-analytics-destination="collection" data-analytics-filter-value="${escapeAttribute(slugify(mood))}">${escapeHtml(mood)}</a>`;
}

function getMoodLabel(moodSlug) {
  if (!moodSlug || moodSlug === "all") return "";
  for (const card of state.cards) {
    const mood = card.moods.find((item) => slugify(item) === moodSlug);
    if (mood) return mood;
  }
  return elements.moodChips.find((item) => item.dataset.mood === moodSlug)?.textContent.trim() || "";
}

// Keep ?mood= in the collection URL matching the active mood, so a reload or shared link shows the same cards.
function syncMoodParam() {
  if (!elements.cardGrid) return;
  const url = new URL(window.location.href);
  const mood = state.filters.mood === "all" ? "" : state.filters.mood;
  if ((url.searchParams.get("mood") || "") === mood) return;
  if (mood) url.searchParams.set("mood", mood);
  else url.searchParams.delete("mood");
  window.history.replaceState(window.history.state, "", url);
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
  if (state.catalogLoadFailed || !state.cards.length) return;
  const checklist = getChecklistContext();
  if (!checklist.complete) {
    showToast("Could not match every card in this guide. Please reload before downloading.");
    return;
  }
  const exportCards = checklist.cards;
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
  anchor.download = checklist.filename;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  trackEvent("checklist_downloaded", {
    checklist_scope: checklist.scope,
    download_surface: checklist.surface,
    card_count: exportCards.length,
    file_format: "csv",
    interaction_source: checklist.source,
    guide_slug: checklist.guideSlug,
    guide_title: checklist.guideTitle,
  });
  showToast(`${checklist.label} checklist downloaded (${exportCards.length} cards).`);
}

// Everything the checklist button, CSV download and analytics need to agree on.
// filteredCards lets renderCards pass the list it already computed.
function getChecklistContext(filteredCards) {
  if (isGuidePage()) {
    const selection = state.guideSelection || { cards: [], complete: false };
    const guideSlug = document.body.dataset.guideSlug;
    const fileSlug = slugify(guideSlug);
    return {
      cards: selection.cards,
      complete: selection.complete,
      scope: "guide",
      surface: "guide_page",
      source: "guide_page",
      label: CHECKLIST_LABELS.guide,
      filename: fileSlug ? `sleepy-pokemon-${fileSlug}-checklist.csv` : "sleepy-pokemon-checklist.csv",
      guideSlug,
      guideTitle: document.body.dataset.guideTitle,
    };
  }
  const isFiltered = hasActiveFilters();
  const hasSearch = Boolean(state.filters.search);
  const scope = hasSearch ? "search_results" : isFiltered ? "filtered_collection" : "full_collection";
  return {
    cards: isFiltered ? filteredCards || getFilteredCards() : state.cards,
    complete: true,
    scope,
    surface: "collection",
    source: "collection_header",
    label: CHECKLIST_LABELS[scope],
    filename: getCollectionChecklistFilename(),
  };
}

function getCollectionChecklistFilename() {
  if (!hasActiveFilters()) return "sleepy-pokemon-checklist.csv";

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
  if (state.filters.set !== "all") {
    const setSlug = slugify(state.filters.set);
    if (setSlug) {
      return `sleepy-pokemon-${setSlug}-checklist.csv`;
    }
  }
  return "sleepy-pokemon-filtered-checklist.csv";
}

function isGuidePage() {
  return document.body.dataset.appMode === "guide-page";
}

function getGuideCardSelection() {
  const cardByIdentity = new Map(
    state.cards.map((card) => [card.catalogIdentity, card])
  );
  const cardElements = [...(elements.guideCardList?.querySelectorAll(".guide-card") || [])];
  const cards = cardElements.map((cardElement) => {
    const cardId = cardElement.querySelector("[data-card-id]")?.dataset.cardId;
    return cardByIdentity.get(cardId) || null;
  });
  return {
    cards: cards.filter(Boolean),
    complete: cards.every(Boolean),
  };
}

function escapeCsvCell(value) {
  const cell = String(value ?? "");
  if (!/[",\n\r]/.test(cell)) return cell;
  return `"${cell.replace(/"/g, '""')}"`;
}

function clearFilters(interactionSource) {
  const activeFilterCount = countActiveFilters();
  if (elements.filtersDialog?.open && activeFilterCount > 0) {
    state.modalFilterChanges += 1;
  }
  state.filters = {
    search: "",
    mood: "all",
    set: "all",
    rarity: "all",
    language: "all",
    maxPrice: "",
    sort: PUBLIC_DEFAULT_SORT,
  };
  state.showAllCards = false;
  if (elements.drawerSetSearch) elements.drawerSetSearch.value = "";
  elements.moodChips.forEach((chip) => chip.classList.remove("is-active"));
  elements.moodChipsTrack?.scrollTo({ left: 0, behavior: "smooth" });
  syncSearchUrl("");
  render();
  trackEvent("filters_cleared", {
    interaction_source: interactionSource,
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

function renderCurationNoteBody(value) {
  const paragraphs = String(value).split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
  if (paragraphs.length < 2) {
    return ` ${escapeHtml(paragraphs[0] || "")}`;
  }
  return paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
