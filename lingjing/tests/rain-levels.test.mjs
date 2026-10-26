// The 打地鼠 kit plays a level from data (games/rain.js, its level schema at the top): a second level
// with its own spots, counts, lines and art plays, the bot wins it, idle floods and is stuck after
// three — and the default (接雨 · 十七个盆, `shiao`) keeps its exact rain.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as rain from '../scripts/games/rain.js';
import { bot } from '../scripts/games/bots/rain.js';
import { playOnce } from '../tools/board-bots.mjs';

const WELL = {
  id: 'well',
  name: { zh: '井台 · 九只桶', en: 'The well · Nine buckets' },
  how: { zh: '哪儿冒水就往哪儿放桶。', en: 'Set a bucket where the water wells up.' },
  spots: [{ zh: '东角', en: 'East corner' }, { zh: '西角', en: 'West corner' }, { zh: '井沿', en: 'The rim' }, { zh: '石阶', en: 'The steps' }],
  cols: 2,
  need: 9, cap: 3, limit: 80000, flood: 12, dry: 4, lead: 800, gap: [2600, 1600], beat: [450, 380], teach: 3, three: 0.4, jit: 200,
  lines: {
    zh: { ready: '井水要漫上来了。', start: '提桶', go: '冒水处放桶。', placed: '桶放下了。', wasted: '这儿没冒水。', poured: '桶提走倒了。', spill: '水漫了一片。',
      thick: '两处一起冒。', thicker: '三处一起冒。', dry: '九只桶都满了，井台干净。', wet: '桶满了，井台也湿了。', short: '天亮了，桶没接满。', flood: '井台全淹了！再来。',
      full: '满桶', floor: '漫水', drip: '冒水' },
    en: { ready: 'The well is rising.', flood: 'The well yard is under water! Again.' },
  },
  art: { beam: 'well/rope.webp', basin: 'well/bucket.webp', ground: 'well/stones.webp' },
  grades: ['clean', 'soaked'],
};
const started = (seed, level = WELL) => rain.act(rain.newGame(seed, 1, { levels: [level] }), { g: 'start' }).state;
const live = (sched, t) => sched.leaks.filter((l) => t >= l.from && t < l.to);
const SEEDS = Array.from({ length: 12 }, (_, i) => `well-${i}`);

