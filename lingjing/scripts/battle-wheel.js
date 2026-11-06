// battle-wheel.js — the phone's hand as a turning wheel (Hanli 2026-11-05, on a 430 pt iPhone: 「可以做成旋转木马样式的吗?
// 用户可以转着看」). One card at the centre at a readable size; two each side step back, smaller, tilted and dimmer. A swipe
// turns it with momentum and it settles on a card; it goes round only when the hand holds four or more, a smaller hand
// just lies in a line. A side card's tap turns it to the centre; the centre card's tap is the room's (kapai.js plays it or
// asks for a target, as ever). A row of dots under it, one a card, coloured by element with its cost, the centre's marked;
// a dot's tap turns to its card.
//
// Only where the room's CSS says so (`--wheel: 1` on the dock's hand — the phone's room, ≤640 px): the desk's fan is
// untouched. The room redraws its whole markup on every move, so the wheel keeps which card is at the centre (by id,
// then by place) and lays the new markup out again after each draw. The 丹囊 in the action row folds to 「丹 ×N」 when its
// pills do not fit there; the chip opens the tray.

const STEP = [0, 0.52, 0.78, 0.9];       // how far out a card sits, in centre-card widths, by its distance from the centre
const SCALE = [1, 0.8, 0.65, 0.55];
const LIGHT = [1, 0.86, 0.72, 0.6];       // dimmer the further back
const TILT = 10;                          // degrees a step, turned away from the centre
const lerp = (xs, a) => { const i = Math.min(Math.floor(a), xs.length - 2); return xs[i] + (xs[i + 1] - xs[i]) * Math.min(1, a - i); };

