// The human-like player for rentrope (games/rentrope.js, a 割绳子 story beat; tools/board-bots.mjs): the level's
// answer, each move once the thing hangs still a moment — or, for a race, `after` ms past the move before it.
import { planBot } from './rope-plan.js';

// Re-laid 2026-10-20: the meat must be swung onto the chute. The other vine first, then the crow's before the crow
// (2.8 s) gets down — any time after the swing has started (0.6 s) wins; the plain hand cuts it at 1.9 s (★2).
export const plans = {"one": [{"g": "cut", "v": 1}, {"g": "cut", "v": 0, "after": 1900}]};
// ★3: the crow's vine cut as the swing reaches its far end (1.05–1.5 s after the first cut), through the 灵光 there.
export const starPlans = {"one": [{"g": "cut", "v": 1}, {"g": "cut", "v": 0, "after": 1250}]};
export const bot = planBot(plans);
