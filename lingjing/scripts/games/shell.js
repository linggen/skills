// shell.js — the one outer shell every small game wears (Hanli 2026-10-20: 「确保所有小游戏一套外壳」; doc/game-kit.md
// layer 2). Two parts, shared by the three places a game plays — the story's board card (cards.js), the 游戏厅
// (arcade.js) and the try page (try-game.html):
//
//   frame       one HTML string around whatever the game draws in: the bar (title, type, pause), the how-to
//               line, the stage the game lives on (its own `[data-game]` / `[data-mount]` / slot node, kept
//               as is), a layer over the stage (pause, the result, a speech bubble) and the result line.
//   controller  what the shell does, held in a store keyed by the board's id, never in the DOM — the story
//               lays its card again on every Look, so the frame is drawn FROM the store each time: pause
//               (`isPaused`, composed with the page's own 回看 pause), the lead card before a game, the
//               result (stars, 再来 / 下一关 off the story; the story's own pay and 得牌 follow its win as
//               ever), and `say(id, who, text)`, a bubble over the stage (台词预取's lines land there).
//
// A game hears the shell through its mount options: `shell: { paused(), onPause(fn), say(who, text), lead(text, o) }`.
// mountPure (games/mount.js) stops a pure board's clock and hands while paused; a kit that runs its own loop
// (Phaser) reads `paused()` or listens with `onPause`. Nothing here knows a game.

import { SPEEDS, paceOf, sentencesOf } from '../lines.js';

const W = {
  zh: { pause: '暂停', resume: '继续', paused: '暂停中', won: '成', lost: '未成', again: '再来', next: '下一关', start: '开始' },
  en: { pause: 'Pause', resume: 'Resume', paused: 'Paused', won: 'Done', lost: 'Not yet', again: 'Again', next: 'Next', start: 'Start' },
};
const words = (lang) => W[lang === 'en' ? 'en' : 'zh'];
const plain = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/* ── The store: what the shell holds for a board, by its id ── */
const store = new Map(); // id → { paused, result, bubble }
const listeners = new Set();
const entry = (id) => { if (!store.has(id)) store.set(id, { paused: false, result: null, bubble: null }); return store.get(id); };
const changed = (id) => { for (const fn of [...listeners]) try { fn(id, entry(id)); } catch (e) { console.warn('[shell]', e); } };

export const isPaused = (id) => Boolean(store.get(id)?.paused);
/** Any board paused — the story page's clock (live-games.js) stops for it, as it does for 回看. */
export const anyPaused = () => [...store.values()].some((s) => s.paused);
export function setPaused(id, on) { const s = entry(id); if (s.paused === Boolean(on)) return; s.paused = Boolean(on); changed(id); paint(id); }
/** Listen for a board's shell changing (pause, result, bubble); answers the function that stops it. */
export function onShell(fn) { listeners.add(fn); return () => listeners.delete(fn); }
/** A board left or dealt again: its shell forgets it (a fresh deal is never born paused). */
export function forget(id) { store.delete(id); }

/* ── The frame ── */

/** A game the shell can pause: one that runs in time (`tick`), or that says its own loop reads the pause (`meta.pause`). */
export const timedOf = (mod) => Boolean(mod?.meta?.pause ?? mod?.tick);

/** A game whose field is taller than wide says so (`meta.tall`): on a Mac its bar stands beside it (shell.css) —
    the same on the story's card and in the 游戏厅. */
export const tallOf = (mod) => Boolean(mod?.meta?.tall);
/** …and how wide its card wants to be on the story's stage (shell.css): the field's `aspect` (width : height) at the
    stage's height, plus what the game sets `beside` its field. Empty for a game that does not play tall. */
export const tallStyle = (mod) => (tallOf(mod) ? `--ar:${Number(mod.meta.aspect) || 9 / 16};--beside:${Number(mod.meta.beside) || 0}px` : '');

/** The shell around a game's body. `body` is the game's own node as HTML (its [data-game] / [data-mount]
    host or a slot) and stays exactly as given. `timed`: the game runs in time, so it can be paused. */
