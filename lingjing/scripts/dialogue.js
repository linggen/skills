// dialogue.js — the reading: the book told on the stage itself.
//
// Hanli, 2026-09-29: 「对话框先做，go」. The book's passage for each beat
// (rules/tell.mjs) used to be handed to Ling to retell in the narrow chat,
// while the big stage showed three lines of caption; models paraphrased the
// book and the two drifted apart. Now the page draws what is owed (`tell`,
// its own verb — each passage with its beats) and plays it on the stage.
// Since 2026-10-14 (the approved prototypes) there is no box: the beat's words
// stand over the whole stage and come up a sentence at a time by themselves
// (lines.js), and the page goes on to the next beat when they are read; a tap
// brings the next sentence now, 「跳过」 shows the rest of this 回 at once, 回看
// opens what was told so far. At the last beat the scene's choices stand on the
// stage. Nothing here reaches Ling.
//
// Pure: the reading is a plain object, kept per save in localStorage so a
// reload finds its place (lingjing.js holds it; tests read these directly).
import { esc } from './esc.js';
import { headOf } from './jieben.mjs';
import { joinSentences, linesHtml, paraHtml, screensOf } from './lines.js';

// 跳过 (Hanli, 2026-10-14: 「2改跳过」): the skip reads 跳过 / Skip — never 继续, which is the way on.
export const DLG_WORDS = {
  zh: { skip: '跳过', log: '回看', close: '回到这里', logTitle: '回看', logNow: '此景', recap: '前情', before: '上一景', on: '点一下，下一句', held: '停', speed: '读法', speeds: ['自动', '全文', '跳过'], locked: '读完或跳过', ling: 'Ling', act: (a) => `（${a}）`, voice: ['无声', '有声'], voiceTitle: '评书配音', onward: '接着往下', whole: '全文', pages: ['上一页', '下一页'] },
  en: { skip: 'Skip', log: 'Look back', close: 'Back to it', logTitle: 'Look back', logNow: 'This scene', recap: 'Before this', before: 'Before this', on: 'Tap for the next line', held: 'Paused', speed: 'How to read', speeds: ['Auto', 'Whole', 'Skip'], locked: 'Read on or skip', ling: 'Ling', act: (a) => `(${a}) `, voice: ['Voice off', 'Voice on'], voiceTitle: 'The pingshu voice (Chinese)', onward: 'Read on', whole: 'The whole passage', pages: ['Back', 'Next'] },
};

/* The reading as it stands: the play and scene it belongs to, the passages
   drawn there in order (each with its beats in both languages — a switch of
   language plays on in the other), the one on show (passage `i`, beat `j`),
   and whether the last was put away. The play is Look's `run` (rules/files.mjs
   newRun), new whenever the game is replaced — a Restart, a Load, an Undo, a
   seed, a world travelled to. A save from before runs has none: a reading
   with none belongs to it, and never to a play that has one (2026-10-14: an
   old play's unplayed beats ran on into the opening after a Restart).
   `base` — the first passage this count runs from (2026-10-14, live: entering
   00-masan showed 「27 / 44」, 00-shiao's beats counted in): the passages
   before it are the last scene's unplayed beats (`before`), shown under their
   own small label, never counted with this scene's. `all` — 显示全文: the beat
   the rest was shown from, all at once. `past` — the scenes told before this
   one, for 回看. */
export const emptyReading = (scene, run = null) => ({ scene: scene ?? null, run: run ?? null, items: [], i: 0, j: 0, base: 0, closed: false });
const samePlay = (r, run) => (r?.run ?? null) === (run ?? null);
/* The reading if it is this play's, else none. */
export const ofPlay = (r, run = null) => (r && samePlay(r, run) ? r : null);
/* The reading that belongs on the stage: this play's, at this scene. */
export const readingFor = (r, scene, run = null) => (ofPlay(r, run)?.scene === (scene ?? null) ? r : null);
const beatsOf = (item, lang) => {
  const b = item?.beats;
  if (Array.isArray(b)) return b;
  return b?.[lang]?.length ? b[lang] : b?.[lang === 'en' ? 'zh' : 'en'] ?? [];
};
const lastJ = (r, i, lang) => Math.max(0, beatsOf(r.items[i], lang).length - 1);
const baseOf = (r) => Math.min(r?.base ?? 0, Math.max(0, (r?.items?.length ?? 1) - 1));

