// memory.js — 银月的记忆是彩色的 (哇时刻 ③, Hanli 2026-09-29): the memory on
// the stage, the album in 录, and the ink world's one switch.
//
// Everything in the game is ink; only her memories are in colour. A memory
// comes in as grey ink and blooms into colour over a few seconds (memory.css
// `mem-bloom`; reduced motion: colour at once), one picture, with only her own
// short lines under it — Ling is silent on the stage. The album is eight
// frames lit one by one; a dark frame shows only a tail's outline. The finale
// sets `colour` on the save and the page drops the ink filter everywhere
// (`colourOn`). Pure drawing: every word esc()'d, nothing here writes.
import { esc } from './esc.js';

export const MEM_WORDS = {
  zh: {
    album: '银月的记忆', albumNote: '一鼎一尾，一尾一段记忆。', tail: '第{n}条尾巴', dark: '还没想起',
    replay: '再看一遍', next: '下一幅 ›', close: '收起', memory: '银月的记忆 · {title}', fragments: '散落的碎片',
    finale: '九鼎归位',
  },
  en: {
    album: 'Yinyue’s memories', albumNote: 'One cauldron, one tail, one memory.', tail: 'Tail {n}', dark: 'not yet remembered',
    replay: 'See it again', next: 'Next ›', close: 'Close', memory: 'Yinyue’s memory · {title}', fragments: 'Fragments found',
    finale: 'The nine come home',
  },
};
const ZH_NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const words = (lang) => MEM_WORDS[lang] ?? MEM_WORDS.zh;
const say = (t, vars) => String(t).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
const tailName = (n, lang) => say(words(lang).tail, { n: lang === 'en' ? n : ZH_NUM[n] ?? n });

/// How long the ink takes to become colour, and when her lines come in.
export const BLOOM_MS = 4200;

/// A fox tail's outline — what an empty frame holds.
export const tailSvg = (cls = 'memtailsvg') => `<svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true"><path d="M14 54c-4-10 0-22 10-30 8-6 12-14 10-20 8 4 14 14 12 26-1 9-7 16-15 20-6 3-12 4-17 4z M24 40c4-2 8-6 10-12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/// The memory in the main slot: its one picture (Hanli, 2026-09-29: 「银月一章
/// 一图就好」) and her lines — `play` is {n, tail, title, art, lines}. `age` is how long it has been blooming (ms) — a
/// redraw carries on from there, never starts the bloom again. `still` (the
/// player asked for reduced motion) shows the colour at once, lines and all.
export function memoryCardHtml(play, { age = 0, still = false, artBase = '', lang = 'zh' } = {}) {
  if (!play?.art) return '';
  const w = words(lang), p = play;
  const bloom = still ? '' : ' bloom';
  const delay = still ? '' : ` style="--mem-age:${Math.round(-age)}ms"`;
  const lines = (p.lines ?? []).map((l, k) => `<p style="--k:${k}">${esc(l)}</p>`).join('');
  return `<div class="card memory${still ? ' still' : ''}" data-mem="${esc(play.n)}" role="group" aria-label="${esc(say(w.memory, { title: play.title ?? '' }))}"${delay}>
    <div class="memhead">${tailSvg()}<span>${esc(tailName(play.tail, lang))}</span><b>${esc(play.title ?? '')}</b></div>
    <figure class="memfig"><img class="memart${bloom}" src="${esc(artBase + p.art)}" alt="${esc(play.title ?? '')}"></figure>
    <div class="memlines">${lines}</div>
    <div class="acts"><button class="act quiet" data-mem-close>${esc(w.close)}</button></div>
  </div>`;
}

/// 「银月的记忆」 in the 录 book: the eight frames — a lit one its first
/// panel and title, a tap replays it; a dark one a tail's outline — and the
/// fragments found, each with the line it leaves. Shown before any memory
/// too: eight empty frames are the beta's teaser.
export function albumHtml(album, { artBase = '', lang = 'zh' } = {}) {
  if (!album?.frames?.length) return '';
  const w = words(lang);
  const label = (f) => `<span>${esc(tailName(f.tail, lang))} · ${esc(f.title ?? '')}</span>`;
  // Lit and painted: its first panel, a tap replays it. Lit before its picture
  // is painted (a scratch save; the lint keeps a real one from being granted): its name.
  const frame = (f) => (f.lit && f.art
    ? `<button class="memframe lit" data-mem-replay="${esc(f.n)}" title="${esc(w.replay)}"><img class="memart" src="${esc(artBase + f.art)}" alt="" loading="lazy">${label(f)}</button>`
    : f.lit ? `<div class="memframe lit bare">${tailSvg()}${label(f)}</div>`
      : `<div class="memframe dark" role="img" aria-label="${esc(`${tailName(f.tail, lang)} · ${w.dark}`)}">${tailSvg()}</div>`);
  const frags = (album.fragments ?? []).map((f) => `<div class="memfrag"><img class="fragart" src="${esc(artBase + f.art)}" alt="${esc(f.thing ?? '')}" loading="lazy"><span>${esc(f.line ?? '')}</span></div>`).join('');
  return `<section class="lusec lualbum"><h3>${esc(w.album)}</h3><p class="small dim">${esc(w.albumNote)}</p>
    <div class="memframes">${album.frames.map(frame).join('')}</div>
    ${frags ? `<h4 class="small dim">${esc(w.fragments)}</h4><div class="memfrags">${frags}</div>` : ''}</section>`;
}

/// A lit frame of the album as something to play again (the replay).
export const replayOf = (album, n) => {
  const f = (album?.frames ?? []).find((x) => x.lit && String(x.n) === String(n));
  return f ? { n: f.n, tail: f.tail, title: f.title, art: f.art ?? null, lines: f.lines ?? [] } : null;
};

/// The finale's switch: true once the save holds `colour` — the page drops
/// the ink filter from every picture (memory.css `html.colour`).
export const colourOn = (look) => Boolean(look?.memories?.colour);

/// A memory come back that the page has not played yet: Look's `last`,
/// newer than the one noted, and recent (a reload days later replays nothing).
export function freshMemory(look, seenAt, now = Date.now(), within = 10 * 60_000) {
  const last = look?.memories?.last;
  if (!last?.at || last.at === seenAt) return null;
  return now - Date.parse(last.at) < within ? last : null;
}
