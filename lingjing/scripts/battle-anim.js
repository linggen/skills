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
export const BEATS = { card: 260, hit: 340, withdraw: 380, banner: 620, gap: 90 };

const q = (root, sel) => root.querySelector(sel);

/* Where a thing lives on screen, so a number can leap off it. */
function spotOf(root, t) {
  if (t.act === 'hurt' || t.act === 'heal') return q(root, t.who === 'foe' ? '.bside.foe' : '.bside.you');
  if (t.id) {
    const side = t.who === 'foe' ? 'theirs' : 'mine';
    return q(root, `.brank.${side} [data-id="${CSS.escape(t.id)}"]`) ?? q(root, `.brank.${side}`);
  }
  return null;
}

/* A number that leaps off what it hit and fades — the one piece of feedback a
   card game cannot do without. */
function float(root, el, text, kind) {
  if (!el) return;
  const box = el.getBoundingClientRect();
  const host = root.getBoundingClientRect();
  const n = document.createElement('span');
  n.className = `bfloat ${kind}`;
  n.textContent = text;
  n.style.left = `${box.left - host.left + box.width / 2}px`;
  n.style.top = `${box.top - host.top + box.height / 3}px`;
  root.appendChild(n);
  setTimeout(() => n.remove(), 900);
}

const pulse = (el, cls, ms = 400) => {
  if (!el) return;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
};

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
  if (ctx.skip) return;
  for (const t of entries) {
    switch (t.act) {
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
        float(root, el, `−${t.amount}`, 'hurt');
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
        // The body is already gone from the state, so the rank itself carries
        // the going — there is nothing left to fade.
        pulse(q(root, `.brank.${t.who === 'foe' ? 'theirs' : 'mine'}`), 'lost-one', BEATS.withdraw);
        await sleep(BEATS.gap);
        break;
      }
      case 'foe-withdrew':
        await banner(root, ctx.words?.withdrew ?? '', 'foe');
        break;
      default:
        break;
    }
  }
}

/* What is new in the log since we last drew. The log only grows, so its length
   is the whole bookmark. */
export const since = (log, mark) => (log ?? []).slice(mark);
