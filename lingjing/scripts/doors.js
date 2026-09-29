// doors.js — 息壤's moment (第一章 · 沉鼎秘境, his 2026-09-29: make it bigger):
// the five doors — 金 木 水 火 土 — open one by one on the stage, a seal and a
// line each, then the layer he stands on. Ink only: colour belongs to 银月's
// memories. The story node carries the doors (an exit's `doors`, story.mjs)
// and the realm lifted (`rose`); the page holds the card until he taps on.
// Reduced motion shows the last frame. Pure: node in, HTML out.
import { esc } from './esc.js';

const GLYPH = { metal: '金', wood: '木', water: '水', fire: '火', earth: '土' };
const WORDS = {
  zh: { title: '五门俱开', on: '继续' },
  en: { title: 'The five doors open', on: 'Go on' },
};

/// Each door opens this long after the one before (doors.css's --step).
export const DOOR_STEP_MS = 1100;

/// The card: `node` is the story node ({doors: [{el, line}], rose: {from, to}}).
export function doorsHtml(node, { lang = 'zh', still = false } = {}) {
  const doors = node?.doors ?? [];
  if (!doors.length) return '';
  const w = WORDS[lang] ?? WORDS.zh;
  const rows = doors.map((d, i) => `<div class="door" style="--i:${i}"><b class="seal">${esc(GLYPH[d.el] ?? d.el)}</b><span class="dline">${esc(d.line)}</span></div>`).join('');
  const to = node.rose?.to ? `<div class="doorsto" style="--i:${doors.length}">${esc(node.rose.to)}</div>` : '';
  return `<div class="card doors${still ? ' still' : ''}" role="group" aria-label="${esc(w.title)}" style="--step:${DOOR_STEP_MS}ms">
    <div class="cardtitle">${esc(w.title)}</div><div class="doorrows">${rows}</div>${to}
    <div class="acts"><button class="act" data-doors>${esc(w.on)}</button></div></div>`;
}
