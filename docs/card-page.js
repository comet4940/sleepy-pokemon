// Card pages (cards/<slug>/): the "Add to wishlist" button under the price (#119). The wishlist itself lives in
// binder.js, loaded by the header. The collection, guides and sets handle this same button in the lightbox with
// app.js (syncDetailWish there); card pages don't load app.js, so this does the same job here.
(() => {
  const binder = window.sleepyBinder;
  const buttons = [...document.querySelectorAll(".detail-wish")];
  if (!binder || !buttons.length) return;

  const label = (name, wished) => (wished ? `Remove ${name} from your wishlist` : `Add ${name} to your wishlist`);
  const isWished = (slug) => {
    try {
      return binder.has("wished", slug);
    } catch {
      return false;
    }
  };

  function sync() {
    buttons.forEach((button) => {
      const wished = isWished(button.dataset.wishSlug);
      button.setAttribute("aria-pressed", String(wished));
      button.setAttribute("aria-label", label(button.dataset.wishName, wished));
      const text = button.querySelector(".detail-wish-label");
      if (text) text.textContent = wished ? "On your wishlist" : "Add to wishlist";
    });
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const slug = button.dataset.wishSlug;
      const wasWished = isWished(slug);
      if (wasWished) binder.remove("wished", slug);
      else binder.add("wished", slug);
      // Which card it was stays private: never send card details with wishlist events.
      window.sleepyAnalytics?.track("wishlist_toggled", { action: wasWished ? "removed" : "added", interaction_source: "card_page" });
    });
  });

  binder.onChange(sync);
  window.addEventListener("pageshow", sync);
  window.addEventListener("focus", sync);
  sync();
})();
