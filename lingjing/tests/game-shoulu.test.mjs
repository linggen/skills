// 守炉 · tower defense — the level rows (games.json `shoulu`) are sound, each level brings one new
// thing and climbs, waves come on their own, 银月 goes where she's sent and holds the road, and the
// balance holds for a human: the levels are tuned for `human` (core.js — a sensible plan, 1–2 s late,
// 银月 moved now and then, her skills late), not the perfect bots (Hanli 10-20: a game no open-source
// game's players have proven must lean gentle). The optimal bot (`mixed`) still loses a little fire late;
// no build loses everywhere; the counters (犰狳 vs 剑阵, 鬿雀 vs 火符) still bite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { ARMOR, BEASTS, HERO, SKILLS, TOWERS, beastsOf, humanBot, starsFor, build, upgrade, upgradeCost, callWave, cast, countAt, difficultyOf, heroOf, human, layLevel, levelsFrom, newGame, noSel, offRoad, orderAttack, orderMove, pointer, pressKey,
  keepSel, posOnPath, sendHero, sim, STRATS, skillState, spawnAt, step, toggleAuto, waves } from '../scripts/games/shoulu/core.js';
import { ladderOf, leadSplit, levelAsked, levelAt, meta, nextLv, towerName } from '../scripts/games/shoulu.js';

const reg = JSON.parse(readFileSync(new URL('../worlds/jiuding/games.json', import.meta.url), 'utf8'));
const row = reg.games.find((g) => g.id === 'shoulu' && g.levels);
const all = levelsFrom(row);
const levels = ladderOf(all); // the 游戏厅's ladder; the story levels (a `story` scene) stand after it
const stories = all.filter((l) => l.story);
const creatures = new Set(JSON.parse(readFileSync(new URL('../worlds/jiuding/creatures.json', import.meta.url), 'utf8')).creatures.map((c) => c.id));
const places = new Set(['ji', 'jing', 'liang', 'qing', 'xu', 'yan', 'yang', 'yong', 'yu'].flatMap((p) => JSON.parse(readFileSync(new URL(`../worlds/jiuding/places/${p}.json`, import.meta.url), 'utf8')).places.map((x) => x.id)));
const SEEDS = ['a', 'b', 'c', 'd', 'e'];

test('registered: meta, the row in the 游戏厅, five levels', () => {
  assert.equal(meta.id, 'shoulu');
  assert.ok(meta.name.en && meta.how.zh && meta.how.en);
  assert.equal(row.mechanic, '塔防');
  assert.ok(reg.groups.some((g) => g.id === row.group));
  assert.equal(levels.length, 5);
  assert.equal(levelAsked({}, '?dev=1&game=shoulu&lv=3'), 3);
  assert.equal(levelAsked({ lv: 2 }, '?lv=5'), 2);
  assert.equal(levelAt(all, levelAsked({}, '?lv=x')), -1, 'no such level: the select');
  assert.equal(levelAsked({}, '?lv=0'), 0);
});

test('in the one shell: its bar pauses the play; each level\'s story is the lead card, the banner and tips stay on the board', () => {
  assert.equal(meta.pause, true);
  for (const r of all) {
    const { said, rest } = leadSplit(r.lead, 'zh');
    assert.ok(said.length > 0, `${r.id}: a story line for the lead card`);
    assert.ok(rest[0]?.big, `${r.id}: the 兽潮来袭 banner opens what stays on the board`);
    assert.ok(!said.includes(rest[0].zh), r.id);
    assert.match(leadSplit(r.lead, 'en').said, / /, `${r.id}: English lines joined by a space`);
  }
  assert.deepEqual(leadSplit(undefined), { said: '', rest: [] });
});

test('every level is sound: its road, its spots, its furnace, its words, 卷一 beasts and places', () => {
  for (const r of all) {
    const L = layLevel(r);
    assert.ok(r.story === null || typeof r.story === 'string', r.id);
    assert.ok(places.has(r.place), `${r.id}: place ${r.place}`);
    assert.ok(r.name.zh && r.name.en && r.lead.length >= 3 && r.lead.every((l) => l.zh && l.en), r.id);
    assert.ok(r.lead.some((l) => l.big), `${r.id}: the 兽潮来袭 banner`);
    const [sx, sy] = r.road[0];
    assert.ok(sx < 0 || sx > 600 || sy < 0, `${r.id}: the road comes in from off the board`);
    const end = r.road.at(-1);
    assert.ok(Math.hypot(end[0] - r.furnace[0], end[1] - r.furnace[1]) <= 40, `${r.id}: the road ends at the furnace`);
    for (const [x, y] of r.spots) {
      const d = offRoad(L.road, x, y);
      assert.ok(d >= 40 && d <= 95, `${r.id}: spot ${x},${y} is ${Math.round(d)} off the road`);
      assert.ok(x >= 22 && x <= 578 && y >= 70 && y <= 738, `${r.id}: spot ${x},${y} on the board`);
      assert.ok(Math.hypot(x - r.furnace[0], y - r.furnace[1]) > 60, `${r.id}: spot ${x},${y} clear of the furnace`);
    }
    r.spots.forEach(([x, y], i) => r.spots.slice(i + 1).forEach(([x2, y2]) => assert.ok(Math.hypot(x - x2, y - y2) >= 50, `${r.id}: spots ${x},${y} and ${x2},${y2} apart`)));
    for (const b of beastsOf(r)) { assert.ok(BEASTS[b], `${r.id}: beast ${b}`); assert.ok(creatures.has(b), `${r.id}: ${b} in creatures.json`); }
    assert.ok(r.towers.every((k) => TOWERS[k]));
    if (beastsOf(r).some((b) => BEASTS[b].fly)) assert.ok(r.air, `${r.id}: fliers need a start`);
  }
  assert.ok(!all.some((r) => beastsOf(r).includes('kuiniu')), '夔牛 is 卷七: not in 卷一');
});

test('each level brings exactly one new beast, in the order 野猪 → 狰 → 犰狳 → 鬿雀 → 合窳, and its answer', () => {
  const order = ['yezhu', 'zheng', 'qiuyu', 'qique', 'heyu'];
  const towers = [['jian', 'huo'], ['jian', 'huo', 'han'], ['jian', 'huo', 'han'], ['jian', 'huo', 'han', 'lei'], ['jian', 'huo', 'han', 'lei']];
  let seen = new Set();
  levels.forEach((r, i) => {
    const now = new Set(beastsOf(r)), fresh = [...now].filter((b) => !seen.has(b));
    assert.deepEqual(fresh, [order[i]], `${r.id}: new beasts`);
    assert.equal(r.new.beast, order[i]);
    assert.deepEqual([...r.towers].sort(), [...towers[i]].sort(), `${r.id}: towers`);
    seen = new Set([...seen, ...now]);
  });
  assert.equal(levels[3].unlock.lei, 3, '雷符 opens on 后山 from wave 3');
  assert.ok(beastsOf(levels[4]).filter((b) => BEASTS[b].boss).length === 1 && levels[4].waves.at(-1).some(([b]) => b === 'heyu'), '合窳 in the last wave');
  const n = levels.map((r) => r.waves.length);
  assert.ok(n.every((x, i) => i === 0 || x >= n[i - 1]), `wave counts climb: ${n}`);
});

