# Card Data Model

Every card on the site comes from one file: `docs/published-cards.json`. The generators (`scripts/sync-seo-index.mjs`, `scripts/sync-guides.mjs`) build card pages, guides, the About page and the sitemap from it, and `docs/app.js` loads it in the browser for the collection, homepage and lightbox.

`node scripts/validate-analytics.mjs` checks the file against this document: a card may only use the fields listed under [Card fields](#card-fields), and fields marked **Required** must be non-empty. To add a field, document it here first.

## File shape

```json
{
  "version": 1,
  "exportedAt": "2026-10-22T17:19:29.763Z",
  "cards": [ { ...card }, ... ]
}
```

| Key | Meaning |
| --- | --- |
| `version` | File format version. Currently `1` |
| `exportedAt` | When the card list was last exported. Informational |
| `cards` | The card list. New cards go at the top |

The file is written with 2-space indentation, unescaped Unicode and a trailing newline. Keep that formatting so diffs stay small.

## Card fields

<!-- The validator reads this table: one row per field, first column the field name in backticks, second column Yes or No. -->

| Field | Required | Meaning | Example |
| --- | --- | --- | --- |
| `name` | Yes | Card name as printed, including owner prefixes | `Sabrina's Abra`, `Growlithe` |
| `pokemon` | Yes | The Pokémon (or trainer) the card is about. Used for the Pokémon A–Z sort and "Freshly tucked in" variety | `Abra` |
| `setName` | Yes | Set name shown on the site and used by the set filter. One name per set (see [Rules](#rules)) | `Vending Machine Series 3` |
| `setSeries` | Yes | Era or series the set belongs to | `Sun & Moon`, `Vending Machine` |
| `setId` | No | Short set ID from the source API, or a made-up one for sets no API covers (`vending3-jp`) | `sm10`, `vending1-jp` |
| `number` | Yes | Card number as collectors list it | `158/214`, `SM41`, `58` |
| `rarity` | Yes | Rarity as printed. The filter drawer groups rarities (`RARITY_GROUPS` in `docs/app.js`); a rarity not in a group gets its own pill, so add new rarities to the right group | `Illustration Rare` |
| `language` | Yes | Card language | `English`, `Japanese`, `Simplified Chinese` |
| `artist` | Yes | Illustrator from the card's "Illus." line | `Tomokazu Komiya` |
| `imageSmall` | Yes | Grid image. A full URL for hosted images, or a site path (`/assets/cards/...`) for local files | `https://images.pokemontcg.io/sm10/158.png` |
| `imageLarge` | Yes | Detail-view image. May be the same as `imageSmall` | `https://images.pokemontcg.io/sm10/158_hires.png` |
| `imageSource` | No | Credit for images hosted by a site that isn't a card API | `PriceCharting`, `Scrydex`, `PokeBoon` |
| `imageSourceUrl` | No | Page the hosted image came from (pairs with `imageSource`) | `https://scrydex.com/pokemon/cards/...` |
| `moods` | Yes | Hand-picked moods from the fixed list in `scripts/moods.mjs`. Use `[]` for none; no duplicates | `["Food Coma", "Face-Plant"]` |
| `whyItBelongs` | Yes | The curator's short note on what's happening in the art. Shown as "Why it belongs" | `Dinner is still on the table, and Growlithe...` |
| `notes` | No | Internal provenance and sources: where the card came from, which suggestion or issue it was, where the details were checked. Not shown, searched or used on the site, but the file is public, so keep anything private out | `Community submission via the Suggest a card form.` |
| `setReleaseDate` | No | Release date of the set, `YYYY/MM/DD`. Drives "Newest sets" sorting; cards without it sort last | `1998/11/24` |
| `apiId` | No | pokemontcg.io card ID. Part of the card's identity (`scripts/card-identity.mjs`); no longer used for prices | `smp-SM41` |
| `tcgdexId` | No | TCGdex card ID, for cards pokemontcg.io doesn't have | `sv09-120` |
| `scrydexId` | No | Scrydex card ID, for cards only Scrydex lists | `me55-131` |
| `tcgplayerProductId` | No | TCGplayer product ID, found once with `scripts/match-tcgplayer.mjs`. Links the card to the price refresh (see [Prices](#prices)) | `690478` |
| `tcgplayerGroupId` | No | TCGplayer set (group) ID of that product. The refresh downloads one price file per group | `24722` |
| `slug` | No | Pinned card page URL segment. Leave it out for new cards; set it when renaming (see [Rules](#rules)) | `komala-sun-and-moon-black-star-promos-sm41` |
| `priceType` | No | Which printing we price, in TCGplayer's words. Set by the matcher; see the printing rule in [Rules](#rules) | `Normal`, `Holofoil`, `Reverse Holofoil`, `1st Edition`, `Unlimited` |
| `createdAt` | Yes | When the card was added, ISO 8601. Drives "Freshly tucked in" on the homepage | `2026-10-23T18:00:00.000Z` |
| `updatedAt` | Yes | When the card's data last changed, ISO 8601 | `2026-10-23T18:30:00.000Z` |

### Retired fields

The validator rejects any card that still has these:

- `sleepinessBasis`, `sleepLocation`, `sleepiness`: retired in #132; moods and `whyItBelongs` cover them.
- `priority`: retired in #144. It only fed the Curated sort, which was removed in #140.
- `priceLow`, `priceMid`, `priceHigh`: retired in #144. Never shown.
- `priceMarket`, `priceSource`, `priceUpdatedAt`: moved to `docs/prices.json` in #152 (see [Prices](#prices)), so the daily refresh changes one file instead of every page that shows a price.
- `suggestionIssue`: retired in #144. Record the suggestion in `notes` instead (e.g. "Suggested in GitHub issue #49.").

## Rules

- **Card page URLs never change.** A card's page lives at `cards/<slug>/`, where the slug is built from name, set name and number. When a set name or number changes, set `slug` to the card's current URL segment so the page stays where it is (e.g. the Vending Abra in #141, Komala in #143).
- **One name per set.** A set has a single `setName` across all its cards: no colour or sheet suffixes like "(Blue)", and no two names for the same set. Duplicates show up as separate sets in the filter drawer.
- **Price the most accessible printing.** The site is a master list, not one binder, so `priceType` is the printing a collector can most easily find: the regular print (`Normal` or `Holofoil`), `Unlimited` over `1st Edition`, never a reverse holo, stamped or pattern variant unless that variant is the card.
- **Vending Machine cards use their Pokédex number.** They don't print a set number, so `number` is the Pokédex number as PriceCharting lists it (Snorlax `143`, Abra `63`, Growlithe `58`).
- **Images: hosted first.** Prefer a card API image (pokemontcg.io, TCGdex, Scrydex) or another stable host with `imageSource` credit. Store a file in `docs/assets/cards/` only when there's no hosted image or the local scan is clearly better. Name local files after the card, e.g. `growlithe-vending-machine-series-3-58.jpg`.
- **Prices come from the refresh**, into `docs/prices.json`. See [Prices](#prices).
- **Moods are a fixed list.** Add a new mood to `scripts/moods.mjs` before using it. A mood is only tagged when it truly shows in the art.

## Prices

Market prices live in their own file, `docs/prices.json`, not in the cards or the pages:

```json
{
  "refreshedAt": "2026-10-24T21:35:10.612Z",
  "dataUpdatedAt": "2026-10-24T20:06:07.000Z",
  "prices": {
    "sm10-158::English::Unbroken Bonds::158/214::Snorlax": { "market": 83.33, "source": "TCGplayer", "updatedAt": "2026/10/24" }
  }
}
```

| Key | Meaning |
| --- | --- |
| `refreshedAt` | When the refresh last ran |
| `dataUpdatedAt` | TCGCSV's `last-updated.txt` timestamp from the last clean refresh. The refresh skips the day when it hasn't changed |
| `prices` | One entry per priced card, keyed by its card identity (`scripts/card-identity.mjs`: `apiId`, `tcgdexId`, language, set, number and name joined with `::`) |
| `market` | Market price in USD. For `TCGplayer` it's TCGplayer's market price, based on recent sales; a lone listing's asking price never counts |
| `source` | `TCGplayer` (written by the refresh) or `Manual` (the curator's estimate, for cards TCGplayer doesn't sell) |
| `updatedAt` | When the price was last confirmed, `YYYY/MM/DD` |

- **The refresh writes it.** Once a day, `scripts/refresh-prices.mjs` (run by `refresh-prices.yml` at 21:33 UTC) reads TCGplayer market prices from [TCGCSV](https://tcgcsv.com) for every card with a `tcgplayerProductId`, using the printing in `priceType`. It follows TCGCSV's [usage guidelines](https://tcgcsv.com/docs#usage-guidelines): it checks `last-updated.txt` first, makes one request per set, identifies itself and pauses between requests. When a set can't be fetched or a card has no market price, the card keeps its last price; after 30 days without confirmation the price is removed.
- **Pages fill prices in the browser.** Card, guide and set pages carry an empty `data-price-for` slot that `docs/prices.js` fills; the lightbox, price filters and price sorting read the same file. A refresh regenerates no pages.
- **Manual prices.** For a card TCGplayer doesn't sell, add an entry with `"source": "Manual"` and today's date. The refresh leaves it alone; re-check it every few months. The site shows it as the curator's estimate.
- **Renaming a card changes its identity.** The refresh moves TCGplayer prices to the new key on its next run; move a `Manual` entry by hand (the validator flags entries that match no card).

## Featured sleeper

The homepage's "Featured sleeper" changes every Sunday night (Pacific) from the curator's own picks in `docs/featured.json`:

```json
{
  "showing": "meowth-me-30th-celebration-144-128",
  "current": { "startsOn": "2026-10-25", "cards": ["meowth-me-30th-celebration-144-128", "mew-crown-zenith-galarian-gallery-gg10-gg70"] },
  "upcoming": null,
  "history": [{ "week": "2026-10-25", "card": "meowth-me-30th-celebration-144-128" }]
}
```

| Key | Meaning |
| --- | --- |
| `current` | The batch being shown: card slugs in order, one per week, starting the Sunday `startsOn` |
| `upcoming` | The next batch (`{ "cards": [...] }`), or `null`. It starts the Sunday after `current` runs out |
| `showing` | The card on the homepage now. Written by the rotation, not by hand |
| `history` | Every week's featured card (`week` is the Sunday it went up), newest last. A record to look back on |

- **The rotation runs itself.** `featured-card.yml` runs `scripts/rotate-featured.mjs` every Sunday night (05:00 UTC Monday), regenerates the homepage and deploys. When `current` runs out it switches to `upcoming`; with nothing upcoming it loops back to the first card.
- **A reminder comes in time.** With three weeks left in the batch and nothing upcoming, the workflow opens a GitHub issue asking for the next batch.
- **Adding the next batch:** put the card slugs (the `cards/<slug>/` part of a card page URL) in `upcoming.cards`. To replace the list early instead, set `current` to the new cards with `startsOn` set to the coming Sunday.
- The validator checks every slug is a published card and `startsOn` is a Sunday.

## Adding a card

1. **Check it isn't already listed**: search `published-cards.json` for the Pokémon, set and number.
2. **Collect the details** from the card itself and a source like pokemontcg.io, TCGdex or PriceCharting: name, set, number, rarity, language, artist, release date, image.
3. **Write the curation**: pick moods, write `whyItBelongs`, and note the source in `notes` (e.g. "Community submission via the Suggest a card form.").
4. **Add the entry** at the top of `cards`, with `createdAt` and `updatedAt` set to now.
5. **Link it to TCGplayer** (English cards): run `node scripts/match-tcgplayer.mjs`, check the match in its report (product, printing), then run it again with `--write`. If the card's set has a different name on TCGplayer, add it to `SET_ALIASES` in the script.
6. **Regenerate and check**:
   ```bash
   node scripts/sync-seo-index.mjs
   node scripts/sync-guides.mjs
   node scripts/validate-analytics.mjs
   ```
7. **Open a PR** with the regenerated pages; it goes live once merged. The next price refresh fills in the price.
