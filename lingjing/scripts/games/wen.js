// wen.js — the thirteen 文 of the left hand, as 褚先生 teaches them in 古六 (wm-qianye; 《太清玉册》: 「自四指根逐节数，
// 共十二目，以按十二辰」), and the five spells' marks.
// Kept from the 讲堂三日 board (games/qiajue.js), deleted 2026-10-19 once the story played 气走经脉 · 掐诀 in its place.

// The twelve 文 (玉册: from the ring finger's root, joint by joint) and the middle finger's middle joint.
// f: finger column (0 little … 3 index), lv: 0 root … 3 tip.
export const WEN = [
  { id: 'zi', ch: '子', f: 1, lv: 0 }, { id: 'chou', ch: '丑', f: 2, lv: 0 }, { id: 'yin', ch: '寅', f: 3, lv: 0 },
  { id: 'mao', ch: '卯', f: 3, lv: 1 }, { id: 'chen', ch: '辰', f: 3, lv: 2 }, { id: 'si', ch: '巳', f: 3, lv: 3 },
  { id: 'wu', ch: '午', f: 2, lv: 3 }, { id: 'wei', ch: '未', f: 1, lv: 3 }, { id: 'shen', ch: '申', f: 0, lv: 3 },
  { id: 'you', ch: '酉', f: 0, lv: 2 }, { id: 'xu', ch: '戌', f: 0, lv: 1 }, { id: 'hai', ch: '亥', f: 0, lv: 0 },
  { id: 'yuqing', ch: '中', f: 2, lv: 1.5 },
];
export const SPELLS = [{ id: 'fire', wen: 'wu' }, { id: 'ice', wen: 'zi' }, { id: 'vine', wen: 'mao' }, { id: 'blade', wen: 'you' }, { id: 'wall', wen: 'yuqing' }];
