// ropebeats.js — the story's 割绳子 beats (2026-10-16, games.md § 割绳子 slots: 「不好玩的砍掉，用割绳子
// 代替」), each a scene's own drop or steer on ropekit.js, its level written as data in games.json
// (frozen from rope-gen.js and proved by its bot), its book line above the board. The page's skip
// (stuck.js) and the task's pay stand as for every story board; stars go on the save (`stars`).
//   忍字 (00-masan)  the 桂花糕 on its string, swung onto a springy bamboo, to the yard dog — never
//                    to 马小宝's hand: 「学声狗叫，给你舔一口。」
//   认路 (00-yinyue) the little fox carried in a 灵气泡 to the moss at the valley mouth: 「先带本王出去。」
//   算账 (00-rent)   the meat onto 马三's steelyard before the crow walks down to it: 「肉二十斤，抵今年的。」
import { n } from './ink.js';
import { W } from './rope.js';
import { makeRopeGame } from './ropekit.js';

const ART = new URL('../../worlds/jiuding/art/', import.meta.url).href;
const img = (file, x, y, w, h, cls = '') => `<image${cls ? ` class="${cls}"` : ''} href="${ART}${file}" x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"/>`;

/* The words every beat shares; each adds its own. */
const COMMON = {
  zh: { stars: '灵光', retry: '重来', miss: ['掉地上了。再来。', '没送到。再来。', '差一点。再来。'], broke: '碰上荆棘了。再来。', stolen: '乌鸦叼走了。再来——先断它那根藤。', stuck: '卡住了也不要紧：底下可以先往下走。' },
  en: { stars: 'Sparks', retry: 'Again', miss: ['On the floor. Again.', 'It didn\'t get there. Again.', 'So close. Again.'], broke: 'It touched the thorns. Again.', stolen: 'The crow took it. Again — cut its vine first.', stuck: 'Stuck is fine: you can go on below.' },
};
const words = (own) => ({ zh: { ...COMMON.zh, ...own.zh }, en: { ...COMMON.en, ...own.en } });

/* Where a level comes from: the world's (Look's deal, or games.json read alone by `mount`). */
const fromDeal = (seed, level, data) => ({ level: data.levels?.[0] ?? null, plan: null });

/** A beat's game, with `mount` reading its own row of games.json when no levels are handed in. */
function beat(spec) {
  const game = makeRopeGame({ makeLevel: fromDeal, ...spec });
  const own = game.mount;
  game.mount = async (container, opts = {}) => {
    if (opts.data?.levels) return own(container, opts);
    const res = await fetch(new URL('../../worlds/jiuding/games.json', import.meta.url));
    const row = (await res.json()).games.find((g) => g.id === spec.meta.id);
    return own(container, { ...opts, data: { ...(opts.data ?? {}), levels: row?.levels ?? [] } });
  };
  return game;
}

/* ── 忍字 · 桂花糕 to the yard dog ── */
const DOG_W = 120, DOG_H = DOG_W * 277 / 320, DOG_MOUTH = [0.66, 0.2];
export const taunt = beat({
  meta: { id: 'tauntrope', name: { zh: '忍字 · 桂花糕喂狗', en: 'Holding it in · The cake to the dog' }, how: { zh: '划断绳，让桂花糕落到大黄狗嘴里——不进马小宝的手。', en: 'Cut the string so the cake drops to the yard dog — never into Ma Xiaobao\'s hand.' } },
  quote: { zh: '「学声狗叫，给你舔一口。」', en: '"Bark like a dog, and you can have a lick."' },
  T: words({
    zh: { name: '桂花糕', say: '划断绳，把桂花糕送到大黄狗嘴里。', eat: ['大黄一口叼住，尾巴摇成了一朵花。'], done: '桂花糕进了狗嘴。马小宝的脸，比那块糕还黄。' },
    en: { name: 'osmanthus cake', say: 'Cut the string and bring the cake down to the yard dog.', eat: ['The dog snaps it up, tail going like a flower.'], done: 'The cake went to the dog. Ma Xiaobao\'s face went yellower than the cake.' },
  }),
  thing: (s, r) => img('games/cake.webp', -r * 0.95, -r * 1.45, r * 1.9, r * 2.9),
  target(s, calm) {
    const [mx, my] = s.level.mouth, x = mx - DOG_MOUTH[0] * DOG_W, y = my - DOG_MOUTH[1] * DOG_H;
    const hop = s.phase === 'eat' && !calm ? Math.abs(Math.sin(s.t / 160)) * 10 * Math.max(0, 1 - s.t / 1200) : 0;
    return `<g class="g-rope-target">${img('games/dog.webp', x, y - hop, DOG_W, DOG_H)}</g><ellipse class="g-ft-mouth" cx="${mx}" cy="${my}" rx="30" ry="7"/>`;
  },
  grade: (s) => (s.best >= 3 ? 'word' : 'fist'),
  cls: 'g-rope-taunt',
});

