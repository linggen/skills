// 石坳村 · 村里走一走 — the village map (batch two, 2026-10-14: 「货郎、打猎、采药、邻里、吴婆婆讲古」).
// Between stretches of the book, on days the book passes over in a line, the village is a map
// painted in ink wash (art/backdrop/village.webp) — the old 槐树 at the village mouth, the well,
// 阿禾's cabbage, 东坡, 吴婆婆's doorstep at the east end — with numbered seals on it, and a few small things to do in it, each a few seconds, each optional: shoo the
// hens off 阿禾's cabbage, read the prints 爹 draws in the mud, pick 艾草 for his knee, guess the
// 货郎's prices, hear 吴婆婆 tell an old one. Nothing here gives or takes anything the story
// counts; 「回家」 ends it whenever he likes (grade full · light by what he did), and the quiet
// skip does too. Three stops (games/villageday.js, villagedong.js, villageeve.js): 00-shiao's day
// before 马三, 00-xiuxian's day after 立冬 (she does not wake), 00-notice's last day at home.
// Pure module factory: makeVillage(stop) → { meta, newGame, act, tick, html }.
import { rng, shuffled } from './seeded.js';
import { SKIP, btn, n, scene, skipBtn, skipped, splash, still } from './ink.js';

/* ── The things to do ── */

