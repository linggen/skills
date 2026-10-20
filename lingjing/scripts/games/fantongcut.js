// 喂饭桶 · 割藤 — the 饭桶's free play as a daily 割绳子 puzzle (Hanli, 2026-10-16: 「割绳子挺好玩，
// 可以反复出现，不同的割法」). He has chosen what to feed (the 物品 panel, as before); it hangs on
// vines over the 饭桶 and he cuts and steers it into its mouth: a tap or a swipe across a vine, a puff
// of wind, a 灵气泡 to pop, 荆棘 to keep clear of, a vine that grows back, a springy bamboo, twin
// seals, a crow. The level is made from the day's seed and proved solvable before it is shown
// (rope-gen.js); a miss lays it again at once; after `max_misses` 「直接喂」 feeds it anyway, stars 0.
// Three 灵光 on the way are the stars (kept on the save, unpaid). What comes out of the 饭桶 is the
// rules' roll, as ever — this only stands between the choice and the feed.
// The game itself is ropekit.js's; here only the 饭桶's own: its words, its level, the pot and how it eats.
import { n } from './ink.js';
import { W } from './rope.js';
import { generate } from './rope-gen.js';
import { makeRopeGame, EAT_MS } from './ropekit.js';

export { FAST } from './ropekit.js';
export { FAST_AFTER } from './ropekit.js';
export { MAX_MISSES } from './ropekit.js';

export const meta = {
  id: 'fantongcut',
  name: { zh: '喂饭桶 · 割藤', en: 'Feeding the Rice Bucket · Cut the vines' },
  how: {
    zh: '划断藤，把东西送进饭桶嘴里。路上的灵光接住了是星。',
    en: 'Cut the vines and bring it down into the Rice Bucket\'s mouth. The sparks on the way are stars.',
  },
};

const T = {
  zh: {
    stars: '灵光', retry: '重来', skip: '直接喂', name: '柴火棍',
    say: '划断藤，把{name}送进饭桶嘴里。',
    miss: ['掉地上了。再来。', '没进嘴。再来。', '差一点。再来。'], broke: '碰上荆棘，碎了。再来。', stolen: '乌鸦叼走了。再来——先断它那根藤。',
    eat: ['「咕咚」——饭桶一口吞了。', '饭桶「嗝」了一声。', '盖子一跳：吃进去了。'],
    stuck: '实在送不进去，就直接喂吧。',
    done: '吃进去了。', skipped: '直接喂了进去。',
  },
  en: {
    stars: 'Sparks', retry: 'Again', skip: 'Just feed it', name: 'firewood',
    say: 'Cut the vines and bring the {name} down into the Rice Bucket\'s mouth.',
    miss: ['On the floor. Again.', 'Missed the mouth. Again.', 'So close. Again.'], broke: 'It touched the thorns and broke. Again.', stolen: 'The crow took it. Again — cut its vine first.',
    eat: ['*Gulp* — the Rice Bucket swallows it whole.', 'The Rice Bucket goes *burp*.', 'The lid jumps: in it goes.'],
    stuck: 'If it will not go in, feed it by hand.',
    done: 'In it went.', skipped: 'Fed by hand.',
  },
};

const ART = new URL('../../worlds/jiuding/art/', import.meta.url).href;
const POT = `${ART}games/fantong-pot.webp`;
// The star of the scene: about a third of the board wide, its rim on the mouth (rope-gen's MOUTH_Y).
const POT_W = 132, POT_H = POT_W * 490 / 440, RIM = 0.306;

/** The sample day when none is given (the 游戏厅, the try page): the seed's level at `tier`. */
const SAMPLE_ELS = [[], ['gust'], ['gust', 'bubble'], ['gust', 'bubble', 'thorns'], ['gust', 'bubble', 'thorns', 'regrow', 'spring', 'seals', 'crow']];
function makeLevel(seed, level, data) {
  const tier = Math.max(0, Math.min(4, (Number(level) || 1) - 1));
  return generate(data.seed ?? String(seed), { tier: data.tier ?? tier, els: data.els ?? SAMPLE_ELS[tier], must: data.must ?? null });
}

/* The thing he chose: its own picture in a round, else its name's first character in an ink ring. */
function thing(s, r) {
  const it = s.item;
  const face = it?.art
    ? `<clipPath id="g-ft-clip"><circle r="${r}"/></clipPath><image href="${it.art}" x="${-r * 1.6}" y="${-r * 1.2}" width="${r * 3.2}" height="${r * 2.4}" clip-path="url(#g-ft-clip)" preserveAspectRatio="xMidYMid slice"/>`
    : `<text class="g-ft-glyph" y="6" text-anchor="middle">${(it?.name ?? '柴').slice(0, 1)}</text>`;
  return `<circle class="g-ft-ring" r="${r}"/>${face}`;
}

/* The 饭桶 eats: a gulp (it squats, then hops), a shake that dies away, a puff of steam from the lid,
   and a 「嗝」 seal pressed beside it. Reduced motion: the seal only. A story beat that feeds the 饭桶
   (ropebeats.js 喂息珠) lays the same pot. */
export function target(s, calm) {
  const [mx, my] = s.level.mouth, x = mx - POT_W / 2, y = my - RIM * POT_H, eating = s.phase === 'eat' && !calm;
  const t = s.t ?? 0;
  const gulp = eating ? (t < 260 ? -Math.sin((t / 260) * Math.PI) * 0.5 : Math.sin(Math.min(1, (t - 260) / 360) * Math.PI)) : 0;
  const shake = eating && t > 300 ? Math.sin(t / 38) * 6 * Math.max(0, 1 - (t - 300) / 700) : 0;
  const pot = `<g class="g-ft-pot${s.phase === 'eat' ? ' is-eating' : ''}" transform="translate(${n(x)} ${n(y - gulp * 12)}) rotate(${n(shake)} ${n(POT_W / 2)} ${n(POT_H)}) scale(1 ${n(1 - gulp * 0.07, 3)})">`
    + `<image href="${POT}" width="${POT_W}" height="${n(POT_H)}"/></g>`;
  return pot + (s.phase === 'eat' ? steam(s, mx, my, eating) + burpSeal(mx, my) : '');
}
function steam(s, mx, my, moving) {
  if (!moving || s.t < 380) return '';
  const k = Math.min(1, (s.t - 380) / (EAT_MS - 500));
  return [-14, 0, 14].map((dx, i) => {
    const rise = 18 + k * 46 + i * 4, sway = Math.sin(k * 5 + i) * 6;
    return `<path class="g-ft-steam" d="M${n(mx + dx)} ${n(my - 14)} q${n(sway)} ${n(-rise / 2)} ${n(-sway / 2)} ${n(-rise)}" opacity="${n(0.55 * (1 - k), 2)}"/>`;
  }).join('');
}
const burpSeal = (mx, my) => {
  const x = mx + (mx > W / 2 ? -78 : 46), y = my - 74;
  return `<g class="g-ft-burpseal" transform="translate(${n(x)} ${n(y)})"><g class="g-ft-burpseal-in"><rect x="-17" y="-17" width="34" height="34" rx="5"/><text y="8" text-anchor="middle">嗝</text></g></g>`;
};

const game = makeRopeGame({ meta, T, makeLevel, thing, target, grade: () => 'fed', skipGrade: 'skipped' });
export const newGame = game.newGame;
export const act = game.act;
export const tick = game.tick;
export const html = game.html;
export const stuck = game.stuck;
export const paceOf = game.paceOf;
export const mount = game.mount;
