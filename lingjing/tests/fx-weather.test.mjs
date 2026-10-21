// The weather in WebGL (fx-weather.js): it draws only the sky's three (snow, rain, fog), as many as
// the stage holds, falling with the stage's wind and coming back from the top — and the page lays it
// right after atmos.js lays its CSS layer, which stays the fallback.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GL_KINDS, countFor, dropOf, fallStep, flakeOf, glKinds, rngOf } from '../scripts/fx-weather.js';
import { PARTICLES, atmosOf } from '../scripts/atmos.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('weather fx: only the sky’s three, all of them atmos.js kinds; the rest stay CSS', () => {
  for (const k of GL_KINDS) assert.ok(PARTICLES.includes(k));
  assert.deepEqual(glKinds(['petals', 'snow', 'gusts', 'fog']), ['snow', 'fog']);
  assert.deepEqual(glKinds(atmosOf(null, 'storm', { season: 'autumn' }).particles), ['rain']);
  assert.deepEqual(glKinds(atmosOf(null, 'snow', { indoor: true }).particles), [], 'nothing falls indoors');
});

test('weather fx: a phone’s stage takes fewer, a wide one more — never a blizzard, never none', () => {
  const desk = countFor('snow', 1280, 720), phone = countFor('snow', 390, 500), huge = countFor('snow', 4000, 2000);
  assert.ok(phone < desk && phone >= Math.round(desk * 0.2));
  assert.ok(huge <= Math.round(desk * 1.4));
  assert.equal(countFor('fog', 390, 500), countFor('fog', 1280, 720));
});

test('weather fx: a flake falls, is carried by the wind, and comes back at the top', () => {
  const r = rngOf('t');
  const p = flakeOf(r, 800, 600);
  assert.ok([0, 1, 2].includes(p.depth) && p.fall > 0 && p.size > 0);
  const near = Array.from({ length: 200 }, () => flakeOf(r, 800, 600));
  assert.ok(near.filter((f) => f.depth === 2).every((f) => f.size > 2.8), 'the near ones are the big ones');
  const q = { x: 400, y: 0, fall: 100, sway: 0, phase: 0 };
  fallStep(q, 1, 0, 800, 600, 0.5);
  assert.deepEqual([q.x, q.y], [450, 100], 'down by its fall, across by the carry');
  const low = { x: 400, y: 615, fall: 100, sway: 0, phase: 0 };
  fallStep(low, 0.1, 0, 800, 600, 0);
  assert.ok(low.y < 0, 'off the bottom: back at the top');
  const d = dropOf(r, 800, 600);
  assert.ok(d.fall > 500 && d.len >= 12, 'rain falls fast, as streaks');
  assert.equal(rngOf('a')(), rngOf('a')(), 'a seed lays the same weather');
});

test('weather fx: the page lays it after the CSS layer, one line', () => {
  const page = fs.readFileSync(path.join(ROOT, 'scripts/lingjing.js'), 'utf8');
  assert.match(page, /\$\('atmosPts'\)\.innerHTML = particlesHtml\(a\.particles, [^\n]*\n\s*liveWeather\(\$\('atmosPts'\), a\.particles/);
});
