// live-games.js — the clock and the hold for a game that runs in time.
// The game modules (scripts/games/<id>.js) are pure: newGame / html / act.
// A module that also exports `tick(state, ms)` runs in time while its state is
// `live` (暴雨, 射鹿, 洗髓, 小周天 — 2026-09-30): this steps it and repaints
// only its own [data-game] host, never the page. A control marked
// [data-g-hold] is pressed and held: pointerdown sends {g:'hold', …its data},
// pointerup or cancel anywhere sends {g:'release'} — a finger may slide off
// the button while it holds. Taps stay [data-g], routed by the page as before.
// Nothing here knows a game; the win goes back through `onWon`.

export function wireLiveGames({ boardFor, lang, onWon, step = 100 }) {
  let last = performance.now();
  let held = null;

  const paint = (host, g) => {
    if (host.isConnected) host.innerHTML = g.mod.html(g.state, lang());
  };
  const settle = (g) => {
    if (g.state?.won && !g.sent) onWon(g);
  };
  const apply = (h, data) => {
    const r = h.g.mod.act(h.g.state, data);
    h.g.state = r.state;
    paint(h.host, h.g);
    settle(h.g);
  };

  setInterval(() => {
    const now = performance.now();
    const dt = Math.min(250, now - last);
    last = now;
    if (document.visibilityState !== 'visible') return;
    for (const host of document.querySelectorAll('[data-game]')) {
      const g = boardFor(host.dataset.game);
      if (!g?.mod?.tick || !g.state?.live || g.state.won) continue;
      g.state = g.mod.tick(g.state, dt);
      paint(host, g);
      settle(g);
    }
  }, step);

  document.addEventListener('pointerdown', (e) => {
    const el = e.target.closest?.('[data-g-hold]');
    const host = el?.closest('[data-game]');
    if (!host || el.disabled) return;
    const g = boardFor(host.dataset.game);
    if (!g?.mod || g.state?.won) return;
    e.preventDefault();
    held = { g, host };
    apply(held, { ...el.dataset, g: 'hold' });
  });
  const up = () => {
    if (!held) return;
    const h = held;
    held = null;
    // The host may have been repainted under the finger: find it again.
    h.host = document.querySelector(`[data-game="${CSS.escape(h.g.taskId)}"]`) ?? h.host;
    apply(h, { g: 'release' });
  };
  document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', up);
  // A long press must not open the phone's menu over the game.
  document.addEventListener('contextmenu', (e) => {
    if (e.target.closest?.('[data-g-hold]')) e.preventDefault();
  });
}
