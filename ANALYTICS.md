# Sleepy Pokemon Analytics

This document is the working contract for the site's Google Analytics 4 instrumentation. Update it when an event or parameter changes.

Measurement ID: `G-3HFVE8BEZH`

## Scope

Analytics is loaded by `docs/analytics.js` on three page types:

| Page type | Where it is used | Purpose |
| --- | --- | --- |
| `home` | The interactive card catalog | Measure discovery, search, filters, random browsing, and checklist use |
| `card` | Individual crawlable card pages | Measure SEO landing and card detail views |
| `guide` | Editorial guide pages | Measure guide discovery and clicks into card pages |

Every product event includes `page_type`. Events sent from the interactive homepage also use the page type `home`.

## Product Events

These are the events Sleepy Pokemon owns and should use for product decisions.

| Event | Trigger | Expected parameters |
| --- | --- | --- |
| `catalog_loaded` | Homepage catalog finishes loading | `page_type`, `card_count` (number) |
| `card_opened` | A card tile opens the homepage detail dialog | `page_type`, `card_name`, `card_pokemon`, `card_set`, `card_number`, `card_rarity`, `card_language`, `price_market` (number when available) |
| `filters_opened` | The Refine dialog opens | `page_type` |
| `filter_applied` | A Pokemon, set, rarity, language, or max-price filter changes | `page_type`, `filter_name`, `filter_value`, `result_count` (number) |
| `sort_changed` | The sort order changes | `page_type`, `filter_name` (`sort`), `filter_value`, `result_count` (number) |
| `filters_cleared` | All homepage filters are reset | `page_type`, `result_count` (number) |
| `search_used` | A non-empty search remains active for 700ms | `page_type`, `search_length` (number), `result_count` (number) |
| `checklist_downloaded` | The CSV checklist is downloaded | `page_type`, `card_count` (number) |
| `card_page_view` | A crawlable card page loads | `page_type`, `card_name`, `card_pokemon`, `card_set` |
| `guide_page_view` | A crawlable guide page loads | `page_type`, `guide_slug`, `guide_title` |
| `guide_card_clicked` | A card link is clicked from a guide | `page_type`, `link_url`, `card_name`, `card_pokemon`, `card_set`, `guide_slug` |
| `coffee_clicked` | Buy Me a Coffee link is clicked | `page_type`, `link_url` |
| `sleepy_card_submit_clicked` | Suggest a Sleepy Pokemon link is clicked | `page_type`, `link_url` |

### Parameter conventions

- `result_count` is the number of cards currently matching the active filters.
- `card_count` is the number of cards in the loaded catalog.
- `filter_name` is one of `pokemon`, `set`, `rarity`, `language`, `maxPrice`, or `sort`.
- An empty max-price filter is recorded as `filter_value: "none"`.
- `price_market` is omitted when no positive market price is available.
- `link_url` identifies the destination of an outbound or cross-page link.
- Search text itself is intentionally not sent. We send only `search_length` and `result_count`.

## Automatic GA4 Events

GA4 may also report automatic or Enhanced Measurement events such as:

- `page_view`
- `click`
- `form_start`
- `form_submit`
- `scroll`

These are useful context, but they are not substitutes for the product events above. The `click` and form events are especially broad and should not be treated as Sleepy Pokemon feature usage without additional filtering.

## V2 KPI Set

Use a rolling 28-day view once enough data has accumulated. Review weekly, but establish the first baseline before setting hard targets. Break every KPI down by device category, with mobile as the primary segment.

| KPI | Definition | Decision it supports |
| --- | --- | --- |
| Organic discovery | Google Search Console clicks to the homepage and `/cards/` URLs, with impressions and average position as context | Are SEO changes preserving discovery while the homepage evolves? |
| Homepage card discovery rate | Sessions with at least one `card_opened` divided by homepage sessions | Does the first screen help people start browsing? |
| Search usage rate | Sessions with `search_used` divided by homepage sessions | Is search discoverable and useful, or is it still hidden or unnecessary? |
| Card detail reach | Sessions with `card_page_view` or `card_opened`, reported separately, divided by total relevant sessions | Are people reaching card details from organic landing pages, guides, and the homepage? |
| Mobile discovery gap | Compare homepage card discovery rate and search usage rate for mobile versus desktop | Which mobile workflow should receive the next usability investment? |

### Supporting signals

Use these to explain a KPI change, not as standalone success measures:

- `filter_applied`, `sort_changed`, and `filters_cleared` show refinement behavior.
- `guide_card_clicked` shows whether editorial pages send people into the catalog.
- `checklist_downloaded` shows deeper collector intent.
- `catalog_loaded.card_count` and sitemap URL count are data-quality guardrails.
- `coffee_clicked` and `sleepy_card_submit_clicked` are creator/community signals, not primary V2 growth KPIs.

### Decision rules

- If organic discovery falls after a homepage change, pause further IA changes and inspect canonical URLs, crawlable links, titles, descriptions, and sitemap coverage.
- If homepage card discovery is low while search usage is low, improve first-screen browse affordances before adding more filters.
- If search usage is high but card discovery remains low, improve result presentation and empty-result recovery.
- If mobile trails desktop on both discovery and search, prioritize mobile layout and interaction work before adding features.
- If guide card clicks are strong but card detail reach is weak, inspect card-page load, linking, and page usefulness rather than changing the guide strategy.

## Reporting Setup

The following event-scoped custom dimensions are useful in GA4 Explorations:

- `page_type`
- `card_name`
- `card_pokemon`
- `card_set`
- `card_number`
- `card_rarity`
- `card_language`
- `guide_slug`
- `filter_name`
- `filter_value`

The following numeric parameters can be registered as custom metrics if we need them in reusable reports:

- `card_count`
- `result_count`
- `search_length`
- `price_market`

Do not register search text as a dimension because it is not collected by the site.

## Verification Checklist

Use the live HTTPS site and GA4 DebugView. Confirm:

1. Homepage load sends `catalog_loaded` with a numeric `card_count`.
2. Opening a card sends `card_opened` with card identity parameters.
3. Search sends `search_used` with `search_length` and `result_count`.
4. A direct card page sends `card_page_view`.
5. A direct guide page sends `guide_page_view`.
6. Clicking a guide card sends `guide_card_clicked`.
7. The measurement ID is `G-3HFVE8BEZH` and requests reach the GA4 collection endpoint.