// Prints 爹 draws in the mud — each an ink picture and its name.
const PRINT = {
  dog: { zh: '狗', en: 'Dog', d: 'M-6 4 a4 5 0 1 0 12 0 a4 5 0 1 0 -12 0 M-9 -6 a2 2.6 0 1 0 4 0 a2 2.6 0 1 0 -4 0 M-3 -9 a2 2.6 0 1 0 4 0 a2 2.6 0 1 0 -4 0 M3 -9 a2 2.6 0 1 0 4 0 a2 2.6 0 1 0 -4 0 M7 -5 a2 2.6 0 1 0 4 0 a2 2.6 0 1 0 -4 0' },
  hen: { zh: '鸡', en: 'Hen', d: 'M0 10 L0 -2 M0 -2 L-8 -12 M0 -2 L0 -13 M0 -2 L8 -12 M0 6 L-2 12', line: true },
  cat: { zh: '猫', en: 'Cat', d: 'M-5 5 a4 4 0 1 0 10 0 a4 4 0 1 0 -10 0 M-8 -4 a1.8 2 0 1 0 3.6 0 a1.8 2 0 1 0 -3.6 0 M-3 -8 a1.8 2 0 1 0 3.6 0 a1.8 2 0 1 0 -3.6 0 M2 -8 a1.8 2 0 1 0 3.6 0 a1.8 2 0 1 0 -3.6 0 M6 -4 a1.8 2 0 1 0 3.6 0 a1.8 2 0 1 0 -3.6 0' },
  deer: { zh: '鹿', en: 'Deer', d: 'M-1 10 C-8 6 -8 -6 -2 -12 C-1 -4 -1 4 -1 10Z M1 10 C8 6 8 -6 2 -12 C1 -4 1 4 1 10Z' },
  boar: { zh: '野猪', en: 'Boar', d: 'M-2 8 C-9 6 -9 -4 -3 -8 C-2 -2 -2 4 -2 8Z M2 8 C9 6 9 -4 3 -8 C2 -2 2 4 2 8Z M-6 10 a1.6 1.6 0 1 0 3 0 M3 10 a1.6 1.6 0 1 0 3 0' },
  fox: { zh: '狐狸', en: 'Fox', d: 'M-3 6 a3 3.6 0 1 0 6 0 a3 3.6 0 1 0 -6 0 M-5 -3 a1.5 2 0 1 0 3 0 a1.5 2 0 1 0 -3 0 M-1.5 -6 a1.5 2 0 1 0 3 0 a1.5 2 0 1 0 -3 0 M2 -3 a1.5 2 0 1 0 3 0 a1.5 2 0 1 0 -3 0' },
};
// Plants on 东坡: 艾草 among its look-alikes (the grey-backed, deep-cut leaf is the one).
const PLANT = {
  ai: { zh: '艾草', en: 'Mugwort', d: 'M0 12 V-10 M0 2 C-8 0 -12 -4 -10 -8 C-6 -6 -4 -6 -2 -2 M0 -2 C8 -4 12 -8 10 -12 C6 -10 4 -10 2 -6 M-10 -8 l-3 -2 M10 -12 l3 -1', grey: true },
  hao: { zh: '青蒿', en: 'Sweet wormwood', d: 'M0 12 V-12 M0 4 l-8 -3 M0 4 l8 -3 M0 -2 l-7 -4 M0 -2 l7 -4 M0 -8 l-5 -3 M0 -8 l5 -3' },
  ju: { zh: '野菊', en: 'Wild chrysanthemum', d: 'M0 12 V-4 M-4 -8 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0 M0 4 C-6 2 -8 0 -8 -2 M0 6 C6 4 8 2 8 0' },
  qian: { zh: '车前草', en: 'Plantain', d: 'M0 12 C-10 4 -10 -8 0 -12 C10 -8 10 4 0 12Z M0 12 V-10' },
};
const TALE = {
  jingwei: {
    zh: { tell: '吴婆婆脸朝着太阳，讲了一个很老的：「东海边上有一只鸟，花脑袋，白嘴，红脚。原先是个闺女，在海里淹死了，变成了鸟，天天飞到西山去衔东西，往海里扔，要把海填平。」她停了一停：「你猜，她衔的什么？」', ask: '衔的什么？', right: '「对喽。西山的树枝、石子儿。」她咂了咂嘴：「海填平了没有？没有。可她还在衔。」', wrong: '「不是。」吴婆婆笑了，露出三颗牙：「是西山的树枝、石子儿。」' },
    en: { tell: 'Granny Wu, her face to the sun, tells a very old one: "By the Eastern Sea there\'s a bird — speckled head, white beak, red feet. She was a girl once, drowned in that sea, and she turned into a bird. Every day she flies to the Western Hills to fetch something and drops it in the sea, to fill it up." She stops. "Guess what she carries."', ask: 'What does she carry?', right: '"That\'s it. Twigs and pebbles from the Western Hills." She smacks her lips. "Is the sea filled? No. But she\'s still carrying."', wrong: '"No." Granny Wu grins, showing her three teeth. "Twigs and pebbles from the Western Hills."' },
    options: ['stones', 'fish', 'shells'], answer: 'stones',
    opt: { stones: { zh: '树枝和石子', en: 'Twigs and pebbles' }, fish: { zh: '小鱼', en: 'Little fish' }, shells: { zh: '贝壳', en: 'Shells' } },
  },
  kuafu: {
    zh: { tell: '吴婆婆坐在门槛上，又讲了一个：「早年间有个大个子，叫夸父，追一样东西，追了一天，渴了，把黄河、渭河喝干了还不够，往北边的大泽去，没走到，渴死在半道上。他扔下的那根拐杖，长成了一片桃林。」「你猜，他追的什么？」', ask: '他追的什么？', right: '「对。追日头。」她把脸朝西边转了转：「日头追不上的。可那片桃林，结桃子。」', wrong: '「不是。」吴婆婆把脸朝西边转了转：「是日头。追不上的。」' },
    en: { tell: 'Granny Wu sits on her doorstep and tells another: "In the old days there was a giant called Kuafu who chased something all day long. He got thirsty and drank the Yellow River and the Wei dry, and it still wasn\'t enough; he set off for the great marsh in the north and died of thirst on the way. The staff he threw down grew into a peach grove." "Guess what he was chasing."', ask: 'What was he chasing?', right: '"Right. The sun." She turns her face to the west. "You can\'t catch the sun. But the grove bears peaches."', wrong: '"No." Granny Wu turns her face to the west. "The sun. You can\'t catch it."' },
    options: ['sun', 'deer', 'wind'], answer: 'sun',
    opt: { sun: { zh: '日头', en: 'The sun' }, deer: { zh: '一头鹿', en: 'A deer' }, wind: { zh: '风', en: 'The wind' } },
  },
};
// The 货郎's tray: guess what each costs (娘 taught him 遇事先算账); he names the price.
const WARES = [
  { id: 'needle', zh: '一根针', en: 'A needle', price: 1 },
  { id: 'cord', zh: '一截红头绳', en: 'A length of red hair cord', price: 3 },
  { id: 'flint', zh: '一块火石', en: 'A flint', price: 5 },
];
const PRICES = [1, 3, 5];

