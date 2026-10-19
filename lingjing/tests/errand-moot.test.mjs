// An errand whose beast the story already won over is moot: never offered, never taken, and what
// waits on it opens (live, 2026-10-15: 药园's scene tamed 狰, then 「药园巡夜」 was taken and read
// 驯 1/1 · 交差 with nothing done).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look, quest } from '../scripts/rules.mjs';
import { TO_OPEN, walk } from './prologue.mjs';

const content = loadContent();
const NOW = new Date('2026-09-29T09:00:00');
const ctx = { now: NOW, quests: [] };
const base = () => ({ ...walk(newState(content, 'zh', NOW), TO_OPEN, content, NOW), place: 'waimen', stamina: 100, stamina_at: NOW.toISOString() });
const offered = (s) => (look(s, content, ctx).offers ?? []).map((o) => o.id);

test('before 狰 is tamed, 药园巡夜 is offered at 外门 and its follow-up waits', () => {
  const ids = offered(base());
  assert.ok(ids.includes('xu-yaoyuan-shouye'), ids.join(','));
  assert.ok(!ids.includes('xu-yaoyuan-canzhu'), 'the follow-up waits on it');
});

test('狰 already tamed by the story: 药园巡夜 is neither offered nor taken, and the follow-up opens', () => {
  const s = { ...base(), cast: [...base().cast, 'zheng'] };
  const ids = offered(s);
  assert.ok(!ids.includes('xu-yaoyuan-shouye'), ids.join(','));
  assert.ok(ids.includes('xu-yaoyuan-canzhu'), ids.join(','));
  assert.equal(quest(s, content, ctx, { action: 'take', id: 'xu-yaoyuan-shouye' }).result.refused, 'already-done');
});

test('taken first, the errand still counts the 狰 tamed after it (the ordinary way)', () => {
  const taken = quest(base(), content, ctx, { action: 'take', id: 'xu-yaoyuan-shouye' }).state;
  const book = (st) => look(st, content, ctx).book.find((b) => b.id === 'xu-yaoyuan-shouye');
  assert.equal(book(taken).ready, false);
  assert.equal(book({ ...taken, cast: [...taken.cast, 'zheng'] }).ready, true);
});

// Off the 药园 2026-10-19 (the standing rule Hanli approved 10-19: a guess among four spots, button-only, fits no kit):
// the story's wm-yaoyuan catches the 狰 with its radish; a cut catch board is never offered at the haunt, and the
// beast still runs from a raised hand. Its game was deleted the same day (Hanli: 「没用在游戏中的, 都删了吧」); the task id stays, `cut`.
test('守夜 is cut: never offered at the 狰\'s haunt, the 狰 still caught, never fought', async () => {
  const { catchHere } = await import('../scripts/rules/tasks.mjs');
  assert.equal(content.tasks.tasks.find((t) => t.id === 'shouye').cut, '2026-10-19');
  const zheng = content.creatures.creatures.find((c) => c.id === 'zheng');
  assert.equal(zheng.catch, 'shouye', 'still a catch, so never a fight (rules/tasks.mjs `runs`)');
  assert.equal(catchHere(content, { place: 'yaoyuan', cast: [], tasks: {} }, 'shouye'), false);
  const tame = content.chapters['00-waimen'].scenes['wm-yaoyuan'].exits.find((e) => e.id === 'tame');
  assert.equal(tame.grant.cast, 'zheng', 'the story brings it in');
});
