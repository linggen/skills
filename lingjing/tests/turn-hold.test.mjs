// What the box tells is told under its own scene and 回 — the count, the 回 line, the header —
// and nothing stands beside it but the large 亮相 card (live 2026-10-14, four leftovers):
//   1. 今 · 一's first beat read 「8 / 62」: 古二's last passage (7 beats) counted in the new scene's.
//   2. The 回 line turned to 今 · 一 while 古二's last passage still played: the page held no title
//      for h02 (a fresh tab never saw it) — the close carries it now.
//   3. Through 00-hall/born's passage the header showed 00-waimen's people: a 前情 stood first in
//      the reading, and the header held only while the box was on a choice's passage.
//   4. (queue.test.mjs) 可接的差事 stood behind the large card; 5. the large card's top cut into
//      the header's people row (CSS, below).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look, resolve } from '../scripts/rules.mjs';
import { huiLabel } from '../scripts/rules/hui.mjs';
import { playOf, tellOf } from '../scripts/rules/tell.mjs';
import { huiLineOf } from '../scripts/queue.js';
import { advance, current, huiAt, leadsIn, sceneOfItem, withTold } from '../scripts/dialogue.js';
import { TO_HALL, walk } from './prologue.mjs';

// 00-notice's village map played (batch two, 2026-10-14): its way on waits on it.
const eveDone = (s) => ({ ...s, tasks: { ...s.tasks, 'village-eve': { status: 'done', period: 'once', done_at: '2026-10-01T00:00:00Z' } } });

const content = loadContent();
const NOW = new Date('2026-10-05T10:00:00');
const ctx = { now: NOW, quests: [] };
const save = (name) => { const d = JSON.parse(fs.readFileSync(new URL(`./fixtures/saves/${name}.json`, import.meta.url), 'utf8')); return d.state ?? d; };
const css = fs.readFileSync(new URL('../scripts/lingjing.css', import.meta.url), 'utf8');

/* 古二's last choice taken: the save on j01-track, the reading the page draws there. */
function turned({ catchup = true } = {}) {
  const s = resolve(eveDone(save('jin-notice')), content, ctx, { exit: 'go' }).state;
  const tell = playOf(content, s, tellOf(content, s).tell).filter((t) => catchup || t.of !== 'catchup');
  return { s, l: look(s, content, ctx), r: withTold(null, tell, s.scene) };
}
const at = (r, of) => { let x = r; while (x.items[x.i].of !== of) x = advance(x); return x; };

test('the count never runs across a 回\'s turn: 今 · 一\'s first beat is 1 / its own, 古二\'s tail counts alone', () => {
  for (const catchup of [false, true]) {
    const { r } = turned({ catchup });
    const gu = r.items.find((t) => t.of === 'choice'), jin = r.items.find((t) => t.of === 'scene');
    assert.deepEqual([gu.hui, jin.hui], ['h02', 'j01']);
    const tail = r.items.filter((t) => t.of !== 'scene').reduce((n, t) => n + t.beats.zh.length, 0);
    // 古二's last passage (with the 前情 that leads into it): its own count.
    const old = current(at(r, 'choice'));
    assert.equal(old.n, tail, `古二's tail alone (catchup ${catchup})`);
    // 今 · 一's first beat: 1 / 55, not 8 / 62.
    const first = current(at(r, 'scene'));
    assert.deepEqual([first.k, first.n, first.before], [0, jin.beats.zh.length, false], `catchup ${catchup}`);
  }
  // One 回 across a move (the choice's passage, then the scene's): one count, as ever.
  const items = [{ of: 'choice', id: 'a/go', hui: 'h04', beats: { zh: [{ text: '1' }, { text: '2' }] } }, { of: 'scene', id: 'b', hui: 'h04', beats: { zh: [{ text: '3' }] } }];
  assert.deepEqual([current(withTold(null, items, 'b')).n, current(advance(advance(withTold(null, items, 'b')))).k], [3, 2]);
});

