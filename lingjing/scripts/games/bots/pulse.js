// The human-like player for 晨脉 · 坑填平了才许摸球 (games/pulse.js; tools/board-bots.mjs).
// Read the morning count: seventy or over, rest; under seventy, pick up the ball.
import { LIMIT } from '../pulse.js';

export const bot = (s) => (s.won ? null : { g: s.pulse < LIMIT ? 'train' : 'rest' });
