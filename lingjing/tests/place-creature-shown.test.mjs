// A place's own beast is pictured by itself only until it is tamed (Hanli 2026-11-12: at the 药园, the 狰 long his,
// its 图鉴 card stood on the stage at every arrival — 「无故出现」).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look } from '../scripts/rules.mjs';
import { stageCards } from '../scripts/stage.mjs';

const content = loadContent();
const NOW = new Date('2026-11-12T14:00:00');
const ctx = () => ({ now: NOW, quests: [] });
const home = Object.values(content.places).flatMap(d => d.places).find(p => p.has?.creature === 'zheng');
const at = (extra = {}) => ({ ...newState(content, 'zh', NOW), chapter: '00-waimen', scene: null, place: home.id, ended: ['00-prologue'],
  tier: 'qi', step: 9, stamina: 100, stamina_at: NOW.toISOString(), ...extra });
const creatureCards = s => stageCards(look(s, content, ctx())).filter(c => c.card === 'creature').map(c => c.id);

test('the 狰 has a home place', () => assert.ok(home, 'a place whose own beast is the 狰'));

test('not yet his: the place pictures its beast', () => {
  const lk = look(at(), content, ctx());
  assert.ok((lk.place.show ?? []).some(c => c.card === 'creature' && c.id === 'zheng'));
});

test('tamed: no card of it stands by itself — on the place or on the stage', () => {
  const s = at({ cast: ['zheng'] });
  assert.ok(!(look(s, content, ctx()).place.show ?? []).some(c => c.card === 'creature'));
  assert.deepEqual(creatureCards(s), []);
});
