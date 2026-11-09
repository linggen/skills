// No free 修为 from the story (Hanli 2026-11-09: 「不要白给修为, 除了像秘境埋土里那次, 剧情里明确写了突破的」 ·
// 「剧情可以给修为, 但要给的和玩一场小游戏差不多, 然后有动画显示剧情奖励」). A story step pays one small game's 修为 where he
// stands (the `story` table, rules/playpay.mjs storyPlay); an authored 修为 stands only where the scene tells the gain
// (`narrated: {line, scene?}`, content.mjs lintGrantTold), and the step's 所得 carries the 修为 so the page can show it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lintGrantTold, loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { gainsOf, pay } from '../scripts/rules/core.mjs';
import { boardPlay, storyPlay } from '../scripts/rules/playpay.mjs';

process.env.LINGJING_STAMINA_LIMIT = '0';
const content = loadContent();
const NOW = new Date('2026-11-09T12:00:00');
const scenes = () => Object.values(content.chapters).flatMap(ch => Object.values(ch.scenes).map(sc => ({ ch, sc })));
const problems = (grant, own = null, next = null, sceneOf = () => null) => {
  const out = [];
  lintGrantTold('t', grant, sceneOf, own, next, (_, p) => out.push(p));
  return out;
};

test('a story step pays one small game: R × a default board\'s 体力 at his layer, never an authored lump', () => {
  for (let step = 1; step <= 9; step++) {
    const st = { tier: 'qi', step };
    const n = storyPlay(content, st);
    assert.ok(n > 0 && n <= 12, `练气${step}层: ${n}`);
    assert.equal(n, boardPlay(content, st, content.balance.play_pay.story.units), 'the same as a board of that many minutes');
  }
  assert.equal(storyPlay(content, { tier: 'qi', step: 7 }), 8, '练气七层: 8 (09-dabi\'s way on was 570)');
});

test('paying {table: \'story\'} lands one small game\'s 修为, whatever progress it claims, and its 所得 says so', () => {
  const s = { ...newState(content, 'zh', NOW), chapter: '00-zhuji', scene: '09-dabi', place: 'waimen', ended: ['00-prologue'], tier: 'qi', step: 7, progress: 100 };
  const paid = pay(content, s, { now: NOW, quests: [] }, { table: 'story' });
  assert.ok(paid.progress > 0 && paid.progress <= 12, `paid ${paid.progress}`);
  assert.equal(s.progress, 100 + paid.progress);
  assert.deepEqual(gainsOf({ table: 'story' }, paid), { items: [], progress: paid.progress }, '所得 carries the 修为 (the page\'s 「剧情所得」)');
});

test('the shipped book: every story 修为 is a `story` step, or a gain its words tell', () => {
  const told = [];
  for (const { sc } of scenes()) for (const e of sc.exits ?? []) {
    const g = e.grant;
    if (!g) continue;
    if (g.table === 'story') assert.equal(g.progress, undefined, `${sc.id}/${e.id}: a story step authors no progress`);
    if (g.progress > 0) { assert.ok(g.narrated?.line, `${sc.id}/${e.id}: ${g.progress} 修为 with no line that tells it`); told.push(`${sc.id}/${e.id}`); }
  }
  // 卷一's three (the 秘境's 埋土 night, 八层, 九层圆满) and 卷二–卷八's seven cauldrons.
  for (const id of ['wm-mingpai/over', '09-shenshi/winter', '09-yanceng/ruqiu']) assert.ok(told.includes(id), id);
  for (const id of ['09-dabi/on', '09-nianyao/on', '09-suifeng/on']) {
    const [sc, ex] = id.split('/'), e = content.chapters['00-zhuji'].scenes[sc].exits.find(x => x.id === ex);
    assert.equal(e.grant.table, 'story', `${id}: one small game now`);
  }
  assert.equal(content.chapters['00-waimen'].scenes['wm-yaoyuan'].exits.find(x => x.id === 'tame').grant.table, 'story');
  assert.deepEqual(content.world.companion.grant, { table: 'story' }, 'her joining: a story step');
});

test('the lint holds it: an untold lump, a line not in the words, a story step with progress, a told scene the way does not reach', () => {
  const own = { id: 'x', story: { zh: '那年冬天，他过了八层。', en: '' }, exits: [] };
  const kaikai = content.chapters['00-waimen'].scenes['wm-kaikai'];
  const of = id => (id === 'wm-kaikai' ? kaikai : null);
  assert.match(problems({ table: 'gate', progress: 570 }, own).join(), /do not tell/);
  assert.match(problems({ table: 'scene', progress: 40 }, own).join(), /do not tell/);
  assert.match(problems({ table: 'gate', progress: 570, narrated: { line: '他过了九层' } }, own).join(), /not in x's words/);
  assert.match(problems({ table: 'story', progress: 570 }, own).join(), /authors no progress/);
  assert.match(problems({ table: 'gate', progress: 760, narrated: { scene: 'wm-kaikai', line: '二层圆满' } }, own, 'wm-xiqi', of).join(), /not where this way leads/);
  assert.match(problems({ table: 'gate', narrated: { line: '那年冬天，他过了八层' } }, own).join(), /needs progress/);
  assert.deepEqual(problems({ table: 'gate', progress: 660, narrated: { line: '那年冬天，他过了八层' } }, own), []);
  assert.deepEqual(problems({ table: 'gate', progress: 760, narrated: { scene: 'wm-kaikai', line: '二层圆满' } }, own, 'wm-kaikai', of), []);
  assert.deepEqual(problems({ table: 'story', wealth: 20 }, own), []);
});