test('waves start on the countdown, never by a tap; calling early pays', () => {
  const g = newGame(levels[0], { seed: 's', headless: true });
  assert.equal(g.wave, 0);
  for (let t = 0; t < g.L.first - 0.5; t += 0.1) step(g, 0.1);
  assert.equal(g.wave, 0, 'not before the lead-in ends');
  for (let t = 0; t < 1; t += 0.1) step(g, 0.1);
  assert.equal(g.wave, 1, 'wave 1 came by itself');
  const h = newGame(levels[0], { seed: 's', headless: true });
  const money = h.money, bonus = callWave(h, true);
  assert.equal(h.wave, 1);
  assert.ok(bonus > 0 && h.money === money + bonus, 'an early call pays');
});

test('银月 goes where she is sent, and holds two ground beasts there', () => {
  const g = newGame(levels[0], { seed: 'h', headless: true });
  const [x, y] = levels[0].road[2];
  assert.ok(sendHero(g, x, y));
  for (let t = 0; t < 10; t += 1 / 30) step(g, 1 / 30);
  assert.deepEqual([g.hero.post.x, g.hero.post.y], [x, y], 'it is her post now');
  assert.ok(Math.hypot(g.hero.x - x, g.hero.y - y) <= HERO.wander + 3, 'she is there (wandering a little)');
  callWave(g);
  let held = 0;
  for (let t = 0; t < 40 && !g.over; t += 1 / 30) { step(g, 1 / 30); held = Math.max(held, g.hero.held.length); }
  assert.equal(held, HERO.block, 'she held the road');
  assert.ok(g.stats.kills > 0, 'and bit');
});

/* The balance. The bots: every seed of a–e agrees. */
const run = (r, s, seeds = SEEDS) => seeds.map((seed) => sim(r, s, { seed }));
const allWin = (rs) => rs.every((x) => x.result === 'win');
const allLose = (rs) => rs.every((x) => x.result === 'lose');
levels.forEach((r, i) => {
  test(`balance L${i + 1} ${r.id}: mixed wins, none loses; the mono builds struggle`, () => {
    const mixed = run(r, 'mixed');
    assert.ok(allWin(mixed), `mixed: ${mixed.map((x) => `${x.result}@${x.wave}`)}`);
    assert.ok(allLose(run(r, 'none')), 'none loses');
    const jian = run(r, 'jian');
    // L1–L2 are gentle enough that 剑阵 alone can scrape through; never cleanly, and never as well as a mixed build
    const mean = (rs) => rs.reduce((a, x) => a + x.hp, 0) / rs.length;
    if (i < 2) assert.ok(mean(jian) < mean(mixed) - 1.5, `剑阵 alone: ${jian.map((x) => x.hp)}`);
    else assert.ok(allLose(jian), '剑阵 alone loses');
    if (i > 0) assert.ok(allLose(run(r, 'huo')), '火符 alone loses');
  });
});
test('balance climbs: the mixed build keeps the most fire on L1, less on L4 and L5', () => {
  const hp = levels.map((r) => Math.min(...run(r, 'mixed').map((x) => x.hp)));
  assert.ok(hp[0] >= 8 && hp[0] >= Math.max(...hp), `L1 is the tutorial, the most fire kept: ${hp}`);
  assert.ok(hp[4] < hp[0] && hp[3] < hp[0], `the late levels are harder: ${hp}`);
});
test('the counters: 犰狳 levels beat 剑阵 alone; 鬿雀 levels beat 火符 alone at once', () => {
  for (const i of [2, 3, 4]) assert.ok(beastsOf(levels[i]).includes('qiuyu') && allLose(run(levels[i], 'jian')));
  for (const i of [3, 4]) assert.ok(run(levels[i], 'huo').every((x) => x.leaks.qique > 0));
  assert.equal(waves(newGame(levels[4], { headless: true })), levels[4].waves.length);
});

/* The balance a person feels: the human-like bot over twenty seeds. */
const SEEDS20 = Array.from({ length: 20 }, (_, i) => `h${i}`);
const share = (rs, f) => rs.filter(f).length / rs.length;
const TARGET = [ // win share at least · and what its stars look like
  // ★★★ needs the 炉火 whole AND a clear by the level's par (Hanli 10-21: 结印's help) — without casts ★★ is typical
  { win: 0.95, ok: (rs) => share(rs, (x) => x.stars >= 2) >= 0.9, says: 'nearly always, ★★ or better' },
  { win: 0.85, ok: (rs) => share(rs, (x) => x.stars >= 2) >= 0.6, says: '≥85%, usually 2–3★' },
  { win: 0.85, ok: (rs) => share(rs, (x) => x.stars >= 2) >= 0.6, says: '≥85%, usually 2–3★' },
  { win: 0.75, ok: (rs) => share(rs, (x) => x.stars === 3) <= 0.5, says: '≥75%, 1–2★ typical' },
  { win: 0.65, ok: (rs) => share(rs, (x) => x.stars === 3) <= 0.5 && rs.reduce((a, x) => a + x.hp, 0) / rs.length <= 8, says: '≥65%, a real fight' },
];
levels.forEach((r, i) => {
  test(`a human's balance L${i + 1} ${r.id}: ${TARGET[i].says}`, () => {
    const rs = run(r, 'human', SEEDS20), T = TARGET[i];
    const line = `win ${Math.round(share(rs, (x) => x.result === 'win') * 100)}%, ★ ${rs.map((x) => x.stars).join('')}`;
    assert.ok(share(rs, (x) => x.result === 'win') >= T.win, line);
    assert.ok(T.ok(rs), line);
  });
});
// L5's bar is a little lower since the wider ranges (Hanli 10-20: 「怪物露头就可以开打了」): the optimal bot covers nearly
// the whole road, and hp enough to make it bleed more would sink the human bot below ~85%. It still loses fire in about a quarter.
test('the optimal bot still loses a few 炉火 on L4 and L5', () => {
  for (const [i, top, some] of [[3, 9.5, 0.25], [4, 9.8, 0.2]]) {
    const rs = run(levels[i], 'mixed', SEEDS20), mean = rs.reduce((a, x) => a + x.hp, 0) / rs.length;
    assert.ok(allWin(rs) && mean <= top && share(rs, (x) => x.hp < 10) >= some, `L${i + 1} mixed: ${rs.map((x) => x.hp)}`);
  }
});
test('the human bot is a human: late, never calls a wave early, moves 银月 now and then', () => {
  let early = 0, moves = 0, post = null;
  const r = sim(levels[2], (g) => { const w = g.wave, m = g.money; human(g); if (g.wave > w) early += 1; if (post && (post.x !== g.hero.post.x || post.y !== g.hero.post.y)) moves += 1; post = { ...g.hero.post }; }, { seed: 'h0' });
  assert.equal(early, 0, 'no wave called');
  assert.ok(moves >= 1 && moves <= r.time / 6, `moves: ${moves} in ${r.time} s`);
  // a build waits a beat after it can be afforded
  const g = newGame(levels[0], { seed: 'late', headless: true });
  human(g);
  assert.equal(g.towers.filter(Boolean).length, 0, 'not on the first look');
  for (let t = 0; t < 0.9; t += 0.25) { step(g, 0.25); human(g); }
  assert.equal(g.towers.filter(Boolean).length, 0, 'not within a second');
  for (let t = 0; t < 1.5; t += 0.25) { step(g, 0.25); human(g); }
  assert.ok(g.towers.filter(Boolean).length >= 1, 'built within two');
});

