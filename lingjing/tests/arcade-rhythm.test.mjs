// 节奏 in the 游戏厅 (Hanli 10-22: 「让我在游戏大厅里可以看到玩家游戏的节奏」): each chapter's main line as the player
// meets it — what is read, what is played — 回 by 回 (worlds/jiuding/levels/rhythm.json, made by tools/arcade-rhythm.mjs
// from scripts/rhythm.mjs timelineOf, the walk the rhythm lint counts).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { RHYTHM_CAP, foldStretches, stretchesOf, timelineOf } from '../scripts/rhythm.mjs';
import { FIGHT_KIND, OUT, text } from '../tools/arcade-rhythm.mjs';

const TABLE = JSON.parse(fs.readFileSync(OUT, 'utf8'));
const REG = JSON.parse(fs.readFileSync(new URL('../worlds/jiuding/games.json', import.meta.url), 'utf8'));
const KAPAI = JSON.parse(fs.readFileSync(new URL('../worlds/jiuding/levels/kapai.json', import.meta.url), 'utf8'));
const content = loadContent();

test('the table is the main line\'s, never edited by hand: tools/arcade-rhythm.mjs makes it byte for byte', async () => {
  assert.equal(fs.readFileSync(OUT, 'utf8'), await text(), 'stale: node tools/arcade-rhythm.mjs');
});

test('timelineOf walks what stretchesOf counts: every chapter\'s reads sum to its stretches, one beat between two', () => {
  for (const ch of Object.values(content.chapters)) {
    const line = timelineOf(ch), st = stretchesOf(ch);
    const beats = line.filter((x) => !x.read);
    assert.equal(beats.length, st.length - 1, ch.id);
    assert.deepEqual(beats.map((b) => b.at), st.slice(0, -1).map((s) => s.to), ch.id);
    assert.equal(line.reduce((n, x) => n + (x.read ?? 0), 0), st.reduce((n, s) => n + s.chars, 0), ch.id);
    for (const b of beats) assert.ok(['board', 'fight', 'riddle', 'seen', 'breakthrough', 'piece'].includes(b.kind), `${ch.id} ${b.at} ${b.kind}`);
  }
});

test('timelineOf names each beat by what plays: boards in show order, the exit\'s one beat, a set piece after its passage', () => {
  const ch = {
    first_scene: 'a',
    scenes: {
      a: { story: { zh: '一二三' }, story_after: { zh: '四五' }, show: [{ card: 'board', id: 'b1' }, { card: 'board', id: 'b2' }], exits: [{ id: 'go', next: 'b' }] },
      b: { story: { zh: '甲乙\n{景=yaowang}丙\n丁' }, exits: [{ id: 'win', next: 'c', game: { kind: 'duel', creature: 'gui' }, key: 'seal', story: { zh: '戊' }, setpiece: { id: 'zhang' } }] },
      c: { story: { zh: '己' }, exits: [{ id: 'up', ends: true, breakthrough: true }, { id: 'look', next: 'a', needs: { seen: ['stone'] } }] },
    },
  };
  const beats = timelineOf(ch).filter((x) => !x.read).map((b) => `${b.kind}:${b.id}@${b.at}`);
  assert.deepEqual(beats, ['board:b1@a', 'board:b2@a:b2', 'piece:yaowang@b{景=yaowang}', 'fight:gui@b/win', 'piece:zhang@b/win', 'breakthrough:breakthrough@c/up']);
  assert.deepEqual(foldStretches(timelineOf(ch)).map((s) => s.chars), [3, 2, 3, 1, 1, 1, 0]);
});

const plays = () => TABLE.chapters.flatMap((c) => c.huis.flatMap((h) => h.items)).filter((x) => x.kind === 'board' || x.kind === 'fight');

test('`same` flags a board or fight of the kind the last one was (every fight 斗法), over the book in order', () => {
  let last = null;
  for (const it of plays()) {
    assert.equal(Boolean(it.same), it.mechanic === last, `${it.kind} ${it.id} ${it.mechanic} after ${last}`);
    if (it.kind === 'fight') assert.equal(it.mechanic, FIGHT_KIND);
    last = it.mechanic;
  }
});

test('a read is over the cap when its whole stretch is; a 回\'s counts and longest are its items\'', () => {
  assert.equal(TABLE.cap, RHYTHM_CAP);
  const runs = new Set(Object.values(content.chapters).flatMap((ch) => stretchesOf(ch).map((s) => s.chars)));
  for (const c of TABLE.chapters) for (const h of c.huis) {
    const reads = h.items.filter((x) => x.kind === 'read');
    for (const r of reads) { assert.equal(r.over, r.run > RHYTHM_CAP); assert.ok(r.chars <= r.run && runs.has(r.run), `${h.id} ${r.chars}/${r.run}`); }
    assert.equal(h.longest, Math.max(0, ...reads.map((r) => r.run)));
    for (const [k, n] of Object.entries(h.counts)) assert.equal(n, h.items.filter((x) => x.kind === k).length, `${h.id} ${k}`);
  }
});

test('every beat links to what plays it: a board to its games.json row, a 卷一 fight to its kapai foe', () => {
  for (const it of plays()) {
    if (it.kind === 'board') { assert.equal(REG.games[it.n]?.task, it.id, it.id); assert.ok(!REG.games[it.n].replaced, it.id); assert.equal(REG.games[it.n].mechanic, it.mechanic); }
    if (it.key) assert.ok(KAPAI.fights.some((f) => f.key === it.key && f.story), it.key);
    assert.ok(it.title.zh && it.title.en, `${it.kind} ${it.id}`);
  }
  const juan1 = TABLE.chapters.filter((c) => c.juan === 1).flatMap((c) => c.huis.flatMap((h) => h.items));
  for (const it of juan1.filter((x) => x.kind === 'fight')) assert.ok(it.key, `${it.id}: a 卷一 fight plays in the 游戏厅`);
  assert.deepEqual(TABLE.chapters.slice(0, 3).map((c) => c.id), ['00-prologue', '00-waimen', '00-zhuji']);
});
