// Card pages (cards/<slug>/): the "Add to wishlist" button under the price (#119). The wishlist itself lives in
// binder.js, loaded by the header. The collection, guides and sets handle this same button in the lightbox with
// app.js (syncDetailWish there); card pages don't load app.js, so this does the same job here.
(() => {
  const binder = window.sleepyBinder;
  const buttons = [...document.querySelectorAll(".detail-wish")];
  if (!binder || !buttons.length) return;

  // The same one-time hints app.js uses (WISHLIST_HINTS there): a first wish made here counts everywhere, so the
  // collection won't show its intro strip or first-wish message afterwards.
  const HINTS = { strip: "wishlist_strip", firstWish: "wishlist_first_wish" };
  const label = (name, wished) => (wished ? `Remove ${name} from your wishlist` : `Add ${name} to your wishlist`);
  const isWished = (slug) => {
    try {
      return binder.has("wished", slug);
    } catch {
      return false;
    }
  };

  // The first-wish note under the button only makes sense while the card is wished: taken off, it goes.
  function clearNote(button) {
    const status = button.parentElement?.querySelector("[data-wish-status]");
    if (!status?.classList.contains("detail-wish-note")) return;
    status.textContent = "";
    status.classList.remove("detail-wish-note");
    status.classList.add("sr-only");
  }

  // The same wishing burst as app.js (burstWish there), from the button's centre. Skipped for reduced motion.
  const SPARKLE = "M12 0c1 7 5 11 12 12-7 1-11 5-12 12-1-7-5-11-12-12 7-1 11-5 12-12z";
  const BURST_COLOURS = ["#f36b9b", "#fff7e8", "#c9bcff", "#ffd678", "#f36b9b", "#fff7e8", "#a7e8d4", "#f36b9b"];
  function burst(button) {
    if (typeof button.getBoundingClientRect !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const box = button.getBoundingClientRect();
    const element = document.createElement("span");
    element.className = "wish-burst";
    element.setAttribute("aria-hidden", "true");
    element.style.left = `${box.left + box.width / 2}px`;
    element.style.top = `${box.top + box.height / 2}px`;
    element.innerHTML = BURST_COLOURS.map((colour, index) => {
      const angle = (index / BURST_COLOURS.length) * Math.PI * 2 - Math.PI / 2;
      const distance = 30 + (index % 3) * 9;
      return `<b style="--colour:${colour};--x:${(Math.cos(angle) * distance).toFixed(1)}px;--y:${(Math.sin(angle) * distance).toFixed(1)}px;animation-delay:${(index % 2) * 40}ms"><svg viewBox="0 0 24 24" focusable="false"><path d="${SPARKLE}" /></svg></b>`;
    }).join("");
    document.body.append(element);
    window.setTimeout(() => element.remove(), 900);
    button.classList.remove("is-popping");
    void button.offsetWidth;
    button.classList.add("is-popping");
  }

  function sync() {
    buttons.forEach((button) => {
      const wished = isWished(button.dataset.wishSlug);
      // The art frame gets the starry sky of a wished card (the sky's markup is already in the page).
      button.closest?.(".card-page-detail")?.classList.toggle("is-wished", wished);
      if (!wished) clearNote(button);
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
      // binder.js only reports success when the wishlist really changed (a card someone already has can't be
      // wished for). Card pages have no toast, so the button's label says why for a few seconds.
      const changed = wasWished ? binder.remove("wished", slug) : binder.add("wished", slug);
      if (!changed) {
        sync();
        const text = button.querySelector(".detail-wish-label");
        const message = !wasWished && binder.has("owned", slug) ? "You already have this card" : "Couldn't update your wishlist";
        if (text) {
          text.textContent = message;
          window.setTimeout(sync, 3000);
        }
        const status = button.parentElement?.querySelector("[data-wish-status]");
        if (status) status.textContent = message === "You already have this card" ? "You already have this card, so it's not added to your wishlist." : `${message}. Please try again.`;
        return;
      }
      if (!wasWished) {
        burst(button);
        const firstWish = !binder.hintSeen(HINTS.firstWish);
        binder.markHintSeen(HINTS.strip);
        binder.markHintSeen(HINTS.firstWish);
        // Card pages have no toast: the first wish ever explains itself under the button (and to screen readers).
        if (firstWish) {
          const note = "Saved on this device. Find it under Wishlist in the header.";
          const status = button.parentElement?.querySelector("[data-wish-status]");
          if (status) {
            status.textContent = note;
            status.classList.remove("sr-only");
            status.classList.add("detail-wish-note");
          }
        }
      }
      // Which card it was stays private: never send card details with wishlist events.
      window.sleepyAnalytics?.track("wishlist_toggled", { action: wasWished ? "removed" : "added", interaction_source: "card_page" });
    });
  });

  binder.onChange(sync);
  window.addEventListener("pageshow", sync);
  window.addEventListener("focus", sync);
  sync();
})();
