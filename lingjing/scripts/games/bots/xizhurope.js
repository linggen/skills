// The human-like player for xizhurope (games/xizhurope.js, 喂息珠 — a 割绳子 story beat; tools/board-bots.mjs): the
// level's answer (frozen with it from rope-gen.js, seed xizhu-3: tier 3, 灵气泡 and 荆棘), each move once the thing
// hangs still a moment. The other order swings it into the brambles.
import { planBot } from './rope-plan.js';

export const plans = {"one": [{"g": "cut", "v": 0}, {"g": "cut", "v": 1}, {"g": "pop", "i": 0}]};
export const starPlans = {"one": [{"g": "cut", "v": 0}, {"g": "cut", "v": 1}, {"g": "pop", "i": 0}]};
export const bot = planBot(plans);
