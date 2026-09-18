# Card image workflow

For future additions and image revisions, prefer Scrydex images of the exact
printing. Keep existing catalog images until a replacement has been reviewed.
Public pages render stored image URLs; they do not call a paid metadata API.

1. Find the Scrydex card page and visually verify Pokemon, expansion, card number,
   language, artwork and any promo stamp. Do not infer Scrydex IDs from legacy IDs.
2. Copy its medium and large image URLs. Use medium for the gallery and large for
   details. If the exact printing is unavailable, keep a verified alternative and
   record the reason in the review. Never substitute similar artwork or another print.
3. Add the card's metadata using the current curation process. Run the command below
   to preview image changes for one exact catalog entry. It validates URL identity
   and image availability; human review establishes that the pictured card matches.
4. Review the printed before/after URLs, then repeat with `--apply` to save locally.
5. Regenerate pages with `node scripts/sync-seo-index.mjs` and
   `node scripts/sync-guides.mjs`. Inspect the gallery and detail image in both themes.
6. Ask for approval before pushing catalog changes. Do not run a bulk cleanup yet.

Example (preview only):

```sh
node scripts/set-card-images.mjs \
  --name Pikachu --set 'ME: 30th Celebration' --number '027/128' \
  --source 'https://scrydex.com/pokemon/cards/pikachu/me55-27' \
  --medium 'https://images.scrydex.com/pokemon/me55-27/medium' \
  --large 'https://images.scrydex.com/pokemon/me55-27/large'
```

Use `--language` for non-English cards. `--file` supports an isolated catalog copy.
The command preserves metadata and adds image provenance. It performs two public
image HEAD requests, not authenticated card API calls. Reachability does not by
itself establish licensing or permanent free hosting.

Price refreshes no longer replace images, so they cannot undo curated source choices.
Legacy card lookup and price APIs remain separate migration work. A future Scrydex
API integration must keep credentials on the tooling side and budget API requests;
never embed keys in browser code. Check current terms and pricing before enabling it.
