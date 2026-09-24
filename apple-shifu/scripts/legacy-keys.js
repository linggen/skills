// Carry browser state across the 2026-07-28 mac-shifu → apple-shifu rename.
// Score history is 30 scans of trend data and the tab/model choices are the
// user's; a slug change should not silently reset them. Runs once at module
// load — doctor.js imports this before anything reads a key. Idempotent: the
// old keys are removed, so a second pass finds nothing.
(function migrateLegacyKeys() {
  try {
    const legacy = 'mac-shifu:';
    const current = 'apple-shifu:';
    const stale = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(legacy)) stale.push(k);
    }
    for (const k of stale) {
      const target = current + k.slice(legacy.length);
      if (localStorage.getItem(target) === null) {
        localStorage.setItem(target, localStorage.getItem(k));
      }
      localStorage.removeItem(k);
    }
  } catch (e) { /* private mode / disabled storage — nothing to carry */ }
})();
