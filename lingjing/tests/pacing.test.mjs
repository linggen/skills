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
import { convertRate } from '../scripts/rules/playpay.mjs';
import { play, playersOf } from '../tools/balance.mjs';

process.env.LINGJING_STAMINA_LIMIT = '0';
const content = loadContent();
const MAX = 3;
// The players the pacing tool plays (playersOf: the economy's when balance.json model.econ.on, design.md § 耗材).
const players = playersOf(content);
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
    // A gate asking a share of the layer (2026-11-10) at or under the hold's opens under it; one asking more would never open.
    for (const g of gates.filter(x => x.tier === (h.tier ?? first) && x.layer === h.layer && !(x.share != null && x.share <= h.share))) {
      const at = order.indexOf(g.scene);
      if (at >= order.indexOf(h.until) || at < 0) continue; // a gate at the hold's own scene: let go as he stands there
      // A gate before the hold lifts may stand only where the hold's 回 is not his yet (a later 回's hold, on an older layer).
      assert.ok(g.hui !== hui, `${hui}: the share hold on ${h.layer}层 until ${h.until} outlasts ${g.scene}'s gate on ${g.share != null ? `its ${g.share}` : 'its 圆满'}`);
    }
  }
  assert.ok(n >= 6, 'the share holds of 古四 through 古八');
});

