// My Binder (#119): the cards a visitor has (owned) and wants (wished), saved in this browser only.
//
// This file stores and announces; it draws nothing. Pages mark each card element with data-card-slug, and the
// binder's look (the moon button, starry frame, wishing star) is built on top of window.sleepyBinder.
//
// It stores only which cards someone has or wants, never anything about guides, sets or pages, so catalog
// changes never need a binder change. Cards are keyed by their card page slug, which never changes
// (DATA-MODEL.md, data/card-slugs.json). Stored shape, one key:
//
//   sleepy_binder_v1 = { "version": 1, "owned": { "<slug>": "YYYY-MM-DD" }, "wished": { ... }, "hints": { "<name>": "YYYY-MM-DD" } }
//
// Slugs that aren't in the catalog are kept, not dropped. A card is never both owned and wished.
(() => {
  const STORAGE_KEY = "sleepy_binder_v1";
  // Saved data that can't be read is kept here once, instead of being thrown away by the next save.
  const UNREADABLE_KEY = "sleepy_binder_v1_unreadable";
  const LISTS = ["owned", "wished"];
  const CHANGE_EVENT = "sleepy-binder-change";

  // Used for the rest of the visit when the browser won't store anything (private modes, full or blocked storage).
  let memoryCopy = null;
  let persistent = true;

  const today = () => new Date().toISOString().slice(0, 10);
  const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
  const isSlug = (value) => typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

  function emptyBinder() {
    return { version: 1, owned: {}, wished: {}, hints: {} };
  }

  // Keeps every well-formed entry (including unknown slugs and fields a later version may add) and drops the rest.
  function cleanBinder(raw) {
    const binder = { ...(isRecord(raw) ? raw : {}), version: 1 };
    for (const key of [...LISTS, "hints"]) {
      const entries = isRecord(binder[key]) ? binder[key] : {};
      binder[key] = Object.fromEntries(Object.entries(entries).filter(([name, date]) => (key === "hints" || isSlug(name)) && typeof date === "string"));
    }
    // Owned wins: a card someone has isn't also on their wishlist.
    for (const slug of Object.keys(binder.wished)) if (slug in binder.owned) delete binder.wished[slug];
    return binder;
  }

  function storage() {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }

  // Always reads fresh, so a save in another tab is never overwritten.
  function readBinder() {
    if (memoryCopy) return cleanBinder(memoryCopy);
    const store = storage();
    let text = null;
    try {
      text = store ? store.getItem(STORAGE_KEY) : null;
    } catch {
      return emptyBinder();
    }
    if (!text) return emptyBinder();
    try {
      return cleanBinder(JSON.parse(text));
    } catch {
      try {
        if (!store.getItem(UNREADABLE_KEY)) store.setItem(UNREADABLE_KEY, text);
      } catch {
        // Nothing more to do: the visit carries on with an empty binder.
      }
      return emptyBinder();
    }
  }

  function writeBinder(binder) {
    if (persistent) {
      try {
        const store = storage();
        if (!store) throw new Error("localStorage is unavailable");
        store.setItem(STORAGE_KEY, JSON.stringify(binder));
        return;
      } catch {
        persistent = false;
        announce({ type: "unavailable" });
      }
    }
    memoryCopy = binder;
  }

  function announce(detail) {
    try {
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail }));
    } catch {
      // Very old browsers without CustomEvent simply don't hear about changes.
    }
  }

  // Read, change, save, announce: every write starts from the latest saved copy.
  function update(change) {
    const binder = readBinder();
    const detail = change(binder);
    if (!detail) return false;
    writeBinder(binder);
    announce(detail);
    return true;
  }

  function checkList(list) {
    if (!LISTS.includes(list)) throw new Error(`Unknown binder list "${list}" (use ${LISTS.join(" or ")})`);
  }

  const api = {
    lists: LISTS,
    changeEvent: CHANGE_EVENT,

    has(list, slug) {
      checkList(list);
      return slug in readBinder()[list];
    },

    // Adds a card. Adding to "owned" takes it off the wishlist ({ wishCameTrue: true }).
    add(list, slug) {
      checkList(list);
      if (!isSlug(slug)) return false;
      return update((binder) => {
        if (slug in binder[list]) return null;
        if (list === "wished" && slug in binder.owned) return null;
        binder[list][slug] = today();
        const wishCameTrue = list === "owned" && slug in binder.wished;
        if (wishCameTrue) delete binder.wished[slug];
        return { type: "added", list, slug, wishCameTrue };
      });
    },

    remove(list, slug) {
      checkList(list);
      return update((binder) => {
        if (!(slug in binder[list])) return null;
        delete binder[list][slug];
        return { type: "removed", list, slug };
      });
    },

    // Flips a card and returns whether it's now in the list.
    toggle(list, slug) {
      if (api.has(list, slug)) api.remove(list, slug);
      else api.add(list, slug);
      return api.has(list, slug);
    },

    // The slugs in a list, oldest first. Pass a page's slugs to count only those (a guide's "3 of 5").
    slugs(list, onlyThese) {
      checkList(list);
      const entries = Object.entries(readBinder()[list]).sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]));
      const slugs = entries.map(([slug]) => slug);
      return onlyThese ? slugs.filter((slug) => onlyThese.includes(slug)) : slugs;
    },

    count(list, onlyThese) {
      return api.slugs(list, onlyThese).length;
    },

    // One-time hints (the collection's first-visit strip, the first-save message): seen once, never again.
    hintSeen(name) {
      return name in readBinder().hints;
    },

    markHintSeen(name) {
      return update((binder) => {
        if (name in binder.hints) return null;
        binder.hints[name] = today();
        return { type: "hint", name };
      });
    },

    // False once the browser has refused to save: the binder then lasts for this visit only.
    isPersistent() {
      return persistent;
    },

    // Calls fn(detail) on every change, here or in another tab. Returns a function that stops listening.
    onChange(fn) {
      const handler = (event) => fn(event.detail || {});
      window.addEventListener(CHANGE_EVENT, handler);
      return () => window.removeEventListener(CHANGE_EVENT, handler);
    },
  };

  // Another tab saved: tell this page so it can redraw.
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY || event.key === null) announce({ type: "external" });
  });

  window.sleepyBinder = Object.freeze(api);
})();
