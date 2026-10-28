// 节奏 in the 游戏厅 (Hanli 10-22: 「让我在游戏大厅里可以看到玩家游戏的节奏」): each chapter's main line as the player
// meets it — what is read, what is played — 回 by 回 (worlds/jiuding/levels/rhythm.json, made by tools/arcade-rhythm.mjs
// from scripts/rhythm.mjs timelineOf, the walk the rhythm lint counts).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { RHYTHM_CAP, foldStretches, stretchesOf, timelineOf } from '../scripts/rhythm.mjs';
import { FIGHT_KIND, OUT, text } from '../tools/arcade-rhythm.mjs';
import { dealOf } from '../scripts/rules/look.mjs';
import { fill as rainFill } from '../scripts/games/rain.js';
import { SPEEDS as DASH_SPEEDS } from '../scripts/games/dash.js';
const dashSpeed = (L) => (typeof L.speed === 'number' ? L.speed : DASH_SPEEDS[L.speed] ?? DASH_SPEEDS.normal);

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

test('`same` flags a board or fight of the variety the last one was (every fight 斗法; a 塔防 by its game — Hanli 10-22: 「塔防有多种子类型, 换着来就好了」), over the book in order', () => {
  let last = null;
  for (const it of plays()) {
    assert.equal(Boolean(it.same), it.variety === last, `${it.kind} ${it.id} ${it.variety} after ${last}`);
    if (it.kind === 'fight') assert.equal(it.variety, FIGHT_KIND);
    if (it.mechanic === '塔防') assert.equal(it.variety, `塔防·${it.game}`);
    last = it.variety;
  }
});

/* No board back to back with one of its own kind (Hanli 10-27, 嘀声 right after 卧推, both 气走经脉: 「这个小游戏连着出现,
   换一个」): a story board whose variety (`same`, above: the mechanic; a 塔防 by its game) is the last board's or fight's,
   in reading order, fails here — but for the pairs below, each kept for its reason. A new pair is a swap to make, not a
   row to add without one. */
const KEPT_PAIRS = {
  'jin-chat-ge>jin-chat-617': '今一, one scene (j01-anatomy): 古籍部 then 六一七 — two chats; the jinchat boards\' own pass',
  'hall-celing>zhoutian-sanguan': '第三回\'s last board, 第四回\'s first, both 几何冲刺 since 10-27 (each its own level, the second harder) — a 回 turns between',
  'baoming-yinyue>jin-chat-ma': '第四回\'s last chat (银月), 今二\'s first (马小宝\'s video) — a 回 and a line turn between; the jinchat boards\' own pass',
  'jin-chat-dark>jin-quxian': '今三: 闭关三日 (节奏, home-made) cut between them 2026-10-27 (Hanli: 「这个是你发明的吧, 去掉吧」); two chats until a classic board stands there again',
  'shiting-fanban>wangzuo-xiongya': '第五回: 凶崖 went 打地鼠 to hold the 调息 cap (2026-10-27; doc/games.md § 时机), a scene after 别踩第三块',
};
test('no story board follows one of its own kind in reading order (the kept pairs aside, each with its reason)', () => {
  let last = null;
  const met = [];
  for (const it of plays()) {
    if (it.kind === 'board' && it.same) met.push(`${last.id}>${it.id}`);
    last = it;
  }
  assert.deepEqual(met.filter((k) => !KEPT_PAIRS[k]), [], 'back to back with its own kind: swap one for another type');
  assert.deepEqual(Object.keys(KEPT_PAIRS).filter((k) => !met.includes(k)), [], 'a kept pair no longer back to back: drop it from KEPT_PAIRS');
});

/* No two 对话 word games of one kind back to back within a 回 (2026-10-27: almost every 古 chat had become a 灯谜 — 「先替我
   做决定」): the chats of a 回, in reading order, the boards between them aside, alternate 灯谜 · 对对子 · 成语接龙 · 二十问 —
   the kind the Chinese plays (jinchat-games.js kindOf). A pair kept here needs its reason. */
