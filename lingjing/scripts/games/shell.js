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
// A game hears the shell through its mount options: `shell: { paused(), onPause(fn), say(who, text), lead(text, o), sound(event, o) }`.
// Sound (Hanli 10-22: 「开吧. 统一做进外壳」): the shell owns it (games/kit/sound.js). A game only names what happened
// (`sound('hit')`); data says what it sounds like. The shell sounds its own moments — a button, the 3-2-1, the result —
// plays its kit's bed while the board is up (quiet under the pause veil, gone at the result), and its pause veil holds
// 音效 · 音乐, one setting for every game.
// mountPure (games/mount.js) stops a pure board's clock and hands while paused; a kit that runs its own loop
// (Phaser) reads `paused()` or listens with `onPause`. Nothing here knows a game.

import { SPEEDS, paceOf, sentencesOf } from '../lines.js';
import { sound, unlockOn } from './kit/sound.js';

const W = {
  zh: { pause: '暂停', resume: '继续', paused: '暂停中', won: '成', lost: '未成', again: '再来', next: '下一关', start: '开始', sfx: '音效', music: '音乐', mute: '静音', unmute: '开声' },
  en: { pause: 'Pause', resume: 'Resume', paused: 'Paused', won: 'Done', lost: 'Not yet', again: 'Again', next: 'Next', start: 'Start', sfx: 'Sound', music: 'Music', mute: 'Mute', unmute: 'Unmute' },
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
export function setPaused(id, on) { const s = entry(id); if (s.paused === Boolean(on)) return; s.paused = Boolean(on); sound.duck(id, s.paused); changed(id); paint(id); }
/** Listen for a board's shell changing (pause, result, bubble); answers the function that stops it. */
export function onShell(fn) { listeners.add(fn); return () => listeners.delete(fn); }
/** A board left or dealt again: its shell forgets it (a fresh deal is never born paused). */
export function forget(id) { store.delete(id); sound.stop(id); }
/** The game a board plays (shellFor's `game`): its sounds and its kit's bed are looked up by it. */
const gameOf = (id) => store.get(id)?.game;

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
    + `<div class="gshell-tools">${muteHtml(lang)}${pause}</div>${how ? `<p class="gshell-how">${plain(how)}</p>` : ''}</header>`
    + `<div class="gshell-stage">${body}<div class="gshell-layer">${layerHtml(id, lang)}</div></div>`
    + `<footer class="gshell-foot">${footHtml(id, lang)}</footer></section>`;
}

function layerHtml(id, lang) {
  const s = store.get(id), w = words(lang);
  const bubble = s?.bubble ? `<div class="gshell-bubble" data-who="${plain(s.bubble.who)}">${plain(s.bubble.text)}</div>` : '';
  const pause = s?.paused ? `<div class="gshell-veil"><b>${plain(w.paused)}</b><button type="button" class="gshell-btn is-main" data-shell-pause="${plain(id)}">${plain(w.resume)}</button>${soundHtml(lang)}</div>` : '';
  const lead = s?.lead ? `<div class="gshell-veil gshell-lead">${leadParas(s.lead.text)}${s.lead.count != null ? `<b class="gshell-count">${s.lead.count || plain(w.start)}</b>` : `<button type="button" class="gshell-btn is-main" data-shell-go="${plain(id)}">${plain(w.start)}</button>`}</div>` : '';
  return lead + pause + bubble;
}

/** The bar's one mute (Hanli 10-22: 「加了声效和音乐, 添加一个静音按钮吧」): every game, Mac and phone, both parts at once;
    the same shared setting as the pause veil's, and unmuting brings back what was set there. */
