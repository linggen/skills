// 芦苇里那一等 · 短飞剑 — a throw from the book on the 射鹿 board (deerarc.js; 2026-10-16, Hanli: 「投掷类都可以换」).
// Levels in games.json, row `luwing`; the target and how a throw is judged in targets.js. Grades by stars
// name the task's marks.
import { forRow } from './deerarc.js';

export const { meta, newGame, act, tick, html, stuck, mount } = forRow('luwing', {
  name: { zh: '芦苇里那一等 · 短飞剑', en: 'The wait in the reeds · The short sword' },
  how: { zh: '往后拉，松手放剑，飞行中点一下，剑直冲出去。等它吸气，翅膀根翻开的那一霎。', en: 'Pull back and let go; tap in flight and the sword flies straight. Wait for its breath: the instant the wing root opens.' },
}, { grades: { 3: 'still', 2: 'still', 1: 'hasty' } });
