import { renderSiteHeader } from "./site-header.mjs";
import { renderSiteFooter } from "./site-footer.mjs";
import { renderCardDetailDialog } from "./card-detail-dialog.mjs";
import { getCardIdentity } from "./card-identity.mjs";

const SITE_URL = "https://www.sleepypokemon.com";
const INSTAGRAM_URL = "https://www.instagram.com/sprigatitosquad/";

// Cards named on the About page, by card-page slug. A missing slug fails the build so the page never links to nothing.
const FAVORITES = {
  comet: "oshawott-white-flare-105-86",
  linkcat: "mew-crown-zenith-galarian-gallery-gg10-gg70",
};
const ORIGIN_CARDS = [
  "sprigatito-paldea-evolved-196-193",
  "pikachu-lost-origin-trainer-gallery-tg05-tg30",
  "snorlax-scarlet-and-violet-black-star-promos-51-215",
];
const CURRENT_CHASE = "espeon-vmax-fusion-strike-270-264";
export const ABOUT_CARD_SLUGS = [...Object.values(FAVORITES), ...ORIGIN_CARDS, CURRENT_CHASE];

export function renderAboutPage(cardBySlug) {
  const card = (slug) => {
    const found = cardBySlug.get(slug);
    if (!found) throw new Error(`About page card "${slug}" is not in docs/published-cards.json.`);
    return found;
  };
  const chase = card(CURRENT_CHASE);
  const title = "About Sleepy Pokemon";
  const description = "Meet Comet and Linkcat, the mother-son collectors behind Sleepy Pokemon, and see how one napping Sprigatito became a hand-curated collection.";
  const canonicalUrl = `${SITE_URL}/about/`;
  const image = card(ORIGIN_CARDS[0]).imageLarge || `${SITE_URL}/assets/sleepy-pokemon.png`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: title,
    url: canonicalUrl,
    description,
  };

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeAttribute(description)}" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${canonicalUrl}" />
    <link rel="icon" href="../assets/favicon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="../assets/sleepy-pokemon.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Sleepy Pokemon Cards" />
    <meta property="og:title" content="${escapeAttribute(title)}" />
    <meta property="og:description" content="${escapeAttribute(description)}" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta property="og:image" content="${escapeAttribute(image)}" />
    <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>
    <script defer src="../analytics.js?v=4" data-page-type="about"></script>
    <link rel="stylesheet" href="../styles.css?v=4" />
    <link rel="stylesheet" href="../home-v3.css?v=20" />
    <link rel="stylesheet" href="../card-detail-v3.css?v=6" />
    <link rel="stylesheet" href="../about.css?v=2" />
  </head>
  <body data-app-mode="about" data-guide-path="cards.json" data-guides-path="../guides.json" data-site-root="../">
    <div class="app-shell about-shell">
      ${renderSiteHeader("../")}
      <main class="about-main">
        <section class="about-intro" aria-labelledby="aboutTitle">
          <p class="about-eyebrow">The collectors</p>
          <h1 id="aboutTitle">Who we are</h1>
          <p class="about-lede">We’re Comet and Linkcat, a mother-son duo in the Pacific Northwest. Pokemon has a way of filling our calendar: a tournament here, a card show there, a Pokemon GO walk that somehow takes all afternoon. We came for the games and the community, and stayed for the art, the friendships, and the fun of finding something new together.</p>
          <a class="about-instagram" href="${INSTAGRAM_URL}" target="_blank" rel="noopener noreferrer" data-analytics-event="navigation_clicked" data-analytics-source="about_page" data-analytics-destination="instagram">
            <span class="about-instagram-icon" aria-hidden="true">@</span>
            <span><small>Find us on Instagram</small><strong>@sprigatitosquad</strong></span>
            <span class="about-instagram-arrow" aria-hidden="true">↗</span>
          </a>
          <div class="about-people">
            <article class="about-person about-person-comet">
              <h2>Comet</h2>
              <p>She fell for Pokemon through the <em>Indigo League</em> anime and the <em>Red</em> and <em>Green</em> games. Collecting cards wasn’t possible back then, so getting to fill a binder with art she loves feels pretty special now. The best part? She gets to do it with Linkcat.</p>
