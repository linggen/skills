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
  zh: { skip: '跳过', log: '记录', close: '收起', logTitle: '此景所述', recap: '前情', on: '点一下，接着', act: (a) => `（${a}）` },
  en: { skip: 'Skip', log: 'Log', close: 'Close', logTitle: 'Told in this scene', recap: 'Before this', on: 'Tap to go on', act: (a) => `(${a}) ` },
};

/* The reading as it stands: the scene it belongs to, every beat drawn there
   in order, the one on show (`at`), and whether the last was put away. */
export const emptyReading = (scene) => ({ scene: scene ?? null, beats: [], at: 0, closed: false });

/* Passages drawn (the rules' `tell`, each with its `beats`) added to the
   reading: a new scene begins a new one; in the same scene they queue after
   what is showing, and the box opens on the first of them. */
export function withTold(reading, tell, scene) {
  const fresh = (tell ?? []).flatMap((t) => (t.beats ?? []).map((b) => ({ ...b, of: t.of })));
  if (!fresh.length) return reading;
  const r = reading && reading.scene === (scene ?? null) ? reading : emptyReading(scene);
  const start = r.beats.length && !r.closed && r.at < r.beats.length ? r.at : r.beats.length;
  return { ...r, beats: [...r.beats, ...fresh], at: start, closed: false };
}

/* Is the box playing? — beats left to show, or the last one still up. */
export const playing = (r) => Boolean(r && r.beats.length && !r.closed);
/* Are the scene's choices up? Only once the last beat is showing. */
export const choicesUp = (r) => !playing(r) || r.at >= r.beats.length - 1;

/* A tap on the box: the next beat; on the last, the box is put away. */
export const advance = (r) => (!playing(r) ? r : r.at < r.beats.length - 1 ? { ...r, at: r.at + 1 } : { ...r, closed: true });
/* 跳过: the rest at once — the box closes and the log opens on them. */
export const skipAll = (r) => (!playing(r) ? r : { ...r, at: r.beats.length - 1, closed: true, skippedFrom: r.at });

/* The beats told so far in this scene (the log): up to the one on show. */
export const toldSoFar = (r) => (!r ? [] : r.closed ? r.beats : r.beats.slice(0, r.at + 1));

/* Kept per save, so a reload finds its place; storage may be off (a private
   window, a preview): then the reading lives only as long as the page. */
const keyOf = (save) => `lingjing.reading.${save || 'main'}`;
export function loadReading(save, store = globalThis.localStorage) {
  try {
    const r = JSON.parse(store?.getItem(keyOf(save)) ?? 'null');
    return r && Array.isArray(r.beats) && Number.isInteger(r.at) ? r : null;
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

/* The box: the beat on show, its speaker (name, portrait) or a caption line,
   跳过 and 记录 at its corner, and a small mark that a tap goes on. */
export function dialogHtml(r, { lang = 'zh', src = (f) => f } = {}) {
  if (!playing(r)) return '';
  const w = DLG_WORDS[lang] ?? DLG_WORDS.zh, b = r.beats[r.at] ?? {};
  const spoken = Boolean(b.name);
  const who = spoken ? `<div class="dlgname${b.hero ? ' hero' : ''}">${esc(b.name)}</div>` : '';
  const last = r.at >= r.beats.length - 1;
  return `<div class="dlg${spoken ? ' spoken' : ' told'}${b.art && !b.hero ? ' withface' : ''}" data-dlg-next role="button" tabindex="0" aria-label="${esc(w.on)}">
    ${face(b, src)}<div class="dlgbody">${who}<div class="dlgtext">${lineHtml(b, w)}</div></div>
    <div class="dlgctl"><span class="dlgcount">${r.at + 1} / ${r.beats.length}</span><button class="dlgbtn" data-dlg-log>${esc(w.log)}</button>${last ? '' : `<button class="dlgbtn" data-dlg-skip>${esc(w.skip)}</button>`}</div>
    <div class="dlgon${last ? ' last' : ''}" aria-hidden="true">▾</div></div>`;
}

/* 记录: what was told in this scene, in order; opened by 跳过 on the first
   beat it skipped. */
export function logHtml(r, { lang = 'zh', src = (f) => f } = {}) {
  const w = DLG_WORDS[lang] ?? DLG_WORDS.zh;
  const rows = toldSoFar(r).map((b, i) => `<div class="dlglogrow${b.name ? ' spoken' : ''}"${i === r?.skippedFrom ? ' data-dlg-from' : ''}>${b.name ? `<b>${esc(b.name)}</b>` : ''}<span>${lineHtml(b, w)}</span></div>`).join('');
  return `<div class="dlglog" role="dialog" aria-label="${esc(w.logTitle)}"><div class="dlgloghead"><span>${esc(w.logTitle)}</span><button class="dlgbtn" data-dlg-logclose>${esc(w.close)}</button></div><div class="dlglogbody">${rows}</div></div>`;
}

/* The small 记录 link under a scene card once the box is put away. */
export const logLinkHtml = (r, lang = 'zh') => (r?.beats?.length && !playing(r) ? `<button class="quietnext dlgloglink" data-dlg-log>${esc((DLG_WORDS[lang] ?? DLG_WORDS.zh).log)}</button>` : '');
