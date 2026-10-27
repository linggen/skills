// 主页 (Hanli 10-27): between passages the stage holds where the story stands and its gate — 「还差 324 修为 · 约 N 局」
// from the boards' own pay — the ONE thing to do next, ranked by the rules (rules/home.mjs), and what waits. Seeded saves:
// the 回's stage quest short (古四, 146/470), an errand ready to hand in, nothing left here today, mid-cooldown, a loss.
import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { playTo } from '../scripts/rules/progress.mjs';
import { look, move, quest, task } from '../scripts/rules.mjs';
import { homeOf, playsFor } from '../scripts/rules/home.mjs';
import { playGrant } from '../scripts/rules/playpay.mjs';
import { stageCards, stageSlots, withNext } from '../scripts/stage.mjs';
import { WORDS, cardHtml } from '../scripts/cards.js';

const content = loadContent();
const NOW = new Date('2026-10-27T07:00:00-03:00');
const WORKOUT = { id: 'health-workout', app: 'health', kind: 'body', period: 'day', reward: 20, due: true, title: { zh: '炼体 · 运动二十分钟以上', en: 'Workout' } };
const ctx = (quests = []) => ({ now: NOW, quests });
const told = (s) => ({ ...s, tell_owed: [], told_scenes: [...new Set([...(s.told_scenes ?? []), s.scene])] });

/* 古四 at 药园, its boards skipped, 146/470 — as Hanli's save stood; then walked to 外门 (the passages told). */
function gate146(at = 'waimen') {
  let s = playTo(content, newState(content, 'zh', NOW), 'wm-yaoyuan', { now: NOW, policy: 'skip' }).state;
  for (const c of content.chapters['00-waimen'].scenes['wm-yaoyuan'].show ?? []) if (c.card === 'board' && s.tasks?.[c.id]?.status !== 'done') s = task(s, content, ctx(), { action: 'skip', id: c.id }).state;
  if (at !== 'yaoyuan') s = move(s, content, ctx(), { place: at }).state;
  return told({ ...s, progress: 146, stamina: 100, stamina_at: NOW.toISOString() });
}
const html = (l) => cardHtml({ card: 'next' }, { look: l, words: WORDS.zh, lang: 'zh' });
/* The stage as the page lays it between passages: 兽潮 in the tray (lingjing.js), then 下一步/主页 where nothing else is to do. */
const mainOf = (l) => stageSlots(l, withNext(l, stageCards(l).filter((c) => !(c.card === 'board' && l.tasks?.find((t) => t.id === c.id)?.tide)))).main.map((c) => c.card);

test('the gate short: the bar, what it still asks with today\'s 功课 counted, and the best board here first', () => {
  const s = gate146(), l = look(s, content, ctx([WORKOUT]));
  const g = l.home.gate;
  assert.deepEqual([g.step, g.progress, g.of, g.short, g.chores], ['练气一层圆满', 146, 470, 324, 47]);
  assert.equal(g.plays, playsFor(content, s, l, 324 - 47, NOW), 'the boards for what the 功课 leaves');
  assert.ok(g.plays >= 10 && g.plays <= 16, `${g.plays} boards for 277 修为`);
  assert.deepEqual(l.home.next, { kind: 'board', id: 'pintu', title: l.tasks.find((t) => t.id === 'pintu').title, progress: 27 });
  assert.ok(l.home.todo.some((r) => r.kind === 'gongke' && r.progress === 47 && r.means === '练功'));
  const h = html(l);
  assert.match(h, /class="card next home"/);
  assert.match(h, new RegExp(`146/470 · 还差 324 修为 · 功课 \\+47 · 再约 ${g.plays} 局`));
  assert.match(h, /data-play="pintu"[^>]*>开局 · 拼图[^<]*· 修为 \+27</);
  assert.match(h, /练功 · 修为 \+47/);
  assert.doesNotMatch(h, /undefined|\{\w+\}/);
  // No 功课 today: the boards alone, the replay's falling share counted (17 at 古四, tests/play-pay).
  const bare = look(s, content, ctx());
  assert.equal(bare.home.gate.chores, undefined);
  assert.equal(bare.home.gate.plays, playsFor(content, s, bare, 324, NOW));
  assert.match(html(bare), new RegExp(`还差 324 修为 · 约 ${bare.home.gate.plays} 局`));
});

