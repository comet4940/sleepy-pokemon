// Card identity shared by the build scripts. docs/app.js keeps its own copy
// (it runs as a classic browser script); validate-analytics.mjs checks that
// both copies produce the same identity for every published card.
export function getCardIdentity(card) {
  return [card.apiId, card.tcgdexId, card.language, card.setName, card.number, card.name]
    .filter(Boolean)
    .join("::");
}
