import { renderSiteHeader } from "./site-header.mjs";
import { INSTAGRAM_HANDLE, INSTAGRAM_URL, renderSiteFooter } from "./site-footer.mjs";
import { renderCardDetailDialog } from "./card-detail-dialog.mjs";
import { getCardIdentity } from "./card-identity.mjs";
import { SITE_URL, assetUrl, escapeAttribute, escapeHtml, renderHead } from "./build-helpers.mjs";

// "Contact Comet" (#209): its own Formspree form, separate from Suggest a card's, so the two inboxes stay apart.
export const CONTACT_ENDPOINT = "https://formspree.io/f/mgaappeg";
const ENVELOPE_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M4 7.5l8 6 8-6" /></svg>`;

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
    if (!found) throw new Error(`About page card "${slug}" is not in data/cards.json.`);
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
${renderHead({
  root: "../",
  title,
  description,
  canonicalUrl,
  image,
  jsonLd,
  pageType: "about",
  stylesheets: ["styles.css", "home-v3.css", "card-detail-v3.css", "about.css", "site-chrome.css"],
})}
  </head>
  <body data-app-mode="about" data-guide-path="cards.json" data-site-root="../">
    <div class="app-shell about-shell">
      ${renderSiteHeader("../")}
      <main class="about-main">
        <section class="about-intro" aria-labelledby="aboutTitle">
          <p class="about-eyebrow">The collectors</p>
          <h1 id="aboutTitle">Who we are</h1>
          <p class="about-lede">We’re Comet and Linkcat, a mother-son duo in the Pacific Northwest. Pokemon has a way of filling our calendar: a tournament here, a card show there, a Pokemon GO walk that somehow takes all afternoon. We came for the games and the community, and stayed for the art, the friendships, and the fun of finding something new together.</p>
          <a class="about-instagram" href="${INSTAGRAM_URL}" target="_blank" rel="noopener noreferrer" data-analytics-event="navigation_clicked" data-analytics-source="about_page" data-analytics-destination="instagram">
            <span class="about-instagram-icon" aria-hidden="true">@</span>
            <span><small>Find us on Instagram</small><strong>@${INSTAGRAM_HANDLE}</strong></span>
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

        <section class="about-section about-standard" id="wishlist" aria-labelledby="aboutWishlistTitle">
          <div class="about-standard-intro">
            <p class="about-eyebrow">Your wishlist</p>
            <h2 id="aboutWishlistTitle">How your wishlist works</h2>
            <p>No account, no sign-up: it lives in your browser.</p>
          </div>
          <ol class="about-rules">
            <li><span class="about-rule-number" aria-hidden="true">01</span><div><h3>Tap the star</h3><p>See a sleepy card you love? Tap the star next to its name, or <em>Add to wishlist</em> on its page. Its frame turns into a starry night sky. Tap again to take it off.</p></div></li>
            <li><span class="about-rule-number" aria-hidden="true">02</span><div><h3>Find it in the header</h3><p><em>Wishlist</em> shows just your cards. Filter them like the rest of the collection, then download the list, with prices, as a checklist.</p></div></li>
            <li><span class="about-rule-number" aria-hidden="true">03</span><div><h3>Saved on this device</h3><p>Your wishlist stays in this browser. Which cards you wish for is never sent anywhere, so it doesn't follow you to another phone or computer, and clearing this site's data in your browser erases it.</p></div></li>
          </ol>
        </section>

        <section class="about-chase" aria-labelledby="aboutChaseTitle">
          <div class="about-chase-copy">
            <p class="about-eyebrow">The current chase</p>
            <h2 id="aboutChaseTitle">Most wanted sleepy card</h2>
            <p>${escapeHtml(chase.name)} from <em>${escapeHtml(chase.setName)}</em> is our current chase. The English version is out of reach at its current price, but we can’t wait to find a good copy of the art in another language.</p>
            <a class="about-text-link" href="../cards/${escapeAttribute(chase.slug)}/" ${cardLinkAnalytics(chase, "about_current_chase", { isCardDisplay: false })}>${escapeHtml([chase.name, chase.setName, chase.number].filter(Boolean).join(" · "))} <span aria-hidden="true">→</span></a>
          </div>
          <a class="about-chase-art" href="../cards/${escapeAttribute(chase.slug)}/" aria-label="${escapeAttribute(`${chase.name} card page`)}" ${cardLinkAnalytics(chase, "about_current_chase_art")}>
            ${renderCardImage(chase)}
          </a>
        </section>

        <section class="about-contact" id="contact" aria-labelledby="aboutContactTitle">
          <div class="about-contact-copy">
            <p class="about-eyebrow">Say hi</p>
            <h2 id="aboutContactTitle">Write to Comet</h2>
            <p>Spotted a mistake, have a question about a card, or just want to share your own sleepy favorite? Comet reads every message.</p>
          </div>
          <div class="about-contact-actions">
            <button class="about-contact-button" type="button" data-open-contact-form>${ENVELOPE_ICON}<span>Contact Comet</span></button>
            <p class="about-contact-alt">or find us on <a href="${INSTAGRAM_URL}" target="_blank" rel="noopener noreferrer" data-analytics-event="navigation_clicked" data-analytics-source="about_contact" data-analytics-destination="instagram">Instagram</a></p>
          </div>
        </section>

        <nav class="about-next" aria-label="Keep exploring">
          <a class="about-text-link" href="../collection/" data-analytics-event="navigation_clicked" data-analytics-source="about_page" data-analytics-destination="collection">Browse the collection <span aria-hidden="true">→</span></a>
          <a class="about-text-link" href="../guides/" data-analytics-event="navigation_clicked" data-analytics-source="about_page" data-analytics-destination="guides">Read the collector guides <span aria-hidden="true">→</span></a>
        </nav>
      </main>
