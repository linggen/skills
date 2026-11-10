// 圆满 lands just before the book's breakthrough (Hanli, 2026-11-03: 「应该让玩家在破镜前的剧情刚好圆满. 不用等破镜太久.」 —
// then 「可以, 两件一起做」: the 石室's 四层圆满 gate dropped, and share holds). The model players (balance.json `model.players`,
// tools/balance.mjs play) and a grinder at his real rate walk 卷一; every run of 古 scenes he leaves held full — the layer at
// its mark, the door to the next shut — is at most MAX scenes. A 今 interlude's scenes count nothing (its bar is the 今 line's).
// The one strand allowed: 卷一's end, where the save waits for 卷二 at 古九's cap.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState, threshold } from '../scripts/state.mjs';
import { look } from '../scripts/rules.mjs';
import { pay } from '../scripts/rules/core.mjs';
import { capLook, settleHeld, shareMark, underCap } from '../scripts/rules/cap.mjs';
import { gatesOf } from '../scripts/rules/gates.mjs';
import { play } from '../tools/balance.mjs';

process.env.LINGJING_STAMINA_LIMIT = '0';
const content = loadContent();
const MAX = 3;
const players = content.balance.model.players;
// The grinder: the heavy player who also plays about two side boards a scene (his log, 2026-11-02 at wm-qianye: 四层 48 → 710
// in six actions, about +110 each) — the one who fills a layer the moment its door opens.
const PLAYERS = { ...players, grinder: { ...players.heavy, scene_share: 0.35 } };
const END = new Set(Object.values(content.chapters).filter(ch => ch.juan === 1).flatMap(ch => Object.values(ch.scenes)).filter(sc => sc.hui === 'h10').map(sc => sc.id));

/* Every run of scenes left held full on one layer, 今 scenes passed through and not counted: [{key, from, to, next, n}]. */
export function heldRuns(trace) {
  const out = [];
  for (let k = 0; k < trace.length; k += 1) {
    if (!trace[k].held || trace[k].line) continue;
    let j = k;
    const same = x => x.tier === trace[k].tier && x.step === trace[k].step;
    while (j + 1 < trace.length && same(trace[j + 1]) && (trace[j + 1].held || trace[j + 1].line)) j += 1;
    const n = trace.slice(k, j + 1).filter(x => !x.line).length;
    out.push({ key: `${trace[k].tier}${trace[k].step}`, from: trace[k].id, to: trace[j].id, next: trace[j + 1]?.id ?? null, n });
    k = j;
  }
  return out;
}

const runs = Object.fromEntries(Object.entries(PLAYERS).map(([who, p]) => [who, play(content, p)]));

test('圆满 lands within MAX scenes of the breakthrough for every player, the grinder too — 卷一\'s end alone waits longer', () => {
  for (const [who, r] of Object.entries(runs)) {
    assert.ok(r.trace.length > 100, `${who}: the walk reaches 卷一's end`);
    for (const x of heldRuns(r.trace).filter(x => x.n > MAX && !END.has(x.from))) {
      assert.fail(`${who}: ${x.key} held full ${x.n} scenes, ${x.from} … ${x.to} → ${x.next} — move a gate or a share hold (ladder caps.hui) so 圆满 lands near the breakthrough`);
    }
  }
});

test('the share holds as data: each names a layer, a share under one and a scene of the book; none outlasts a gate asking its layer full (it would never open)', () => {
  const first = content.ladder.tiers[0].id;
  const order = runs.typical.trace.map(t => t.id);
  const gates = gatesOf(content);
  let n = 0;
  for (const [hui, cap] of Object.entries(content.ladder.caps.hui).filter(([id]) => !id.startsWith('_'))) for (const h of cap.holds ?? []) {
    if (h.share == null) continue;
    n += 1;
    assert.ok(h.share > 0 && h.share < 1, `${hui}: share ${h.share}`);
    assert.ok(order.includes(h.until), `${hui}: ${h.until} on the walk`);
    for (const g of gates.filter(x => x.tier === (h.tier ?? first) && x.layer === h.layer)) {
      const at = order.indexOf(g.scene);
      if (at >= order.indexOf(h.until) || at < 0) continue; // a gate at the hold's own scene: let go as he stands there
      // A gate before the hold lifts may stand only where the hold's 回 is not his yet (a later 回's hold, on an older layer).
      assert.ok(g.hui !== hui, `${hui}: the share hold on ${h.layer}层 until ${h.until} outlasts ${g.scene}'s gate on its 圆满`);
    }
  }
  assert.ok(n >= 6, 'the share holds of 古四 through 古八');
});

