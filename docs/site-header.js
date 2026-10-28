// The phone header's menu (see scripts/site-header.mjs): ☰ shows Browse, Guides, About and Suggest. Wider screens
// show those links in the header and hide the button, so this only ever runs the button. The CSS opens the menu
// from aria-expanded.
(() => {
  const toggle = document.querySelector(".site-menu-toggle");
  const menu = document.getElementById("siteMenu");
  if (!toggle || !menu) return;

  // The page you're on is marked in the menu: Browse on the collection, Guides on any guide.
  menu.querySelectorAll("a[href]").forEach((link) => {
    const path = new URL(link.href).pathname;
    if (path !== "/" && link.search === "" && window.location.pathname.startsWith(path)) link.setAttribute("aria-current", "page");
  });

  const isOpen = () => toggle.getAttribute("aria-expanded") === "true";
  const setOpen = (open) => toggle.setAttribute("aria-expanded", String(open));

  toggle.addEventListener("click", () => {
    setOpen(!isOpen());
    if (isOpen()) window.sleepyAnalytics?.track("menu_opened", { interaction_source: "global_header" });
  });
  // Choosing a link closes it, including Suggest, which opens its form in place on the homepage and collection.
  menu.addEventListener("click", (event) => {
    if (event.target.closest("a")) setOpen(false);
  });
  document.addEventListener("click", (event) => {
    if (isOpen() && !menu.contains(event.target) && !toggle.contains(event.target)) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !isOpen()) return;
    setOpen(false);
    toggle.focus();
  });
})();
