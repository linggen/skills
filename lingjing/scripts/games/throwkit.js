// 投掷 · 小满的家伙 — the throwing kit in the 游戏厅 (Hanli 2026-10-16: 「投掷类都可以换. 可以多设计一些
// 工具, 特效, 让它更好玩」): the 射鹿 board (deerarc.js) with the things he throws — 石子, 箭, 短飞剑, 五雷符 —
// each its one tap in flight (throws.js). Levels in games.json, row `throwkit`.
import { forRow } from './deerarc.js';

export const { meta, newGame, act, tick, html, stuck, mount } = forRow('throwkit', {
  name: { zh: '投掷 · 小满的家伙', en: 'Throwing · What Xiaoman carries' },
  how: {
    zh: '往后拉，松手扔出去。石子会弹，箭能穿芦苇，短飞剑飞行中点一下直冲，五雷符点一下炸开。',
    en: 'Pull back and let go. A stone skips, an arrow pierces reeds; tap in flight: the short sword dashes on, the thunder talisman bursts.',
  },
});
