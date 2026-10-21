// The human-like player for niugurope (games/niugurope.js, 喂饭桶 · 一根牛骨头 — a 割绳子 story beat; tools/board-bots.mjs):
// the level's answer, each move once the thing hangs still a moment. The two strings off to the side, then the one over
// the 柴墩 (it rests there), then the door's draught; the three 灵光 lie on that way down off the block.
import { planBot } from './rope-plan.js';

export const plans = {"one": [{"g": "cut", "v": 0}, {"g": "cut", "v": 1}, {"g": "cut", "v": 2}, {"g": "gust"}]};
export const starPlans = plans;
export const bot = planBot(plans);
