// 修为 caps per 回 (Hanli, 2026-10-05: 「游戏里修炼有个上限吧? 和故事对齐」; rules/cap.mjs):
// a player's own work never carries him ahead of the book's realm line (OUTLINE 境界线,
// DESIGN § 六·八) — the story's jumps (古四's close, 息壤, the year, the cliff) are the
// story's; at the cap the layer fills and the rest is held; a breakthrough past where the
// 回's story reaches is refused in the world's words; after 卷一 it stays 筑基小成; a save
// already past its cap is never pulled down.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lint, loadContent } from '../scripts/content.mjs';
import { newState, stepName, threshold } from '../scripts/state.mjs';
import { look, resolve } from '../scripts/rules.mjs';
import { pay } from '../scripts/rules/core.mjs';
import { capOf } from '../scripts/rules/cap.mjs';
import { earnedFor } from './earn.mjs';

const content = loadContent();
const NOW = new Date('2026-10-05T12:00:00');
const ctx = { now: NOW, quests: [] };
const ROOTS = ['wood', 'water', 'fire', 'earth', 'metal'];

/* A save standing at `scene` of `chapter`, the chapters before it ended. */
const at = (chapter, scene, place, ended, extra = {}) => ({
  ...newState(content, 'zh', NOW), chapter, scene, place, ended, tier: 'qi', step: 0, progress: 0, traits: ROOTS,
  stamina: 100, stamina_at: NOW.toISOString(), ...extra,
});
const gusi = (extra) => at('00-waimen', 'wm-ahe', 'waimen', ['00-prologue'], extra);
const named = s => stepName(content, s.tier, s.step, 'zh');
/* Grind: a hundred 闭关-sized grants, whatever the source — every gain goes through pay. */
const grind = (s, n = 100) => { let got = 0, last = null; for (let i = 0; i < n; i += 1) { last = pay(content, s, ctx, { table: 'seclusion', progress: 90 }); got += last.progress; } return { got, last }; };

test('every 古 回 declares its cap, as the book\'s realm line stands', () => {
  const caps = content.ladder.caps.hui;
  const row = id => { const e = caps[id]; return [`${e.tier}${e.layer}`, e.story ? `${e.story.tier}${e.story.layer}` : null]; };
  assert.deepEqual(Object.fromEntries(Object.keys(caps).map(id => [id, row(id)])), {
    h04: ['qi0', null], // 古三: 入门 at 零层 (the book; the game's too since 2026-10-15)
    h05: ['qi1', 'qi2'], // 古四: the 小周天 → 一层, held through 九月; 十月廿五 二层 by the story (wm-diyilu)
    h07: ['qi2', 'qi4'], // 古五: 二层, 息壤 → 四层
    h08: ['qi4', null], // 古六: 四层, 大比 on 四层
    h11: ['qi6', 'qi7'], // 古七 (its first half since 2026-10-07): 五层 and 六层 ground behind its stage quests (2026-10-16), 年五's autumn → 七层
    h09: ['qi7', 'foundation1'], // 古八: 七层, the years after → 九层圆满, the cliff → 筑基
    h10: ['foundation1', null], // 古九: 筑基小成
  });
  assert.deepEqual(lint(content).filter(p => /cap/.test(p)), []);
});

test('古四: 零层 grinds nothing; past the 小周天 grinding fills 一层 and stays on it — the 修为 counting on past the mark (2026-10-15), the world\'s line by the bar', () => {
  const zero = gusi();
  assert.equal(grind(zero).got, 0, '零层 takes no 修为');
  assert.equal(named(zero), '练气零层');
  assert.equal(look(zero, content, ctx).capped, undefined, '零层 has no bar, so no line under it');
  const s = gusi({ step: 1 });
  const { got, last } = grind(s);
  assert.equal(named(s), '练气一层', '九月\'s roll call: 小满 一层');
  assert.ok(s.progress > threshold(content, s), 'the layer is full, and the 修为 goes on past its mark');
  assert.equal(got, s.progress, 'every grant counted — nothing held back');
  assert.equal(last.hold.cap, true);
  assert.deepEqual([last.hold.held, last.progress], [0, 90], 'at the cap a grant still lands whole');
  assert.equal(last.hold.say, content.ladder.caps.say.zh);
  const l = look(s, content, ctx);
  assert.equal(l.capped.say, content.ladder.caps.say.zh, 'Look carries the line by the full bar');
  assert.ok(l.progress > l.next, 'the bar shows it: 9000/200');
  assert.equal(look({ ...s, progress: 10 }, content, ctx).capped, undefined, 'below the top, no line');
  assert.equal(look(at('00-waimen', 'wm-ahe', 'waimen', ['00-prologue'], { lang: 'en', step: 1, progress: content.ladder.tiers[0].thresholds[1] }), content, ctx).capped.say, content.ladder.caps.say.en);
});

test('古三\'s gate scene: 零层 only — 一层 is 古四\'s 小周天', () => {
  const s = at('00-prologue', '00-waimen', 'waimen', []);
  grind(s);
  assert.equal(named(s), '练气零层');
});

