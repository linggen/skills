// battle-anim.js — 斗法 v3 的动作. The rules already write down everything that
// happened, in order, as a log; this replays that log on the screen so a fight
// LOOKS like a fight: a card flies out of the hand, a number leaps off what it
// hit, a body that is driven off drifts away, the beast leans in when it acts.
//
// One rule holds it together: ANIMATION NEVER DECIDES ANYTHING. It reads the
// log after the fact and draws it. If every animation here were deleted the
// fight would play out identically, only instantly — which is also the escape
// hatch: `skip()` is a real setting, not a nicety, for a phone on a bad day
// and for anyone who finds motion unpleasant.

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* How long each beat takes. Tuned so a whole exchange lands in about a second:
   this is a game you open for six minutes, not an epic. */
export const BEATS = { card: 260, hit: 340, withdraw: 520, banner: 620, draw: 280, gap: 90, stroke: 240, splash: 1300 };

const q = (root, sel) => root.querySelector(sel);

/* Where a thing lives on screen, so a number can leap off it. A body driven
   off in this stretch is gone from the room already; its ink ghost stands in. */
function spotOf(root, t) {
  if (t.act === 'hurt' || t.act === 'heal') return q(root, t.who === 'foe' ? '.bside.foe .bplate' : '.bside.you .bwho') ?? q(root, t.who === 'foe' ? '.bside.foe' : '.bside.you');
  if (t.id) {
    const side = t.who === 'foe' ? 'theirs' : 'mine', id = CSS.escape(t.id);
    return q(root, `.brank.${side} [data-id="${id}"]`) ?? q(root, `.bghost.${side}[data-id="${id}"]`) ?? q(root, `.brank.${side}`);
  }
  return null;
}

/* A point in the room, from a box on the screen. */
const inRoom = (root, el) => {
  const a = el.getBoundingClientRect(), h = root.getBoundingClientRect();
  return { x: a.left - h.left, y: a.top - h.top, w: a.width, h: a.height };
};

/* Where a move came from, on the room as it stood before it was drawn again:
   the body that struck, the seal, the card leaving the hand, or the beast. */
const ORIGIN = {
  attack: (by) => `.brank.${by.who === 'foe' ? 'theirs' : 'mine'} [data-index="${by.action.index}"]`,
  power: (by) => (by.who === 'foe' ? '.bside.foe .bplate' : '[data-spot="power"]'),
  play: (by) => (by.who === 'foe' ? '.bside.foe .bplate' : `[data-spot="hand"][data-index="${by.action.index}"]`),
};

/* Read BEFORE the room is drawn again (lingjing.js playOut): each body this
   stretch drives off, cloned where it stood — its going is drawn as ink
   dissolving, not as a gap — and where the move began, for the stroke. */
export function ghostsOf(root, entries, by = null) {
  if (!root) return { bodies: [], from: null };
  const taken = new Set();
  const bodies = entries.filter(t => t.act === 'withdrew').map((t) => {
    const side = t.who === 'foe' ? 'theirs' : 'mine';
    const el = [...root.querySelectorAll(`.brank.${side} [data-id="${CSS.escape(t.id)}"]`)].find(n => !taken.has(n));
    if (!el) return null;
    taken.add(el);
    return { side, id: t.id, html: el.outerHTML, box: inRoom(root, el) };
  }).filter(Boolean);
  const at = by && ORIGIN[by.action?.kind] ? root.querySelector(ORIGIN[by.action.kind](by)) : null;
  return { bodies, from: at ? inRoom(root, at) : null };
}

/* The ghosts stood back up in the new room, still, until their beat comes. */
function raiseGhosts(root, ghosts) {
  for (const g of ghosts?.bodies ?? []) {
    const box = document.createElement('div');
    box.innerHTML = g.html;
    const el = box.firstElementChild;
    if (!el) continue;
    el.classList.remove('can', 'held', 'aimed');
    el.classList.add('bghost', g.side);
    el.removeAttribute('data-spot');
    Object.assign(el.style, { left: `${g.box.x}px`, top: `${g.box.y}px`, width: `${g.box.w}px`, height: `${g.box.h}px` });
    root.appendChild(el);
  }
}