/* Each stop: where the board stands, what can be done there. */
export const STOPS = {
  day: { spots: ['hens', 'prints', 'herb', 'peddler', 'tale'], prints: ['dog', 'hen', 'cat'], tale: 'jingwei', hens: 'cabbage' },
  dong: { spots: ['prints', 'herb', 'tale'], prints: ['deer', 'boar', 'fox'], tale: 'kuafu' },
  eve: { spots: ['hens', 'prints', 'herb'], prints: ['deer', 'fox', 'dog'], hens: 'coop' },
};
// The map is the painting art/backdrop/village.webp (tools/paint-village.py, 1536×1024, 3:2), shown
// through a 320×132 window at the map's old size: the full width, its band from TOP down (the sky and
// 马家 on the far hill are cropped off). Each spot is where its painted feature is, as % of the whole
// painting (x, y): the 货郎 on the path under the 槐树 at the village mouth, 爹 on the bare ground just
// above the well, the near corner of 阿禾's cabbage patch (the cabbages left in view), the open grass of 东坡, and just left of the steps
// up to the last cottage — 吴婆婆's (it stands right of centre, the painting's east end of the houses).
const MAP = { src: '../worlds/jiuding/art/backdrop/village.webp', w: 320, h: 132, ratio: 1024 / 1536, top: 0.22 };
export const AT = { hens: [47, 67], prints: [33, 59], herb: [80, 30], peddler: [23, 77], tale: [69.5, 77] };
// On the last day the hens are home's, not 阿禾's: the painting has no coop, so the seal sits in the
// front yard of the cottage beside hers (the nearer of the two).
export const AT_STOP = { eve: { hens: [55.5, 62.5] } };
// A spot's % on the painting → the map's drawing units.
export const onMap = ([px, py]) => {
  const ih = MAP.w * MAP.ratio;
  return [n((px / 100) * MAP.w), n((py / 100 - MAP.top) * ih)];
};