/* 回看 keeps the last few scenes told (in this browser, beside the reading). */
const PAST_KEEP = 6;
const bare = ({ name, hero, act, text, recap }) => ({ ...(name ? { name } : {}), ...(hero ? { hero } : {}), ...(act ? { act } : {}), text, ...(recap ? { recap } : {}) });
function pastOf(r) {
  if (!r?.items?.length) return r?.past ?? [];
  const told = (lang) => toldSoFar(r, lang).map(bare);
  const group = { scene: r.scene, zh: told('zh'), en: told('en') };
  return [...(r.past ?? []), ...(group.zh.length || group.en.length ? [group] : [])].slice(-PAST_KEEP);
}

/* Passages drawn (the rules' `tell`) added to the reading: a new scene — or
   its own passage told again (a new game, a replay) — begins a new one; in
   the same scene they queue after what is showing, and a box put away (or
   standing at its last beat, its choices up) opens on the first of them,
   counted afresh. A reading of another play (`run`) is not carried on: the
   new play begins its own. */
export function withTold(was, tell, scene, run = null, lang = 'zh') {
  const reading = samePlay(was, run) ? was : null;
  const fresh = (tell ?? []).filter((t) => beatsOf(t, 'zh').length || beatsOf(t, 'en').length).map(({ of, id, beats, hui }) => ({ of, id, beats, ...(hui ? { hui } : {}) }));
  if (!fresh.length) return reading;
  const at = scene ?? null;
  const again = reading?.scene === at && fresh.some((t) => t.of === 'scene' && t.id === at);
  if (reading?.items && reading.scene === at && !again) {
    const open = playing(reading) && !atLast(reading, lang);
    if (open) return { ...reading, run: run ?? null, items: [...reading.items, ...fresh] };
    const n = reading.items.length;
    return { ...reading, run: run ?? null, items: [...reading.items, ...fresh], i: n, j: 0, base: n, all: null, closed: false };
  }
  // A new scene of the same play: what was still unplayed of the last one goes
  // first, from the beat AFTER the one on show — that one was seen already.
  const after = playing(reading) && !again ? advance(reading, lang) : null;
  const left = after && playing(after) ? after.items.slice(after.i).map((it) => ({ ...it, before: true })) : [];
  // `lead`: the first carried passage's beats before it were seen — never counted or logged again.
  return { ...emptyReading(at, run), items: [...left, ...fresh], j: left.length ? after.j : 0, base: left.length, ...(left.length && after.j ? { lead: after.j } : {}), past: reading ? pastOf(reading) : [] };
}

/* Is the box playing? — beats left to show, or the last one still up. */
export const playing = (r) => Boolean(r?.items?.length && !r.closed);
export const atLast = (r, lang = 'zh') => r.i >= r.items.length - 1 && r.j >= lastJ(r, r.i, lang);
/* Are the scene's choices up? Only once the last beat is showing. */
export const choicesUp = (r, lang = 'zh') => !playing(r) || atLast(r, lang);

/* Is the box on this scene's own passage (past its caption, in a reading kept
   from before the caption left the box)? Then the scene's games stand on the
   stage over the box, to be played while the passage tells on (Hanli,
   2026-10-05: the 洛书 board waited behind 29 beats). A choice's passage that
   leads in still plays first: the scene's passage comes after it. */