test('「约 N 局」 is the boards\' honest count: best first, each the replay share it pays that play, a day rolled when all are at the floor', () => {
  const s = gate146(), l = look(s, content, ctx());
  const need = 324, n = playsFor(content, s, l, need, NOW);
  // One board less leaves it short: the count is the least that fills it.
  assert.ok(n > 1);
  const pintu = playGrant(content, s, 'pintu', content.tasks.tasks.find((t) => t.id === 'pintu'), NOW).progress;
  assert.ok(n >= Math.ceil(need / pintu), 'never fewer than the best board at its full share could fill');
  assert.equal(playsFor(content, s, l, 0, NOW), 0);
});

test('standing in the gated scene: its ways held, the gate\'s own work here comes first — 接下 · 后山的野猪', () => {
  const s = gate146('yaoyuan'), l = look(s, content, ctx());
  assert.deepEqual(l.home.next, { kind: 'take', id: 'guan-houshan-yezhu', title: '后山的野猪' });
  assert.ok(!l.home.next.place, 'never the held way on');
});

test('an errand ready here: 交差 first, the stage quest met too', () => {
  let s = gate146();
  s = quest(s, content, ctx(), { action: 'take', id: 'xu-waimen-roof' }).state;
  s = { ...s, quests: { ...s.quests, 'xu-waimen-roof': { ...s.quests['xu-waimen-roof'], have: { 0: 1 } } } };
  const l = look(s, content, ctx());
  assert.deepEqual(l.home.next, { kind: 'turnin', id: 'xu-waimen-roof', title: '修屋顶' });
  assert.match(html(l), /data-do="turn" data-id="xu-waimen-roof"[^>]*>交差 · 修屋顶</);
  assert.ok(l.home.todo.some((r) => r.kind === 'ready' && r.n === 1));
  const met = look({ ...s, progress: 470 }, content, ctx());
  assert.equal(met.home.gate, null, 'met: no bar to fill');
  // The story's way open again comes first (rank 1); the stage quest waits in 待办's 可交.
  assert.deepEqual(met.home.next, { kind: 'way', place: { id: 'yaoyuan', name: '沉鼎观 · 药园' } });
  assert.ok(met.home.todo.some((r) => r.kind === 'ready' && r.n === 2 && r.title === '练气一层圆满'));
  const atGate = homeOf(content, s, { ...met, waypoint: null }, NOW);
  assert.deepEqual(atGate.next, { kind: 'turnin', stage: true, title: '练气一层圆满' });
  assert.match(html({ ...met, home: atGate }), /data-do="turn" data-id="stage"/);
});

test('nothing left here today: the board at its floor share, the errands done, 兽潮 shut — the next thing is elsewhere or to take; what waits says when', () => {
  let s = gate146();
  for (const id of ['xu-waimen-roof', 'xu-yaoyuan-shouye']) s = quest(s, content, ctx(), { action: 'take', id }).state;
  s = { ...s, plays: { day: '2026-10-27', ids: { pintu: 2 } }, shouchao: { ...(s.shouchao ?? {}), at: NOW.toISOString() },
    quests: Object.fromEntries(Object.entries(s.quests).map(([id, q]) => [id, { ...q, done_at: NOW.toISOString() }])) };
  const l = look(s, content, ctx());
  assert.notEqual(l.home.next.kind, 'board', JSON.stringify(l.home.next));
  assert.ok(['take', 'go', 'wait', 'seclude'].includes(l.home.next.kind), JSON.stringify(l.home.next));
  const wait = l.home.todo.find((r) => r.kind === 'wait' && r.id === 'shouchao');
  assert.ok(wait?.wait_min > 0, JSON.stringify(l.home.todo));
  assert.match(html(l), /兽潮[^<]*· \d+ 时 \d+ 分后/);
  assert.ok(l.home.gate.plays > 0, 'the bar still counts its boards — tomorrow\'s fresh ones');
  // An errand held out here stands its own card on arrival (stage.mjs `offer`); taken, the 主页 is what the stage holds.
  let t = s;
  for (const o of l.offers ?? []) t = quest(t, content, ctx(), { action: 'take', id: o.id }).state ?? t;
  t = { ...t, quests: Object.fromEntries(Object.entries(t.quests).map(([id, q]) => [id, { ...q, done_at: NOW.toISOString() }])) };
  const after = look(t, content, ctx());
  assert.deepEqual(mainOf(after), ['next'], JSON.stringify(stageCards(after)));
});

