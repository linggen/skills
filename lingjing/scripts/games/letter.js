// 写信 · 擦了又写 — 古六, the night of the 大比 (wm-jiaxin; the per-回 plan, 2026-10-15).
// The book: he lies on the bunk writing home by moonlight — 「他头一句写的是『娘，我当上仙人了』，擦了；
// 第二句写『娘，我打赢了马小宝』，想了想，这话要是传到村里，马三怕是要上门，又擦了」 — then the real
// letter, line by line, folded, opened again for 「娘，漏勺也能打水。」 And 孙二狗's, asked for that
// night: 「就写：娘，我倒了七回，起来了七回。」「别写是谁把我打倒的。」 Here he writes both: what he
// writes and should not stands a moment and is rubbed out, as the book has it. No grade.
// Pure module: newGame / html / act.
import { btn, scene, skipped } from './ink.js';

export const meta = {
  id: 'letter',
  name: { zh: '写信 · 擦了又写', en: 'The letter · Written, rubbed out, written' },
  how: {
    zh: '一句一句地写。不该写的，写了也得擦。',
    en: 'Write it line by line. What shouldn\'t be written gets rubbed out.',
  },
};

// His letter: the lines he wrote and rubbed out (`rub`, with the book's reason), and the letter's own.
export const FIRST = [
  { id: 'xian', rub: true, zh: '娘，我当上仙人了', en: 'Mother, I\'ve become an immortal' },
  { id: 'ma', rub: true, zh: '娘，我打赢了马小宝', en: 'Mother, I beat Ma Xiaobao' },
  { id: 'men', zh: '娘：我进仙门了。', en: 'Mother: I\'ve got into the immortals\' gate.' },
];
export const BODY = [
  { id: 'liang', zh: '一年五两，观里说腊月就送到家。', en: 'Five taels a year; the temple says it will reach home by the twelfth month.' },
  { id: 'wu', zh: '屋顶修一修。', en: 'Mend the roof.' },
  { id: 'pen', zh: '盆可以收起来了，十七个都收。', en: 'You can put the basins away now, all seventeen.' },
  { id: 'xi', zh: '给我爹买一副护膝，狗皮的。', en: 'Buy Father a pair of knee pads, dog-skin.' },
  { id: 'wupo', zh: '给吴婆婆，再送一条鹿腿，这回是买的。', en: 'Send Granny Wu another leg of venison — bought, this time.' },
  { id: 'hao', zh: '我在这里很好。', en: 'I\'m fine here.' },
  { id: 'zhang', zh: '有人欺负我，我记着账。有几笔，已经还上了。', en: 'When people bully me, I keep accounts. Some are already paid back.' },
];
export const ADDED = { zh: '娘，漏勺也能打水。', en: 'Mother, a ladle with holes can draw water too.' };
export const SUN = [
  { id: 'qi', zh: '娘，我倒了七回，起来了七回。', en: 'Mother, I fell down seven times and got up seven times.' },
  { id: 'who', rub: true, zh: '是内门的卢方把我打倒的。', en: 'It was Lu Fang of the inner court who knocked me down.' },
];

const T = {
  zh: {
    ready: '孙二狗走了以后，你趴在铺上，就着窗外的月光，给家里写第一封信。', start: '研墨',
    first: '头一句，写什么？', rub_xian: '……擦了。', rub_ma: '想了想，这话要是传到村里，马三怕是要上门，又擦了。',
    body: '一笔一笔地写。', sign: '落款', signed: '——小满', fold: '你把信折好，想了想，又打开来，在最底下添了一行——', add: '添一行',
    sun: '「沈师兄，明天替我写封信。」孙二狗的。', rub_who: '他顿了一顿：「别写是谁把我打倒的。」——擦了。', sunSign: '——孙二狗',
    done: '两封信压在枕头底下，明天一早交给周衡，一车送下山。', skipped: '信压在枕头底下，明天一早交给周衡。',
  },
  en: {
    ready: 'After Sun Ergou has gone you lie on your bunk and, by the moonlight from the window, write your first letter home.', start: 'Grind the ink',
    first: 'The first line — what?', rub_xian: '…rubbed out.', rub_ma: 'On second thought — if that got back to the village, Ma San might come to the door. Rubbed out.',
    body: 'Stroke by stroke, you write.', sign: 'Sign it', signed: '— Xiaoman', fold: 'You fold the letter, think, open it again, and add a line at the very bottom —', add: 'Add a line',
    sun: '"Brother Shen, write a letter for me tomorrow." Sun Ergou\'s.', rub_who: 'He paused: "Don\'t write who knocked me down." — rubbed out.', sunSign: '— Sun Ergou',
    done: 'Both letters under the pillow, for Zhou Heng first thing tomorrow, to go down the mountain on one cart.', skipped: 'The letter under your pillow, for Zhou Heng first thing tomorrow.',
  },
};