const KEPT_CHAT_PAIRS = {};
test('no two chats of one game kind back to back within a 回 (灯谜 · 对对子 · 成语接龙 · 二十问)', async () => {
  const { kindOf } = await import('../scripts/games/jinchat-games.js');
  const chats = REG.games.find((g) => g.id === 'jinchat' && !g.task).data.chats;
  const met = [], kinds = new Set();
  for (const c of TABLE.chapters) for (const h of c.huis) {
    const row = h.items.filter((x) => x.kind === 'board' && REG.games[x.n]?.id === 'jinchat').map((x) => ({ id: x.id, chat: chats[REG.games[x.n].data.chat] }));
    const games = row.filter((x) => x.chat?.game).map((x) => ({ id: x.id, kind: kindOf(x.chat.game, 'zh') }));
    for (const g of games) kinds.add(g.kind);
    for (let i = 1; i < games.length; i++) if (games[i].kind === games[i - 1].kind) met.push(`${games[i - 1].id}>${games[i].id}`);
  }
  assert.deepEqual(met.filter((k) => !KEPT_CHAT_PAIRS[k]), [], 'two of a kind back to back in a 回: give one another classic');
  assert.deepEqual(Object.keys(KEPT_CHAT_PAIRS).filter((k) => !met.includes(k)), []);
  for (const k of ['riddle', 'couplet', 'chain', 'guess']) assert.ok(kinds.has(k), `${k} in the book`);
});

/* Never the same level twice, and the climb goes on (Hanli 10-27: 「最好小游戏关卡不重复, 比如古线玩过的关卡, 到今线换一个关卡,
   游戏类型不变」 · 「游戏难度可以延续, 因为玩家在古线已经熟悉了小游戏, 后面可以适当难一些」): along the main line, 古 · 今 as
   one reading, each story board deals what look.mjs deals it (dealOf). Its layout — the level less its words, art and id —
   is never one an earlier board dealt; and a kit's pace (CLIMB) never eases from one board of it to the next. */
const WORDS = new Set(['id', 'n', 'name', 'title', 'how', 'say', 'end', 'book', 'lines', 'art', 'look', 'words', 'grades', 'story', 'ready', 'start', 'won', 'row', 'solved', 'spots', 'item']);
const layout = (v) => (Array.isArray(v) ? v.map(layout) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k]) => !WORDS.has(k)).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, layout(x)])) : v);
const boardsInOrder = () => plays().filter((x) => x.kind === 'board').map((it) => {
  const task = content.tasks.tasks.find((t) => t.id === it.id);
  const deal = dealOf(content, task, { lang: 'zh' }).deal ?? {};
  return { id: it.id, game: task.game, levels: deal.levels ?? null, deal };
});
/* What may climb, per kit: numbers that only ever fall (a gap, a beat) or only ever rise, read off the level as played. */
const CLIMB = {
  rain: (L) => { const f = rainFill(L); return { fall: { gapEnd: f.gap[1], beatEnd: f.beat[1], three: f.three, jit: f.jit, teach: f.teach } }; },
  // 气走经脉: the channel's speed (its things — 礁石 and the pickups — are each level's own, laid in story order)
  qimai: (L) => ({ rise: { speed: L.speed ?? 90 } }),
  // 几何冲刺: the run's speed and its beat (the things' types come in by story order: tests/dash.test.mjs)
  dash: (L) => ({ rise: { speed: dashSpeed(L), bpm: L.bpm ?? 120 } }),
  // 太鼓 · 抚琴: the beat and the windows (OD) — 太鼓's strokes a beat (div) too
  taiko: (L) => ({ rise: { bpm: L.bpm, div: L.div ?? 2, od: L.od ?? 5 } }),
  fuqin: (L) => ({ rise: { bpm: L.bpm, od: L.od ?? 5 } }),
};
test('no story board deals a level an earlier one dealt (古 and 今 alike): the same type, never the same layout', () => {
  const seen = new Map();
  for (const b of boardsInOrder()) {
    const key = `${b.game}:${JSON.stringify(b.levels ? b.levels.map((l) => [layout(l), l.spots?.length ?? null]) : layout(b.deal))}`;
    assert.ok(!seen.has(key), `${b.id} deals the layout ${seen.get(key)} dealt (${b.game}): give it its own`);
    seen.set(key, b.id);
  }
});
test('a kit\'s pace never eases along the story: each board of it as hard as the last, or harder (CLIMB)', () => {
  const last = {};
  for (const b of boardsInOrder()) {
    const climb = CLIMB[b.game];
    if (!climb) continue;
    const now = climb(b.levels?.[0] ?? null);
    const was = last[b.game];
    if (was) for (const [k, v] of Object.entries(now.fall ?? {})) assert.ok(v <= was.at.fall[k], `${b.id}: ${b.game} ${k} ${v} eases after ${was.id}'s ${was.at.fall[k]}`);
    if (was) for (const [k, v] of Object.entries(now.rise ?? {})) assert.ok(v >= was.at.rise[k], `${b.id}: ${b.game} ${k} ${v} eases after ${was.id}'s ${was.at.rise[k]}`);
    last[b.game] = { id: b.id, at: now };
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
