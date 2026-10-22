// 人间功课 as cultivation (Hanli, 2026-10-22: 「游戏里还要有和其他app如cfo, shifu, health等互动」 → 「可以」):
// a chore's `kind` (the app's word) read through worlds/jiuding/gongke.json into its meaning in the
// book — a name on the 洞府's board, facts for 银月, a little 灵石 and 修为 and a chore-only thing on
// top of the chore's own pay; capped per day, paid once per occurrence, a week row once a week; the
// 净炉符 lifting the next 开炉; the two prologue gates (开府 on meeting 银月, the rest on 入门) and the
// 灵石 a 开府 step earned between them landing at the second; a scratch save's own quests; no app named.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { lint, loadContent } from '../scripts/content.mjs';
import { gatesOf, lockedOf, newState } from '../scripts/state.mjs';
import { VERBS, look } from '../scripts/rules.mjs';
import { gongkeBoard, meaningGrant, meaningOf } from '../scripts/rules/gongke.mjs';
import { questDone } from '../scripts/rules/chores.mjs';
import { roll } from '../scripts/rules/fantong-roll.mjs';
import { GRADES } from '../scripts/rules/fantong.mjs';
import { gongkeHtml } from '../scripts/gongke.js';
import { pouchHtml } from '../scripts/pouch.js';
import { bookChipHtml, WORDS } from '../scripts/cards.js';
import { TO_WAIMEN, walk } from './prologue.mjs';
import { MOMENTS } from '../scripts/voice.js';
import { MOMENTS as HER_MOMENTS, POOLS } from '../scripts/hersay.js';

const content = loadContent();
const ROOT = path.resolve(import.meta.dirname, '..');
const NOW = new Date('2026-10-22T12:00:00');
const T = id => ({ zh: `做${id}`, en: `Do ${id}` });
// Fixed chores (no pool): each shows and pays every day, so the tests need no pick.
const chore = (id, kind, extra = {}) => ({ id, app: 'some-app', period: 'day', due: true, reward: 20, stamina: 10, device: 'mac', done_at: '2026-10-22T09:00:00', title: T(id), ...(kind ? { kind } : {}), ...extra });
const ctxOf = (quests, now = NOW) => ({ now, quests });
const waimen = () => walk(newState(content, 'zh', NOW), TO_WAIMEN, content, NOW);
const turn = (s, quests, id, now = NOW) => VERBS.quest(s, content, ctxOf(quests, now), { action: 'turn', id });

test('the table lints, names every kind in both languages, and every thing it leaves is a real item', () => {
  assert.deepEqual(lint(content), []);
  for (const [kind, m] of Object.entries(content.gongke.kinds)) {
    assert.ok(m.name.zh && m.name.en && m.about.zh && m.about.en, kind);
    if (m.item) assert.ok(content.items.items.some(i => i.id === m.item), `${kind} → ${m.item}`);
  }
  const bad = structuredClone(content);
  bad.gongke.kinds.body.item = 'no-such-thing';
  bad.gongke.kinds.ledger.wealth = 999;
  const problems = lint(bad).join('\n');
  assert.match(problems, /gongke body.*unknown item no-such-thing/);
  assert.match(problems, /gongke ledger.*over the chore_kind table/);
});

test('mapping: a kind the table knows means something; none, an unknown one, or a 开府 step means nothing more', () => {
  assert.equal(meaningOf(content, chore('a', 'body')).name.zh, '练功');
  assert.equal(meaningOf(content, chore('b', 'sweep')).item, 'jinglu-fu');
  assert.equal(meaningOf(content, chore('c', null)), null);
  assert.equal(meaningOf(content, chore('d', 'juggling')), null);
  assert.equal(meaningOf(content, chore('e', 'ledger', { period: 'once' })), null, '开府 never takes a meaning');
});

test('a chore of a known kind pays its meaning on top: 灵石, its thing in the pouch, the facts for her', () => {
  const s = waimen(), quests = [chore('x-workout', 'body'), chore('x-plain', null)];
  const plain = turn(s, quests, 'x-plain');
  assert.equal(plain.result.ok, true);
  assert.equal(plain.result.meaning, undefined, 'no kind: paid as before, nothing more');
  const out = turn(s, quests, 'x-workout');
  assert.equal(out.result.ok, true);
  const m = out.result.meaning;
  assert.deepEqual([m.kind, m.name, m.paid.wealth, m.paid.item], ['body', '练功', 3, 'chenlian-fu']);
  assert.equal(m.paid.item_name, '晨练符');
  assert.match(m.about, /挑着担子/);
  assert.equal(out.state.bag['chenlian-fu'], 1);
  assert.equal(out.state.wealth, s.wealth + out.result.paid.wealth + 3);
});

