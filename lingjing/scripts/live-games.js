// live-games.js — the clock and the hold for a game that runs in time.
// The game modules (scripts/games/<id>.js) are pure: newGame / html / act.
// A module that also exports `tick(state, ms)` runs in time while its state is
// `live` (暴雨, 射鹿, 洗髓, 小周天 — 2026-09-30): this steps it and repaints
// only its own [data-game] host, never the page. A control marked
// [data-g-hold] is pressed and held: pointerdown sends {g:'hold', …its data},
// pointerup or cancel anywhere sends {g:'release'} — a finger may slide off
// the button while it holds. Taps stay [data-g], routed by the page as before.
// A control marked [data-g-drag] is a hold that also moves (吹鹅毛, 2026-10-14:
// the breath let out as a slow, steady stroke): while it is held, every
// pointermove sends {g:'move', d} — the distance in CSS pixels since the last
// one — and the game reads its own pace from them.
// A plain tap ([data-g]) on a game that is running in time acts on POINTERDOWN, here
// (2026-10-15, 黑地十一步: 「怎么都没法落脚」 — a tap landed on a button the clock had just
// replaced, made no click, and the ones that did counted at the finger's lift, not its fall).
// The click that follows is swallowed (tapGate) so the page's [data-g] route never acts twice;
// a keyboard Enter/Space has no pointerdown before it and goes the page's way as ever.
// Games not running in time keep the page's click path untouched.
// The clock steps every 50 ms (was 100: a swinging mark jumped too far to read).
// A repaint lays the new html INTO the old nodes (morph), so a button keeps its identity and
// focus, and a CSS transition on a moving part runs between ticks.
// `paused()` (the 回看 log open over the board): the clock stops and the board takes no input.
// A control marked [data-g-swipe] is also taken when a pressed pointer is drawn across it (a
// swipe through 喂饼's vines, 2026-10-16), once per stroke.
// Nothing here knows a game; the win goes back through `onWon`.

/** A game that runs in time right now: its taps are taken on pointerdown. */
export const runsLive = (g) => Boolean(g?.mod?.tick && g.state?.live && !g.state.won && !g.state.wait);

/** The swallow, pure: `down(id)` notes a tap acted on at pointerdown on the board `id`;
    `click(id, now)` answers true for the one click that follows it on that board (the finger's
    lift), once. Keyed by the board's id, not its node: the page may redraw the host between. */
export function tapGate(windowMs = 1500) {
  let pending = null;
  return {
    down(id, now = Date.now()) { pending = id ? { id, at: now } : null; },
    click(id, now = Date.now()) {
      if (!pending) return false;
      const hit = pending.id === id && now - pending.at <= windowMs;
      pending = null;
      return hit;
    },
  };
}

/** Lay `html` into `host` keeping the nodes that stay the same kind (tag), so they keep focus,
    listeners and running transitions; what changed kind is replaced. */
export function morph(host, html) {
  const doc = host.ownerDocument;
  if (!doc?.createElement || !host.childNodes) { host.innerHTML = html; return; } // a stand-in host
  const tpl = doc.createElement('template');
  tpl.innerHTML = html;
  sync(host, tpl.content);
}
function sync(old, next) {
  const a = [...old.childNodes], b = [...next.childNodes];
  b.forEach((nb, i) => {
    const oa = a[i];
    if (!oa) { old.appendChild(nb); return; }
    if (oa.nodeType !== nb.nodeType || oa.nodeName !== nb.nodeName) { old.replaceChild(nb, oa); return; }
    if (nb.nodeType !== 1) { if (oa.nodeValue !== nb.nodeValue) { oa.nodeValue = nb.nodeValue; bump(old); } return; }
    for (const { name } of [...oa.attributes]) if (!nb.hasAttribute(name)) oa.removeAttribute(name);
    for (const { name, value } of [...nb.attributes]) if (oa.getAttribute(name) !== value) oa.setAttribute(name, value);
    sync(oa, nb);
  });
  for (let i = a.length - 1; i >= b.length; i--) a[i].remove();
}

const calm = () => Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
/* A count in a board's head that changed (满盆 3 → 4, 记号, 担 …) bumps once — the number on every
   hit (2026-10-16). Web Animations, so the next repaint's attribute sync never cuts it short. */