export function wireWheel(host, { reduced = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches } = {}) {
  // Outside a page (the rules' own tests mount the room on a bare host) there is nothing to lay out.
  const paged = typeof globalThis.getComputedStyle === 'function' && typeof host?.querySelector === 'function';
  let centre = null, centreId = null, foldOpen = false, drag = null, swallow = false;
  const handOf = () => host.querySelector('.bdock > .bhand');
  const isOn = (hand) => !!hand && getComputedStyle(hand).getPropertyValue('--wheel').trim() === '1';
  const cardsOf = (hand) => [...hand.querySelectorAll(':scope > .bcard')];
  const loops = (n) => n >= 4;
  const wrap = (v, n) => (loops(n) ? ((((v + n / 2) % n) + n) % n) - n / 2 : v);

  function settleCentre(cards) {
    const n = cards.length;
    if (!n) { centre = null; centreId = null; return; }
    const ids = cards.map((c) => c.dataset.id);
    if (centre != null && ids[centre] === centreId) return;
    if (centre != null && centreId != null) {
      // The same card moved (one before it was played): follow it; else the card now in its place.
      const at = ids.map((id, i) => (id === centreId ? i : -1)).filter((i) => i >= 0).sort((a, b) => Math.abs(a - centre) - Math.abs(b - centre))[0];
      centre = at ?? Math.min(centre, n - 1);
    } else {
      const can = cards.findIndex((c) => c.classList.contains('can'));
      centre = n <= 3 ? Math.floor((n - 1) / 2) : Math.max(0, can);
    }
    centreId = ids[centre];
  }

  /* How far apart the cards stand, in the centre card's widths: STEP, opened out (up to 1.6×) when the hand is wider than
     the wheel needs — a card held small by a short hand (a Mac window at 375, the footer and the bars above it) keeps
     each neighbour's cost clear of the card in front (the playbot, 11-05: 22 costs under a nearer leaf at 375). */
  const spread = (hand) => {
    const cw = hand.querySelector(':scope > .bcard.mid')?.offsetWidth || 0;
    if (!cw || !hand.clientWidth) return 1;
    return Math.max(1, Math.min(1.6, (hand.clientWidth / 2 - 0.36 * cw) / (STEP[2] * cw)));
  };
  function layout(hand, shift = 0) {
    const cards = cardsOf(hand), n = cards.length, still = reduced(), k = spread(hand);
    cards.forEach((card, i) => {
      const o = wrap(i - centre - shift, n), a = Math.min(Math.abs(o), 3), s = Math.sign(o);
      const st = card.style;
      st.setProperty('--wx', String(s * lerp(STEP, a) * k));
      st.setProperty('--ws', String(lerp(SCALE, a)));
      st.setProperty('--wl', String(lerp(LIGHT, a)));
      st.setProperty('--wt', `${still ? 0 : -s * Math.min(a, 2) * TILT}deg`);
      st.setProperty('--wz', String(40 - Math.round(a * 10)));
      const mid = Math.abs(o) < 0.5, far = Math.abs(o) > 2.5;
      card.classList.toggle('mid', mid);
      card.classList.toggle('side', !mid);
      card.classList.toggle('r', o > 0 && !mid);
      card.classList.toggle('far', far);
      // Two back, a card shows only a strip: its cost is its dot's (the row under the wheel), never a badge half under the card in front.
      card.classList.toggle('deep', Math.abs(o) > 1.5);
      // Behind another on purpose: its face is read at the centre (the playbot's lint measures its cost only).
      if (mid) card.removeAttribute('data-peek'); else card.setAttribute('data-peek', '');
    });
    const dots = hand.querySelector(':scope > .bwheeldots');
    const on = ((Math.round(centre + shift) % n) + n) % n;
    dots?.querySelectorAll('[data-wheel]').forEach((d, i) => d.classList.toggle('on', i === on));
  }

  function dotsFor(hand, cards) {
    hand.querySelector(':scope > .bwheeldots')?.remove();
    if (cards.length < 2) return;
    const row = document.createElement('div');
    row.className = 'bwheeldots';
    row.innerHTML = cards.map((c, i) => {
      const el = [...c.classList].find((k) => k.startsWith('el-')) ?? 'el-none';
      const cost = c.querySelector('.bcost')?.textContent.trim() ?? '';
      const name = c.querySelector('.bname')?.textContent.trim() ?? '';
      return `<button type="button" class="bdot ${el}${c.classList.contains('dim') ? ' dim' : ''}" data-wheel="${i}" aria-label="${name.replace(/"/g, '&quot;')}">${cost}</button>`;
    }).join('');
    hand.append(row);
  }

  // The tray folds to its chip when the row cannot hold it.
  function fold() {
    const acts = host.querySelector('.bside.you .bacts');
    const pouch = acts?.querySelector(':scope > .bpouch');
    if (!pouch) return;
    acts.classList.remove('fold');
    if (getComputedStyle(pouch).display === 'none') return;
    const tray = pouch.querySelector(':scope > .dn-tray');
    if (acts.scrollWidth > acts.clientWidth + 1 || (tray && tray.scrollWidth > pouch.clientWidth + 1)) acts.classList.add('fold');
    // A pill lifted (回春丹 asking 给谁) keeps it open: the lifted pill stays in sight.
    pouch.classList.toggle('open', (foldOpen || !!pouch.querySelector('.dn-pill.held')) && acts.classList.contains('fold'));
  }

  function apply() {
    if (!paged) return;
    const hand = handOf();
    fold();
    if (!isOn(hand)) { hand?.classList.remove('wheel'); return; }
    const cards = cardsOf(hand);
    settleCentre(cards);
    hand.classList.add('wheel');
    hand.classList.toggle('loops', loops(cards.length));
    dotsFor(hand, cards);
    if (centre != null) layout(hand, drag?.shift ?? 0);
  }

  function turnTo(i) {
    const hand = handOf(), cards = hand ? cardsOf(hand) : [];
    if (!cards.length) return;
    const n = cards.length;
    centre = loops(n) ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i));
    centreId = cards[centre].dataset.id;
    layout(hand);
  }

  const stop = (e) => { e.stopImmediatePropagation(); e.preventDefault(); };
  function onClick(e) {
    if (swallow) { swallow = false; return stop(e); }
    const chip = e.target.closest?.('.dn-fold');
    if (chip && host.contains(chip)) { foldOpen = !foldOpen; stop(e); return fold(); }
    const hand = handOf();
    if (!isOn(hand)) return;
    const dot = e.target.closest?.('[data-wheel]');
    if (dot && host.contains(dot)) { stop(e); return turnTo(Number(dot.dataset.wheel)); }
    const card = e.target.closest?.('.bcard');
    if (card && card.parentElement === hand && !card.classList.contains('mid')) { stop(e); turnTo(cardsOf(hand).indexOf(card)); }
  }

  // A swipe across the hand turns it; an up-and-down one is the page's (touch-action: pan-y on the hand). Touch and pen
  // only: a mouse on a narrow room drags a card to its target as on the desk (battle-drag.js).
  function onDown(e) {
    const hand = handOf();
    if (e.pointerType === 'mouse' || !isOn(hand) || !hand.contains(e.target) || centre == null) return;
    drag = { x0: e.clientX, y0: e.clientY, id: e.pointerId, shift: 0, moved: false, trail: [[e.timeStamp, e.clientX]] };
  }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const hand = handOf(), dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.moved) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
      drag.moved = true;
      hand.classList.add('turning');
    }
    const n = cardsOf(hand).length, unit = stepPx(hand);
    let shift = -dx / unit;
    if (!loops(n)) { const lo = -centre, hi = n - 1 - centre; shift = shift < lo ? lo + (shift - lo) * 0.3 : shift > hi ? hi + (shift - hi) * 0.3 : shift; }
    drag.shift = shift;
    drag.trail.push([e.timeStamp, e.clientX]);
    if (drag.trail.length > 6) drag.trail.shift();
    layout(hand, shift);
  }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag, hand = handOf();
    drag = null;
    if (!d.moved || !hand) return;
    hand.classList.remove('turning');
    // Momentum: the last few moves' speed carries it on a little before it settles on a card.
    const [t0, x0] = d.trail[0], [t1, x1] = d.trail[d.trail.length - 1];
    const v = t1 > t0 ? (x1 - x0) / (t1 - t0) : 0;
    const flung = d.shift + (-v * 220) / stepPx(hand);
    swallow = e.type === 'pointerup';
    setTimeout(() => { swallow = false; }, 400);
    turnTo(centre + Math.round(flung));
  }
  function onCancel(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const hand = handOf(), moved = drag.moved;
    drag = null;
    hand?.classList.remove('turning');
    if (moved && hand) layout(hand);
  }
  const stepPx = (hand) => (hand.querySelector(':scope > .bcard.mid')?.offsetWidth || 160) * STEP[1] * spread(hand);

  const onResize = () => apply();
  host.addEventListener('click', onClick, true);
  host.addEventListener('pointerdown', onDown);
  host.addEventListener('pointermove', onMove);
  host.addEventListener('pointerup', onUp);
  host.addEventListener('pointercancel', onCancel);
  globalThis.addEventListener?.('resize', onResize);
  return {
    apply,
    turnTo,
    centre: () => centre,
    off() {
      host.removeEventListener('click', onClick, true);
      host.removeEventListener('pointerdown', onDown);
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerup', onUp);
      host.removeEventListener('pointercancel', onCancel);
      globalThis.removeEventListener?.('resize', onResize);
    },
  };
}