test('paid once per occurrence: the same chore again today is refused; tomorrow it pays again', () => {
  const quests = [chore('x-sweep', 'sweep')];
  const one = turn(waimen(), quests, 'x-sweep');
  assert.equal(one.result.meaning.paid.item, 'jinglu-fu');
  const again = turn(one.state, quests, 'x-sweep');
  assert.deepEqual([again.result.ok, again.result.refused], [false, 'already-paid']);
  const tomorrow = new Date('2026-10-23T12:00:00');
  const next = turn(one.state, [chore('x-sweep', 'sweep', { done_at: '2026-10-23T08:00:00' })], 'x-sweep', tomorrow);
  assert.equal(next.result.ok, true);
  assert.equal(next.state.bag['jinglu-fu'], 2);
});

test('capped per day, all kinds together: 灵石 to per_day, things to per_day — and the day after starts fresh', () => {
  const cap = content.gongke.per_day;
  const quests = ['a', 'b', 'c'].map(x => chore(`l-${x}`, 'ledger'));
  let s = waimen(), got = 0;
  const caps = [];
  for (const q of quests) { const out = turn(s, quests, q.id); s = out.state; got += out.result.meaning.paid.wealth; caps.push(Boolean(out.result.meaning.capped)); }
  assert.equal(got, cap.wealth, `${got} of the day's ${cap.wealth}`);
  assert.deepEqual(caps, [false, true, true]);
  const things = ['p', 'q', 'r'].map(x => chore(`s-${x}`, 'sweep'));
  let t = waimen();
  for (const q of things) t = turn(t, things, q.id).state;
  assert.equal(t.bag['jinglu-fu'], cap.items, 'no more things than the day allows');
  const later = new Date('2026-10-23T12:00:00');
  assert.equal(meaningGrant(content, s, chore('l-a', 'ledger'), later).wealth, content.gongke.kinds.ledger.wealth);
});

test('宗门月俸: the ledger kept on enough days of a week pays once, that week', () => {
  const need = content.gongke.kinds.ledger.week.days;
  assert.ok(need >= 2);
  let s = waimen(), stipends = 0;
  for (let d = 0; d < need + 2; d++) {
    const now = new Date(2026, 9, 19 + d, 12); // Monday 10-19 onward, one ISO week
    const q = chore('l-week', 'ledger', { done_at: new Date(2026, 9, 19 + d, 9).toISOString() });
    const out = turn(s, [q], 'l-week', now);
    assert.equal(out.result.ok, true, `day ${d}`);
    if (out.result.meaning.week?.paid) { stipends += 1; assert.equal(d, need - 1, 'paid the day the count is met'); assert.equal(out.result.meaning.week.paid.wealth, content.rewards.tables.chore_week.wealth); }
    s = out.state;
  }
  assert.equal(stipends, 1);
});

test('the 净炉符 lifts the next 开炉 one grade, as a press does, and the two stack', () => {
  const t = content.fantong;
  let lifted = 0;
  for (let i = 0; i < 40; i++) {
    const o = { seed: `gk|${i}`, ids: ['luobo'] };
    const a = roll(t, o), b = roll(t, { ...o, lift: true }), c = roll(t, { ...o, lift: true, press: true });
    if (a.refused || a.event || a.story) continue;
    const g = x => GRADES.indexOf(x.grade);
    assert.ok(g(b) >= g(a), `${i}`);
    assert.ok(g(c) >= g(b), `${i}`);
    if (g(b) > g(a)) lifted += 1;
  }
  assert.ok(lifted > 0);
});

test('a feed with a 净炉符 in the bag spends one, says so, and never spends the thing fed', () => {
  const s = { ...waimen(), bag: { ...waimen().bag, danlu: 1, 'jinglu-fu': 2, luobo: 3 } };
  let out = null;
  for (let i = 0; i < 6 && !out?.result?.lifted; i++) {
    const r = VERBS.fantong({ ...s, fantong: { n: i } }, content, ctxOf([]), { action: 'feed', ids: 'luobo' });
    if (r.result.ok && !r.result.spat_back) out = r;
  }
  assert.ok(out?.result?.lifted, JSON.stringify(out?.result));
  assert.equal(out.result.lifted.id, 'jinglu-fu');
  assert.equal(out.state.bag['jinglu-fu'], 1);
});