const BUMPS = '.g-head b, .g-count, .g-track-count b';
function bump(el) {
  if (calm() || !el?.matches?.(BUMPS) || !el.animate) return;
  el.animate([{ transform: 'scale(1.45)', color: 'var(--seal)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'ease-out' });
}
/* An ink ring where the finger went down on a game's control: every press answers at once, before
   the game's own picture moves. A node of its own on the body, gone when its ring has spread. */
export function tapInk(doc, x, y) {
  if (calm() || !doc?.body) return;
  const i = doc.createElement('i');
  i.className = 'g-tapink';
  i.style.left = `${x}px`;
  i.style.top = `${y}px`;
  doc.body.appendChild(i);
  setTimeout(() => i.remove(), 500);
}

export function wireLiveGames({ boardFor, lang, onWon, paused = () => false, step = 50 }) {
  let last = performance.now();
  let held = null;

  // Only what changed is laid again (2026-10-14, 千米: before 起跑 the clock repainted the board
  // every 100 ms with the same html, and a real tap — the button pressed, then let go on its
  // fresh copy — never made a click: 「起跑」 did nothing). Each host keeps the html it was last given.
  // A host the page drew itself holds the html of the state it was drawn from: noted (`seen`)
  // before that state moves on.
  const drawn = new WeakMap();
  const seen = (host, g) => { if (!drawn.has(host)) drawn.set(host, g.mod.html(g.state, lang())); };
  const paint = (host, g) => {
    if (!host.isConnected) return;
    const html = g.mod.html(g.state, lang());
    if (drawn.get(host) === html) return;
    drawn.set(host, html);
    morph(host, html);
  };
  const settle = (g) => {
    if (g.state?.won && !g.sent) onWon(g);
  };
  // A move is judged at the moment it is made, not at the last tick (up to a step old): the
  // game's clock is first brought up to now, and the next tick gives it only the rest.
  const ahead = new WeakMap();
  const catchUp = (g) => {
    if (!runsLive(g)) return;
    const lead = Math.min(250, performance.now() - last) - (ahead.get(g) ?? 0);
    if (lead <= 0) return;
    g.state = g.mod.tick(g.state, lead);
    ahead.set(g, (ahead.get(g) ?? 0) + lead);
  };
  const apply = (h, data) => {
    seen(h.host, h.g);
    catchUp(h.g);
    const r = h.g.mod.act(h.g.state, data);
    h.g.state = r.state;
    paint(h.host, h.g);
    settle(h.g);
  };

  setInterval(() => {
    const now = performance.now();
    const dt = Math.min(250, now - last);
    last = now;
    if (document.visibilityState !== 'visible' || paused()) return;
    for (const host of document.querySelectorAll('[data-game]')) {
      const g = boardFor(host.dataset.game);
      if (!g?.mod?.tick || !g.state?.live || g.state.won) { if (g) ahead.delete(g); continue; }
      seen(host, g);
      const own = dt - (ahead.get(g) ?? 0);
      ahead.delete(g);
      if (own > 0) g.state = g.mod.tick(g.state, own);
      paint(host, g);
      settle(g);
    }
  }, step);

  // Every press on any board's control (in time or not) leaves its ink ring.
  document.addEventListener('pointerdown', (e) => {
    if (paused() || e.button !== 0) return;
    const el = e.target.closest?.('[data-g],[data-g-hold],[data-g-drag]');
    if (el && !el.disabled && el.closest('[data-game]')) tapInk(document, e.clientX, e.clientY);
  });

  // A tap on a game running in time: acted on as the finger goes down.
  const gate = tapGate();
  document.addEventListener('pointerdown', (e) => {
    gate.down(null);
    if (paused() || e.button !== 0 || e.isPrimary === false) return;
    const el = e.target.closest?.('[data-g]');
    const host = el?.closest('[data-game]');
    if (!host || el.disabled) return;
    const g = boardFor(host.dataset.game);
    if (!runsLive(g)) return;
    gate.down(host.dataset.game);
    apply({ g, host }, { ...el.dataset });
  });
  document.addEventListener('click', (e) => {
    // A keyboard click (detail 0) never follows a pointerdown: the page's route takes it.
    if (!gate.click(e.target.closest?.('[data-game]')?.dataset.game) || e.detail === 0) return;
    e.stopImmediatePropagation();
    e.preventDefault();
  }, true);

  document.addEventListener('pointerdown', (e) => {
    if (paused()) return;
    const el = e.target.closest?.('[data-g-hold],[data-g-drag]');
    const host = el?.closest('[data-game]');
    if (!host || el.disabled) return;
    const g = boardFor(host.dataset.game);
    if (!g?.mod || g.state?.won) return;
    e.preventDefault();
    held = { g, host, drag: el.hasAttribute('data-g-drag'), x: e.clientX, y: e.clientY };
    // A stroke is captured by the host, which outlives the repaints of what is in it.
    if (held.drag) try { host.setPointerCapture(e.pointerId); } catch { /* an old browser: the document still hears it */ }
    apply(held, { ...el.dataset, g: 'hold' });
  });
  document.addEventListener('pointermove', (e) => {
    if (!held?.drag) return;
    const d = Math.hypot(e.clientX - held.x, e.clientY - held.y);
    held.x = e.clientX;
    held.y = e.clientY;
    if (!d) return;
    held.host = document.querySelector(`[data-game="${CSS.escape(held.g.taskId)}"]`) ?? held.host;
    apply(held, { g: 'move', d });
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
  // A swipe (喂饼's vines, 2026-10-16: 割绳子's cut): a finger or mouse pressed and drawn across a
  // control marked [data-g-swipe] acts on it as a tap, once per control per stroke. The press
  // itself goes the tap's way above. The board's own CSS sets touch-action so the stroke is not
  // taken for a scroll.
  let swipe = null;
  document.addEventListener('pointerdown', (e) => {
    swipe = e.button === 0 && e.target.closest?.('[data-game]') ? new Set() : null;
  });
  document.addEventListener('pointermove', (e) => {
    if (!swipe || paused() || !(e.buttons & 1)) return;
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-g-swipe]');
    const host = el?.closest('[data-game]');
    if (!host || el.disabled) return;
    const key = `${host.dataset.game}|${JSON.stringify(el.dataset)}`;
    const g = boardFor(host.dataset.game);
    if (swipe.has(key) || !runsLive(g)) return;
    swipe.add(key);
    apply({ g, host }, { ...el.dataset });
  });
  const endSwipe = () => { swipe = null; };
  document.addEventListener('pointerup', endSwipe);
  document.addEventListener('pointercancel', endSwipe);
  // A long press must not open the phone's menu over the game.
  document.addEventListener('contextmenu', (e) => {
    if (e.target.closest?.('[data-g-hold],[data-g-drag]')) e.preventDefault();
  });
}
