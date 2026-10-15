// 底册 · 看完烧了 — 古六, 腊月初八 at the 伙房 (wm-laba; the per-回 plan, 2026-10-15).
// The book: 阿禾 tears a page out of her notebook — copied from the 藏经阁's 大比 底册 — and slips it
// under his bowl: 「一行一个名字，字小得像蚂蚁排队，十来个……卢方那一行他看了两遍，秦雁那一行也看了
// 两遍。看到最后一行——祁长松——只有四个字」; 「看完烧了」, and he holds it to the 灶口. Only the
// lines the book gives are legible — 卢方 「使完金刃，要喘一口气」 (古六's own bout), 秦雁 「剑气三尺。
// 到了台边，往前送一寸。出手留三分。不踩人」 (her notebook, as 古七 reads it out), 祁长松 「没法打，认输」;
// the other rows stay ant-sized ink, never invented. Read a row twice to have it by heart; burn when
// done. Grade kept (all three by heart: the mark that lets him read 卢方 and 秦雁 at the 大比) · hasty.
// Pure module: newGame / html / act.
import { btn, scene, skipped, splash } from './ink.js';

export const meta = {
  id: 'diche',
  name: { zh: '底册 · 看完烧了', en: 'The old records · Burn it after' },
  how: {
    zh: '点一行看一遍，看两遍便记住了。看完，凑到灶口烧了。',
    en: 'Tap a line to read it; twice and you have it by heart. Then hold it to the stove and burn it.',
  },
};

// The legible rows (the book's) and how often he read each; the rest are blurred.
export const ROWS = [
  { id: 'blur1' }, { id: 'lufang', reads: 2 }, { id: 'blur2' }, { id: 'blur3' }, { id: 'qinyan', reads: 2 }, { id: 'blur4' }, { id: 'blur5' }, { id: 'qichangsong', reads: 1 },
];
const KEY = ROWS.filter((r) => r.reads);

const T = {
  zh: {
    ready: '她从怀里摸出小本子，撕下一页，折成指甲盖大小，压在他碗底下：「我不上台，眼睛闲着。」', start: '把那页纸展开',
    lufang: ['卢方', '使完金刃，要喘一口气。'], qinyan: ['秦雁', '剑气三尺。到了台边，往前送一寸。出手留三分。不踩人。'], qichangsong: ['祁长松', '没法打，认输。'],
    blur: '字小得像蚂蚁排队', look: '你看了一遍。', again: '又看了一遍——记住了。', last: '只有四个字。你抬起头来。', ant: '那一行，字小得像蚂蚁排队，认不清。',
    watch: '阿禾吸溜着粥，面无表情：「看完烧了。叫人瞧见亲传给外门的抄底细，师父的脸没处搁，我的也没处搁。」',
    burn: '凑到灶口', read: '记住',
    kept: '小满把那张纸凑到灶口，看着它卷起来，黑了。纸上的字，他已经一个一个记进了肚子里。', hasty: '小满把那张纸凑到灶口，看着它卷起来，黑了。有几行，他还没来得及记住。',
    skipped: '小满把那张纸凑到灶口，看着它卷起来，黑了。',
  },
  en: {
    ready: 'She takes out her little notebook, tears off a page, folds it to the size of a fingernail and slips it under his bowl. "I\'m not fighting. My eyes are free."', start: 'Unfold the page',
    lufang: ['Lu Fang', 'After a metal blade, he needs a breath.'], qinyan: ['Qin Yan', 'Sword-qi three feet. At the edge, one inch more. Holds back three parts. Never stamps.'], qichangsong: ['Qi Changsong', 'Can\'t be fought. Concede.'],
    blur: 'writing as small as a line of ants', look: 'You read it once.', again: 'And again — you have it.', last: 'Just a few words. You look up.', ant: 'That line is ant-small; you can\'t make it out.',
    watch: 'Ahe slurps her porridge, expressionless. "Burn it after. If anyone sees a master\'s own disciple copying secrets for the outer court, my master loses face, and so do I."',
    burn: 'Hold it to the stove', read: 'by heart',
    kept: 'Xiaoman held the paper to the stove mouth and watched it curl up and go black. Every word on it was already in his belly.', hasty: 'Xiaoman held the paper to the stove mouth and watched it curl up and go black. A few lines he hadn\'t yet got by heart.',
    skipped: 'Xiaoman held the paper to the stove mouth and watched it curl up and go black.',
  },
};