test('two gates: before 银月 no 开府; from 00-yinyue 开府 but no chores; from 入门 both, with the board', () => {
  const ch = content.chapters['00-prologue'];
  assert.deepEqual(gatesOf(ch).map(g => g.until), ['00-yinyue', '00-waimen']);
  // The old one-object shape still reads as one gate.
  assert.equal(gatesOf({ locks: { until: 'x', systems: ['road'], say: {} } }).length, 1);
  const quests = [chore('x-workout', 'body'), { id: 'm-1', app: 'some-app', period: 'once', due: true, reward: 50, stamina: 20, device: 'mac', done_at: '2026-10-01T00:00:00Z', title: T('m-1') }];
  const at = scene => ({ ...waimen(), scene, place: waimen().place });
  const before = look(at('00-masan'), content, ctxOf(quests));
  assert.ok(before.locked.includes('kaifu') && before.locked.includes('chores'));
  assert.equal('kaifu' in before, false);
  assert.equal('gongke' in before, false);
  const met = look(at('00-yinyue'), content, ctxOf(quests));
  assert.ok(!met.locked.includes('kaifu') && met.locked.includes('chores'));
  assert.equal(met.kaifu.next.id, 'm-1', '开府 opens on meeting her');
  assert.deepEqual(met.quests.map(q => q.id), ['m-1'], 'no 人间功课 yet — only the 开府 step');
  assert.equal('gongke' in met, false, 'no board before 入门');
  // The 事 chip holds 一次 alone between the gates; none before.
  const c = l => ({ look: l, lang: 'zh', words: WORDS.zh });
  assert.match(bookChipHtml(c(met), false, false), /data-book/);
  assert.equal(bookChipHtml(c(before), false, false), '');
  const inn = look(waimen(), content, ctxOf(quests));
  assert.ok(!(inn.locked ?? []).length);
  assert.ok(inn.kaifu && inn.gongke);
  assert.deepEqual(inn.gongke.rows.map(r => [r.id, r.name]), [['x-workout', '练功']]);
  // Shut verbs say their own gate's line.
  const refused = VERBS.quest(at('00-masan'), content, ctxOf(quests), { action: 'kaifu' }).result;
  assert.deepEqual([refused.refused, refused.say], ['not-yet', ch.locks[0].say.zh]);
  const chores = VERBS.quest(at('00-yinyue'), content, ctxOf(quests), { action: 'turn', id: 'x-workout' }).result;
  assert.deepEqual([chores.refused, chores.say], ['not-yet', ch.locks[1].say.zh]);
});

test('a 开府 step handed in between the gates owes its 灵石; they land on the move the gate opens', () => {
  const quests = [{ id: 'm-1', app: 'some-app', period: 'once', due: true, reward: 50, stamina: 20, device: 'mac', done_at: '2026-10-01T00:00:00Z', title: T('m-1') }];
  let s = newState(content, 'zh', NOW), owed = null;
  for (const step of TO_WAIMEN) {
    s = walk(s, [step], content, NOW);
    if (!owed && !lockedOf(content, s).includes('kaifu') && lockedOf(content, s).includes('wealth')) {
      const out = VERBS.quest(s, content, ctxOf(quests), { action: 'turn', id: 'm-1' });
      assert.equal(out.result.ok, true, JSON.stringify(out.result));
      owed = out.result.owed;
      assert.deepEqual(owed, { wealth: content.rewards.tables.once.wealth });
      assert.equal(out.state.wealth, 0, 'no 灵石 shown before 入门');
      s = out.state;
    }
  }
  assert.ok(owed, 'the walk passed between the gates');
  assert.equal(s.scene, '00-waimen');
  assert.equal(s.owed, undefined, 'landed');
  assert.ok(s.wealth >= owed.wealth, `wealth ${s.wealth}`);
});

