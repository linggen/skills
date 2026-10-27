// 斗 on the map (rules/fights.mjs; Hanli 2026-10-27: 「打怪的后山, 加一个战斗icon, 让玩家能看出来啊」): every place he can
// walk to where a beast stands now, with the door's setup the page grades (fightodds.js) and the seal it draws.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fightsNear } from '../scripts/rules.mjs';
import { fightMarkHtml } from '../scripts/fightmark.js';
import { content, NOW, stateAt } from '../tools/story-fights.mjs';

const gate = (extra = {}) => ({ ...stateAt('h05g'), place: 'zhishi', done_scenes: [...stateAt('h05g').done_scenes ?? [], 'wm-zhoutian', 'wm-yaoyuan'], ...extra });

test('from the 执事堂 at the gate: the 后山 is a fight, roads away, its beast set up as the door would — the tamed 狰\'s 药园 is not', () => {
  const f = fightsNear(content, gate(), NOW);
  const hou = f.find(x => x.id === 'houshan');
  assert.ok(hou, JSON.stringify(f.map(x => x.id)));
  assert.ok(hou.steps > 0 && hou.creature?.id && hou.setup?.foe && hou.setup?.you?.deck?.length, JSON.stringify(hou).slice(0, 200));
  assert.ok(!f.some(x => x.id === 'yaoyuan'), 'the 狰 walks with him');
  assert.ok(!f.some(x => x.id === 'mengshan' || x.id === 'songlin'), 'below the gate, 无令不得下山');
});

test('in a fight, none; the seal names the beast and wears its grade once weighed', () => {
  assert.deepEqual(fightsNear(content, gate({ fight: { game: 'haunt:lang' } }), NOW), []);
  const hou = fightsNear(content, gate(), NOW).find(x => x.id === 'houshan');
  assert.match(fightMarkHtml(hou, null), /class="fightmark" title="降妖 · .+">斗</);
  assert.match(fightMarkHtml(hou, () => ({ grade: 'hard', win: 0.1 })), /fightmark g-hard" title="降妖 · .+ · 难"/);
});