test('the 回 line keeps 古二 while its last passage is told — from the close, even in a tab that never saw 古二', () => {
  const { l, r } = turned();
  const line = huiLabel(content, 'h02', 'zh', 'head');
  assert.equal(l.chapter.close.id, 'h02');
  assert.equal(l.chapter.close.line, line, 'the ended 回\'s heading rides on its close');
  // The box's 回: a 前情 leads into 古二's passage and tells its 回; then 今 · 一.
  assert.equal(huiAt(r), 'h02', 'on the 前情');
  assert.equal(huiAt(at(r, 'choice')), 'h02');
  assert.equal(huiAt(at(r, 'scene')), 'j01');
  // A fresh tab: the only title known is the one the close brings.
  const titles = { [l.chapter.hui]: l.chapter.title, [l.chapter.close.id]: l.chapter.close.line };
  const lineOf = (x) => huiLineOf({ hui: l.chapter.hui, title: l.chapter.title, telling: huiAt(x), titles });
  assert.equal(lineOf(r), line);
  assert.equal(lineOf(at(r, 'choice')), line);
  assert.equal(lineOf(at(r, 'scene')), l.chapter.title, 'the new 回\'s passage: the new line');
  // The page reads the box's 回 off the REAL scene's reading — under the held header's scene
  // (00-notice) there is none, and the line turned (live 2026-10-14).
  const page = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  assert.match(page, /const realLook = look, told = readingHere\(\);\s*look = headLook\(\);/);
  assert.match(page, /telling: huiAt\(told\), titles/);
});

test('the header holds the old scene through all that leads in — a 前情 first, the last scene\'s unplayed beats, the choice', () => {
  // 00-hall/born, as live: the move's passages behind a 前情 (passages piled up while the page was away).
  let s = walk(newState(content, 'zh', NOW), TO_HALL, content, NOW);
  const hall = tellOf(content, s).keep;
  s = walk(hall, [['resolve', { exit: 'born', birth: '1986-07-07' }]], content, NOW);
  const owed = playOf(content, s, tellOf(content, s).tell);
  const recap = { of: 'catchup', id: 'catchup', hui: 'h01', beats: { zh: [{ text: '前情。', recap: true }] } };
  for (const tell of [owed, [recap, ...owed]]) {
    const r = withTold(null, tell, s.scene);
    assert.equal(s.scene, '00-waimen');
    const own = r.items.findIndex((t) => sceneOfItem(t) === '00-waimen');
    for (let x = r; !x.closed; x = advance(x)) {
      assert.equal(leadsIn(x, '00-waimen', '00-hall'), x.i < own, `${x.items[x.i].id} beat ${x.j}: 00-hall's header ${x.i < own ? 'holds' : 'gives way'}`);
    }
    assert.equal(leadsIn(r, '00-waimen', '00-luoshu'), false, 'a scene the reading does not lead in from');
  }
  // The last scene's unplayed beats carried in, then its choice, then the new scene's.
  const was = withTold(null, [{ of: 'scene', id: 'x', beats: { zh: [{ text: 'x1' }, { text: 'x2' }, { text: 'x3' }] } }], 'x');
  const r = withTold(was, [{ of: 'choice', id: 'x/go', beats: { zh: [{ text: 'go' }] } }, { of: 'scene', id: 'y', beats: { zh: [{ text: 'y1' }] } }], 'y');
  const seen = [];
  for (let x = r; !x.closed; x = advance(x)) seen.push([current(x).beat.text, leadsIn(x, 'y', 'x')]);
  assert.deepEqual(seen, [['x2', true], ['x3', true], ['go', true], ['y1', false]]);
  assert.equal(leadsIn({ ...r, closed: true }, 'y', 'x'), false, 'the box put away');
});

test('the large 亮相 card stands under the header, never over its people row', () => {
  // The header's people are the top bar's since 2026-10-14 (story.css): the stage starts under it.
  const story = fs.readFileSync(new URL('../scripts/story.css', import.meta.url), 'utf8');
  const rules = [...`${css}\n${story}`.matchAll(/(?:^|\n)\s*\.sight \{([^}]*)\}/g)].map((m) => m[1]);
  assert.ok(rules.length >= 1);
  for (const r of rules) {
    const top = r.match(/top:\s*([^;]+);/)?.[1];
    if (top) assert.match(top, /^calc\(var\(--head-h\) \+ \d+px\)$/, `.sight top: ${top}`);
  }
});
