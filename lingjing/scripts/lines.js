// lines.js — the story on the full stage: a beat's words come up by themselves,
// a sentence at a time (Hanli, 2026-10-14: the approved prototypes, proto/a–k:
// 「可以，按你的意见」). The dialogue box is gone; the stage is the page.
//
// A beat (rules/tell.mjs beatsOf — one paragraph of the book, or of its 节本) is
// cut into sentences, and the sentences into screens short enough to read over a
// picture. Each sentence fades in after the last at a reading pace — about 165 ms
// a character, never under 2.6 s — and a screen holds a moment at its end. Then
// the page goes on by itself (lingjing.js storyDone → dialogue.js advance). A tap
// brings the next sentence now, holding pauses, 慢 · 中 · 快 is the viewer's own
// (kept in this browser), 回看 scrolls back.
//
// Pure where it can be: the cutting, the pace and the markup are plain functions
// (tests/lines.test.mjs); `createLines` is the small clock that walks one beat's
// sentences, keyed by the beat (`key`) — never by the DOM node, so a repaint of
// the same beat carries on where it was and a new beat starts from its first word.
import { esc } from './esc.js';

/* A text into sentences; a closing quote stays with its sentence (proto.js P.split). */
export function sentencesOf(text) {
  const t = String(text ?? '').trim();
  if (!t) return [];
  // An ellipsis is a breath inside a sentence (「……我当年，也这么说。」), not its end.
  const parts = /[\u3400-\u9fff]/.test(t)
    ? t.match(/[^。！？!?]*[。！？!?]+[」』）”’)]*|[^。！？!?]+$/g) ?? [t]
    : t.split(/(?<=[.!?…]["”’)]?)\s+(?=[A-Z“"'(])/);
  return parts.map((s) => s.trim()).filter(Boolean);
}

/* How much one screen holds: a few lines over the picture, never a wall. */
export const SCREEN_CHARS = { zh: 120, en: 360 };
/* Sentences into screens of at most `max` characters (a sentence longer than that stands alone). */
export function screensOf(text, lang = 'zh') {
  const max = SCREEN_CHARS[lang] ?? SCREEN_CHARS.zh, out = [];
  for (const s of sentencesOf(text)) {
    const cur = out.at(-1);
    if (cur && cur.join('').length + s.length <= max) cur.push(s);
    else out.push([s]);
  }
  return out;
}

/* The pace (Hanli's approved numbers): a sentence holds ~165 ms a character, at
   least 2.6 s, at most 11 s; the screen's last sentence holds 1.8 s more. `f` the
   viewer's speed. English reads by the word, so a character there counts a third. */
export const SPEEDS = { slow: 1.45, mid: 1, fast: 0.6 };
export const END_PAUSE_MS = 1800;
export function paceOf(sentence, { f = 1, last = false, lang = 'zh' } = {}) {
  const n = String(sentence ?? '').length * (lang === 'en' ? 1 / 3 : 1);
  return Math.round((Math.min(11000, Math.max(2600, 900 + n * 165)) + (last ? END_PAUSE_MS : 0)) * f);
}

/* 慢 · 中 · 快, this viewer's own, kept in this browser (it may refuse). */
const SPEED_KEY = 'lingjing.pace';
export function speedNow(store = globalThis.localStorage) {
  try { const v = store?.getItem(SPEED_KEY); return Object.hasOwn(SPEEDS, v) ? v : 'mid'; } catch { return 'mid'; }
}
export function keepSpeed(v, store = globalThis.localStorage) {
  if (!Object.hasOwn(SPEEDS, v)) return;
  try { store?.setItem(SPEED_KEY, v); } catch { /* this load only */ }
}

/* Who speaks the beat, as the stage colours it: 银月 silver-blue (her words in the
   book, beat `who` her id), Ling bronze (the 前情 — the teller's own recap), else
   the book. */
export const voiceOf = (b, herId = null) => (b?.recap ? 'ling' : herId && b?.who === herId ? 'yy' : b?.name ? 'spoken' : 'told');

/* One beat's screens as the stage shows them: every sentence a span the clock
   lights (`.s.on`); the first screen up, the rest waiting (`hidden`). A spoken
   beat leads with its speaker; 银月's and Ling's carry their own colour. */
export function linesHtml(b, { lang = 'zh', herId = null, words = {} } = {}) {
  const who = voiceOf(b, herId);
  const screens = screensOf(b?.text, lang);
  if (!screens.length) return '';
  // The speaker leads a spoken line (the hero too, by his name — never a face); a 前情 is Ling's, marked so.
  const label = who === 'ling' ? `<b class="who">${esc(words.ling ?? 'Ling')}</b><span class="tag">${esc(words.recap ?? '前情')}</span>` : b?.name ? `<b class="who">${esc(b.name)}</b>` : '';
  const act = b?.act ? `<span class="act">${esc(words.act ? words.act(b.act) : `（${b.act}）`)}</span>` : '';
  return screens.map((ss, k) => `<div class="screen" data-screen="${k}"${k ? ' hidden' : ''}><p class="line ${who}">${k ? '' : label + act}${ss.map((s) => `<span class="s">${esc(s)}</span>`).join('')}</p></div>`).join('');
}

/* The clock for one beat on the stage: which screen, how many of its sentences
   are lit, paused or not. `sync(host, key, opts)` after every paint — the same key
   on a new node puts the lit ones back at once; a new key starts again. `onDone(key)`
   when the beat's last screen has been read (and again on a tap once it has). */
export function createLines({ onDone = () => {}, onScreen = () => {}, timer = globalThis, f = () => SPEEDS[speedNow()] } = {}) {
  let key = null, host = null, si = 0, ki = 0, t = null, paused = false, done = false, opts = {};
  const screens = () => [...(host?.querySelectorAll?.('.screen') ?? [])];
  const sents = (k = si) => [...(screens()[k]?.querySelectorAll('.s') ?? [])];
  function paint() {
    if (!host) return;
    screens().forEach((s, k) => { s.hidden = k !== si; s.classList.remove('out'); });
    sents().forEach((s, k) => s.classList.toggle('on', k < ki));
    host.classList.toggle('done', done);
    host.classList.toggle('held', paused && !done);
  }
  function clear() { if (t != null) timer.clearTimeout(t); t = null; }
  function finish() {
    clear();
    const all = screens();
    si = Math.max(0, all.length - 1); ki = sents(si).length; done = true;
    paint();
    onDone(key);
  }
  function step() {
    clear();
    if (!host || done) return;
    const ss = sents();
    if (ki < ss.length) {
      ki += 1;
      paint();
      if (paused) return;
      const last = ki === ss.length;
      t = timer.setTimeout(step, paceOf(ss[ki - 1].textContent, { f: f(), last, lang: opts.lang }));
      return;
    }
    if (si + 1 < screens().length) {
      screens()[si]?.classList.add('out');
      t = timer.setTimeout(() => { si += 1; ki = 0; paint(); onScreen(key, si); step(); }, 420);
      return;
    }
    finish();
  }
  return {
    get key() { return key; },
    get done() { return done; },
    get paused() { return paused; },
    /* The beat on show, painted into `host`. `instant`: shown whole and read (跳过, reduced motion off a reload). */
    sync(el, k, o = {}) {
      if (!el) { clear(); key = null; host = null; return; }
      opts = o;
      if (k === key && el === host) return;
      if (k === key) { host = el; paint(); return; }
      clear();
      key = k; host = el; si = 0; ki = 0; paused = false; done = false;
      if (o.instant) { finish(); return; }
      paint();
      t = timer.setTimeout(step, o.lead ?? 500);
    },
    /* A tap: the next sentence now; read through, the beat's way on. */
    tap() {
      if (!host) return;
      if (done) { onDone(key, true); return; }
      if (paused) { this.hold(false); return; }
      step();
    },
    /* Held down: the clock stops; let go, it goes on. */
    hold(on) {
      if (!host || done || paused === on) return;
      paused = on;
      paint();
      clear();
      if (!on) t = timer.setTimeout(step, 600 * f());
    },
    /* 跳过 inside a beat: the rest of it at once. */
    finish() { if (host && !done) finish(); },
    stop() { clear(); key = null; host = null; },
  };
}
