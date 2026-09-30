// Daily draws are seeded per save, not by the name (2026-09-30): with the hero
// fixed to 沈小满 every save shares one name, so each carries its own `seed`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { migrate, newState, seedOf, STATE_VERSION } from '../scripts/state.mjs';
import { rollOf } from '../scripts/rules/breakthrough.mjs';
import { companionRiddle } from '../scripts/rules/companion.mjs';

const content = loadContent();
const at = (iso) => new Date(iso);

test('a new save carries its own seed: its creation time', () => {
  const s = newState(content, 'zh', at('2026-09-30T08:00:00.123Z'));
  assert.equal(s.seed, s.created);
  assert.equal(seedOf(s), '2026-09-30T08:00:00.123Z');
  assert.notEqual(seedOf(newState(content, 'zh', at('2026-09-30T08:00:00.124Z'))), seedOf(s));
});

test('an old save is seeded once: by the name it was given on the old card, else by its creation time', () => {
  const base = { ...newState(content, 'zh', at('2026-09-20T01:00:00Z')), version: STATE_VERSION };
  delete base.seed;
  const named = migrate({ ...base, name: '秋白', gender: 'female' }, content);
  assert.equal(named.seed, '秋白', 'its draws stay what they were');
  assert.equal(named.name, '沈小满');
  const fixed = migrate({ ...base, name: '沈小满' }, content);
  assert.equal(fixed.seed, base.created, 'a save already on the fixed name does not share one seed');
  assert.equal(migrate(named, content).seed, '秋白', 'fixed once, kept');
});

test('same save + same day → same draws; different saves draw differently', () => {
  const now = at('2026-09-30T10:00:00Z');
  const saves = Array.from({ length: 12 }, (_, i) => newState(content, 'zh', at(`2026-09-30T08:00:${String(i).padStart(2, '0')}.000Z`)));
  for (const s of saves) {
    assert.equal(rollOf(s, 'foundation'), rollOf(structuredClone(s), 'foundation'));
    assert.equal(companionRiddle(content, s, now), companionRiddle(content, structuredClone(s), now));
  }
  assert.ok(new Set(saves.map((s) => rollOf(s, 'foundation'))).size > 1, 'rolls differ between saves');
  assert.ok(new Set(saves.map((s) => companionRiddle(content, s, now))).size > 1, 'riddles differ between saves');
  assert.equal(saves.every((s) => s.name === saves[0].name), true, 'while every save shares the one name');
});
