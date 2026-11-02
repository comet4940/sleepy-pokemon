const DEFAULT_LANGUAGE = "English";
const PUBLIC_DEFAULT_SORT = "random";
// Rarity filter buckets: each card keeps its exact rarity, the drawer groups related ones.
const RARITY_GROUPS = [
  { id: "common", label: "Common", rarities: ["Common"] },
  { id: "uncommon", label: "Uncommon", rarities: ["Uncommon"] },
  { id: "rare-holo", label: "Rare & Holo", rarities: ["Rare", "Rare Holo"] },
  { id: "illustration-rare", label: "Illustration Rare", rarities: ["Illustration Rare", "Special Illustration Rare", "Art Rare"] },
  { id: "ultra-secret", label: "Ultra & Secret", rarities: ["Ultra Rare", "Rare Ultra", "Secret Rare", "Rare Rainbow", "Triple Rare", "Rare Holo VMAX", "Pikachu Rare"] },
  { id: "trainer-gallery", label: "Trainer Gallery", rarities: ["Trainer Gallery Rare Holo"] },
  { id: "promo", label: "Promo", rarities: ["Promo"] },
];
// Old ?rarity= values that are now part of a group, so links shared before the change still work.
const RARITY_ALIASES = { "rare-ultra": "ultra-secret" };
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
  wishlist: "Wishlist",
};

const state = {
  cards: [],
  cardDetailToken: 0,
  // The cards the lightbox steps through (catalog identities, in page order) and where it is in them.
  cardDeck: [],
  cardDeckIndex: 0,
  cardNavigating: false,
  guideSelection: null,
  randomOrder: new Map(),
  filters: {
    search: "",
    mood: "all",
    set: "all",
    rarity: "all",
    language: "all",
    artist: "all",
    maxPrice: "",
    sort: PUBLIC_DEFAULT_SORT,
    // The visitor's own wishlist (#119): only their wished cards. Saved in binder.js, so it's per browser.
    wishlist: false,
  },
  renderToken: 0,
  showAllCards: false,
  suggestionLookupUsed: false,
  // Where the open suggestion form was opened from, so a submission says which entry point it came through.
  suggestionSource: "unknown",
  catalogLoadFailed: false,
  modalFilterChanges: 0,
  drawerCloseMethod: "escape",
  expandedDrawerSections: new Set(),
  // "push" makes the next URL sync add a browser history entry; otherwise the URL is replaced in place.
  historyMode: "replace",
  drawerHistoryPushed: false,
};

const elements = {};
const PRICE_WAIT_MS = 3000;
// The page's own address. While the lightbox is open the address bar shows the card's page instead, so relative
// paths are resolved against this.
const PAGE_URL = window.location.href;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheElements();
  applyInitialSearch();
  bindEvents();
  // Prices come from prices.js, loaded just before this script. They're a side detail, so a slow prices.json
  // never holds the cards back for long: after PRICE_WAIT_MS the cards render, and prices follow when they arrive.
  const pricesReady = window.sleepyPrices?.ready || Promise.resolve(new Map());
  state.cards = await loadPublishedCards();
  const prices = await Promise.race([pricesReady, new Promise((resolve) => setTimeout(resolve, PRICE_WAIT_MS))]);
  if (prices) applyPrices(prices);
  else pricesReady.then((late) => { applyPrices(late); render(); });
  state.guideSelection = isGuidePage() ? getGuideCardSelection() : null;
  if (elements.cardGrid) {
    Object.assign(state.filters, readUrlFilters());
    if (hasActiveFilters()) state.showAllCards = true;
  }
  assignRandomOrder();
  render();
  restoreCardDetailFromHistory();
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
  elements.detailScroll = document.querySelector("#detailScroll");
  elements.closeCardDetailButton = document.querySelector("#closeCardDetailButton");
  elements.detailPrevButton = document.querySelector("#detailPrevButton");
  elements.detailNextButton = document.querySelector("#detailNextButton");
  elements.detailPosition = document.querySelector("#detailPosition");
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
  elements.featuredCard = document.querySelector("a.hero-card[data-card-id]");
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
      markHistoryStep();
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
    markHistoryStep();
    render();
    trackFilterChange("maxPrice", "price_chip");
  });

  bind(elements.filterDrawerBody, "click", handleFilterOptionClick);
  window.addEventListener("popstate", handleFilterHistoryNavigation);
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
      trackSuggestionOpened(link.dataset.suggestionSource || "unknown", {
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
    trackSuggestionOpened("global_header");
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
  bindWishlist();
  bind(elements.clearCollectionButton, "click", () => clearFilters("collection_empty_state"));
  bind(elements.cardGrid, "click", handleCardGridClick);
  bind(elements.latestGrid, "click", handleCardGridClick);
  bind(elements.guideCardList, "click", handleGuideCardClick);
  bind(elements.aboutMain, "click", handleGuideCardClick);
  bind(elements.featuredCard, "click", handleGuideCardClick);
  bind(elements.closeCardDetailButton, "click", closeCardDetail);
  bind(elements.detailPrevButton, "click", () => navigateCardDeck(-1, "arrow_button"));
  bind(elements.detailNextButton, "click", () => navigateCardDeck(1, "arrow_button"));
  bind(elements.cardDetailDialog, "keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      navigateCardDeck(event.key === "ArrowRight" ? 1 : -1, "keyboard");
    }
  });
  bindCardSwipe();
  document.addEventListener("pointerdown", prefetchCardPage, { passive: true });
  // However the lightbox closes (×, backdrop, Escape), drop its history entry so Back doesn't reopen nothing.
  bind(elements.cardDetailDialog, "close", () => {
    if (window.history.state?.cardDetail) window.history.back();
  });
  // Back closes the lightbox; Forward onto its entry reopens the card it showed.
  window.addEventListener("popstate", () => {
    const cardId = window.history.state?.cardDetail;
    if (elements.cardDetailDialog?.open && !cardId) elements.cardDetailDialog.close();
    if (!elements.cardDetailDialog?.open && cardId) {
      const card = findCardByIdentity(cardId);
      if (card) openCardDetail(card, "browser_forward", { fromHistory: true, deck: window.history.state.cardDeck });
    }
  });
  bind(elements.cardDetailDialog, "click", (event) => {
    if (event.target === elements.cardDetailDialog) closeCardDetail();
  });
}

function trackSuggestionOpened(interactionSource, params = {}) {
  state.suggestionSource = interactionSource;
  trackEvent("suggestion_opened", { interaction_source: interactionSource, ...params });
}

