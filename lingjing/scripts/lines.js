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
// (kept in this browser; 快 shows the rest of the passage at once), 回看 scrolls back.
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

/* Sentences back into one run of text: Chinese closes up, English keeps the space between
   sentences that sentencesOf split on (2026-10-15 play-test: 快 read 「valley.He plucked」).
   Every place that lays sentences side by side — the column, a screen, the last line — joins here. */
const CJK = /[\u3400-\u9fff]/;
export const sentenceGap = (text) => (CJK.test(String(text ?? '')) ? '' : ' ');
export const joinSentences = (parts, text = parts.join('')) => parts.join(sentenceGap(text));

/* How much one screen holds: a few lines over the picture, never a wall. */
export const SCREEN_CHARS = { zh: 120, en: 360 };
/* Sentences into screens of at most `max` characters (a sentence longer than that stands alone). */
export function screensOf(text, lang = 'zh') {
  const max = SCREEN_CHARS[lang] ?? SCREEN_CHARS.zh, out = [];
  for (const s of sentencesOf(text)) {
    const cur = out.at(-1);
    if (cur && joinSentences(cur).length + s.length <= max) cur.push(s);
    else out.push([s]);
  }
  return out;
}

/* The pace (Hanli's approved numbers): a sentence holds ~165 ms a character, at
   least 2.6 s, at most 11 s; the screen's last sentence holds 1.8 s more. `f` the
   viewer's speed, scaling the floor and the ceiling with the rest. English reads by
   the word, so a character there counts a third.
   2026-10-15, his: 「中可以用现在快的速度」 · 「快的速度, 不要一句一句显示, 直接都显示出来」 —
   慢 is the old 中 (×1), 中 the old 快 (×0.45: a short sentence 1.2 s), and 快 is no pace
   at all: the rest of the passage at once, one column to read (`WHOLE`, dialogue.js
   wholeOf). Its factor only times a beat caught before the column opens. */
export const SPEEDS = { slow: 1, mid: 0.45, fast: 0.3 };
export const WHOLE = 'fast';
export const END_PAUSE_MS = 1800;
export function paceOf(sentence, { f = 1, last = false, lang = 'zh' } = {}) {
  const n = String(sentence ?? '').length * (lang === 'en' ? 1 / 3 : 1);
  return Math.round((Math.min(11000, Math.max(2600, 900 + n * 165)) + (last ? END_PAUSE_MS : 0)) * f);
}

/* 慢 · 中 · 快, this viewer's own, kept in this browser (it may refuse); 中 for a new viewer. */
const SPEED_KEY = 'lingjing.pace';
export function speedNow(store = globalThis.localStorage) {
  try { const v = store?.getItem(SPEED_KEY); return Object.hasOwn(SPEEDS, v) ? v : 'mid'; } catch { return 'mid'; }
}
export function keepSpeed(v, store = globalThis.localStorage) {
  if (!Object.hasOwn(SPEEDS, v)) return;
  try { store?.setItem(SPEED_KEY, v); } catch { /* this load only */ }
}
/* 快: every passage opens whole. */
export const wholeNow = (store = globalThis.localStorage) => speedNow(store) === WHOLE;

/* Who speaks the beat, as the stage colours it: 银月 silver-blue (her words in the
   book, beat `who` her id), Ling bronze (the 前情 — the teller's own recap), else
   the book. */
export const voiceOf = (b, herId = null) => (b?.recap ? 'ling' : herId && b?.who === herId ? 'yy' : b?.name ? 'spoken' : 'told');

/* Where 银月's words stand inside a beat's text (the beat's `asides`, rules/tell.mjs), as
   [from, to) ranges, found in order — a line she says twice is marked twice. */
export function asideRanges(text, asides = []) {
  const out = [];
  let from = 0;
  for (const a of asides) {
    const at = String(text ?? '').indexOf(a, from);
    if (at < 0) continue;
    out.push([at, at + a.length]);
    from = at + a.length;
  }
  return out;
}

/* One sentence, escaped, her words in it wrapped silver-blue. `start` is where the
   sentence stands in the beat's text. */
export function markAsides(s, start, ranges) {
  let html = '', at = 0;
  for (const [a, b] of ranges) {
    const lo = Math.max(a - start, 0), hi = Math.min(b - start, s.length);
    if (hi <= lo || lo < at) continue;
    html += esc(s.slice(at, lo)) + `<span class="yy">${esc(s.slice(lo, hi))}</span>`;
    at = hi;
  }
  return html + esc(s.slice(at));
}

/* A beat's lead and its sentences marked (her words silver-blue, where they stand). */
function beatParts(b, { herId = null, words = {} } = {}) {
  const who = voiceOf(b, herId);
  // The speaker leads a spoken line (the hero too, by his name — never a face); a 前情 is Ling's, marked so.
  const label = who === 'ling' ? `<b class="who">${esc(words.ling ?? 'Ling')}</b><span class="tag">${esc(words.recap ?? '前情')}</span>` : b?.name ? `<b class="who">${esc(b.name)}</b>` : '';
  const act = b?.act ? `<span class="act">${esc(words.act ? words.act(b.act) : `（${b.act}）`)}</span>` : '';
  // Her words inside a told beat (⟪…⟫ in the book) in her colour, where they stand.
  const ranges = who === 'yy' ? [] : asideRanges(b?.text, b?.asides);
  let cursor = 0;
  const sentence = (s) => {
    const start = String(b.text).indexOf(s, cursor);
    if (start >= 0) cursor = start + s.length;
    return start >= 0 && ranges.length ? markAsides(s, start, ranges) : esc(s);
  };
  return { who, lead: label + act, sentence };
}

