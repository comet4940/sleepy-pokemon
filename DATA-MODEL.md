# Card Data Model

Every card on the site comes from one file: `data/cards.json`. It's the only card file to edit, and it isn't published. The generators (`scripts/sync-seo-index.mjs`, `scripts/sync-guides.mjs`) build card pages, guides, set pages, the About page and the sitemap from it.

They also write the card data browsers load: `docs/published-cards.json` (the homepage and collection) and a `cards.json` next to each guide, set and About page (just that page's cards). These copies carry only the fields `docs/app.js` reads, listed in `PUBLIC_CARD_FIELDS` in `scripts/build-helpers.mjs`. Everything else, such as `notes`, the TCGplayer IDs and image sources, stays in the repo. A new field stays out of the browser until it's added to that list; the validator fails if the list and what `app.js` reads ever differ, or if `docs/published-cards.json` was edited by hand.

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
| `pokemon` | Yes | The Pokémon (or trainer) the card is about. Used for the Pokémon A–Z sort and "Freshly added" variety | `Abra` |
| `setName` | Yes | Set name shown on the site and used by the set filter. One name per set (see [Rules](#rules)) | `Vending Machine Series 3` |
| `setSeries` | Yes | Era or series the set belongs to | `Sun & Moon`, `Vending Machine` |
| `setId` | No | Short set ID from the source API, or a made-up one for sets no API covers (`vending3-jp`) | `sm10`, `vending1-jp` |
| `number` | Yes | Card number as collectors list it | `158/214`, `SM41`, `58` |
| `rarity` | Yes | Rarity as printed. The filter drawer groups rarities (`RARITY_GROUPS` in `docs/app.js`); add new rarities to the right group (the validator fails on a rarity outside every group, which would otherwise get a pill of its own) | `Illustration Rare` |
| `language` | Yes | Card language | `English`, `Japanese`, `Simplified Chinese` |
| `artist` | Yes | Illustrator from the card's "Illus." line | `Tomokazu Komiya` |
| `imageSmall` | Yes | Grid image. A full URL for hosted images, or a site path (`/assets/cards/...`) for local files | `https://images.pokemontcg.io/sm10/158.png` |
| `imageLarge` | Yes | Detail-view image. May be the same as `imageSmall` | `https://images.pokemontcg.io/sm10/158_hires.png` |
| `imageSource` | No | Credit for images hosted by a site that isn't a card API | `PriceCharting`, `Scrydex`, `PokeBoon` |
| `imageSourceUrl` | No | Page the hosted image came from (pairs with `imageSource`) | `https://scrydex.com/pokemon/cards/...` |
| `moods` | Yes | Hand-picked moods from the fixed list in `scripts/moods.mjs`. Use `[]` for none; no duplicates | `["Food Coma", "Face-Plant"]` |
| `whyItBelongs` | Yes | The curator's short note on what's happening in the art. Shown as "Why it belongs" | `Dinner is still on the table, and Growlithe...` |
| `seoTitle` | No | Overrides the card page's `<title>` and social title, for the rare card the usual pattern gets wrong (see [Card page titles](#card-page-titles)). Leave it out otherwise | `Sleeping Snorlax & Eevee Card – Wizards Promos 49 \| Sleepy Pokemon` |
| `notes` | No | Internal provenance and sources: where the card came from, which suggestion or issue it was, where the details were checked. Not shown, searched or sent to browsers, but the repo is public, so keep anything private out | `Community submission via the Suggest a card form.` |
| `setReleaseDate` | No | Release date of the set, `YYYY/MM/DD`. Drives "Newest sets" sorting; cards without it sort last | `1998/11/24` |
| `apiId` | No | pokemontcg.io card ID. Part of the card's identity (`scripts/card-identity.mjs`); no longer used for prices | `smp-SM41` |
| `tcgdexId` | No | TCGdex card ID, for cards pokemontcg.io doesn't have | `sv09-120` |
| `scrydexId` | No | Scrydex card ID, for cards only Scrydex lists | `me55-131` |
| `tcgplayerProductId` | No | TCGplayer product ID, found once with `scripts/match-tcgplayer.mjs`. Links the card to the price refresh (see [Prices](#prices)) | `690478` |
| `tcgplayerGroupId` | No | TCGplayer set (group) ID of that product. The refresh downloads one price file per group | `24722` |
| `slug` | No | Pinned card page URL segment. Leave it out for new cards; set it when renaming (see [Rules](#rules)) | `komala-sun-and-moon-black-star-promos-sm41` |
| `priceType` | No | Which printing we price, in TCGplayer's words. Set by the matcher; see the printing rule in [Rules](#rules) | `Normal`, `Holofoil`, `Reverse Holofoil`, `1st Edition`, `Unlimited` |
| `createdAt` | Yes | When the card was added, ISO 8601. Drives "Freshly added" on the homepage | `2026-10-23T18:00:00.000Z` |
| `updatedAt` | Yes | When the card's data last changed, ISO 8601 | `2026-10-23T18:30:00.000Z` |

### Retired fields

The validator rejects any card that still has these:

- `sleepinessBasis`, `sleepLocation`, `sleepiness`: retired in #132; moods and `whyItBelongs` cover them.
- `priority`: retired in #144. It only fed the Curated sort, which was removed in #140.
- `priceLow`, `priceMid`, `priceHigh`: retired in #144. Never shown.
- `priceMarket`, `priceSource`, `priceUpdatedAt`: moved to `docs/prices.json` in #152 (see [Prices](#prices)), so the daily refresh changes one file instead of every page that shows a price.
- `suggestionIssue`: retired in #144. Record the suggestion in `notes` instead (e.g. "Suggested in GitHub issue #49.").

## Rules

- **Cards are never removed.** Once a card is in the catalog it stays. The sitemap relies on this: card counts on About, `/guides/` and `/sets/` are dated by when cards were added (`createdAt`), so a removal would change those pages without updating their dates.
- **Card page URLs never change.** A card's page lives at `cards/<slug>/`, where the slug is built from name, set name and number. When a set name or number changes, set `slug` to the card's current URL segment so the page stays where it is (e.g. the Vending Abra in #141, Komala in #143). This is enforced: `data/card-slugs.json` records every card page address ever published (`scripts/sync-seo-index.mjs` adds new ones and never removes any), and the validator fails if a recorded address no longer has a card. Visitors' binders (`docs/binder.js`, #119) are saved by these addresses too, so a lost address would also lose their marks.
- **One name per set.** A set has a single `setName` across all its cards: no colour or sheet suffixes like "(Blue)", and no two names for the same set. Duplicates show up as separate sets in the filter drawer.
- **Price the most accessible printing.** The site is a master list, not one binder, so `priceType` is the printing a collector can most easily find: the regular print (`Normal` or `Holofoil`), `Unlimited` over `1st Edition`, never a reverse holo, stamped or pattern variant unless that variant is the card.
- **Vending Machine cards use their Pokédex number.** They don't print a set number, so `number` is the Pokédex number as PriceCharting lists it (Snorlax `143`, Abra `63`, Growlithe `58`).
- **Images: hosted first.** Prefer a card API image (pokemontcg.io, TCGdex, Scrydex) or another stable host with `imageSource` credit. Store a file in `docs/assets/cards/` only when there's no hosted image or the local scan is clearly better. Name local files after the card, e.g. `growlithe-vending-machine-series-3-58.jpg`.
- **Prices come from the refresh**, into `docs/prices.json`. See [Prices](#prices).
- **Moods are a fixed list.** Add a new mood to `scripts/moods.mjs` before using it. A mood is only tagged when it truly shows in the art.

## Card page titles

Card pages get their `<title>` and social title from `buildCardTitle` in `scripts/sync-seo-index.mjs`, written for how people search for a single card ("sleepy charizard", "sleepy umbreon card"):

| The card… | Title |
| --- | --- |
| shows its own Pokémon asleep (most cards) | Sleepy Snorlax Card – Vivid Voltage 131/185 \| Sleepy Pokemon |
| is a trainer card whose `pokemon` is the sleeper | Lillie Card with a Sleeping Cosmog – Sun & Moon Promos 080/SM-P |
| has the *Cameo Sleepers* mood (its own Pokémon is awake) | Lapras Card with a Sleeping Cameo – ME: 30th Celebration 131/128 |

Gallery set names drop the part the number already shows ("Lost Origin TG05/TG30"), and "\| Sleepy Pokemon" is added only while the title stays short. When a card doesn't fit (Wizards Promo 49: Snorlax *and* the Eevee cameo are asleep), give it a `seoTitle`.

The meta description is the card and its set, then the opening of `whyItBelongs`: whole sentences until it reaches about 100 characters and has mentioned the nap (or reaches about 150), trimmed at a word break with "…" past 160 characters. A better note makes a better search snippet.

## Writing "Why it belongs"

`whyItBelongs` is the curator's note on a card page and in the lightbox. Each one should read like it was written for that card, not filled into a template.

**Describe only what's in the art.** Look at the full-size image (`imageLarge`), not the thumbnail, before writing. Small details are easy to get wrong: who is asleep and who is awake, where they are (a ledge or the ground, a bed or a rug, indoors or out), and how they're lying (face down, or cheek on an arm). Leave out anything you can't see, and avoid guessing at what's going on outside the frame. Name trainers when you know who they are (Ace Trainer Dara, Professor Kukui, Drayton); search also finds them by name.

**Mix up the shape.** One pattern repeated across the catalog makes every note read the same. Avoid these in particular:
- the same opening words: over a hundred older notes start with "Cozy nap" or "Out cold";
- the default formula "[Pokémon] has [settled/flopped/stretched out] on [place], eyes shut… [Artist]'s [style] makes/turns…".

Rotate between these six patterns, and mix within a note when it helps:

| Pattern | Shape | Example |
| --- | --- | --- |
| Question | Opens with a question the art answers | "Who needs a tent when your dragon is asleep? Ace Trainer Dara sits tucked in the curl of Druddigon's body…" (Druddigon TG09) |
| Scene first | A few quick details of the setting, then the sleeper | "Muddy paw prints on the floorboards, a cloth in Professor Kukui's hand, and the culprit belly up on the rug…" (Rockruff TG07) |
| Other character first | Starts with the awake trainer or Pokémon, then the sleeper | "Two Togedemaru, one nap. The one by the old tree has dozed off… while its friend peeks over the grass…" (Togedemaru 104/94) |
| Look closer | Points the eye to a detail that's easy to miss | "In a cave full of flustered, squabbling Gible, one sneaky little guy at the top center has quietly slipped away for a nap." (Gible 94/113) |
| Lore contrast | What the Pokédex or flavor text says, against what the art shows | "The Winged King, said to have split the land with its bare fists, is taking a nap." (Koraidon SVP 14) |
| One-liner | A single punchy line; best when the art speaks for itself | "Sleeping like it means it." (Togetic 137/214) |

Guide reasons (`reason` in `docs/guides.json`) follow the same idea. They say why the card fits that guide, and shouldn't repeat the card's own note word for word.

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
- **Manual prices.** For a card TCGplayer doesn't sell or has no sales for, and for every Japanese and Chinese card (they stay off the TCGplayer refresh by choice, see #163), add an entry with `"source": "Manual"` and today's date. Manual prices come from [PriceCharting](https://www.pricecharting.com) (from Nov 2026; the first ones in #162 were copied from TCGplayer Japan). The refresh leaves it alone, and `match-tcgplayer.mjs` skips the card, so it never gets a `tcgplayerProductId`. The site shows it as the curator's estimate.
- **Manual prices are re-checked monthly.** On the 1st of each month `manual-prices-reminder.yml` opens a **"Check curator prices (Mon YYYY)"** issue listing every Manual price, oldest first, with its age (`scripts/manual-prices-report.mjs`); ones checked in the last 7 days are marked *fresh*. Reply with new prices or "unchanged": either way each entry gets the new price and today's `updatedAt`, so "as of" stays current. Close the issue when done. No reminder opens while the previous one is still open, and it can be run by hand from the Actions tab.
- **Renaming a card changes its identity.** The refresh moves TCGplayer prices to the new key on its next run; move a `Manual` entry by hand (the validator flags entries that match no card).

## Guides

Guides live in `docs/guides.json`: each one has a `slug`, `title`, `eyebrow`, `description`, `metaDescription`, `updatedAt` and its `cards` (each a card `slug` and the curator's `reason`).

- **`seoTitle` (optional)** is the page's whole `<title>` and social title, written in the words people search with ("Sleeping Pikachu Cards…"). Without it, the title is `{title} | Sleepy Pokemon Cards`. The page heading, guide lists and analytics (`guide_title`) always use `title`, so a playful title can stay on the page. Search Console shows people type "sleeping" more than "sleepy", so prefer "sleeping" in `seoTitle` and `metaDescription` where it fits. Keep `seoTitle` under about 60 characters.

- **Bump `updatedAt` whenever a guide changes**: cards added, removed or reordered, a reason rewritten, or its title or descriptions edited. Use an ISO 8601 timestamp, like a card's `updatedAt`.
- Unlike the catalog, guides do lose cards, and nothing else records that. The sitemap dates a guide page by the newer of `updatedAt` and its cards' own changes, and the homepage and `/guides/` by the newest guide `updatedAt`. The validator checks every guide has one.

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

- **The rotation runs itself.** `featured-card.yml` runs `scripts/rotate-featured.mjs` every Sunday night (05:17 UTC Monday, with a second try at 09:17 UTC in case GitHub drops the first), regenerates the homepage and deploys. When `current` runs out it switches to `upcoming`; with nothing upcoming it loops back to the first card.
- **A reminder comes in time.** With three weeks left in the batch and nothing upcoming, the workflow opens a GitHub issue asking for the next batch.
- **Adding the next batch:** put the card slugs (the `cards/<slug>/` part of a card page URL) in `upcoming.cards`. To replace the list early instead, set `current` to the new cards with `startsOn` set to the coming Sunday.
- The validator checks every slug is a published card and `startsOn` is a Sunday.

## Adding a card

1. **Check it isn't already listed**: search `data/cards.json` for the Pokémon, set and number.
2. **Collect the details** from the card itself and a source like pokemontcg.io, TCGdex or PriceCharting: name, set, number, rarity, language, artist, release date, image.
3. **Write the curation**: pick moods, write `whyItBelongs` (see [Writing "Why it belongs"](#writing-why-it-belongs)), and note the source in `notes` (e.g. "Community submission via the Suggest a card form.").
4. **Add the entry** at the top of `cards` in `data/cards.json`, with `createdAt` and `updatedAt` set to now.
5. **Price it.** Japanese and Chinese cards get a `Manual` price in `docs/prices.json` (see [Prices](#prices)). English cards are linked to TCGplayer: run `node scripts/match-tcgplayer.mjs`, check the match in its report (product, printing), then run it again with `--write`. If the card's set has a different name on TCGplayer, add it to `SET_ALIASES` in the script.
6. **Regenerate and check**:
   ```bash
   node scripts/sync-seo-index.mjs
   node scripts/sync-guides.mjs
   node scripts/validate-analytics.mjs
   ```
7. **Open a PR** with the regenerated pages; it goes live once merged. The next price refresh fills in the price.
