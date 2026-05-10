import { readFile, writeFile } from "node:fs/promises";

const GUIDE_PATH = "docs/published-cards.json";
const INDEX_PATH = "docs/index.html";
const START = "<!-- SEO_CARD_INDEX_START -->";
const END = "<!-- SEO_CARD_INDEX_END -->";

const guide = JSON.parse(await readFile(GUIDE_PATH, "utf8"));
const cards = Array.isArray(guide) ? guide : guide.cards;

if (!Array.isArray(cards)) {
  throw new Error(`${GUIDE_PATH} does not contain a cards array.`);
}

const sortedCards = [...cards].sort((a, b) => {
  return String(a.pokemon || "").localeCompare(String(b.pokemon || ""))
    || String(a.name || "").localeCompare(String(b.name || ""))
    || String(a.setName || "").localeCompare(String(b.setName || ""));
});

const items = sortedCards.map((card) => {
  const title = [card.name, card.number ? `#${card.number}` : ""].filter(Boolean).join(" ");
  const details = [card.pokemon, card.setName, card.rarity, card.language].filter(Boolean).join(" • ");
  return `              <li><strong>${escapeHtml(title)}</strong><span>${escapeHtml(details)}</span></li>`;
}).join("\n");

const section = `${START}
        <section class="seo-card-index" aria-labelledby="seoCardIndexTitle">
          <div class="seo-card-index-inner">
            <p class="eyebrow">Crawlable card index</p>
            <h2 id="seoCardIndexTitle">All ${sortedCards.length} sleepy Pokemon cards in this guide</h2>
            <p class="notes">A text index of the curated sleepy Pokemon card list for collectors and search engines.</p>
            <ol>
${items}
            </ol>
          </div>
        </section>
        ${END}`;

let html = await readFile(INDEX_PATH, "utf8");

if (html.includes(START) && html.includes(END)) {
  html = html.replace(new RegExp(`${escapeRegExp(START)}[\\s\\S]*?${escapeRegExp(END)}`), section);
} else {
  html = html.replace("      </main>", `      </main>\n\n${section}`);
}

await writeFile(INDEX_PATH, html, "utf8");
console.log(`Synced ${sortedCards.length} cards into ${INDEX_PATH}.`);

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