${renderSiteFooter()}
    </div>
    ${renderCardDetailDialog()}
${renderContactDialog()}
    <div class="toast hidden" id="toast" role="status" aria-live="polite"></div>
    <script src="${assetUrl("../", "prices.js")}"></script>
    <script src="${assetUrl("../", "app.js")}"></script>
    <script src="${assetUrl("../", "contact.js")}"></script>
  </body>
</html>
`;
}

// The "Contact Comet" form (#209), run by docs/contact.js. It reuses the Suggest a card dialog's look (home-v3.css).
// Formspree uses the "email" field as the reply-to address; the message, name and email never go to analytics.
function renderContactDialog() {
  return `    <dialog id="contactDialog" class="suggestion-dialog contact-dialog" aria-labelledby="contactTitle">
      <form class="suggestion-panel" id="contactForm" data-email-endpoint="${CONTACT_ENDPOINT}" novalidate>
        <input type="hidden" name="_subject" value="New message from Sleepy Pokemon" />
        <input class="form-honeypot" type="text" name="_gotcha" tabindex="-1" autocomplete="off" aria-hidden="true" />
        <button class="icon-button suggestion-close" type="button" data-close-contact-form aria-label="Close contact form">×</button>
        <p class="eyebrow">Say hi</p>
        <h2 id="contactTitle">Contact Comet</h2>
        <p class="suggestion-intro">A question, a mistake to fix, or a sleepy card story: write it here and it goes straight to Comet.</p>
        <label class="suggestion-field"><span>Message</span><textarea id="contactMessage" name="message" rows="5" required maxlength="5000" placeholder="Hi Comet! I noticed..."></textarea></label>
        <label class="suggestion-field"><span>Your email <em>(optional, only if you'd like a reply)</em></span><input id="contactEmail" name="email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" /></label>
        <label class="suggestion-field"><span>Your name <em>(optional)</em></span><input id="contactName" name="name" type="text" autocomplete="name" maxlength="120" /></label>
        <p class="contact-error" id="contactError" role="alert" hidden></p>
        <button class="button primary-button suggestion-submit contact-submit" type="submit">${ENVELOPE_ICON}<span>Send message</span></button>
        <p class="suggestion-footnote">Sent with Formspree. Your email is only used to reply to you.</p>
        <div class="suggestion-success" id="contactSuccess" hidden><p class="eyebrow">Message sent</p><h2>Thanks for writing! <span aria-hidden="true">✦</span></h2><p>Comet will read it soon. If you left your email, a reply will come from there.</p><button class="suggestion-done" type="button" data-close-contact-form>Done</button></div>
      </form>
    </dialog>`;
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
// Card displays (art, tiles) also carry data-card-slug for the binder (binder.js); plain text links don't.
function cardLinkAnalytics(card, source, { isCardDisplay = true } = {}) {
  const slug = isCardDisplay ? ` data-card-slug="${escapeAttribute(card.slug)}"` : "";
  return `data-card-id="${escapeAttribute(getCardIdentity(card))}"${slug} data-lightbox-source="${source}"`;
}
