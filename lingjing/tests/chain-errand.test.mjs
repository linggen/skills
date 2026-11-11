// 连环差事 (Hanli 2026-11-10: 「短剧情你要补的话, 放差事里吧, 可以设计一个连环多步骤差事, 给些奖励.」): 九节菖蒲, six steps
// through 七 · 八 · 九层 (quests/guan.json `chain`). Each step opens after the one before it, at a share of its layer
// (`opens.layer.share`, rules/errands.mjs layerMet); handed in, the next is put in the book at once when its share is reached
// (`then`), else its giver offers it then. Its 修为 is a size (`units`) × R, its work an errand's minutes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState, threshold } from '../scripts/state.mjs';
import { look, VERBS } from '../scripts/rules.mjs';
import { unitsPay, workGrant } from '../scripts/rules/playpay.mjs';

process.env.LINGJING_STAMINA_LIMIT = '0';
const content = loadContent();
const NOW = new Date('2026-11-12T12:00:00');
const ctx = { now: NOW, quests: [] };
const ROOTS = ['wood', 'water', 'fire', 'earth', 'metal'];
const at = (place, step, share, extra = {}) => {
  const s = { ...newState(content, 'zh', NOW), chapter: '00-zhuji', scene: '09-shenshi', place, ended: ['00-prologue', '00-waimen'], done_scenes: ['09-futian', '09-dabi'], tier: 'qi', step, progress: 0, traits: ROOTS, stamina: 100, stamina_at: NOW.toISOString(), ...extra };
  s.progress = Math.floor(share * threshold(content, s));
  return s;
};
const offered = s => (look(s, content, ctx).offers ?? []).map(o => o.id);
const chain = content.quests.filter(q => q.chain === 'jiujie');

test('the chain as data: seven steps, each after the one before, two a layer through 七 · 八 · 九层 (and the master\'s seal before 看炉), each a size', () => {
  assert.deepEqual(chain.map(q => q.id), ['guan-jiujie-1', 'guan-jiujie-2', 'guan-jiujie-3', 'guan-jiujie-4', 'guan-jiujie-4a', 'guan-jiujie-5', 'guan-jiujie-6']);
  assert.deepEqual(chain.map(q => q.opens.layer.step), [7, 7, 8, 8, 8, 9, 9]);
  chain.slice(1).forEach((q, k) => { assert.equal(q.opens.after, chain[k].id); assert.equal(chain[k].then, q.id); });
  for (const q of chain) assert.ok(q.grant.units > 0 || q.work === 'labor', `${q.id}: a size, or a chore's work`);
  // 九层's two under 古八's 0.7 hold (ladder caps.hui.h09), so both open before 瞿老's door.
  for (const q of chain.filter(x => x.opens.layer.step === 9)) assert.ok(q.opens.layer.share < 0.7, q.id);
});

test('a step opens at its share of the layer, not a breath before: 七层 29% shut, 30% offered at 药园 — and only after 09-dabi', () => {
  assert.ok(!offered(at('yaoyuan', 7, 0.29)).includes('guan-jiujie-1'), '29%: shut');
  assert.ok(offered(at('yaoyuan', 7, 0.3)).includes('guan-jiujie-1'), '30%: offered');
  assert.ok(offered(at('yaoyuan', 8, 0)).includes('guan-jiujie-1'), 'a layer past it: open');
  assert.ok(!offered(at('yaoyuan', 7, 0.5, { done_scenes: ['09-futian'] })).includes('guan-jiujie-1'), 'before 09-dabi: shut');
});

