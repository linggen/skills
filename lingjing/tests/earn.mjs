// The 阶段任务 earned before a way on (rules/gates.mjs): a test that walks the story past a 回's
// stage quest stands the realm at the layer full first — the routine's days are the economy's
// (tools/balance.mjs), not played here. The game never calls this; the gate itself is tested in
// tests/gates.test.mjs.
import { earned, stageGate } from '../scripts/rules/gates.mjs';

export const earnedFor = (content, s, exit) => {
  const g = s && exit ? stageGate(content, s, s.scene, exit) : null;
  return g ? earned(content, s, g) : s;
};