${renderFavorite(card(FAVORITES.comet))}
            </article>
            <article class="about-person about-person-linkcat">
              <h2>Linkcat</h2>
              <p>Comet’s son and collecting partner. <em>Scarlet &amp; Violet</em> and <em>Legends: Arceus</em> drew him into Pokemon, and Sprigatito is still his all-time favorite. If a Pokemon question comes up, Linkcat is usually the one with the answer.</p>
${renderFavorite(card(FAVORITES.linkcat))}
            </article>
          </div>
        </section>

        <section class="about-section about-origin" aria-labelledby="aboutOriginTitle">
          <p class="about-eyebrow">How it started</p>
          <h2 id="aboutOriginTitle">One card became a collection</h2>
          <div class="about-copy">
            <p>It started innocently enough: we were hunting down every Sprigatito card when we stumbled upon the <em>Paldea Evolved</em> illustration rare, a little grass cat snoozing among the flowers. We were instantly smitten, and a new quest was born: find every Pokemon caught napping.</p>
            <p>Sleepy Pikachu from the <em>Lost Origin</em> Trainer Gallery was next, and then we realized we’d already been sitting on the Snorlax promo (fitting, honestly). We dug through our bulk for more dozers, went looking for a master list, and came up empty. So we made one!</p>
${renderCollectionStats([...cardBySlug.values()])}
            <p>Consider it our gift to fellow collectors who love a good Pokemon nap.</p>
            <p>Everything here is hand-curated and free to browse: no ads, paywalls, subscriptions, or sponsored placements.</p>
          </div>
          <div class="card-grid about-origin-cards">
${ORIGIN_CARDS.map((slug) => renderCardTile(card(slug))).join("\n")}
          </div>
        </section>

        <section class="about-section about-standard" aria-labelledby="aboutStandardTitle">
          <div class="about-standard-intro">
            <p class="about-eyebrow">Our sleepy standard</p>
            <h2 id="aboutStandardTitle">What counts as a sleepy card?</h2>
            <p>Every entry is reviewed by a person. The nap labels and notes are part of the curation, not a score from an automated database.</p>
          </div>
          <ol class="about-rules">
            <li><span class="about-rule-number" aria-hidden="true">01</span><div><h3>The nap is the main event</h3><p>A featured Pokemon is clearly asleep, curled up, snoring, or dozing off.</p></div></li>
            <li><span class="about-rule-number" aria-hidden="true">02</span><div><h3>Look a little closer</h3><p>A sleeping cameo can count too, even when the card’s main subject is awake. Sometimes the best nap is hiding in the corner.</p></div></li>
            <li><span class="about-rule-number" aria-hidden="true">03</span><div><h3>Sleep-adjacent, with a note</h3><p>Heavy eyelids, yawns, dreamlike art, and quiet post-adventure exhaustion may qualify. When sleep is ambiguous, we say so and explain why it still feels right.</p></div></li>
          </ol>
        </section>

        <section class="about-chase" aria-labelledby="aboutChaseTitle">
          <div class="about-chase-copy">
            <p class="about-eyebrow">The current chase</p>
            <h2 id="aboutChaseTitle">Most wanted sleepy card</h2>
            <p>${escapeHtml(chase.name)} from <em>${escapeHtml(chase.setName)}</em> is our current chase. The English version is out of reach at its current price, but we can’t wait to find a good copy of the art in another language.</p>
            <a class="about-text-link" href="../cards/${escapeAttribute(chase.slug)}/" ${cardLinkAnalytics(chase, "about_current_chase")}>${escapeHtml([chase.name, chase.setName, chase.number].filter(Boolean).join(" · "))} <span aria-hidden="true">→</span></a>
          </div>
          <a class="about-chase-art" href="../cards/${escapeAttribute(chase.slug)}/" aria-label="${escapeAttribute(`${chase.name} card page`)}" ${cardLinkAnalytics(chase, "about_current_chase_art")}>
            ${renderCardImage(chase)}
          </a>
        </section>

        <nav class="about-next" aria-label="Keep exploring">
          <a class="about-text-link" href="../collection/" data-analytics-event="navigation_clicked" data-analytics-source="about_page" data-analytics-destination="collection">Browse the collection <span aria-hidden="true">→</span></a>
          <a class="about-text-link" href="../guides/" data-analytics-event="navigation_clicked" data-analytics-source="about_page" data-analytics-destination="guides">Read the collector guides <span aria-hidden="true">→</span></a>
        </nav>
      </main>
