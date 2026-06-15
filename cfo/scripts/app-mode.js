// Linggen app-mode integration.
//
// When the CFO page is hosted by a Linggen app shell (CFO.app), the shell
// appends `?app_mode=1` to the page URL and posts window messages to drive
// chrome the skill page can't render itself (the native Settings menu item).
// Public web users do not get app_mode=1, so this whole module is a no-op
// for them.
//
// Protocol (shell -> skill):
//   { type: "linggen:show-settings" }   show the settings overlay
//   { type: "linggen:hide-settings" }   hide the settings overlay
//
// The overlay slides over the report + chat without unmounting them, so page
// state survives. Esc and the close button dismiss back to the app.

(function () {
  const params = new URLSearchParams(window.location.search);
  if (params.get("app_mode") !== "1") return;

  let overlay = null;

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.className = "app-mode-overlay";
    overlay.innerHTML = `
      <div class="app-mode-overlay-bar">
        <span class="app-mode-overlay-title">Settings</span>
        <button class="app-mode-overlay-close" aria-label="Close settings">×</button>
      </div>
      <iframe class="app-mode-overlay-frame" src="settings.html" title="Settings"></iframe>
    `;
    overlay.querySelector(".app-mode-overlay-close").addEventListener("click", hide);
    document.body.appendChild(overlay);
    return overlay;
  }

  function show() {
    ensureOverlay().classList.add("visible");
  }

  function hide() {
    if (overlay) overlay.classList.remove("visible");
  }

  window.addEventListener("message", (e) => {
    // Only accept protocol messages from the same origin (the local Linggen
    // daemon). Without this, any embedded iframe or popup could toggle the
    // overlay — low blast radius today, but locked down by default.
    if (e.origin !== window.location.origin) return;
    const msg = e.data;
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "linggen:show-settings") show();
    if (msg.type === "linggen:hide-settings") hide();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay && overlay.classList.contains("visible")) {
      hide();
    }
  });
})();