export function frameHtml({ id, title = '', kind = '', how = '', body = '', timed = false, lang = 'zh', tall = false } = {}) {
  const w = words(lang), s = store.get(id);
  const pause = timed ? `<button type="button" class="gshell-btn gshell-pause" data-shell-pause="${plain(id)}" aria-pressed="${s?.paused ? 'true' : 'false'}" aria-label="${plain(s?.paused ? w.resume : w.pause)}">${s?.paused ? '▶' : 'Ⅱ'}</button>` : '';
  return `<section class="gshell${tall ? ' is-tall' : ''}${s?.paused ? ' is-paused' : ''}" data-shell="${plain(id)}">`
    + `<header class="gshell-bar"><div class="gshell-name"><b class="gshell-title">${plain(title)}</b>${kind ? `<em class="gshell-kind">${plain(kind)}</em>` : ''}</div>`
    + `<div class="gshell-tools">${pause}</div>${how ? `<p class="gshell-how">${plain(how)}</p>` : ''}</header>`
    + `<div class="gshell-stage">${body}<div class="gshell-layer">${layerHtml(id, lang)}</div></div>`
    + `<footer class="gshell-foot">${footHtml(id, lang)}</footer></section>`;
}

function layerHtml(id, lang) {
  const s = store.get(id), w = words(lang);
  const bubble = s?.bubble ? `<div class="gshell-bubble" data-who="${plain(s.bubble.who)}">${plain(s.bubble.text)}</div>` : '';
  const pause = s?.paused ? `<div class="gshell-veil"><b>${plain(w.paused)}</b><button type="button" class="gshell-btn is-main" data-shell-pause="${plain(id)}">${plain(w.resume)}</button></div>` : '';
  const lead = s?.lead ? `<div class="gshell-veil gshell-lead"><p>${plain(s.lead.text)}</p>${s.lead.count != null ? `<b class="gshell-count">${s.lead.count || plain(w.start)}</b>` : `<button type="button" class="gshell-btn is-main" data-shell-go="${plain(id)}">${plain(w.start)}</button>`}</div>` : '';
  return lead + pause + bubble;
}

function footHtml(id, lang) {
  const r = store.get(id)?.result, w = words(lang);
  if (!r) return '';
  const stars = r.stars != null ? `<span class="gshell-stars" aria-label="${r.stars}/3">${'★'.repeat(r.stars)}${'☆'.repeat(Math.max(0, 3 - r.stars))}</span>` : '';
  const grade = r.grade ? `<span class="gshell-grade">${plain(r.grade)}</span>` : '';
  const acts = (r.acts ?? []).map((a) => `<button type="button" class="gshell-btn${a.main ? ' is-main' : ''}" data-shell-act="${plain(a.id)}">${plain(w[a.id] ?? a.label ?? a.id)}</button>`).join('');
  return `<span class="gshell-won${r.won ? '' : ' is-lost'}" id="won">${plain(r.won ? w.won : w.lost)}</span>${stars}${grade}${acts}`;
}