${renderSiteFooter()}
    </div>
    ${renderCardDetailDialog()}
    <div class="toast hidden" id="toast" role="status" aria-live="polite"></div>
    <script src="../app.js?v=41"></script>
  </body>
</html>
`;
}

// Counted from the catalog at build time, so the line keeps up as cards are added.
function renderCollectionStats(cards) {
  const count = (key) => new Set(cards.map((card) => card[key]).filter(Boolean)).size;
  const years = cards.map((card) => String(card.setReleaseDate || "").slice(0, 4)).filter((year) => /^\d{4}$/.test(year)).sort();
  const napsByPokemon = new Map();
  cards.forEach((card) => card.pokemon && napsByPokemon.set(card.pokemon, (napsByPokemon.get(card.pokemon) || 0) + 1));
  const [leader, leaderNaps] = [...napsByPokemon].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || [];
  const facts = [
    `<a href="../collection/" data-analytics-event="navigation_clicked" data-analytics-source="about_page" data-analytics-destination="collection">${cards.length} sleepy cards</a>`,
    `${count("pokemon")} Pokemon`,
    `${count("setName")} sets`,
    years.length ? `${years[0]}–${years.at(-1)}` : "",
    leader ? `${escapeHtml(leader)} leads with ${leaderNaps} naps` : "",
  ].filter(Boolean);
  return `            <p class="about-stats"><strong>So far:</strong> ${facts.map((fact) => `<span>${fact}</span>`).join(" · ")}</p>`;
}

function renderFavorite(card) {
  return `              <a class="about-favorite" href="../cards/${escapeAttribute(card.slug)}/" ${cardLinkAnalytics(card, "about_favorite")}>
                ${renderCardImage(card)}
                <span>
                  <small>Current sleepy favorite</small>
                  <strong>${escapeHtml(card.name)}</strong>
                  <span>${escapeHtml([card.setName, card.number].filter(Boolean).join(" · "))}</span>
                </span>
              </a>`;
}

function renderCardTile(card) {
  return `            <a class="card-tile about-card-tile" href="../cards/${escapeAttribute(card.slug)}/" ${cardLinkAnalytics(card, "about_origin")}>
              <div class="card-image-frame">
                ${renderCardImage(card)}
              </div>
              <div class="card-body">
                <div class="card-title-row"><h3>${escapeHtml(card.name)}</h3></div>
                <p class="card-subtitle">${escapeHtml([card.setName, card.number, card.rarity].filter(Boolean).join(" · "))}</p>
              </div>
            </a>`;
}

function renderCardImage(card) {
  const image = card.imageSmall || card.imageLarge;
  return image
    ? `<img src="${escapeAttribute(image)}" alt="${escapeAttribute(`${card.name} card`)}" loading="lazy" decoding="async" />`
    : `<div class="image-fallback">${escapeHtml(card.name)}</div>`;
}

// app.js opens these links in the card lightbox and tracks card_opened with this source; the href stays for crawlers and new tabs.
function cardLinkAnalytics(card, source) {
  return `data-card-id="${escapeAttribute(getCardIdentity(card))}" data-lightbox-source="${source}"`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