function applyInitialSearch() {
  const params = new URLSearchParams(window.location.search);
  const suggest = params.get("suggest");
  if (suggest && elements.suggestionDialog) {
    openSuggestionDialog();
    // Each form open is tracked once, here: ?suggest=header comes from the header pill, anything else is a shared or bookmarked link.
    trackSuggestionOpened(suggest === "header" ? "global_header" : "suggest_link");
    const url = new URL(window.location.href);
    url.searchParams.delete("suggest");
    window.history.replaceState(window.history.state, "", url);
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
    artist: "all",
    maxPrice: "",
  };
  state.showAllCards = true;
  elements.moodChips.forEach((chip) => chip.classList.remove("is-active"));
  markHistoryStep();
  render();
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
  markHistoryStep();
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
  state.drawerHistoryPushed = false;
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
    interaction_source: state.suggestionSource,
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

function applyPrices(prices) {
  state.cards.forEach((card) => {
    const entry = prices.get(card.catalogIdentity);
    card.price = Number.isFinite(entry?.market) ? entry : null;
  });
}

async function loadPublishedCards() {
  try {
    const guidePath = document.body.dataset.guidePath || "published-cards.json";
    // no-cache rather than no-store: the browser still checks for a newer file on every visit, but an unchanged one
    // comes back as "not modified" instead of downloading again.
    const response = await fetch(guidePath, { cache: "no-cache" });
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
    setReleaseDate: card.setReleaseDate || "",
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
  // A chosen quick chip shows an × (CSS) and is announced as pressed; tapping it again removes the filter.
  [...elements.moodChips, elements.priceChip].filter(Boolean).forEach((chip) => {
    const isActive = chip.dataset.mood ? chip.dataset.mood === state.filters.mood : chip.dataset.maxPrice === state.filters.maxPrice;
    chip.classList.toggle("is-active", isActive);
    chip.setAttribute("aria-pressed", String(isActive));
  });
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
  markHistoryStep();
  render();
  trackFilterChange(key, "filter_drawer");
}

// One place for filter and sort analytics; interaction_source says where the change was made.
function trackFilterChange(key, interactionSource) {
  const value = state.filters[key];
  const params = {
    filter_value: getAnalyticsFilterValue(key, value),
    filter_action: value === "all" || value === "" || value === false ? "removed" : "applied",
    result_count: getFilteredCards().length,
    interaction_source: interactionSource,
  };
  trackEvent(key === "sort" ? "sort_changed" : "filter_changed", { filter_name: key, ...params });
  if (key !== "sort") trackEvent(`filter_facet_${key}`, params);
}

function renderCards() {
  syncFilterUrl();
  const filteredCards = getFilteredCards();
  const renderToken = state.renderToken + 1;
  state.renderToken = renderToken;
  const cards = filteredCards;
  const latestCards = getRecentlyAddedCards();
  if (elements.heroCardCount) elements.heroCardCount.textContent = state.cards.length;
  // A polite live region, so screen readers hear the new count after a search or filter change.
  if (elements.resultCount) elements.resultCount.textContent = describeResultCount(filteredCards.length);
  updateCollectionHeading(filteredCards.length);
  updateChecklistButton(filteredCards);
  renderActiveFilterControls();
  renderWishlistHint();
  if (elements.latestGrid) elements.latestGrid.innerHTML = latestCards.map(renderCard).join("");
  if (!elements.cardGrid) return;
  if (state.catalogLoadFailed) {
    elements.emptyState.classList.remove("hidden");
    elements.emptyState.querySelector("h3").textContent = "Collection unavailable";
    elements.emptyState.querySelector("p").textContent = "The sleepy stack is taking a nap. Please try again shortly.";
    if (elements.clearCollectionButton) elements.clearCollectionButton.hidden = true;
    if (elements.searchSuggestionPrompt) elements.searchSuggestionPrompt.hidden = true;
    elements.cardGrid.innerHTML = "";
    return;
  }
  elements.emptyState.classList.toggle("hidden", cards.length > 0);
  describeEmptyState();
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

function normalizeSearchText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function describeResultCount(count) {
  if (!count) return "No cards match";
  return `${count} ${count === 1 ? "card" : "cards"}`;
}

function getFilteredCards() {
  return filterCards(state.filters).sort(compareCards);
}

function filterCards(filters) {
  // Every word must appear somewhere on the card, ignoring case and accents ("pokemon go" finds "Pokémon GO").
  const searchTerms = normalizeSearchText(filters.search).split(/\s+/).filter(Boolean);
  const maxPrice = numericOrNull(filters.maxPrice);

  return state.cards
    .filter((card) => {
      if (searchTerms.length) {
        const searchable = normalizeSearchText([
          card.name,
          card.pokemon,
          card.setName,
          card.setSeries,
          card.number,
          card.rarity,
          card.language,
          card.artist,
          card.whyItBelongs,
          ...card.moods,
        ].join(" "));
        if (!searchTerms.every((term) => searchable.includes(term))) return false;
      }
      if (filters.mood !== "all") {
        if (!card.moods.some((mood) => slugify(mood) === filters.mood)) return false;
      }
      if (filters.set !== "all" && card.setName !== filters.set) return false;
      if (filters.rarity !== "all" && getRarityGroup(card.rarity).id !== filters.rarity) return false;
      if (filters.language !== "all" && card.language !== filters.language) return false;
      if (filters.artist !== "all" && slugify(card.artist) !== filters.artist) return false;
      if (maxPrice !== null && !(getDisplayPrice(card) > 0 && getDisplayPrice(card) <= maxPrice)) return false;
      if (filters.wishlist && !isWished(card.slug)) return false;
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
    || state.filters.artist !== "all"
    || state.filters.maxPrice
    || state.filters.wishlist,
  );
}

function countActiveFilters() {
  return [
    Boolean(state.filters.search),
    state.filters.mood !== "all",
    state.filters.set !== "all",
    state.filters.rarity !== "all",
    state.filters.language !== "all",
    state.filters.artist !== "all",
    Boolean(state.filters.maxPrice),
    state.filters.wishlist,
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
  renderWishlistChip();
  if (elements.activeAdvancedFilters) {
    // Artist has no drawer section (over a hundred artists); it's set from an artist link and cleared here.
    const advancedFilters = ["artist", "set", "rarity", "language"].filter((key) => state.filters[key] !== "all");
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
        markHistoryStep();
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
  // In the wishlist view alone, its chip's × already does what "Show all" would.
  if (elements.clearFiltersLink) elements.clearFiltersLink.hidden = countActiveFilters() === 0 || (state.filters.wishlist && countActiveFilters() === 1);
}

function getFilterLabel(key, value) {
  if (key === "mood") return getMoodLabel(value) || value;
  if (key === "rarity") return RARITY_GROUPS.find((group) => group.id === value)?.label || getRarityGroup(value).label;
  if (key === "maxPrice") return `under $${value}`;
  if (key === "artist") return `Art by ${getArtistName(value)}`;
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
  if (state.filters.wishlist) {
    describeWishlistView(resultCount);
  } else if (!active) {
    elements.collectionTitle.textContent = "All sleepy Pokemon";
    elements.collectionMeta.textContent = `${state.cards.length} cards · zero alarm clocks`;
  } else {
    // Name what is showing: the search, then the filters, up to two names and then "+N".
    const labels = ["mood", "rarity", "set", "language", "artist", "maxPrice"]
      .filter((key) => (key === "maxPrice" ? Boolean(state.filters.maxPrice) : state.filters[key] !== "all"))
      .map((key) => getFilterLabel(key, state.filters[key]))
      .map((label) => label.charAt(0).toUpperCase() + label.slice(1));
    const names = [search && `“${search}”`, ...labels].filter(Boolean);
    const showing = names.slice(0, 2).join(" · ") + (names.length > 2 ? `\u00a0+${names.length - 2}` : "");
    elements.collectionTitle.textContent = search ? `Matching “${search}”` : showing;
    // Phones hide the names: the active filter chips just above already show them.
    const namesNode = Object.assign(document.createElement("span"), { className: "collection-meta-names", textContent: ` · ${showing}` });
    elements.collectionMeta.replaceChildren(`${resultCount} of ${state.cards.length} cards`, namesNode);
  }
  if (elements.clearCollectionButton) elements.clearCollectionButton.hidden = !active;
}

function updateChecklistButton(filteredCards) {
  const button = elements.downloadChecklistButton;
  if (!button) return;
  if (state.catalogLoadFailed || !state.cards.length) {
    button.disabled = true;
    button.textContent = button.dataset.shortLabel || "Download checklist";
    button.setAttribute("aria-label", "Download checklist (unavailable)");
    return;
  }
  const checklist = getChecklistContext(filteredCards);
  const { text, ariaLabel } = describeChecklistButton(checklist);
  button.disabled = !checklist.complete || !checklist.cards.length;
  button.classList.toggle("is-wishlist", checklist.scope === "wishlist");
  button.hidden = checklist.scope === "wishlist" && !(wishlistStore()?.count("wished"));
  // The collection's button sits beside the card count, so it can be shorter; the aria-label still says what it holds.
  button.textContent = button.dataset.shortLabel ? (checklist.scope === "wishlist" ? "Wishlist" : button.dataset.shortLabel) : text;
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
  if (checklist.scope === "wishlist") {
    if (!count) return { text: "Download wishlist (0)", ariaLabel: "No wishlist cards to download" };
    return { text: `Download wishlist (${count})`, ariaLabel: `Download your wishlist: ${count} ${count === 1 ? "card" : "cards"}` };
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
    // Cards without a price go last instead of reading as $0.
    const priceA = getDisplayPrice(a);
    const priceB = getDisplayPrice(b);
    if (!priceA || !priceB) return Number(!priceA) - Number(!priceB);
    return priceA - priceB;
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
    <article class="card-tile${isWished(card.slug) ? " is-wished" : ""}" data-card-id="${escapeAttribute(card.catalogIdentity)}" data-card-slug="${escapeAttribute(card.slug)}">
      <div class="card-image-frame">
        ${card.imageSmall || card.imageLarge
          ? `<img src="${escapeAttribute(card.imageSmall || card.imageLarge)}" alt="${escapeAttribute(`${card.name} card`)}" loading="lazy" decoding="async" />`
          : `<div class="image-fallback">${escapeHtml(card.name)}</div>`}
        ${renderWishSky()}
      </div>
      <div class="card-body">
        <div class="card-title-row"><h3><button class="card-open" type="button" aria-label="Open ${escapeAttribute(card.name)} preview">${escapeHtml(card.name)}</button></h3>${renderWishButton(card.slug, card.name)}</div>
        <p class="card-subtitle">${escapeHtml(card.setName)} · ${escapeHtml(card.number)} · ${escapeHtml(card.rarity)}</p>
      </div>
    </article>
  `;
}

function handleCardGridClick(event) {
  const tile = event.target.closest(".card-tile[data-card-id]");
  if (!tile) return;
  const card = findCardByIdentity(tile.dataset.cardId);
  if (card) openCardDetail(card, getCardDiscoverySource(tile), { deck: getGridDeck(tile) });
}

// The collection steps through the filtered, sorted results (all of them, even before the grid has finished
// drawing); "Freshly added" through its own row.
function getGridDeck(tile) {
  if (elements.cardGrid?.contains(tile)) return getFilteredCards().map((card) => card.catalogIdentity);
  return [...tile.parentElement.querySelectorAll(".card-tile[data-card-id]")].map((item) => item.dataset.cardId);
}

function handleGuideCardClick(event) {
  // Let modified and non-primary clicks open the card page in a new tab or window.
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest(".guide-card a[data-card-id], .about-main a[data-card-id], a.hero-card[data-card-id]");
  if (!link) return;
  const card = findCardByIdentity(link.dataset.cardId);
  if (!card) return;
  event.preventDefault();
  // A guide, set or About page steps through its own cards, in page order. The homepage's featured card is alone.
  const list = link.closest(".guide-card-list, .about-main");
  const deck = list ? [...new Set([...list.querySelectorAll("a[data-card-id]")].map((item) => item.dataset.cardId))] : [];
  openCardDetail(card, link.dataset.lightboxSource || "guide_page", { deck });
}

// ---- Wishlist (#119) -----------------------------------------------------------------------------------
// binder.js stores the wishlist; this draws it. A wished card gets the starry frame (.is-wished) and a filled pink
// star by its name. Collection and homepage tiles draw their star (renderCard); guide and set cards, written by
// the generators, get theirs added here. Any change, in this tab or another, updates every star on the page.
const WISH_STAR_PATH = "M12 2.8l2.75 5.6 6.15.9-4.45 4.33 1.05 6.12L12 16.87l-5.5 2.88 1.05-6.12L3.1 9.3l6.15-.9z";
const WISHABLE_CARDS = "article.card-tile[data-card-slug], .guide-card[data-card-slug]";
// A wished card's frame twinkles: tiny stars and three sparkles, all in the frame's padding (never over the art).
// They only animate on wished cards (CSS), and "reduce motion" stills them.
const WISH_SPARKLE_PATH = "M12 0c1 7 5 11 12 12-7 1-11 5-12 12-1-7-5-11-12-12 7-1 11-5 12-12z";
const WISH_SKY_STARS = [[8, 4, 2.4, 0], [26, 2.5, 1.6, 0.9], [50, 3, 2, 0.4], [74, 2.5, 1.8, 1.4], [93, 6, 2.2, 0.2], [3, 22, 1.8, 1.1], [97, 30, 2, 0.7], [2.5, 48, 2.2, 1.8], [97.5, 62, 1.6, 0.3], [3, 80, 2, 1.3], [96, 88, 2.4, 0.6], [18, 97, 2, 1.6], [44, 97.5, 1.6, 0.1], [70, 97, 2.2, 1], [88, 98, 1.8, 1.9]];
const WISH_BURST_COLOURS = ["#f36b9b", "#fff7e8", "#c9bcff", "#ffd678", "#f36b9b", "#fff7e8", "#a7e8d4", "#f36b9b"];
let wishSkyMarkup = "";

function renderWishSky() {
  if (!wishlistStore()) return "";
  if (!wishSkyMarkup) {
    const sparkle = `<svg viewBox="0 0 24 24" focusable="false"><path d="${WISH_SPARKLE_PATH}" /></svg>`;
    const stars = WISH_SKY_STARS.map(([x, y, size, delay]) => `<i style="left:${x}%;top:${y}%;--size:${size}px;--delay:${delay}s;--length:${(2.4 + (delay % 1.2)).toFixed(1)}s"></i>`).join("");
    wishSkyMarkup = `<span class="wish-sky" aria-hidden="true">${stars}<b class="wish-sparkle is-cream">${sparkle}</b><b class="wish-sparkle is-pink">${sparkle}</b><b class="wish-sparkle is-lavender">${sparkle}</b></span>`;
  }
  return wishSkyMarkup;
}

// A little pop of sparkles from the star when a card is wished.
// The burst comes from the star itself (on the "Add to wishlist" buttons too, not the middle of the label). In the
// lightbox it's added inside the dialog, since an open dialog sits above everything else on the page.
function burstWish(button) {
  if (typeof button.getBoundingClientRect !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const box = (button.querySelector("svg") || button).getBoundingClientRect();
  const burst = document.createElement("span");
  burst.className = "wish-burst";
  burst.setAttribute("aria-hidden", "true");
  const x = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  burst.style.left = `${x}px`;
  burst.style.top = `${y}px`;
  burst.innerHTML = WISH_BURST_COLOURS.map((colour, index) => {
    const angle = (index / WISH_BURST_COLOURS.length) * Math.PI * 2 - Math.PI / 2;
    const distance = 30 + (index % 3) * 9;
    return `<b style="--colour:${colour};--x:${(Math.cos(angle) * distance).toFixed(1)}px;--y:${(Math.sin(angle) * distance).toFixed(1)}px;animation-delay:${(index % 2) * 40}ms"><svg viewBox="0 0 24 24" focusable="false"><path d="${WISH_SPARKLE_PATH}" /></svg></b>`;
  }).join("");
  (button.closest("dialog[open]") || document.body).append(burst);
  // Inside a dialog that's moved or scaled (its opening animation), "fixed" is measured from the dialog: correct it.
  const placed = burst.getBoundingClientRect();
  if (Math.abs(placed.left - x) > 1 || Math.abs(placed.top - y) > 1) {
    burst.style.left = `${2 * x - placed.left}px`;
    burst.style.top = `${2 * y - placed.top}px`;
  }
  window.setTimeout(() => burst.remove(), 900);
  button.classList.remove("is-popping");
  void button.offsetWidth;
  button.classList.add("is-popping");
}

function wishlistStore() {
  return window.sleepyBinder || null;
}

function isWished(slug) {
  try {
    return Boolean(wishlistStore()?.has("wished", slug));
  } catch {
    return false;
  }
}

function wishLabel(name, wished) {
  return wished ? `Remove ${name} from your wishlist` : `Add ${name} to your wishlist`;
}

function renderWishButton(slug, name) {
  if (!wishlistStore()) return "";
  const wished = isWished(slug);
  return `<button class="wish-toggle" type="button" data-wish-slug="${escapeAttribute(slug)}" data-wish-name="${escapeAttribute(name)}" aria-pressed="${wished}" aria-label="${escapeAttribute(wishLabel(name, wished))}" title="${wished ? "Remove from wishlist" : "Add to wishlist"}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${WISH_STAR_PATH}" /></svg></button>`;
}

// Adds the star to cards that don't have one yet and brings every card's state up to date.
function syncWishlist(root = document) {
  if (!wishlistStore()) return;
  root.querySelectorAll(WISHABLE_CARDS).forEach((card) => {
    const slug = card.dataset.cardSlug;
    const wished = isWished(slug);
    card.classList.toggle("is-wished", wished);
    const frame = card.querySelector(".card-image-frame, .guide-card-image");
    if (frame && !frame.querySelector(".wish-sky")) frame.insertAdjacentHTML("beforeend", renderWishSky());
    let button = card.querySelector(".wish-toggle");
    if (!button) {
      const title = card.querySelector(".guide-card-copy h2");
      if (!title) return;
      title.insertAdjacentHTML("beforeend", renderWishButton(slug, title.textContent.trim()));
      return;
    }
    button.setAttribute("aria-pressed", String(wished));
    button.setAttribute("aria-label", wishLabel(button.dataset.wishName, wished));
    button.title = wished ? "Remove from wishlist" : "Add to wishlist";
  });
  root.querySelectorAll(".detail-wish").forEach(syncDetailWish);
}

// The lightbox's (and card page's) "Add to wishlist" / "On your wishlist" button. card-page.js mirrors this.
// Its art frame gets the same starry sky as a wished tile.
function syncDetailWish(button) {
  const wished = isWished(button.dataset.wishSlug);
  const host = button.closest?.(".card-page-detail, #cardDetailDialog");
  if (host) {
    host.classList.toggle("is-wished", wished);
    const frame = host.querySelector(".detail-image-frame");
    if (frame && !frame.querySelector(".wish-sky")) frame.insertAdjacentHTML("beforeend", renderWishSky());
  }
  button.setAttribute("aria-pressed", String(wished));
  button.setAttribute("aria-label", wishLabel(button.dataset.wishName, wished));
  const label = button.querySelector(".detail-wish-label");
  if (label) label.textContent = wished ? "On your wishlist" : "Add to wishlist";
}

function bindWishlist() {
  const store = wishlistStore();
  if (!store) return;
  // Capture: handled before the tile's own click, which would open the card.
  document.addEventListener("click", (event) => {
    const button = event.target.closest?.(".wish-toggle, .detail-wish");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    toggleWish(button);
  }, true);
  store.onChange((change) => {
    if (state.filters.wishlist && change.type !== "hint") render();
    syncWishlist();
    if (change.type === "unavailable") showToast("Your browser couldn't save your wishlist on this device.");
  });
  // Back, a restored tab or returning to the window can show a page saved before the latest change.
  window.addEventListener("pageshow", () => syncWishlist());
  window.addEventListener("focus", () => syncWishlist());
  syncWishlist();
}

function toggleWish(button) {
  const store = wishlistStore();
  const slug = button.dataset.wishSlug;
  const wasWished = store.has("wished", slug);
  // binder.js only reports success when the wishlist really changed: a card someone already has (owned) can't be
  // wished for. Nothing below runs, or is tracked, unless it did.
  const changed = wasWished ? store.remove("wished", slug) : store.add("wished", slug);
  if (!changed) {
    syncWishlist();
    showToast(!wasWished && store.has("owned", slug)
      ? "You already have this card, so it's not added to your wishlist."
      : "Couldn't update your wishlist. Please try again.");
    return;
  }
  const count = store.count("wished");
  if (wasWished) {
    showToast("Removed from your wishlist", { actionLabel: "Undo", onAction: () => store.add("wished", slug) });
  } else {
    burstWish(button);
    dismissWishlistHint("first_wish", button);
    // The browser won't let the site save (private modes, full or blocked storage): binder.js keeps the wishlist
    // for this visit only, so never say it's saved (review on #200).
    if (!store.isPersistent()) {
      showToast("Added to your wishlist for this visit only. Your browser isn't letting this site save it.", { duration: 6500 });
    } else if (!store.hintSeen(WISHLIST_HINTS.firstWish)) {
      store.markHintSeen(WISHLIST_HINTS.firstWish);
      showToast("Added to your wishlist ★ It's saved on this device. Find it under Wishlist in the header.", { duration: 6500 });
    } else {
      showToast(`Added to your wishlist · ${count} ${count === 1 ? "card" : "cards"}`);
    }
  }
  // Which card it was stays private: never send card details with wishlist events.
  const source = button.classList?.contains("detail-wish") ? (button.closest("#cardDetailDialog") ? "card_modal" : "card_page") : "card_tile";
  trackEvent("wishlist_toggled", { action: wasWished ? "removed" : "added", interaction_source: source });
}

// One-time onboarding (#119), remembered in binder.js: the collection's strip above the grid until it's dismissed
// or the first wish is made, and a longer message for that first wish.
const WISHLIST_HINTS = { strip: "wishlist_strip", firstWish: "wishlist_first_wish" };

function renderWishlistHint() {
  const store = wishlistStore();
  const existing = document.querySelector(".wishlist-hint");
  const show = Boolean(elements.cardGrid && store && !state.catalogLoadFailed && state.cards.length && !state.filters.wishlist && !store.hintSeen(WISHLIST_HINTS.strip));
  if (!show) {
    existing?.remove();
    return;
  }
  if (existing) return;
  const hint = document.createElement("aside");
  hint.className = "wishlist-hint";
  hint.setAttribute("aria-label", "About your wishlist");
  hint.innerHTML = `<svg class="wishlist-hint-star" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${WISH_STAR_PATH}" /></svg>
    <p class="wishlist-hint-text"><strong>See a sleepy card you love?</strong> Tap the star to add it to your wishlist, then download it anytime.</p>
    <p class="wishlist-hint-note">Saved on this device · <a href="../about/#wishlist" data-analytics-event="navigation_clicked" data-analytics-source="wishlist_hint" data-analytics-destination="about">How it works</a></p>
    <button class="wishlist-hint-close" type="button">Got it</button>`;
  hint.querySelector(".wishlist-hint-close").addEventListener("click", () => dismissWishlistHint("got_it"));
  elements.cardGrid.before(hint);
  trackEvent("wishlist_hint_shown", { interaction_source: "collection_strip" });
}

function dismissWishlistHint(method, keepInPlace) {
  const store = wishlistStore();
  if (!store || store.hintSeen(WISHLIST_HINTS.strip)) return;
  store.markHintSeen(WISHLIST_HINTS.strip);
  const hint = document.querySelector(".wishlist-hint");
  if (!hint) return;
  // The strip sits above the cards: when a wish removes it, keep the star just tapped where it was. Some browsers
  // adjust the scroll for removed content themselves (scroll anchoring) and some don't, so measure, then correct.
  const before = keepInPlace?.getBoundingClientRect?.().top;
  hint.remove();
  if (before !== undefined) {
    const shift = keepInPlace.getBoundingClientRect().top - before;
    if (Math.abs(shift) > 1) window.scrollBy(0, shift);
  }
  trackEvent("wishlist_hint_dismissed", { interaction_source: "collection_strip", dismiss_method: method });
}

// The wishlist view's chip, first in the filter row: "★ Wishlist ×". Tapping × leaves the view.
function renderWishlistChip() {
  const row = elements.openFiltersButton?.parentElement;
  if (!row) return;
  let chip = row.querySelector(".wishlist-chip");
  if (!state.filters.wishlist) {
    chip?.remove();
    return;
  }
  if (chip) return;
  chip = document.createElement("button");
  chip.type = "button";
  chip.className = "mood-chip wishlist-chip is-active";
  chip.setAttribute("aria-label", "Leave your wishlist and show all cards");
  chip.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${WISH_STAR_PATH}" /></svg>Wishlist`;
  chip.addEventListener("click", () => {
    state.filters.wishlist = false;
    state.showAllCards = hasActiveFilters();
    markHistoryStep();
    render();
    trackFilterChange("wishlist", "active_filter_chip");
  });
  elements.openFiltersButton?.after(chip);
}

// "6 cards on your wishlist · about $85", and the other filters' names when some are on.
function describeWishlistView(resultCount) {
  const wishedCount = wishlistStore()?.count("wished") || 0;
  const filtered = getFilteredCards();
  const total = filtered.reduce((sum, card) => sum + (getDisplayPrice(card) || 0), 0);
  elements.collectionTitle.textContent = "Your wishlist";
  const others = hasActiveFilters() && countActiveFilters() > 1;
  if (!wishedCount) {
    elements.collectionMeta.textContent = "Your wishlist is empty";
    return;
  }
  const count = others ? `${resultCount} of ${wishedCount} on your wishlist` : `${resultCount} on your wishlist`;
  const price = total > 0 ? Object.assign(document.createElement("span"), { className: "collection-meta-names", textContent: ` · about ${total >= 10 ? `$${Math.round(total).toLocaleString("en-US")}` : formatCurrency(total)}` }) : "";
  elements.collectionMeta.replaceChildren(count, price);
}

let defaultEmptyState = null;
function describeEmptyState() {
  if (!elements.emptyState) return;
  const title = elements.emptyState.querySelector("h3");
  const text = elements.emptyState.querySelector("p");
  defaultEmptyState ||= { title: title.textContent, text: text.textContent, action: elements.clearCollectionButton?.textContent };
  const noWishes = state.filters.wishlist && !(wishlistStore()?.count("wished"));
  elements.emptyState.classList.toggle("is-wishlist-empty", noWishes);
  title.textContent = noWishes ? "No wishes yet" : defaultEmptyState.title;
  text.textContent = noWishes ? "See a sleepy card you love? Tap the star next to its name and it lands here, ready to download as a list. Your wishlist is saved on this device only." : defaultEmptyState.text;
  if (elements.clearCollectionButton) {
    elements.clearCollectionButton.textContent = noWishes ? `Browse all ${state.cards.length} sleepers` : defaultEmptyState.action;
    if (noWishes) elements.clearCollectionButton.hidden = false;
  }
  if (noWishes && elements.searchSuggestionPrompt) elements.searchSuggestionPrompt.hidden = true;
}

function findCardByIdentity(cardId) {
  return state.cards.find((item) => item.catalogIdentity === cardId);
}

function getCardDiscoverySource(tile) {
  return elements.latestGrid?.contains(tile) ? "freshly_tucked_in" : "collection_grid";
}

// A reload (or a return to a page the browser didn't keep in memory) lands on the lightbox's history entry with
// the lightbox closed: reopen its card, so Back closes it rather than stepping to an identical page. If the card
// is gone, drop the marker instead.
function restoreCardDetailFromHistory() {
  const cardId = window.history.state?.cardDetail;
  if (!cardId || elements.cardDetailDialog?.open) return;
  const card = findCardByIdentity(cardId);
  if (card) {
    openCardDetail(card, "browser_restore", { fromHistory: true, deck: window.history.state.cardDeck });
    return;
  }
  const { cardDetail, cardDeck, ...state } = window.history.state;
  window.history.replaceState(Object.keys(state).length ? state : null, "");
}

// fromHistory: reopened by Forward onto the lightbox's own history entry, so there's no entry to add.
// deck: the cards the lightbox can step through from here (see navigateCardDeck); without one, just this card.
function openCardDetail(card, interactionSource = "unknown", { fromHistory = false, deck = [] } = {}) {
  state.cardDeck = deck.includes(card.catalogIdentity) ? deck : [card.catalogIdentity];
  state.cardDeckIndex = state.cardDeck.indexOf(card.catalogIdentity);
  // Tracked before the address changes, so the event's page is the one the card was opened from.
  trackEvent("card_opened", {
    ...getCardAnalyticsParams(card),
    interaction_source: interactionSource,
  });
  if (!elements.cardDetailDialog.open) {
    elements.cardDetailDialog.showModal();
    // One history entry per visit to the lightbox, so the phone's Back button closes it instead of leaving the page.
    // It shows the card's own page address, so it can be copied and shared, and a reload opens that page. The
    // card's identity (and the deck) let Forward reopen the lightbox.
    if (!fromHistory) {
      window.history.pushState({ ...window.history.state, cardDetail: card.catalogIdentity, cardDeck: state.cardDeck }, "", getCardPageUrl(card));
    }
  }
  showCardDetail(card);
}

// Shows a card in the open lightbox, for opening it or stepping to it.
function showCardDetail(card) {
  // The binder (binder.js) finds the open card by its slug, like every other card element.
  elements.cardDetailDialog.dataset.cardSlug = card.slug;
  elements.cardDetailDialog.classList.toggle("is-wished", isWished(card.slug));
  // The lightbox shows the card page's own details (see loadCardPage), so features live in one place: the card
  // page generator. Until that arrives (usually instantly, as tapping a card starts loading it) or if it can't
  // load, show the essentials from the catalog.
  renderCardDetailPlaceholder(card);
  const token = ++state.cardDetailToken;
  loadCardPage(card).then((details) => {
    if (token !== state.cardDetailToken) return;
    if (!details) {
      renderCardDetailLoadError(card);
      return;
    }
    elements.detailScroll.replaceChildren(details.cloneNode(true));
    syncWishlist(elements.detailScroll);
    const priceRow = elements.detailScroll.querySelector(".detail-price-row");
    if (priceRow) priceRow.innerHTML = window.sleepyPrices?.renderRow(card.price, card.setReleaseDate) || "";
  });
  // Start each card at the top. Only once the lightbox is showing: Safari keeps a hidden element's scroll position
  // and ignores a reset made while it's closed.
  if (elements.detailScroll) elements.detailScroll.scrollTop = 0;
  updateCardDeckControls();
  // Get the neighbours ready, so stepping to them shows the whole card straight away.
  [-1, 1].forEach((step) => {
    const neighbour = findCardByIdentity(state.cardDeck[state.cardDeckIndex + step]);
    if (!neighbour) return;
    loadCardPage(neighbour);
    const image = neighbour.imageLarge || neighbour.imageSmall;
    if (image) new Image().src = image;
  });
}

// "4 of 48" and the desktop arrows; both stay hidden for a single card. The arrows stop at the ends.
function updateCardDeckControls() {
  const { length } = state.cardDeck;
  if (elements.detailPosition) {
    elements.detailPosition.hidden = length < 2;
    elements.detailPosition.textContent = `${state.cardDeckIndex + 1} of ${length}`;
  }
  if (elements.detailPrevButton) {
    elements.detailPrevButton.hidden = length < 2;
    elements.detailPrevButton.disabled = state.cardDeckIndex === 0;
  }
  if (elements.detailNextButton) {
    elements.detailNextButton.hidden = length < 2;
    elements.detailNextButton.disabled = state.cardDeckIndex >= length - 1;
  }
}

function hasCardDeckStep(step) {
  return Boolean(findCardByIdentity(state.cardDeck[state.cardDeckIndex + step]));
}

// Steps to the previous (-1) or next (1) card. The details slide out one way and the next card slides in from the
// other; a swipe has already moved them part of the way. Nothing happens at either end.
async function navigateCardDeck(step, interactionSource) {
  const area = elements.detailScroll;
  if (!elements.cardDetailDialog?.open || state.cardNavigating || !hasCardDeckStep(step)) {
    if (area?.style.transform) slideDetails(area, "", 220);
    return;
  }
  state.cardNavigating = true;
  const card = findCardByIdentity(state.cardDeck[state.cardDeckIndex + step]);
  await slideDetails(area, `translateX(${step * -100}%)`, 160, "ease-in");
  // Closed (×, Escape, Back) while the details slid out: the lightbox's history entry may be gone, so stop.
  if (!elements.cardDetailDialog.open || !window.history.state?.cardDetail) {
    slideDetails(area, "", 0);
    state.cardNavigating = false;
    return;
  }
  state.cardDeckIndex += step;
  window.history.replaceState({ ...window.history.state, cardDetail: card.catalogIdentity }, "", getCardPageUrl(card));
  showCardDetail(card);
  await slideDetails(area, `translateX(${step * 100}%)`, 0);
  await slideDetails(area, "", 240);
  state.cardNavigating = false;
  trackEvent("card_navigated", {
    ...getCardAnalyticsParams(card),
    interaction_source: interactionSource,
    direction: step > 0 ? "next" : "previous",
  });
}

// Moves the details to `transform` over `duration` ms, resolving when they get there. Skipped with reduced motion.
function slideDetails(area, transform, duration, easing = "cubic-bezier(.2, .8, .2, 1)") {
  const animate = duration > 0 && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  area.style.transition = animate ? `transform ${duration}ms ${easing}` : "none";
  area.style.transform = transform;
  if (!animate) {
    void area.offsetWidth;
    return Promise.resolve();
  }
  return new Promise((resolve) => window.setTimeout(resolve, duration));
}

// Swiping the details sideways steps through the cards on touch screens. Only a mostly sideways drag counts, so
// scrolling the details still works, and touches at the screen's edges are left to the browser's own back swipe.
// At either end the details stretch a little and spring back.
function bindCardSwipe() {
  const area = elements.detailScroll;
  if (!area) return;
  const EDGE = 24;
  let swipe = null;
  area.addEventListener("pointerdown", (event) => {
    swipe = null;
    if (event.pointerType !== "touch" || state.cardDeck.length < 2 || state.cardNavigating) return;
    if (event.clientX < EDGE || event.clientX > window.innerWidth - EDGE) return;
    swipe = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp, dx: 0, sideways: false };
  });
  area.addEventListener("pointermove", (event) => {
    if (!swipe || event.pointerId !== swipe.id) return;
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    if (!swipe.sideways) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      if (Math.abs(dy) >= Math.abs(dx)) {
        swipe = null;
        return;
      }
      swipe.sideways = true;
      area.setPointerCapture?.(event.pointerId);
    }
    swipe.dx = hasCardDeckStep(dx < 0 ? 1 : -1) ? dx : dx * 0.25;
    area.style.transition = "none";
    area.style.transform = `translateX(${swipe.dx}px)`;
  });
  const finish = (event) => {
    if (!swipe || event.pointerId !== swipe.id) return;
    const { dx, sideways, time } = swipe;
    swipe = null;
    if (!sideways) return;
    const fast = Math.abs(dx) / Math.max(1, event.timeStamp - time) > 0.5;
    const far = Math.abs(dx) > area.clientWidth * 0.25;
    if (event.type === "pointerup" && (far || (fast && Math.abs(dx) > 30))) navigateCardDeck(dx < 0 ? 1 : -1, "swipe");
    else slideDetails(area, "", 220);
  };
  area.addEventListener("pointerup", finish);
  area.addEventListener("pointercancel", finish);
}

// What the lightbox shows until the card page's details arrive, or if they can't load: the image and name from
// the catalog.
function renderCardDetailPlaceholder(card) {
  const image = card.imageLarge || card.imageSmall;
  elements.detailScroll.innerHTML = `
    <div class="detail-art-column">
      <div class="detail-image-frame">${image
        ? `<img src="${escapeAttribute(image)}" alt="${escapeAttribute(`${card.name} card`)}" />`
        : `<div class="image-fallback">${escapeHtml(card.name)}</div>`}</div>
    </div>
    <div class="detail-copy">
      <p class="detail-kicker">Caught napping</p>
      <h2 id="detailTitle">${escapeHtml(card.name)}</h2>
      <p class="card-subtitle">${escapeHtml([card.setName, card.number, card.rarity].filter(Boolean).join(" · "))}</p>
    </div>`;
}

// If the card page can't load (offline, a network blip), say so and link to the page so a reload can try again.
function renderCardDetailLoadError(card) {
  elements.detailScroll.querySelector(".detail-copy")?.insertAdjacentHTML("beforeend", `
    <p class="card-subtitle">Couldn't load this card's details.</p>
    <a class="detail-full-link" href="${escapeAttribute(getCardPageUrl(card))}" data-analytics-event="navigation_clicked" data-analytics-source="card_modal" data-analytics-destination="card_page">Open the card page <span aria-hidden="true">→</span></a>`);
}

function getCardPageUrl(card) {
  return new URL(`${document.body.dataset.siteRoot || ""}cards/${card.slug}/`, PAGE_URL).href;
}

// A card page's details (art column and copy), ready for the lightbox, cached per page. Resolves to null if the
// page can't load, so the lightbox keeps the placeholder (see renderCardDetailLoadError).
const cardPageDetails = new Map();

function loadCardPage(card) {
  const url = getCardPageUrl(card);
  if (!cardPageDetails.has(url)) {
    cardPageDetails.set(url, fetch(url)
      .then((response) => (response.ok ? response.text() : Promise.reject(new Error(`${url} returned ${response.status}`))))
      .then((html) => adaptCardPageDetails(html, url))
      .catch((error) => {
        console.error(error);
        cardPageDetails.delete(url);
        return null;
      }));
  }
  return cardPageDetails.get(url);
}

function adaptCardPageDetails(html, url) {
  const article = new DOMParser().parseFromString(html, "text/html").querySelector(".card-page-detail");
  if (!article) throw new Error(`${url} has no card details`);
  // Links and images are written relative to the card page; resolve them so they work from this page too.
  article.querySelectorAll("[href]").forEach((element) => element.setAttribute("href", new URL(element.getAttribute("href"), url).href));
  article.querySelectorAll("[src]").forEach((element) => element.setAttribute("src", new URL(element.getAttribute("src"), url).href));
  article.querySelectorAll('[data-analytics-source="card_page"]').forEach((element) => {
    element.dataset.analyticsSource = "card_modal";
  });
  // The page's heading becomes the lightbox's title.
  const heading = article.querySelector(".detail-copy h1");
  if (heading) {
    const title = document.createElement("h2");
    title.id = "detailTitle";
    title.append(...heading.childNodes);
    heading.replaceWith(title);
  }
  // "Back to the sleepy stack" makes no sense in the lightbox.
  article.querySelector(".detail-full-link")?.remove();
  const details = document.createDocumentFragment();
  details.append(...article.children);
  return details;
}

// Tapping a card starts loading its page before the click lands, so the lightbox usually opens complete.
function prefetchCardPage(event) {
  const cardId = event.target.closest?.("[data-card-id]")?.dataset.cardId;
  const card = cardId && findCardByIdentity(cardId);
  if (card) loadCardPage(card);
}

function closeCardDetail() {
  elements.cardDetailDialog?.close();
}

function getCardIdentity(card) {
  return [card.apiId, card.tcgdexId, card.language, card.setName, card.number, card.name]
    .filter(Boolean)
    .join("::");
}

// The artist's name as printed on most of their cards, for the "Art by" chip.
function getArtistName(artistSlug) {
  const names = state.cards.map((card) => card.artist).filter((name) => name && slugify(name) === artistSlug);
  const counts = names.reduce((map, name) => map.set(name, (map.get(name) || 0) + 1), new Map());
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
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
// The collection URL carries every active filter, so shared links, reloads and back/forward show the same view.
// e.g. /collection/?q=pikachu&mood=belly-up&rarity=promo&set=neo-destiny&language=japanese&artist=sui&maxPrice=10&sort=price-low
const URL_FILTER_KEYS = ["q", "mood", "rarity", "set", "language", "artist", "maxPrice", "sort", "wishlist"];

function getFilterUrlParams(filters) {
  const params = [];
  if (filters.search.trim()) params.push(["q", filters.search.trim()]);
  if (filters.mood !== "all") params.push(["mood", filters.mood]);
  if (filters.rarity !== "all") params.push(["rarity", filters.rarity]);
  if (filters.set !== "all") params.push(["set", slugify(filters.set)]);
  if (filters.language !== "all") params.push(["language", slugify(filters.language)]);
  if (filters.artist !== "all") params.push(["artist", filters.artist]);
  if (filters.maxPrice) params.push(["maxPrice", filters.maxPrice]);
  if (filters.sort !== PUBLIC_DEFAULT_SORT) params.push(["sort", filters.sort]);
  if (filters.wishlist) params.push(["wishlist", "1"]);
  return params;
}

function syncFilterUrl() {
  // While the lightbox is open the address is the card's page; closing it returns to the collection's.
  if (!elements.cardGrid || window.history.state?.cardDetail) return;
  const url = new URL(window.location.href);
  URL_FILTER_KEYS.forEach((key) => url.searchParams.delete(key));
  getFilterUrlParams(state.filters).forEach(([key, value]) => url.searchParams.append(key, value));
  url.hash = "";
  const push = state.historyMode === "push";
  state.historyMode = "replace";
  if (url.href === window.location.href) return;
  window.history[push ? "pushState" : "replaceState"](null, "", url);
}

// User changes add one history entry; a whole drawer visit counts as one step, so Back returns to the view before it.
function markHistoryStep() {
  if (elements.filtersDialog?.open) {
    if (state.drawerHistoryPushed) return;
    state.drawerHistoryPushed = true;
  }
  state.historyMode = "push";
}

// Reads filters from the URL once cards are loaded; unknown values fall back to "all".
function readUrlFilters() {
  const params = new URLSearchParams(window.location.search);
  const filters = { mood: "all", rarity: "all", set: "all", language: "all", artist: "all", maxPrice: "", sort: PUBLIC_DEFAULT_SORT, wishlist: false };
  const mood = slugify(params.get("mood"));
  // Old links used ?mood=under-5 for what is now the Price filter.
  if (mood === "under-5") filters.maxPrice = "5";
  else if (mood && getMoodLabel(mood)) filters.mood = mood;
  const rarity = RARITY_ALIASES[params.get("rarity")] || params.get("rarity");
  if (rarity && getDrawerOptions("rarity").some((option) => option.value === rarity)) filters.rarity = rarity;
  const findByName = (value, names) => names.find((name) => slugify(name) === slugify(value)) || "all";
  if (params.get("set")) filters.set = findByName(params.get("set"), [...new Set(state.cards.map((card) => card.setName))]);
  if (params.get("language")) filters.language = findByName(params.get("language"), [...new Set(state.cards.map((card) => card.language))]);
  const artist = slugify(params.get("artist"));
  if (artist && getArtistName(artist)) filters.artist = artist;
  const maxPrice = params.get("maxPrice");
  if (PRICE_OPTIONS.some((option) => option.value === maxPrice)) filters.maxPrice = maxPrice;
  const sort = params.get("sort");
  if (SORT_OPTIONS.some((option) => option.value === sort)) filters.sort = sort;
  // The header's Wishlist link opens ?wishlist=1; any value (or none, ?wishlist) counts.
  filters.wishlist = params.has("wishlist") && params.get("wishlist") !== "0" && Boolean(wishlistStore());
  return filters;
}

function handleFilterHistoryNavigation() {
  // The lightbox's entry has the card page's address, not the collection's filters.
  if (!elements.cardGrid || !state.cards.length || window.history.state?.cardDetail) return;
  const search = new URLSearchParams(window.location.search).get("q")?.trim() || "";
  const next = { ...state.filters, ...readUrlFilters(), search };
  // Back always closes an open drawer, even when the entry it lands on has the same filters
  // (e.g. a pill picked and unpicked in one drawer visit).
  if (elements.filtersDialog?.open) closeFiltersDialog("browser_back");
  if (JSON.stringify(next) === JSON.stringify(state.filters)) return;
  state.filters = next;
  state.showAllCards = hasActiveFilters();
  if (elements.searchFilter) elements.searchFilter.value = search;
  if (elements.headerSearchInput) elements.headerSearchInput.value = search;
  render();
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
    card.whyItBelongs || "",
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
  // The wishlist view always downloads as the wishlist, whatever else is filtered.
  const scope = state.filters.wishlist ? "wishlist" : hasSearch ? "search_results" : isFiltered ? "filtered_collection" : "full_collection";
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
  if (state.filters.wishlist) return "sleepy-pokemon-wishlist.csv";
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
    artist: "all",
    maxPrice: "",
    sort: PUBLIC_DEFAULT_SORT,
    wishlist: false,
  };
  state.showAllCards = false;
  if (elements.drawerSetSearch) elements.drawerSetSearch.value = "";
  if (elements.searchFilter) elements.searchFilter.value = "";
  if (elements.headerSearchInput) elements.headerSearchInput.value = "";
  elements.moodChips.forEach((chip) => chip.classList.remove("is-active"));
  elements.moodChipsTrack?.scrollTo({ left: 0, behavior: "smooth" });
  markHistoryStep();
  render();
  trackEvent("filters_cleared", {
    interaction_source: interactionSource,
    active_filter_count: activeFilterCount,
    result_count: state.cards.length,
  });
}

function getCardAnalyticsParams(card) {
  return {
    card_name: card.name,
    card_pokemon: card.pokemon,
    card_set: card.setName,
    card_number: card.number,
    card_rarity: card.rarity,
    card_language: card.language,
  };
}

function getCatalogSurface() {
  if (elements.cardGrid) return "collection";
  if (elements.latestGrid) return "homepage_latest";
  return "";
}

function getAnalyticsFilterValue(key, value) {
  if (key === "maxPrice") return numericOrNull(value) ?? "none";
  if (key === "wishlist") return value ? "wishlist" : "all";
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
  return card.price?.market || 0;
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

function formatCurrency(value) {
  const number = numericOrNull(value) || 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(number);
}

// A short message at the bottom of the screen. With { actionLabel, onAction } it also offers a button (Undo) and
// stays a little longer, so there's time to reach it.
function showToast(message, { actionLabel, onAction, duration } = {}) {
  if (!elements.toast) return;
  elements.toast.textContent = message;
  if (actionLabel && onAction) {
    const action = document.createElement("button");
    action.type = "button";
    action.className = "toast-action";
    action.textContent = actionLabel;
    action.addEventListener("click", () => {
      elements.toast.classList.add("hidden");
      onAction();
    }, { once: true });
    elements.toast.append(action);
  }
  elements.toast.classList.remove("hidden");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    elements.toast.classList.add("hidden");
  }, duration || (actionLabel ? 6000 : 3200));
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
