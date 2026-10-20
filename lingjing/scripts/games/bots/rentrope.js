// The human-like player for rentrope (games/rentrope.js, a 割绳子 story beat; tools/board-bots.mjs): the level's
// answer (frozen with it from rope-gen.js), each move once the thing hangs still a moment.
import { planBot } from './rope-plan.js';

export const plans = {"one": [{"g": "cut", "v": 0}, {"g": "cut", "v": 1}, {"g": "gust"}]};
// ★3 races the crow (2026-10-20, its walk 2.4 s): the other vine first, then the crow's as the swing comes
// back — `after` ms past the first cut, not once it hangs still (by then the crow has it).
export const starPlans = {"one": [{"g": "cut", "v": 1}, {"g": "cut", "v": 0, "after": 1700}]};
export const bot = planBot(plans);
