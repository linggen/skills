// 切磋 · 演武场 — the daily bout of 格斗 after the 大比 (Hanli 2026-10-28: 「宗门大比的剧情过后, 可以弄一个每天一次的日常比武切磋,
// 让用户玩格斗…和兽潮并列的一个时间触发游戏, 冷却3小时」): the gate, the cooldown from a bout's end (won, lost or put down), one
// bout waiting however long, the opponents and styles in turn, the climb by his realm, the pay and its falling share
// (rules/qiecuo.mjs); and the board's sparring rules (fighter/core.js: her 稳 emptied, she yields; the incense out, a judge).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look, playTo, task, win } from '../scripts/rules.mjs';
import { boutOf, boutShare, climbOf, levelOf, qiecuoHere, qiecuoRow } from '../scripts/rules/qiecuo.mjs';
import * as F from '../scripts/games/fighter.js';
import { rulesOf } from '../scripts/games/fighter/core.js';
import { bot } from '../scripts/games/bots/fighter.js';

const content = loadContent();
const T = content.tasks.tasks.find((t) => t.qiecuo);
const C = T.qiecuo;
const T0 = new Date(2026, 9, 28, 9, 0);
const at = (h, m = 0, d = 28) => new Date(2026, 9, d, h, m);
const ctx = (now) => ({ now, quests: [] });
const row = (s, now) => (look(s, content, ctx(now)).tasks ?? []).find((t) => t.id === T.id) ?? null;

const cache = new Map();
function save(target) {
  if (!cache.has(target)) {
    process.env.LINGJING_STAMINA_LIMIT = '0';
    try { cache.set(target, playTo(content, newState(content, 'zh', T0), target, { now: T0 }).state); } finally { delete process.env.LINGJING_STAMINA_LIMIT; }
  }
  return { ...structuredClone(cache.get(target)), place: 'yanwu', stamina: 100, stamina_at: T0.toISOString() };
}
/* A bout won with its stars, then counted. */
function won(s, now, stars = 3) {
  const w = win(s, content, ctx(now), { id: T.id, stars });
  assert.ok(w.result.ok, `win: ${JSON.stringify(w.result)}`);
  const d = task(w.state, content, ctx(now), { action: 'done', id: T.id });
  assert.ok(d.result.ok, `done: ${JSON.stringify(d.result)}`);
  return d;
}
const AFTER = 'wm-baishi'; // the first scene past the 大比 beat (wm-jiaxin) where he stands free

test('the row: a 格斗 board on a 3 h cooldown from balance.json, opened by the 大比, its opponents 格斗 levels', () => {
  assert.equal(T.game, 'fighter');
  assert.equal(C.every_h, 3);
  assert.equal(C.every_h, content.balance.qiecuo_h, 'the cooldown is balance.json\'s');
  assert.equal(C.after, 'wm-jiaxin');
  assert.ok(content.chapters['00-waimen'].beats.find((b) => b.id === 'dabi').scenes.includes('wm-jiaxin'), 'the 大比 beat\'s');
  for (const o of C.opponents) {
    const l = levelOf(content, o.level);
    assert.ok(l, o.level);
    assert.equal(l.stage.win, 'yield', `${o.id}: a sparring stage`);
    assert.ok(C.lines.some((x) => x.who === o.id), `${o.id}: a frame line`);
  }
  assert.ok(C.styles.length >= 3);
});

test('unlock: never before the 大比 is over; offered after it, at 沉鼎观 only', () => {
  for (const before of ['wm-qianye', 'wm-dabi', 'wm-juesai', 'wm-jiaxin']) assert.equal(row(save(before), T0), null, `${before}: not yet`);
  const s = save(AFTER);
  const r = row(s, T0);
  assert.ok(r, 'offered after the 大比');
  assert.equal(r.status, 'offered');
  assert.equal(r.tide, true, 'a cooldown board: the tray and the 主页 hold it as 兽潮');
  assert.equal(r.leave, true, '收手 is his');
  assert.equal(r.deal.once, true, 'a loss ends the bout');
  assert.equal(r.deal.levels.length, 1);
  assert.ok(look(s, content, ctx(T0)).home.todo.some((x) => x.kind === 'tide' && x.id === T.id && x.qiecuo), 'on the 主页');
  assert.equal(qiecuoHere(content, { ...s, place: 'dukou' }, T.id, T0), false, 'off 沉鼎观');
});