/* A body driven off: its ghost goes to ink and is gone (never a death —
   nothing dies in this world; the ink only takes it off the board). */
function dissolve(root, t) {
  const el = q(root, `.bghost.${t.who === 'foe' ? 'theirs' : 'mine'}[data-id="${CSS.escape(t.id)}"]:not(.going)`);
  if (!el) return false;
  el.classList.add('going');
  setTimeout(() => el.remove(), BEATS.withdraw + 200);
  return true;
}

/* The brush stroke of a blow: from where it began to what it hits, one tapered
   line of ink drawn across and lifted off. */
async function stroke(root, from, el) {
  if (!from || !el) return;
  const to = inRoom(root, el);
  const a = { x: from.x + from.w / 2, y: from.y + from.h / 2 }, b = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
  const s = document.createElement('i');
  s.className = 'bstroke';
  Object.assign(s.style, { left: `${a.x}px`, top: `${a.y}px`, width: `${Math.hypot(b.x - a.x, b.y - a.y)}px`, transform: `rotate(${Math.atan2(b.y - a.y, b.x - a.x)}rad)` });
  root.appendChild(s);
  await sleep(BEATS.stroke);
  setTimeout(() => s.remove(), 400);
}

/* The 杀招 let go: ink thrown across the whole stage, its name in it. */
async function splash(root, name) {
  const s = document.createElement('div');
  s.className = 'bsplash';
  s.innerHTML = `<i></i><i></i><i></i><b></b>`;
  s.querySelector('b').textContent = name ?? '';
  root.appendChild(s);
  await sleep(BEATS.splash);
  setTimeout(() => s.remove(), 500);
}

/* A number that leaps off what it hit and fades — the one piece of feedback a
   card game cannot do without. */
function float(root, el, text, kind) {
  if (!el) return;
  const box = el.getBoundingClientRect();
  const host = root.getBoundingClientRect();
  const x = `${box.left - host.left + box.width / 2}px`, y = `${box.top - host.top + box.height / 2}px`;
  // A hurt spreads an ink bloom under its number (the ink fight, 2026-10-15).
  if (kind === 'hurt') {
    const bloom = document.createElement('i');
    bloom.className = 'bbloom';
    Object.assign(bloom.style, { left: x, top: y });
    root.appendChild(bloom);
    setTimeout(() => bloom.remove(), 1000);
  }
  const n = document.createElement('span');
  n.className = `bfloat ${kind}`;
  n.textContent = text;
  n.style.left = x;
  n.style.top = `${box.top - host.top + box.height / 3}px`;
  root.appendChild(n);
  setTimeout(() => n.remove(), 1000);
}

const pulse = (el, cls, ms = 400) => {
  if (!el) return;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
};

/* A card leaving the pile for the hand. It is a card BACK — what was drawn is
   the player's business, and the creature's is nobody's. */
async function flyCard(root, side) {
  const from = root.querySelector(`.bdeck.${side}`);
  const to = side === 'mine' ? root.querySelector('.bhand') : root.querySelector('.bside.foe .bwho');
  if (!from || !to) return;
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  const host = root.getBoundingClientRect();
  const n = document.createElement('i');
  n.className = 'bflier';
  n.style.left = `${a.left - host.left}px`;
  n.style.top = `${a.top - host.top}px`;
  n.style.setProperty('--dx', `${b.left + b.width / 2 - a.left - 16}px`);
  n.style.setProperty('--dy', `${b.top + 10 - a.top}px`);
  root.appendChild(n);
  await sleep(BEATS.draw);
  n.remove();
}

/* The banner that says whose turn it is. Without it the creature's whole turn
   happens in the blink between two renders and the player never sees it. */
export async function banner(root, text, side) {
  const b = document.createElement('div');
  b.className = `bbanner ${side}`;
  b.textContent = text;
  root.appendChild(b);
  await sleep(BEATS.banner);
  b.remove();
}

/* Replay one stretch of the log. `root` is the battle element as it stands
   NOW — the state has already moved; this only draws what got it there. */