test('the board shows facts only: the meaning, the app\'s title, a stamp with the app\'s time, 已领, one tap each', () => {
  const quests = [chore('x-workout', 'body'), chore('x-sweep', 'sweep', { done_at: null }), chore('x-paid', 'ward')];
  let s = waimen();
  s = turn(s, quests, 'x-paid').state;
  const board = gongkeBoard(content, s, quests, NOW, 'zh', questDone);
  const by = Object.fromEntries(board.rows.map(r => [r.id, r]));
  assert.deepEqual([by['x-workout'].done, by['x-workout'].paid, by['x-workout'].adds.item], [true, false, '晨练符']);
  assert.deepEqual([by['x-workout'].adds.wealth, by['x-workout'].adds.progress], [3, 0], 'what lands: 零层 takes no 修为');
  assert.deepEqual([by['x-sweep'].done, by['x-sweep'].done_at], [false, null]);
  assert.equal(by['x-paid'].paid, true);
  assert.ok(by['x-paid'].paid_at);
  assert.equal(board.day.items, 1);
  assert.deepEqual(board.weeks.map(w => w.name), ['宗门月俸']);
  const html = gongkeHtml(board, 'zh');
  assert.match(html, /练功/);
  assert.match(html, /已做 09:00/);
  assert.match(html, /已领 \d\d:\d\d/);
  assert.match(html, /data-do="turn" data-id="x-workout"/);
  assert.doesNotMatch(html, /data-do="turn" data-id="x-paid"/, 'paid: no tap');
  assert.doesNotMatch(html, /[。！？]/, 'no sentence: she says them');
  // The ward stands once its banner is planted at the abode.
  const flown = gongkeBoard(content, { ...s, wear: { abode: 'hushan-qi' } }, quests, NOW, 'zh', questDone);
  assert.equal(flown.ward.name, '护山阵旗');
  assert.match(gongkeHtml(flown, 'zh'), /护山大阵 · 护山阵旗/);
  // In the pouch: its chip, and the pane.
  const l = { ...look(s, content, ctxOf(quests)) };
  const gear = VERBS.gear(s, content, ctxOf(quests), {}).result.gear;
  assert.match(pouchHtml({ lang: 'zh', look: l, gear, words: WORDS.zh }, {}), /data-pouch-pane="gongke"/);
  assert.match(pouchHtml({ lang: 'zh', look: l, gear, words: WORDS.zh }, { pane: 'gongke' }), /人间功课 · 洞府/);
  assert.doesNotMatch(pouchHtml({ lang: 'zh', look: { ...l, gongke: undefined }, gear, words: WORDS.zh }, {}), /data-pouch-pane="gongke"/);
});

test('a scratch save reads its own quests dir; the main save never does', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lingjing-gk-'));
  const dir = path.join(data, 'saves', 'cc-gk', 'quests');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'x.json'), `${JSON.stringify({ app: 'x', quests: [chore('x-fixture', 'body')] })}\n`);
  const code = "import('./scripts/rules/files.mjs').then(m => console.log(JSON.stringify(m.readQuests().map(q => q.id))))";
  const run = env => JSON.parse(spawnSync(process.execPath, ['-e', code], { cwd: ROOT, env: { ...process.env, LINGJING_QUESTS: '', LINGJING_DATA: data, ...env }, encoding: 'utf8' }).stdout);
  assert.deepEqual(run({ LINGJING_SAVE: 'cc-gk' }), ['x-fixture']);
  assert.ok(!run({ LINGJING_SAVE: '' }).includes('x-fixture'), 'the main save reads the apps\' own files');
  fs.rmSync(data, { recursive: true, force: true });
});

test('no app named in the code that reads them: the rules, the board, the table', () => {
  const files = ['scripts/rules/gongke.mjs', 'scripts/gongke.js', 'worlds/jiuding/gongke.json'];
  for (const f of files) {
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/Hanli, 2026-10-22[^)]*\)/g, '');
    assert.doesNotMatch(text, /\b(cfo|shifu|apple-shifu|health|dj|linggen)\b|\b(cfo|shifu|health|dj)-[a-z]+/i, f);
  }
});

test('a hand-in is a moment of hers: the page tells her the facts, and the voice knows the moment', () => {
  assert.deepEqual(MOMENTS.gongke, { who: 'yinyue', priority: 'asked' });
  const src = fs.readFileSync(path.join(ROOT, 'scripts/lingjing.js'), 'utf8');
  assert.match(src, /if \(r\.ok && action === 'turn' && r\.meaning\) tellGongke\(r\)/);
  assert.match(src, /tellYinyue\('gongke'/);
  // Asleep in the 木牌 (most of 卷一), the 木牌's word: a moment of hersay.js, pooled both ways.
  assert.match(src, /herSay\.say\('gongke'/);
  for (const mode of ['awake', 'asleep']) for (const lang of ['zh', 'en']) assert.ok(POOLS[mode][lang].gongke.length >= 2, `${mode} ${lang}`);
  assert.equal(HER_MOMENTS.gongke.group, 'cheer');
});

test('the 护山阵旗 is planted at the abode from the pouch: its tap names the abode, and the board then shows the ward', () => {
  const s0 = { ...waimen(), bag: { ...waimen().bag, 'hushan-qi': 1 } };
  const gear = VERBS.gear(s0, content, ctxOf([]), {}).result.gear;
  const html = pouchHtml({ lang: 'zh', look: look(s0, content, ctxOf([])), gear, words: WORDS.zh }, { sel: 'hushan-qi' });
  assert.match(html, /data-wear="hushan-qi">戴上 · 洞府</);
  const worn = VERBS.trade(s0, content, ctxOf([]), { action: 'use', id: 'hushan-qi' });
  assert.equal(worn.result.ok, true, JSON.stringify(worn.result));
  assert.equal(worn.state.wear.abode, 'hushan-qi');
  assert.equal(look(worn.state, content, ctxOf([chore('x', 'ward')])).gongke.ward.name, '护山阵旗');
});
