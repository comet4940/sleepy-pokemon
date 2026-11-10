# Sleepy Pokemon State Machines

This file lists every place the site's browser code keeps state that changes over time. Each section gives the states, the invariants that should always hold, and a transition table. Some machines are explicit, with a flag or a dialog's `open`. Others are implicit: the state is spread across a URL, a history entry and a few variables.

Update this file in the same change as the code whenever a state, transition or invariant changes. Bugs found against it are listed at the end, with how each was reproduced.

Code references name the function in `docs/` rather than a line number, since lines move.

| # | Machine | Where | Kind |
|---|---------|-------|------|
| 1 | Page boot and catalog load | `app.js` `init` | implicit (awaits plus flags) |
| 2 | Prices | `prices.js` `ready`, `app.js` `init`, `applyPrices` | implicit (a promise raced against a timer) |
| 3 | Collection view: filters, URL and history | `app.js` `state.filters`, `syncFilterUrl`, `markHistoryStep`, `handleFilterHistoryNavigation` | implicit |
| 4 | Filter drawer | `app.js` `openFiltersDialog`, `closeFiltersDialog` | explicit (`<dialog>`) |
| 5 | Card lightbox and its history entry | `app.js` `openCardDetail`, `navigateCardDeck`, the lightbox `popstate` and `close` handlers | explicit dialog, implicit history |
| 6 | Lightbox content load | `app.js` `showCardDetail`, `loadCardPage` | implicit (token) |
| 7 | Swipe gesture | `app.js` `bindCardSwipe` | explicit (local `swipe`) |
| 8 | Suggest a card form | `app.js` `handleSuggestion*`, `resetSuggestionForm` | implicit (request ids) |
| 9 | Contact Comet form | `contact.js` | explicit (`sending`, `is-success`) |
| 10 | Binder storage and card lists | `binder.js` | explicit (`persistent`, lists) |
| 11 | Wishlist UI: hint strip, tile removal, toast | `app.js` | implicit |
| 12 | Collection empty state | `app.js` `renderEmptySearchState`, `describeEmptyState` | implicit (derived) |
| 13 | Phone header menu | `site-header.js` | explicit (`aria-expanded`) |
| 14 | Analytics | `analytics.js` | explicit (opt-out, host and debug gates) |

---

## 1. Page boot and catalog load

`init()` binds every event handler before any data has arrived, then loads the catalog, then waits up to 3 seconds for prices.

