// dialogue.js — the stage's dialogue box: the book told on the stage itself.
//
// Hanli, 2026-09-29: 「对话框先做，go」. The book's passage for each beat
// (rules/tell.mjs) used to be handed to Ling to retell in the narrow chat,
// while the big stage showed three lines of caption; models paraphrased the
// book and the two drifted apart. Now the page draws what is owed (`tell`,
// its own verb — each passage with its beats) and plays it here, a paragraph
// at a time, the way a Genshin dialogue runs: a line spoken shows the
// speaker's name and 图鉴 portrait (the hero's, the player's 名字 and never a
// face), narration shows as a caption line. A tap, Space or Enter goes on;
// 跳过 shows the rest at once; 记录 opens what was told in this scene. At the
// last beat the scene's choices come up. Nothing here reaches Ling.
//
// Pure: the reading is a plain object, kept per save in localStorage so a
// reload finds its place (lingjing.js holds it; tests read these directly).
import { esc } from './esc.js';

export const DLG_WORDS = {
  zh: { skip: '跳过', log: '记录', close: '收起', logTitle: '此景所述', recap: '前情', on: '点一下，接着', act: (a) => `（${a}）`, voice: ['无声', '有声'], voiceTitle: '评书配音' },
  en: { skip: 'Skip', log: 'Log', close: 'Close', logTitle: 'Told in this scene', recap: 'Before this', on: 'Tap to go on', act: (a) => `(${a}) `, voice: ['Voice off', 'Voice on'], voiceTitle: 'The pingshu voice (Chinese)' },
};

/* The reading as it stands: the scene it belongs to, the passages drawn
   there in order (each with its beats in both languages — a switch of
   language plays on in the other), the one on show (passage `i`, beat `j`),
   and whether the last was put away. */
export const emptyReading = (scene) => ({ scene: scene ?? null, items: [], i: 0, j: 0, closed: false });
const beatsOf = (item, lang) => {
  const b = item?.beats;
  if (Array.isArray(b)) return b;
  return b?.[lang]?.length ? b[lang] : b?.[lang === 'en' ? 'zh' : 'en'] ?? [];
};
const lastJ = (r, i, lang) => Math.max(0, beatsOf(r.items[i], lang).length - 1);

/* Passages drawn (the rules' `tell`) added to the reading: a new scene — or
   its own passage told again (a new game, a replay) — begins a new one; in
   the same scene they queue after what is showing, and a box put away opens
   on the first of them. */
export function withTold(reading, tell, scene) {
  const fresh = (tell ?? []).filter((t) => beatsOf(t, 'zh').length || beatsOf(t, 'en').length).map(({ of, id, beats, hui }) => ({ of, id, beats, ...(hui ? { hui } : {}) }));
  if (!fresh.length) return reading;
  const at = scene ?? null;
  const again = reading?.scene === at && fresh.some((t) => t.of === 'scene' && t.id === at);
  if (reading?.items && reading.scene === at && !again) {
    const open = reading.items.length && !reading.closed;
    return { ...reading, items: [...reading.items, ...fresh], ...(open ? {} : { i: reading.items.length, j: 0 }), closed: false };
  }
  // A new scene: what was still unplayed of the last one goes first, where it stood.
  const left = playing(reading) && !again ? reading.items.slice(reading.i) : [];
  return { ...emptyReading(at), items: [...left, ...fresh], j: left.length ? reading.j : 0 };
}

/* Is the box playing? — beats left to show, or the last one still up. */
export const playing = (r) => Boolean(r?.items?.length && !r.closed);
const atLast = (r, lang) => r.i >= r.items.length - 1 && r.j >= lastJ(r, r.i, lang);
/* Are the scene's choices up? Only once the last beat is showing. */
export const choicesUp = (r, lang = 'zh') => !playing(r) || atLast(r, lang);

/* A tap on the box: the next beat; on the last, the box is put away. */
export function advance(r, lang = 'zh') {
  if (!playing(r)) return r;
  if (r.j < lastJ(r, r.i, lang)) return { ...r, j: r.j + 1 };
  if (r.i < r.items.length - 1) return { ...r, i: r.i + 1, j: 0 };
  return { ...r, closed: true };
}
/* 跳过: the rest at once — the box closes and the log opens on them. */
export const skipAll = (r, lang = 'zh') => (!playing(r) ? r : { ...r, closed: true, skipped: { i: r.i, j: Math.min(r.j, lastJ(r, r.i, lang)) } });

