// The human-like player for luoborope (games/luoborope.js, 喂饭桶 · 一根萝卜 — a 割绳子 story beat; tools/board-bots.mjs):
// the level's answer, each move once the thing hangs still a moment (rope-gen.js `luobo-8`: its plan, and its better way
// for the three 灵光).
import { planBot } from './rope-plan.js';

export const plans = {"one": [{"g": "cut", "v": 1}, {"g": "cut", "v": 2}, {"g": "cut", "v": 0}]};
export const starPlans = {"one": [{"g": "cut", "v": 0}, {"g": "cut", "v": 1}, {"g": "cut", "v": 2}]};
export const bot = planBot(plans);
