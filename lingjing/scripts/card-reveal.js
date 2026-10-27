// card-reveal.js — 得牌: a card gained shows big at the centre of the stage
// (its painting, its name, one line of where it came from), holds, then
// shrinks and flies into the bag chip (Hanli, 2026-10-16: 「同一张牌放大展示,
// 缩小进背包, 然后下一场战斗出现」). Isolated: the page hands it the cards and
// the chip to land on; no rules, no LLM, nothing saved. A tap hurries it on;
// prefers-reduced-motion shows each card still for a moment and lets it go.

import { esc } from './esc.js';

/* The beats of one card, in ms: rise in, then hold — until he taps, as its 「轻点继续」 says (2026-10-16:
   it flew off by itself after 2.4 s, under a hint that said to tap) — then fly to the bag. A tap during
   the rise cuts straight to the flight; reduced motion is a still hold that fades out on the tap. */
export const REVEAL_MS = { rise: 520, fly: 620, gap: 140, fade: 200 };

/// The timeline of one card from its start: when each beat begins. It holds until the tap (`tapped`).
export function revealPlan({ still = false, ms = REVEAL_MS } = {}) {
  if (still) return { rise: 0, hold: 0, flight: ms.fade, still: true };
  return { rise: 0, hold: ms.rise, flight: ms.fly, still: false };
}

/// Where a card stands at `t` ms, tapped at `tapped` (null: not yet): the beat it is in.
export function revealBeat(plan, t, tapped = null) {
  if (tapped == null || t < tapped) return plan.still || t >= plan.hold ? 'hold' : 'rise';
  if (t >= tapped + plan.flight) return 'done';
  return plan.still ? 'hold' : 'fly';
}

const ELEMENT_WORD = {
  zh: { metal: '金', wood: '木', water: '水', fire: '火', earth: '土' },
  en: { metal: 'Metal', wood: 'Wood', water: 'Water', fire: 'Fire', earth: 'Earth' },
};
const WORDS = {
  zh: { got: '得', minion: '灵兽', spell: '功法', pill: '丹', charm: '符', thing: '物', tap: '轻点继续', into: '收进了储物袋' },
  en: { got: 'Gained', minion: 'Beast', spell: 'Art', pill: 'Pill', charm: 'Charm', thing: 'Thing', tap: 'Tap to go on', into: 'into the pouch' },
};
const kindWord = (c, w) => (c.pill ? w.pill : c.charm ? w.charm : w[c.kind] ?? '');
const nameOf = (n, lang) => (typeof n === 'string' ? n : n?.[lang] ?? n?.zh ?? '');

/// The big card's face. `card` is a cards.json row (or its brief: id, name,
/// kind, cost, element, atk, hp, art); `line` the one line of where it came from.
export function revealHtml(card, { lang = 'zh', line = '', artBase = '' } = {}) {
  const w = WORDS[lang] ?? WORDS.zh, el = card.element ?? 'none';
  const elWord = card.element ? ELEMENT_WORD[lang]?.[card.element] ?? '' : '';
  const body = card.atk != null ? `<span class="rv-atk">${esc(card.atk)}</span><span class="rv-hp">${esc(card.hp)}</span>` : '';
  return `<div class="rv-card" data-el="${esc(el)}">
    <div class="rv-paper">
      <span class="rv-cost">${esc(card.cost ?? '')}</span>
      <div class="rv-art">${card.art ? `<img src="${esc(artBase)}${esc(card.art)}" alt="">` : ''}</div>
      <div class="rv-name">${esc(nameOf(card.name, lang))}</div>
      <div class="rv-kind">${esc([elWord, kindWord(card, w)].filter(Boolean).join(' · '))}</div>
      ${body}
    </div>
    <span class="rv-seal" aria-hidden="true">${esc(w.got)}</span>
  </div>
  ${line ? `<p class="rv-line">${esc(line)}</p>` : ''}
  <p class="rv-tap">${esc(w.tap)}</p>`;
}

/* The flight's transform: from the card's centre to the chip's, shrunk to the chip. */
function flyTo(cardEl, target) {
  const a = cardEl.getBoundingClientRect(), b = target?.getBoundingClientRect?.();
  if (!b || !b.width || !a.width) return 'translateY(40vh) scale(.1)'; // a chip not on the page measures 0 at 0,0
  const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const k = Math.max(0.06, Math.min(b.width / a.width, b.height / a.height));
  return `translate(${dx}px, ${dy}px) scale(${k}) rotate(-6deg)`;
}

const wait = ms => new Promise(r => setTimeout(r, ms));

/* One card, start to finish, on `host`. Resolves when it has landed. */
function playOne(host, card, opts) {
  const still = opts.still, plan = revealPlan({ still });
  const veil = document.createElement('div');
  veil.className = `rv-veil${still ? ' still' : ''}`;
  veil.setAttribute('role', 'dialog');
  veil.dataset.reveal = card.id ?? '';
  veil.setAttribute('aria-label', `${(WORDS[opts.lang] ?? WORDS.zh).got} ${nameOf(card.name, opts.lang)}`);
  veil.innerHTML = revealHtml(card, { ...opts, line: card.line ?? opts.line ?? '' });
  host.appendChild(veil);
  return new Promise(resolve => {
    let flown = false;
    // The chip is found as the card flies, not when it rose: the page may redraw its footer while the card
    // waits for his tap, and the chip it held then is off the page (10-26: 狰's card flew to the top-left).
    const chip = () => (typeof opts.target === 'function' ? opts.target() : opts.target);
    const land = () => {
      const t = chip();
      t?.classList.add('rv-landed');
      setTimeout(() => t?.classList.remove('rv-landed'), 500);
      veil.remove();
      resolve();
    };
    const fly = () => {
      if (flown) return;
      flown = true;
      if (still) { veil.classList.add('out'); setTimeout(land, REVEAL_MS.fade); return; }
      const cardEl = veil.querySelector('.rv-card');
      cardEl.style.setProperty('--fly', flyTo(cardEl, chip()));
      veil.classList.add('fly');
      setTimeout(land, REVEAL_MS.fly);
    };
    // It waits for his tap (its hint says so): during the rise or the hold, straight to the flight.
    veil.addEventListener('pointerdown', fly);
    veil.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') fly(); });
    veil.tabIndex = 0;
    veil.focus?.({ preventScroll: true });
  });
}

/// Play each card gained, one after another, over `host` (the stage), landing
/// on `target` (the bag chip, or a function that finds it as the card flies). `cards`: [{...card, line}]. Resolves when done.
export async function revealCards(cards, { host, target = null, lang = 'zh', artBase = '', still = null } = {}) {
  if (!host || !cards?.length) return;
  const reduced = still ?? (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  for (const [i, card] of cards.entries()) {
    if (i) await wait(REVEAL_MS.gap);
    await playOne(host, card, { lang, artBase, still: reduced, target });
  }
}
