import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: {
  name: { type: 'string' }, set: { type: 'string' }, number: { type: 'string' },
  language: { type: 'string', default: 'English' },
  source: { type: 'string' }, medium: { type: 'string' }, large: { type: 'string' },
  file: { type: 'string', default: 'docs/published-cards.json' },
  apply: { type: 'boolean', default: false },
} });
for (const key of ['name', 'set', 'number', 'source', 'medium', 'large']) {
  if (!values[key]) throw new Error(`Missing --${key}. See CARD_IMAGES.md.`);
}
const source = new URL(values.source);
if (source.protocol !== 'https:' || source.hostname !== 'scrydex.com' || !source.pathname.startsWith('/pokemon/cards/')) {
  throw new Error('Source must be the reviewed Scrydex Pokemon card page.');
}
const sourceId = source.pathname.split('/').filter(Boolean).at(-1);
for (const size of ['medium', 'large']) {
  const url = new URL(values[size]);
  if (url.protocol !== 'https:' || url.hostname !== 'images.scrydex.com'
      || url.pathname !== `/pokemon/${sourceId}/${size}` || url.search || url.hash) {
    throw new Error(`${size} must match the reviewed card ID and image size.`);
  }
}
const guide = JSON.parse(await readFile(values.file, 'utf8'));
const cards = Array.isArray(guide) ? guide : guide.cards;
if (!Array.isArray(cards)) throw new Error('Catalog must contain a cards array.');
const matches = cards.filter(c => c.name === values.name && c.setName === values.set
  && c.number === values.number && c.language === values.language);
if (matches.length !== 1) throw new Error(`Expected one exact printing; found ${matches.length}.`);
for (const size of ['medium', 'large']) {
  const response = await fetch(values[size], { method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) {
    throw new Error(`${size} image unavailable (${response.status}); catalog unchanged.`);
  }
}
const card = matches[0];
console.log(JSON.stringify({ card: `${card.name} / ${card.setName} / ${card.number} / ${card.language}`,
  before: { imageSmall: card.imageSmall, imageLarge: card.imageLarge },
  after: { imageSmall: values.medium, imageLarge: values.large }, apply: values.apply }, null, 2));
if (values.apply) {
  Object.assign(card, { imageSmall: values.medium, imageLarge: values.large,
    imageSource: 'Scrydex', imageSourceUrl: source.href, scrydexId: sourceId });
  await writeFile(values.file, JSON.stringify(guide, null, 2) + '\n');
}
