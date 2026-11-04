// Our one official social account (#265: a TikTok account impersonates us). The About page links it too.
export const INSTAGRAM_HANDLE = "sleepypokemoncards";
export const INSTAGRAM_URL = `https://www.instagram.com/${INSTAGRAM_HANDLE}/`;
const INSTAGRAM_ICON = `<svg class="footer-social-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4.2" /><circle cx="17.4" cy="6.6" r="1.1" /></svg>`;

const FOOTER_START = "<!-- SITE_FOOTER_START -->";
const FOOTER_END = "<!-- SITE_FOOTER_END -->";

export function renderSiteFooter() {
  return `${FOOTER_START}
      <footer class="site-footer">
        <div class="site-footer-inner">
          <div class="site-footer-signoff">
            <strong class="footer-brand">Sleepy Pokemon</strong>
            <span class="footer-divider" aria-hidden="true">·</span>
            <p>Made with <span class="footer-heart" aria-label="love">&hearts;</span> by <a class="footer-studio-link" href="https://semiseriousllc.com" target="_blank" rel="noopener noreferrer" data-analytics-event="studio_link_clicked" data-analytics-source="global_footer" data-analytics-destination="semi_serious_labs">Semi Serious Labs</a></p>
            <span class="footer-divider footer-social-divider" aria-hidden="true">·</span>
            <a class="footer-social-link" href="${INSTAGRAM_URL}" target="_blank" rel="me noopener noreferrer" aria-label="Instagram @${INSTAGRAM_HANDLE}" data-analytics-event="social_link_clicked" data-analytics-source="global_footer" data-analytics-destination="instagram">${INSTAGRAM_ICON}<span>@${INSTAGRAM_HANDLE}</span></a>
          </div>
          <p class="site-footer-disclaimer">Fan-made collection checklist. Pokémon and card art belong to their respective owners. Not affiliated with Pokémon or TCGplayer.</p>
        </div>
      </footer>
      ${FOOTER_END}`;
}

export function syncSiteFooter(html) {
  const footer = renderSiteFooter();
  const existingFooter = new RegExp(`${escapeRegExp(FOOTER_START)}[\\s\\S]*?${escapeRegExp(FOOTER_END)}`);
  if (existingFooter.test(html)) return html.replace(existingFooter, footer);

  const firstDialog = html.indexOf("\n    <dialog");
  const shellEnd = html.lastIndexOf("\n    </div>", firstDialog === -1 ? html.length : firstDialog);
  if (shellEnd === -1) throw new Error("Could not find app shell closing tag for shared footer.");

  return `${html.slice(0, shellEnd)}\n${footer}${html.slice(shellEnd)}`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
