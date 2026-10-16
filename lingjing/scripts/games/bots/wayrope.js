// The human-like player for wayrope (games/wayrope.js, a 割绳子 story beat; tools/board-bots.mjs): the level's
// answer (frozen with it from rope-gen.js), each move once the thing hangs still a moment.
import { planBot } from './rope-plan.js';

export const plans = {"one": [{"g": "cut", "v": 0}, {"g": "cut", "v": 1}, {"g": "pop", "i": 0}]};
export const starPlans = {"one": [{"g": "cut", "v": 0}, {"g": "cut", "v": 1}, {"g": "gust"}, {"g": "pop", "i": 0}]};
export const bot = planBot(plans);