export function sceneUnder(r, sid, lang = 'zh') {
  if (!playing(r) || !sid) return false;
  const at = r.items.findIndex((it) => it.of === 'scene' && it.id === sid);
  if (at < 0 || r.i < at) return false;
  return r.i > at || !current(r, lang).beat.cap;
}

/* 初见 (Hanli, 2026-10-05: 「中间放大显示人物，只在第一次出场的时候」) at his 亮相
   (2026-10-13: 「亮相就是正式出场, 我们描写人物容貌等的地方」): a face comes on large
   at the beat the book marks as his formal entrance — the paragraph carrying his
   `[名]{注=id}`, the one his card stands after in the book (rules/tell.mjs beatsOf
   `notes`) — never at a mention before it, a name in passing, or a recap.
   `noted` — the ids the reading's beats note; `sightings` — each entry's 亮相 beat
   in the reading (its place among them all); `sightNow` — the entries whose 亮相
   is the beat on show. */
const sightHit = (b, e) => !b.recap && (b.notes ?? []).includes(e.id);
export const noted = (r, lang = 'zh') => [...new Set(flat(r, lang).filter((b) => !b.recap).flatMap((b) => b.notes ?? []))];
export function sightings(r, entries, lang = 'zh') {
  const all = flat(r, lang), out = new Map();
  for (const e of entries ?? []) {
    if (!e?.id) continue;
    const k = all.findIndex((b) => sightHit(b, e));
    if (k >= 0) out.set(e.id, k);
  }
  return out;
}
export function sightNow(r, entries, lang = 'zh') {
  if (!playing(r)) return [];
  const at = sightings(r, entries, lang), { at: k } = current(r, lang);
  return (entries ?? []).filter((e) => at.get(e?.id) === k);
}

/* The beat read (lines.js, by itself or a tap): the next; on the last, the reading is put away.
   Moving on leaves what was shown at once (`all`) behind: the next beat is a beat of its own. */
export function advance(r, lang = 'zh') {
  if (!playing(r)) return r;
  if (r.j < lastJ(r, r.i, lang)) return { ...r, j: r.j + 1, all: null };
  if (r.i < r.items.length - 1) return { ...r, i: r.i + 1, j: 0, all: null };
  return { ...r, closed: true };
}
/* 跳过 (2026-10-14; it was 显示全文 in the box, and before that a 「跳过」 that dumped the rest
   into a panel and closing it closed the box): the rest of this 回's passage at once — the
   stage stands on its last beat, shown whole, and the choices come up at its end; what was
   skipped is in 回看. */
// Never past a 回's turn (2026-10-14, 古二 → 今 · 一: 显示全文 on 古二's last passage showed
// j01-track's 55 beats with it, under 古二's words, before the 「完」 and the new 回's seal):
// the rest of THIS 回's passages; the next 回's begin after its turn, from their first beat.
export function showAll(r, lang = 'zh') {
  if (!playing(r) || atLast(r, lang)) return r;
  const i = huiEndOf(r);
  if (i === r.i && r.j >= lastJ(r, i, lang)) return r;
  return { ...r, all: { i: r.i, j: Math.min(r.j, lastJ(r, r.i, lang)) }, i, j: lastJ(r, i, lang) };
}
/* 快 (Hanli, 2026-10-15: 「快的速度, 不要一句一句显示, 直接都显示出来」): the rest of this 回's
   passage at once, as one column — from the beat on show (or where 跳过 showed from) to the 回's
   last beat, where the reading then stands, so its choices, its count and every order rule are
   跳过's. `all.whole` marks the column; a 回's turn still comes between two columns. */
export function wholeOf(r, lang = 'zh') {
  if (!playing(r) || r.all?.whole) return r;
  const i = huiEndOf(r), from = r.all ?? { i: r.i, j: Math.min(r.j, lastJ(r, r.i, lang)) };
  return { ...r, all: { i: from.i, j: from.j, whole: true }, i, j: lastJ(r, i, lang) };
}
/* 慢 or 中 picked over a column (2026-10-15, his: 「由快切回中时, 仍然是全屏」): paced again at
   once, from the beat he was reading (`at`, the paragraph at the top of the column's view; else
   where it opened) — never from its end. What stood above it is in 回看. */
