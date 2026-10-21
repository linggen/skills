// poke.js — 隔空指点's jab: the shared motion detector now lives in games/jieyin/motion.js (手势斗法: one detector for
// the push of a palm and the jab of fingers); this re-exports it so zhidian's calls stay as they were.
export { sizeOf, startPoke, poke } from '../jieyin/motion.js';
