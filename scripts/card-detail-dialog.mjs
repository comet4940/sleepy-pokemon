// The card lightbox shell, shared by every page that opens cards in place (the homepage and collection get it
// from sync-seo-index.mjs). app.js fills .detail-scroll with the card page's own details (loadCardPage), so the
// lightbox and the card page are built from one template. Only .detail-scroll scrolls, so the close button stays
// in reach and scrolling the details never moves the page behind.
export function renderCardDetailDialog() {
  return `<dialog id="cardDetailDialog" class="card-detail-dialog" aria-labelledby="detailTitle">
      <div class="card-detail-frame card-detail-v3">
        <button class="icon-button detail-close" id="closeCardDetailButton" type="button" aria-label="Close card preview">×</button>
        <div class="detail-scroll" id="detailScroll"></div>
      </div>
    </dialog>`;
}