/** Lay the store's state into every frame of `id` on the page (the story may have drawn it twice). */
function paint(id, doc = globalThis.document) {
  if (!doc?.querySelectorAll) return;
  for (const f of doc.querySelectorAll(`.gshell[data-shell="${cssId(id)}"]`)) {
    const lang = f.closest('[lang]')?.getAttribute('lang') === 'en' || f.dataset.lang === 'en' ? 'en' : 'zh';
    const s = store.get(id);
    f.classList.toggle('is-paused', Boolean(s?.paused));
    const btn = f.querySelector('.gshell-tools [data-shell-pause]');
    if (btn) { btn.setAttribute('aria-pressed', String(Boolean(s?.paused))); btn.textContent = s?.paused ? '▶' : 'Ⅱ'; btn.setAttribute('aria-label', s?.paused ? words(lang).resume : words(lang).pause); }
    const layer = f.querySelector(':scope > .gshell-stage > .gshell-layer');
    if (layer) layer.innerHTML = layerHtml(id, lang);
    const foot = f.querySelector(':scope > .gshell-foot');
    if (foot) foot.innerHTML = footHtml(id, lang);
  }
}
const cssId = (id) => (globalThis.CSS?.escape ? CSS.escape(id) : String(id).replace(/["\\]/g, '\\$&'));

/* ── The controller ── */

/** A bubble over the stage: who says it, and it fades after `ms` (a new line replaces the last). */
export function say(id, who, text, ms = 3200) {
  const s = entry(id);
  s.bubble = text ? { who, text, at: Date.now() } : null;
  paint(id);
  if (!text) return;
  const at = s.bubble.at;
  setTimeout(() => { if (store.get(id)?.bubble?.at === at) { store.get(id).bubble = null; paint(id); } }, ms);
}

/** The result in the frame's foot: { won, stars?, grade?, acts: [{ id: 'again' | 'next', main? }] }. */
export function showResult(id, result) { entry(id).result = result; paint(id); }

/* How long a lead card stays before it goes on by itself (Hanli 2026-10-21: 「好的」 — one pace for every game,
   the story's own): read as the story's 自动 reads it, sentence by sentence, never under 3 s nor over 8 s;
   开始 goes at once. Reduced motion reads at the same pace — it is reading, not motion. */
export const LEAD_MS = { min: 3000, max: 8000 };
export function leadMs(text, lang = 'zh') {
  const parts = sentencesOf(text);
  const ms = parts.reduce((t, x, i) => t + paceOf(x, { f: SPEEDS.mid, last: i === parts.length - 1, lang }), 0);
  return Math.min(LEAD_MS.max, Math.max(LEAD_MS.min, ms));
}

/** The lead card before a game: its line, then a 3-2-1 for a game in time (`count`), else a 开始 tap — which
    `auto` also gives on its own once the line has been read (`'read'`: by leadMs in `lang`; a number: those ms).
    Resolves when the game may start. */
export function lead(id, text, { count = false, auto = 0, lang = 'zh', reducedMotion = false } = {}) {
  if (auto === 'read') auto = leadMs(text, lang);
  const s = entry(id);
  return new Promise((resolve) => {
    if (!text) { resolve(); return; }
    let over = false;
    const done = () => { if (over) return; over = true; s.lead = null; paint(id); resolve(); };
    if (!count) { s.lead = { text, go: done }; paint(id); if (auto) setTimeout(done, auto); return; }
    let n = 3;
    s.lead = { text, count: n };
    paint(id);
    const step = reducedMotion ? 400 : 800;
    const t = setInterval(() => {
      n -= 1;
      if (n < 0) { clearInterval(t); done(); return; }
      s.lead = { text, count: n };
      paint(id);
    }, step);
  });
}

/** What a game's mount options carry from the shell. */
export function shellFor(id) {
  return {
    paused: () => isPaused(id),
    say: (who, text, ms) => say(id, who, text, ms),
    lead: (text, o) => lead(id, text, o),
    onPause: (fn) => onShell((k, s) => { if (k === id) fn(s.paused); }),
  };
}

/** The page's one listener for every frame's buttons (pause, resume, start, 再来 …). `onAct(id, act)` hears
    the result's buttons. Answers the function that stops listening. */
export function wireShell(doc = globalThis.document, { onAct = () => {} } = {}) {
  const click = (e) => {
    const p = e.target.closest?.('[data-shell-pause]');
    if (p) { e.preventDefault(); setPaused(p.dataset.shellPause, !isPaused(p.dataset.shellPause)); return; }
    const go = e.target.closest?.('[data-shell-go]');
    if (go) { e.preventDefault(); store.get(go.dataset.shellGo)?.lead?.go?.(); return; }
    const a = e.target.closest?.('[data-shell-act]');
    if (a) { e.preventDefault(); onAct(a.closest('.gshell')?.dataset.shell, a.dataset.shellAct); }
  };
  doc.addEventListener('click', click);
  return () => doc.removeEventListener('click', click);
}

/* ── Off the story: one game alone in its shell (游戏厅, the try page) ── */

/** Play `mount` in a shell inside `root`; 再来 deals it again. A won game that names its next level (`r.next`, a
    level id or number) gets 下一关, which `next(r.next)` opens. `prefetch({ signal })`, when given (a dev page's
    `?prefetch=1`), is asked once a deal for the mount's 台词预取 options (`{ lines }`, games/prefetch.js). */
export function playAlone(root, mount, { id, title, kind, how, timed, tall, lang = 'zh', opts = {}, leadLine = '', next = null, prefetch = null } = {}) {
  root.innerHTML = frameHtml({ id, title, kind, how, timed, tall, lang, body: '<div class="gshell-slot" id="slot"></div>' });
  root.querySelector('.gshell').dataset.lang = lang;
  let stop = null, n = 0, last = null;
  const deal = async () => {
    stop?.abort();
    stop = new AbortController();
    forget(id);
    paint(id);
    const slot = root.querySelector('#slot');
    await lead(id, leadLine, { count: timed, reducedMotion: opts.reducedMotion });
    const seed = n++ ? `${opts.seed ?? id}|${n}` : opts.seed; // 再来 deals a fresh one
    const her = prefetch?.({ signal: stop.signal }) ?? null;
    const r = await mount(slot, { ...opts, ...(her ?? {}), seed, lang, signal: stop.signal, shell: shellFor(id) });
    if (r?.left) return;
    const on = Boolean(next && r?.won && r?.next != null);
    last = r;
    showResult(id, { ...r, acts: [{ id: 'again', main: !on }, ...(on ? [{ id: 'next', main: true }] : [])] });
  };
  const off = wireShell(root.ownerDocument, { onAct: (k, act) => { if (k !== id) return; if (act === 'again') deal(); else if (act === 'next') next?.(last?.next); } });
  deal();
  return () => { off(); stop?.abort(); forget(id); };
}