export function newGame(seed) {
  return { seed: String(seed), phase: 'ready', reads: {}, ants: 0, last: null, note: 'ready', won: false, grade: null };
}

export const byHeart = (s, r) => (s.reads[r.id] ?? 0) >= r.reads;
export const stuck = (s) => s.ants >= 4;

function read(s, d) {
  const r = ROWS.find((x) => x.id === d.r);
  if (s.phase !== 'page' || !r) return null;
  if (!r.reads) return { ...s, ants: s.ants + 1, last: r.id, note: s.ants + 1 >= 3 ? 'watch' : 'ant' };
  const k = (s.reads[r.id] ?? 0) + 1;
  return { ...s, reads: { ...s.reads, [r.id]: k }, last: r.id, note: r.id === 'qichangsong' ? 'last' : k >= r.reads ? 'again' : 'look' };
}

const VERBS = {
  start: (s) => (s.phase === 'ready' ? { ...s, phase: 'page', note: 'page' } : null),
  read,
  burn: (s) => {
    if (s.phase !== 'page') return null;
    const grade = KEY.every((r) => byHeart(s, r)) ? 'kept' : 'hasty';
    return { ...s, phase: 'burnt', won: true, grade, note: grade };
  },
  skip: (s) => skipped(s),
};

export function act(state, data = {}) {
  if (!state || state.won) return { state, won: false };
  const next = VERBS[data.g]?.(state, data);
  if (!next) return { state, won: false };
  return { state: next, won: next.won === true };
}

/* ── The picture: the bowl of 腊八粥 with the folded page under it, and the 灶口 to one side; once
   burnt, the page is a curl of black at the stove. */
function picture(state) {
  const bowl = '<path class="g-line" d="M90 60 q50 46 100 0 Z"/><path class="g-line g-thin g-faint" d="M100 58 q40 -8 80 0"/>';
  const page = state.phase === 'burnt' ? '' : '<rect class="g-line g-thin" x="122" y="96" width="36" height="12" rx="1"/>';
  const stove = '<path class="g-line" d="M230 110 V62 H300 V110"/><path class="g-mouth" d="M246 110 V92 Q265 76 284 92 V110 Z"/>';
  const fire = '<path class="g-flame" d="M258 110 q-6 -10 0 -18 q6 8 0 18z"/><path class="g-flame" d="M272 110 q-6 -12 0 -20 q6 10 0 20z"/>';
  const curl = state.phase === 'burnt' ? splash(265, 86, 300, { r: 10 }) : '';
  return scene(320, 120, bowl + page + stove + fire + curl);
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  if (state.won) return `<div class="g-diche g-ink is-won">${picture(state)}<p class="g-line-say">${t[state.grade ?? 'skipped']}</p></div>`;
  if (state.phase === 'ready') return `<div class="g-diche g-ink">${picture(state)}<p class="g-line-say">${t.ready}</p>${btn(t.start, 'data-g="start"')}</div>`;
  const rows = ROWS.map((r) => {
    if (!r.reads) return `<button type="button" class="g-diche-row is-blur" data-g="read" data-r="${r.id}">${'▪'.repeat(7 + (r.id.length % 4))} <small>${t.blur}</small></button>`;
    const [name, line] = t[r.id], k = state.reads[r.id] ?? 0, got = byHeart(state, r);
    return `<button type="button" class="g-diche-row${got ? ' is-on' : ''}" data-g="read" data-r="${r.id}"><b>${name}</b> ${k ? line : '……'}${got ? ` <small>· ${t.read}</small>` : ''}</button>`;
  }).join('');
  const say = state.note === 'page' ? '' : t[state.note] ?? '';
  return `<div class="g-diche g-ink">${picture(state)}<div class="g-diche-page">${rows}</div><p class="g-line-say">${say}</p>${btn(t.burn, 'data-g="burn"', 'soft')}</div>`;
}