/* The difficulty knob: data only — a level's `difficulty` × the row's, on beasts' hp and count. */
test('difficulty: default 1; a level\'s and the row\'s multiply; hp and count scale, a boss stays one', () => {
  assert.equal(row.difficulty ?? 1, 1, 'the game is tuned at 1');
  assert.ok(levels.every((l) => difficultyOf(l) === 1), 'every level at 1');
  assert.equal(difficultyOf({}), 1);
  assert.ok(Math.abs(difficultyOf(levelsFrom({ difficulty: 1.5, levels: [{ difficulty: 0.8 }] })[0]) - 1.2) < 1e-9);
  assert.equal(countAt('yezhu', 10, 0.7), 7);
  assert.equal(countAt('yezhu', 1, 0.3), 1, 'never none');
  assert.equal(countAt('heyu', 1, 2), 1, 'a boss stays one');
  const queued = (l) => { const g = newGame(l, { headless: true }); callWave(g); return g.queue.length; };
  const base = levels[4], easy = { ...base, difficulty: 0.7 }, hard = levelsFrom({ ...row, difficulty: 1.5 })[4];
  assert.ok(queued(easy) < queued(base) && queued(hard) > queued(base), `${queued(easy)} < ${queued(base)} < ${queued(hard)}`);
  const hp = (l) => spawnAt(newGame(l, { headless: true }), 'heyu').max;
  assert.equal(hp(easy), Math.round(hp(base) * 0.7));
  assert.equal(hp(hard), Math.round(hp(base) * 1.5));
  const last = (l) => { const g = newGame(l, { headless: true }); g.wave = l.waves.length - 1; callWave(g); return g.queue.filter((q) => q.type === 'heyu').length; };
  assert.equal(last(hard), 1, 'one 合窳 at any difficulty');
  const win = (l) => share(run(l, 'human', SEEDS20.slice(0, 8)), (x) => x.result === 'win');
  assert.ok(win({ ...base, difficulty: 1.4 }) < win(base), 'harder is harder for a person');
});

/* 银月 as a 魔兽争霸 hero: orders, her post, the leash, her four skills, the selection. */
const STEP = 1 / 30;
const run_ = (g, s) => { for (let t = 0; t < s; t += STEP) step(g, STEP); };
// a quiet board: L1 with no waves coming, 银月 at her post
const quiet = (i = 0) => { const g = newGame(levels[i], { seed: 'q', headless: true }); g.nextTimer = 1e9; g.L = { ...g.L, waves: [...g.L.waves] }; return g; };
const still = (g, type, d) => { const b = spawnAt(g, type, d); b.speed = 0; return b; };
const near = (g, b) => Math.hypot(g.hero.x - b.x, g.hero.y - b.y);

test('hero: a move order goes and makes a guard post; shift queues the next', () => {
  const g = quiet();
  assert.ok(orderMove(g, 100, 300));
  assert.ok(orderMove(g, 140, 420, true), 'queued');
  assert.equal(g.hero.orders.length, 2);
  run_(g, 8);
  assert.deepEqual(g.hero.post, { x: 140, y: 420 }, 'the last one is her post');
  assert.equal(g.hero.orders.length, 0);
  orderMove(g, 300, 300); orderMove(g, 500, 300);
  assert.equal(g.hero.orders.length, 1, 'without shift an order replaces the last');
});

// a road point at a distance from her post (the first such, coming down the road)
const dAt = (g, lo, hi, from = g.hero.post) => {
  for (let d = 0; d < g.L.road.len; d += 1) { const p = posOnPath(g.L.road, d), dd = Math.hypot(p.x - from.x, p.y - from.y); if (dd >= lo && dd <= hi) return d; }
  throw new Error(`no road ${lo}–${hi} from her`);
};

test('hero: an attack order chases its beast and bites it to death; a flier can\'t be ordered', () => {
  const g = quiet();
  const b = still(g, 'yezhu', dAt(g, 150, 200));
  assert.ok(near(g, b) > HERO.acquire, 'out of her sight');
  assert.ok(orderAttack(g, b));
  run_(g, 15);
  assert.ok(b.dead, 'she ran it down');
  const post0 = { ...quiet().hero.post };
  assert.deepEqual(g.hero.post, post0, 'her post stays where it was');
  run_(g, 8);
  assert.ok(Math.hypot(g.hero.x - post0.x, g.hero.y - post0.y) <= HERO.wander + 3, 'and she goes back to it');
  const g2 = quiet(), far = still(g2, 'yezhu', dAt(g2, 290, 330));
  assert.ok(orderAttack(g2, far)); step(g2, STEP);
  assert.equal(g2.hero.orders[0]?.b, far, 'a far click is still her order');
  const bird = still(g, 'yezhu', 5); bird.fly = true;
  assert.equal(orderAttack(g, bird), false);
});

test('hero: she engages a ground beast inside her sight (`acquire`), not before, and walks home past the leash', () => {
  const g = quiet(), h = g.hero;
  const p0 = posOnPath(g.L.road, 300); // a post on 石坳's long top straight: the road runs on past the leash
  h.x = h.post.x = p0.x; h.y = h.post.y = p0.y;
  const post = { ...h.post };
  const far = still(g, 'yezhu', dAt(g, HERO.acquire + 20, HERO.acquire + 40)); far.hp = far.max = 1e6;
  run_(g, 2);
  assert.equal(h.foe, null, `${Math.round(near(g, far))} away: not yet`);
  far.speed = 30; // it walks on, into her sight
  let met = false;
  for (let t = 0; t < 4 && !met; t += STEP) { step(g, STEP); if (h.foe === far) met = Math.hypot(far.x - post.x, far.y - post.y) <= HERO.acquire + 1; }
  assert.ok(met, `engaged inside ${HERO.acquire}`);
  // it bounds away down the road (unheld): she follows, then gives up past the leash and goes home
  far.speed = 100;
  let homed = false;
  for (let t = 0; t < 30 && !homed; t += STEP) {
    far.held = false; h.held = []; step(g, STEP);
    if (h.homing) homed = true;
    assert.ok(Math.hypot(h.x - post.x, h.y - post.y) <= HERO.leash + 5, 'never far past the leash');
  }
  assert.ok(homed, 'she turned for home');
  far.dead = true;
  run_(g, 6);
  assert.ok(Math.hypot(h.x - post.x, h.y - post.y) <= HERO.wander + 3, 'back at her post');
});

test('hero: idle, she wanders a little around her post (and sniffs, sits, flicks her tail)', () => {
  const g = quiet(), h = g.hero, acts = new Set();
  let far = 0;
  for (let t = 0; t < 60; t += STEP) { step(g, STEP); far = Math.max(far, Math.hypot(h.x - h.post.x, h.y - h.post.y)); if (h.act) acts.add(h.act.k); }
  assert.ok(far > 4 && far <= HERO.wander + 0.5, `wandered ${far.toFixed(1)}`);
  assert.ok(acts.size >= 2, [...acts].join());
});

test('Q 啸月: stuns and hurts the crowd around her, then cools; autocast toggles', () => {
  const g = quiet(), h = g.hero;
  h.cds.q = 0; toggleAuto(g, 'q');
  assert.equal(h.auto.q, false, 'autocast off');
  run_(g, 1);
  const d = dAt(g, 0, 40), bs = [0, 1, 2].map(() => still(g, 'yezhu', d));
  assert.equal(skillState(g, 'q').ready, true, 'autocast off: it waited');
  const hp0 = bs[0].hp;
  assert.ok(cast(g, 'q'));
  assert.ok(bs.every((b) => b.stunT > 0) && bs[0].hp < hp0, 'stunned and hurt');
  assert.equal(skillState(g, 'q').ready, false);
  assert.equal(cast(g, 'q'), false, 'cooling');
  assert.equal(skillState(g, 'q').cd, SKILLS.q.cd);
  toggleAuto(g, 'q');
  assert.equal(h.auto.q, true);
  assert.equal(toggleAuto(g, 'w'), false, 'only 啸月 has autocast');
});