/* Every beat in order, in a language, with where each stands. */
const flat = (r, lang) => (r?.items ?? []).flatMap((it, i) => beatsOf(it, lang).map((b, j) => ({ ...b, of: it.of, i, j })));
/* The beat on show, and its place among them all. */
export function current(r, lang = 'zh') {
  const all = flat(r, lang), j = Math.min(r.j, lastJ(r, r.i, lang));
  const k = all.findIndex((b) => b.i === r.i && b.j === j);
  return { beat: all[k] ?? {}, k: Math.max(0, k), n: all.length };
}
/* The beats told so far in this scene (the log): up to the one on show. */
export const toldSoFar = (r, lang = 'zh') => (!r ? [] : r.closed ? flat(r, lang) : flat(r, lang).slice(0, current(r, lang).k + 1));

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

/* One beat, as the box and the log show it. */
function face(b, src) {
  if (b.hero || !b.art) return '';
  return `<img class="dlgface" src="${esc(src(b.art))}" alt="${esc(b.name ?? '')}">`;
}
function lineHtml(b, w) {
  const act = b.act ? `<span class="dlgact">${esc(w.act(b.act))}</span>` : '';
  const tag = b.recap ? `<span class="dlgrecap">${esc(w.recap)}</span>` : '';
  return `${tag}${act}${esc(b.text ?? '')}`;
}

/* 配音's switch (pingshu.js): shown only where there is audio to hear
   (`voice` true or false; null — none — leaves it out). */
const voiceBtn = (voice, w) => (voice == null ? '' : `<button class="dlgbtn dlgvoice${voice ? ' on' : ''}" data-dlg-voice aria-pressed="${voice ? 'true' : 'false'}" title="${esc(w.voiceTitle)}">${esc(w.voice[voice ? 1 : 0])}</button>`);

/* The box: the beat on show, its speaker (name, portrait) or a caption line,
   跳过 and 记录 at its corner (and 配音's switch), and a small mark that a tap goes on. */
export function dialogHtml(r, { lang = 'zh', src = (f) => f, voice = null } = {}) {
  if (!playing(r)) return '';
  const w = DLG_WORDS[lang] ?? DLG_WORDS.zh, { beat: b, k, n } = current(r, lang);
  const spoken = Boolean(b.name);
  const who = spoken ? `<div class="dlgname${b.hero ? ' hero' : ''}">${esc(b.name)}</div>` : '';
  const last = atLast(r, lang);
  return `<div class="dlg${spoken ? ' spoken' : ' told'}${b.art && !b.hero ? ' withface' : ''}" data-dlg-next role="button" tabindex="0" aria-label="${esc(w.on)}">
    ${face(b, src)}<div class="dlgbody">${who}<div class="dlgtext">${lineHtml(b, w)}</div></div>
    <div class="dlgctl"><span class="dlgcount">${k + 1} / ${n}</span>${voiceBtn(voice, w)}<button class="dlgbtn" data-dlg-log>${esc(w.log)}</button>${last ? '' : `<button class="dlgbtn" data-dlg-skip>${esc(w.skip)}</button>`}</div>
    <div class="dlgon${last ? ' last' : ''}" aria-hidden="true">▾</div></div>`;
}

/* 记录: what was told in this scene, in order; opened by 跳过 on the first
   beat it skipped. */
export function logHtml(r, { lang = 'zh' } = {}) {
  const w = DLG_WORDS[lang] ?? DLG_WORDS.zh, from = r?.skipped;
  const rows = toldSoFar(r, lang).map((b) => `<div class="dlglogrow${b.name ? ' spoken' : ''}"${from && b.i === from.i && b.j === from.j ? ' data-dlg-from' : ''}>${b.name ? `<b>${esc(b.name)}</b>` : ''}<span>${lineHtml(b, w)}</span></div>`).join('');
  return `<div class="dlglog" role="dialog" aria-label="${esc(w.logTitle)}"><div class="dlgloghead"><span>${esc(w.logTitle)}</span><button class="dlgbtn" data-dlg-logclose>${esc(w.close)}</button></div><div class="dlglogbody">${rows}</div></div>`;
}

/* The small 记录 link under a scene card once the box is put away. */
export const logLinkHtml = (r, lang = 'zh') => (r?.items?.length && !playing(r) ? `<button class="quietnext dlgloglink" data-dlg-log>${esc((DLG_WORDS[lang] ?? DLG_WORDS.zh).log)}</button>` : '');