export function pacedAt(r, at = null, lang = 'zh') {
  if (!playing(r) || !r.all?.whole) return r;
  const beats = wholeBeats(r, lang), hit = at && beats.find((b) => b.i === at.i && b.j === at.j);
  const from = hit ?? beats[0] ?? r.all;
  return { ...r, i: from.i, j: from.j, all: null };
}
/* The reading fitted to the way he reads (lines.js speedNow), at every paint before the stage is
   drawn: 全文 — the rest of the passage as one column (wholeOf); 自动 — by sentence again from the
   beat in view (`at`, pacedAt); 跳过 — straight to the passage's end and its choices: showAll, and
   at a 回's last beat with another 回 told after it, on into that one (its 「完」 comes between, as
   for a reader). Every passage stays drawn and told, in 回看 and 读原著 (2026-10-16). */
export function fitMode(r, mode, { lang = 'zh', at = null } = {}) {
  if (!playing(r)) return r;
  if (mode === 'fast') return r.all?.whole ? r : wholeOf(r, lang);
  const p = r.all?.whole ? pacedAt(r, at, lang) : r;
  if (mode !== 'skip' || atLast(p, lang)) return p;
  const s = showAll(p, lang);
  return s !== p ? s : advance(p, lang);
}
/* Does the passage on the stage hold the rest of the page (Hanli, 2026-10-16: 「读剧情, 可以简单点,
   把其他都lock, 玩家读完或跳过才能继续」)? While it is shown and not yet at its end — its last beat,
   and in 全文 its last page (`lastPage`, pager.js). Its own controls and its choices never lock. */
export const storyHolds = (r, { shown = true, lang = 'zh', lastPage = true } = {}) =>
  Boolean(shown && playing(r) && !(atLast(r, lang) && (!r.all?.whole || lastPage)));
/* The column's beats, from where it opened to the beat on show — each with its place among them all (`at`). */
export function wholeBeats(r, lang = 'zh') {
  if (!playing(r) || !r.all?.whole) return [];
  const { at } = current(r, lang), all = flat(r, lang);
  const from = all.findIndex((b) => b.i === r.all.i && b.j === r.all.j);
  return all.slice(Math.max(0, from), at + 1).map((b, k) => ({ ...b, at: Math.max(0, from) + k }));
}
/* The last passage of the 回 on show: the run of passages from `i` on that carry its 回. A
   passage with none belongs to whichever it stands among, and so does the 前情 (`catchup`,
   a recap of earlier 回s that leads into this one). */
const huiOfItem = (it) => (it?.of === 'catchup' ? null : it?.hui ?? null);
/* Each passage's 回 run, by its place: a new run where a passage names a 回 other than its run's. */
function runsOf(r) {
  let run = 0, cur = null;
  return (r?.items ?? []).map((it) => {
    const hui = huiOfItem(it);
    if (cur && hui && hui !== cur) run += 1;
    cur = hui ?? cur;
    return run;
  });
}
export function huiEndOf(r) {
  const runs = runsOf(r);
  return runs.lastIndexOf(runs[r.i]);
}
/* The 回 the box is telling: its run's (a 前情 leading in tells the 回 it leads into). */
export function huiAt(r) {
  if (!playing(r)) return null;
  const runs = runsOf(r);
  return huiOfItem(r.items.find((it, i) => runs[i] === runs[r.i] && huiOfItem(it)));
}

/* Whose passage an item is: the scene it was told at — a choice's and an `after`'s the scene
   they belong to (`sid/…`), a scene's its own; the 前情 is no scene's. */
