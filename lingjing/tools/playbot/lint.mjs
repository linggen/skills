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
export const LINT = ({ minShown = 0.9, band = 100, scope = null, cardFloor = 120, bodyFloor = 56 } = {}) => {
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
  // DECLARED summary clamps: a line clamp that was chosen on purpose, whose whole line is one tap away. A cut by one is a
  // SOFT `summary-clamp` finding (the reviewer puts one question to the owner on 试玩台 unless rulings.jsonl already
  // answers it), never a hard `ellipsis-cut`. Keep this list short: each entry a selector and its one-line reason; anything
  // not on it that an ellipsis or a clamp cuts is hard.
  const SUMMARY_CLAMPS = [
    { sel: '#tray .card.task.agenda .tsteps, #tray .card.task.agenda .tpay', reason: 'the tray card is the head of the 事 list (lingjing.css, 1df2ced41, 2026-11-04); the whole line is one tap away in the book' },
  ];
  // Words cut by an ellipsis (the gate's playbot, 2026-11-19 at 375: the footer's 「还有：…」 — the name of what waits cut
  // away whole, and nothing above saw it: the 「…」 sat inside the chip's own box, so no box lay over anything). Hanli's
  // ruling for this game (2026-11-08): 「折行可以，不截断就好」 — text may wrap, it is never cut. A shown element whose
  // `text-overflow: ellipsis` box holds more than it shows (scrollWidth > clientWidth), or whose line clamp hides lines
  // (scrollHeight > clientHeight), is a FAIL; the dev-only furniture is excused, as everywhere above.
  for (const e of root.querySelectorAll('*')) {
    if (e.closest(DEV_ONLY) || !vis(e) || moving(e)) continue;
    const cs = getComputedStyle(e);
    const wide = cs.textOverflow === 'ellipsis' && cs.overflowX !== 'visible' && e.scrollWidth - e.clientWidth > 1;
    const tall = cs.webkitLineClamp && cs.webkitLineClamp !== 'none' && e.scrollHeight - e.clientHeight > 1;
    if (!wide && !tall) continue;
    const r = e.getBoundingClientRect();
    const found = { el_kind: 'text', el: label(e), by: wide ? 'text-overflow' : 'line-clamp',
      text: (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60), rect: [r.left, r.top, r.width, r.height].map(Math.round) };
    // A declared summary clamp (SUMMARY_CLAMPS) is the owner's to rule on: a soft finding, never silenced, never hard.
    const declared = tall && !wide ? SUMMARY_CLAMPS.find((c) => e.matches(c.sel)) : null;
    if (declared) warns.push({ ...found, why: 'summary-clamp', reason: declared.reason });
    else fails.push({ ...found, why: 'ellipsis-cut' });
  }
  // A TAB ROW read whole (the gate's playbot, 2026-11-19 at 375: the bag's 「剧情 13」 read 「剧情 1」 — a wrong count, in a
  // sideways scroller with its scrollbar hidden, so nothing said more was there; the scroller's excuse above let it by). The
  // rule is for a `role=tablist` that clips (overflow-x not visible): any tab of it that lies past the row's box, cut at an
  // edge or hidden whole, is a FAIL. A tab row is a choice among labels, read whole and never swiped. It does not fire on the
  // rows meant to be swiped — the tray of cards, the hand, the roads row, the footer chips — for none is a tablist, and the
  // cut child there is itself the sign that more is to come.
  for (const row of root.querySelectorAll('[role=tablist]')) {
    if (row.closest(DEV_ONLY) || !vis(row) || /^(visible)$/.test(getComputedStyle(row).overflowX)) continue;
    const q = row.getBoundingClientRect();
    for (const tab of row.children) {
      if (!vis(tab) || moving(tab)) continue;
      const r = tab.getBoundingClientRect();
      if (r.right > q.right + 1 || r.left < q.left - 1) {
        fails.push({ el_kind: 'tab', why: 'tab-cut', el: label(tab), text: (tab.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40),
          shown: Math.round(Math.max(0, Math.min(r.right, q.right) - Math.max(r.left, q.left)) / (r.width || 1) * 100) / 100,
          rect: [r.left, r.top, r.width, r.height].map(Math.round), row: [q.left, q.top, q.width, q.height].map(Math.round) });
      }
    }
  }
  // A FIELD CARD (a body on a rank: `.brank > .bminion`) whole (the gate's playbot, 2026-11-19 at 1280×820, the beast's two-line
  // 杀招 banner up: the field gave the ranks ~30 px, 土墙's name was gone, 「护主 · 不出手」 sat under its cost gem, 「已出手」 read
  // 「手」 — and nothing above saw it: a card is a tap spot, so its words are never measured, and one card's parts lie over each
  // other inside its own box). Two hard findings, both only on `.brank > .bminion` — never the hand's cards, which overlap by
  // design (the fan): `rank-too-short`, a body shorter than `bodyFloor` px (56: the rank floor --mmin 60 less the row's 4 px of padding — the
  // name's row, the status label above it and both gems each have a line of their own at that height; the phone's is 70); and `field-card-overlap`, any two of its parts — the name's words, the
  // status label, the 攻 and 血 gems — whose boxes cross. An empty slot's circle cut at its top or bottom by a rank row lower
  // than it is `rank-too-short` as well (el_kind slot).
  for (const rank of root.querySelectorAll('.battle .brank')) {
    if (rank.closest('.battle.over') || !vis(rank) || moving(rank)) continue;
    for (const slot of rank.querySelectorAll(':scope > .bminion.empty')) {
      const dot = slot.querySelector('i');
      if (!dot || !vis(slot) || !vis(dot)) continue;
      const sr = slot.getBoundingClientRect(), dr = dot.getBoundingClientRect();
      if (dr.top < sr.top - 1 || dr.bottom > sr.bottom + 1) fails.push({ el_kind: 'slot', why: 'rank-too-short', el: label(slot), size: [sr.width, sr.height].map(Math.round), circle: Math.round(dr.height), rect: [sr.left, sr.top, sr.width, sr.height].map(Math.round) });
    }
    const bodies = [...rank.querySelectorAll(':scope > .bminion:not(.empty)')].filter(vis);
    for (const b of bodies) {
      const r = b.getBoundingClientRect();
      if (r.height < bodyFloor - 0.5) fails.push({ el_kind: 'card', why: 'rank-too-short', el: label(b), floor: bodyFloor, size: [r.width, r.height].map(Math.round), rect: [r.left, r.top, r.width, r.height].map(Math.round) });
      const parts = [];
      for (const [name, sel] of [['name', '.bname'], ['status', 'small'], ['atk', '.batk'], ['hp', '.bhp']]) {
        const part = b.querySelector(sel);
        if (!part || !vis(part)) continue;
        let q = part.getBoundingClientRect();
        if (name === 'name') { const range = document.createRange(); range.selectNodeContents(part); const rs = [...range.getClientRects()].filter((x) => x.width > 2 && x.height > 2); if (!rs.length) continue; q = rs.reduce((a, x) => new DOMRect(Math.min(a.left, x.left), Math.min(a.top, x.top), Math.max(a.right, x.right) - Math.min(a.left, x.left), Math.max(a.bottom, x.bottom) - Math.min(a.top, x.top)), rs[0]); }
        parts.push({ name, q });
      }
      for (let i = 0; i < parts.length; i += 1) for (let j = i + 1; j < parts.length; j += 1) {
        const a = parts[i].q, c = parts[j].q;
        const w = Math.min(a.right, c.right) - Math.max(a.left, c.left), h = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
        if (w > 2 && h > 2) fails.push({ el_kind: 'card', why: 'field-card-overlap', el: label(b), parts: [parts[i].name, parts[j].name], overlap: [Math.round(w), Math.round(h)], rect: [r.left, r.top, r.width, r.height].map(Math.round) });
      }
    }
  }
  // The hand's card big enough to read (the gate's playbot, 11-07 at 375: the 杀招 line, both ranks full and the 丹 row at
  // once squeezed the wheel's centre card to 65×90 — its name cut, its words under its 「气血已满」, and nothing above saw it,
  // for nothing lay over anything). In a fight, the card a thumb reads — the phone wheel's centre (battle-wheel.js: the one
  // card without `data-peek`), or on the desk's fan the tallest — is at least `cardFloor` px tall.
  for (const hand of root.querySelectorAll('.battle .bhand')) {
    if (!vis(hand) || hand.closest('.battle.over')) continue;
    const cards = [...hand.querySelectorAll(':scope > .bcard')].filter((c) => vis(c) && !c.classList.contains('far'));
    if (!cards.length) continue;
    const wheel = hand.classList.contains('wheel');
    const read = wheel ? cards.find((c) => !c.hasAttribute('data-peek')) : cards.reduce((a, c) => (c.getBoundingClientRect().height > a.getBoundingClientRect().height ? c : a));
    if (!read || moving(read)) continue;
    const r = (read.querySelector('.bleaf') ?? read).getBoundingClientRect();
    if (r.height < cardFloor - 0.5) fails.push({ el_kind: 'card', why: 'hand-too-small', el: label(read), floor: cardFloor, size: [r.width, r.height].map(Math.round), rect: [r.left, r.top, r.width, r.height].map(Math.round) });
  }
  // Blank bands: rows of the screen no drawn thing covers, between two that are covered.
  const rows = new Array(Math.ceil(H)).fill(false);
  for (const r of rects) for (let y = Math.max(0, Math.floor(r.top)); y < Math.min(H, Math.ceil(r.bottom)); y += 1) rows[y] = true;
  for (const img of root.querySelectorAll('img, canvas, svg, video')) {
    if (!vis(img)) continue;
    const r = img.getBoundingClientRect();
    if (r.width * r.height < W * 40) continue; // a full-width backdrop is not content
    for (let y = Math.max(0, Math.floor(r.top)); y < Math.min(H, Math.ceil(r.bottom)); y += 1) rows[y] = true;
  }
  // CSS can draw content without words or an image node (empty slot circles, frames, and meter bars).
  // Count the painted box, not its layout wrapper; a broad wash behind the page is not content.
  const hasInk = (color) => color && color !== 'transparent' && !/(?:^rgba\([^)]*,|\/)\s*0(?:\.0+)?%?\s*\)$/.test(color);
  for (const e of root.querySelectorAll('*')) {
    if (seen.has(e) || e.textContent.trim() || e.closest(DEV_ONLY) || !vis(e)) continue;
    const cs = getComputedStyle(e);
    const paints = cs.backgroundImage !== 'none' || hasInk(cs.backgroundColor)
      || ['Top', 'Right', 'Bottom', 'Left'].some((side) => parseFloat(cs[`border${side}Width`]) > 0
        && !/^(none|hidden)$/.test(cs[`border${side}Style`]) && hasInk(cs[`border${side}Color`]));
    if (!paints) continue;
    const r = e.getBoundingClientRect();
    if (r.width >= W * 0.9 && r.height > band) continue;
    const clip = clipOf(e);
    if (Math.min(r.right, clip.r) <= Math.max(r.left, clip.l)) continue;
    const t = Math.max(r.top, clip.t), b = Math.min(r.bottom, clip.b);
    if (b <= t) continue;
    for (let y = Math.max(0, Math.floor(t)); y < Math.min(H, Math.ceil(b)); y += 1) rows[y] = true;
  }
  const first = rows.indexOf(true), last = rows.lastIndexOf(true);
  for (let y = first, start = -1; y <= last && first >= 0; y += 1) {
    if (!rows[y] && start < 0) start = y;
    if (rows[y] && start >= 0) { if (y - start > band) warns.push({ why: 'blank-band', top: start, height: y - start }); start = -1; }
  }
  return { fails, warns, checked: items.length };
};