test('mid-cooldown with no work anywhere: the soonest wait, then 闭关', () => {
  let s = gate146();
  s = { ...s, plays: { day: '2026-10-27', ids: { pintu: 2 } }, shouchao: { ...(s.shouchao ?? {}), at: NOW.toISOString() } };
  const l = look(s, content, ctx());
  const bare = { ...l, offers: [], book: [], work: null, stage_quest: { ...l.stage_quest, work: null }, waypoint: null, tasks: l.tasks.filter((t) => !t.practice) };
  const h = homeOf(content, s, bare, NOW);
  assert.equal(h.next.kind, 'wait');
  assert.equal(h.next.id, 'shouchao');
  assert.deepEqual(homeOf(content, s, { ...bare, waits: [] }, NOW).next, { kind: 'seclude' });
  assert.equal(homeOf(content, s, { ...bare, waits: [], locked: ['seclusion'] }, NOW).next, null, 'nothing at all: no button, the bar and the list stand');
});

test('the order is the rules\': set aside → 接着读 before anything; a fight, 闭关 or a 今 scene stands no 主页', () => {
  const s = gate146(), l = look(s, content, ctx());
  assert.deepEqual(homeOf(content, s, { ...l, aside: { on: true, offers: [] } }, NOW).next, { kind: 'resume' });
  assert.equal(homeOf(content, s, { ...l, fight: { open: true } }, NOW), null);
  assert.equal(homeOf(content, s, { ...l, seclusion: {} }, NOW), null);
});

test('an old loss not in the way is a line at most; the button is what advances the goal (Hanli 10-27: 「这里提示去买东西是什么意思?」)', () => {
  let s = gate146();
  s = { ...s, bag: { ...s.bag, 'old-bow': 1 }, wear: {}, hunt_losses: { houshan: 1 } };
  const l = look(s, content, ctx());
  assert.equal(l.home.next.kind, 'board', JSON.stringify(l.home.next));
  const line = l.home.todo.find((r) => r.kind === 'strengthen');
  assert.equal(line?.way.kind, 'wear');
  assert.match(html(l), /data-home-way="todo"[^>]*>戴上 · /);
  assert.doesNotMatch(html(l), /data-home-way="next"/);
  // …and under it ONE fact line of what it does (Hanli 10-27: 「为什么要买东西? 能增强什么」), the same on Look for the phone.
  assert.match(line.way.line, /^爷爷的弓 · 法器 · 主灵根一击 \+2，借木/);
  assert.match(html(l), /<div class="homewhy"><span class="small dim">爷爷的弓 · 法器 · 主灵根一击 \+2，借木/);
});

test('a haunt lost to is never in the way: the fight is the button, the way to grow stronger a 待办 line (Hanli 10-27: 「这个买东西的按钮是什么意思?」)', () => {
  let s = gate146();
  for (const p of ['yaoyuan', 'houshan']) s = move(s, content, ctx(), { place: p }).state ?? s;
  s = told({ ...s, bag: { ...s.bag, 'old-bow': 1 }, wear: {}, hunt_losses: { houshan: 2 } });
  const l = look(s, content, ctx());
  assert.notEqual(l.home.next.kind, 'strengthen', JSON.stringify(l.home.next));
  assert.ok(l.home.todo.some((r) => r.kind === 'strengthen'), 'the way stays as a line');
});