export function newGame(seed) {
  return { seed: String(seed), phase: 'ready', sheet: [], rubbed: [], sun: [], rubs: 0, note: 'ready', won: false, grade: null };
}

export const stuck = () => false;
const written = (s, id) => s.sheet.includes(id);

function write(s, d) {
  const line = [...FIRST, ...BODY, ...SUN].find((x) => x.id === d.l);
  if (!line) return null;
  if (s.phase === 'first' && FIRST.includes(line)) {
    if (line.rub) return { ...s, rubbed: [...new Set([...s.rubbed, line.id])], rubs: s.rubs + 1, note: `rub_${line.id}` };
    return { ...s, sheet: [line.id], phase: 'body', note: 'body' };
  }
  if (s.phase === 'body' && BODY.includes(line) && !written(s, line.id)) return { ...s, sheet: [...s.sheet, line.id], note: 'body' };
  if (s.phase === 'sun' && SUN.includes(line)) {
    if (line.rub) return { ...s, rubbed: [...new Set([...s.rubbed, line.id])], rubs: s.rubs + 1, note: 'rub_who' };
    return { ...s, sun: [line.id], phase: 'done', won: true, note: 'done' };
  }
  return null;
}

const VERBS = {
  start: (s) => (s.phase === 'ready' ? { ...s, phase: 'first', note: 'first' } : null),
  write,
  sign: (s) => (s.phase === 'body' && BODY.every((x) => written(s, x.id)) ? { ...s, phase: 'fold', note: 'fold' } : null),
  add: (s) => (s.phase === 'fold' ? { ...s, phase: 'sun', added: true, note: 'sun' } : null),
  skip: (s) => skipped(s),
};

export function act(state, data = {}) {
  if (!state || state.won) return { state, won: false };
  const next = VERBS[data.g]?.(state, data);
  if (!next) return { state, won: false };
  return { state: next, won: next.won === true };
}

/* The paper, by moonlight: a window's square of light and the sheet under it. */
const picture = () => scene(320, 56, '<rect class="g-line g-thin g-faint" x="232" y="6" width="44" height="40"/><path class="g-line g-thin g-faint" d="M254 6 V46 M232 26 H276"/><path class="g-line" d="M40 50 l20 -40 h130 l-20 40 Z"/>');

function sheetHtml(state, lang) {
  const say = (x) => x[lang] ?? x.zh;
  const rubbed = FIRST.filter((x) => state.rubbed.includes(x.id)).map((x) => `<s>${say(x)}</s>`);
  const mine = [...FIRST, ...BODY].filter((x) => state.sheet.includes(x.id)).sort((a, b) => state.sheet.indexOf(a.id) - state.sheet.indexOf(b.id)).map(say);
  const end = ['fold', 'sun', 'done'].includes(state.phase) || state.won ? [T[lang].signed] : [];
  const add = state.added ? [`<b>${say(ADDED)}</b>`] : [];
  const his = `<div class="g-letter-sheet">${[...rubbed, ...mine, ...end, ...add].map((l) => `<p>${l}</p>`).join('')}</div>`;
  if (!['sun', 'done'].includes(state.phase)) return his;
  const sunRub = state.rubbed.includes('who') ? [`<s>${say(SUN[1])}</s>`] : [];
  const sun = state.sun.length ? [say(SUN[0]), T[lang].sunSign] : [];
  return his + `<div class="g-letter-sheet">${[...sunRub, ...sun].map((l) => `<p>${l}</p>`).join('') || '<p>……</p>'}</div>`;
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  const say = (x) => x[lang] ?? x.zh;
  if (state.won) return `<div class="g-letter g-ink is-won">${picture()}${sheetHtml(state, lang)}<p class="g-line-say">${state.sun.length ? t.done : t.skipped}</p></div>`;
  if (state.phase === 'ready') return `<div class="g-letter g-ink">${picture()}<p class="g-line-say">${t.ready}</p>${btn(t.start, 'data-g="start"')}</div>`;
  const tags = (lines) => `<div class="g-tags">${lines.map((x) => {
    const gone = state.rubbed.includes(x.id) || state.sheet.includes(x.id);
    return `<button type="button" class="g-tag${gone ? ' is-tried' : ''}" data-g="write" data-l="${x.id}"${gone ? ' disabled' : ''}>${say(x)}</button>`;
  }).join('')}</div>`;
  const controls = state.phase === 'first' ? tags(FIRST)
    : state.phase === 'body' ? `${tags(BODY)}${BODY.every((x) => written(state, x.id)) ? btn(t.sign, 'data-g="sign"') : ''}`
      : state.phase === 'fold' ? btn(t.add, 'data-g="add"') : tags(SUN);
  return `<div class="g-letter g-ink">${picture()}${sheetHtml(state, lang)}<p class="g-line-say">${t[state.note] ?? ''}</p>${controls}</div>`;
}
