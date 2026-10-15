// 相克 · 五句 — 古六, the lecture hall (wm-qianye's second board; the per-回 plan, 2026-10-15).
// The book: 褚先生 has them learn 岐伯's five lines from the 《素问》 — 「木得金而伐，火得水而灭，土得木
// 而达，金得火而缺，水得土而绝」 — and takes them apart one by one: 对面立土墙，木藤去钻；放木藤，一道
// 金刃；使金刃，火弹迎上去；扔火弹，一根冰锥；冰锥来了，立一堵土墙. Here the other side throws, and
// he answers with what eats it. A wrong answer gets the line said for him and the throw comes back.
// Grade clean · rough (a mark: the 大比's bouts show the line for their foe's element).
// Pure module: newGame / html / act.
import { btn, scene, skipped, splash } from './ink.js';

export const meta = {
  id: 'xiangke',
  name: { zh: '相克 · 五句', en: 'What eats what · Five lines' },
  how: {
    zh: '对面出什么，你出吃它的那一样。木得金而伐，火得水而灭，土得木而达，金得火而缺，水得土而绝。',
    en: 'Whatever comes at you, answer with what eats it. Wood is felled by metal, fire put out by water, earth broken by wood, metal notched by fire, water stopped by earth.',
  },
};

// What comes, what eats it (素问 · 五行相胜).
export const EATS = { wall: 'vine', vine: 'blade', blade: 'fire', fire: 'ice', ice: 'wall' };
export const SPELLS = ['fire', 'ice', 'blade', 'vine', 'wall'];
export const THROWS = 8;

const T = {
  zh: {
    ready: '「这四样怎么认？」褚先生拿戒尺敲了敲桌子。「五句，背下来。」——「一样吃一样，转一圈，谁也不是老大。」', start: '对面出手',
    fire: '火弹', ice: '冰锥', blade: '金刃', vine: '木藤', wall: '土墙',
    comes: '对面——{x}！', throw: '第', of: '手',
    ok: {
      wall: '木藤从土墙根底下钻进去，根往土里一扎，墙自己便裂了。', vine: '一道金刃，木藤削断了。', blade: '火弹迎上去，刃口便卷了。',
      fire: '一根冰锥，两样一齐化成白汽。', ice: '立一堵土墙，冰锥全扎在土里。',
    },
    line: { wall: '「土得木而达。」', vine: '「木得金而伐。」', blade: '「金得火而缺。」', fire: '「火得水而灭。」', ice: '「水得土而绝。」' },
    miss: '没吃动。褚先生：', back: '——这一手，回头还要来。',
    clean: '八手，手手吃得住。旁人背下来，是知道自己怕什么；你背下来，是对面出什么，你手里都有吃它的那一样。', rough: '八手对完了，有几手是褚先生替你念出来的。五句，你背下来了。',
    skipped: '五句，你在心里过了一遍。',
  },
  en: {
    ready: '"How do you tell these four apart?" Master Chu raps the desk with his ruler. "Five lines — learn them." — "Each one eats another; round the circle, none is master."', start: 'They throw',
    fire: 'Fireball', ice: 'Ice spike', blade: 'Metal blade', vine: 'Vine', wall: 'Earth wall',
    comes: 'From across — {x}!', throw: 'Throw', of: '',
    ok: {
      wall: 'The vine bores in under the wall, its roots drive into the earth, and the wall splits by itself.', vine: 'One metal blade, and the vine is cut through.', blade: 'A fireball meets it, and the edge curls.',
      fire: 'One ice spike, and both turn to white steam.', ice: 'An earth wall goes up, and the ice spikes all sink into the earth.',
    },
    line: { wall: '"Earth is broken by wood."', vine: '"Wood is felled by metal."', blade: '"Metal is notched by fire."', fire: '"Fire is put out by water."', ice: '"Water is stopped by earth."' },
    miss: 'It didn\'t eat it. Master Chu:', back: ' — that throw will come again.',
    clean: 'Eight throws, every one eaten. Others learn the lines to know what they fear; you learn them knowing that whatever comes, you hold the thing that eats it.', rough: 'Eight throws answered, a few with Master Chu saying the line for you. You have the five lines by heart.',
    skipped: 'You go over the five lines in your head.',
  },
};