export const sceneOfItem = (it) => (!it || it.of === 'catchup' ? null : String(it.id ?? '').split('/')[0] || null);
/* Does the box still tell what leads into `here` from `from` — the passages before here's own
   (a 前情, the last scene's unplayed beats, the choice that left it), one of them `from`'s?
   Then `from`'s header holds (Hanli, 2026-10-14: the header holds the old scene until the
   exit passage ends) — whatever passage stands first in the reading. */
export function leadsIn(r, here, from) {
  if (!playing(r) || !here || !from || from === here) return false;
  const own = r.items.findIndex((it) => sceneOfItem(it) === here);
  const upto = own < 0 ? r.items.length : own;
  return r.i < upto && r.items.slice(0, upto).some((it) => sceneOfItem(it) === from);
}

/* Every beat in order, in a language, with where each stands. */
const flat = (r, lang) => (r?.items ?? []).flatMap((it, i) => beatsOf(it, lang).map((b, j) => ({ ...b, of: it.of, i, j, ...(it.before ? { before: true } : {}) })))
  .filter((b) => !(b.before && b.i === 0 && b.j < (r.lead ?? 0)));
/* The beat on show: `at` its place among them all; `k` of `n` its place in
   its own count — this scene's passages, or (`before`) the last scene's
   unplayed beats that lead in — and never across a 回's turn (2026-10-14, 古二 →
   今 · 一 read 「8 / 62」: 古二's last passage counted in): each 回's passages count alone. */
export function current(r, lang = 'zh') {
  const all = flat(r, lang), j = Math.min(r.j, lastJ(r, r.i, lang));
  const at = Math.max(0, all.findIndex((b) => b.i === r.i && b.j === j));
  const before = r.i < baseOf(r), runs = runsOf(r);
  const group = all.filter((b) => (before ? b.i < baseOf(r) : b.i >= baseOf(r)) && runs[b.i] === runs[r.i]);
  const k = Math.max(0, group.findIndex((b) => b.i === r.i && b.j === j));
  return { beat: all[at] ?? {}, at, k, n: group.length, before };
}
/* 读原著 at the box (Hanli, 2026-10-14): the 回 of the passage on show (book.json's id, its
   `hui`) and the words the reader finds its paragraph by (read.js openAt) — a condensed beat's
   `at`, the opening of the book's paragraph it is cut from (rules/tell.mjs, jieben.mjs), else the
   beat's own words, which are the book's. Null with nothing told; a catch-up names its 回 only. */
export function bookPlace(r, lang = 'zh') {
  if (!r?.items?.length) return null;
  const { beat } = current(r, lang), hui = r.items[Math.min(r.i, r.items.length - 1)]?.hui;
  if (!hui) return null;
  const at = beat.recap ? null : beat.at ?? (beat.text ? headOf(beat.text, lang) : null);
  return { hui, ...(at ? { at } : {}) };
}

/* The beats told so far in this scene: up to the one on show (all of them, once put away). */
export const toldSoFar = (r, lang = 'zh') => (!r?.items ? [] : r.closed ? flat(r, lang) : flat(r, lang).slice(0, current(r, lang).at + 1));

/* Kept per save, so a reload finds its place; storage may be off (a private
   window, a preview): then the reading lives only as long as the page. */
const keyOf = (save) => `lingjing.reading.${save || 'main'}`;
export function loadReading(save, store = globalThis.localStorage) {
  try {
    const r = JSON.parse(store?.getItem(keyOf(save)) ?? 'null');
    return r && Array.isArray(r.items) && Number.isInteger(r.i) && Number.isInteger(r.j) ? r : null;
  } catch { return null; }
}
export function keepReading(save, r, store = globalThis.localStorage) {
  try { store?.setItem(keyOf(save), JSON.stringify(r)); } catch { /* no storage: this load only */ }
}

