// The card lightbox shell, shared by every page that opens cards in place (the homepage and collection get it
// from sync-seo-index.mjs). app.js fills .detail-scroll with the card page's own details (loadCardPage), so the
// lightbox and the card page are built from one template. Only .detail-scroll scrolls, so the close button stays
// in reach and scrolling the details never moves the page behind. The "4 of 48" position and the arrows (desktop
// only) step through the page's cards; app.js shows them when there's more than one.
export function renderCardDetailDialog() {
  return `<dialog id="cardDetailDialog" class="card-detail-dialog" aria-labelledby="detailTitle">
      <div class="card-detail-frame card-detail-v3">
        <button class="icon-button detail-close" id="closeCardDetailButton" type="button" aria-label="Close card preview">×</button>
        <p class="detail-position" id="detailPosition" aria-live="polite" hidden></p>
        <button class="icon-button detail-nav detail-nav-prev" id="detailPrevButton" type="button" aria-label="Previous card" hidden>‹</button>
        <button class="icon-button detail-nav detail-nav-next" id="detailNextButton" type="button" aria-label="Next card" hidden>›</button>
        <div class="detail-scroll" id="detailScroll"></div>
      </div>
    </dialog>`;
}
