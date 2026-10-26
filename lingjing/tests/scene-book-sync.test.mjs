// Scene passages follow the book (2026-09-30). Every `story` a scene or an
// exit plays in the dialogue box is the book's own text: each paragraph of it
// must be found in the scene's 回 (book.json's `file` for the scene's `hui` id), ignoring
// whitespace, **bold**, ⟪⟫, {注=}/{典=} links and {fill} tokens — so a book
// edit that leaves a scene quoting the old words fails here, not in play.
// Exceptions are written down below: branches the book never took (written in
// its voice for the game) and a few game-only bridge lines.
//
// From 2026-10-14 to 2026-10-26 some passages played a cut (节本) with the book's beside it; the
// game plays the book's full text now (Hanli 「你的建议我同意」), so every passage takes this check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CHAPTERS = ['00-prologue', '00-waimen', '00-zhuji', '01-ji'];

// Exits whose story is a branch the book never took (the book's voice, not its text).
const BRANCHES = new Set([
  '00-cave/keep', '00-dawn/no-egg', '00-deer/straight', '00-duanbei/home', '00-duanbei/alone',
  '00-dusk/stay-home', '00-fox/leave', '00-gate/rush', '00-masan/strike', '00-zaotai/strike', '00-rent/truth',
  '00-sleep/out', '00-storm/chase', '00-uncle/wait', '00-waimen/pay', '00-waimen/refuse',
  'wm-ahe/owe', 'wm-chaifang/fist', 'wm-mijing/refuse', 'wm-caowu/step',
  'wm-qingshi/shout',
]);
// Game-only bridge paragraphs inside book passages: scene (or scene/exit) → opening words.
const BRIDGES = [
  ['wm-luobo/on', '腊月初七，离冬月初一周衡在执事房门口'],
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

// A scene's `hui` is a stable id — 古 h01…, 今 j01… (the interludes played since 2026-10-05); book.json names
// its file (03-第三回.md is h04 since the 2026-10-02 rename; 今 · 一 is 今线/插曲01.md). The same check for both lines,
// and the same exception lists.
const BOOK = JSON.parse(fs.readFileSync(path.join(ROOT, 'story/jiuding-lu/book.json'), 'utf8'));
const book = {};
for (const h of BOOK.volumes.flatMap((v) => v.hui)) book[h.id] = norm(fs.readFileSync(path.join(ROOT, 'story/jiuding-lu', h.file), 'utf8'));

function* stories(scene) {
  if (scene.story?.zh) yield [scene.id, scene.story];
  if (scene.story_after?.zh) yield [`${scene.id}/after`, scene.story_after];
  for (const x of scene.exits ?? []) if (x.story?.zh) yield [`${scene.id}/${x.id}`, x.story];
}
const allScenes = () => CHAPTERS.flatMap((ch) => {
  const dir = path.join(ROOT, 'worlds/jiuding/chapters', ch, 'scenes');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
});

test('every scene passage is the book\'s own text, paragraph by paragraph', () => {
  const drift = [];
  let count = 0, jin = 0;
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
          if (/^j/.test(scene.hui)) jin++;
          if (text.includes(n)) continue;
          if (BRIDGES.some(([w, head]) => w === where && para.startsWith(head))) continue;
          drift.push(`${where} (${scene.hui}): ${para.slice(0, 40)}…`);
        }
      }
    }
  }
  assert.ok(count > 500, `only ${count} passage paragraphs found`);
  assert.ok(jin > 250, `only ${jin} interlude paragraphs found`);
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

/* A passage lands on the book's paragraph: its last paragraph ends on it, marks and spaces aside. A
   game-only bridge paragraph (BRIDGES, named by its zh opening; the en paragraph at the same place
   goes with it) is the game's, not the book's landing. */
