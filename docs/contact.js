// "Contact Comet" on the About page (#209): a small form in a dialog, sent through its own Formspree form (the
// endpoint is on the form, set by scripts/about-page.mjs). It looks like the Suggest a card form (home-v3.css).
//
// Analytics never carry what someone wrote: no message, name or email, only whether an email was left for a reply.
(() => {
  const dialog = document.querySelector("#contactDialog");
  const form = document.querySelector("#contactForm");
  if (!dialog || !form || typeof dialog.showModal !== "function") return;

  const message = form.querySelector("#contactMessage");
  const email = form.querySelector("#contactEmail");
  const error = form.querySelector("#contactError");
  const success = form.querySelector("#contactSuccess");
  const submit = form.querySelector(".contact-submit");
  const submitLabel = submit?.querySelector("span");
  const SOURCE = "about_page";
  const FAILED = "That didn't send. Please try again in a moment, or message us on Instagram.";
  let sending = false;

  const track = (name, params) => window.sleepyAnalytics?.track(name, { interaction_source: SOURCE, ...params });

  function showError(text, field) {
    error.textContent = text;
    error.hidden = !text;
    if (field) field.focus();
  }

  function reset() {
    form.reset();
    form.classList.remove("is-success");
    success.hidden = true;
    showError("");
  }

  function open() {
    if (form.classList.contains("is-success")) reset();
    dialog.showModal();
    track("contact_opened");
    window.setTimeout(() => message.focus(), 50);
  }

  document.querySelectorAll("[data-open-contact-form]").forEach((button) => button.addEventListener("click", open));
  form.querySelectorAll("[data-close-contact-form]").forEach((button) => button.addEventListener("click", () => dialog.close()));
  // A click on the backdrop (the dialog itself, outside the panel) closes it, like the other dialogs.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  // A sent message is cleared once the dialog closes, so the next one starts fresh. Unsent text is kept.
  dialog.addEventListener("close", () => {
    if (form.classList.contains("is-success")) reset();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (sending) return;
    if (!message.value.trim()) return showError("Please write a message first.", message);
    if (email.value.trim() && !email.validity.valid) return showError("That email doesn't look quite right. Leave it empty if you don't need a reply.", email);
    showError("");
    const hasEmail = Boolean(email.value.trim());

    // The honeypot is hidden from people; a bot that fills it in gets a "sent" with nothing sent or tracked.
    if (form.elements._gotcha?.value) return showSuccess();

    const endpoint = form.dataset.emailEndpoint;
    if (!endpoint || !/^https:\/\/formspree\.io\/f\//.test(endpoint)) {
      track("contact_submit_failed", { error_type: "configuration" });
      return showError(FAILED);
    }
    sending = true;
    submit.disabled = true;
    if (submitLabel) submitLabel.textContent = "Sending…";
    try {
      const response = await fetch(endpoint, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } });
      if (!response.ok) {
        track("contact_submit_failed", { error_type: "http" });
        return showError(FAILED);
      }
      track("contact_submitted", { has_email: hasEmail });
      showSuccess();
    } catch {
      track("contact_submit_failed", { error_type: "network" });
      showError(FAILED);
    } finally {
      sending = false;
      submit.disabled = false;
      if (submitLabel) submitLabel.textContent = "Send message";
    }
  });

  function showSuccess() {
    form.classList.add("is-success");
    success.hidden = false;
    success.querySelector("[data-close-contact-form]")?.focus();
  }
})();
