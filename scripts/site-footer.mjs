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
          </div>
          <p class="site-footer-disclaimer">Fan-made collection checklist. Pokémon and card art belong to their respective owners. Not affiliated with Pokémon or TCGplayer.</p>
        </div>
        <script data-name="BMC-Widget" data-cfasync="false" src="https://cdnjs.buymeacoffee.com/1.0.0/widget.prod.min.js" data-id="cometakira" data-description="Support me on Buy me a coffee!" data-message="Support the 💤" data-color="#F36B9B" data-position="Right" data-x_margin="18" data-y_margin="18"></script>
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