test('cooldown: 3 h from a bout won; one bout waits however long, never two', () => {
  let s = save(AFTER);
  const first = row(s, T0);
  s = won(s, at(9)).state;
  const wait = row(s, at(10));
  assert.ok(wait && wait.wait_min > 0 && !wait.call && wait.status === 'done', 'inside the cooldown: the row waits, no bout dealt');
  assert.ok(look(s, content, ctx(at(10))).waits.some((w) => w.id === T.id), 'a waits row');
  const w = win(s, content, ctx(at(11)), { id: T.id, stars: 3 });
  assert.equal(w.result.ok, false, 'shut inside the cooldown');
  assert.equal(w.result.refused, 'shut');
  const again = row(s, at(12, 1));
  assert.equal(again.status, 'offered', 'open again 3 h on');
  assert.equal(again.bout, first.bout + 1);
  // a day later, still the one bout
  const later = row(s, at(12, 0, 30));
  assert.equal(later.bout, again.bout, 'never stacks');
  assert.equal(later.title, again.title, 'the same bout, however long it waits');
});

test('cooldown: a bout lost or put down (收手) is over too, unpaid; it cannot be rerolled by leaving', () => {
  const s0 = save(AFTER);
  const lost = task(s0, content, ctx(at(9)), { action: 'lost', id: T.id });
  assert.ok(lost.result.ok);
  assert.equal(lost.result.outcome, 'lost');
  assert.equal(lost.state.progress, s0.progress, 'a loss pays nothing');
  assert.ok(row(lost.state, at(10)).wait_min > 0, 'the cooldown runs from the loss');
  const left = task(s0, content, ctx(at(9)), { action: 'leave', id: T.id });
  assert.ok(left.result.ok);
  assert.equal(left.result.outcome, 'skipped');
  assert.ok(row(left.state, at(10)).wait_min > 0, '…and from 收手');
  assert.equal(task(lost.state, content, ctx(at(10)), { action: 'lost', id: T.id }).result.ok, false, 'no second loss inside it');
  // the bout dealt is the save's and n's alone: asked twice, the same
  assert.deepEqual(boutOf(content, s0), boutOf(content, structuredClone(s0)));
});

test('rotation: the style never repeats bout to bout; the opponent met least comes, never the last when another is open', () => {
  let s = save(AFTER), now = at(9);
  const seen = [];
  for (let i = 0; i < 8; i += 1) {
    const b = boutOf(content, s);
    seen.push(b);
    s = task(s, content, ctx(now), { action: 'lost', id: T.id }).state;
    now = new Date(now.getTime() + 3.1 * 3600_000);
  }
  for (let i = 1; i < seen.length; i += 1) assert.notEqual(seen[i].style.id, seen[i - 1].style.id, `bout ${i + 1}: a new style`);
  assert.ok(new Set(seen.map((b) => b.style.id)).size >= 3, 'the styles come round');
  // with more opponents open (as each is painted and added), never the same one twice running, the least met first
  const wide = { ...content, tasks: { ...content.tasks, tasks: content.tasks.tasks.map((t) => (t.qiecuo ? { ...t, qiecuo: { ...t.qiecuo, opponents: [
    { id: 'qinyan', level: 'qiecuo-qinyan' }, { id: 'lufang', level: 'qiecuo-lufang' }, { id: 'qichangsong', level: 'qiecuo-qichangsong' }] } } : t)) } };
  let w = save(AFTER), wn = at(9);
  const foes = [];
  for (let i = 0; i < 9; i += 1) {
    foes.push(boutOf(wide, w).foe.id);
    w = task(w, wide, ctx(wn), { action: 'lost', id: T.id }).state;
    wn = new Date(wn.getTime() + 3.1 * 3600_000);
  }
  for (let i = 1; i < foes.length; i += 1) assert.notEqual(foes[i], foes[i - 1], 'never the same opponent twice running');
  for (const id of ['qinyan', 'lufang', 'qichangsong']) assert.equal(foes.filter((f) => f === id).length, 3, `${id}: met in turn`);
});

