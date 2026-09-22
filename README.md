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

- **Handmade Nap Taxonomy**: Each card features custom curation metadata:
  - **Nap Classification**: *Cozy nap*, *Group nap*, *Out cold*, *Accidental nap*, and *Questionably sleeping 😂*.
  - **Sleep Location**: *Grass*, *Bed*, *Tree*, *Cave*, *Water*, *Another Pokémon*, and *Literally wherever*.
  - **Sleepiness Meter**: Rated on a scale of 1 to 5 Zs (*Drowsy* through *Medically unavailable*).
- **Interactive Browsing & Search**:
  - Live search across Pokémon names, card titles, set names, and card numbers.
  - Filter by **Moods** (*Deep Sleepers*, *Outdoor Naps*, *Sleepover Club*, *Tiny Tuck-Ins*, *Cozy Corners*, *Dream Sequence*, *Food Coma*, *Blink-and-you'll-miss-it*).
  - Dynamic sorting by market price, set release date, card name, and sleepiness level.
  - Price ceiling slider to help collectors find budget-friendly binder picks.
- **Themed Collector Guides**: Editorial lists highlighting standout cards, cameos, and curated sub-themes (e.g. *Best Sleepy Pokemon Cards*, *The Sleepiest of Pikachus*, *Sleepy Cat Pokemon Cards*).
- **Standalone Card Detail Pages**: Over 150 crawlable, standalone pages (`/cards/<slug>/`) with high-resolution imagery, release information, current market prices, and JSON-LD structured data for search engines.
- **Community Suggestions**: Integrated submission modal allowing visitors to suggest unlisted sleepy cards to the review queue.
- **Responsive & Accessible**: Optimized for mobile Safari (iOS WebKit) and Chrome Mobile (Android Blink), with full orientation-change resilience and WCAG-compliant touch targets (≥ 44×44px).

---

## 🏗️ Technical Architecture

The entire site is static and hosted on **GitHub Pages** directly from the [`docs/`](docs/) directory. There are zero production build steps, Node.js dependencies, or client-side runtime frameworks.

- **Frontend**: Vanilla HTML5, modern CSS3 (Custom Properties, Grid, Flexbox, responsive viewports), and standard ES modules (`docs/app.js`).
- **Data Source**: Canonical card entries are stored in [`docs/published-cards.json`](docs/published-cards.json), while editorial guides live in [`docs/guides.json`](docs/guides.json).
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
│   └── sitemap.xml              # Search engine sitemap
├── scripts/                     # Node / Deno automation scripts
│   ├── sync-seo-index.mjs       # Generates docs/cards/ pages & crawls indexes
│   ├── sync-guides.mjs          # Generates docs/guides/ pages & updates homepage
│   ├── refresh-prices.mjs       # Updates live card prices from Pokémon TCG APIs
│   ├── validate-analytics.mjs   # Verifies GA4 telemetry across all 156+ static pages
│   ├── site-header.mjs          # Shared topbar header template
│   └── site-footer.mjs          # Shared site footer template
├── brand-kit/                   # Visual brand deck, logo assets, and design tokens
├── ANALYTICS.md                 # GA4 instrumentation and telemetry specification
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

### 1. Sync SEO Card Pages & Sitemap
Generates all individual `/cards/<slug>/index.html` pages from `published-cards.json`, updates crawlable card indexes, and writes `docs/sitemap.xml`:
```bash
node scripts/sync-seo-index.mjs
```

### 2. Sync Editorial Guides
Compiles guide pages in `/guides/` based on `docs/guides.json` and updates the homepage guide directory:
```bash
node scripts/sync-guides.mjs
```

### 3. Validate Analytics Contract
Ensures all static HTML pages (home, collection, card pages, and guides) strictly conform to the GA4 contract:
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
| :--- | :--- | :--- | :--- |
| ![#0e0e17](https://via.placeholder.com/15/0e0e17/000000?text=+) | **Ink** | `#0e0e17` | Deep night background |
| ![#171724](https://via.placeholder.com/15/171724/000000?text=+) | **Night Surface** | `#171724` | Card panels, topbar & dialog surfaces |
| ![#fff7e8](https://via.placeholder.com/15/fff7e8/000000?text=+) | **Cream** | `#fff7e8` | Primary text & headings |
| ![#b9b6c7](https://via.placeholder.com/15/b9b6c7/000000?text=+) | **Muted Cream** | `#b9b6c7` | Secondary labels & metadata |
| ![#f36b9b](https://via.placeholder.com/15/f36b9b/000000?text=+) | **Soft Pink** | `#f36b9b` | Accent highlights & active chips |
| ![#f4d35e](https://via.placeholder.com/15/f4d35e/000000?text=+) | **Candle Yellow** | `#f4d35e` | Stars, sparkles & action prompts |
| ![#b3c5ff](https://via.placeholder.com/15/b3c5ff/000000?text=+) | **Lavender** | `#b3c5ff` | Brand lockup cards & guide accents |

Typography is paired with **Fredoka** for friendly, rounded headings and **Inter** for crisp, legible metadata. See [`brand-kit/`](brand-kit/) for the full creative direction deck.

---

## ☕ Creator & Credits

- Curated and maintained with ♥ by **Comet** at [Semi Serious Labs](https://semiseriousllc.com).
- Support the project on [Buy Me a Coffee](https://buymeacoffee.com/cometakira).
- **Disclaimer**: Pokémon and Pokémon character names are trademarks of Nintendo, Creatures Inc., and GAME FREAK Inc. Card artwork belongs to their respective illustrators and The Pokémon Company. Sleepy Pokémon Cards is an unofficial, non-commercial fan project created for card enthusiasts and collectors.
