const FOOTER_START = "<!-- SITE_FOOTER_START -->";
const FOOTER_END = "<!-- SITE_FOOTER_END -->";

export function renderSiteFooter() {
  return `${FOOTER_START}
      <footer class="site-footer">
        <div class="site-footer-inner">
          <p>&copy; 2026 Semi Serious Labs LLC. All rights reserved.</p>
          <div class="site-footer-signoff">
            <p>Made with <span class="footer-heart" aria-label="love">&hearts;</span> by <a class="footer-studio-link" href="https://semiseriousllc.com" target="_blank" rel="noopener noreferrer" data-analytics-event="studio_link_clicked" data-analytics-source="global_footer" data-analytics-destination="semi_serious_labs">Semi Serious Labs</a>.</p>
            <a class="footer-coffee" href="https://buymeacoffee.com/cometakira" target="_blank" rel="noopener noreferrer" aria-label="Buy Comet a coffee" title="Buy Comet a coffee" data-analytics-event="coffee_clicked" data-analytics-source="global_footer" data-analytics-destination="buy_me_a_coffee">
              <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
                <path d="M5 7h11v7a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5V7Z" />
                <path d="M16 9h2.25a2.75 2.75 0 0 1 0 5.5H16" />
                <path d="M7 4c.35.5.35 1 0 1.5M10.5 4c.35.5.35 1 0 1.5M14 4c.35.5.35 1 0 1.5" />
                <path d="M4 21h14" />
              </svg>
            </a>
          </div>
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
