// 圆满 lands just before the book's breakthrough (Hanli, 2026-11-03: 「应该让玩家在破镜前的剧情刚好圆满. 不用等破镜太久.」):
// the model players (balance.json `model.players`, tools/balance.mjs play) walk 卷一, and every run of scenes he leaves held
// full — the layer at its mark, the door to the next shut (a gate ahead, a hold, the 回's cap) — is at most MAX scenes long.
// A strand longer than that is named in KNOWN with its length and why, so it can shrink but never grow, and no new one creeps in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { play } from '../tools/balance.mjs';

const content = loadContent();
const MAX = 3;
/* `tier+step`: the longest run any model player walks held there, and why it stands (open questions for Hanli, 2026-11-03). */
const KNOWN = {
  qi2: { max: 11, why: '二层: 二层巅峰 the night before the 秘境 (wm-baoming) to 「第一天夜里，二层圆满」 in the 石室 (wm-kaikai) — the book\'s; held by h07 `holds` through the sealed rooms' },
  qi4: { max: 29, why: '四层: 圆满 in the 石室 (wm-xiqi@4 and wm-kaikai\'s 760 lump; Hanli 10-28 「故事里是4层圆满」) to 定风 (09-furnace@4) — the whole of 古六' },
  qi5: { max: 5, why: '五层: the 四层 修为 banked past its mark across 古六 carries straight through 五层 after 定风 (follows qi4)' },
  qi9: { max: 4, why: '九层: 入秋 (09-yanceng@9) to the cliff\'s breakthrough (09-cliff) — the 筑基 throw is the player\'s own' },
  foundation0: { max: 5, why: '筑基初: the cliff to 古九 (h09\'s cap is 练气九层; 筑基 is ground from 古九\'s cap on)' },
  foundation2: { max: 9, why: '筑基小成: 古九\'s cap, the end of 卷一 (卷二 · 即将开放)' },
};

/* Every run of consecutive scenes left held full on one layer: [{key, from, to, next, n}]. */
export function heldRuns(trace) {
  const out = [];
  for (let k = 0; k < trace.length; k += 1) {
    if (!trace[k].held) continue;
    let j = k;
    while (j + 1 < trace.length && trace[j + 1].held && trace[j + 1].tier === trace[k].tier && trace[j + 1].step === trace[k].step) j += 1;
    out.push({ key: `${trace[k].tier}${trace[k].step}`, from: trace[k].id, to: trace[j].id, next: trace[j + 1]?.id ?? null, n: j - k + 1 });
    k = j;
  }
  return out;
}

test('圆满 lands within a few scenes of the breakthrough (2026-11-03): no run held full longer than MAX, the known strands named and never longer', () => {
  for (const [who, player] of Object.entries(content.balance.model.players)) {
    const runs = heldRuns(play(content, player).trace);
    assert.ok(runs.length, `${who}: the walk reports where he is held`);
    for (const r of runs.filter(x => x.n > MAX)) {
      const known = KNOWN[r.key];
      assert.ok(known, `${who}: ${r.key} held full ${r.n} scenes, ${r.from} … ${r.to} → ${r.next} — move a gate, a hold or a lump so 圆满 lands near the breakthrough`);
      assert.ok(r.n <= known.max, `${who}: ${r.key} held ${r.n} scenes, longer than the known ${known.max} (${known.why})`);
    }
  }
});

test('gates climb (the lint): no gate asks the layer the highest gate before it already asked full; one asking lower is a named catch-up', () => {
  // The gates in the book's order. A later gate on the same layer strands him between them (2026-11-03: 09-year@4 behind 09-furnace@4);
  // a lower one is passed above by a fresh save and holds only a save from before it (a catch-up).
  const CATCH_UP = { 'wm-qianye@3': 'for a save that came through the 石室 before its gates (2026-10-31): 四层 for 褚先生\'s 「四层」' };
  const SAME = { 'wm-xiqi@4 → 09-furnace@4': 'the qi4 strand above: the book\'s 四层圆满 in the 石室 (10-28) against 圆满 just before 定风 (11-03) — Hanli\'s call' };
  const first = content.ladder.tiers[0].id;
  const order = play(content, content.balance.model.players.typical).trace.map(t => t.id);
  const rank = g => content.ladder.tiers.findIndex(t => t.id === (g.tier ?? first)) * 100 + g.layer;
  const gates = Object.entries(content.ladder.caps.hui).filter(([id]) => !id.startsWith('_')).flatMap(([, c]) => c.gates ?? [])
    .map(g => ({ ...g, key: `${g.scene}@${g.layer}`, at: order.indexOf(g.scene) })).sort((a, b) => a.at - b.at);
  assert.ok(gates.every(g => g.at >= 0), 'every gate on the walk');
  let top = null;
  for (const g of gates) {
    if (top && rank(g) < rank(top)) { assert.ok(CATCH_UP[g.key], `${g.key} asks less than ${top.key} before it: a catch-up, or stale`); continue; }
    if (top && rank(g) === rank(top)) assert.ok(SAME[`${top.key} → ${g.key}`], `${top.key} → ${g.key}: the same layer asked full twice in a row`);
    top = g;
  }
});
