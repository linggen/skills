// Scene passages follow the book (2026-09-30). Every `story` a scene or an
// exit plays in the dialogue box is the book's own text: each paragraph of it
// must be found in the scene's 回 (book.json's `file` for the scene's `hui` id), ignoring
// whitespace, **bold**, ⟪⟫, {注=}/{典=} links and {fill} tokens — so a book
// edit that leaves a scene quoting the old words fails here, not in play.
// Exceptions are written down below: branches the book never took (written in
// its voice for the game) and a few game-only bridge lines.
//
// 节本 (2026-10-14, Hanli: 「可以，先做古三」): a condensed passage plays the game's own cut
// (`story`) and keeps the book's passage beside it (`story_full`, `story_after_full`). The book's
// passage takes the check above, word for word; the cut takes jieben.mjs's: every sentence from
// the book's own words, in the book's order (its tolerance is stated there), zh and en.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { checkJieben, landingKept, landingOf, unitsOf } from '../scripts/jieben.mjs';

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

// Each passage as the book is checked against: the book's own passage where the game plays a cut of it.
function* stories(scene) {
  for (const [where, pair, full] of passages(scene)) yield [where, full ?? pair];
}
function* passages(scene) {
  if (scene.story?.zh) yield [scene.id, scene.story, scene.story_full];
  if (scene.story_after?.zh) yield [`${scene.id}/after`, scene.story_after, scene.story_after_full];
  for (const x of scene.exits ?? []) if (x.story?.zh) yield [`${scene.id}/${x.id}`, x.story, x.story_full];
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

test('a condensed passage comes from the book: every sentence in the book\'s own words, in its order, zh and en', () => {
  const off = [];
  let cut = 0;
  for (const scene of allScenes()) {
    for (const [where, pair, full] of passages(scene)) {
      if (!full) continue;
      cut++;
      for (const lang of ['zh', 'en']) {
        const r = checkJieben(pair[lang], full[lang], lang);
        if (!r.ok) off.push(`${where} ${lang} (cover ${r.cover.toFixed(2)}): ${r.bad.map((b) => `「${b.s.slice(0, 30)}」 ${b.cov.toFixed(2)}`).join(' · ') || 'the whole too loose'}`);
        // about a third (Hanli's standard); never more than two thirds of the book's
        const share = unitsOf(pair[lang], lang).length / unitsOf(full[lang], lang).length;
        if (share > 0.75) off.push(`${where} ${lang}: ${Math.round(share * 100)}% of the book's passage — not a cut`);
      }
    }
  }
  assert.ok(cut >= 11, `condensed passages found: ${cut}`);
  assert.deepEqual(off, [], off.join('\n'));
});

test('the check holds the standard: Hanli\'s approved sample passes; a new line, a paraphrase and a swap fail', () => {
  const gate = allScenes().find((s) => s.id === '00-gate');
  const book = `${gate.story_full.zh}\n\n${gate.story_after_full.zh}`; // split at the road since 10-21 (泗水路)
  const sample = [
    '沉鼎山并不怎么高，只是陡。一道石阶笔直地插进雾里，瞧不见尽头。小满张着嘴，半天合不上。',
    '庙廊下生着一堆火。马家雇的镖师葛六捏碎一颗核桃：「二十年前考过。外门，练气三层，在第三层蹲了六年。」他一根指头点过一圈孩子：「你们这几千个，明天进门的，一百来个。一百来个里头，能筑基的——一个。」',
    '小满问：「百日筑基，是不是一百天？」葛六笑了：「百日是打底子。我打了六年。」',
    '一个光脚的孩子站起来：「那我就当那一个！我家七张嘴，一年五两，够他们吃三年。」满廊的人笑了，葛六没笑：「……我当年，也这么说。」',
    '马家的家丁挑灯来问：「三爷问，那个摆法画好了没有？」「画好了。五两银子，一个格子也不差。」',
  ];
  assert.ok(checkJieben(sample.join('\n\n'), book, 'zh').ok, 'the 2026-10-14 sample');
  const invented = [sample[0], '葛六是个很厉害的镖师，大家都很怕他，谁也不敢多说一句话。', ...sample.slice(1)];
  assert.equal(checkJieben(invented.join('\n\n'), book, 'zh').ok, false, 'a line the book never wrote');
  const paraphrase = [sample[0], '庙里有一堆火，一个镖师坐在边上，捏碎了核桃，说他二十年前也考过。', ...sample.slice(2)];
  assert.equal(checkJieben(paraphrase.join('\n\n'), book, 'zh').ok, false, 'the book retold in other words');
  const swapped = [sample[4], sample[0], sample[1], sample[2], sample[3]];
  assert.equal(checkJieben(swapped.join('\n\n'), book, 'zh').ok, false, 'out of the book\'s order');
});

// A cut lands where the book lands (Hanli, 2026-10-15, at 今 · 二 → 古五: 「太突然了……今线感觉还没结束」
// — j04-dog's cut stopped at 「这时候，离院系杯头一轮只剩五天了」 with 爸's 「跪着也是站着」, the long
// shaky breath and 「把书合上了」 cut away). The book's closing line is a landing, never a cut's to drop:
// every condensed passage ends on the book's last sentence (trimmed at most), zh and en. A game-only
// bridge paragraph (BRIDGES) at the end of the book's passage is the game's, not the book's landing.
function landingFull(where, full) {
  const out = {};
  for (const lang of ['zh', 'en']) {
    const zhParas = full.zh.split('\n\n'), paras = full[lang].split('\n\n');
    // A bridge is named by its zh opening; the en paragraph at the same place goes with it.
    const cut = zhParas.map((p, i) => (BRIDGES.some(([w, head]) => w === where && p.startsWith(head)) ? i : -1)).filter((i) => i >= 0);
    out[lang] = paras.filter((_, i) => !cut.includes(i)).join('\n\n');
  }
  return out;
}

test('a condensed passage lands where the book lands: its last sentence is the book\'s last, zh and en', () => {
  const off = [];
  for (const scene of allScenes()) {
    for (const [where, pair, full] of passages(scene)) {
      if (!full) continue;
      const book = landingFull(where, full);
      for (const lang of ['zh', 'en']) if (!landingKept(pair[lang], book[lang], lang)) off.push(`${where} ${lang}: the book ends 「${landingOf(book[lang], lang)}」`);
    }
  }
  assert.deepEqual(off, [], off.join('\n'));
});

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
    const own = x.story?.zh ? [`${sc.id}/${x.id}`, x.story, x.story_full] : sc.story_after?.zh ? [`${sc.id}/after`, sc.story_after, sc.story_after_full] : [sc.id, sc.story, sc.story_full];
    out.push({ hui: sc.hui, where: own[0], story: own[1], full: own[2] });
  }
  return out;
}