test('W 月影扑: locked before 二重; a dash nothing can bite, the strike on landing, then the cooldown', () => {
  const g = quiet(), h = g.hero;
  const b = still(g, 'yezhu', dAt(g, HERO.acquire + 10, SKILLS.w.range - 10)); b.hp = b.max = 1000; // out of her sight, in the dash's
  assert.equal(skillState(g, 'w').locked, true);
  assert.equal(cast(g, 'w', { b }), false, 'locked at 一重');
  h.lvl = 1;
  const biter = still(g, 'qiuyu', dAt(g, 0, 10)); biter.hp = biter.max = 1e6;
  run_(g, 0.2);
  assert.ok(h.held.includes(biter), 'held, and biting her');
  const hp0 = b.hp, hhp = h.hp;
  assert.ok(cast(g, 'w', { b }));
  assert.ok(h.dash, 'dashing');
  while (h.dash) { step(g, STEP); assert.ok(h.hp >= hhp - 0.001, 'untouched in the dash'); }
  assert.ok(hp0 - b.hp >= SKILLS.w.dmg[1], `struck on landing: ${hp0 - b.hp}`);
  assert.ok(near(g, b) < HERO.reach, 'she landed on it');
  assert.equal(cast(g, 'w', { b }), false, 'cooling');
  assert.ok(skillState(g, 'w').cd > SKILLS.w.cd - 1);
});

test('E 狐火: locked before 三重; a patch that burns the beasts walking through it', () => {
  const g = quiet(), h = g.hero;
  const b = still(g, 'qiuyu', dAt(g, HERO.acquire + 10, SKILLS.e.range - 10)); b.hp = b.max = 1e6; // out of her sight
  h.lvl = 1;
  assert.equal(cast(g, 'e', { x: b.x, y: b.y }), false, 'locked at 二重');
  h.lvl = 2;
  h.auto.q = false;
  assert.ok(cast(g, 'e', { x: b.x, y: b.y }));
  assert.equal(g.fires.length, 1);
  const hp0 = b.hp;
  h.foe = null; orderMove(g, h.x, h.y); // she keeps out of it
  run_(g, 1);
  assert.ok(hp0 - b.hp >= SKILLS.e.dps * 0.9 * 0.99, `burnt ${hp0 - b.hp}`);
  assert.equal(cast(g, 'e', { x: b.x, y: b.y }), false, 'cooling');
  run_(g, SKILLS.e.dur);
  assert.equal(g.fires.length, 0, 'it burns out');
  const left = b.hp;
  run_(g, SKILLS.e.burn + 0.2);
  const after = b.hp;
  run_(g, 1);
  assert.ok(left > after && after === b.hp, 'the burn lingers a moment, then stops');
});

test('R 狐毛: charges from the level row; armor and 护体灵光 off for a while', () => {
  assert.deepEqual(levels.map((r) => heroOf(r).hair), [0, 0, 0, 0, 2], 'only 黑松岭 has 狐毛 (古五 on)');
  assert.deepEqual(heroOf({ hero: [1, 2] }), { at: [1, 2], hair: 0 }, 'the old row shape still reads');
  const g1 = quiet();
  assert.equal(cast(g1, 'r', { b: still(g1, 'qiuyu', dAt(g1, 0, 60)) }), false, 'no charges on L1');
  const g = quiet(4), h = g.hero;
  h.auto.q = false;
  assert.equal(skillState(g, 'r').charges, 2);
  const a = still(g, 'qiuyu', dAt(g, 150, 170)), boss = still(g, 'heyu', dAt(g, 150, 170));
  a.hp = a.max = boss.hp = boss.max = 1e6; boss.cry = 1e9;
  const sword = (t) => g.proj.push({ k: 'sword', x: t.x, y: t.y, t, lx: t.x, ly: t.y, speed: 1, dmg: 10, ang: 0 });
  const cut = () => { const hp = [a.hp, boss.hp]; sword(a); sword(boss); step(g, STEP); return [hp[0] - a.hp, hp[1] - boss.hp]; };
  const before = cut();
  assert.ok(Math.abs(before[0] - 10 * ARMOR) < 0.01 && Math.abs(before[1] - 10 * BEASTS.heyu.cry.guard) < 0.01, `armored: ${before}`);
  assert.ok(cast(g, 'r', { b: a }));
  assert.equal(h.hair, 1);
  assert.ok(a.bareT > 0 && boss.bareT > 0, 'both in the circle');
  const bare = cut();
  assert.ok(Math.abs(bare[0] - 10) < 0.01 && Math.abs(bare[1] - 10) < 0.01, `bare: ${bare}`);
  assert.equal(cast(g, 'r', { b: a }), false, 'a short cooldown between charges');
  run_(g, SKILLS.r.cd);
  assert.ok(cast(g, 'r', { b: a }));
  assert.equal(h.hair, 0);
  run_(g, SKILLS.r.cd);
  assert.equal(cast(g, 'r', { b: a }), false, 'out of charges');
  run_(g, SKILLS.r.dur);
  assert.ok(!(a.bareT > 0), 'it wears off');
  assert.ok(Math.abs(cut()[0] - 10 * ARMOR) < 0.01);
});

test('selection: she stays selected through her orders; the phone\'s tap-tap; 1 / F1; Esc; death', () => {
  const g = quiet(), h = g.hero;
  const at = { x: h.x, y: h.y - 20 };
  // the phone: tap her, then each tap is a new order, she stays selected; tap her again to let go
  let r = pointer(g, noSel(), { ...at, button: 0, touch: true });
  assert.equal(r.sel.hero, true);
  r = pointer(g, r.sel, { x: 300, y: 300, button: 0, touch: true });
  assert.equal(r.did, 'move'); assert.equal(r.sel.hero, true, 'still selected');
  r = pointer(g, r.sel, { x: 320, y: 320, button: 0, touch: true });
  assert.equal(r.did, 'move'); assert.equal(h.orders.at(-1).x, 320);
  const b = still(g, 'yezhu', 300);
  r = pointer(g, r.sel, { x: b.x, y: b.y - 4, button: 0, touch: true });
  assert.equal(r.did, 'attack'); assert.equal(r.sel.hero, true);
  r = pointer(g, r.sel, { x: h.x, y: h.y - 20, button: 0, touch: true });
  assert.equal(r.sel.hero, false, 'tap her again: deselected');
  // the Mac: right-click orders and keeps her selected; left-click on empty ground lets go; a spot takes the selection
  r = pointer(g, { hero: true, spot: -1, aim: null }, { x: 200, y: 300, button: 2 });
  assert.equal(r.did, 'move'); assert.equal(r.sel.hero, true);
  r = pointer(g, r.sel, { x: 210, y: 310, button: 2, shift: true });
  assert.equal(h.orders.length, 2, 'shift + right-click queues');
  const [sx, sy] = g.L.spots[0];
  r = pointer(g, r.sel, { x: sx, y: sy, button: 0 });
  assert.equal(r.did, 'spot'); assert.equal(r.sel.hero, false); assert.equal(r.sel.spot, 0);
  r = pointer(g, { hero: true, spot: -1, aim: null }, { x: 580, y: 740, button: 0 });
  assert.equal(r.sel.hero, false, 'mouse click on empty ground');
  // keys: 1 selects, twice quickly centres; F1 the same; Esc cancels the aim, then the selection
  r = pressKey(g, noSel(), '1', 10);
  assert.equal(r.did, 'select'); assert.equal(r.sel.hero, true);
  assert.equal(pressKey(g, r.sel, '1', 10.2).did, 'centre');
  assert.equal(pressKey(g, r.sel, '1', 11).did, 'select');
  assert.equal(pressKey(g, noSel(), 'F1', 0).sel.hero, true);
  h.lvl = 1;
  r = pressKey(g, r.sel, 'w');
  assert.equal(r.sel.aim, 'w');
  assert.equal(pointer(g, r.sel, { x: 1, y: 1, button: 2 }).sel.aim, null, 'right-click cancels the aim, no order');
  r = pressKey(g, r.sel, 'Escape');
  assert.equal(r.sel.aim, null); assert.equal(r.sel.hero, true);
  assert.equal(pressKey(g, r.sel, 'Escape').sel.hero, false);
  // death: deselected, not reselected on her return; 1 does nothing while she's away
  let sel = { hero: true, spot: -1, aim: null };
  h.hp = 0; h.held = [still(g, 'yezhu', 0)]; step(g, STEP);
  assert.ok(h.dead > 0);
  sel = keepSel(g, sel);
  assert.equal(sel.hero, false);
  assert.equal(pressKey(g, sel, '1', 50).sel.hero, false, '1 ignored while she is away');
  g.beasts = [];
  run_(g, HERO.respawn + 0.5);
  assert.ok(h.dead <= 0);
  assert.equal(keepSel(g, sel).hero, false, 'not reselected');
});