const muteHtml = (lang) => {
  const w = words(lang), on = sound.settings().muted;
  return `<button type="button" class="gshell-btn gshell-mute" data-shell-mute aria-pressed="${on}" aria-label="${plain(on ? w.unmute : w.mute)}" title="${plain(on ? w.unmute : w.mute)}">${on ? '🔇' : '🔊'}</button>`;
};
/** Every frame's mute button, after the setting changed (another game's frame on the page hears it too). */
function paintMute(doc = globalThis.document) {
  const on = sound.settings().muted;
  for (const b of doc?.querySelectorAll?.('[data-shell-mute]') ?? []) {
    const w = words(b.closest('.gshell')?.dataset.lang === 'en' || b.closest('[lang]')?.getAttribute('lang') === 'en' ? 'en' : 'zh');
    b.setAttribute('aria-pressed', String(on)); b.textContent = on ? '🔇' : '🔊';
    b.setAttribute('aria-label', on ? w.unmute : w.mute); b.title = on ? w.unmute : w.mute;
  }
}

/** 音效 · 音乐 under the pause: on/off and a volume each, one setting for every game (games/kit/sound.js). */
export function soundHtml(lang) {
  const w = words(lang), st = sound.settings();
  // A part shows as it sounds: under the bar's mute both are off, and turning one on lifts the mute (sound.set).
  const row = (k) => `<div class="gshell-snd"><label><input type="checkbox" data-shell-snd="${k}"${st[k].on && !st.muted ? ' checked' : ''}><span>${plain(w[k])}</span></label>`
    + `<input type="range" min="0" max="100" step="5" value="${Math.round(st[k].vol * 100)}" data-shell-vol="${k}" aria-label="${plain(w[k])}"${st[k].on && !st.muted ? '' : ' disabled'}></div>`;
  return `<div class="gshell-sound">${row('sfx')}${row('music')}</div>`;
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
export function showResult(id, result) { settle(id, result); entry(id).result = result; paint(id); }

/** A board's play is over (its result off the story, or the story's settle): it sounds (won and its stars, or not
    yet) and its bed stops. Once a deal; a board that was left (`left`) only goes quiet. */
export function settle(id, r) {
  const s = entry(id);
  sound.stop(id);
  if (!r || r.left || s.settled) return;
  s.settled = true;
  const game = gameOf(id);
  // Its own names (`result.*`), so a kit that silences its scene's own win / lose (sounds.json) never silences these.
  sound.play(game, r.won ? 'result.win' : 'result.lose');
  for (let i = 0; r.won && i < (Number(r.stars) || 0); i += 1) setTimeout(() => sound.play(game, 'result.star'), 520 + i * 180);
}

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
/* A lead card's words: the story's first, then any hint after a blank line (结印's camera line), smaller. */
const leadParas = (text) => String(text).split(/\n\n+/).map((p, i) => `<p${i ? ' class="gshell-hint"' : ''}>${plain(p)}</p>`).join('');

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
    sound.play(gameOf(id), 'tick');
    paint(id);
    const step = reducedMotion ? 400 : 800;
    const t = setInterval(() => {
      n -= 1;
      if (n < 0) { clearInterval(t); done(); return; }
      s.lead = { text, count: n };
      sound.play(gameOf(id), n ? 'tick' : 'go');
      paint(id);
    }, step);
  });
}

/** What a game's mount options carry from the shell. `game` (its registry id) names its sounds and its kit's bed,
    which starts now and loops until the board settles or is forgotten. */
export function shellFor(id, game) {
  if (game) { entry(id).game = game; sound.music(id, game); }
  return {
    sound: (event, o) => sound.play(gameOf(id), event, o),
    paused: () => isPaused(id),
    say: (who, text, ms) => say(id, who, text, ms),
    lead: (text, o) => lead(id, text, o),
    onPause: (fn) => onShell((k, s) => { if (k === id) fn(s.paused); }),
  };
}

/** The page's one listener for every frame's buttons (pause, resume, start, 再来 …). `onAct(id, act)` hears
    the result's buttons. Answers the function that stops listening. */