test('gates climb (the lint): no gate asks the layer the highest gate before it already asked full; one asking lower is a named catch-up; inside a layer its shares rise to 圆满', () => {
  // 古六's eve asks 三层圆满 again after the 石室's wm-kaikai@3: passed above by a fresh save (it stands at 四层 there), it holds a save
  // that came through the 石室 before its gates (2026-10-31) — he steps into 褚先生's 「四层」 there.
  const CATCH_UP = { 'wm-qianye@3': 'a save from before the 石室 gates' };
  const first = content.ladder.tiers[0].id;
  const order = runs.typical.trace.map(t => t.id);
  // A share of the layer (a step inside it, 2026-11-10) ranks under the layer full: shares rise, 圆满 last.
  const rank = g => content.ladder.tiers.findIndex(t => t.id === (g.tier ?? first)) * 100 + g.layer - (g.share != null ? 1 - g.share : 0);
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

// ── 剧情-游戏-剧情 (Hanli 2026-11-10: 「不一定是两段式的剧情-游戏到圆满-剧情, 可以是剧情-游戏-剧情-游戏-剧情-游戏到圆满-剧情突破」 ·
// 「可以，按 2 天来」): inside a layer the story comes out in stretches, each opened by a share of the bar (a gate's `share`),
// the last 圆满. The typical player plays only small games at most MAX_WAIT model days between two beats of story.
// A beat is a scene of the book — or, since 2026-11-10 (Hanli: 「短剧情你要补的话, 放差事里吧, 可以设计一个连环多步骤差事, 给些
// 奖励.」), a step of a 连环差事 (quests' `chain`) taken and handed in: the rule counts it as a beat, and nothing else changed —
// a gate's wait is split only where such a step lands inside it (tools/balance.mjs play: `gap`). 七层's exception is gone:
// 九节菖蒲's two steps a layer break 七 · 八 · 九层's waits.
const MAX_WAIT = 2;
// 2026-11-12 (修为不要超过上限, 超过后换算为灵石奖励): past the cap the rest is 灵石, never banked to come back at the 石室's door,
// so 古五's 石室 gate (wm-kaikai, 三层圆满 inside the sealed 秘境) waits its rooms' boards. Set to 3.25 on 2026-11-12 with the
// 耗材 numbers (design.md § 耗材): inside the sealed 石室 no paid sink reaches him (no 闭关, no run), and 三层 grew ~7% (3.22 days).
const WAIT_EXCEPT = { 'wm-kaikai': 3.25 };
test('the typical player waits at most MAX_WAIT days of only small games between two beats of story (a scene, or a 连环差事\'s step)', () => {
  for (const g of runs.typical.gates) {
    assert.ok((g.gap ?? g.days ?? 0) <= (WAIT_EXCEPT[g.scene] ?? MAX_WAIT), `${g.scene} (${g.layer.step}层): ${(g.gap ?? g.days)?.toFixed(2)} days of play between beats — add a share gate earlier in the layer, or a chain step`);
  }
  // The chain's steps are beats the walk takes, in order, two a layer through 七 · 八 · 九层 — and, before 看炉, the master's
  // seal (师父传印: guan-jiujie-4a, right after 秦雁's in 八层).
  const chain = runs.typical.beats.filter(b => b.kind === 'chain');
  assert.deepEqual(chain.map(b => b.id), ['guan-jiujie-1', 'guan-jiujie-2', 'guan-jiujie-3', 'guan-jiujie-4', 'guan-jiujie-4a', 'guan-jiujie-5', 'guan-jiujie-6']);
  assert.deepEqual(chain.map(b => b.step), [7, 7, 8, 8, 8, 9, 9]);
});

test('the share gates as data (2026-11-10, a proposal for Hanli): 一层 at 点卯 and the 执事房, 五层 at the 丹房 and 这一年, 六层 at 鯥 and 碾药 — each before its layer\'s 圆满, never at the door that 圆满 is held at', () => {
  const parts = gatesOf(content).filter(g => g.share != null).map(g => `${g.scene}@${g.layer}:${g.share}`);
  assert.deepEqual(parts, ['wm-dianmao@1:0.4', 'wm-zhishi@1:0.7', '09-danfang@5:0.4', '09-year@5:0.6', '09-xie@6:0.3', '09-nianyao@6:0.7']);
  for (const g of gatesOf(content).filter(x => x.share != null)) {
    const sc = Object.values(content.chapters).map(ch => ch.scenes[g.scene]).find(Boolean);
    for (const id of g.exits) {
      const to = sc.exits.find(e => e.id === id)?.next;
      const held = gatesOf(content).find(x => x.scene === to && x.share == null);
      const toSc = to && Object.values(content.chapters).map(ch => ch.scenes[to]).find(Boolean);
      assert.ok(!held || (toSc.show ?? []).some(c => c.card === 'board'), `${g.scene}/${id}: the door ${to}'s 圆满 is held at — one stop, not two`);
    }
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

test('a share hold stops the bar at its share: past it the 修为 is 灵石 (Hanli 2026-11-12: 「超过后换算为灵石奖励」) and the cap\'s words say why; the layer steps no further', () => {
  const mark = Math.floor(0.6 * th[4]);
  assert.equal(shareMark(content, atDabi(0)), mark);
  const s = atDabi(mark - 10), w0 = s.wealth;
  // A story lump (the `gate` table, a scene's own 修为) past the mark: what fits lands, the rest is 灵石 — nothing banked.
  const paid = pay(content, s, ctx, { table: 'gate', progress: 400 });
  assert.equal(s.progress, mark, 'the bar at the mark');
  assert.equal(s.banked, undefined, 'nothing waits in the 丹田');
  assert.deepEqual([paid.progress, paid.converted.progress], [10, 390], 'the pay says what landed and what did not fit');
  assert.equal(s.wealth - w0, paid.wealth, 'the rest paid as 灵石');
  assert.deepEqual(capLook(content, s, 'zh'), { say: content.ladder.caps.say.zh, share: true }, 'the cap\'s own line');
  assert.equal(look(s, content, ctx).capped?.say, content.ladder.caps.say.zh, 'Look hands the page the 「走剧情破境 ›」 chip');
  assert.equal(underCap(content, s, 'qi', 5), false, 'no step past 四层');
  // A fight or a board past the mark is 灵石 the same way.
  const f = atDabi(mark), w1 = f.wealth;
  const fought = pay(content, f, ctx, { table: 'play', progress: 40, wealth: 0 });
  assert.equal(f.progress, mark);
  assert.ok(fought.converted && f.wealth > w1, 'converted to 灵石');
});

test('a save that holds a bank (`banked`, before 2026-11-12) is settled once on load: onto the bar up to its cap, the rest 灵石; a save already past a share is never pulled down', () => {
  const mark6 = Math.floor(0.6 * th[4]), mark8 = Math.floor(0.8 * th[4]);
  const held = { ...atDabi(mark6), banked: 300 };
  const once = settleHeld(content, held);
  assert.deepEqual([once.progress, once.banked, once.wealth > held.wealth], [mark6, undefined, true], 'still before wm-jiejing: the bank is 灵石');
  assert.equal(settleHeld(content, once), once, 'idempotent: settled once, then nothing moves');
  const on = settleHeld(content, { ...held, scene: 'wm-jiejing' });
  assert.deepEqual([on.progress, on.banked], [mark8, undefined], 'at wm-jiejing: up to 0.8, the rest 灵石');
  // 古七 holds 0.8 on to 09-jiuge, the scene before 定风; past every hold the bank lands whole (under 四层\'s need).
  const free = settleHeld(content, { ...held, scene: '09-jiuge', chapter: '00-zhuji', done_scenes: [...held.done_scenes, 'wm-jiejing', 'wm-heluo', '09-snow'] });
  // 396 + 300 is past 四层's need (660): full at its need, the 36 past it 灵石 (9 at 0.25 a 修为).
  assert.deepEqual([free.step, free.progress, free.banked, free.wealth - held.wealth], [4, Math.min(mark6 + 300, th[4]), undefined, Math.max(1, Math.round((mark6 + 300 - th[4]) * convertRate(content, free)))], 'past every hold: on the bar up to 四层\'s need, 四层 still (定风 ahead)');
  // An old save past the share keeps its bar; what comes now is 灵石.
  const old = atDabi(th[4] - 5), w0 = old.wealth;
  assert.equal(settleHeld(content, old), old, 'never pulled down');
  pay(content, old, ctx, { table: 'gate', progress: 400 });
  assert.equal(old.progress, th[4] - 5);
  assert.ok(old.wealth > w0 && old.banked === undefined);
});
