// 修为 in three 段 (Hanli 2026-11-02: 「9层用于计算, 小, 中, 大成用于显示」 · 「筑基以后再分3段UI吧」): a tier the Look gives
// in 段 reads 「筑基 · 中成」 over three segments, the 层 only in the tooltip; a tier without `duan` (练气) keeps its bar.
import test from 'node:test';
import assert from 'node:assert/strict';
import { duanOf, duanSegments } from '../scripts/stage.mjs';

test('练气 (no duan): the plain bar, its named 层', () => {
  assert.equal(duanOf({ id: 'qi', name: '练气四层圆满' }), null);
  assert.equal(duanOf(undefined), null);
});

test('筑基 in 段: realm · 段 as the label, the 层 kept for the tooltip', () => {
  const d = duanOf({ id: 'foundation', realm: '筑基', name: '筑基四层', layer: '第四层', duan: { id: 'zhong', name: '中成', at: 1, marks: [400, 500, 600] } });
  assert.deepEqual(d, { label: '筑基 · 中成', at: 1, layer: '第四层', full: '筑基四层' });
  assert.ok(!d.label.includes('层'), 'no 层 on screen');
});

test('a 段 index out of 1–3 is not drawn as segments', () => {
  assert.equal(duanOf({ realm: '筑基', duan: { name: '中成', at: 0 } }), null);
  assert.equal(duanOf({ realm: '筑基', duan: { name: '中成', at: 4 } }), null);
});

test('segments: past 层 full, the current by its share, the next empty', () => {
  assert.deepEqual(duanSegments(1, 40), [{ kind: 'now', pct: 40 }, { kind: 'ahead', pct: 0 }, { kind: 'ahead', pct: 0 }]);
  assert.deepEqual(duanSegments(2, 45), [{ kind: 'past', pct: 100 }, { kind: 'now', pct: 45 }, { kind: 'ahead', pct: 0 }]);
  assert.deepEqual(duanSegments(3, 100), [{ kind: 'past', pct: 100 }, { kind: 'past', pct: 100 }, { kind: 'now', pct: 100 }]);
});
