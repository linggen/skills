// rope-art.js — how the 割绳子 module's newer tools look, for every game that lays them (the 饭桶's
// puzzle, the story's beats): 弹竹 (the house's painted bamboo, flexing when struck), 双印 (two
// painted cinnabar seals, an ink thread between, a flash when the thing goes through), 乌鸦 (a
// painted crow walking down its vine, off with a flap when the vine is cut). Pure strings; the
// world (rope.js) says where things are.
import { n, splash } from './ink.js';
import { crowAt, STEP_MS } from './rope.js';

const ART = new URL('../../worlds/jiuding/art/', import.meta.url).href;
export const SPRING_ART = `${ART}games/feather/bamboo.webp`;
export const SEAL_ART = `${ART}games/seal.webp`;
export const CROW_ART = `${ART}games/crow.webp`;

/** 弹竹: the bamboo along its slab; `struck` ms since the thing last hit it bends it a little. */
export function springPicture(sp, struck = null) {
  const bend = struck != null && struck < 300 ? Math.sin((struck / 300) * Math.PI) * 5 : 0;
  return `<g class="g-rope-spring" transform="translate(${sp.x} ${sp.y}) rotate(${sp.a ?? 0})">`
    + `<image href="${SPRING_ART}" x="${-sp.w / 2 - 6}" y="${n(-7 + bend)}" width="${sp.w + 12}" height="14" preserveAspectRatio="none"/></g>`;
}

/** 双印: the two seals and the faint thread between them; a flash at both ends just after a pass. */
export function sealsPicture(w, level) {
  return (w.seals ?? []).map((p) => {
    const since = p.until ? w.clock - (p.until - 500) : null;
    const flash = since != null && since >= 0 && since < 420 ? splash(p.b[0], p.b[1], since * 1.6, { r: 14, seal: true }) : '';
    const one = ([x, y]) => `<image class="g-rope-seal" href="${SEAL_ART}" x="${n(x - p.r)}" y="${n(y - p.r)}" width="${p.r * 2}" height="${p.r * 2}"/>`;
    return `<path class="g-rope-thread" d="M${p.a[0]} ${p.a[1]} Q${n((p.a[0] + p.b[0]) / 2)} ${n(Math.min(p.a[1], p.b[1]) - 60)} ${p.b[0]} ${p.b[1]}"/>${one(p.a)}${one(p.b)}${flash}`;
  }).join('');
}

/** 乌鸦: on its vine while it walks; flown, a flap of ink where it was for a moment. */
export function crowsPicture(w) {
  return (w.crows ?? []).map((c) => {
    if (c.state === 'walking') {
      const p = crowAt(w, c);
      return `<image class="g-rope-crow" href="${CROW_ART}" x="${n(p.x - 15)}" y="${n(p.y - 24)}" width="30" height="30"/>`;
    }
    return '';
  }).join('');
}

/** Where the teaching ring goes for a tool met the first time today (null: nowhere). */
export function toolMark(w, level, el) {
  if (el === 'spring' && level.springs?.[0]) return [level.springs[0].x, level.springs[0].y, 60];
  if (el === 'seals' && level.seals?.[0]) return [level.seals[0].a[0], level.seals[0].a[1], 34];
  if (el === 'crow' && w.crows?.[0]?.state === 'walking') { const p = crowAt(w, w.crows[0]); return [p.x, p.y - 8, 28]; }
  return null;
}
export const STEP = STEP_MS;
