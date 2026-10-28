// games/tide.js — the 兽潮 night makers, one per 主力 塔防 kit (rules/shouchao.mjs reads them; Hanli 2026-10-28:
// 「主力塔防放进兽潮」 · 「关卡要多, 最起码1个月不重复」). Each kit keeps its own, beside its engine: pure, seeded, one ask →
// one night ({ deal, sig, boss, kinds }), and `prove` (one headless play by its human-like hand, no 结印) for
// tools/tide-prove.mjs; the task row (tasks/world.json `shouchao.rotation`) names which of them turn.
import { tide as shouqiang } from './shouqiang/tide.js';
import { tide as shoulu } from './shoulu/tide.js';
import { tide as sadoushou } from './sadoushou/tide.js';
import { tide as sadou } from './sadou/tide.js';

export const TIDES = { shouqiang, shoulu, sadoushou, sadou };
