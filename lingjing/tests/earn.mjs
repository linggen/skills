// The 阶段任务 earned before a way on (rules/gates.mjs): a test that walks the story past a 回's
// stage quest stands the realm at the layer full first — the routine's days are the economy's
// (tools/balance.mjs), not played here. The game never calls this; the gate itself is tested in
// tests/gates.test.mjs.
import { earned, entryGate, stageGate } from '../scripts/rules/gates.mjs';
import { sceneOf } from '../scripts/rules/world.mjs';

export const earnedFor = (content, s, exit) => {
  // …or before the way INTO a gated beat that gives nothing to do first (gates.mjs entryGate, 2026-10-27).
  // Both, where both ask this way: the scene's own gate (a share of the layer, 2026-11-10), then the 圆满 held at its door.
  const e = s && exit ? sceneOf(content, s)?.exits?.find((x) => x.id === exit) : null;
  if (!s || !exit) return s;
  const own = stageGate(content, s, s.scene, exit);
  if (own) s = earned(content, s, own);
  const door = e ? entryGate(content, s, e) : null;
  return door ? earned(content, s, door) : s;
};