test('handed in, a step pays its size and its work; the next is put in the book when its share is reached, else offered later', () => {
  const s = at('yaoyuan', 7, 0.3);
  const took = VERBS.quest(s, content, ctx, { action: 'take', id: 'guan-jiujie-1' });
  assert.ok(took.state?.quests?.['guan-jiujie-1'], JSON.stringify(took.result));
  // The wolf won (a 降: its count met), then handed in.
  const ready = { ...took.state, quests: { ...took.state.quests, 'guan-jiujie-1': { ...took.state.quests['guan-jiujie-1'], have: { 0: 1 } } } };
  const turned = VERBS.quest(ready, content, ctx, { action: 'turn', id: 'guan-jiujie-1' });
  assert.equal(turned.result.ok, true, JSON.stringify(turned.result));
  const q1 = chain[0], want = Math.round(unitsPay(content, ready, q1.grant.units)) + (workGrant(content, ready, q1)?.progress ?? 0);
  assert.equal(turned.result.paid.progress, want, 'units × R and the errand\'s minutes');
  // 30% + the pay is under 65%: step 2 is not taken yet, nor offered.
  assert.ok(!turned.state.quests['guan-jiujie-2'], 'step 2 waits for 65%');
  assert.ok(!offered({ ...turned.state, place: 'yaoyuan' }).includes('guan-jiujie-2'));
  const later = { ...turned.state, place: 'yaoyuan', progress: Math.floor(0.65 * threshold(content, turned.state)) };
  assert.ok(offered(later).includes('guan-jiujie-2'), '65%: 闵丹师 offers the next');
  // Step 3 handed in at 八层 past 65%: step 4 (秦雁, at 山门) lands in the book by itself — nothing to find.
  const s3 = { ...at('yaoyuan', 8, 0.7), quests: { 'guan-jiujie-1': { done_at: NOW.toISOString() }, 'guan-jiujie-2': { done_at: NOW.toISOString() }, 'guan-jiujie-3': { took: '2026-11-12', have: { 0: 1 } } } };
  const t3 = VERBS.quest(s3, content, ctx, { action: 'turn', id: 'guan-jiujie-3' });
  assert.equal(t3.result.ok, true, JSON.stringify(t3.result));
  assert.ok(t3.state.quests['guan-jiujie-4'] && !t3.state.quests['guan-jiujie-4'].done_at, 'step 4 in the book');
});

test('山门\'s 主力 practice stands only from 09-dabi on (a task\'s `after`), and comes again after a win — through 山门演武 (观里的事, 2026-11-10)', () => {
  // The three boards fold into the happening (rules/happenings.mjs): it lights at dusk some days and deals one of them at a time.
  const dusk = d => [17, 19].map(h => new Date(2026, 10, d, h, 10));
  const dealtAt = (s, now) => look(s, content, { now, quests: [] }).tasks.filter(t => t.practice && t.id.startsWith('shanmen-')).map(t => t.id);
  const before = at('shanmen', 6, 0.5, { done_scenes: ['09-futian'] });
  for (let d = 12; d < 19; d++) for (const now of dusk(d)) assert.deepEqual(dealtAt(before, now), [], 'before 09-dabi: none');
  const s = at('shanmen', 7, 0.3);
  const first = Array.from({ length: 7 }, (_, k) => dusk(12 + k)).flat().find(now => dealtAt(s, now).length);
  assert.ok(first, '演武 lights at dusk within a week');
  const [id] = dealtAt(s, first), c = { now: first, quests: [] };
  assert.ok(['shanmen-qingshen', 'shanmen-qinyan', 'shanmen-shouqiang'].includes(id));
  const w = VERBS.win(s, content, c, { id, stars: 3 });
  const d = VERBS.task(w.state, content, c, { action: 'done', id });
  assert.equal(d.result.ok, true, JSON.stringify(d.result));
  assert.ok(d.state.progress > s.progress, 'it pays');
  const later = Array.from({ length: 10 }, (_, k) => dusk(first.getDate() + 1 + k)).flat().find(now => dealtAt(d.state, now).length);
  assert.ok(later, 'there again on a later day');
  assert.notEqual(dealtAt(d.state, later)[0], id, 'another of the three first: the least recently played');
});

test('each 降 step and red tag names a place on 古八\'s map where its beast is fought for the errand itself (quest:<id>)', () => {
  const map = new Set(content.chapters['00-zhuji'].map.places);
  for (const q of content.quests.filter(x => (x.chain === 'jiujie' || x.id.startsWith('guan-xiqiang-')) && x.need.some(n => n.kind === 'subdue'))) {
    const s = { ...at('houshan', 9, 0.1), quests: { [q.id]: { took: '2026-11-12', have: {} } } };
    const row = look(s, content, ctx).book.find(r => r.id === q.id);
    assert.ok(row, q.id);
    const where = row.steps[0].at;
    assert.ok(where && map.has(where.id), `${q.id}: ${JSON.stringify(where)}`);
    if (where.here) assert.deepEqual(row.go?.does, 'fight', `${q.id}: fought for the errand where he stands`);
  }
});
