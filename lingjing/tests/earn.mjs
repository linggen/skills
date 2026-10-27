// The 阶段任务 earned before a way on (rules/gates.mjs): a test that walks the story past a 回's
// stage quest stands the realm at the layer full first — the routine's days are the economy's
// (tools/balance.mjs), not played here. The game never calls this; the gate itself is tested in
// tests/gates.test.mjs.
import { earned, entryGate, stageGate } from '../scripts/rules/gates.mjs';
import { sceneOf } from '../scripts/rules/world.mjs';

export const earnedFor = (content, s, exit) => {
  // …or before the way INTO a gated beat that gives nothing to do first (gates.mjs entryGate, 2026-10-27).
  const e = s && exit ? sceneOf(content, s)?.exits?.find((x) => x.id === exit) : null;
  const g = s && exit ? stageGate(content, s, s.scene, exit) ?? (e ? entryGate(content, s, e) : null) : null;
  return g ? earned(content, s, g) : s;
};