/* One beat, as 回看 shows it. */
function lineHtml(b, w) {
  const act = b.act ? `<span class="dlgact">${esc(w.act(b.act))}</span>` : '';
  const tag = b.recap ? `<span class="dlgrecap">${esc(w.recap)}</span>` : '';
  return `${tag}${act}${esc(b.text ?? '')}`;
}
const rowHtml = (b, w, extra = '') => `<div class="dlglogrow${b.name ? ' spoken' : ''}"${extra}>${b.name ? `<b>${esc(b.name)}</b>` : ''}<span>${lineHtml(b, w)}</span></div>`;

/* 配音's switch (pingshu.js): shown only where there is audio to hear
   (`voice` true or false; null — none — leaves it out). */
const voiceBtn = (voice, w) => (voice == null ? '' : `<button class="q dlgvoice${voice ? ' on' : ''}" data-dlg-voice aria-pressed="${voice ? 'true' : 'false'}" title="${esc(w.voiceTitle)}">${esc(w.voice[voice ? 1 : 0])}</button>`);

/* The beat on show, as the stage's clock knows it (lines.js createLines): a new
   key, the beat starts from its first sentence; 跳过 (`all`) shows it whole. */
export const beatKey = (r, lang = 'zh') => (playing(r) ? `${r.run ?? ''}|${r.scene ?? ''}|${r.i}|${Math.min(r.j, lastJ(r, r.i, lang))}|${lang}${r.all?.whole ? '|whole' : r.all && atLast(r, lang) ? '|all' : ''}` : null);

/* The full stage (Hanli, 2026-10-14, the approved prototypes a–k): the beat's words
   over the picture, coming up a sentence at a time by themselves (lines.js), and
   the quiet controls under them — 回看 · 自动 全文 跳过 (2026-10-16: how to read, kept) · this 回's
   count (「上一景」 on the last scene's unplayed beats) · 配音. At the
   last beat the scene's choices (`acts`, cards.js panelActsHtml) stand on the stage
   once its words are read, its last line faint above them (`.story.done .ways`).
   The whole stage is a tap: the next sentence now. `speed` the viewer's
   (lines.js speedNow); at 快 the rest of the passage stands as one column (wholeOf,
   `wholeHtml`). Nothing here reaches Ling. */
export function storyHtml(r, { lang = 'zh', voice = null, acts = '', herId = null, speed = 'mid', faces = [] } = {}) {
  if (!playing(r)) return '';
  const w = DLG_WORDS[lang] ?? DLG_WORDS.zh, { beat: b } = current(r, lang);
  const last = atLast(r, lang), key = beatKey(r, lang), whole = Boolean(r.all?.whole);
  const choices = last && acts ? acts : '';
  const body = whole ? wholeHtml(r, { lang, herId, w, choices, faces })
    : `<div class="lines" aria-live="polite">${linesHtml(b, { lang, herId, words: w })}</div>${waysHtml(b, choices, lang)}`;
  const cls = `story${choices ? ' choosing' : ''}${whole ? ' whole' : r.all && last ? ' shown' : ''}`;
  return `<div class="${cls}" data-dlg-on data-dlg-next data-story="${esc(key)}" role="button" tabindex="0" aria-label="${esc(w.on)}">
    ${body}
    <div class="held" aria-hidden="true">${esc(w.held)}</div>
    <div class="ctrl"><button class="q" data-dlg-log>${esc(w.log)}</button>${speedSeg(speed, w)}${countHtml(r, lang, w)}${whole ? pagerHtml(w) : ''}${voiceBtn(voice, w)}<span class="sp"></span></div></div>`;
}
/* 自动 · 全文 · 跳过 (Hanli, 2026-10-16, over 慢 · 中 · 快): one small control, kept for every passage (lines.js). */
const speedSeg = (speed, w) => `<span class="seg" role="group" aria-label="${esc(w.speed)}">${['mid', 'fast', 'skip'].map((v, x) => `<button data-dlg-speed="${v}"${v === speed ? ' class="on" aria-pressed="true"' : ' aria-pressed="false"'}>${esc(w.speeds[x])}</button>`).join('')}</span>`;
/* This 回's count: the beat on show — for a column, the beats it holds (「4–21 / 21」). */
function countHtml(r, lang, w) {
  const { k, n, before, at } = current(r, lang);
  const first = wholeBeats(r, lang)[0], from = first ? Math.max(0, k - (at - first.at)) : k;
  const span = from < k ? `${from + 1}–${k + 1}` : `${k + 1}`;
  return before ? `<span class="count before">${esc(w.before)} · ${span} / ${n}</span>` : `<span class="count">${span} / ${n}</span>`;
}
/* 快's pages (pager.js fills the count and hides what is not on the page): beside this 回's count. */
const pagerHtml = (w) => `<span class="pager" hidden><button class="q" data-pg="-1"><span aria-hidden="true">‹</span> <span class="pgw">${esc(w.pages[0])}</span></button><span class="pgn"></span><button class="q" data-pg="1"><span class="pgw">${esc(w.pages[1])}</span> <span aria-hidden="true">›</span></button></span>`;
/* Its last line, faint above the way on (b-choices): the beat's final screen. */
function waysHtml(b, choices, lang) {
  if (!choices) return '';
  const last = screensOf(b.text, lang).at(-1), tail = last ? joinSentences(last, b.text) : '';
  return `<div class="ways"><div class="last">${esc(tail)}</div><div class="wayacts">${choices}</div></div>`;
}
/* 快's column: every beat left of the passage, a paragraph each, in the band on the stage's lower
   half, page by page (pager.js); a face's 亮相 (sightings — the beat the book marks his entrance)
   named on its paragraph (`data-faces`), so the page that holds it brings him on large in the
   upper half; at the end the choices, or 「接着往下」 when the reading goes on past this column. */