test('the sim plays her skills (a plain autocast bot); none leaves her on 啸月 alone', () => {
  const casts = (strat, i = 4) => {
    const seen = { q: 0, w: 0, e: 0, r: 0 }, last = { q: 0, w: 0, e: 0, r: 0 };
    sim(levels[i], (g) => { strat(g); for (const k of Object.keys(seen)) { if (g.hero.cds[k] > last[k] + 0.5) seen[k] += 1; last[k] = g.hero.cds[k]; } }, { seed: 'a' });
    return seen;
  };
  const withBot = casts(STRATS.mixed), l3 = casts(STRATS.mixed, 2), person = casts(STRATS.human);
  assert.ok(withBot.q > 0, JSON.stringify(withBot));
  assert.ok(withBot.r >= 1, `狐毛 on 合窳: ${JSON.stringify(withBot)}`);
  assert.ok(l3.w > 0 && l3.e > 0, `月影扑 and 狐火 once she is 三重 (药园): ${JSON.stringify(l3)}`);
  assert.ok(person.w > 0 && person.e > 0 && person.r >= 1, `the human bot casts them too, late: ${JSON.stringify(person)}`);
  const alone = casts(STRATS.none);
  assert.ok(alone.q > 0 && alone.w + alone.e + alone.r === 0, JSON.stringify(alone));
});

/* The story levels (Hanli 10-20: 守炉 is the main game; a new level a 回 from 古四 on, at its climax). */
const ROOT = new URL('..', import.meta.url);
// tasks/*.json are one list (content.mjs): a 回's own boards live in tasks/h<nn>.json.
const tasks = readdirSync(new URL('worlds/jiuding/tasks/', ROOT)).filter((f) => f.endsWith('.json'))
  .flatMap((f) => JSON.parse(readFileSync(new URL(`worlds/jiuding/tasks/${f}`, ROOT), 'utf8')).tasks);
const book = JSON.parse(readFileSync(new URL('story/jiuding-lu/book.json', ROOT), 'utf8'));
const HUI = book.volumes.flatMap((v) => v.hui).map((h) => h.id); // the 回 in the order they are read
const sceneOf = (id) => {
  for (const ch of readdirSync(new URL('worlds/jiuding/chapters/', ROOT))) {
    try { return JSON.parse(readFileSync(new URL(`worlds/jiuding/chapters/${ch}/scenes/${id}.json`, ROOT), 'utf8')); } catch { /* not this chapter */ }
  }
  return null;
};

test('the ladder is the 游戏厅\'s; a story level stands off it, opened by its id — never by number, never as 下一关', () => {
  assert.ok(stories.length >= 1 && all.indexOf(stories[0]) >= levels.length, 'after the ladder in the table');
  assert.ok(stories.every((l) => typeof l.story === 'string' && !l.new), 'a story level names its scene and brings no ladder `new`');
  assert.equal(levelAsked({ lv: 'yaoyuan-xunye' }, ''), 'yaoyuan-xunye');
  assert.equal(levelAsked({}, '?lv=yaoyuan-xunye'), 'yaoyuan-xunye');
  assert.equal(all[levelAt(all, 'yaoyuan-xunye')].id, 'yaoyuan-xunye');
  assert.equal(levelAt(all, 3), all.indexOf(levels[2]), 'a number is the ladder\'s');
  assert.equal(levelAt(all, levels.length + 1), -1, 'no ladder level past the last');
  assert.equal(levelAt(all, 0), -1);
  assert.equal(nextLv(all, levelAt(all, 'yaoyuan-xunye')), 0, 'a story level names no 下一关');
  assert.equal(nextLv(all, all.indexOf(levels.at(-1))), 0, 'nor the ladder\'s last (黑松岭 → no story level)');
  assert.equal(nextLv(all, all.indexOf(levels[0])), 2);
  // the story deals only its story levels (rules/look.mjs dealOf); the id still finds its own there
  assert.equal(stories[levelAt(stories, 'yaoyuan-xunye')].story, 'wm-yaoyuan');
});

test('each story level is a board its scene shows, its task names it, its 游戏厅 row opens it', () => {
  for (const l of stories) {
    const t = tasks.find((x) => x.game === 'shoulu' && x.deal?.lv === l.id);
    assert.ok(t, `${l.id}: a story task deals it`);
    assert.equal(t.kind, 'board');
    const sc = sceneOf(l.story);
    assert.ok(sc, `${l.id}: its scene ${l.story}`);
    assert.ok(sc.show?.some((c) => c.card === 'board' && c.id === t.id) && sc.offers?.tasks?.includes(t.id), `${l.story} shows and offers ${t.id}`);
    const arcade = reg.games.find((g) => g.id === 'shoulu' && g.task === t.id);
    assert.ok(arcade && arcade.scene === l.story && arcade.data?.lv === l.id && !arcade.levels, `${l.id}: the 游戏厅's row opens it by id`);
  }
});