export async function playLog(root, entries, ctx = {}) {
  if (ctx.skip || !root) return;
  raiseGhosts(root, ctx.ghosts);
  // The stroke goes once, at the first blow the move itself lands (never the blow back).
  let struck = !ctx.ghosts?.from;
  for (const t of entries) {
    if (!struck && (t.act === 'hurt' || t.act === 'hurt-minion') && t.from !== 'return') {
      struck = true;
      await stroke(root, ctx.ghosts.from, spotOf(root, t));
    }
    switch (t.act) {
      case 'drew': {
        await flyCard(root, t.who === 'foe' ? 'theirs' : 'mine');
        break;
      }
      case 'played':
      case 'summoned': {
        const el = spotOf(root, t);
        pulse(el, 'arriving', BEATS.card);
        await sleep(BEATS.gap);
        break;
      }
      case 'power': {
        pulse(q(root, t.who === 'foe' ? '.bside.foe' : '.bside.you'), 'casting', BEATS.card);
        await sleep(BEATS.gap);
        break;
      }
      case 'hurt': {
        const el = spotOf(root, t);
        // 护体 took some of it (a worn 法衣): the shield flashes with its own
        // number, and only what reached 气血 leaps off the hero.
        if (t.absorbed) {
          const shield = el?.querySelector('.barmor') ?? el;
          float(root, shield, `${ctx.words?.armor ?? ''} −${t.absorbed}`, 'armor');
          pulse(shield, 'struck', BEATS.hit);
          if (t.amount) await sleep(BEATS.gap);
        }
        if (t.amount || !t.absorbed) float(root, el, `−${t.amount}`, 'hurt');
        pulse(el, 'shaken', BEATS.hit);
        await sleep(BEATS.hit);
        break;
      }
      case 'hurt-minion': {
        const el = spotOf(root, t);
        float(root, el, `−${t.amount}`, 'hurt');
        pulse(el, 'shaken', BEATS.hit);
        await sleep(BEATS.hit - 120);
        break;
      }
      case 'heal': {
        const el = spotOf(root, t);
        float(root, el, `+${t.amount}`, 'heal');
        pulse(el, 'blessed', BEATS.hit);
        await sleep(BEATS.gap);
        break;
      }
      case 'buff':
      case 'rally': {
        const side = t.who === 'foe' ? 'theirs' : 'mine';
        for (const m of root.querySelectorAll(`.brank.${side} .bminion:not(.empty)`)) pulse(m, 'blessed', BEATS.hit);
        await sleep(BEATS.gap);
        break;
      }
      case 'withdrew': {
        // Its ghost dissolves where it stood; without one (a redraw lost it), the rank carries the going.
        if (!dissolve(root, t)) pulse(q(root, `.brank.${t.who === 'foe' ? 'theirs' : 'mine'}`), 'lost-one', BEATS.withdraw);
        await sleep(BEATS.withdraw - 200);
        break;
      }
      case 'charge':
        pulse(q(root, '.bside.foe'), 'gathering', 1200);
        await sleep(BEATS.gap);
        break;
      case 'unleash':
        await splash(root, ctx.sigName);
        break;
      case 'chained':
      case 'drought': {
        pulse(spotOf(root, t), t.act === 'chained' ? 'shaken' : 'casting', BEATS.hit);
        await sleep(BEATS.gap);
        break;
      }
      case 'drained': {
        const el = q(root, t.who === 'foe' ? '.bside.foe .bmana' : '.bside.you .bmana');
        float(root, el, `−${t.amount}`, 'hurt');
        await sleep(BEATS.gap);
        break;
      }
      case 'foe-withdrew':
        await banner(root, ctx.words?.withdrew ?? '', 'foe');
        break;
      case 'trial-passed':
        await banner(root, ctx.words?.passed ?? '', 'foe');
        break;
      default:
        break;
    }
  }
}

/* What is new in the log since we last drew. The log only grows, so its length
   is the whole bookmark. */
export const since = (log, mark) => (log ?? []).slice(mark);