const T = {
  zh: {
    day: '那天一直阴着。离傍晚还早，村里走一走。', dong: '第二天，她没有醒。你揣着木牌，在村里走一走。', eve: '九月初五，在家的最后一天。村里再走一走。',
    home: '回家', back: '回村里', done: '已做', map: '石坳村',
    spot: { hens: '阿禾的白菜', prints: '爹在井台边', herb: '东坡', peddler: '货郎担', tale: '吴婆婆的门槛' },
    spotEve: { hens: '自家鸡窝' },
    hensGo: '几只鸡正朝阿禾那颗白菜溜过去——点它，轰走！', coopGo: '鸡满院子跑——点它，轰回鸡窝！', hensOk: '一只没溜到。阿禾冲你一扬下巴：「记账，你帮我一回。」', hensSome: '被啄掉 {n} 片叶子。阿禾心疼得直跺脚。', coopOk: '鸡一只不少，都进了窝。娘在门里点了点头。', coopSome: '还有 {n} 只没赶回去，娘自己去轰了。',
    printsAsk: '爹蹲在井台边，拿指头在泥里按了一个印子：「这是什么？」', printRight: '「嗯。」爹点了点头。', printWrong: '爹摇摇头：「是{name}。看脚趾。」', printsEnd: '「山里的书，就这么认。」爹把印子抹平了。',
    herbAsk: '东坡上，给爹的膝盖采艾草——哪一棵是？', herbRight: '叶子背面灰白，掐一下，一股苦香。是艾。', herbWrong: '那是{name}，不是艾。', herbEnd: '一把艾草揣在怀里，回去给爹熏膝盖。',
    pedAsk: '一个货郎挑着担子歇在老槐树底下。你身上一文钱也没有，可算账不要钱——猜猜这个多少文？', pedRight: '「小兄弟算得准！」货郎竖了竖大拇指。', pedWrong: '货郎哈哈一笑：「{p} 文。」', pedEnd: '货郎挑起担子走了。担子上什么都有，就是没有你买得起的。', wen: '文',
    full: '村里转了一圈，该做的都做了。', light: '在村里转了转，回家了。', skipped: '你回了家。',
  },
  en: {
    day: 'The sky stayed grey all day. Evening is a long way off — a walk round the village.', dong: 'The next day she doesn\'t wake. With the tablet in your jacket, you walk round the village.', eve: 'The fifth of the ninth month, the last day at home. One more walk round the village.',
    home: 'Go home', back: 'Back to the village', done: 'Done', map: "Shi'ao Village",
    spot: { hens: "Ahe's cabbage", prints: 'Father at the well', herb: 'The east slope', peddler: "The pedlar's load", tale: "Granny Wu's doorstep" },
    spotEve: { hens: 'The hen coop at home' },
    hensGo: "Hens are sidling toward Ahe's cabbage — tap one to shoo it!", coopGo: 'The hens are all over the yard — tap one to shoo it back to the coop!', hensOk: 'Not one got there. Ahe lifts her chin at you: "Noted. You helped me once."', hensSome: '{n} leaves pecked off. Ahe stamps her foot.', coopOk: 'Every hen back in the coop. Mother nods from the doorway.', coopSome: '{n} still loose — Mother goes to shoo them herself.',
    printsAsk: 'Father crouches by the well and presses a print into the mud with his finger. "What\'s this?"', printRight: '"Mm." Father nods.', printWrong: 'Father shakes his head. "{name}. Look at the toes."', printsEnd: '"That\'s how you read the mountain\'s books." Father smooths the print away.',
    herbAsk: 'On the east slope, mugwort for Father\'s knee — which one is it?', herbRight: 'Grey-white under the leaf, and a bitter smell when you pinch it. Mugwort.', herbWrong: 'That\'s {name}, not mugwort.', herbEnd: 'A handful of mugwort in your jacket, to smoke Father\'s knee with.',
    pedAsk: "A pedlar rests his load under the old pagoda tree. You haven't a copper on you, but guessing is free — how much is this?", pedRight: '"Sharp lad!" The pedlar gives you a thumbs-up.', pedWrong: 'The pedlar laughs. "{p} coppers."', pedEnd: "The pedlar shoulders his load and goes. It had everything on it — except anything you could afford.", wen: 'coppers',
    full: 'Round the village and back, everything done.', light: 'A turn round the village, and home.', skipped: 'You go home.',
  },
};

/* ── The state ── */

