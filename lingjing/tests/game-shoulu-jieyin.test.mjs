// 结印 in 守炉 (Hanli 10-21: 「把结印放到现有的塔防类游戏中」; 「用户结印失败, 或者不愿意使用摄像头, 塔防游戏也能正常完成, 不会影响
// 剧情推进」; 「结印可以帮助更快杀敌, 更容易取得3星成就」): the shared dock (jieyin/helper.js) offered only where a camera is,
// the host's calls (core.js jieyinState · jieyinCast), the pace switch, and the balance with and without a cast.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BEASTS, human, jieyinCast, jieyinState, jieyinTarget, levelsFrom, newGame, sim, spawnAt, step, withSeals } from '../scripts/games/shoulu/core.js';
import { gateOpen, jieyinCfg, offerJieyin } from '../scripts/games/shoulu.js';

const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), 'utf8'));
const reg = read('../worlds/jiuding/games.json'), kit = read('../worlds/jiuding/levels/jieyin.json');
const levels = levelsFrom(reg.games.find((g) => g.id === 'shoulu' && g.levels));
const host = kit.hosts.shoulu;
const lv = (id) => levels.find((l) => l.id === id);

test('the pace is a level\'s: rest (the 大妖 or an elite only, a long rest) by default; intense on a few — always, a short rest', () => {
  const rest = jieyinCfg(host, lv('heisong')), hot = jieyinCfg(host, lv('houshan'));
  assert.equal(rest.pace, 'rest');
  assert.equal(rest.when, 'boss|elite');
  assert.equal(hot.pace, 'intense');
  assert.equal(hot.when, 'always');
  assert.ok(hot.cool < rest.cool);
  assert.deepEqual(levels.filter((l) => l.pace === 'intense').map((l) => l.id), ['houshan'], 'most levels stay at rest');
});

test('the host\'s calls: offered with a 大妖 out (rest) or always (intense); the cast hits the 大妖 first, else the one nearest the furnace; then it rests', () => {
  const g = newGame(lv('heisong'), { seed: 's', headless: true });
  const rest = jieyinCfg(host, lv('heisong'));
  const a = spawnAt(g, 'yezhu', 100), b = spawnAt(g, 'yezhu', 300);
  assert.equal(jieyinState(g, rest).on, false, 'no 大妖: nothing offered at rest');
  assert.equal(jieyinCast(g, 'feijian', rest), false);
  const hot = jieyinCfg(host, lv('houshan'));
  assert.equal(jieyinState(g, hot).ready, true, 'intense: offered without one');
  assert.equal(jieyinTarget(g, hot).id, b.id, 'the one nearest the furnace');
  const hp = b.hp;
  assert.equal(jieyinCast(g, 'feijian', hot), true);
  assert.equal(b.hp, hp - host.moves[0].dmg);
  assert.equal(a.hp, a.max, 'only its target');
  assert.equal(jieyinState(g, hot).ready, false, 'resting');
  assert.ok(Math.abs(jieyinState(g, hot).cool - hot.cool) < 1e-9);
  const boss = spawnAt(g, 'heyu', 50);
  assert.equal(jieyinState(g, rest).boss, 'heyu');
  g.jy.until = 0;
  assert.equal(jieyinTarget(g, rest).id, boss.id, 'the 大妖 first');
  const bhp = boss.hp;
  jieyinCast(g, 'feijian', rest);
  assert.ok(bhp - boss.hp > host.moves[0].dmg, 'hard on the 大妖 (bossMul, through its 护体灵光)');
  assert.ok(BEASTS.heyu.boss);
});

test('火弹 splashes round its target; a move not offered here (no marks) never flies', () => {
  const g = newGame(lv('houshan'), { seed: 't', headless: true }), hot = jieyinCfg(host, lv('houshan'));
  const a = spawnAt(g, 'yezhu', 300), b = spawnAt(g, 'yezhu', 302);
  jieyinCast(g, 'huodan', hot);
  assert.ok(a.hp < a.max && b.hp < b.max);
  assert.equal(gateOpen(host.moves[1], []), false, 'before 古六\'s lesson: no 火弹');
  assert.equal(gateOpen(host.moves[1], ['qiajue-loose']), true);
  assert.equal(gateOpen(host.moves[0], []), true, '飞剑 from the start');
  assert.equal(gateOpen(host.moves[1], undefined), true, 'the 游戏厅 (no save): all');
  assert.equal(jieyinCast(g, 'nothing', { ...hot, cool: 0 }), false);
});

test('no camera → no dock: nothing drawn, and the game is the same game', async () => {
  const drawn = [];
  const box = { ownerDocument: { defaultView: {} }, append: (...x) => drawn.push(...x) };
  const load = async () => {
    const h = await import('../scripts/games/jieyin/helper.js');
    return { offerSeals: (o) => h.offerSeals({ ...o, available: async () => false }) };
  };
  const r = await offerJieyin(host, box, { lang: 'zh', now: () => ({ g: null }), marks: [], toast() {}, paused: () => false, aside: () => false, load });
  assert.equal(r, null);
  assert.equal(drawn.length, 0);
  assert.equal(await offerJieyin({ ...host, moves: [] }, box, { now: () => ({}) }), null, 'no move here: nothing either');
});

