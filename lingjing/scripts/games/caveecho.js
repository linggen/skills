// 扔石听声 · 先往里扔一块石头 — a throw from the book on the 射鹿 board (deerarc.js; 2026-10-16, Hanli: 「投掷类都可以换」).
// Levels in games.json, row `caveecho`; the target and how a throw is judged in targets.js. Grades by stars
// name the task's marks.
import { forRow } from './deerarc.js';

export const { meta, newGame, act, tick, html, stuck, mount } = forRow('caveecho', {
  name: { zh: '扔石听声 · 先往里扔一块石头', en: 'A stone and an ear · Throw one in first' },
  how: { zh: '往后拉，松手，把石子扔进洞里。落得越深，回声越真。', en: 'Pull back and let go: throw the stone into the cave. The deeper it lands, the truer the echo.' },
}, { grades: { 3: 'sure', 2: 'sure', 1: 'lucky' } });