test('a data level: its spots, counts, lines and art', () => {
  const s = rain.newGame('a', 1, { levels: [WELL] });
  assert.deepEqual(s.level, WELL, 'the state carries the data level');
  assert.equal(rain.levelOf(s).need, 9);
  assert.equal(s.basins.length, 4);
  assert.equal(rain.howOf(WELL, 'en'), WELL.how.en);
  const ready = rain.html(s, 'zh');
  assert.match(ready, /井水要漫上来了/);
  assert.match(ready, /提桶/);
  assert.match(ready, /art\/games\/well\/rope\.webp/);
  assert.match(ready, /art\/games\/well\/bucket\.webp/);
  assert.match(ready, /art\/games\/well\/stones\.webp/);
  assert.doesNotMatch(ready, /games\/rain\//, 'none of the default art');
  const on = rain.tick(started('a'), 100);
  const board = rain.html(on, 'zh');
  assert.equal((board.match(/data-g="spot"/g) ?? []).length, 4);
  assert.match(board, /满桶 <b>0<\/b> \/ 9/);
  assert.match(board, /漫水 <b>0<\/b> \/ 12/);
  assert.match(board, /--rain-cols:2/);
  assert.equal((board.match(/<i class/g) ?? []).length, 9, 'nine pips');
  assert.match(rain.html(on, 'en'), /Puddles/, 'a line the level leaves out is the default\'s');
  for (const seed of SEEDS) {
    const { leaks } = rain.schedule(seed, WELL);
    assert.ok(leaks.every((l) => l.spot >= 0 && l.spot < 4 && l.drops.length === 3 && l.drops[0] - l.from === 800));
    assert.ok(leaks.at(-1).to <= 80000 + 1000);
    for (let t = 0; t < 80000; t += 50) assert.ok(live({ leaks }, t).length <= (t < 80000 * 0.4 ? 2 : 3), `${seed} at ${t}`);
    for (let i = 0; i < 3; i++) assert.ok(leaks[i + 1].from >= leaks[i].to, 'its three teaching leaks come alone');
    assert.ok(!leaks.some((l) => leaks.some((m) => m !== l && m.spot === l.spot && m.from < l.to && l.from < m.to)), 'never two at one spot');
  }
  assert.deepEqual(started('a').sched, rain.schedule('a', WELL));
});

test('the bot wins the data level clean: nine caught, its own grade name', () => {
  for (const seed of SEEDS) {
    let worst = 0;
    const r = playOnce(rain, (st) => { worst = Math.max(worst, st.puddles ?? 0, (st.floods ?? 0) * 99); return bot(st); }, { seed, deal: { levels: [WELL] } });
    assert.equal(r.won, true, seed);
    assert.equal(r.grade, 'clean', seed);
    assert.equal(worst, 0, seed);
  }
  let s = started('w');
  while (!s.won) { const a = bot(s); s = a ? rain.act(s, a).state : rain.tick(s, 50); }
  assert.equal(rain.fullCount(s), 9);
  assert.match(rain.html(s, 'zh'), /九只桶都满了/);
  assert.equal((rain.html(s, 'zh').match(/well\/bucket\.webp/g) ?? []).length, 9, 'the end row: nine buckets');
  const wet = rain.html({ ...s, grade: 'soaked', note: 'wet' }, 'zh');
  assert.match(wet, /井台也湿了/);
  assert.match(wet, /g-stain/);
});

test('a level of two spots or one: every leak at a spot, and the bot wins it', () => {
  for (const spots of [WELL.spots.slice(0, 2), WELL.spots.slice(0, 1)]) {
    const L = { ...WELL, id: `few-${spots.length}`, spots };
    for (const seed of SEEDS.slice(0, 6)) {
      const { leaks } = rain.schedule(seed, L);
      assert.ok(leaks.length >= 9 && leaks.every((l) => Number.isInteger(l.spot) && l.spot < spots.length), `${spots.length} spots, ${seed}`);
      const r = playOnce(rain, bot, { seed, deal: { levels: [L] } });
      assert.equal(r.won, true, `${spots.length} spots, ${seed}`);
    }
  }
});

test('idle on the data level floods at its own line, starts again, and is stuck after three floods', () => {
  let s = started('idle'), t = 0;
  while (!s.floods) { s = rain.tick(s, 50); t += 50; }
  assert.ok(t < 80000, `idle floods in ${t} ms`);
  assert.equal(s.won, false);
  assert.equal(s.live, true);
  assert.equal(s.basins.length, 4);
  assert.match(rain.html(s, 'zh'), /井台全淹了/);
  assert.match(rain.html(s, 'en'), /The well yard is under water/);
  assert.equal(rain.stuck(s), false);
  while (s.floods < 3) s = rain.tick(s, 50);
  assert.equal(rain.stuck(s), true);
  assert.equal(s.won, false);
});

test('the default level is 接雨 as before: its numbers, and its rain for these seeds unchanged', async () => {
  assert.equal(rain.SHIAO.id, 'shiao');
  assert.deepEqual([rain.NEED, rain.CAP, rain.LIMIT, rain.FLOOD, rain.DRY, rain.LEAD, rain.TEACH, rain.THREE, rain.JIT, rain.GRACE, rain.SPOTS.length], [17, 4, 110000, 19, 10, 900, 2, 0.25, 250, 300, 6]);
  // Hashes of schedule(seed) taken from the module before the level hook (2026-10-26).
  const PINNED = { 42: '4d21d045c7a9dcb5', a: '75577e96e2886bc5', b: '63442dc7278c9b4c', 'seed-0|rain-basins': 'd3a2aa176c72f852', 'seed-7|rain-basins': 'cef6c894657e5694', 'x|y|rain-basins': 'fa0b96f9ab744d95' };
  const h = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 16);
  for (const [seed, want] of Object.entries(PINNED)) {
    assert.equal(h(rain.schedule(seed)), want, seed);
    assert.equal(h(rain.schedule(seed, rain.SHIAO)), want, seed);
    assert.equal(h(rain.newGame(seed).sched), want, seed);
  }
  assert.equal('level' in rain.newGame('a'), false, 'the default keeps its saves as they were');
  assert.equal('level' in rain.newGame('a', 1, { levels: [rain.SHIAO] }), false);
  assert.equal(await rain.levelFor({}), rain.SHIAO);
  assert.equal(await rain.levelFor({ data: { level: 'shiao' } }), rain.SHIAO);
  assert.equal(await rain.levelFor({ data: { levels: [WELL] } }), WELL);
  assert.deepEqual(rain.ladderOf({ games: [{ id: 'rain', levels: [WELL] }, { id: 'qimai', levels: [{ id: 'x' }] }] }).map((l) => l.id), ['shiao', 'well']);
});
