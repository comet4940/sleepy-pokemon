# Sleepy Pokemon Analytics Contract

This is the source of truth for the redesigned site's Google Analytics 4 instrumentation. Update this document and the implementation together whenever an event or parameter changes.

- Measurement ID: `G-3HFVE8BEZH`
- Contract version: `redesign_v1`
- Production hosts: `sleepypokemon.com`, `www.sleepypokemon.com`
- Local previews do not send analytics unless the session begins on a URL with `?analytics_debug=1`.

## Principles

1. Track completed user actions and useful outcomes, not every click or keystroke.
2. Use `interaction_source` to distinguish where an action began.
3. Never send search text, suggestion text, notes, email addresses, or other user-authored content.
4. Use stable identifiers such as guide slugs and card metadata when they help answer a product question.
5. GA4 automatic events are context only. They do not replace the product events below.

Every product event includes `page_type` and `analytics_version` automatically.

## Page Types

| Page type | Surface |
| --- | --- |
| `home` | Homepage, featured sleeper, and recently added cards |
| `collection` | Search results, browse grid, filters, sorting, and collection suggestion prompt |
| `guides-index` | Collector guides directory |
| `guide` | Individual editorial guide |
| `sets-index` | Sets directory (`/sets/`) |
| `set` | Set page (`/sets/<set>/`): the sleepy cards from one set with 5 or more of them |
| `card` | Individual crawlable card page |
| `about` | About page: the collectors, how the collection started, the sleepy standard, and the current chase |

## Discovery And Navigation

| Event | Trigger | Parameters |
| --- | --- | --- |
| `navigation_clicked` | A measured site navigation link is selected, including a card's mood pill (`interaction_source: card_mood_pill`), About page links (`about_page`), and set navigation: `sets_index` → `set_page`, `set_page` → `sets` (All sets), `card_page` / `card_modal` → `set_page` (the field notes on a card page or in the lightbox), and `card_page` / `card_modal` → `artist` (the artist's name, which opens the collection filtered to that artist), and `card_modal` → `card_page` (*Open the card page*, shown only when the lightbox can't load the card's details). The lightbox shows the card page's own details, so its links carry the card page's events with `card_page` sources rewritten to `card_modal` | `interaction_source`, `destination`, `destination_path`, `filter_value` (mood pills and artist links: the mood or artist slug) |
| `menu_opened` | The phone header's ☰ menu opens (site-header.js, every page). Its links (Browse, Guides, About) still send `navigation_clicked` with `interaction_source: global_header`, and Suggest still sends `suggestion_opened` with `global_header`, so compare those on phones before and after the menu to see what moving them cost | `interaction_source` (`global_header`) |
| `catalog_loaded` | A visible interactive catalog finishes loading | `catalog_surface`, `card_count` |
| `card_opened` | A card opens in the detail lightbox, including About page cards (`interaction_source`: `about_favorite`, `about_origin`, `about_current_chase`, `about_current_chase_art`) set page cards (`set_page`), the homepage's weekly featured card (`homepage_featured`), Forward reopening a lightbox that Back closed (`browser_forward`), and a reload reopening the card that was open (`browser_restore`) | card parameters, `interaction_source` |
| `card_navigated` | The lightbox steps to the previous or next card (`interaction_source`: `swipe` on touch screens, `arrow_button` or `keyboard` on desktop). It steps through the cards of the page it was opened from: the collection's filtered, sorted results, *Freshly tucked in*, or a guide, set or About page's cards; it stops at either end. Stepping isn't counted as `card_opened`, so `card_opened` still means a visitor picked a card. While the lightbox is open the address bar shows the card's own page (`/cards/<slug>/`), so lightbox events after `card_opened` (which is sent from the page it was opened on) carry that card page as `page_location`; `page_type` stays the page the lightbox opened on. If GA4's enhanced measurement "Page changes based on browser history events" is on, each card shown also records a `page_view` for its card page with that `page_type` | card parameters, `interaction_source`, `direction` (`next` or `previous`) |
| `random_sleeper_clicked` | “Show me a sleeper” selects a random card | card parameters |
| `card_page_view` | A crawlable card page loads | card parameters |
| `guide_opened` | A guide link is selected | `guide_slug`, `guide_title`, `interaction_source`, `destination_path` |
| `guide_page_view` | An individual guide page loads | `guide_slug`, `guide_title` |
| `guide_card_selected` | A card is selected from an individual guide | card parameters, `guide_slug`, `interaction_source`, `destination_path` |

`catalog_surface` is `homepage_latest` or `collection`. `catalog_loaded` must not fire on guide pages that load card data solely to support the lightbox.

## Search And Refinement

