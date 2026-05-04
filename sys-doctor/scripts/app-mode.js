// Linggen app-mode integration.
//
// When a skill page is hosted by a Linggen app shell (e.g. SysDoctor.app,
// LingMem.app), the shell appends `?app_mode=1` to the page URL and
// communicates with the skill via window.postMessage. Public web users do
// not get app_mode=1, so this entire module is a no-op for them.
//
// Protocol (from shell to skill):
//   { type: "linggen:show-settings" }   show settings overlay
//   { type: "linggen:hide-settings" }   hide settings overlay
//
// The overlay slides over the chat without unmounting it, so chat state
// survives. Esc and the close button dismiss back to the chat.

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
    // daemon). Without this, any embedded iframe or popup could trigger
    // overlay state — low blast radius today, but lock it down by default.
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
