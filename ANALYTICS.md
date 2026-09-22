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
| `home` | Homepage, featured sleeper, recently added cards, and homepage suggestion prompt |
| `collection` | Search results, browse grid, filters, sorting, and collection suggestion prompt |
| `guides-index` | Collector guides directory |
| `guide` | Individual editorial guide |
| `card` | Individual crawlable card page |

## Discovery And Navigation

| Event | Trigger | Parameters |
| --- | --- | --- |
| `navigation_clicked` | A measured site navigation link is selected | `interaction_source`, `destination`, `destination_path` |
| `catalog_loaded` | A visible interactive catalog finishes loading | `catalog_surface`, `card_count` |
| `card_opened` | A card opens in the detail lightbox | card parameters, `interaction_source` |
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
| `filters_opened` | The More filters dialog opens | none beyond shared parameters |
| `filter_changed` | A mood, Pokemon, set, rarity, language, or price filter changes | `filter_name`, `filter_value`, `filter_action`, `result_count` |
| `sort_changed` | Collection order changes | `filter_name`, `filter_value`, `filter_action`, `result_count` |
| `filters_cleared` | All active collection filters are cleared | `active_filter_count`, `result_count` |

Search text is intentionally excluded. `query_length` is the only query-level parameter. A header search that navigates to the collection produces `search_submitted` on the source page and `search_results_viewed` on the destination page.

## Suggestions

| Event | Trigger | Parameters |
| --- | --- | --- |
| `suggestion_opened` | The suggestion dialog opens | `interaction_source`, `has_active_search`, `result_count` |
| `suggestion_lookup_completed` | An external card lookup returns or fails | `lookup_type`, `lookup_outcome`, `result_count` |
| `suggestion_card_selected` | A lookup result is selected | card parameters |
| `suggestion_card_removed` | A selected lookup result is removed | none beyond shared parameters |
| `suggestion_submitted` | Formspree accepts the suggestion | `selection_method`, `lookup_used`, `has_notes` |
| `suggestion_submit_failed` | Submission cannot be delivered | `selection_method`, `lookup_used`, `has_notes`, `error_type` |

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

- `checklist_scope`: `full_collection`, `filtered_collection`, `selected_cards`, or `guide`
- `card_count`
- `file_format`
- `interaction_source`

The collection download follows this shape, exporting either the full collection or the active filtered subset. Future binder or guide downloads will also share this schema.

## Shared Parameters

Card parameters:

- `card_name`
- `card_pokemon`
- `card_set`
- `card_number`
- `card_rarity`
- `card_language`
- `price_market` when available

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
- `guide_slug`
- `filter_name`
- `filter_value`
- `filter_action`
- `lookup_type`
- `lookup_outcome`
- `selection_method`
- `error_type`

Useful numeric custom metrics are `card_count`, `result_count`, `query_length`, `active_filter_count`, and `price_market`.

Mark `suggestion_submitted` and `checklist_downloaded` as GA4 key events (conversions representing contribution and collector intent). Routine browsing, search, and outbound links should remain diagnostic events rather than conversions.

## Product Questions

| Question | Measurement |
| --- | --- |
| Are visitors discovering cards? | Sessions with `card_opened` or `card_page_view`, segmented by `interaction_source` and device |
| Is global search useful? | `search_submitted` to `search_results_viewed`, followed by `card_opened`; inspect zero-result rate |
| Are filters helping? | `filter_changed` followed by `card_opened`, segmented by `filter_name` |
| Do guides drive discovery? | `guide_opened`, `guide_page_view`, and `guide_card_selected` followed by `card_opened` |
| Does the community contribute? | `suggestion_opened` to `suggestion_submitted`, with lookup errors and submission failures as diagnostics |
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
