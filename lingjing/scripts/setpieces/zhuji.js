// setpieces/zhuji.js — 筑基天象 (第九回, 09-cliff) in the 大场面 runner's registry
// (setpiece.js): its own player lives in setpiece-zhuji.js (the ZJ lane's); this
// hands the runner that player, so the page has one call for every set piece:
// playSetPiece(host, id, {lang, still, auto, onBeat, onDone}). The book's words
// come back through onBeat (`text`) for the page to say; the piece paints none.
import { ZHUJI_BEATS, playZhuji } from '../setpiece-zhuji.js';

export const BEATS = ZHUJI_BEATS;
export const TITLE = { zh: '筑基', en: 'The Foundation' };

export function play(host, { lang = 'zh', still = false, auto = false, onBeat, onDone } = {}) {
  return playZhuji(host, { lang, still, auto, captions: false, onBeat: (i, b) => onBeat?.(i, { ...b, text: b[lang] ?? b.zh }), onDone });
}