function hash(str) { let h = 2166136261 >>> 0; for (const ch of String(str)) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0; return h; }
/* The throws: every spell once, then three more, never the same twice running. */
export function throwsOf(seed) {
  let h = hash(`xiangke:${seed}`);
  const next = () => { h = Math.imul(h ^ (h >>> 13), 2654435761) >>> 0; return h; };
  const out = [];
  const pool = [...SPELLS];
  while (pool.length) out.push(pool.splice(next() % pool.length, 1)[0]);
  while (out.length < THROWS) { const x = SPELLS[next() % SPELLS.length]; if (x !== out.at(-1)) out.push(x); }
  return out;
}

export function newGame(seed) {
  return { seed: String(seed), phase: 'ready', queue: throwsOf(seed), done: 0, misses: 0, last: null, note: 'ready', won: false, grade: null };
}

export const stuck = (s) => s.misses >= 5;
export const gradeOf = (s) => (s.misses <= 1 ? 'clean' : 'rough');

function answer(s, d) {
  if (s.phase !== 'throw' || !SPELLS.includes(d.x)) return null;
  const [comes, ...rest] = s.queue;
  if (EATS[comes] !== d.x) return { ...s, queue: [...rest, comes], misses: s.misses + 1, last: { comes, ok: false }, note: 'miss' };
  const done = s.done + 1;
  if (!rest.length) { const grade = gradeOf(s); return { ...s, queue: rest, done, last: { comes, ok: true }, won: true, grade, note: grade }; }
  return { ...s, queue: rest, done, last: { comes, ok: true }, note: 'ok' };
}

const VERBS = {
  start: (s) => (s.phase === 'ready' ? { ...s, phase: 'throw', note: 'comes' } : null),
  answer,
  skip: (s) => skipped(s),
};

export function act(state, data = {}) {
  if (!state || state.won) return { state, won: false };
  const next = VERBS[data.g]?.(state, data);
  if (!next) return { state, won: false };
  return { state: next, won: next.won === true };
}

/* ── The picture: the five in a ring (火 南 at the bottom as the 讲堂's map is drawn, 水 北 at
   the top), the arrow of what eats what drawn round it; the one coming at him blotted, the
   answer that ate it sealed. */
const RING = { ice: [160, 18], vine: [236, 66], wall: [206, 122], blade: [114, 122], fire: [84, 66] };
const GLYPH = { zh: { fire: '火', ice: '水', blade: '金', vine: '木', wall: '土' }, en: { fire: 'F', ice: 'W', blade: 'M', vine: 'Wd', wall: 'E' } };
function ringScene(state, lang) {
  const g = GLYPH[lang] ?? GLYPH.zh, comes = state.queue[0];
  const arrows = Object.entries(EATS).map(([x, y]) => `<path class="g-line g-thin g-faint" d="M${RING[y][0]} ${RING[y][1]} L${RING[x][0]} ${RING[x][1]}"/>`).join('');
  const marks = SPELLS.map((x) => `<g class="g-spotmark${state.last?.ok && EATS[state.last.comes] === x ? ' is-done' : ''}"><circle class="g-spot" cx="${RING[x][0]}" cy="${RING[x][1]}" r="14"/><text class="g-spotnum" x="${RING[x][0]}" y="${RING[x][1] + 4}" text-anchor="middle">${g[x]}</text></g>`).join('');
  const hit = state.phase === 'throw' && comes ? splash(RING[comes][0], RING[comes][1], 200, { r: 16 }) : '';
  return scene(320, 140, arrows + marks + hit);
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh;
  const head = `<div class="g-head"><span>${t.throw} <b>${Math.min(state.done + 1, THROWS)}</b> / ${THROWS} ${t.of}</span></div>`;
  if (state.won) return `<div class="g-xiangke g-ink is-won">${ringScene(state, lang)}${head}<p class="g-line-say">${t.ok[state.last?.comes] ?? ''} ${t[state.grade ?? 'skipped']}</p></div>`;
  if (state.phase === 'ready') return `<div class="g-xiangke g-ink">${ringScene(state, lang)}<p class="g-line-say">${t.ready}</p>${btn(t.start, 'data-g="start"')}</div>`;
  const comes = state.queue[0], c = t.comes.replace('{x}', t[comes]);
  const lead = state.note === 'ok' ? `${t.ok[state.last.comes]} ` : state.note === 'miss' ? `${t.miss}${t.line[state.last.comes]}${t.back} ` : '';
  const pad = `<div class="g-tags">${SPELLS.map((x) => `<button type="button" class="g-tag" data-g="answer" data-x="${x}">${t[x]}</button>`).join('')}</div>`;
  return `<div class="g-xiangke g-ink">${ringScene(state, lang)}${head}<p class="g-line-say">${lead}<b>${c}</b></p>${pad}</div>`;
}