| Event | Trigger | Parameters |
| --- | --- | --- |
| `search_submitted` | A non-empty global-header search is submitted | `interaction_source`, `query_length` |
| `search_results_viewed` | The collection displays results for a non-empty query | `interaction_source`, `query_length`, `result_count` |
| `search_cleared` | The active query is removed | `result_count` |
| `filters_opened` | The filter drawer opens (the **All filters** button on the collection) | `active_filter_count` |
| `filters_modal_bounced` | The filter drawer is closed without changing any filter or the sort | `close_method`, `had_active_filters`, `active_filter_count` |
| `filters_modal_applied` | The filter drawer is closed after changing one or more filters or the sort | `close_method`, `changes_count`, `active_filter_count`, `result_count` |
| `filter_changed` | A mood, set, rarity, language, artist, or price filter changes. The artist filter has no drawer section: it comes from an artist link (`?artist=<slug>`) and is removed with its *Art by …* chip, so it's only seen with `interaction_source: active_filter_chip`. Rarity values are drawer groups (`common`, `uncommon`, `rare-holo`, `illustration-rare`, `ultra-secret`, `trainer-gallery`, `promo`); price values are the max price (`5`, `10`, `25`, `50`); the collection's *under $5* chip sends `maxPrice` / `5` (it was the pseudo-mood `under-5` before the filter drawer) | `filter_name`, `filter_value`, `filter_action`, `result_count`, `interaction_source` |
| `filter_facet_<facet>` | Direct facet event (`mood`, `set`, `rarity`, `language`, `artist`, `maxPrice`; `pokemon` was retired with the filter drawer). Same data as `filter_changed`, kept for per-filter history from before `filter_name` was registered | `filter_action`, `filter_value`, `result_count`, `interaction_source` |
| `filter_chip_removed` | An active filter pill is dismissed directly from the collection filter row | `filter_name`, `result_count` |
| `sort_changed` | Collection order changes in the filter drawer | `filter_name`, `filter_value`, `filter_action`, `result_count`, `interaction_source` |
| `filters_cleared` | All active collection filters are cleared | `interaction_source`, `active_filter_count`, `result_count` |

Filter `interaction_source` values say where the change was made:

