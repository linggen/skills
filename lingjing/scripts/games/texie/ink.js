// ink.js — 施法特写's ink close-up (version C): 小满 in side profile (one local-FLUX painting, art/xiaoman-side.webp) with
// HIS hands drawn over it as large ink brush strokes, live from the player's landmarks (jieyin/pose.js inkHand, the same
// brush as the hand hint): mirrored as in a mirror, scaled up, and pinned in front of his chest — the hands move a
// little with the player's, their shape all the player's. An ink sleeve runs from his shoulder to each wrist.
//
//   const view = inkView(container, { lang })
//   view.update({ image, aspect, glyph? })   image: the hands, 0…1 of the picture (eye.js); glyph: a seal formed, shown big
//   view.destroy()
//   placeHands(image, aspect) (pure)          → the hands' points in the panel's units, and each wrist; the tests read it

import { inkFilter, inkHand } from '../jieyin/pose.js';
import { mirrored } from '../jieyin/hint.js';

const ART = new URL('./art/xiaoman-side.webp', import.meta.url).href;
// The panel's drawing: 160 × 120 units. The painting fills the left; the hands go in front of his chest.
export const VIEW = { w: 160, h: 120, art: { x: -6, y: 8, w: 92, h: 112 }, chest: { x: 108, y: 70 }, shoulder: { x: 50, y: 98 },
  handLen: 30, follow: 18, spread: 0.55 };

const lengthOf = (h) => Math.hypot(h[0].x - h[9].x, h[0].y - h[9].y);
const mean = (pts) => pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 });

/** The hands in the panel's units: each hand its own shape scaled so wrist → middle root is `handLen`; the pair's
    middle pinned at the chest, moved by the player's place in the picture (`follow`), the gap between two hands
    narrowed (`spread`). → [{ pts, wrist, unit }] */
export function placeHands(image = [], aspect = 4 / 3, v = VIEW) {
  const seen = image.filter((h) => h?.length >= 21).map((h) => mirrored(h, aspect));
  if (!seen.length) return [];
  const L = Math.max(...seen.map(lengthOf)) || 0.1, k = v.handLen / L;
  const all = mean(seen.flat()), at = { x: v.chest.x + (all.x - aspect / 2) * v.follow, y: v.chest.y + (all.y - 0.5) * v.follow };
  return seen.map((h) => {
    const c = mean(h), off = { x: (c.x - all.x) * k * v.spread, y: (c.y - all.y) * k * v.spread };
    const pts = h.map((p) => ({ x: at.x + off.x + (p.x - c.x) * k, y: at.y + off.y + (p.y - c.y) * k }));
    return { pts, wrist: pts[0], unit: lengthOf(h) * k };
  });
}

/** An ink sleeve from the shoulder to a wrist, sagging at the elbow: a broad wash and a darker core. */
function sleeve(s, w, unit) {
  const e = { x: (s.x + w.x) / 2 - 4, y: Math.max(s.y, w.y) + 10 }, f = (n) => n.toFixed(1);
  const d = `M${f(s.x)},${f(s.y)} Q${f(e.x)},${f(e.y)} ${f(w.x)},${f(w.y)}`;
  return `<path d="${d}" stroke-width="${f(unit * 0.62)}" stroke-opacity=".22"/><path d="${d}" stroke-width="${f(unit * 0.3)}" stroke-opacity=".7"/>`;
}

let uid = 0;
export function inkView(container, { lang = 'zh' } = {}) {
  const doc = container.ownerDocument, id = `txink${++uid}`, V = VIEW;
  const el = doc.createElement('div');
  el.className = 'tx-view tx-ink';
  el.innerHTML = `<svg viewBox="0 0 ${V.w} ${V.h}" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs>${inkFilter(id)}</defs>`
    + `<rect class="tx-paper" width="${V.w}" height="${V.h}"/><text class="tx-glyph" x="${V.chest.x}" y="${V.chest.y + 4}" text-anchor="middle" dominant-baseline="middle"></text>`
    + `<image href="${ART}" x="${V.art.x}" y="${V.art.y}" width="${V.art.w}" height="${V.art.h}" preserveAspectRatio="xMidYMax meet"/>`
    + `<g class="tx-arms" filter="url(#${id})"><g class="tx-sleeves" fill="none" stroke="#1d1712" stroke-linecap="round"></g><g class="tx-hands" style="color:#1d1712"></g></g></svg>`;
  el.lang = lang;
  container.append(el);
  const $ = (s) => el.querySelector(s);
  let drawn = null;
  return {
    el,
    update({ image = [], aspect = 4 / 3, glyph = '' } = {}) {
      $('.tx-glyph').textContent = glyph ?? '';
      if (image === drawn) return;
      drawn = image;
      const hands = placeHands(image, aspect);
      $('.tx-sleeves').innerHTML = hands.map((h) => sleeve(V.shoulder, h.wrist, h.unit)).join('');
      // Two passes of the one brush: a broad pale wash under a bolder core — big strokes, not a wire hand.
      $('.tx-hands').innerHTML = hands.map((h) => `<g opacity=".3">${inkHand(h.pts, h.unit * 1.9)}</g>${inkHand(h.pts, h.unit * 1.35)}`).join('');
    },
    destroy() { el.remove(); },
  };
}