test('a story level uses only beasts the book has met by its 回 (野猪 on 蒙山 from 古四; the 狰 is never fought, it is tamed)', () => {
  const pools = JSON.parse(readFileSync(new URL('worlds/jiuding/places/xu.json', ROOT), 'utf8')).pools ?? {};
  // met: on the mountain by then (a pool's `from`), or the bestiary's own 回 (creatures.json `hui`: 野猪 is 第一回's,
  // 爹's knee 「年轻时给野猪顶过一回」 — the plan's 抬鹿下山 · 雪夜柴垛 · 泗水路 field it in 古二 and 古三, 2026-10-22)
  const creatures = JSON.parse(readFileSync(new URL('worlds/jiuding/creatures.json', ROOT), 'utf8')).creatures ?? [];
  const before = (h, hui) => Boolean(h) && HUI.indexOf(h) >= 0 && HUI.indexOf(h) <= HUI.indexOf(hui);
  const met = (beast, hui) => before(creatures.find((c) => c.id === beast)?.hui, hui)
    || Object.values(pools).some((p) => (p.beasts ?? []).some((b) => b.creature === beast && before(b.from, hui)));
  for (const l of stories) {
    const hui = sceneOf(l.story).hui;
    for (const b of beastsOf(l)) assert.ok(met(b, hui), `${l.id} (${hui}): ${b} is met on the mountain by then`);
    assert.ok(!beastsOf(l).includes('zheng') || HUI.indexOf(hui) > HUI.indexOf('h05'), `${l.id}: no 狰 fought in 古四 — the book tames it with a 萝卜`);
  }
  const xunye = stories.find((l) => l.id === 'yaoyuan-xunye');
  assert.deepEqual(beastsOf(xunye), ['yezhu']);
  assert.deepEqual(xunye.towers, ['jian', 'huo'], '剑阵 · 火符: the first two, nothing to answer yet');
  assert.equal(heroOf(xunye).hair, 0, '狐毛 from 古五 on');
});

// A first-timer's hand, as the live check played it (2026-10-20, headed Chrome at 390 and 1440): a fixed plan of fire
// and swords on the spots the eye picks, a look every 1.6 s, the fire ones up a 重 when the next is out of reach, then
// upgrades; 银月 never ordered (her 啸月 on its autocast). At hpMul 3.2 this hand lost the board live (and 9/20 in the sim).
const firstTimer = (lv) => {
  // 2026-10-28: on 药园巡夜's own map (no longer the 游戏厅's 药园): fire where the road doubles back, swords up the side
  const PLAN = [['huo', 0], ['jian', 3], ['huo', 1], ['jian', 6], ['huo', 4], ['jian', 7]], UPS = [0, 1, 3, 4, 6, 0, 1];
  let k = 0, u = 0, next = 0;
  return (g) => {
    if (g.t < next) return; next = g.t + 1.6;
    if (k < PLAN.length && g.money >= TOWERS[PLAN[k][0]].cost[0]) { if (build(g, PLAN[k][1], PLAN[k][0])) k += 1; return; }
    if ((k >= PLAN.length || (k >= 3 && g.money >= 80 && u < 2)) && u < UPS.length) { const i = UPS[u]; if (g.towers[i] && g.money >= upgradeCost(g.towers[i])) { upgrade(g, i); u += 1; } }
  };
};
test('药园巡夜, tuned for a first-time player: a first-timer\'s plain hand always wins with a little fire lost; the human hand keeps it all', () => {
  const xunye = stories.find((l) => l.id === 'yaoyuan-xunye');
  const naive = SEEDS20.map((seed) => sim(xunye, firstTimer(xunye), { seed }));
  const line = (rs) => `win ${Math.round(share(rs, (x) => x.result === 'win') * 100)}%, ★ ${rs.map((x) => x.stars).join('')}, fire ${rs.map((x) => x.hp)}`;
  assert.equal(share(naive, (x) => x.result === 'win'), 1, `first-timer: ${line(naive)}`);
  assert.ok(share(naive, (x) => x.stars >= 2) >= 0.9 && naive.some((x) => x.hp < 10), `first-timer, some bite: ${line(naive)}`);
  const rs = run(xunye, 'human', SEEDS20);
  assert.ok(allWin(rs) && share(rs, (x) => x.stars === 3) >= 0.9, `human: ${line(rs)}`);
  assert.ok(allWin(run(xunye, 'thin')), 'two talismans and their upgrades still hold it');
  assert.ok(allLose(run(xunye, 'none')), 'nothing laid: the herbs are lost');
  assert.ok(rs.every((x) => x.time < 240), `about three minutes: ${rs.map((x) => x.time)}`);
});

// 古八's 丹房看炉 (2026-10-21): a first-timer's plain hand on the 后山 · 丹房 map — fire by the road, swords where the birds
// dive (the lead says 剑阵够得着), then upgrades; a look every 1.6 s.
const kanluHand = (lv) => {
  // 2026-10-28: on 丹房看炉's own map (no longer the 游戏厅's 后山): fire by the last bend, swords under the birds' line
  const PLAN = [['huo', 1], ['jian', 0], ['jian', 6], ['huo', 5], ['jian', 2], ['huo', 3]], UPS = [0, 1, 6, 5, 2, 0, 1];
  let k = 0, u = 0, next = 0;
  return (g) => {
    if (g.t < next) return; next = g.t + 1.6;
    if (k < PLAN.length && g.money >= TOWERS[PLAN[k][0]].cost[0]) { if (build(g, PLAN[k][1], PLAN[k][0])) k += 1; return; }
    if ((k >= PLAN.length || (k >= 3 && g.money >= 80 && u < 2)) && u < UPS.length) { const i = UPS[u]; if (g.towers[i] && g.money >= upgradeCost(g.towers[i])) { upgrade(g, i); u += 1; } }
  };
};
test('丹房看炉 (古八), harder than 药园巡夜: a first-timer\'s plain hand wins losing a little fire; fire alone loses to the birds; nothing laid loses', () => {
  const kanlu = stories.find((l) => l.id === 'danfang-kanlu');
  assert.deepEqual(beastsOf(kanlu).sort(), ['qique', 'yezhu']);
  const naive = SEEDS20.map((seed) => sim(kanlu, kanluHand(kanlu), { seed }));
  const line = (rs) => `win ${Math.round(share(rs, (x) => x.result === 'win') * 100)}%, ★ ${rs.map((x) => x.stars).join('')}, fire ${rs.map((x) => x.hp)}`;
  assert.equal(share(naive, (x) => x.result === 'win'), 1, `first-timer: ${line(naive)}`);
  assert.ok(share(naive, (x) => x.hp < 10) >= 0.5, `first-timer, it bites: ${line(naive)}`);
  assert.ok(allWin(run(kanlu, 'human', SEEDS20)), 'the human hand holds it');
  assert.ok(allLose(run(kanlu, 'huo')), 'fire can\'t reach the sky: all fire loses to the 鬿雀');
  assert.ok(allLose(run(kanlu, 'none')), 'nothing laid: the furnace is lost');
  assert.ok(naive.every((x) => x.time < 240), `about three minutes: ${naive.map((x) => x.time)}`);
});

/* The 秘境's short 守炉 (2026-10-20; 割藤 deleted with the 饭桶's old play): three levels of three waves, `realm: mijing`,
   off the 游戏厅's ladder and opened by id — the run's board deals the next after the last he won (rules/climb.mjs).
   Only the 秘境's own beasts: 犰狳, then 合窳. Each harder than the one before for the bots; the human hand wins them all. */