/* ── 认路 · the fox in a bubble, to the moss ── */
const MOSS_W = 220, MOSS_H = MOSS_W * 171 / 320;
export const way = beat({
  meta: { id: 'wayrope', name: { zh: '认路 · 灵气泡送它出谷', en: 'Finding the way · Out in a qi bubble' }, how: { zh: '让小狐狸荡进灵气泡，飘过去，点破泡，落到谷口的青苔上。', en: 'Swing the little fox into the bubble, float it over, pop it onto the moss at the valley mouth.' } },
  quote: { zh: '「先带本王出去。」', en: '"Take this king out of here first."' },
  T: words({
    zh: { name: '小狐狸', say: '把小狐狸送到谷口的青苔上。', eat: ['它落在青苔上，打了个滚，尾巴一卷。'], done: '谷口到了。它在青苔上蜷成一团。' },
    en: { name: 'the little fox', say: 'Bring the little fox to the moss at the valley mouth.', eat: ['It lands on the moss, rolls once, and curls its tail.'], done: 'The valley mouth. It curls up on the moss.' },
  }),
  thing: (s, r) => `<clipPath id="g-rope-fox"><circle r="${r + 2}"/></clipPath><circle class="g-ft-ring" r="${r + 2}"/>`
    + `<image href="${ART}people/yinyue-fox.webp" x="${-r * 2.2}" y="${-r * 1.7}" width="${r * 4.4}" height="${r * 3.6}" clip-path="url(#g-rope-fox)" preserveAspectRatio="xMidYMid slice"/>`,
  target(s, calm) {
    const [mx, my] = s.level.mouth, x = mx - 0.55 * MOSS_W, y = my - 0.3 * MOSS_H;
    const sway = s.phase === 'eat' && !calm ? Math.sin(s.t / 120) * 2 : 0;
    return `<g class="g-rope-target" transform="rotate(${n(sway)} ${n(mx)} ${n(my + 40)})">${img('games/moss.webp', x, y, MOSS_W, MOSS_H)}</g><ellipse class="g-ft-mouth" cx="${mx}" cy="${my}" rx="34" ry="7"/>`;
  },
  grade: (s) => (s.best >= 3 ? 'straight' : 'wandered'),
  rests: true,
  cls: 'g-rope-way',
});

/* ── 算账 · the meat onto 马三's steelyard ── */
const YARD_W = 210, YARD_H = YARD_W * 302 / 320, PAN = [0.2, 0.76], HOOK = 0.47;
export const rent = beat({
  meta: { id: 'rentrope', name: { zh: '算账 · 肉上秤', en: 'Settling up · The meat on the steelyard' }, how: { zh: '划断藤，让鹿肉落进秤盘——乌鸦顺着藤往下爬，先断它那根。', en: 'Cut the vines so the venison drops into the pan — a crow is walking down one: cut that first.' } },
  quote: { zh: '「肉二十斤，抵今年的。」', en: '"Twenty catties of meat, for this year\'s."' },
  T: words({
    zh: { name: '鹿肉', say: '把鹿肉送进马三的秤盘。', eat: ['称满了二十斤，秤杆翘得跟马三的下巴一样高。'], done: '皮抵了去年的欠，肉抵了今年的租。' },
    en: { name: 'venison', say: 'Bring the venison down into Ma San\'s scale pan.', eat: ['Twenty catties, and the beam tilts up as high as Ma San\'s chin.'], done: 'The hide for last year, the meat for this.' },
  }),
  thing: (s, r) => img('games/meat.webp', -r * 1.05, -r * 1.35, r * 2.1, r * 2.5),
  target(s, calm) {
    // The steelyard hangs from a cord; its pan on the mouth (mirrored when the mouth is on the right).
    const [mx, my] = s.level.mouth, flip = mx > W / 2 ? -1 : 1;
    const x0 = mx - flip * PAN[0] * YARD_W, y0 = my - PAN[1] * YARD_H, hookX = x0 + flip * HOOK * YARD_W;
    const tilt = s.phase === 'eat' || s.phase === 'end' ? -8 * flip * (calm ? 1 : Math.min(1, (s.t ?? 1e9) / 500)) : 0;
    return `<path class="g-rope-cord" d="M${n(hookX)} 22 L${n(hookX)} ${n(y0 + 6)}"/>`
      + `<g class="g-rope-target" transform="rotate(${n(tilt)} ${n(hookX)} ${n(y0 + 6)}) translate(${n(x0)} ${n(y0)}) scale(${flip} 1)">${img('games/steelyard.webp', 0, 0, YARD_W, YARD_H)}</g>`
      + `<ellipse class="g-ft-mouth" cx="${mx}" cy="${my}" rx="30" ry="7"/>`;
  },
  grade: (s) => (s.best >= 3 ? 'exact' : 'over'),
  rests: true,
  cls: 'g-rope-rent',
});