test('every interlude and every 回 ends on the book\'s last sentence (今 · 一 … 今 · 四, 古一 … 古九)', () => {
  const ends = endings();
  const huis = new Set(ends.map((e) => e.hui));
  for (const h of ['j01', 'j04', 'j07', 'j09', 'h01', 'h02', 'h04', 'h05', 'h07', 'h08', 'h11', 'h09', 'h10']) assert.ok(huis.has(h), `${h} has an ending passage`);
  const off = [];
  for (const { where, story, full } of ends) {
    for (const lang of ['zh', 'en']) {
      if (full) { const book = landingFull(where, full); if (!landingKept(story[lang], book[lang], lang)) off.push(`${where} ${lang}`); continue; }
      // Told whole (no cut): its last paragraph is the book's own, word for word (the first test).
      assert.ok(story[lang]?.trim(), `${where} ${lang} has words`);
    }
  }
  assert.deepEqual(off, [], off.join('\n'));
  // …and the game's passage reaches the 回's own end: the book file's last paragraph is its landing
  // (古七's 「他知道里头是谁。」 and 古八's 观主 sending him to the 漳水 were missing from the game outright).
  const short = [];
  for (const { hui, where, story } of ends) {
    for (const lang of ['zh', 'en']) {
      const last = bookLast(hui, lang);
      if (last && !landingKept(story[lang], last, lang)) short.push(`${where} ${lang}: the 回 ends 「${landingOf(last, lang).slice(0, 40)}」`);
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
