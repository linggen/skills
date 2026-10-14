// dialogue.js — the stage's dialogue box: the book told on the stage itself.
//
// Hanli, 2026-09-29: 「对话框先做，go」. The book's passage for each beat
// (rules/tell.mjs) used to be handed to Ling to retell in the narrow chat,
// while the big stage showed three lines of caption; models paraphrased the
// book and the two drifted apart. Now the page draws what is owed (`tell`,
// its own verb — each passage with its beats) and plays it here, a paragraph
// at a time, the way a Genshin dialogue runs: a line spoken shows the
// speaker's name and 图鉴 portrait (the hero's, the player's 名字 and never a
// face), narration shows as a caption line. A tap, Space, Enter or 「继续 ▸」
// goes on; 显示全文 shows the rest at once, in the box; 回看 opens what was
// told so far. At the last beat the scene's choices come up inside the box.
// Nothing here reaches Ling.
//
// Pure: the reading is a plain object, kept per save in localStorage so a
// reload finds its place (lingjing.js holds it; tests read these directly).
import { esc } from './esc.js';

export const DLG_WORDS = {
  zh: { all: '显示全文', log: '回看', close: '收起', logTitle: '回看', logNow: '此景', next: '继续', recap: '前情', before: '上一景', on: '点一下，接着', act: (a) => `（${a}）`, voice: ['无声', '有声'], voiceTitle: '评书配音' },
  en: { all: 'Show all', log: 'Look back', close: 'Close', logTitle: 'Look back', logNow: 'This scene', next: 'Next', recap: 'Before this', before: 'Before this', on: 'Tap to go on', act: (a) => `(${a}) `, voice: ['Voice off', 'Voice on'], voiceTitle: 'The pingshu voice (Chinese)' },
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

/* A tap on the box (or 继续): the next beat; on the last, the box is put away. */
export function advance(r, lang = 'zh') {
  if (!playing(r)) return r;
  if (r.j < lastJ(r, r.i, lang)) return { ...r, j: r.j + 1 };
  if (r.i < r.items.length - 1) return { ...r, i: r.i + 1, j: 0 };
  return { ...r, closed: true };
}
/* 显示全文 (2026-10-14, his: 「跳过」 dumped the rest into a panel and closing
   it closed the box): the rest of the passage shows at once, in the box, and
   the choices come up at its end. The box stays. */
// Never past a 回's turn (2026-10-14, 古二 → 今 · 一: 显示全文 on 古二's last passage showed
// j01-track's 55 beats with it, under 古二's words, before the 「完」 and the new 回's seal):
// the rest of THIS 回's passages; the next 回's begin after its turn, from their first beat.
export function showAll(r, lang = 'zh') {
  if (!playing(r) || atLast(r, lang)) return r;
  const i = huiEndOf(r);
  if (i === r.i && r.j >= lastJ(r, i, lang)) return r;
  return { ...r, all: { i: r.i, j: Math.min(r.j, lastJ(r, r.i, lang)) }, i, j: lastJ(r, i, lang) };
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

/* One beat, as the box and 回看 show it. */
function face(b, src) {
  if (b.hero || !b.art) return '';
  return `<img class="dlgface" src="${esc(src(b.art))}" alt="${esc(b.name ?? '')}">`;
}
function lineHtml(b, w) {
  const act = b.act ? `<span class="dlgact">${esc(w.act(b.act))}</span>` : '';
  const tag = b.recap ? `<span class="dlgrecap">${esc(w.recap)}</span>` : '';
  return `${tag}${act}${esc(b.text ?? '')}`;
}
const rowHtml = (b, w, extra = '') => `<div class="dlglogrow${b.name ? ' spoken' : ''}"${extra}>${b.name ? `<b>${esc(b.name)}</b>` : ''}<span>${lineHtml(b, w)}</span></div>`;

/* 配音's switch (pingshu.js): shown only where there is audio to hear
   (`voice` true or false; null — none — leaves it out). */
const voiceBtn = (voice, w) => (voice == null ? '' : `<button class="dlgbtn dlgvoice${voice ? ' on' : ''}" data-dlg-voice aria-pressed="${voice ? 'true' : 'false'}" title="${esc(w.voiceTitle)}">${esc(w.voice[voice ? 1 : 0])}</button>`);

/* The box: the beat on show, its speaker (name, portrait) or a caption line;
   over it the count (this scene's own — 「上一景」 on the last scene's unplayed
   beats) and 配音's switch; under it 回看 and 显示全文, and 「继续 ▸」, big
   enough for a thumb (2026-10-14: a tiny ▾ was the only cue). The whole box
   is a tap too. At the last beat the scene's choices (`acts`, the page's —
   cards.js panelActsHtml) stand inside it, where the eye already is, and
   take 继续's place. 显示全文 shows the rest, scrolling inside the box. */
export function dialogHtml(r, { lang = 'zh', src = (f) => f, voice = null, acts = '' } = {}) {
  if (!playing(r)) return '';
  const w = DLG_WORDS[lang] ?? DLG_WORDS.zh, { beat: b, k, n, before } = current(r, lang);
  const last = atLast(r, lang), shown = Boolean(r.all) && last;
  const choices = last && acts ? acts : '';
  // 显示全文: every beat from the first not yet seen, in order, as rows.
  const rows = shown ? flat(r, lang).filter((x) => x.i > r.all.i || (x.i === r.all.i && x.j >= r.all.j)) : null;
  const spoken = !shown && Boolean(b.name);
  // 名牌: the speaker's name hangs on the box's top-left edge; narration hangs none.
  const who = spoken ? `<div class="dlgname${b.hero ? ' hero' : ''}">${esc(b.name)}</div>` : '';
  const count = before ? `<span class="dlgcount before">${esc(w.before)} · ${k + 1} / ${n}</span>` : `<span class="dlgcount">${k + 1} / ${n}</span>`;
  const text = shown ? `<div class="dlgall">${rows.map((x) => rowHtml(x, w)).join('')}</div>` : `<div class="dlgtext">${lineHtml(b, w)}</div>`;
  const tap = choices ? '' : ' data-dlg-next role="button" tabindex="0"';
  const next = choices ? '' : `<button class="dlgnext" data-dlg-next aria-label="${esc(w.on)}">${esc(w.next)} <span aria-hidden="true">▸</span></button>`;
  const log = `<button class="dlgbtn" data-dlg-log>${esc(w.log)}</button>`;
  // With the choices up there is no foot: 回看 moves up beside the count, so a short stage keeps the choices whole.
  const foot = choices ? '' : `<div class="dlgfoot"><span class="dlgtools">${log}${last ? '' : `<button class="dlgbtn" data-dlg-all>${esc(w.all)}</button>`}</span>${next}</div>`;
  return `<div class="dlg${spoken ? ' spoken' : ' told'}${shown ? ' all' : ''}${choices ? ' choosing' : ''}${!shown && b.art && !b.hero ? ' withface' : ''}" data-dlg-on${tap} aria-label="${esc(w.on)}">
    ${who}<div class="dlghead">${choices ? log : ''}${count}${voiceBtn(voice, w)}</div>
    <div class="dlgmain">${shown ? '' : face(b, src)}<div class="dlgbody">${text}</div></div>
    ${choices ? `<div class="dlgacts panelcard">${choices}</div>` : ''}${foot}</div>`;
}

/* 回看: what was told so far — the scenes before (`past`), then this one up
   to the beat on show — a panel of its own with a plain close. */
export function logHtml(r, { lang = 'zh' } = {}) {
  const w = DLG_WORDS[lang] ?? DLG_WORDS.zh;
  const other = lang === 'en' ? 'zh' : 'en';
  const past = (r?.past ?? []).map((g) => (g[lang]?.length ? g[lang] : g[other] ?? [])).filter((g) => g.length)
    .map((g) => `<div class="dlglogscene">${g.map((b) => rowHtml(b, w)).join('')}</div>`).join('');
  const now = toldSoFar(r, lang).map((b) => rowHtml(b, w)).join('');
  return `<div class="dlglog" role="dialog" aria-label="${esc(w.logTitle)}"><div class="dlgloghead"><span>${esc(w.logTitle)}</span><button class="dlgbtn dlgclose" data-dlg-logclose>✕ ${esc(w.close)}</button></div><div class="dlglogbody">${past}${now ? `<div class="dlglogscene now"><div class="dlglogmark">${esc(w.logNow)}</div>${now}</div>` : ''}</div></div>`;
}

/* The small 回看 link under a scene card once the box is put away. */
export const logLinkHtml = (r, lang = 'zh') => (r?.items?.length && !playing(r) ? `<button class="quietnext dlgloglink" data-dlg-log>${esc((DLG_WORDS[lang] ?? DLG_WORDS.zh).log)}</button>` : '');
