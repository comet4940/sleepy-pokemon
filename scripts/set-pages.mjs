// Set landing pages (/sets/ and /sets/<set>/) for sets with enough sleepy cards to stand on their own.
// The threshold and the curator's intros live in docs/sets.json.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { renderSiteHeader } from "./site-header.mjs";
import { renderSiteFooter } from "./site-footer.mjs";
import { renderCardDetailDialog } from "./card-detail-dialog.mjs";
import { getCardIdentity } from "./card-identity.mjs";
import {
  SITE_URL,
  assetUrl,
  dataAttributes,
  escapeAttribute,
  escapeHtml,
  renderCardEntry,
  renderHead,
  slugify,
} from "./build-helpers.mjs";

export const SETS_PATH = "docs/sets.json";
const SETS_DIR = "docs/sets";

export async function loadSetDefs() {
  return JSON.parse(await readFile(SETS_PATH, "utf8"));
}

// Sets with at least `minCards` cards, newest release first. Cards keep collector order (card number).
export function getSetHubs(cards, setDefs) {
  const bySet = new Map();
  cards.forEach((card) => bySet.set(card.setName, [...(bySet.get(card.setName) || []), card]));
  return [...bySet]
    .filter(([, setCards]) => setCards.length >= setDefs.minCards)
    .map(([name, setCards]) => {
      const releaseDate = setCards.map((card) => card.setReleaseDate || "").sort().at(-1);
      return {
        name,
        slug: slugify(name),
        series: setCards[0].setSeries,
        year: releaseDate.slice(0, 4),
        releaseDate,
        intro: setDefs.intros?.[name] || "",
        cards: [...setCards].sort((a, b) => String(a.number).localeCompare(String(b.number), "en", { numeric: true })),
      };
    })
    .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate) || a.name.localeCompare(b.name));
}

export async function writeSetPages(hubs) {
  await rm(SETS_DIR, { recursive: true, force: true });
  await mkdir(SETS_DIR, { recursive: true });
  await writeFile(`${SETS_DIR}/index.html`, renderSetsIndex(hubs), "utf8");
  await Promise.all(hubs.map(async (hub) => {
    const dir = `${SETS_DIR}/${hub.slug}`;
    await mkdir(dir, { recursive: true });
    await writeFile(`${dir}/index.html`, renderSetPage(hub), "utf8");
    // The lightbox only needs this set's cards, so the page loads this subset instead of the full catalog.
    await writeFile(`${dir}/cards.json`, `${JSON.stringify({ cards: hub.cards }, null, 2)}\n`, "utf8");
  }));
}

function firstSentence(text) {
  return String(text || "").match(/^.*?[.!?](?=\s|$)/)?.[0] || String(text || "");
}

function describeHub(hub) {
  return [hub.series, hub.year, `${hub.cards.length} cards`].filter(Boolean).join(" · ");
}

function navigationAttributes(source, destination) {
  return dataAttributes({ "analytics-event": "navigation_clicked", "analytics-source": source, "analytics-destination": destination });
}

function renderSetsIndex(hubs) {
  const description = "Sleepy Pokemon cards gathered by set, from Neo Destiny and Skyridge to Paldea Evolved and Black Bolt: the sets with the most napping cards.";
  return `<!doctype html>
<html lang="en">
  <head>
${renderHead({
  root: "../",
  title: "Sleepy Pokemon Cards by Set",
  description,
  canonicalUrl: `${SITE_URL}/sets/`,
  image: hubs[0]?.cards[0]?.imageLarge || `${SITE_URL}/assets/sleepy-pokemon.png`,
  pageType: "sets-index",
  stylesheets: ["styles.css", "home-v3.css", "guides.css"],
})}
  </head>
  <body data-app-mode="sets-index">
    <div class="app-shell guides-shell">
      ${renderSiteHeader("../")}
      <main class="guides-index-main">
        <header class="guides-index-intro">
          <p class="eyebrow">Browse by set</p>
          <h1>Sleepy cards by set</h1>
          <p>${escapeHtml(description)}</p>
        </header>
        <section class="guide-directory" aria-label="Sets with sleepy Pokemon cards">
${hubs.map((hub, index) => renderSetDirectoryItem(hub, index)).join("\n")}
        </section>
      </main>
${renderSiteFooter()}
    </div>
  </body>
</html>
`;
}