test('gates climb (the lint): no gate asks the layer the highest gate before it already asked full; one asking lower is a named catch-up', () => {
  // 古六's eve asks 三层圆满 again after the 石室's wm-kaikai@3: passed above by a fresh save (it stands at 四层 there), it holds a save
  // that came through the 石室 before its gates (2026-10-31) — he steps into 褚先生's 「四层」 there.
  const CATCH_UP = { 'wm-qianye@3': 'a save from before the 石室 gates' };
  const first = content.ladder.tiers[0].id;
  const order = runs.typical.trace.map(t => t.id);
  const rank = g => content.ladder.tiers.findIndex(t => t.id === (g.tier ?? first)) * 100 + g.layer;
  const gates = Object.entries(content.ladder.caps.hui).filter(([id]) => !id.startsWith('_')).flatMap(([, c]) => c.gates ?? [])
    .map(g => ({ ...g, key: `${g.scene}@${g.layer}`, at: order.indexOf(g.scene) })).sort((a, b) => a.at - b.at);
  assert.ok(gates.every(g => g.at >= 0), 'every gate on the walk');
  let top = null;
  for (const g of gates) {
    if (top && rank(g) < rank(top)) { assert.ok(CATCH_UP[g.key], `${g.key} asks less than ${top.key} before it: a catch-up, or stale`); continue; }
    if (top && rank(g) === rank(top)) { assert.ok(CATCH_UP[g.key], `${top.key} → ${g.key}: the same layer asked full twice in a row`); continue; }
    top = g;
  }
});

// ── the share hold, in the rules (rules/cap.mjs shareMark · rebank, core.mjs pay) ──
const NOW = new Date('2026-11-03T12:00:00');
const ctx = { now: NOW, quests: [] };
const th = content.ladder.tiers[0].thresholds;
/* 古六 at the 大比: 四层, its share hold 0.6 until wm-jiejing (ladder caps.hui.h08). */
const atDabi = (progress, extra = {}) => ({ ...newState(content, 'zh', NOW), chapter: '00-waimen', scene: 'wm-lun2', place: 'waimen', ended: ['00-prologue'],
  done_scenes: ['wm-mijing', 'wm-kaikai', 'wm-xiqi', 'wm-chu', 'wm-hetan', 'wm-luobo', 'wm-yaban', 'wm-qianye', 'wm-koujue', 'wm-zhaojing', 'wm-laba', 'wm-dabi', 'wm-lun1', 'wm-fushi', 'wm-shuigang'],
  tier: 'qi', step: 4, progress, traits: ['wood', 'water', 'fire', 'earth', 'metal'], stamina: 100, stamina_at: NOW.toISOString(), lang: 'zh', ...extra });

test('a share hold stops the bar at its share: past it the 修为 waits in the 丹田 (banked, 一分不丢) and the cap\'s words say why; the layer steps no further', () => {
  const mark = Math.floor(0.6 * th[4]);
  assert.equal(shareMark(content, atDabi(0)), mark);
  const s = atDabi(mark - 10);
  // A story lump (the `gate` table, a scene's own 修为 — no table that turns 修为 to 灵石) banks past the mark.
  const paid = pay(content, s, ctx, { table: 'gate', progress: 400 });
  assert.equal(s.progress, mark, 'the bar at the mark');
  assert.ok(s.banked > 0, 'the rest banked');
  assert.ok(paid.hold?.cap, 'the pay says it was held');
  assert.deepEqual(capLook(content, s, 'zh'), { say: content.ladder.caps.say.zh, share: true }, 'the cap\'s own line');
  assert.equal(look(s, content, ctx).capped?.say, content.ladder.caps.say.zh, 'Look hands the page the 「走剧情破境 ›」 chip');
  assert.equal(underCap(content, s, 'qi', 5), false, 'no step past 四层');
  // A fight or a board past the mark is 灵石, as at 圆满 (rewards.json xiuwei_to_lingshi: 刷怪, 刷副本).
  const f = atDabi(mark), w0 = f.wealth;
  const fought = pay(content, f, ctx, { table: 'play', progress: 40, wealth: 0 });
  assert.equal(f.progress, mark);
  assert.ok(fought.converted && f.wealth > w0, 'converted to 灵石');
});

test('the story reaches the hold\'s scene: the bank comes back on load, up to the next mark; a save already past a share is never pulled down', () => {
  const mark6 = Math.floor(0.6 * th[4]), mark8 = Math.floor(0.8 * th[4]);
  const held = { ...atDabi(mark6), banked: 300 };
  assert.equal(settleHeld(content, held), held, 'still before wm-jiejing: nothing moves');
  const on = settleHeld(content, { ...held, scene: 'wm-jiejing' });
  assert.deepEqual([on.progress, on.banked], [mark8, mark6 + 300 - mark8], 'up to 0.8, the rest still banked');
  // 古七 holds 0.8 on to 09-jiuge, the scene before 定风 (2026-11-10, Hanli: 「满了后的下一场剧情是突破」; was let go at 09-snow).
  const snow = settleHeld(content, { ...held, scene: '09-snow', chapter: '00-zhuji', done_scenes: [...held.done_scenes, 'wm-jiejing', 'wm-heluo'] });
  assert.deepEqual([snow.step, snow.progress, snow.banked], [4, mark8, mark6 + 300 - mark8], 'at 09-snow: still 0.8, the rest banked');
  const free = settleHeld(content, { ...snow, scene: '09-jiuge', done_scenes: [...snow.done_scenes, '09-snow'] });
  assert.deepEqual([free.step, free.progress, free.banked], [4, mark6 + 300, undefined], 'past every hold: all of it back, 四层 still (定风 ahead)');
  // An old save past the share keeps its bar; what comes now is banked.
  const old = atDabi(th[4] - 5);
  assert.equal(settleHeld(content, old), old, 'never pulled down');
  pay(content, old, ctx, { table: 'gate', progress: 400 });
  assert.equal(old.progress, th[4] - 5);
  assert.ok(old.banked > 0);
  assert.ok(threshold(content, old) > old.progress);
});