function landsOn(where, pair, lang, last) {
  const bridged = pair.zh.split('\n\n').map((p, i) => (BRIDGES.some(([w, head]) => w === where && p.startsWith(head)) ? i : -1));
  const paras = pair[lang].split('\n\n').filter((_, i) => !bridged.includes(i));
  return norm(paras.at(-1) ?? '').endsWith(norm(last));
}

/* A 回's last paragraph of prose, as its book file ends (zh `file`, en `file_en`): headings, rules,
   quotes and notes aside, marks stripped. */
function bookLast(hui, lang) {
  const h = BOOK.volumes.flatMap((v) => v.hui).find((x) => x.id === hui);
  const file = lang === 'zh' ? h?.file : h?.file_en;
  if (!file || !fs.existsSync(path.join(ROOT, 'story/jiuding-lu', file))) return null;
  const paras = fs.readFileSync(path.join(ROOT, 'story/jiuding-lu', file), 'utf8').split(/\n\s*\n/).map((p) => p.trim())
    .filter((p) => p && !/^(#|---|>|\*\*\*)/.test(p));
  return paras.at(-1).replace(/\[([^\]]*)\]\{[^}]*\}/g, '$1').replace(/\{[^}\n]*\}/g, '');
}

/* Where each 回 and each interlude ends, in play: the passage of the way on that crosses into
   another 回 (an exit's `next` naming a scene of another 回, or an exit that `ends` its chapter) —
   the exit's own story when it has one, else the scene's. Read off the scenes, never a list. */
function endings() {
  const scenes = allScenes(), byId = new Map(scenes.map((s) => [s.id, s]));
  const out = [];
  for (const sc of scenes) for (const x of sc.exits ?? []) {
    const crosses = x.ends || (x.next && byId.get(x.next) && byId.get(x.next).hui !== sc.hui);
    if (!crosses) continue;
    const own = x.story?.zh ? [`${sc.id}/${x.id}`, x.story] : sc.story_after?.zh ? [`${sc.id}/after`, sc.story_after] : [sc.id, sc.story];
    out.push({ hui: sc.hui, where: own[0], story: own[1] });
  }
  return out;
}

test('every interlude and every 回 ends on the book\'s last sentence (今 · 一 … 今 · 四, 古一 … 古九)', () => {
  const ends = endings();
  const huis = new Set(ends.map((e) => e.hui));
  for (const h of ['j01', 'j04', 'j07', 'j09', 'h01', 'h02', 'h04', 'h05', 'h07', 'h08', 'h11', 'h09', 'h10']) assert.ok(huis.has(h), `${h} has an ending passage`);
  for (const { where, story } of ends) for (const lang of ['zh', 'en']) assert.ok(story[lang]?.trim(), `${where} ${lang} has words`);
  // …and the game's passage reaches the 回's own end: the book file's last paragraph is its landing
  // (古七's 「他知道里头是谁。」 and 古八's 观主 sending him to the 漳水 were missing from the game outright).
  const short = [];
  for (const { hui, where, story } of ends) {
    for (const lang of ['zh', 'en']) {
      const last = bookLast(hui, lang);
      if (last && !landsOn(where, story, lang, last)) short.push(`${where} ${lang}: the 回 ends 「${last.slice(-40)}」`);
    }
  }
  assert.deepEqual(short, [], short.join('\n'));
  // 今 · 二's landing, whole: 爸's dig, the long shaky breath, the book shut, the one pay left.
  const dog = ends.find((e) => e.where === 'j04-dog');
  for (const line of ['跪着也是站着，矮一截', '只有一口很长、很抖的气，从手机里一点一点漏出来', '他盯着「长不回来」四个字看了很久，把书合上了', '家里一个月的进项，眼下只剩他妈超市那一份', '这时候，离院系杯头一轮只剩五天了。']) {
    assert.ok(dog.story.zh.includes(line), `j04-dog keeps 「${line}」`);
  }
  assert.match(dog.story.en, /Kneeling's just standing, a bit shorter[\s\S]*very shaky breath[\s\S]*shut the book[\s\S]*five days to the first round/);
});