export function makeVillage(stop) {
  const cfg = STOPS[stop];
  const meta = {
    id: `village${stop}`,
    name: { zh: '石坳村 · 村里走一走', en: "Shi'ao Village · A walk round" },
    how: { zh: '点地图上的地方，做点小事；想走了，就回家。', en: 'Tap a place on the map to do a small thing there; go home whenever you like.' },
  };

  function newGame(seed) {
    return { seed: String(seed), stop, at: null, done: [], sub: null, t: 0, live: false, note: stop, won: false, grade: null };
  }

  const roll = (s, salt) => rng(`village:${s.seed}:${salt}`);
  const start = {
    hens: (s) => {
      const r = roll(s, 'hens');
      const hens = Array.from({ length: 6 }, (_, i) => ({ from: i % 2 ? 'r' : 'l', at: Math.round(600 + i * 1500 + r() * 600), gone: false, pecked: false }));
      return { kind: 'hens', t0: s.t, hens, lost: 0 };
    },
    prints: () => ({ kind: 'prints', list: cfg.prints, i: 0, right: 0, note: 'printsAsk' }),
    herb: (s) => ({ kind: 'herb', i: 0, picks: 0, opts: shuffled(Object.keys(PLANT), roll(s, 'h')), note: 'herbAsk' }),
    peddler: (s) => ({ kind: 'peddler', i: 0, right: 0, note: 'pedAsk' }),
    tale: () => ({ kind: 'tale', id: cfg.tale, note: 'tell' }),
  };
  const finishSpot = (s, line) => ({ ...s, at: null, sub: null, live: false, done: [...new Set([...s.done, s.at])], note: line });
  // The prints' options always hold the right one.
  const printOpts = (sub, s) => { const want = sub.list[sub.i]; const others = shuffled(Object.keys(PRINT).filter((k) => k !== want), roll(s, `p${sub.i}`)).slice(0, 3); return shuffled([want, ...others], roll(s, `q${sub.i}`)); };

  const VERBS = {
    spot: (s, d) => (s.sub || !cfg.spots.includes(d.id) || s.done.includes(d.id) ? null : { ...s, at: d.id, sub: start[d.id](s), live: d.id === 'hens', note: d.id }),
    shoo: (s, d) => {
      const sub = s.sub;
      if (sub?.kind !== 'hens') return null;
      const i = Number(d.i), h = sub.hens[i];
      if (!h || h.gone || h.pecked || s.t - sub.t0 < h.at) return null;
      const hens = sub.hens.map((x, k) => (k === i ? { ...x, gone: true } : x));
      return settleHens({ ...s, sub: { ...sub, hens, fx: { at: s.t, i } } });
    },
    pick: (s, d) => {
      const sub = s.sub;
      if (sub?.kind === 'prints') {
        const want = sub.list[sub.i], ok = d.id === want;
        const next = { ...sub, i: sub.i + 1, right: sub.right + (ok ? 1 : 0), last: ok ? 'printRight' : 'printWrong', lastName: want };
        return next.i >= sub.list.length ? finishSpot(s, 'printsEnd') : { ...s, sub: next };
      }
      if (sub?.kind === 'herb') {
        if (!PLANT[d.id]) return null;
        if (d.id === 'ai') return finishSpot(s, 'herbEnd');
        return { ...s, sub: { ...sub, picks: sub.picks + 1, last: 'herbWrong', lastName: d.id, tried: [...(sub.tried ?? []), d.id] } };
      }
      if (sub?.kind === 'tale') {
        const tale = TALE[sub.id];
        if (!tale.options.includes(d.id)) return null;
        return { ...s, sub: { ...sub, note: d.id === tale.answer ? 'right' : 'wrong', answered: true } };
      }
      return null;
    },
    price: (s, d) => {
      const sub = s.sub;
      if (sub?.kind !== 'peddler') return null;
      const ware = WARES[sub.i], ok = Number(d.p) === ware.price;
      const next = { ...sub, i: sub.i + 1, right: sub.right + (ok ? 1 : 0), last: ok ? 'pedRight' : 'pedWrong', lastP: ware.price };
      return next.i >= WARES.length ? finishSpot(s, 'pedEnd') : { ...s, sub: next };
    },
    heard: (s) => (s.sub?.kind === 'tale' && s.sub.answered ? finishSpot(s, null) : null),
    leave: (s) => (s.sub ? { ...s, at: null, sub: null, live: false, note: stop } : null),
    home: (s) => {
      if (s.sub) return null;
      const grade = s.done.length >= Math.min(3, cfg.spots.length) ? 'full' : 'light';
      return { ...s, won: true, grade, note: grade };
    },
    skip: (s) => skipped(s),
  };

  // The hens: each comes in at its time, walks to the middle in four seconds; shooed it is gone, there it pecks.
  const WALK = 4000;
  function settleHens(s) {
    const sub = s.sub, el = s.t - sub.t0;
    const hens = sub.hens.map((h) => (!h.gone && !h.pecked && el - h.at >= WALK ? { ...h, pecked: true } : h));
    const lost = hens.filter((h) => h.pecked).length;
    const over = hens.every((h) => h.gone || h.pecked);
    const next = { ...s, sub: { ...sub, hens, lost } };
    if (!over) return next;
    const coop = cfg.hens === 'coop';
    return { ...finishSpot(next, lost ? (coop ? 'coopSome' : 'hensSome') : (coop ? 'coopOk' : 'hensOk')), lost };
  }

  function act(state, data = {}) {
    if (!state || state.won) return { state, won: false };
    const next = VERBS[data.g]?.(state, data);
    if (!next) return { state, won: false };
    return { state: next, won: next.won === true };
  }

  function tick(state, ms) {
    if (!state.live || state.won || state.sub?.kind !== 'hens' || ms <= 0) return state;
    return settleHens({ ...state, t: state.t + ms });
  }

  /* ── The pictures ── */
  // The painting under, the numbered seals on: ink-red numbers in a paper halo, filled red when done.
  const mapScene = (state) => {
    const ih = n(MAP.w * MAP.ratio);
    const base = `<image class="g-mapbase" href="${MAP.src}" x="0" y="${n(-MAP.top * MAP.w * MAP.ratio)}" width="${MAP.w}" height="${ih}" preserveAspectRatio="none"/>`;
    const spots = cfg.spots.map((id, k) => {
      const [x, y] = onMap(AT_STOP[stop]?.[id] ?? AT[id]), done = state.done.includes(id);
      return `<g class="g-spotmark${done ? ' is-done' : ''}"><circle class="g-spothalo" cx="${x}" cy="${y}" r="11"/><circle class="g-spot" cx="${x}" cy="${y}" r="8"/><text class="g-spotnum" x="${x}" y="${n(y + 3.6)}" text-anchor="middle">${k + 1}</text></g>`;
    }).join('');
    return scene(MAP.w, MAP.h, base + spots, 'g-villagemap');
  };
  const hensScene = (state) => {
    const sub = state.sub, el = state.t - sub.t0, coop = cfg.hens === 'coop';
    const target = coop ? '<path class="g-line" d="M140 96 h40 v-22 l-20 -12 l-20 12z"/>' : `<ellipse class="g-cabbage" cx="160" cy="88" rx="16" ry="10"/><path class="g-line g-thin" d="M150 86 q10 -8 20 0"/>`;
    const hens = sub.hens.map((h, i) => {
      if (h.gone || el < h.at) return '';
      const k = Math.min(1, (el - h.at) / WALK), x = h.from === 'l' ? 20 + k * 120 : 300 - k * 120, y = 60 + (i % 3) * 16 + (still() ? 0 : Math.sin(el / 120 + i) * 1.5);
      return `<g class="g-hen${h.pecked ? ' is-pecked' : ''}" transform="translate(${n(x)} ${n(y)}) scale(${h.from === 'l' ? 1 : -1} 1)"><ellipse class="g-henbody" cx="0" cy="0" rx="9" ry="6"/><circle class="g-henbody" cx="8" cy="-6" r="3.5"/><path class="g-line g-thin" d="M11 -6 l3 1 M-2 6 v4 M2 6 v4"/></g>`;
    }).join('');
    const fx = sub.fx ? splash(150, 60, state.t - sub.fx.at, { r: 6 }) : '';
    return scene(320, 120, target + hens + fx);
  };
  const pic = (def) => scene(40, 32, `<g transform="translate(20 16)"><path class="${def.line ? 'g-line g-thin' : 'g-print2'}${def.grey ? ' is-grey' : ''}" d="${def.d}"/></g>`, 'g-pic');

  function subHtml(state, t, lang) {
    const sub = state.sub, say = (k, o = {}) => (t[k] ?? '').replace('{name}', o.name ?? '').replace('{n}', String(o.n ?? '')).replace('{p}', String(o.p ?? ''));
    const back = btn(t.back, 'data-g="leave"', 'quiet');
    if (sub.kind === 'hens') {
      const el = state.t - sub.t0;
      const taps = sub.hens.map((h, i) => (h.gone || h.pecked || el < h.at ? '' : `<button type="button" class="g-tag" data-g="shoo" data-i="${i}">${lang === 'en' ? 'Shoo!' : '轰！'}</button>`)).join('');
      return `${hensScene(state)}<p class="g-line-say">${cfg.hens === 'coop' ? t.coopGo : t.hensGo}</p><div class="g-tags">${taps || '<span class="g-chip">…</span>'}</div>`;
    }
    if (sub.kind === 'prints') {
      const want = sub.list[sub.i], opts = printOpts(sub, state);
      const prev = sub.last ? `${say(sub.last, { name: PRINT[sub.lastName][lang] })} ` : '';
      const tiles = opts.map((id) => `<button type="button" class="g-tag" data-g="pick" data-id="${id}">${PRINT[id][lang]}</button>`).join('');
      return `<div class="g-printbox">${pic(PRINT[want])}</div><p class="g-line-say">${prev}${t.printsAsk}</p><div class="g-tags">${tiles}</div>${back}`;
    }
    if (sub.kind === 'herb') {
      const prev = sub.last ? say(sub.last, { name: PLANT[sub.lastName][lang] }) : t.herbAsk;
      const tiles = sub.opts.map((id) => `<button type="button" class="g-tag g-plant${(sub.tried ?? []).includes(id) ? ' is-tried' : ''}" data-g="pick" data-id="${id}"${(sub.tried ?? []).includes(id) ? ' disabled' : ''}>${pic(PLANT[id])}<small>${(sub.tried ?? []).includes(id) ? PLANT[id][lang] : '?'}</small></button>`).join('');
      return `<p class="g-line-say">${prev}</p><div class="g-tags">${tiles}</div>${back}`;
    }
    if (sub.kind === 'peddler') {
      const ware = WARES[sub.i], prev = sub.last ? `${say(sub.last, { p: sub.lastP })} ` : '';
      const tiles = PRICES.map((p) => `<button type="button" class="g-tag" data-g="price" data-p="${p}">${p} ${t.wen}</button>`).join('');
      return `<p class="g-line-say">${prev}${sub.i === 0 ? t.pedAsk : ''}<br><b>${ware[lang]}</b></p><div class="g-tags">${tiles}</div>${back}`;
    }
    const tale = TALE[sub.id], w = tale[lang] ?? tale.zh;
    if (sub.answered) return `<p class="g-line-say g-tale">${w[sub.note]}</p>${btn(t.back, 'data-g="heard"')}`;
    const tiles = tale.options.map((id) => `<button type="button" class="g-tag" data-g="pick" data-id="${id}">${tale.opt[id][lang]}</button>`).join('');
    return `<p class="g-line-say g-tale">${w.tell}</p><div class="g-tags">${tiles}</div>${back}`;
  }

  function html(state, lang = 'zh') {
    const t = T[lang] || T.zh;
    const head = `<div class="g-head"><span>${t.map}</span><span>${t.done} <b>${state.done.length}</b> / ${cfg.spots.length}</span></div>`;
    if (state.won) return `<div class="g-village g-ink is-won">${mapScene(state)}${head}<p class="g-line-say">${t[state.note] ?? ''}</p></div>`;
    if (state.sub) return `<div class="g-village g-ink">${head}${subHtml(state, t, lang)}</div>`;
    const name = (id) => (stop === 'eve' && t.spotEve[id]) || t.spot[id];
    const spots = cfg.spots.map((id, k) => `<button type="button" class="g-tag${state.done.includes(id) ? ' is-on' : ''}" data-g="spot" data-id="${id}"${state.done.includes(id) ? ' disabled' : ''}>${k + 1} · ${name(id)}<small>${state.done.includes(id) ? t.done : ' '}</small></button>`).join('');
    const line = (state.note && t[state.note] ? t[state.note] : t[stop]).replace('{n}', String(state.lost ?? ''));
    return `<div class="g-village g-ink">${mapScene(state)}${head}<p class="g-line-say">${line}</p><div class="g-tags">${spots}</div>${btn(t.home, 'data-g="home"')}${skipBtn(SKIP[lang] ?? SKIP.zh)}</div>`;
  }

  return { meta, newGame, act, tick, html };
}
