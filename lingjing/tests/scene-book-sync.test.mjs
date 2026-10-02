// Scene passages follow the book (2026-09-30). Every `story` a scene or an
// exit plays in the dialogue box is the book's own text: each paragraph of it
// must be found in the scene's 回 (story/jiuding-lu/NN-第N回.md), ignoring
// whitespace, **bold**, ⟪⟫, {注=}/{典=} links and {fill} tokens — so a book
// edit that leaves a scene quoting the old words fails here, not in play.
// Exceptions are written down below: branches the book never took (written in
// its voice for the game) and a few game-only bridge lines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const NUM = '一二三四五六七八九十';
const CHAPTERS = ['00-prologue', '00-waimen', '00-zhuji', '01-ji'];

// Exits whose story is a branch the book never took (the book's voice, not its text).
const BRANCHES = new Set([
  '00-cave/keep', '00-dawn/no-egg', '00-deer/straight', '00-duanbei/home', '00-duanbei/alone',
  '00-dusk/stay-home', '00-fox/leave', '00-gate/rush', '00-masan/strike', '00-rent/truth',
  '00-sleep/out', '00-storm/chase', '00-uncle/wait', '00-waimen/pay', '00-waimen/refuse', '01-tower/hold',
  'wm-ahe/owe', 'wm-chaifang/fist', 'wm-kunzhen/go', 'wm-lun1/fight', 'wm-mijing/refuse',
  'wm-qingshi/shout',
]);
// Game-only bridge paragraphs inside book passages: scene (or scene/exit) → opening words.
const BRIDGES = [
  ['wm-chu/rest', '腊月初七一早，周衡在外门的告示栏上'],
  ['wm-danlu', '第二天，他蹲在柴房里'],
  ['wm-mijing/pay', '执事房外头那片空场上'],
];

const norm = (t) => t
  .replace(/\[([^\]]*)\]\{[^}]*\}/g, '$1')
  .replace(/\{[^}\n]*\}/g, '')
  .replace(/\*\*|⟪|⟫/g, '')
  .replace(/^#.*$/gm, '')
  .replace(/^>\s?/gm, '')
  .replace(/---/g, '')
  .replace(/\s+/g, '');

const book = {};
for (let i = 1; i <= 10; i++) {
  const n = String(i).padStart(2, '0');
  book[`h${n}`] = norm(fs.readFileSync(path.join(ROOT, `story/jiuding-lu/${n}-第${NUM[i - 1]}回.md`), 'utf8'));
}

function* stories(scene) {
  if (scene.story?.zh) yield [scene.id, scene.story];
  for (const x of scene.exits ?? []) if (x.story?.zh) yield [`${scene.id}/${x.id}`, x.story];
}

test('every scene passage is the book\'s own text, paragraph by paragraph', () => {
  const drift = [];
  let count = 0;
  for (const ch of CHAPTERS) {
    const dir = path.join(ROOT, 'worlds/jiuding/chapters', ch, 'scenes');
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
      const scene = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      const text = book[scene.hui];
      assert.ok(text, `${scene.id}: hui ${scene.hui} has no book file`);
      for (const [where, st] of stories(scene)) {
        if (BRANCHES.has(where)) continue;
        for (const para of st.zh.split('\n\n')) {
          const n = norm(para);
          if (!n) continue;
          count++;
          if (text.includes(n)) continue;
          if (BRIDGES.some(([w, head]) => w === where && para.startsWith(head))) continue;
          drift.push(`${where} (${scene.hui}): ${para.slice(0, 40)}…`);
        }
      }
    }
  }
  assert.ok(count > 500, `only ${count} passage paragraphs found`);
  assert.deepEqual(drift, [], `scene passages that no longer match the book:\n${drift.join('\n')}`);
});

test('the exceptions still exist (a stale allow-list hides nothing)', () => {
  const seen = new Set();
  for (const ch of CHAPTERS) {
    const dir = path.join(ROOT, 'worlds/jiuding/chapters', ch, 'scenes');
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const scene = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      for (const [where, st] of stories(scene)) {
        seen.add(where);
        for (const [w, head] of BRIDGES) if (w === where && st.zh.split('\n\n').some((p) => p.startsWith(head))) seen.add(`bridge:${w}`);
      }
    }
  }
  for (const b of BRANCHES) assert.ok(seen.has(b), `branch ${b} is gone — drop it from BRANCHES`);
  for (const [w] of BRIDGES) assert.ok(seen.has(`bridge:${w}`), `bridge in ${w} is gone — drop it from BRIDGES`);
});