| Event | `interaction_source` |
| --- | --- |
| `filter_changed`, `filter_facet_*` | `mood_chip` (chip row), `price_chip` (the *under $5* chip), `filter_drawer` (a drawer pill), `active_filter_chip` (the × on an active filter chip) |
| `sort_changed` | `filter_drawer` |
| `filters_cleared` | `filter_drawer_reset` (drawer Reset), `filter_drawer_no_matches` (the drawer's "No matches · Reset filters" button), `collection_clear_all` (Show all, beside the result count), `collection_empty_state` (the empty results button) |

`close_method` says how the drawer was closed: `show_results` (the "Show N sleepers" button), `close_button` (×), `backdrop`, `escape`, or `browser_back` (the browser's Back button while the drawer is open).

Search text is intentionally excluded. `query_length` is the only query-level parameter. A header search that navigates to the collection produces `search_submitted` on the source page and `search_results_viewed` on the destination page.

## Suggestions

| Event | Trigger | Parameters |
| --- | --- | --- |
| `suggestion_opened` | The suggestion dialog opens. The header Suggest pill opens it in place on the homepage and collection, and elsewhere links to `collection/?suggest=header`; both are tracked when the dialog opens as `interaction_source: global_header`. Any other `?suggest=` link (shared or bookmarked) is tracked as `suggest_link`. On the collection, the prompt shown under search results ("Not seeing your snoozer?") is `collection_search`. The homepage's "Community nap watch" block (`homepage`) was removed on 2026-10-26 in favour of the header pill | `interaction_source`, `has_active_search` and `result_count` (in-page suggestion links only) |
| `suggestion_lookup_completed` | An external card lookup returns or fails | `lookup_type`, `lookup_outcome`, `result_count` |
| `suggestion_card_selected` | A lookup result is selected | card parameters |
| `suggestion_card_removed` | A selected lookup result is removed | none beyond shared parameters |
| `suggestion_submitted` | Formspree accepts the suggestion | `selection_method`, `lookup_used`, `has_notes`, `interaction_source` (where the form was opened from, as on `suggestion_opened`) |
| `suggestion_submit_failed` | Submission cannot be delivered | `selection_method`, `lookup_used`, `has_notes`, `interaction_source`, `error_type` |

Allowed values:

- `lookup_type`: `name`, `number`, `name_and_number`
- `lookup_outcome`: `matches`, `no_matches`, `error`
- `selection_method`: `catalog_lookup`, `manual`
- `error_type`: `configuration`, `http`, `network`

No lookup query, suggested card text, reason, or notes are sent to GA4.

## Creator Links

| Event | Trigger | Parameters |
| --- | --- | --- |
| `coffee_clicked` | Buy Me a Coffee is selected | `interaction_source`, `destination`, `destination_path` |
| `studio_link_clicked` | Semi Serious Labs is selected | `interaction_source`, `destination`, `destination_path` |

## Collector Checklist Event

`checklist_downloaded` tracks collector checklist downloads:

- `checklist_scope`: `full_collection`, `search_results`, `filtered_collection`, or `guide`
- `download_surface`: `collection` or `guide_page`
- `card_count`
- `file_format`
- `interaction_source`
- `guide_slug` and `guide_title` on guide downloads

Collection downloads keep `interaction_source: collection_header` for compatibility with existing GA4 reports. Use `checklist_scope` to distinguish full collection, search results, and other filtered downloads. Guide downloads use `interaction_source: guide_page` and include the guide slug and title.

## Shared Parameters

Card parameters:

- `card_name`
- `card_pokemon`
- `card_set`
- `card_number`
- `card_rarity`
- `card_language`

Common parameters:

- `page_type`
- `analytics_version`
- `interaction_source`
- `destination`
- `destination_path`
- `guide_slug`
- `guide_title`
- `result_count`

## GA4 Setup

Register these event-scoped custom dimensions when reusable GA4 reporting is needed:

- `analytics_version`
- `page_type`
- `interaction_source`
- `destination`
- `catalog_surface`
- `card_name`
- `card_pokemon`
- `card_set`
- `card_number`
- `card_rarity`
- `card_language`
- `checklist_scope`
- `download_surface`
- `file_format`
- `guide_slug`
- `guide_title`
- `filter_name`
- `filter_value`
- `filter_action`
- `changes_count`
- `close_method`
- `direction`
- `had_active_filters`
- `lookup_type`
- `lookup_outcome`
- `selection_method`
- `error_type`

Useful numeric custom metrics are `card_count`, `result_count`, `query_length`, and `active_filter_count`. Events no longer carry `price_market` (removed in #152: the site doesn't measure sales, and prices aren't in the page HTML anymore); archive the custom metric in GA4 if it was registered.

Mark `suggestion_submitted`, `checklist_downloaded` and `filters_modal_applied` as GA4 key events (conversions representing contribution, collector intent, and a collector refining the collection with the filter drawer). Routine browsing, search, and outbound links should remain diagnostic events rather than conversions.

## Product Questions

| Question | Measurement |
| --- | --- |
| Are visitors discovering cards? | Sessions with `card_opened` or `card_page_view`, segmented by `interaction_source` and device |
| Is global search useful? | `search_submitted` to `search_results_viewed`, followed by `card_opened`; inspect zero-result rate |
| Are filters helping? | `filter_changed` followed by `card_opened`, segmented by `filter_name` |
| Is the filter drawer used? | Adoption: users with `filters_opened` ÷ collection page-view users. Success: `filters_modal_applied` ÷ (`filters_modal_applied` + `filters_modal_bounced`), with `close_method = show_results` as the clearest signal. Drawer vs chip row: `filter_changed` by `interaction_source`. Segment by device |
| How do collectors refine the collection? | `filters_opened` to `filters_modal_applied` vs `filters_modal_bounced`; facet breakdown via `filter_facet_*`; reset patterns via `filter_chip_removed` vs `filters_cleared` |
| Do guides drive discovery? | `guide_opened`, `guide_page_view`, and `guide_card_selected` followed by `card_opened` |
| Does the community contribute? | `suggestion_opened` to `suggestion_submitted`, with lookup errors and submission failures as diagnostics. Segment both by `interaction_source` to see which entry point (header pill, search results prompt, shared link) brings suggestions |
| Do creator links earn attention? | `coffee_clicked` and `studio_link_clicked` by page type |

Review a rolling 28-day window once the redesign has enough production traffic. Always segment primary journeys by device category and landing page.

## Verification Checklist

Use the production HTTPS site with GA4 DebugView, or begin a local preview session with `?analytics_debug=1` for an intentional test session. That opt-in persists for the browser tab so cross-page journeys can be verified.

1. Confirm ordinary local previews send no GA requests.
2. Confirm every event contains `page_type` and `analytics_version: redesign_v1`.
3. Submit header searches from home, collection, a guide, and a card page.
4. Confirm the destination collection emits `search_results_viewed` without exposing query text.
5. Exercise every filter, sorting, search-clear, and clear-all action.
6. Open cards from Recently Added, collection results, random sleeper, and a guide; verify `interaction_source`.
7. Open each suggestion entry point, test successful/no-result/error lookups, select/remove a card, and test successful and failed submissions.
8. Open guides from the directory and card lightbox field notes.
9. Click the footer coffee and Semi Serious Labs links.
10. Confirm guide pages do not emit `catalog_loaded`.

## Automatic GA4 Events

GA4 may also report `page_view`, `click`, `form_start`, `form_submit`, `scroll`, and other Enhanced Measurement events. These are broad signals and must not be treated as feature usage or conversions without further filtering.