test('the 秘境\'s short 守炉: three levels off the ladder, three waves each, the 秘境\'s beasts, harder each time, all won by the human hand', () => {
  const realm = all.filter((l) => l.realm === 'mijing');
  assert.deepEqual(realm.map((l) => l.id), ['mijing-1', 'mijing-2', 'mijing-3']);
  for (const l of realm) {
    assert.ok(!levels.includes(l) && !stories.includes(l), `${l.id}: neither the ladder nor a story level`);
    assert.equal(l.waves.length, 3, `${l.id}: short`);
    assert.ok(beastsOf(l).every((b) => ['qiuyu', 'heyu'].includes(b)), `${l.id}: ${beastsOf(l)}`);
    assert.equal(all[levelAt(all, l.id)], l, 'opened by its id');
    assert.equal(nextLv(all, all.indexOf(l)), 0, 'no 下一关 from the board');
    assert.ok(allWin(run(l, 'human')), `${l.id}: the human hand wins`);
    assert.ok(allLose(run(l, 'none')), `${l.id}: nothing laid loses`);
  }
  const fire = realm.map((l) => Math.min(...run(l, 'mixed').map((x) => x.hp)));
  assert.ok(fire[0] > fire[1] && fire[1] > fire[2], `less fire kept each level: ${fire}`);
  const tasks = JSON.parse(readFileSync(new URL('../worlds/jiuding/tasks/world.json', import.meta.url), 'utf8')).tasks;
  assert.deepEqual(tasks.find((t) => t.id === 'mijing-rerun-gather').climb, realm.map((l) => l.id), 'the run\'s board climbs them');
});

test('every level paints a ground that exists (draw.js `ground-${L.ground ?? L.id}`) — a story level has none of its own', () => {
  // Found live 10-21: 药园巡夜 and 丹房看炉 asked for ground-<their id>.webp, a 404, and the whole board fell back to
  // code-drawn paper (draw.js paints the art only when every picture loaded).
  const art = new Set(readdirSync(new URL('../scripts/games/shoulu/art/', import.meta.url)));
  for (const l of all) assert.ok(art.has(`ground-${l.ground ?? l.id}.webp`), `${l.id}: no ground-${l.ground ?? l.id}.webp`);
});

test('the two story levels played at night stand on night grounds (丑时 in the 药园, the 丹房 furnace watched after dark)', () => {
  // Live 10-21: both played on the bright day grass. Their night grounds are edit passes of the day's
  // (tools/paint-shoulu-flux.py NIGHTS): the same composition, so the road lies on them as it did.
  const byId = Object.fromEntries(all.map((l) => [l.id, l]));
  assert.equal(byId['yaoyuan-xunye'].ground, 'yaoyuan-night');
  assert.equal(byId['danfang-kanlu'].ground, 'houshan-night');
});

/* 守火 (00-cave) and 雪夜柴垛 (00-halfyear), rebuilt 2026-10-28 (Hanli: 「守火那个不太好玩」 · 「雪夜柴垛也不好玩」, then 「守火和雪夜守柴,
   可否用主力的塔防取代?」 · 「守炉比较好玩」): they played as 小满 alone — a fire to feed, every tap an order, nothing to build. Now
   both are 守炉 build boards like 泗水路, each its own pair of pieces (`skin`, no talismans before 入门) from its own passage:
   the cave's 火堆 · 松烟 (he lit them himself), the yard's 老周 · 冰面. The story's first three build boards climb: a lazy hand
   (two pieces, never upgraded) keeps most nights in the cave, about half in the yard, none on the 泗水 road. */
const story = (id) => stories.find((l) => l.id === id);
const fiveLine = (rs) => `win ${rs.filter((x) => x.result === 'win').length}/${rs.length}, ★ ${rs.map((x) => x.stars).join('')}`;
const wins = (rs) => rs.filter((x) => x.result === 'win').length;
// a first-timer's plain hand on each pre-入门 board: a fixed plan on the spots the eye picks, a look every 1.6 s, then upgrades
const PLANS = {
  shouhuo: { plan: [['huo', 0], ['han', 2], ['huo', 1], ['huo', 4], ['han', 6]], ups: [0, 1, 4, 2, 0, 1] },
  chaiduo: { plan: [['jian', 0], ['han', 3], ['jian', 2], ['jian', 4], ['han', 7], ['jian', 1]], ups: [0, 2, 4, 3, 0, 2] },
  sishui: { plan: [['huo', 0], ['jian', 1], ['huo', 3], ['jian', 2], ['huo', 7], ['jian', 4]], ups: [0, 3, 1, 7, 2, 0, 3] },
};
const planHand = (id) => () => {
  const { plan, ups } = PLANS[id];
  let k = 0, u = 0, next = 0;
  return (g) => {
    if (g.t < next) return; next = g.t + 1.6;
    if (k < plan.length && g.money >= TOWERS[plan[k][0]].cost[0]) { if (build(g, plan[k][1], plan[k][0])) k += 1; return; }
    if ((k >= plan.length || (k >= 3 && g.money >= 80 && u < 2)) && u < ups.length) { const i = ups[u]; if (g.towers[i] && g.money >= upgradeCost(g.towers[i])) { upgrade(g, i); u += 1; } }
  };
};
// the lazy hand: the plan's first two, never an upgrade, a look every 3 s
const lazyHand = (id) => () => {
  const { plan } = PLANS[id];
  let k = 0, next = 0;
  return (g) => { if (g.t < next || k >= 2) return; next = g.t + 3; if (g.money >= TOWERS[plan[k][0]].cost[0] && build(g, plan[k][1], plan[k][0])) k += 1; };
};
const go = (l, mk) => SEEDS20.map((seed) => sim(l, mk(), { seed }));
const art = () => new Set(readdirSync(new URL('../scripts/games/shoulu/art/', import.meta.url)));

test('守火 · 雪夜柴垛: build boards, no fire to feed — each its own pair of pieces from its passage, painted; 小满 the hero', () => {
  const have = art();
  for (const [id, scene, kinds, furnace] of [['shouhuo', '00-cave', ['huo', 'han'], 'campfire'], ['chaiduo', '00-halfyear', ['jian', 'han'], 'chaiduo']]) {
    const l = story(id);
    assert.equal(l.story, scene);
    assert.ok(!l.fire, `${id}: no fire to feed`);
    assert.deepEqual(l.towers, kinds);
    assert.ok(l.spots.length >= 6 && l.money > 0, `${id}: spots to build on, something to spend`);
    assert.deepEqual(beastsOf(l), ['yezhu'], `${id}: 第一回's beast`);
    assert.equal(heroOf(l).who, 'xiaoman');
    assert.equal(l.furnaceArt, furnace);
    for (const k of l.towers) {
      const sk = l.skin?.[k];
      assert.ok(sk?.name?.zh && sk.name.en && sk.say?.zh && sk.glyph, `${id} ${k}: skinned — no talisman before 入门`);
      for (const n of [1, 2, 3]) assert.ok(have.has(`tower-${sk.art}-${n}.webp`), `tower-${sk.art}-${n}.webp painted`);
    }
    assert.ok(!l.waves.flat().some(([t, , , , o]) => BEASTS[t].boss || o?.elite), `${id}: no 大妖 or elite — the 结印 dock never opens before 入门`);
  }
  // the three pre-入门 boards: three different pairs
  const pairs = ['shouhuo', 'chaiduo', 'sishui'].map((id) => story(id).towers.join('+'));
  assert.equal(new Set(pairs).size, 3, pairs.join(' · '));
  assert.ok(story('shouhuo').keep?.art === 'fox-sleep', 'the hurt fox by the cave fire, to keep');
  assert.equal(towerName(story('chaiduo'), 'jian', 'zh'), '老周');
});

