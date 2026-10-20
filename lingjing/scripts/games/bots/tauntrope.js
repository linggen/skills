// The human-like player for tauntrope (games/tauntrope.js, a 割绳子 story beat; tools/board-bots.mjs): the level's
// answer (frozen with it from rope-gen.js), each move once the thing hangs still a moment.
import { planBot } from './rope-plan.js';

// Re-laid 2026-10-20: cut, it rests on the slab, then the puff blows it onto the 弹竹 (the one arc, ★3).
export const plans = {"one": [{"g": "cut", "v": 0}, {"g": "gust"}]};
export const starPlans = {"one": [{"g": "cut", "v": 0}, {"g": "gust"}]};
export const bot = planBot(plans);
