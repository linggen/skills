// The human-like player for guirope (games/guirope.js, 下坠子 · 打不过的，不打 — a 割绳子 story beat; tools/board-bots.mjs):
// the level's answer, each move once the stone hangs still a moment. The two side cords (either order) leave
// it hanging over the 石檐, the last cord sets it there, then the 竹筒 (the 蛫's tug) tips it onto the crack; the three
// 灵光 lie on that way down.
import { planBot } from './rope-plan.js';

export const plans = {"one": [{"g": "cut", "v": 1}, {"g": "cut", "v": 0}, {"g": "cut", "v": 2}, {"g": "gust"}]};
export const starPlans = plans;
export const bot = planBot(plans);