test('the story\'s first three build boards climb: a first-timer and the human hand ★★★ on 守火 and 雪夜柴垛; a lazy hand keeps fewer nights each board; nothing laid loses', () => {
  const kept = {};
  for (const id of ['shouhuo', 'chaiduo', 'sishui']) {
    const l = story(id), first = go(l, planHand(id)), human = run(l, 'human', SEEDS20), lazy = go(l, lazyHand(id));
    assert.ok(allWin(first) && allWin(human), `${id}: first-timer ${fiveLine(first)}; human ${fiveLine(human)}`);
    if (id !== 'sishui') {
      assert.ok(share(first, (x) => x.stars === 3) >= 0.9 && share(human, (x) => x.stars === 3) >= 0.75, `${id}: ★★★ — first-timer ${fiveLine(first)}; human ${fiveLine(human)}`);
      assert.ok(lazy.some((x) => x.result !== 'win' || x.hp < 10), `${id}: lazy play bites — ${fiveLine(lazy)}`);
    }
    assert.ok(allLose(run(l, 'none', SEEDS20)), `${id}: nothing laid loses`);
    assert.ok(human.every((x) => x.time < 240), `${id}: a few minutes — ${human.map((x) => x.time)}`);
    kept[id] = wins(lazy);
  }
  assert.ok(kept.shouhuo > kept.chaiduo && kept.chaiduo > kept.sishui, `a lazy hand keeps fewer nights each board: ${JSON.stringify(kept)}`);
  assert.ok(kept.shouhuo >= 15 && kept.chaiduo <= 12, `the cave gentle, the yard biting: ${JSON.stringify(kept)}`);
});

/* 泗水路 rebuilt (2026-10-28, Hanli: 「守火那个不太好玩」 · 「雪夜柴垛也不好玩」 · 「大厅里的守炉好玩」): it played as 守火 — 小满
   alone, a fire to feed, nothing to build; now it plays as the 游戏厅's 守炉, its talismans skinned as the road's camps (no
   talismans before 入门): a boy's 弹弓 for 剑阵, a man's 火把 for 火符; 舅舅 asleep by the camp fire still to keep. */
test("泗水路: 00-gate's — built as the 游戏厅's 守炉, its talismans the camps' 弹弓 and 火把; 舅舅 asleep by the fire to keep", () => {
  const l = story('sishui');
  assert.equal(l.story, '00-gate');
  assert.ok(!l.fire, 'no fire to feed: that was 守火');
  assert.deepEqual(l.towers, ['jian', 'huo']);
  assert.ok(l.spots.length >= 6 && l.money > 0, 'spots to build on, 干粮 to spend');
  assert.deepEqual(beastsOf(l), ['yezhu']);
  assert.equal(heroOf(l).who, 'xiaoman', '小满 the hero: 银月 sleeps in the 木牌');
  const art = new Set(readdirSync(new URL('../scripts/games/shoulu/art/', import.meta.url)));
  for (const k of l.towers) {
    const sk = l.skin?.[k];
    assert.ok(sk?.name?.zh && sk.name.en && sk.say?.zh && sk.say.en && sk.glyph, `${k}: skinned — no talisman before 入门`);
    for (const n of [1, 2, 3]) assert.ok(art.has(`tower-${sk.art}-${n}.webp`), `tower-${sk.art}-${n}.webp painted`);
  }
  assert.equal(towerName(l, 'jian', 'zh'), '弹弓');
  assert.equal(towerName(levels[0], 'jian', 'zh'), '剑阵', "the 游戏厅's own keep their talismans");
  const g = newGame(l, { seed: 'k', headless: true });
  g.money = 999; build(g, 0, 'jian'); g.nextTimer = 1e9;
  const b = spawnAt(g, 'yezhu', 0); b.hp = b.max = 1e6;
  for (let i = 0; i < 60 * 30 && !g.proj.some((p) => p.k === 'sword'); i += 1) step(g, 1 / 60);
  assert.equal(g.proj.find((p) => p.k === 'sword')?.look, 'stone', 'the 弹弓 shoots a stone');
  assert.ok(l.keep && l.keep.hp > 0 && l.keep.art);
  const lone = newGame(l, { seed: 'k', headless: true });
  lone.nextTimer = 1e9;
  const c = spawnAt(lone, 'yezhu', 0);
  c.x = lone.keep.x + 10; c.y = lone.keep.y; c.toKeep = true; c.hp = c.max = 1e6;
  lone.hero.dead = 1e9; // nobody to drive it off
  for (let i = 0; i < 60 * 200 && !lone.over; i += 1) step(lone, 1 / 60);
  assert.deepEqual([lone.over, lone.lostBy], ['lose', 'keep'], '舅舅 gnawed down: the night is lost');
});
test('泗水路 (第三回): gentler than 药园巡夜 — the first-timer\'s hand and the human hand hold it; nothing laid loses', () => {
  const l = story('sishui');
  const hand = planHand('sishui');
  const first = SEEDS20.map((seed) => sim(l, hand(), { seed })), human = run(l, 'human', SEEDS20);
  assert.ok(allWin(first) && share(first, (x) => x.stars === 3) >= 0.9, `first-timer: ${fiveLine(first)}`);
  assert.ok(allWin(human) && share(human, (x) => x.stars >= 2) >= 0.95, `human: ${fiveLine(human)}`);
  const thin = run(l, 'thin');
  assert.ok(allWin(thin) && share(thin, (x) => x.hp < 10) >= 0.6, `two of them hold it, losing fire on most nights (it bites): ${thin.map((x) => x.hp)}`);
  assert.ok(allLose(run(l, 'none')), 'nothing laid: the camp is overrun');
  const keep = (rs) => rs.reduce((n, x) => n + x.hp, 0);
  assert.ok(keep(run(l, 'thin')) > keep(run(story('yaoyuan-xunye'), 'thin')), 'gentler than 药园巡夜 (古四), the next story 守炉');
  assert.ok(human.every((x) => x.time < 240), `about two and a half minutes: ${human.map((x) => x.time)}`);
});

/* Each story 守炉 board on its own map (Hanli 10-28: the story's levels are not the 游戏厅's, nor each other's): no story level
   that builds lays the road or the spots of any other level, and its road runs visibly apart — sampled along its length,
   a point lies on average more than 35 px from the other road (the kept pairs closest: 泗水路 · 黑松岭 40). */
const apart = (a, b) => {
  const A = layLevel(a).road, B = layLevel(b).road;
  const pts = (R) => Array.from({ length: 60 }, (_, i) => posOnPath(R, (R.len * i) / 59));
  const pb = pts(B);
  return pts(A).reduce((n, p) => n + Math.min(...pb.map((q) => Math.hypot(p.x - q.x, p.y - q.y))), 0) / 60;
};
test('no story 守炉 level lays another level\'s layout: its own road and spots, the road visibly apart', () => {
  for (const l of stories.filter((x) => x.spots.length)) for (const o of all.filter((x) => x !== l)) {
    assert.notDeepEqual(l.road, o.road, `${l.id}: the road of ${o.id}`);
    assert.notDeepEqual(l.spots, o.spots, `${l.id}: the spots of ${o.id}`);
    if (o.story || !o.realm) assert.ok(apart(l, o) > 35, `${l.id} runs close to ${o.id}: ${apart(l, o).toFixed(0)} px apart`);
  }
});

test('the old 添火 play is gone (2026-10-31): no level feeds a fire, no eyes in the dark, no 枯枝, every board a build board', () => {
  for (const l of all) {
    assert.ok(!l.fire, `${l.id}: a fire to feed`);
    assert.ok(l.towers.length > 0, `${l.id}: nothing to build`);
  }
  assert.equal(BEASTS.yanjing, undefined);
  const g = newGame(all.find((l) => l.hero?.who), { seed: 'f', headless: true });
  assert.ok(!('sticks' in g) && !('carry' in g.hero), 'no 枯枝 to fetch');
});
