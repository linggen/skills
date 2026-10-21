// 手势斗法 (games/jieyin/duel.js, motion.js, spell.js; doc/games.md § 手势斗法 — Hanli 10-21): the shape picks the move, the
// motion throws it. Synthetic hands (pose.js) moving in the picture: a thrust grows the hand fast, a drift slowly.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildHand, poseOf } from '../scripts/games/jieyin/pose.js';
import { duelFill, duelStart, duelStep, laneOf, strike } from '../scripts/games/jieyin/duel.js';
import { poke, sizeOf, startPoke, thrustOf } from '../scripts/games/jieyin/motion.js';
import * as oldPoke from '../scripts/games/zhidian/poke.js';

const kit = JSON.parse(fs.readFileSync(new URL('../worlds/jiuding/levels/jieyin.json', import.meta.url), 'utf8'));
const S = kit.seals, D = kit.doufa, FPS = 15, DT = 1000 / FPS;
const fist = () => buildHand({ curl: ['index', 'middle', 'ring', 'pinky'] });
const SHAPE = { zhang: () => poseOf(S.zhang), jian: () => poseOf(S.jian), danjian: () => poseOf(S.danjian), fist, wu: () => poseOf(S.wu), zi: () => poseOf(S.zi), you: () => poseOf(S.you), mao: () => poseOf(S.mao), yuqing: () => poseOf(S.yuqing), shen: () => poseOf(S.shen) };
/** The hand in the picture: wrist at (x, y) of the camera's frame (0…1, NOT mirrored), `len` frame heights a hand-length. */
const placed = (h, x, y, len) => h.map((p) => ({ x: x + (p.x / 9.52) * len * 0.75, y: y + (p.y / 9.52) * len, z: p.z }));

/** Play `beats`: [shape, ms, { x, len0, len1 }] — the hand's size going len0 → len1 over the beat. */
function play(beats, { set = 'phone', state = null, k = kit } = {}) {
  let s = state ?? duelStart(k, { set }), t = 0, events = [], held = [];
  for (const [shape, ms, o = {}] of beats) {
    const n = Math.max(1, Math.round(ms / DT));
    for (let i = 0; i < n; i++) {
      t += DT;
      const len = (o.len0 ?? 0.2) + ((o.len1 ?? o.len0 ?? 0.2) - (o.len0 ?? 0.2)) * ((i + 1) / n);
      const w = shape ? SHAPE[shape]() : null;
      const frame = w ? { world: [w], image: [placed(w, o.x ?? 0.5, 0.8, len)], handed: ['Right'], t } : { world: [], image: [], handed: [], t };
      const r = duelStep(s, frame, DT, k);
      s = r.state; events.push(...r.events); held = r.held;
    }
  }
  return { s, events, held, casts: events.filter((e) => e.type === 'cast'), types: events.map((e) => `${e.type}:${e.move ?? e.spell ?? e.seal ?? ''}`) };
}
const PUSH = { len0: 0.2, len1: 0.27 }; // ×1.35 in a beat of 200 ms
const still = { len0: 0.2 };

test('one motion detector, moved into the jieyin module: zhidian\'s poke.js re-exports it unchanged', () => {
  assert.equal(oldPoke.poke, poke);
  assert.equal(oldPoke.sizeOf, sizeOf);
  assert.equal(oldPoke.startPoke, startPoke);
  assert.equal(thrustOf('jian', D.thrust), 'jab');
  assert.equal(thrustOf('danjian', D.thrust), 'jab');
  assert.equal(thrustOf('zhang', D.thrust), 'push');
  assert.equal(thrustOf('kou', D.thrust), 'push');
  assert.equal(thrustOf('wu', D.thrust), null, 'a 文 never thrusts');
});

test('小招: 剑诀 + 戳 → 飞剑, 单剑指 + 戳 → 点穴, 推掌 + 推 → 掌风, 拳 + 推 → 拳劲', () => {
  for (const [shape, move] of [['jian', 'feijian'], ['danjian', 'dianxue'], ['zhang', 'zhangfeng'], ['fist', 'quanjin']]) {
    const r = play([[shape, 600, still], [shape, 200, PUSH], [shape, 300, { len0: 0.27 }]]);
    assert.deepEqual(r.casts.map((c) => `${c.tier}:${c.move}`), [`xiao:${move}`], shape);
    assert.equal(r.casts[0].cost, D.lingli.cost.xiao);
  }
});

test('a thrust vs a drift vs a tremble: only the quick one throws', () => {
  assert.equal(play([['jian', 600, still], ['jian', 1500, { len0: 0.2, len1: 0.26 }]]).casts.length, 0, 'drifting nearer over 1.5 s');
  assert.equal(play([['zhang', 400, still], ['zhang', 200, { len0: 0.2, len1: 0.21 }], ['zhang', 200, { len0: 0.21, len1: 0.2 }]]).casts.length, 0, 'a 5 % tremble');
  assert.equal(play([['wu', 600, still], ['wu', 200, PUSH]]).casts.length, 0, 'a 文 pushed is no move');
  assert.equal(play([['jian', 600, still], ['jian', 200, PUSH]]).casts.length, 1);
});