/* Every level, no camera (or the seals never made): the human bot plays it through as before. */
const SEEDS = ['h0', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7'];
for (const l of levels) {
  test(`no cast at all: ${l.id} is won as before (the human bot, ${SEEDS.length} seeds)`, () => {
    const rs = SEEDS.map((seed) => sim(l, 'human', { seed }));
    assert.ok(rs.filter((r) => r.result === 'win').length >= 6, `${l.id}: ${rs.map((r) => r.stars).join('')}`);
  });
}

test('with 结印 the kills come faster and ★★★ is easier — where it is offered (the intense level, a 大妖 night)', () => {
  for (const id of ['houshan', 'mijing-3']) {
    const cfg = jieyinCfg(host, lv(id));
    const none = SEEDS.map((seed) => sim(lv(id), 'human', { seed }));
    const cast = SEEDS.map((seed) => sim(lv(id), withSeals(human, cfg, { move: 'feijian' }), { seed }));
    const three = (rs) => rs.filter((r) => r.stars === 3).length, hp = (rs) => rs.reduce((a, r) => a + r.hp, 0) / rs.length;
    assert.ok(three(cast) >= three(none) + 2, `${id}: ★★★ ${three(none)} → ${three(cast)} of ${SEEDS.length}`);
    assert.ok(hp(cast) > hp(none), `${id}: 炉火 ${hp(none)} → ${hp(cast)}`);
  }
});

test('the dock is handed ids the 手势斗法 kit knows: every 守炉 move is a 小招, 法术 or 大招 there (live 10-21: rows went in whole and no button was drawn)', async () => {
  const kit = JSON.parse(fs.readFileSync(new URL('../worlds/jiuding/levels/jieyin.json', import.meta.url), 'utf8'));
  const { duelId, offerJieyin } = await import('../scripts/games/shoulu.js');
  const { tiersOf } = await import('../scripts/games/jieyin/helper.js');
  for (const row of kit.hosts.shoulu.moves) {
    const t = tiersOf(kit, [duelId(row)]);
    assert.ok(t.xiao.length + t.fa.length + t.da.length === 1, `${row.id} → ${duelId(row)} is a 手势斗法 move`);
  }
  let handed = null;
  const box = { ownerDocument: { defaultView: globalThis } };
  await offerJieyin(kit.hosts.shoulu, box, { lang: 'zh', now: () => ({ g: null }), toast() {}, load: async () => ({ offerSeals: async (o) => { handed = o.moves; return null; } }) });
  assert.ok(handed.every((m) => typeof m === 'string'), 'ids, not rows');
});

test('every level ends on a 大妖 or an elite, and the dock opens for either; an elite is tougher, ringed, and aimed at first', async () => {
  const { ELITE } = await import('../scripts/games/shoulu/core.js');
  for (const l of levels) {
    if (l.fire || l.hero?.who) continue; // 小满 alone before 入门 (守火 · 雪夜柴垛 · 泗水路): no 银月, no 大妖, the dock never on
    const last = l.waves.at(-1);
    assert.ok(last.some(([t, , , , o]) => BEASTS[t].boss || o?.elite), `${l.id}: its last wave`);
  }
  const g = newGame(lv('shiao'), { seed: 'e', headless: true }), cfg = jieyinCfg(host, lv('shiao'));
  const plain = spawnAt(g, 'yezhu', 300);
  assert.equal(jieyinState(g, cfg).on, false, 'no elite yet: rest');
  g.queue.push({ at: 0, type: 'yezhu', elite: ELITE.hp });
  step(g, 1 / 30);
  const elite = g.beasts.find((b) => b.elite);
  assert.ok(elite && elite.max > plain.max * 3, 'tougher');
  assert.equal(jieyinState(g, cfg).on, true);
  assert.equal(jieyinState(g, cfg).elite, 'yezhu');
  assert.equal(jieyinTarget(g, cfg).id, elite.id, 'the elite before the nearest');
});

test('stars: ★★★ the 炉火 whole and cleared by par; ★★ from 6; the story and 秘境 levels keep 炉火-only stars (no par: declining the camera costs nothing there)', async () => {
  const { starsOf } = await import('../scripts/games/shoulu/core.js');
  assert.equal(starsOf(10, 180, 189), 3);
  assert.equal(starsOf(10, 200, 189), 2, 'whole but slow');
  assert.equal(starsOf(7, 100, 189), 2);
  assert.equal(starsOf(5, 100, 189), 1);
  assert.equal(starsOf(10, 999), 3, 'no par');
  for (const l of levels) assert.equal(l.par != null, !l.story && !l.realm, `${l.id}: par only on the 游戏厅's ladder`);
});
