// tools/playbot/lint.mjs — the layout lint the play bot runs at every screenshot (Hanli 2026-11-05: six cards fanned
// so deep on a 430 pt phone that the cost gems sat on each other, and no test saw it).
//
// In the page: every card, button, cost badge and text element that is drawn is sampled on a grid with
// elementFromPoint — the share of its points where it (or something inside it) is what the eye meets is how much of
// it shows. A control, a cost or a line of text under something else, cut by its box, or off the screen's sides is a
// FAIL; a blank band taller than 100 px between blocks is a WARN. Off the bottom is only an error inside a one-screen
// layer (a fight, a sheet, a fixed bar): the page itself scrolls.
//
// 11-06 (the playbot's second run, 375): a fight's words are measured (its room is a tap spot, `[data-spot=stage]`, and was
// taken for a control, so no word in a fight was read); a bubble that lets taps through is made solid for the measure, so
// what it lies over reads as covered; and a cut sideways is excused only by a scroller that scrolls sideways (切磋's 重腿).

/** The lint, as a function the page runs (page.evaluate(LINT, opts)). Returns { fails: [...], warns: [...] }. */
export const LINT = ({ minShown = 0.9, band = 100, scope = null } = {}) => {
  const W = innerWidth, H = innerHeight;
  // A scratch save's own furniture (the 测试存档 badge, the dev 游戏厅 link): never on a player's page.
  const DEV_ONLY = '.scratch-badge, .dev-arcade';
  // A result laid over a finished fight (败 / 胜, the 完 card) or a pause veil: what is under it is meant to be.
  // The beast's card shown a moment over the field as it plays it (battle-anim.js showFoeCard `.bshown`, a card in flight
  // `.bflight`) stands over the ranks on purpose, on its turn (11-06: 狍鸮 and 夔牛 read as covered by its cost).
  const OVERLAY = '.bover, .closecard, .gshell-veil, [role=dialog], .bshown, .bflight';
  const root = (scope && document.querySelector(scope)) || document.body;
  const vis = (e) => {
    if (!e.getClientRects().length) return false;
    for (let a = e; a && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.05) return false;
    }
    const r = e.getBoundingClientRect();
    return r.width >= 4 && r.height >= 4;
  };
  const label = (e) => {
    const id = e.dataset?.id ?? e.dataset?.spot ?? e.dataset?.pouchItem ?? '';
    const cls = (e.getAttribute('class') || '').split(/\s+/).slice(0, 2).join('.');
    return `${e.tagName.toLowerCase()}${cls ? '.' + cls : ''}${id ? `[${id}]` : ''} «${(e.innerText || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24)}»`;
  };
  // A one-screen layer: what is in it must fit the screen, top to bottom.
  const oneScreen = (e) => {
    for (let a = e; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.position === 'fixed' || cs.position === 'sticky') return true;
      if (a.classList?.contains('battle') || a.classList?.contains('gshell')) return true;
    }
    return false;
  };
  // What is drawn and must be read or pressed.
  const kinds = [
    ['control', 'button, [role=button], [data-spot], a[href], input, select'],
    ['card', '.bcard, .bminion:not(.empty), .ptile'],
    ['cost', '.bcost'],
  ];
  const seen = new Set();
  const items = [];
  for (const [kind, sel] of kinds) {
    for (const e of root.querySelectorAll(sel)) {
      if (seen.has(e) || !vis(e) || e.closest(DEV_ONLY)) continue;
      seen.add(e);
      items.push({ kind, e });
    }
  }
  // A tap spot, as a control: the fight's whole room is one too (`.battle[data-spot=stage]`, a tap on nothing puts a lifted
  // card down) — a surface, not a control its words belong to (11-06: every word in a fight went unmeasured under it, so
  // a bubble over the 杀招's words could not be seen).
  const SPOT = '[data-spot]:not([data-spot=stage])';
  // Text: an element with its own words (a direct text node), not already a control.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent.trim()) continue;
    const e = n.parentElement;
    if (!e || seen.has(e) || e.closest(DEV_ONLY) || e.closest(`button, [role=button], ${SPOT}, script, style, noscript, [aria-hidden=true]`)) continue;
    if (!vis(e)) continue;
    seen.add(e);
    items.push({ kind: 'text', e, node: n });
  }
  const fails = [], warns = [];
  const rects = [];
  const fixedish = (e) => { for (let a = e; a && a !== document.body; a = a.parentElement) { const p = getComputedStyle(a).position; if (p === 'fixed' || p === 'sticky') return true; } return false; };
  // Where an element can be seen: the viewport cut by every ancestor that clips. A scroller's cut is not a fault (it
  // scrolls to it); an overflow:hidden cut is — the words or the control are cut off for good. A cut is excused per axis:
  // sideways only by a scroller laid out to scroll sideways — a row (flex, no wrap; a column-flowing grid; a snap on x; a
  // line that never wraps) or one shut on y. A panel that scrolls down (`.focus`, overflow-y: auto, whose x computes to
  // auto as well) is no way to a key spilled past its right edge: no thumb scrolls a column sideways to find it (the
  // playbot, 11-06 at 375: 切磋's 「重腿」 past the board's right edge, excused by .focus's vertical scroll).
  const rowScroller = (cs) => cs.overflowY === 'hidden' || cs.overflowY === 'clip' || /x|inline/.test(cs.scrollSnapType)
    || (/flex/.test(cs.display) && cs.flexDirection.startsWith('row') && cs.flexWrap === 'nowrap')
    || (/grid/.test(cs.display) && cs.gridAutoFlow.includes('column')) || cs.whiteSpace === 'nowrap';
  const clipOf = (e) => {
    let l = 0, t = 0, r = W, b = H, scrollsX = false, scrollsY = false;
    for (let a = e.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      const ox = cs.overflowX, oy = cs.overflowY;
      if (ox === 'visible' && oy === 'visible') continue;
      const q = a.getBoundingClientRect();
      l = Math.max(l, q.left); t = Math.max(t, q.top); r = Math.min(r, q.right); b = Math.min(b, q.bottom);
      if (/auto|scroll/.test(ox) && rowScroller(cs)) scrollsX = true;
      if (/auto|scroll/.test(oy)) scrollsY = true;
    }
    return { l, t, r, b, scrollsX, scrollsY };
  };
  // A text cut on purpose with an ellipsis (its own `text-overflow: ellipsis` box) is read within that box: the words past
  // the 「…」 are not on the page to be covered (2026-11-05: 「卷一 · 沉…」 read as lying under the place's name).
  const ellipsed = (e) => { const cs = getComputedStyle(e); return cs.textOverflow === 'ellipsis' && cs.overflowX !== 'visible'; };
  const boxesOf = (kind, e, node) => {
    if (kind !== 'text') return [e.getBoundingClientRect()];
    const range = document.createRange();
    range.selectNodeContents(node ?? e);
    const own = ellipsed(e) ? e.getBoundingClientRect() : null;
    return [...range.getClientRects()].map((q) => (own ? new DOMRect(Math.max(q.left, own.left), q.top, Math.max(0, Math.min(q.right, own.right) - Math.max(q.left, own.left)), q.height) : q))
      .filter((q) => q.width > 2 && q.height > 2);
  };
  // In motion (a float rising, a card dealt): read when it lands, not mid-flight.
  const moving = (x) => { for (let a = x; a && a !== document.body; a = a.parentElement) { if (a.getAnimations?.().some((an) => an.playState === 'running')) return true; } return false; };
  // A thing that lets taps through (pointer-events: none — a speech bubble over the room) is never what elementFromPoint
  // meets, so it cannot be measured by it: its place is the page's to choose (2026-11-05: every 银月 line read as covered).
  const passThrough = (x) => getComputedStyle(x).pointerEvents === 'none';
  // A card laid behind another on purpose (`data-peek`: the phone's hand wheel, battle-wheel.js) is read at the centre, a
  // tap away: only its cost must show — on the corner left in view (2026-11-05).
  const peeks = (x) => !!x.closest('[data-peek]');
  // A word laid over the page that lets taps through (a fight's bubble, games/shell.js `.gshell-bubble`) still hides what is
  // under it from the eye: for the measure it is made solid a moment, so elementFromPoint meets it where it lies over
  // something to be read (the playbot, 11-06 at 375: 犰狳's line over its own 杀招's words, unflagged because it was skipped).
  // Only one standing over the page on its own — absolute or fixed, outside any card or control (a badge on its card,
  // `.bfresh`, is the card's), drawn and still (a float in flight is read when it lands).
  const veils = [...document.querySelectorAll('body *')].filter((x) => passThrough(x) && /absolute|fixed/.test(getComputedStyle(x).position)
    && [...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && vis(x) && !moving(x)
    && !x.parentElement?.closest(`button, [role=button], ${SPOT}, .bcard, .bminion`) && !x.closest(DEV_ONLY));
  const solid = veils.map((x) => [x, x.style.pointerEvents]);
  for (const [x] of solid) x.style.setProperty('pointer-events', 'auto');
  try {
  for (const { kind, e, node } of items) {
    if (veils.some((v) => v.contains(e)) || moving(e) || passThrough(e)) continue;
    if (kind !== 'cost' && peeks(e)) continue;
    const r = e.getBoundingClientRect();
    rects.push(r);
    const clip = clipOf(e);
    const lone = oneScreen(e);
    // Off the screen's sides with no scroller to bring it back, or off a one-screen layer.
    const sideOut = !clip.scrollsX && (r.left < -1 || r.right > W + 1);
    const vertOut = lone && !clip.scrollsY && (r.top < -1 || r.bottom > H + 1);
    if (sideOut || vertOut) fails.push({ el_kind: kind, why: 'outside-viewport', el: label(e), rect: [r.left, r.top, r.width, r.height].map(Math.round) });
    let on = 0, hit = 0, cut = 0, all = 0, by = null;
    for (const q of boxesOf(kind, e, node)) {
      for (let i = 0; i < 5; i += 1) {
        for (let j = 0; j < 3; j += 1) {
          const x = q.left + q.width * (0.12 + 0.76 * (i / 4)), y = q.top + q.height * (0.25 + 0.5 * (j / 2));
          all += 1;
          const outX = x < clip.l || x >= clip.r, outY = y < clip.t || y >= clip.b;
          if (outX || outY) { if (((outX && !clip.scrollsX) || (outY && !clip.scrollsY)) && x >= 0 && y >= 0 && x < W && y < H) cut += 1; continue; }
          on += 1;
          const top = document.elementFromPoint(x, y);
          if (top && (top === e || e.contains(top) || top.contains(e))) hit += 1;
          // Under a fixed bar while the page itself scrolls: it can be scrolled out from under it.
          else if (top && fixedish(top) && !lone) hit += 1;
          else if (top && (moving(top) || top.closest(DEV_ONLY) || (top.closest(OVERLAY) && !e.closest(OVERLAY)))) hit += 1;
          else if (top && !by) by = top;
        }
      }
    }
    if (all && cut / all > 1 - minShown) fails.push({ el_kind: kind, why: 'clipped', el: label(e), shown: Math.round((1 - cut / all) * 100) / 100 });
    if (!on) continue;
    const shown = hit / on;
    if (shown < minShown) fails.push({ el_kind: kind, why: 'covered', shown: Math.round(shown * 100) / 100, el: label(e), by: by ? label(by) : null, rect: [r.left, r.top, r.width, r.height].map(Math.round) });
  }
  } finally { for (const [x, was] of solid) x.style.pointerEvents = was; }
  // Blank bands: rows of the screen no drawn thing covers, between two that are covered.
  const rows = new Array(Math.ceil(H)).fill(false);
  for (const r of rects) for (let y = Math.max(0, Math.floor(r.top)); y < Math.min(H, Math.ceil(r.bottom)); y += 1) rows[y] = true;
  for (const img of root.querySelectorAll('img, canvas, svg, video')) {
    if (!vis(img)) continue;
    const r = img.getBoundingClientRect();
    if (r.width * r.height < W * 40) continue; // a full-width backdrop is not content
    for (let y = Math.max(0, Math.floor(r.top)); y < Math.min(H, Math.ceil(r.bottom)); y += 1) rows[y] = true;
  }
  const first = rows.indexOf(true), last = rows.lastIndexOf(true);
  for (let y = first, start = -1; y <= last && first >= 0; y += 1) {
    if (!rows[y] && start < 0) start = y;
    if (rows[y] && start >= 0) { if (y - start > band) warns.push({ why: 'blank-band', top: start, height: y - start }); start = -1; }
  }
  return { fails, warns, checked: items.length };
};
