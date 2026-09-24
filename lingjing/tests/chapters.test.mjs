// Chapters 4 on, walked through the rules by their buttons alone: each arrive
// is where the last chapter pointed, each creature's riddle and each seal
// takes its own answer and refuses a wrong one, each cauldron takes one at
// the peak of the realm below its gate — and nothing past 渡劫.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look, resolve, riddleOf } from '../scripts/rules.mjs';

const content = loadContent();
const NOW = new Date('2026-09-24T12:00:00');
const c = { now: NOW, quests: [] };
const later = Object.keys(content.chapters).filter(id => id >= '04').sort();
const tiers = content.ladder.tiers;

function must(state, args) {
  const out = resolve(state, content, c, args);
  assert.equal(out.result.ok, true, `${state.scene} ${args.exit}: ${JSON.stringify(out.result)}`);
  return out;
}

/* The answer a riddle exit takes today, and a choice it refuses. */
function answers(state, scene, exit) {
  const key = Array.isArray(exit.key) || typeof exit.key === 'string' ? riddleOf(state, { id: scene.id }, exit, NOW) : null;
  const r = content.riddles[state.lang].riddles[key];
  return { right: r.a[0], wrong: r.choices.find(x => !r.a.includes(x)) };
}

/* At the first scene of `id`, every chapter before it ended, at the peak of
   the realm its cauldron opens. */
function arrive(id, lang = 'zh') {
  const ch = content.chapters[id];
  const ended = Object.keys(content.chapters).filter(x => x < id);
  const below = ch.gate == null ? tiers[tiers.length - 1] : tiers[tiers.findIndex(t => t.gate === ch.gate) - 1];
  return { ...newState(content, lang, NOW), chapter: id, scene: ch.first_scene, place: ch.scenes[ch.first_scene].at, ended, done_scenes: [],
    tier: below.id, step: below.thresholds.length - 1, progress: below.thresholds.at(-1), stamina: 100, wealth: 500, name: '清玄' };
}

/* The button that moves the story: a riddle before a fight, a seal, the
   cauldron, onward. */
const onward = scene => ['riddle', 'seal', 'take'].map(id => scene.exits.find(e => e.id === id && scene.buttons.includes(id))).find(Boolean)
  ?? scene.exits.find(e => scene.buttons.includes(e.id) && (e.next || e.ends));

for (const id of later) {
  test(`${id} walks by its buttons from arrive to its end, in both languages`, () => {
    for (const lang of ['zh', 'en']) {
      let s = arrive(id, lang);
      const ch = content.chapters[id];
      const walked = [];
      for (let guard = 0; guard < 12 && s.scene; guard += 1) {
        const scene = ch.scenes[s.scene];
        walked.push(`${scene.id}@${s.place}`);
        assert.equal(s.place, scene.at, `${scene.id} is played where it stands`);
        const exit = onward(scene);
        assert.ok(exit, `${scene.id} has a way on`);
        if (exit.key) {
          const { right, wrong } = answers(s, scene, exit);
          const miss = resolve(s, content, c, { exit: exit.id, answer: wrong });
          assert.equal(miss.result.refused, 'wrong-answer', `${scene.id}: ${wrong} is not the answer`);
          s = must(s, { exit: exit.id, answer: right }).state;
        } else s = must(s, { exit: exit.id }).state;
      }
      assert.deepEqual(walked.map(w => w.split('@')[0]).sort(), Object.keys(ch.scenes).sort(), 'every scene is on the spine');
      assert.ok(s.ended.includes(id), `${id} ended`);
      if (ch.gate != null) assert.equal(tiers.find(t => t.id === s.tier).gate, ch.gate, 'the cauldron opened its realm');
    }
  });

  test(`${id}: a cauldron refuses one short of the peak, and a creature scene offers its three ways`, () => {
    const ch = content.chapters[id];
    const cauldron = Object.values(ch.scenes).find(x => x.exits.some(e => e.id === 'take'));
    const take = cauldron.exits.find(e => e.id === 'take');
    if (ch.gate != null) {
      const s = { ...arrive(id), scene: cauldron.id, place: cauldron.at, step: 0, progress: 0 };
      assert.equal(resolve(s, content, c, { exit: 'take' }).result.refused, 'not-at-peak');
    } else assert.ok(!take.breakthrough, 'no realm past the last');
    const beast = Object.values(ch.scenes).find(x => x.show?.some(card => card.card === 'creature'));
    assert.equal(beast.buttons.length, 3);
    assert.ok(beast.exits.find(e => e.id === 'subdue').game.creature === beast.show[0].id);
    const creature = content.creatures.creatures.find(x => x.id === beast.show[0].id);
    assert.ok(creature.elite, `${creature.id} is the chapter's elite`);
    assert.ok(look(arrive(id), content, c).scene, 'the first scene looks');
  });
}

test('each chapter points the road at the next one, and the last points nowhere', () => {
  const ids = Object.keys(content.chapters).sort();
  for (const id of later) {
    const next = ids[ids.indexOf(id) + 1];
    const end = Object.values(content.chapters[id].scenes).find(x => x.exits.some(e => e.ends === id));
    const map = end.show?.find(card => card.card === 'map');
    if (next) assert.equal(map?.goal, content.chapters[next].province, `${id} points at ${next}`);
  }
});