test('the climb: with his realm her blows weigh more, her reads come quicker, her footing firms', () => {
  const s = save(AFTER);
  const low = boutOf(content, s), high = boutOf(content, { ...s, tier: 'qi', step: 9 });
  assert.equal(climbOf(content, { tier: 'qi', step: 4 }, C.climb), 0);
  assert.ok(climbOf(content, { tier: 'foundation', step: 3 }, C.climb) > climbOf(content, { tier: 'qi', step: 9 }, C.climb));
  const lv = (b, st) => rulesOf(qiecuoRow(content, st, at(9)).deal.levels[0]).foe;
  const a = lv(low, s), b = lv(high, { ...s, tier: 'qi', step: 9 });
  assert.ok(b.moves.thrust.dmg > a.moves.thrust.dmg, 'heavier');
  assert.ok(b.ai.think < a.ai.think, 'quicker');
  assert.ok(b.bal > a.bal, 'firmer');
});

test('pay: a share of the layer × ★, the day\'s first two in full, then the replay\'s falling share', () => {
  const pp = content.balance.play_pay;
  let s = save(AFTER), now = at(8);
  const got = [];
  for (let i = 0; i < 5; i += 1) {
    const before = s.progress, need = s.tier === 'qi' ? content.ladder.tiers[0].thresholds[s.step] : null;
    const d = won(s, now);
    got.push({ paid: d.result.paid.progress, share: boutShare(content, s, now), need });
    s = d.state;
    assert.ok(s.progress >= before);
    now = new Date(now.getTime() + 3.05 * 3600_000);
  }
  assert.deepEqual(got.map((g) => g.share), [1, 1, pp.replay[1], pp.replay[2], pp.replay[2]]);
  assert.ok(got[0].paid > 0);
  assert.ok(Math.abs(got[0].paid - pp.qiecuo.share * got[0].need) <= 2, `${got[0].paid} ≈ ${pp.qiecuo.share} of ${got[0].need}`);
  assert.ok(got[2].paid < got[1].paid && got[3].paid < got[2].paid, 'falling');
  // the next day, in full again
  const next = boutShare(content, s, at(9, 0, 30));
  assert.equal(next, 1);
});

test('the board: a sparring bout ends when her 稳 is gone (she yields) or the incense is out (a judge); a hand wins every style', () => {
  for (const o of ['qiecuo-qinyan', 'qiecuo-lufang', 'qiecuo-qichangsong']) {
    const L = levelOf(content, o);
    let s = F.newGame('y', 1, { levels: [L] });
    s.foe.bal = 0.5; s.foe.think = 1e9;
    s = F.act(s, { g: 'walk', dir: 1 }).state;
    for (let t = 0; t < 4000 && !s.end; t += 10) { s = F.tick(s, 10); if (Math.abs(s.foe.x - s.me.x) < 100) s = F.act(s, { g: 'light' }).state; }
    assert.equal(s.end?.kind, 'yield', `${o}: she yields`);
    s = F.tick(s, 3000);
    assert.equal(s.won, true);
    let j = F.newGame('j', 1, { levels: [L] });
    j.t = L.time - 20; j.foe.bal = 10; j.foe.think = 1e9;
    j = F.tick(j, 2500);
    assert.equal(j.won, true, `${o}: judged his way when she stands looser`);
  }
  // the human-like hand, against each style at the bottom of the climb, wins within a few tries
  const s = save(AFTER);
  for (const st of C.styles) {
    const b = { ...boutOf(content, s), style: st };
    const L = qiecuoRow(content, s, at(9)).deal.levels[0];
    const lv = { ...L, foe: { ...L.foe, rules: { ...levelOf(content, b.foe.level).foe.rules, ...st.foe } } };
    let wins = 0;
    for (let k = 0; k < 6; k += 1) {
      let g = F.newGame(`bot|${st.id}|${k}`, 1, { levels: [lv] });
      for (let t = 0; t < 200000 && g.live; t += 50) { const a = bot(g, { lead: 180 }); if (a) g = F.act(g, a).state; g = F.tick(g, 50); }
      if (g.won) wins += 1;
    }
    assert.ok(wins >= 1, `${st.id}: the hand wins some (${wins}/6)`);
  }
});