test('古四\'s close lifts him to 二层 (十月廿五, by the story); 古五 grinds no higher until 息壤 carries him to 四层', () => {
  const s0 = at('00-waimen', 'wm-diyilu', 'chaifang', ['00-prologue']);
  const r = resolve(earnedFor(content, s0, 'save'), content, ctx, { exit: 'save' });
  assert.equal(r.result.ok, true, JSON.stringify(r.result));
  let s = r.state;
  assert.equal(named(s), '练气二层', 'lifted, not ground');
  s = { ...s, scene: 'wm-mijing', place: 'shimen' }; // past 今 · 二, at 古五's 秘境 gate
  grind(s);
  assert.equal(named(s), '练气二层', '古五 before the 秘境\'s 息壤: still 二层');
  s = { ...s, scene: 'wm-xirang', place: 'shimen', wins: { ...s.wins, 'mijing-zou': NOW.toISOString() } }; // the fight on the stage, won
  const x = resolve(s, content, ctx, { exit: 'swallow' });
  assert.equal(x.result.ok, true, JSON.stringify(x.result));
  s = x.state;
  assert.equal(named(s), '练气四层', '息壤: the story\'s jump');
  grind(s);
  assert.equal(named(s), '练气四层', 'and 四层 it stays, through 古六');
  assert.ok(s.progress > threshold(content, s), 'full, and counting on');
});

test('古七: 四层 until the year — the seasons lift him to 七层, 古八\'s to 九层圆满, the cliff is the story\'s breakthrough', () => {
  const s = at('00-zhuji', '09-year', 'yaoyuan', ['00-prologue', '00-waimen'], { step: 4 });
  grind(s);
  // Since 2026-10-16 古七 grinds 五层 and 六层 (rules/gates.mjs: each rise waits on the layer below it full); 七层 stays the story's.
  assert.equal(named(s).replace('圆满', ''), '练气六层', 'ground to 六层, never to 七层');
  const cap = capOf(content, s);
  assert.ok(cap.story > cap.grind, 'the 回\'s story reaches past what grinding may');
  // 古八 (09-dabi, the second half since 2026-10-07): 七层 by the story, and grinding holds there.
  const t = at('00-zhuji', '09-dabi', 'yaoyuan', ['00-prologue', '00-waimen'], { step: 7 });
  grind(t);
  assert.equal(named(t), '练气七层', '古八\'s years are the story\'s too');
  const later = capOf(content, t);
  assert.ok(later.story > later.grind, '古八\'s story reaches on to 筑基');
});

test('a breakthrough past where the 回\'s story reaches is refused in the world\'s words', () => {
  // The same cliff in a world whose 古七 stops at 练气: the throw is refused, nothing moves.
  const tight = { ...content, ladder: { ...content.ladder, caps: { ...content.ladder.caps, hui: { ...content.ladder.caps.hui, h09: { tier: 'qi', layer: 9 } } } } };
  const s = at('00-zhuji', '09-cliff', 'houshan', ['00-prologue', '00-waimen'], { step: 9, progress: content.ladder.tiers[0].thresholds[9], bag: { 'foundation-pill-9': 1 } });
  const r = resolve(s, tight, ctx, { exit: 'take' });
  assert.equal(r.result.ok, false);
  assert.equal(r.result.refused, 'past-cap');
  assert.equal(r.result.say, content.ladder.caps.refuse.zh);
  assert.ok(!/系统|上限|cap/i.test(r.result.say), 'the world\'s words, never the system\'s');
  // The shipped 古七 allows it: the cliff is not refused for the cap.
  assert.notEqual(resolve(s, content, ctx, { exit: 'take' }).result.refused, 'past-cap');
  // And the lint refuses data whose scene breaks through past its 回's cap.
  assert.ok(lint(tight).some(p => /09-cliff.*breaks through past the cap of h09/.test(p)));
});

test('卷一\'s end: 古八 over, 卷二 waiting — 筑基小成 filled, and nothing ground carries him past it', () => {
  const ch = content.chapters['01-ji'];
  const s = at('01-ji', null, 'zhangyuan', ['00-prologue', '00-waimen', '00-zhuji', '01-ji'], { tier: 'foundation', done_scenes: Object.keys(ch.scenes) });
  const { got } = grind(s, 300);
  assert.equal(named(s), '筑基小成');
  assert.equal(got, s.progress, 'every grant counted, past the mark');
  assert.equal(look(s, content, ctx).capped.say, content.ladder.caps.say.zh);
  assert.equal(look(s, content, ctx).tier.name, '筑基小成圆满', 'a step filled reads 圆满');
  // In 古八 itself, the same.
  const t = at('01-ji', '01-arrive', 'yecheng', ['00-prologue', '00-waimen', '00-zhuji'], { tier: 'foundation' });
  grind(t, 300);
  assert.equal(named(t), '筑基小成');
});

test('an old save already past its cap is never pulled down: it fills its own step and goes no higher', () => {
  const s = gusi({ step: 6, progress: 40 }); // 练气六层 in 古四, from before the caps
  const l = look(s, content, ctx);
  assert.equal(l.tier.name, '练气六层', 'Look reads it as it is');
  const { got } = grind(s);
  assert.equal(named(s), '练气六层', 'not one layer down, not one up');
  assert.equal(got, s.progress - 40, 'every grant counted, past the mark');
  // 筑基中成 in 古八: kept, filled, held.
  const f = at('01-ji', '01-arrive', 'yecheng', ['00-prologue', '00-waimen', '00-zhuji'], { tier: 'foundation', step: 1, progress: 0 });
  grind(f, 300);
  assert.equal(named(f), '筑基中成');
});
