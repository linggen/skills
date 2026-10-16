// 忍字 · 原样说回去 — 古一, 马三 at the door (00-masan; batch two, 2026-10-14). The book:
// 马小宝 holds the 桂花糕 under 小满's nose — 「沈——小——满，想吃吗？学声狗叫，给你舔一口。」 —
// and 小满 drawls it back to him, 一个字不差, his fist never raised. Here the taunt is said once;
// then it is his to say back, phrase by phrase, from the pieces on the floor — some of them
// near misses (学声猫叫, 咬一口), one of them 「汪！」. Every wrong piece and every second that
// goes by closes the fist a little; a fist closed all the way ends it — never a fail. The
// grade (word · fist) is written as a mark; both of the scene's ways on stay his.
// Pure module: newGame / html / act / tick (live while he answers; live-games.js).
import { rng, shuffled } from './seeded.js';
import { btn, n, scene, skipped, splash } from './ink.js';
import { mountPure } from './mount.js';
import * as self from './taunt.js';

export const meta = {
  id: 'taunt',
  name: { zh: '忍字 · 原样说回去', en: 'Holding it in · Say it back, word for word' },
  how: {
    zh: '听他说完，再一句一句原样说回去。说错一句、拖一刻，拳头就攥紧一分。',
    en: 'Hear him out, then say it back to him piece by piece. Every wrong piece, every moment lost, and the fist closes a little more.',
  },
};

export const RISE_S = 34; //   seconds for the fist to close with no help from him
export const WRONG = 0.22; //  a wrong piece closes it this much
export const BARK = 0.34; //   「汪！」 closes it more

// The taunt, as the book has it (zh, and the English 《九鼎录》's own words), and the near misses.
const PIECES = {
  zh: { lines: ['沈——小——满，', '想吃吗？', '学声狗叫，', '给你舔一口。'], decoys: ['学声猫叫，', '给你咬一口。', '你配吗？', '汪！'] },
  en: { lines: ['Shen — Xiao — man,', 'want some?', 'Do a dog bark', 'and you can have a lick.'], decoys: ['Do a cat\'s miaow', 'and you can have a bite.', 'As if you deserve me.', 'Woof!'] },
};
const BARK_AT = 7; // the decoy that is a bark

const T = {
  zh: {
    ready: '马小宝把桂花糕举到你鼻子底下，拖长了腔：', start: '原样说回去',
    go: '一句一句，原样说回去。', right: '「……」马小宝的笑僵了一下。', wrong: '不对——马小宝「嗯？」了一声，拳头又紧了一分。',
    bark: '你差点真学了狗叫。拳头一下子攥紧了。', said: '你说', fist: '拳头',
    word: '一个字不差。马小宝一怔，一脸的肉都愣住了。', fistLine: '拳头攥得指节发白——话还在嘴边，没说完。',
    skipped: '你没吭声。',
  },
  en: {
    ready: 'Ma Xiaobao holds the osmanthus cake under your nose and drawls:', start: 'Say it back to him',
    go: 'Piece by piece, word for word.', right: '"…" Ma Xiaobao\'s grin sticks for a moment.', wrong: 'Wrong — Ma Xiaobao goes "Hm?", and the fist closes a little more.',
    bark: 'You almost really barked. The fist clenches hard.', said: 'You say', fist: 'Fist',
    word: 'Not a word out of place. Ma Xiaobao freezes; every bit of flesh on his face freezes with him.', fistLine: 'Your fist is clenched white at the knuckles — the words still on your tongue, unsaid.',
    skipped: 'You say nothing.',
  },
};

export function newGame(seed) {
  const rnd = rng(`taunt:${seed}`);
  return { seed: String(seed), order: shuffled([0, 1, 2, 3, 4, 5, 6, 7], rnd), phase: 'ready', live: false, t: 0, said: 0, tried: [], fist: 0, wrongs: 0, hit: null, note: 'ready', won: false, grade: null };
}

const close = (s, why) => ({ ...s, live: false, won: true, grade: why, note: why === 'word' ? 'word' : 'fistLine' });

const VERBS = {
  start: (s) => (s.phase !== 'ready' ? null : { ...s, phase: 'say', live: true, note: 'go' }),
  say: (s, d) => {
    const i = Number(d.i);
    if (s.phase !== 'say' || !(i >= 0 && i < 8) || s.tried.includes(i)) return null;
    if (i === s.said) {
      const next = { ...s, said: s.said + 1, tried: [], hit: { at: s.t, ok: true }, note: 'right' };
      return next.said >= 4 ? close(next, 'word') : next;
    }
    if (i < s.said) return null; // already said
    const fist = Math.min(1, s.fist + (i === BARK_AT ? BARK : WRONG));
    const next = { ...s, fist, wrongs: s.wrongs + 1, tried: [...s.tried, i], hit: { at: s.t, ok: false }, note: i === BARK_AT ? 'bark' : 'wrong' };
    return fist >= 1 ? close(next, 'fist') : next;
  },
  skip: (s) => skipped(s),
};

