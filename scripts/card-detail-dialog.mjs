// The card lightbox markup app.js fills in, shared by every page that opens cards in place.
export function renderCardDetailDialog() {
  return `<dialog id="cardDetailDialog" class="card-detail-dialog">
      <div class="card-detail-frame card-detail-v3">
        <button class="icon-button detail-close" id="closeCardDetailButton" type="button" aria-label="Close card preview">×</button>
        <div class="detail-art-column"><div class="detail-image-frame" id="detailImageFrame"></div></div>
        <div class="detail-copy">
          <p class="detail-kicker" id="detailEyebrow">Caught napping</p>
          <h2 id="detailTitle"></h2>
          <p class="card-subtitle" id="detailSubtitle"></p>
          <div class="detail-price-row" id="detailPriceRow"></div>
          <div class="curation-note" id="detailCurationNote"></div>
          <div class="detail-guide-links" id="detailGuideLinks"></div>
          <div class="detail-moods" id="detailMoods"></div>
          <div class="meta-grid" id="detailMetaGrid"></div>
        </div>
      </div>
    </dialog>`;
}