test('short by what one thing pays: that thing is the button, named as enough — a 功课 before a board, an old loss never', () => {
  const LEDGER = { id: 'cfo-import', app: 'cfo', kind: 'ledger', period: 'week', pool: true, due: true, title: { zh: '导入账单', en: 'Import' } };
  let s = { ...gate146(), progress: 429, hunt_losses: { houshan: 1 }, bag: { ...gate146().bag, 'old-bow': 1 }, wear: {} };
  const l = look(s, content, ctx([LEDGER]));
  assert.equal(l.home.gate.short, 41);
  assert.deepEqual(l.home.next, { kind: 'gongke', id: 'cfo-import', title: '导入账单', means: '算账', progress: 94, enough: true });
  assert.match(html(l), /data-book>算账 · 修为 \+94 · 够了</);
  // No 功课 that covers it: the best board here, when it does (拼图 +27 for 20 short).
  const near = look({ ...s, progress: 450 }, content, ctx());
  assert.deepEqual([near.home.next.kind, near.home.next.id, near.home.next.enough], ['board', 'pintu', true]);
  assert.match(html(near), /data-play="pintu"[^>]*>开局 · 拼图[^<]*· 修为 \+27 · 够了</);
  // Short by more than either: the plain ranking.
  assert.equal(look({ ...s, progress: 146 }, content, ctx()).home.next.enough, undefined);
});

test('the page: the 主页 replaces 下一步, the bar grows from where it stood, 兽潮 waits in the tray', async () => {
  const fs = await import('node:fs');
  const page = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  assert.match(page, /\$\('focus'\)\.innerHTML = focusHtml\(slots\); moveHomeBar\(\);/);
  assert.match(page, /tideBoard\(c\.id\) && view\.opened\?\.id !== c\.id/);
  assert.match(page, /\['\[data-home-way\]', \(el\) => run\('home-way', \(\) => takeWay\(homeWayOf\(el\.dataset\.homeWay\)\)\)\]/);
  assert.match(page, /const homeWayOf = \(at\) => \(at === 'todo' \? look\?\.home\?\.todo\?\.find\(\(r\) => r\.kind === 'strengthen'\)\?\.way : look\?\.home\?\.next\?\.way\)/);
  const s = gate146(), l = look(s, content, ctx());
  const grown = cardHtml({ card: 'next' }, { look: l, words: WORDS.zh, lang: 'zh', homeFrom: 10 });
  assert.match(grown, /<i style="width:10%" data-to="31"><\/i>/, 'drawn where it stood, moved to now');
});

test('an errand done away from its giver stays in 待办, pointing at where it is handed in (后山的野猪 won, 周衡 at 药园)', () => {
  let s = gate146('yaoyuan');
  s = quest(s, content, ctx(), { action: 'take', id: 'guan-houshan-yezhu' }).state;
  s = { ...s, quests: { ...s.quests, 'guan-houshan-yezhu': { ...s.quests['guan-houshan-yezhu'], have: { 0: 1 } } } };
  s = told(move(s, content, ctx(), { place: 'houshan' }).state ?? s);
  const l = look(s, content, ctx());
  const row = l.home.todo.find((r) => r.id === 'guan-houshan-yezhu');
  assert.deepEqual([row?.kind, row?.place?.id, row?.done], ['held', 'yaoyuan', true], JSON.stringify(l.home.todo));
  assert.match(html(l), /data-go="yaoyuan"[^>]*>后山的野猪 · 药园</);
});

test('a board played once today is not the button: the 主页 never sends him straight back in (Hanli 10-27: 「拼图刚玩完, 又出来了」)', () => {
  const s = { ...gate146(), plays: { day: '2026-10-27', ids: { pintu: 1 } } };
  const l = look(s, content, ctx());
  assert.ok(!(l.home.next.kind === 'board' && l.home.next.id === 'pintu'), JSON.stringify(l.home.next));
});

test('at a sealed instance\'s door, walked off to 渡口: the 主页 says where the door is and what opens it, and where he stands (Hanli 10-27)', () => {
  let s = playTo(content, newState(content, 'zh', NOW), 'wm-mijing', { now: NOW }).state;
  s = told(move({ ...s, stamina: 100, stamina_at: NOW.toISOString() }, content, ctx(), { place: 'dukou' }).state);
  const l = look(s, content, ctx());
  assert.equal(l.door.place.id, 'shimen');
  assert.equal(l.door.met, false);
  const h = html(l);
  assert.match(h, new RegExp(`沉鼎秘境 · 石门 · ${l.door.step}即开`));
  assert.match(h, /还在门外 · 在渡口/);
  // The page's top line names where he stands, then the door (lingjing.js paint): never the scene's 「秘境石门前」 alone.
  assert.match(fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8'), /look\.door\.here \? door : `\$\{look\.place\?\.name \?\? ''\}　\$\{door\}`/);
});