/* One beat's screens as the stage shows them: every sentence a span the clock
   lights (`.s.on`); the first screen up, the rest waiting (`hidden`). A spoken
   beat leads with its speaker; 银月's and Ling's carry their own colour. */
export function linesHtml(b, { lang = 'zh', herId = null, words = {} } = {}) {
  const screens = screensOf(b?.text, lang);
  if (!screens.length) return '';
  const { who, lead, sentence } = beatParts(b, { herId, words });
  return screens.map((ss, k) => `<div class="screen" data-screen="${k}"${k ? ' hidden' : ''}><p class="line ${who}">${k ? '' : lead}${joinSentences(ss.map((s) => `<span class="s">${sentence(s)}</span>`), b.text)}</p></div>`).join('');
}

/* One beat whole, as 快's column shows it (dialogue.js storyHtml): one paragraph, every
   sentence lit, the speaker and her colour kept. */
export function paraHtml(b, { herId = null, words = {}, place = null, faces = [] } = {}) {
  const ss = sentencesOf(b?.text);
  if (!ss.length) return '';
  const { who, lead, sentence } = beatParts(b, { herId, words });
  // `place` — where the beat stands in the reading (「i.j」), so 慢 · 中 picks up from the one in view.
  // `faces` — whose 亮相 this beat is (快's page brings them on above, lingjing.js).
  return `<p class="line ${who}"${place ? ` data-beat="${esc(place)}"` : ''}${faces.length ? ` data-faces="${esc(faces.join(','))}"` : ''}>${lead}${joinSentences(ss.map((s) => `<span class="s on">${sentence(s)}</span>`), b.text)}</p>`;
}

/* The clock for one beat on the stage: which screen, how many of its sentences
   are lit, paused or not. `sync(host, key, opts)` after every paint — the same key
   on a new node puts the lit ones back at once; a new key starts again. `onDone(key)`
   when the beat's last screen has been read (and again on a tap once it has).
   Every wait is the speed's: a change of 慢 · 中 · 快 rescales the wait already
   running (`respeed`, on the next sync — setSpeed repaints), and the fades follow
   through `--pace` on the host (story.css). */
export function createLines({ onDone = () => {}, onScreen = () => {}, timer = globalThis, f = () => SPEEDS[speedNow()] } = {}) {
  let key = null, host = null, si = 0, ki = 0, t = null, paused = false, done = false, opts = {};
  let pend = null; // the running wait: { fn, due, f } — what a speed change rescales
  const now = () => timer.now?.() ?? globalThis.performance?.now?.() ?? Date.now();
  /* A wait of `ms` at speed 1, run at the speed now. */
  function arm(fn, ms) {
    const sp = f();
    armAt(fn, ms * sp, sp);
  }
  function armAt(fn, ms, sp) {
    const wait = Math.max(0, Math.round(ms));
    pend = { fn, due: now() + wait, f: sp };
    t = timer.setTimeout(() => { t = null; pend = null; fn(); }, wait);
  }
  /* 慢 · 中 · 快 changed: what is left of the running wait, at the new speed — and the fades. */
  function respeed() {
    const sp = f();
    host?.style?.setProperty?.('--pace', String(sp));
    if (!pend || t == null || pend.f === sp) return;
    const { fn, due, f: was } = pend;
    clear();
    armAt(fn, Math.max(0, due - now()) * (sp / was), sp);
  }
  const screens = () => [...(host?.querySelectorAll?.('.screen') ?? [])];
  const sents = (k = si) => [...(screens()[k]?.querySelectorAll('.s') ?? [])];
  function paint() {
    if (!host) return;
    host.style?.setProperty?.('--pace', String(f()));
    screens().forEach((s, k) => { s.hidden = k !== si; s.classList.remove('out'); });
    sents().forEach((s, k) => s.classList.toggle('on', k < ki));
    host.classList.toggle('done', done);
    host.classList.toggle('held', paused && !done);
  }
  function clear() { if (t != null) timer.clearTimeout(t); t = null; pend = null; }
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
      arm(step, paceOf(ss[ki - 1].textContent, { last, lang: opts.lang }));
      return;
    }
    if (si + 1 < screens().length) {
      screens()[si]?.classList.add('out');
      arm(() => { si += 1; ki = 0; paint(); onScreen(key, si); step(); }, 420);
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
      if (k === key && el === host) { respeed(); return; }
      if (k === key) { host = el; paint(); respeed(); return; }
      clear();
      key = k; host = el; si = 0; ki = 0; paused = false; done = false;
      if (o.instant) { finish(); return; }
      paint();
      arm(step, o.lead ?? 500);
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
      if (!on) arm(step, 600);
    },
    /* 跳过 inside a beat: the rest of it at once. */
    finish() { if (host && !done) finish(); },
    /* The speed changed (sync does this too): rescale the running wait now. */
    respeed,
    stop() { clear(); key = null; host = null; },
  };
}