function wholeHtml(r, { lang, herId, w, choices, faces }) {
  const seen = sightings(r, faces, lang), beats = wholeBeats(r, lang);
  const paras = beats.map((b) => paraHtml(b, { herId, words: w, place: `${b.i}.${b.j}`, faces: (faces ?? []).filter((e) => seen.get(e.id) === b.at).map((e) => e.id) })).join('');
  const end = choices ? `<div class="wayacts">${choices}</div>` : `<div class="onward"><button class="q" data-dlg-onward>${esc(w.onward)} <span aria-hidden="true">›</span></button></div>`;
  return `<div class="wholecol" aria-label="${esc(w.whole)}"><div class="wholetext">${paras}</div>${end}</div>`;
}

/* 回看: what was told so far — the scenes before (`past`), then this one up
   to the beat on show — a panel of its own with a plain close. */
export function logHtml(r, { lang = 'zh' } = {}) {
  const w = DLG_WORDS[lang] ?? DLG_WORDS.zh;
  const other = lang === 'en' ? 'zh' : 'en';
  const past = (r?.past ?? []).map((g) => (g[lang]?.length ? g[lang] : g[other] ?? [])).filter((g) => g.length)
    .map((g) => `<div class="dlglogscene">${g.map((b) => rowHtml(b, w)).join('')}</div>`).join('');
  const now = toldSoFar(r, lang).map((b) => rowHtml(b, w)).join('');
  return `<div class="dlglog" role="dialog" aria-label="${esc(w.logTitle)}"><div class="dlgloghead"><span>${esc(w.logTitle)}</span><button class="q dlgclose" data-dlg-logclose>${esc(w.close)}</button></div><div class="dlglogbody">${past}${now ? `<div class="dlglogscene now"><div class="dlglogmark">${esc(w.logNow)}</div>${now}</div>` : ''}</div></div>`;
}

/* The small 回看 link under a scene card once the box is put away. */
export const logLinkHtml = (r, lang = 'zh') => (r?.items?.length && !playing(r) ? `<button class="quietnext dlgloglink" data-dlg-log>${esc((DLG_WORDS[lang] ?? DLG_WORDS.zh).log)}</button>` : '');
