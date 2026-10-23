# ☾ Sleepy Pokémon Cards

[![Live Site](https://img.shields.io/badge/website-sleepypokemon.com-ffb7c5?style=flat-square)](https://www.sleepypokemon.com)
[![GitHub Pages](https://img.shields.io/badge/hosted%20on-GitHub%20Pages-4a4a5a?style=flat-square)](https://github.com/comet4940/sleepy-pokemon)
[![Zero Frameworks](https://img.shields.io/badge/stack-Vanilla%20HTML%2FCSS%2FJS-9ad1d4?style=flat-square)](#-technical-architecture)
[![Analytics Contract](https://img.shields.io/badge/analytics-GA4%20Contract-f4d35e?style=flat-square)](ANALYTICS.md)

A hand-curated collector’s catalog and editorial guide dedicated exclusively to Pokémon cards caught napping.

Live site: [**sleepypokemon.com**](https://www.sleepypokemon.com)

---

## ✦ About the Project

**Sleepy Pokémon Cards** is a cozy, human-curated archive celebrating the quietest, most peaceful artwork in the Pokémon Trading Card Game.

Unlike automated scrapers or speculative financial trackers, this project is built around curation, character, and binder aesthetics:

- **Art-First Curation**: Every card in the catalog is chosen by hand for its restful illustration, cozy environment, or subtle sleeping cameo.
- **Zero Ads or Spam**: No paywalls, no sponsored affiliate spam, no pop-up ads, and no algorithmically generated fluff.
- **Collector Context**: Real notes on why each card belongs, where the nap takes place, and how sleepy the subject really is.

---

## ✨ Key Features

- **Handmade Nap Moods**: Each card carries hand-picked moods for specific, visible things in the art, such as *Belly Up*, *Nap Watch* (awake Pokémon around the sleeper) or *Snow Naps*, plus a curator's note on why it belongs. A mood is only tagged when it truly shows; moods are optional and the full list lives in `scripts/moods.mjs`.
- **Interactive Browsing & Search**:
  - Search across Pokémon and card names, sets, numbers, rarity, artist, moods and the curator's note. Every word must match, accents don't matter ("pokemon go" finds *Pokémon GO*), and a no-results search offers *Show all sleepers*.
  - Filter by **Moods** (*Group Naps*, *Nap Watch*, *Dream Sequence*, *Cameo Sleepers*, *Sleepy Trainers*, *Food Coma*, *Belly Up*, *Face-Plant*, *Propped Up*, *Hug Buddy*, *Pokémon Pillow*, *Drool & Snore*, *Bedtime*, *Couch & Cushion*, *Study Break*, *Flower Beds*, *Treetop Naps*, *Water Naps*, *Beach Naps*, *Snow Naps*, *Autumn Leaves*, *Sunbeam Naps*, *Moonlit Naps*, *Town Naps*, *Handmade*).
  - A **filter drawer** (a bottom sheet on phones, a side drawer on desktop) with live counts on every option: moods, rarity groups (*Common*, *Uncommon*, *Rare & Holo*, *Illustration Rare*, *Ultra & Secret*, *Trainer Gallery*, *Promo*), searchable sets (newest first), language, price (*under $5* to *under $50*) and sort (shuffle, newest sets, price, set or Pokémon A–Z).
  - **Shareable views**: the collection URL carries every active filter and the search (e.g. `/collection/?mood=belly-up&rarity=promo&maxPrice=10`), so links, reloads and the browser's Back/Forward all show the same view.
- **Themed Collector Guides**: Editorial lists highlighting standout cards, cameos, and curated sub-themes (e.g. *Best Sleepy Pokemon Cards*, *The Sleepiest of Pikachus*, *Sleepy Cat Pokemon Cards*).
- **Set Pages**: `/sets/<set>/` for every set with 5 or more sleepy cards (built automatically as sets reach the threshold), each with a curator intro, the cards and their notes, and a link into the collection filtered to that set. `/sets/` lists them all, and card pages link to their set page. The threshold and intros live in [`docs/sets.json`](docs/sets.json).
- **Standalone Card Detail Pages**: Over 150 crawlable, standalone pages (`/cards/<slug>/`) with high-resolution imagery, release information, current market prices, and JSON-LD structured data for search engines.
- **Community Suggestions**: Integrated submission modal allowing visitors to suggest unlisted sleepy cards to the review queue.
- **Responsive & Accessible**: Optimized for mobile Safari (iOS WebKit) and Chrome Mobile (Android Blink), with full orientation-change resilience and WCAG-compliant touch targets (≥ 44×44px).

---

## 🏗️ Technical Architecture

The entire site is static and hosted on **GitHub Pages** directly from the [`docs/`](docs/) directory. There are zero production build steps, Node.js dependencies, or client-side runtime frameworks.

- **Frontend**: Vanilla HTML5, modern CSS3 (Custom Properties, Grid, Flexbox, responsive viewports), and standard ES modules (`docs/app.js`).
- **Data Source**: Canonical card entries are stored in [`docs/published-cards.json`](docs/published-cards.json) (every field and curation rule is documented in [`DATA-MODEL.md`](DATA-MODEL.md)), while editorial guides live in [`docs/guides.json`](docs/guides.json).
- **SEO & Schema**: Pre-rendered static HTML pages for every card and guide, complete with OpenGraph tags, Twitter Cards, and Schema.org `ItemPage` / `CollectionPage` JSON-LD.
- **Analytics Contract**: Privacy-conscious Google Analytics 4 telemetry adhering strictly to the documented schema in [`ANALYTICS.md`](ANALYTICS.md). Does not log search queries, user notes, or personal data.

---

## 📁 Repository Structure

```text
sleepy-pokemon/
├── docs/                        # Static website published to GitHub Pages
│   ├── index.html               # Homepage (Hero, freshly tucked in, guide preview)
│   ├── collection/              # Full catalog browsing & filter interface
│   ├── guides/                  # Themed collector guides directory & individual guide pages
│   ├── cards/                   # Crawlable static pages for each curated card
│   ├── assets/                  # Favicons, icons, and brand graphics
│   ├── app.js                   # Client-side filtering, search, modal & routing
│   ├── styles.css               # Global theme, typography, buttons & base layout
│   ├── home-v3.css              # Grid layout, collection controls & card tiles
│   ├── card-detail-v3.css       # Lightbox modal & standalone card page styling
│   ├── guides.css               # Editorial guide layouts & hero stacks
│   ├── published-cards.json     # Canonical catalog dataset
│   ├── guides.json              # Guide definitions & card slug references
│   ├── sets.json                # Set page threshold (minCards) & curator intros by set name
│   └── sitemap.xml              # Search engine sitemap
├── scripts/                     # Node / Deno automation scripts
│   ├── sync-seo-index.mjs       # Generates docs/cards/ pages & crawls indexes
│   ├── sync-guides.mjs          # Generates docs/guides/ pages & updates homepage
│   ├── refresh-prices.mjs       # Updates live card prices from Pokémon TCG APIs
│   ├── validate-analytics.mjs   # Verifies GA4 telemetry across all 156+ static pages
│   ├── card-identity.mjs        # Shared card ID used by guide pages and validation
│   ├── site-header.mjs          # Shared topbar header template
│   └── site-footer.mjs          # Shared site footer template
├── brand-kit/                   # Visual brand deck, logo assets, and design tokens
├── ANALYTICS.md                 # GA4 instrumentation and telemetry specification
├── DATA-MODEL.md                # Card fields, curation rules and how to add a card
└── README.md
```

---

## 🚀 Local Development

Because the site uses standard web standards and relative paths, you can run and test the frontend with any static HTTP server:

### Using Python:
```bash
# Serve the docs/ directory on port 8000
python3 -m http.server -d docs 8000
```

### Using Node / npx:
```bash
npx serve docs
```

### Using Deno:
```bash
deno run --allow-net --allow-read jsr:@std/http/file-server docs
```

Once running, open `http://localhost:8000` (or the port indicated) in your browser.

---

## 🛠️ Maintenance & Generator Scripts

All automation scripts are written in standard ES modules and can be executed with either `node` (v18+) or `deno run -A`:

### 1. Sync Card Pages (rebuilds everything)
Generates all individual `/cards/<slug>/index.html` pages from `published-cards.json` and updates the crawlable card indexes, then runs `sync-guides.mjs` below, so this one command rebuilds every generated page:
```bash
node scripts/sync-seo-index.mjs
```

### 2. Sync Guides, About Page & Sitemap
Compiles guide pages in `/guides/` from `docs/guides.json`, set pages in `/sets/` from `docs/sets.json`, the About page, the homepage guide directory, and `docs/sitemap.xml` (the only sitemap writer):
```bash
node scripts/sync-guides.mjs
```

Both generators share `scripts/build-helpers.mjs`: card page slugs, escaping, the page `<head>`, sitemap helpers, and `ASSET_VERSIONS`. To cache-bust a CSS or JS file, bump its number in `ASSET_VERSIONS` and run the generators; generated pages and the hand-written homepage and collection page all update.

### 3. Validate Analytics Contract
Ensures all static HTML pages (home, collection, card pages, and guides) strictly conform to the GA4 contract. It also loads `docs/app.js` in a Node sandbox to check that its card IDs match `scripts/card-identity.mjs` and that each checklist download sends the expected analytics event. It also checks every card in `published-cards.json` against the field table in `DATA-MODEL.md`:
```bash
node scripts/validate-analytics.mjs
```

### 4. Refresh Market Prices
Polls the Pokémon TCG API for recent market pricing updates (TCGPlayer / Cardmarket):
```bash
node scripts/refresh-prices.mjs
```

---

## 💌 Suggesting a Sleepy Card

Know a card that belongs in the sleepy stack?

1. **On the Website**: Click **"Suggest a sleepy card"** in the footer or homepage on [sleepypokemon.com](https://www.sleepypokemon.com).
2. **On GitHub**: Open an [Issue](https://github.com/comet4940/sleepy-pokemon/issues/new) labeled `new card` with the Pokémon name, set, number, and why you believe it qualifies.

### What qualifies as "Sleepy"?
- **Primary Nap**: The featured Pokémon is noticeably asleep, curled up, dozing off, or snoring.
- **Cameo / Background Nap**: Another Pokémon or human in the artwork is sound asleep (e.g. sleeping baby Stunky in Skuntank V's burrow, or sleeping Pidoves in Munna's tree).
- **Restful Atmosphere**: Artwork that clearly depicts naptime, dreaming, sleep-inducing attacks (like *Rest* or *Yawn*), or tranquil exhaustion.

---

## 🎨 Creative Direction & Palette

The visual identity uses a warm, cozy twilight palette inspired by bedroom lamps and dusk skies:

| Swatch | Name | Hex | Usage |
| :---: | :--- | :--- | :--- |
| ![#0e0e17](brand-kit/swatches/ink.png) | **Ink** | `#0e0e17` | Deep night background |
| ![#171724](brand-kit/swatches/night-surface.png) | **Night Surface** | `#171724` | Card panels, topbar & dialog surfaces |
| ![#fff7e8](brand-kit/swatches/cream.png) | **Cream** | `#fff7e8` | Primary text & headings |
| ![#b9b6c7](brand-kit/swatches/muted-cream.png) | **Muted Cream** | `#b9b6c7` | Secondary labels & metadata |
| ![#f36b9b](brand-kit/swatches/soft-pink.png) | **Soft Pink** | `#f36b9b` | Accent highlights & active chips |
| ![#f4d35e](brand-kit/swatches/candle-yellow.png) | **Candle Yellow** | `#f4d35e` | Stars, sparkles & action prompts |
| ![#b3c5ff](brand-kit/swatches/lavender.png) | **Lavender** | `#b3c5ff` | Brand lockup cards & guide accents |

Typography is paired with **Fredoka** for friendly, rounded headings and **Inter** for crisp, legible metadata. See [`brand-kit/`](brand-kit/) for the full creative direction deck.

---

## ☕ Creator & Credits

- Curated and maintained with ♥ by **Comet** at [Semi Serious Labs](https://semiseriousllc.com).
- Support the project on [Buy Me a Coffee](https://buymeacoffee.com/cometakira).
- **Disclaimer**: Pokémon and Pokémon character names are trademarks of Nintendo, Creatures Inc., and GAME FREAK Inc. Card artwork belongs to their respective illustrators and The Pokémon Company. Sleepy Pokémon Cards is an unofficial, non-commercial fan project created for card enthusiasts and collectors.