test('法术: 文 → 扣 (the fist glows, 灵力 paid) → a push releases it; just opening the hand casts nothing', () => {
  for (const [wen, spell] of [['wu', 'huodan'], ['zi', 'bingzhui'], ['you', 'jinren'], ['mao', 'muteng'], ['yuqing', 'tuqiang']]) {
    const before = play([[wen, 500, still], ['fist', 600, still]]);
    assert.deepEqual(before.types, [`wen:${spell}`, `kou:${spell}`], spell);
    assert.equal(before.held[0].glow, kit.spells[spell].glow, `${spell}: the fist glows`);
    assert.ok(before.s.lingli.now < D.lingli.start, 'paid at the 扣');
    const r = play([['fist', 200, PUSH], ['zhang', 300, { len0: 0.27 }]], { state: before.s });
    assert.deepEqual(r.casts.map((c) => `${c.tier}:${c.move}:${c.element}`), [`fa:${spell}:${D.elements[spell]}`], spell);
    assert.equal(r.casts[0].hand, 'Right');
    assert.ok(r.casts[0].left > 0.8);
    const opened = play([['zhang', 800, still]], { state: before.s });
    assert.equal(opened.casts.length, 0, `${spell}: opening without a push`);
  }
});

test('a held spell fades if held too long (paid, 白掐一回); a fist holding one never punches 拳劲', () => {
  const held = play([['wu', 500, still], ['fist', kit.spells.knobs.fadeMs + 600, still]]);
  assert.ok(held.types.includes('fade:huodan'));
  const r = play([['wu', 500, still], ['fist', 600, still], ['fist', 200, PUSH]]);
  assert.deepEqual(r.casts.map((c) => c.move), ['huodan'], 'the push let the spell go — no 拳劲 with it');
});

test('lanes: where the hand stands, mirrored — the camera\'s left is the player\'s right', () => {
  assert.equal(laneOf(placed(poseOf(S.jian), 0.85, 0.8, 0.2), kit), 'left');
  assert.equal(laneOf(placed(poseOf(S.jian), 0.5, 0.8, 0.2), kit), 'middle');
  assert.equal(laneOf(placed(poseOf(S.jian), 0.15, 0.8, 0.2), kit), 'right');
  const r = play([['jian', 600, { x: 0.85, len0: 0.2 }], ['jian', 200, { x: 0.85, ...PUSH }]]);
  assert.equal(r.casts[0].lane, 'left');
  assert.equal(r.casts[0].laneIndex, 0);
});

test('大招: the four seals in order fire the 火蛋 on the last — no push; stray shapes along the way are no 走火', () => {
  const r = play([['zhang', 500, still], [null, 200], ['jian', 500, still], [null, 200], ['fist', 300, still], ['shen', 500, still], [null, 200], ['wu', 500, still]], { state: duelFill(duelStart(kit, { set: 'phone' }), kit, 'boss') });
  const da = r.casts.filter((c) => c.tier === 'da');
  assert.deepEqual(da.map((c) => c.move), ['huodan4']);
  assert.ok(!r.types.some((x) => x.startsWith('fizzle')));
});

test('灵力: costs by tier, a slow refill, dry when short (nothing happens), filled when a 大妖 steps out', () => {
  assert.ok(D.lingli.cost.xiao < D.lingli.cost.fa && D.lingli.cost.fa < D.lingli.cost.da);
  const empty = { ...duelStart(kit), lingli: { now: 0, max: D.lingli.max } };
  const r = play([['jian', 400, still], ['jian', 200, PUSH]], { state: empty });
  assert.deepEqual(r.types.filter((x) => x.startsWith('dry')), ['dry:feijian']);
  assert.equal(r.casts.length, 0);
  const rest = play([[null, 2000]], { state: empty });
  assert.ok(Math.abs(rest.s.lingli.now - D.lingli.refill * 2) < 1, `refill ${rest.s.lingli.now}`);
  assert.equal(duelFill(empty, kit, 'boss').lingli.now, D.lingli.max);
  const noHold = play([['wu', 500, still], ['fist', 600, still]], { state: empty });
  assert.ok(noHold.types.includes('dry:huodan') && !noHold.held.length, 'too little to hold a spell: the fist holds nothing');
});

test('五行 combos and the counter element, as rules the game applies', () => {
  const cast = (move) => ({ type: 'cast', move, element: D.elements[move] });
  const plain = strike(cast('jinren'), { element: 'huo', status: {} }, kit, 1000);
  assert.equal(plain.dmg, D.effects.jinren.dmg);
  const bound = strike(cast('jinren'), { element: 'huo', status: { rooted: 3000 } }, kit, 1000);
  assert.equal(bound.combo, 'chanfa');
  assert.equal(bound.dmg, D.effects.jinren.dmg * 2, '木藤 roots, 金刃 cuts for double');
  const steam = strike(cast('huodan'), { element: 'tu', status: { chilled: 5000 } }, kit, 1000);
  assert.equal(steam.combo, 'zhengqi');
  assert.equal(steam.lane, true);
  assert.equal(steam.show, 'steam');
  assert.equal(steam.clear, 'chilled');
  const old = strike(cast('huodan'), { element: 'tu', status: { chilled: 500 } }, kit, 1000);
  assert.equal(old.combo, null, 'the chill has worn off');
  const counter = strike(cast('huodan'), { element: 'jin', status: {} }, kit, 0);
  assert.equal(counter.counter, true, '火克金');
  assert.equal(counter.dmg, D.effects.huodan.dmg * D.counter.mult);
  assert.deepEqual(strike(cast('muteng'), { status: {} }, kit, 100).status, { rooted: 100 + D.effects.muteng.status.rooted });
  assert.deepEqual(Object.keys(D.counter.beats).sort(), ['huo', 'jin', 'mu', 'shui', 'tu']);
});