| State | Meaning |
|-------|---------|
| `Booting` | `cacheElements`, `applyInitialSearch` (`?suggest=` opens the form, `?q=` sets the search), `bindEvents`. |
| `CatalogLoading` | `state.cards` is `[]` while `published-cards.json` (or the guide's subset) loads. |
| `PriceWait` | Cards are loaded, prices not yet (up to `PRICE_WAIT_MS`). URL filters are not read yet and nothing is rendered. |
| `Ready` | URL filters read, random order assigned, first `render()`, lightbox restored from history, `catalog_loaded` sent. |
| `LoadFailed` | The catalog fetch failed: `catalogLoadFailed`, a toast, an empty catalog and "Collection unavailable". This state is terminal for the page. |

| From | Event | To | Effects |
|------|-------|----|---------|
| Booting | handlers bound | CatalogLoading | |
| CatalogLoading | catalog OK | PriceWait | `state.cards` set |
| CatalogLoading | catalog fails | PriceWait, then LoadFailed | `catalogLoadFailed = true`; the empty catalog renders "unavailable" |
| PriceWait | prices settle (≤ 3 s), or the timer fires | Ready | late prices: see section 2 |
| any | user input before Ready | same | handlers run against a partial catalog; see the invariant below |

**Invariants**
- **B1.** Whatever someone does before `Ready`, the first full render shows the filters in the URL. This holds because every filter change writes the URL synchronously (`syncFilterUrl`) and `init` reads it back (`readUrlFilters`). Checked: it holds.
- **B2.** `catalog_loaded` is sent at most once per page, and never after `LoadFailed`.

## 2. Prices

`prices.js` starts one fetch. `ready` never rejects: a failure resolves to an empty `Map`.

| State | Meaning |
|-------|---------|
| `Pending` | The fetch is in flight. Cards have `price === undefined`. |
| `OnTime` | Prices settled within 3 s: `applyPrices` runs before the first render. |
| `Late` | The first render ran without prices. When they arrive, `applyPrices` runs and then `render()`. |
| `Unavailable` | The fetch failed. This resolves like `OnTime` with an empty map, so every card gets `price = null`. |

| From | Event | To | Effects |
|------|-------|----|---------|
| Pending | settled ≤ 3 s | OnTime / Unavailable | `applyPrices(map)` |
| Pending | 3 s timer | Late | first render without prices |
| Late | settled | OnTime | `applyPrices`, then `render()`: grid, counts and price filters |

**Invariants**
- **P1.** Once prices are known, every price shown matches `card.price`, including the price row in an open lightbox. Not always (SM-6, won't fix): a card opened on a guide or set page before `prices.json` arrives shows "No current market price" until it's reopened or stepped away from. It's rare (about 7 KB compressed; none of 21 guide and set card opens Oct 31 to Nov 10 came within 3 s of the page loading) and never shows a wrong number.
- **P2.** A card with no price never reads as $0. Sorting puts it last, and price filters exclude it.
- **P3.** A late redraw does not move the visitor's scroll position. Checked: it holds (6 s delay, scrolled to 6000 px, same first visible card).

## 3. Collection view: filters, URL and history

The view is `state.filters` = `{search, mood, set, rarity, language, artist, maxPrice, sort, wishlist}`. The URL mirrors it (`getFilterUrlParams`). Two variables decide whether a change adds a history entry or replaces the current one:

- `state.historyMode`: `"replace"` or `"push"`. `markHistoryStep()` arms `push`, and the next `syncFilterUrl()` consumes it.
- `state.drawerHistoryPushed`: whether this drawer visit has already added its entry. `syncFilterUrl` sets it when it really pushes; opening the drawer clears it.

The first table is the history-mode latch:

| From | Event | To | Effects |
|------|-------|----|---------|
| replace | `markHistoryStep()` outside the drawer | push | |
| replace | `markHistoryStep()` in the drawer, no entry added yet | push | |
| replace | `markHistoryStep()` in the drawer, entry already added | replace | the change replaces the entry pushed earlier in this visit |
| push | `syncFilterUrl()`, URL changed | replace | `pushState`; in the drawer, `drawerHistoryPushed = true` |
| push | `syncFilterUrl()`, URL unchanged | replace | nothing is pushed, and in the drawer `drawerHistoryPushed` stays `false`, so the next change still adds the entry (fixed SM-3) |
| any | `syncFilterUrl()` while a lightbox entry is current | unchanged | the URL is left alone (it's the card page's) |

The second table lists what changes the view:

| Trigger | Filters after | History |
|---------|---------------|---------|
| Mood chip / "Under $5" chip | toggles that one | step |
| Drawer option | sets or clears one (re-tapping the current sort is ignored) | one step per drawer visit |
| Active filter chip ×, Wishlist chip × | clears that one | step |
| Header search submit (collection) | search set; mood, set, rarity, language, artist and price cleared; sort and wishlist kept | step |
| Header search emptied / search chip × | search cleared | step |
| Collection search input (`#searchFilter`) | search set on every keystroke | replace |
| Show all (`collection_clear_all`) | everything but the sort | step |
| Empty state "Clear filters" | filters, keeping the search and sort | step |
| Drawer "No matches · Reset filters" | everything but the sort | step (drawer) |
| Drawer Reset | everything, sort included | step (drawer) |
| Did you mean (fits the filters) | search replaced | step |
| Did you mean (outside the filters) | search replaced, filters cleared, sort kept | step |
| Back/Forward to a filter entry | read from the URL; closes an open drawer | none (browser) |
| Late prices / binder change | unchanged; redraw only | replace |

**Invariants**
- **V1.** When no lightbox entry is current, the URL's filter parameters equal `getFilterUrlParams(state.filters)`.
- **V2.** Each user step adds one history entry. A whole drawer visit adds at most one, and exactly one if it changed the URL, so Back returns to the view before it. Holds since SM-3 was fixed; `checkCollectionHistory` in `scripts/validate-analytics.mjs` tests it.
- **V3.** The sort is not a filter. Every clear keeps it except the drawer's Reset.
- **V4.** The quick chips' `is-active` class always equals `state.filters`. The mood chip handler reads the class, so this matters. Checked: every path that changes mood calls `render()`, which sets the classes.
- Dead state: `state.showAllCards` is written in 14 places and never read.

## 4. Filter drawer

| State | Meaning |
|-------|---------|
| `Closed` | |
| `Open` | `modalFilterChanges` counts changes in this visit. `drawerCloseMethod` defaults to `escape` until a named close sets it. |

| From | Event | To | Effects |
|------|-------|----|---------|
| Closed | All filters, or Sorted: … | Open | counters reset, redrawn from state, `filters_opened` |
| Open | option, Reset, No matches | Open | `modalFilterChanges++`, a history step (see 3) |
| Open | ×, backdrop, Show N / Done, Escape | Closed | `filters_modal_applied` if changed, else `filters_modal_bounced` |
| Open | Back (`popstate` to a filter entry) | Closed | `close_method: browser_back` |
| Open | Forward onto a lightbox entry | Closed | `close_method: browser_forward`, then the lightbox reopens (fixed SM-4) |

**Invariants**
- **M1.** At most one modal dialog is open at a time. Holds since SM-4 was fixed (see the lightbox's Forward rows in section 5); tested by `checkCollectionHistory`.
- **M2.** Each drawer visit sends exactly one of `filters_modal_applied` or `filters_modal_bounced`.

## 5. Card lightbox and its history entry

Opening the lightbox pushes a history entry `{cardDetail, cardDeck}` whose URL is the card's own page. The page's two `popstate` handlers both run on every Back and Forward. The filter handler ignores entries that carry `cardDetail`.

| State | Meaning |
|-------|---------|
| `Closed` | The dialog is closed and the current entry has no `cardDetail`. |
| `Open(card, deck, index)` | The dialog is open, the current entry is `cardDetail = card`, and the URL is the card page. |
| `Stepping(step)` | `cardNavigating = true`: the details slide out (160 ms), the entry is replaced, the next card slides in (240 ms). |
| `Closing` | The dialog is closed but the entry is still current, until the async `history.back()` lands. |

| From | Event | To | Effects |
|------|-------|----|---------|
| Closed | tile, guide card, hero, Surprise me | Open | `card_opened`, `showModal`, `pushState` |
| Closed | Forward onto a lightbox entry | Open | reopened from the entry (`browser_forward`), no push. An open filter drawer closes first (`close_method: browser_forward`) |
| Closed | Forward onto a lightbox entry, Suggest form open | Closed | the Forward is undone (`history.back()`), so the form and what was typed in it stay (fixed SM-4) |
| Open | arrow, key, swipe with a neighbour | Stepping | |
| Stepping | slide-out done, still open | Open(next) | `replaceState`, `card_navigated` |
| Stepping | slide-out done, closed meanwhile | Closed | stops, no event |
| Stepping | another step (key repeat, swipe) | Stepping | ignored; the details spring back |
| Open / Stepping | ×, backdrop, Escape | Closing | dialog `close`, then `history.back()` |
| Closing | `popstate` lands | Closed | |
| Open | Back | Closed | the `popstate` handler closes the dialog |
| Closing (≤ 160 ms into a step) | another card opens | Open with the old step still running | SM-5: not reachable by a person, won't fix |

**Invariants**
- **L1.** The dialog is open exactly when the current entry carries `cardDetail` (apart from `Closing`, which is brief).
- **L2.** The card shown = `cardDeck[cardDeckIndex]` = `history.state.cardDetail`, and `0 ≤ cardDeckIndex < cardDeck.length`. Only a script can break it (SM-5, won't fix): it needs a step, a close and a reopen inside one 160 ms slide-out, and with reduced motion there is no slide-out at all. Revisit if the slide gets longer.
- **L3.** `cardNavigating` is `true` only while a step animates.
- `restoreCardDetailFromHistory` handles loading a page whose current entry is a lightbox entry. That entry's URL is the card page, so a reload or a cache-less Back loads the card page itself, not the collection. The path is effectively unreachable today but harmless.

## 6. Lightbox content load

| State | Meaning |
|-------|---------|
| `Placeholder` | The image and name from the catalog. |
| `Details` | The card page's details (cached per URL), with the price row filled from `card.price`. |
| `LoadError` | The placeholder plus "Couldn't load this card's details" and a link. The failed fetch leaves the cache, so the next open retries. |

The transitions are guarded by `cardDetailToken`: only the latest `showCardDetail` may write. Checked: stepping quickly never shows an older card's details. The price row is written once, when the details land, and is never refreshed (SM-6, won't fix: see P1).

## 7. Swipe gesture

| From | Event | To |
|------|-------|----|
| Idle | touch `pointerdown`, not at a screen edge, deck ≥ 2, not stepping | Pending |
| Pending | moved 10 px, mostly vertical | Idle (scrolling wins) |
| Pending | moved 10 px, mostly sideways | Sideways (pointer captured) |
| Sideways | move | Sideways (follows the finger; a quarter of the distance at a deck end) |
| Sideways | `pointerup`, far (> 25 %) or fast | Idle, and `navigateCardDeck` |
| Sideways | `pointerup` short, or `pointercancel` | Idle, springs back |

Checked: no stuck state. A new `pointerdown` always resets `swipe`.

## 8. Suggest a card form

The parts that run concurrently are guarded by counters: `suggestionLookupRequestId` (lookup results), `suggestionSelectionRequestId` (a chosen card's details) and `suggestionFormSessionId` (one open-to-close session; `resetSuggestionForm` bumps all three on close).

| State | Meaning |
|-------|---------|
| `Closed` | |
| `Editing` | Fields editable; lookup idle. |
| `LookupDebounce` / `LookupFetching` | Typing ≥ 2 characters waits 350 ms, then calls TCGdex. |
| `Results` / `NoResults` / `LookupError` | The lookup's outcome (on error, typed details are still sent). |
| `Resolving` | A result was tapped and its details are loading (`suggestionSelectionPromise`). |
| `Selected` | `#suggestionCard` is filled and the chip is shown. |
| `Submitting` | `suggestionSending` (`handleSuggestionSubmit`): the button is disabled and reads "Sending…" from the click until the send ends, however it ends. After the POST, a send whose form was closed in the meantime doesn't touch the form (fixed SM-2). |
| `Success` | `is-success`: the fields are hidden and the thank-you is shown. |

| From | Event | To | Effects |
|------|-------|----|---------|
| Closed | header pill, `?suggest=`, Suggest links, empty state | Editing | `suggestion_opened` |
| Editing | typing | LookupDebounce, then LookupFetching | stale responses dropped by request id ✓ |
| Results | tap a result | Resolving, then Selected | stale selections dropped ✓ |
| any open | submit (valid) | Submitting | waits for a pending selection (session-checked ✓), then POSTs |
| Submitting | submit again (click, Enter) | Submitting | ignored; nothing more is sent (fixed SM-1) |
| Submitting | 2xx | Success | `suggestion_submitted` |
| Submitting | error | Editing | toast, `suggestion_submit_failed`, the button is back to "Send suggestion" |
| Submitting | no card yet, or the dialog closed while waiting for a selection | Editing / Closed | nothing sent, the button is back |
| any open | ×, backdrop, Escape, Done | Closed | form reset, all ids bumped |
| Submitting | close, then the POST resolves | Closed | `suggestion_submitted`, and a toast "Thanks! Your suggestion was sent."; the form stays reset, so the next open starts at `Editing` (fixed SM-2) |

**Invariants**
- **S1.** A form session sends at most one POST. Holds since SM-1 was fixed; `checkSuggestionSending` in `scripts/validate-analytics.mjs` tests it.
- **S2.** The thank-you shows only in the session that sent it. A newly opened form always starts at `Editing`. Holds since SM-2 was fixed; also tested by `checkSuggestionSending`.
- **S3.** A late lookup or selection never overwrites a newer one. Checked: it holds.

## 9. Contact Comet form

| From | Event | To |
|------|-------|----|
| Closed | Contact Comet | Editing (reset first if the last one was sent) |
| Editing | submit, empty or bad email | Error |
| Editing / Error | submit, valid | Sending (`sending = true`, button disabled) |
| Sending | submit | Sending (ignored) |
| Sending | 2xx / error | Success / Error |
| any | close | Closed; unsent text kept, a sent form reset |

Checked: this form has an in-flight guard and doesn't show a stale thank-you after a close mid-send. The Suggest form now does both too (SM-1, SM-2).

## 10. Binder storage and card lists

| State | Meaning |
|-------|---------|
| `Persistent` | Every read is fresh from `localStorage`, so another tab's save is never overwritten. |
| `VisitOnly` | The first failed write sets `persistent = false`, announces `unavailable` and saves the binder to the tab's `sessionStorage` (`sleepy_binder_v1_visit`), starting from what was saved before. Later pages in the tab find that copy and start here. `savedFor()` is `"visit"`. |
| `PageOnly` | `sessionStorage` is refused too: the binder lives in `memoryCopy` until the page is left. `savedFor()` is `"page"`. |

Each card slug is in exactly one of: `none`, `wished` or `owned`.

| From | Event | To |
|------|-------|----|
| none | add wished | wished |
| none | add owned | owned |
| wished | add owned | owned (`wishCameTrue`) |
| owned | add wished | owned (refused, returns `false`) |
| wished / owned | remove | none |

**Invariants**
- **W1.** A card is never both owned and wished, enforced by `add` and by `cleanBinder` on every read.
- **W2.** Malformed or unknown entries are kept, never dropped. Unreadable JSON is set aside once.
- **W3.** What the UI promises about saving matches what happens: "saved on this device" in `Persistent`, "for this visit only" (with a link to the wishlist) in `VisitOnly`, "until you leave this page" (no link) in `PageOnly`. Holds since SM-9 was fixed; `checkBinder` and `checkWishlistUnsaved` test it.
- Not a reachable bug: two tabs writing in the same millisecond could lose one update (read-modify-write without a lock). A person can't do this.

## 11. Wishlist UI

The hint strip goes `Unseen → Shown → Dismissed` (Got it, or the first wish). It's stored as a binder hint and is one-way.

**Tile removal** happens in the wishlist view. Removing a card removes its tile in place (`removeWishlistTile`) instead of redrawing the grid.

| From | Event | To |
|------|-------|----|
| Shown | un-wish (here or in the lightbox) | Fading (200 ms) |
| Fading | finished, no redraw meanwhile | Removed: tiles slide up, counts updated, empty state toggled |
| Fading | a full render meanwhile (Undo, another tab) | Superseded (does nothing) |

When a removal empties the grid, the empty state is drawn by `renderEmptyState`, the same function `renderCards` uses, so it matches a fresh page (fixed SM-8).

**The toast** is `Hidden` or `Shown(host, action?)`. `showToast` moves the toast into the open dialog, if any, because the page behind a modal is inert.

| From | Event | To |
|------|-------|----|
| Hidden / Shown | `showToast` | Shown(host = open dialog, else body) |
| Shown | timeout (3.2 s, or 6 s with an action) | Hidden |
| Shown(host = a dialog) | that dialog closes | Shown(host = body): `returnToastToPage` moves it back, keeping its timer and its Undo (fixed SM-7) |

**Invariants**
- **T1.** While a toast is shown, it is visible and its action can be tapped. Holds since SM-7 was fixed; `checkWishlistStates` tests it.
- **E1.** The same filters and catalog give the same empty state whichever path led there. Holds since SM-8 was fixed; tested by `checkWishlistStates`.

## 12. Collection empty state

This is derived on each render, in this order:

1. The catalog failed: "Collection unavailable".
2. The wishlist view with no wishes: "No wishes yet" and "Browse all N sleepers".
3. A search that matches nothing in the catalog, with a suggestion: "Did you mean X?" (marked "outside these filters" when the filters hide it).
4. The same, with no suggestion: "No sleepy cards for "q" yet" and "Suggest a sleepy card".
5. The filters left nothing: "No cards match these filters." and "Clear filters". It keeps the search, and in the wishlist view it keeps the wishlist too, when there are other filters (mood, set, rarity, language, artist, price) to clear. Otherwise it shows all cards, since keeping everything would change nothing.
6. Results: hidden.

Every path draws this through `renderEmptyState` (`renderCards`, and `removeWishlistTile` when it empties the grid).

## 13. Phone header menu

`aria-expanded` is `false` or `true`. It opens with ☰, and closes with ☰, a link, an outside click or Escape (focus returns to ☰). Checked: no invalid states.

## 14. Analytics

| State | Meaning |
|-------|---------|
| `OptedOut` | `?optout=1` or the stored flag. Nothing is defined, so every `track` is a no-op. |
| `Off` | Not a production host and not debug: same as `OptedOut`. |
| `Live` / `Debug` | `window.sleepyAnalytics.track` is defined and gtag loads. |

**Invariants**
- **A1.** A storage error never stops analytics from starting: the `localStorage` and `sessionStorage` reads are all guarded. Holds since SM-10 was fixed; `checkAnalyticsState` in `scripts/validate-analytics.mjs` tests it. (Until then, reading `sessionStorage` with storage blocked threw, and those visitors were never measured.)
- **A2.** An event's `result_count` describes what the visitor sees after the action. Holds for `filters_cleared` since SM-11 was fixed (before 2026-11-10 it always sent the catalog size); tested by `checkAnalyticsState`.

---

## Reachable invalid states

All of these were reproduced in Chromium (Playwright) against the site served locally from `docs/` at `main` `b420e70`, on 2026-11-08. The reproduction script is described in each fix's PR. They are listed most severe first.

| ID | Severity | What breaks | Reproduction and observed result | Issue |
|----|----------|-------------|----------------------------------|-------|
| SM-3 | Medium (**fixed**) | V2: a drawer visit loses its history step, so Back leaves the collection | From `/` go to `/collection/`, open All filters, tap Reset (nothing on), pick a mood, Show. `history.length` stays 3; Back goes to `/`, not the unfiltered collection. Fixed: the drawer marks its entry only once one was really added. | #282 |
| SM-6 | Won't fix | P1: the lightbox says "No current market price" for a priced card | Hold `prices.json`, open a card on a guide page, release: the row still reads "No current market price" while `card.price.market` is 478.56. Rare and harmless: see P1. Closed as not planned. | #283 |
| SM-7 | Medium (**fixed**) | T1: the wishlist Undo disappears with the lightbox | Remove a wish in the lightbox ("Removed from your wishlist · Undo"), then close the lightbox: the toast is still "shown" but inside the closed dialog, so it's invisible and can't be tapped. Fixed: a closing dialog returns its toast to the page. | #284 |
| SM-8 | Medium (**fixed**) | E1: the wishlist view's empty state differs by path, and its button does the wrong thing | `?wishlist=1&mood=X` with one matching wish: un-wish it. Shows "No cards match" and "Show all sleepers" (which leaves the wishlist view). A reload shows "No cards match these filters." and "Clear filters". Its "Clear filters" also left the wishlist view on a fresh page (all 264 cards). Fixed: one empty-state path, and Clear filters stays on the wishlist when there are other filters to clear. | #284 |
| SM-4 | Low (**fixed**) | M1: two modals stacked | Open a card, close it, open All filters, press Forward: drawer and lightbox both `open`. The Suggest form stacked the same way. Fixed: Forward closes the drawer first; with the Suggest form open, Forward is undone. | #282 |
| SM-5 | Won't fix | L2: the lightbox shows the wrong card and "2 of 1" | Step to the next card, close within 160 ms, open another card: it shows the previous deck's card, the position reads "2 of 1", and the history entry names the wrong card. Needs fast hands (key repeat, then Escape, then Enter). Reproduced only by a script (30 ms, then 70 ms): not reachable by a person, and impossible with reduced motion. | #282 |
| SM-1 | Low (**fixed**) | S1: one suggestion is POSTed to Formspree several times | Fill the Suggest form, click Send 2 times and press Enter, with Formspree answering in 800 ms: **3 POSTs**, so 3 emails and 3 `suggestion_submitted`. Not seen in real data: 8 sends Oct 31 to Nov 10, none within 30 s of the same person's previous one. Fixed by the "Sending…" state. | #281 |
| SM-2 | Low (**fixed**) | S2: the next Suggest form opens on the old thank-you | Send, press Escape before Formspree answers, then open the form again: `is-success` is set, the thank-you shows and the fields are hidden. Needs a close within the second or so a send takes, now while the button says "Sending…". Fixed: the form is left alone and a toast says it was sent. | #281 |
| SM-9 | Low (**fixed**) | W3: a "for this visit only" wishlist is gone on the next page | With `localStorage.setItem` throwing: wish a card, then follow the toast's "wishlist" link: "Your wishlist is empty". Fixed: the wishlist falls back to the tab's sessionStorage, so it lasts the visit; with that refused too, the copy says "until you leave this page", with no link. | #284 |
| SM-10 | Low (**fixed**) | A1: analytics never starts for visitors with storage blocked | Make `sessionStorage` throw: `window.sleepyAnalytics` is undefined and the console shows an uncaught `SecurityError`. Fixed: the `sessionStorage` reads are guarded like the `localStorage` ones. | #285 |
| SM-11 | Low (**fixed**) | A2: `filters_cleared.result_count` is the catalog size | `?q=pikachu&mood=belly-up`, then Did you mean or Clear filters with the search kept: sends 263 while 9 cards show. Fixed: it sends the cards showing (9). | #263 (with #285) |

## Checked and fine

- Lookup and selection races in the Suggest form (request ids).
- Stepping quickly through the lightbox: `cardDetailToken` keeps the latest card.
- Lightbox Back, Forward, ×, Escape and backdrop keep its history entry in step (L1). Android's back gesture closes the dialog natively and the `close` handler then drops the entry.
- Interacting before the catalog or prices load (B1).
- Late prices keep the scroll position (P3).
- The Contact form's in-flight and close-time handling.
- Binder exclusivity, unreadable data and cross-tab reads (W1, W2).
- Swipe gesture states.
- The phone menu.