function renderSetDirectoryItem(hub, index) {
  const link = navigationAttributes("sets_index", "set_page");
  return `          <article class="guide-directory-item">
            <a class="guide-directory-art" href="${escapeAttribute(hub.slug)}/" aria-label="See the sleepy cards in ${escapeAttribute(hub.name)}" ${link}>
${hub.cards.slice(0, 3).map((card, cardIndex) => {
  const image = card.imageSmall || card.imageLarge;
  return image ? `              <img src="${escapeAttribute(image)}" alt="" loading="${index === 0 && cardIndex === 0 ? "eager" : "lazy"}" />` : "";
}).join("\n")}
            </a>
            <div class="guide-directory-copy">
              <p class="eyebrow">${escapeHtml(describeHub(hub))}</p>
              <h2><a href="${escapeAttribute(hub.slug)}/" ${link}>${escapeHtml(hub.name)}</a></h2>
              ${hub.intro ? `<p>${escapeHtml(hub.intro)}</p>` : ""}
              <a class="guide-read-link" href="${escapeAttribute(hub.slug)}/" ${link}>See the sleepers <span aria-hidden="true">→</span></a>
            </div>
          </article>`;
}

function renderSetPage(hub) {
  const title = `Sleepy Pokemon Cards from ${hub.name}`;
  const [first, second, third] = [...new Set(hub.cards.map((card) => card.pokemon))];
  const highlights = third ? `${first}, ${second} and ${third}` : [first, second].filter(Boolean).join(" and ");
  const description = `${hub.cards.length} sleepy Pokemon cards from ${hub.name}${hub.year ? ` (${hub.year})` : ""}, including ${highlights}, each with a note on why it belongs in a sleepy binder.`;
  const canonicalUrl = `${SITE_URL}/sets/${hub.slug}/`;
  const image = hub.cards[0]?.imageLarge || hub.cards[0]?.imageSmall || `${SITE_URL}/assets/sleepy-pokemon.png`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    url: canonicalUrl,
    description,
    image,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: hub.cards.length,
      itemListElement: hub.cards.map((card, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: `${card.name} Sleepy Pokemon Card`,
        url: `${SITE_URL}/cards/${card.slug}/`,
      })),
    },
  };

  return `<!doctype html>
<html lang="en">
  <head>
${renderHead({
  root: "../../",
  title,
  description,
  canonicalUrl,
  image,
  ogType: "article",
  twitter: true,
  jsonLd,
  pageType: "set",
  stylesheets: ["styles.css", "home-v3.css", "guides.css", "card-detail-v3.css"],
})}
  </head>
  <body data-app-mode="set-page" data-guide-path="cards.json" data-site-root="../../">
    <div class="app-shell guide-page-shell">
      ${renderSiteHeader("../../")}

      <main class="guide-page-main">
        <section class="guide-hero" aria-labelledby="setTitle">
          <div class="guide-hero-copy">
            <a class="guide-back-link" href="../" ${navigationAttributes("set_page", "sets")}><span aria-hidden="true">←</span> All sets</a>
            <p class="eyebrow">${escapeHtml(describeHub(hub))}</p>
            <h1 id="setTitle">Sleepy cards from ${escapeHtml(hub.name)}</h1>
            ${hub.intro ? `<p>${escapeHtml(hub.intro)}</p>` : ""}
          </div>
          <div class="guide-hero-stack" aria-hidden="true">
${hub.cards.slice(0, 3).map((card, index) => {
  const previewImage = card.imageSmall || card.imageLarge;
  return previewImage ? `            <img src="${escapeAttribute(previewImage)}" alt="" class="guide-stack-card guide-stack-card-${index + 1}" />` : "";
}).join("\n")}
          </div>
        </section>

        <section class="guide-card-list" aria-label="Sleepy cards in ${escapeAttribute(hub.name)}">
${hub.cards.map((card, index) => renderCardEntry({
  card,
  index,
  // The first sentence keeps the list scannable; the full note is one tap away in the lightbox.
  text: firstSentence(card.whyItBelongs),
  // Tapping a card opens the lightbox, which tracks card_opened with interaction_source set_page.
  linkAttributes: () => dataAttributes({ "card-id": getCardIdentity(card), "lightbox-source": "set_page" }),
})).join("\n")}
        </section>
      </main>
${renderSiteFooter()}
    </div>
    ${renderCardDetailDialog()}
    <div class="toast hidden" id="toast" role="status" aria-live="polite"></div>
    <script src="${assetUrl("../../", "prices.js")}"></script>
    <script src="${assetUrl("../../", "app.js")}"></script>
  </body>
</html>
`;
}