export function act(state, data = {}) {
  if (!state || state.won) return { state, won: false };
  const next = VERBS[data.g]?.(state, data);
  if (!next) return { state, won: false };
  return { state: next, won: next.won === true };
}

export function tick(state, ms) {
  if (!state.live || state.won || state.phase !== 'say' || ms <= 0) return state;
  const fist = Math.min(1, state.fist + ms / 1000 / RISE_S);
  const s = { ...state, t: state.t + ms, fist };
  return fist >= 1 ? close(s, 'fist') : s;
}

/* ── The picture: 马小宝's round shape and the cake under the nose, 小满's hand at his side —
   open, then curling into a fist as `fist` closes — and the 忍 behind it all, its blade's dot
   turning cinnabar as the fist closes. */
function tauntScene(state) {
  const f = state.fist, curl = n(f * 22), red = f > 0.66 ? ' is-seal' : '';
  const ren = `<text class="g-bigchar" x="160" y="104" text-anchor="middle">忍</text><circle class="g-dot${red}" cx="${n(176)}" cy="34" r="${n(3 + f * 4)}"/>`;
  const bao = '<circle class="g-line g-faint" cx="62" cy="44" r="16"/><path class="g-line g-faint" d="M30 128 C24 92 40 66 62 64 C86 66 100 92 94 128"/>'
    + '<path class="g-line" d="M88 82 C106 78 120 74 132 70"/>';
  const cake = `<g transform="translate(${n(140 + Math.sin(state.t / 500) * 2)} 66)"><rect class="g-cake" x="-10" y="-7" width="20" height="13" rx="3"/><path class="g-line g-thin" d="M-6 -2 h3 M1 0 h3 M-3 3 h3"/></g>`;
  // His hand: fingers straight when open, folded back over the palm as it closes.
  const hand = `<g transform="translate(262 92)"><path class="g-line" d="M-14 30 C-16 14 -14 2 -10 -4 L10 -4 C14 4 14 18 12 30"/>`
    + [-8, -2, 4, 10].map((x, k) => `<path class="g-line g-thin" d="M${x} -4 q${n(curl * 0.12)} ${n(-18 + curl)} ${n(curl * 0.5 + k)} ${n(-18 + curl * 1.6)}"/>`).join('')
    + `<path class="g-line g-thin" d="M-10 2 q-8 ${n(-6 + curl * 0.3)} ${n(-6 + curl * 0.4)} ${n(-14 + curl * 0.6)}"/></g>`;
  const fx = state.hit ? splash(state.hit.ok ? 150 : 262, state.hit.ok ? 66 : 80, state.t - state.hit.at, { r: state.hit.ok ? 8 : 6, seal: state.hit.ok }) : '';
  const won = state.won && state.grade === 'word' ? splash(160, 66, 300, { r: 12, seal: true }) : '';
  return scene(320, 130, ren + bao + cake + hand + fx + won);
}

export function html(state, lang = 'zh') {
  const t = T[lang] || T.zh, P = PIECES[lang] || PIECES.zh, all = [...P.lines, ...P.decoys];
  const saidLine = P.lines.slice(0, state.said).join(lang === 'en' ? ' ' : '');
  const q = (x) => (lang === 'en' ? `"${x}"` : `「${x}」`);
  const head = `<div class="g-head"><span>${t.said} <b>${state.said}</b> / 4</span><span class="${state.fist > 0.66 ? 'is-wet' : ''}">${t.fist} <b>${Math.round(state.fist * 100)}%</b></span></div>`;
  if (state.won) {
    const quote = state.said ? `<p class="g-quote">${q(saidLine)}</p>` : '';
    return `<div class="g-taunt g-ink is-won">${tauntScene(state)}${head}${quote}<p class="g-line-say">${t[state.note] ?? ''}</p></div>`;
  }
  if (state.phase === 'ready') {
    return `<div class="g-taunt g-ink">${tauntScene(state)}<p class="g-line-say">${t.ready}<br><b>${q(P.lines.join(lang === 'en' ? ' ' : ''))}</b></p>${btn(t.start, 'data-g="start"')}</div>`;
  }
  const tiles = state.order.map((i) => {
    const done = i < state.said, tried = state.tried.includes(i);
    return `<button type="button" class="g-tag${tried ? ' is-tried' : ''}${done ? ' is-on' : ''}" data-g="say" data-i="${i}"${done || tried ? ' disabled' : ''}>${all[i]}</button>`;
  }).join('');
  const meter = `<div class="g-meter"><span>${t.fist}</span><span class="g-bar is-seal"><i style="width:${Math.round(state.fist * 100)}%"></i></span></div>`;
  return `<div class="g-taunt g-ink">${tauntScene(state)}${head}${meter}<p class="g-quote">${q(saidLine || '…')}</p>`
    + `<div class="g-tags">${tiles}</div><p class="g-line-say">${t[state.note] ?? ''}</p></div>`;
}

/** The small-game contract (mount.js): this board alone in a container — the 游戏厅, a try page, or a beat's host. */
export const mount = (container, opts) => mountPure(self)(container, opts);
