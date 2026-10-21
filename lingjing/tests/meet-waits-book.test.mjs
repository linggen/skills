// A beast's card waits for the book (Hanli 2026-10-21, 「按你的建议来」): at 古四's 药园巡夜 (wm-yaoyuan) the 狰's
// 图鉴 card stood over the 守炉 board from the moment the scene opened — before 丑时, before the book's
// 「[狰]{注=zheng}」 in the rest of the passage (`story_after`). A foe the book marks only there is brought on once
// that passage is told (rules/codex.mjs waitsTheBook); before it, he has the claw marks and the game.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look, story, task, win } from '../scripts/rules.mjs';
import { tellOf } from '../scripts/rules/tell.mjs';
import { meetsOf, seenOf } from '../scripts/rules/codex.mjs';
import { stageCards } from '../scripts/stage.mjs';

const content = loadContent();
const NOW = new Date('2026-10-21T10:00:00');
const ctx = () => ({ now: NOW, quests: [] });
const SCENE = content.chapters['00-waimen'].scenes['wm-yaoyuan'];
const at = (extra = {}) => ({
  ...newState(content, 'zh', NOW), chapter: '00-waimen', scene: 'wm-yaoyuan', place: SCENE.at, ended: ['00-prologue'],
  tier: 'qi', step: 1, stamina: 100, stamina_at: NOW.toISOString(), tasks: { 'yaoyuan-xunye': { status: 'offered' } }, ...extra,
});
const stage = s => stageCards(look(s, content, ctx())).map(c => `${c.card}${c.id ? `:${c.id}` : ''}`);

test('wm-yaoyuan: no 狰 card before the book reveals it — the board alone; after the passage, its card', () => {
  const s = at();
  assert.ok(!stage(s).includes('meet:zheng'), 'opening: no 狰 card on the stage');
  assert.ok(stage(s).includes('board:yaoyuan-xunye'), 'the game is there');
  assert.ok(!look(s, content, ctx()).scene.meet?.includes('zheng'), 'nor in the Look');
  assert.ok(!seenOf(content, s, SCENE).includes('zheng'), 'nor in 录\'s 图鉴');

  // The board counted: the rest of the passage is owed — still no card until it is told.
  const won = task(win(s, content, ctx(), { id: 'yaoyuan-xunye' }).state, content, ctx(), { action: 'done', id: 'yaoyuan-xunye' }).state;
  assert.ok(won.tell_owed.includes('after/wm-yaoyuan'));
  assert.ok(!stage(won).includes('meet:zheng'), 'owed, not yet told: no card');

  // Told (the box plays 丑时 and the 狰): its card may stand.
  const told = tellOf(content, won);
  assert.ok(told.tell.some(i => i.of === 'after' && /注=zheng/.test(i.marked ?? '')), 'the passage told is the one that marks 狰');
  assert.ok(stage(told.keep).includes('meet:zheng'), 'after the reveal: the 狰 card');
  assert.ok(meetsOf(content, { ...s, done_scenes: ['wm-yaoyuan'] }, SCENE).includes('zheng'), 'a scene done brought it on');
});

test('only a foe the book marks after the board waits; every other scene\'s meets stand as before', () => {
  const scenes = Object.values(content.chapters).flatMap(ch => Object.values(ch.scenes ?? {}));
  const blank = { ...newState(content, 'zh', NOW), tasks: {} };
  const waiting = scenes.map(sc => [sc.id, (sc.cast ?? []).filter(id => !meetsOf(content, blank, sc).includes(id) && meetsOf(content, { ...blank, done_scenes: [sc.id] }, sc).includes(id))])
    .filter(([, ids]) => ids.length);
  assert.deepEqual(waiting, [['wm-yaoyuan', ['zheng']]]);
  // People are not foes: 00-shiao's family, marked in its rest, still stand when the scene opens.
  const shiao = scenes.find(sc => sc.id === '00-shiao');
  assert.ok(['mama', 'baba'].every(id => meetsOf(content, blank, shiao).includes(id)));
});

test('nor is it named before the book: not in Look\'s cast, not on the place, not in 人物谱 — after the passage, all three (review 2026-10-21)', () => {
  const named = s => {
    const lk = look(s, content, ctx()), people = story(s, content, ctx()).result.people ?? [];
    return { cast: lk.scene.cast.some(c => c.id === 'zheng'), place: lk.place.has.creature?.id === 'zheng', people: people.some(p => p.id === 'zheng') };
  };
  assert.deepEqual(named(at()), { cast: false, place: false, people: false });
  const won = task(win(at(), content, ctx(), { id: 'yaoyuan-xunye' }).state, content, ctx(), { action: 'done', id: 'yaoyuan-xunye' }).state;
  assert.deepEqual(named(tellOf(content, won).keep), { cast: true, place: true, people: true });
});