export function wireShell(doc = globalThis.document, { onAct = () => {} } = {}) {
  unlockOn(doc); // the page's first touch wakes the one AudioContext (iOS)
  const click = (e) => {
    const m = e.target.closest?.('[data-shell-mute]');
    if (m) {
      e.preventDefault();
      const id = m.closest('.gshell')?.dataset.shell, on = !sound.settings().muted;
      if (!on) { sound.mute(false); sound.play(gameOf(id), 'toggle'); } else sound.mute(true);
      paintMute(doc);
      for (const f of doc.querySelectorAll('.gshell.is-paused')) paint(f.dataset.shell, doc); // the veil's rows follow
      return;
    }
    const p = e.target.closest?.('[data-shell-pause]');
    if (p) { e.preventDefault(); const id = p.dataset.shellPause, on = !isPaused(id); sound.play(gameOf(id), on ? 'pause' : 'resume'); setPaused(id, on); return; }
    const go = e.target.closest?.('[data-shell-go]');
    if (go) { e.preventDefault(); sound.play(gameOf(go.dataset.shellGo), 'button'); store.get(go.dataset.shellGo)?.lead?.go?.(); return; }
    const a = e.target.closest?.('[data-shell-act]');
    if (a) { e.preventDefault(); const id = a.closest('.gshell')?.dataset.shell; sound.play(gameOf(id), 'button'); onAct(id, a.dataset.shellAct); }
  };
  // 音效 · 音乐 (the pause veil): a toggle or a volume is the one setting for every game, kept at once.
  const set = (e) => {
    const t = e.target, on = t?.dataset?.shellSnd, vol = t?.dataset?.shellVol;
    if (on && e.type === 'change') {
      // Under the mute both rows show off: ticking one lifts the mute for that one only, as the rows showed it.
      if (t.checked && sound.settings().muted) sound.set(on === 'sfx' ? 'music' : 'sfx', { on: false });
      sound.set(on, { on: t.checked });
      paintMute(doc);
      for (const f of doc.querySelectorAll('.gshell.is-paused')) paint(f.dataset.shell, doc); // both rows, as they now sound
      sound.play(gameOf(t.closest('.gshell')?.dataset.shell), 'toggle');
    } else if (vol && e.type === 'input') sound.set(vol, { vol: Number(t.value) / 100 });
  };
  doc.addEventListener('click', click);
  doc.addEventListener('change', set);
  doc.addEventListener('input', set);
  return () => { doc.removeEventListener('click', click); doc.removeEventListener('change', set); doc.removeEventListener('input', set); };
}

/* ── Off the story: one game alone in its shell (游戏厅, the try page) ── */

/** Play `mount` in a shell inside `root`; 再来 deals it again. A won game that names its next level (`r.next`, a
    level id or number) gets 下一关, which `next(r.next)` opens. `prefetch({ signal })`, when given (a dev page's
    `?prefetch=1`), is asked once a deal for the mount's 台词预取 options (`{ lines }`, games/prefetch.js). */
export function playAlone(root, mount, { id, game, title, kind, how, timed, tall, lang = 'zh', opts = {}, leadLine = '', next = null, prefetch = null } = {}) {
  root.innerHTML = frameHtml({ id, title, kind, how, timed, tall, lang, body: '<div class="gshell-slot" id="slot"></div>' });
  root.querySelector('.gshell').dataset.lang = lang;
  let stop = null, n = 0, last = null;
  const deal = async () => {
    stop?.abort();
    stop = new AbortController();
    forget(id);
    if (game) entry(id).game = game;
    paint(id);
    const slot = root.querySelector('#slot');
    await lead(id, leadLine, { count: timed, reducedMotion: opts.reducedMotion });
    const seed = n++ ? `${opts.seed ?? id}|${n}` : opts.seed; // 再来 deals a fresh one
    const her = prefetch?.({ signal: stop.signal }) ?? null;
    const r = await mount(slot, { ...opts, ...(her ?? {}), seed, lang, signal: stop.signal, shell: shellFor(id, game) });
    if (r?.left) { settle(id, r); return; }
    const on = Boolean(next && r?.won && r?.next != null);
    last = r;
    showResult(id, { ...r, acts: [{ id: 'again', main: !on }, ...(on ? [{ id: 'next', main: true }] : [])] });
  };
  const off = wireShell(root.ownerDocument, { onAct: (k, act) => { if (k !== id) return; if (act === 'again') deal(); else if (act === 'next') next?.(last?.next); } });
  deal();
  return () => { off(); stop?.abort(); forget(id); };
}
