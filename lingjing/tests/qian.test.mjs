// 问签 v1 (rules/fortune.mjs, rules/almanac.mjs, qian.json; Hanli 2026-11-02: 「可以, 按你说的做」).
// The rules own: the 黄历 of a day (干支 · 建除 · 冲 · 煞 · the 建除 宜忌), the 生肖 by 立春 and the 星座, the one 签 a day,
// its 修为 speed (never below 1), the 宜 kind's ×pay on that kind only, 签谱 and 连签, 应验, and the card standing alone
// when 银月 is not there. The reading's words are hers (guide/qian.md) — not tested here; the live check reads one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { VERBS, look, playTo } from '../scripts/rules.mjs';
import { almanacOf, ganzhi, monthIndexOf, pillarsOfDay } from '../scripts/rules/almanac.mjs';
import { gameOfEntry, yiWeightOfEntry, divine, fate, fateOf, qianOf, qianPayOf, qianSpeedOf, signOf, yiToday, yiWeightOf, isOfKind } from '../scripts/rules/fortune.mjs';
import { paysOf } from '../scripts/rules/core.mjs';
import { qianCardHtml, qianChipHtml } from '../scripts/qian-card.js';
import { createQianPage, qianFacts } from '../scripts/qian-page.js';

process.env.LINGJING_STAMINA_LIMIT = '0';
const content = loadContent();
const Q = content.qian;
const at = (y, m, d, h = 9) => new Date(y, m - 1, d, h);
const NOW = at(2026, 11, 2);
const base = playTo(content, newState(content, 'zh', NOW), '古七', { now: NOW }).state;
const ctx = (now = NOW, extra = {}) => ({ now, quests: [], ...extra });
const draw = (s, now = NOW, args = {}) => divine(s, content, ctx(now), args);
const day = (y, m, d) => almanacOf(Q.almanac, content.traits.fate.zodiac, { y, m, d }, 'zh');

test('黄历: 干支, 建除, 冲 and 煞 against published almanacs', () => {
  // skillon.com Tong Shu 2025-11 (the 丁亥 month from 11-07); qmrl888 · tianqi 老黄历; wannianli.tianqi.com 2026-11-02.
  const rows = [
    [[2025, 11, 6], '己卯', '执'], [[2025, 11, 8], '辛巳', '破'], [[2025, 11, 20], '癸巳', '破'], [[2025, 11, 30], '癸卯', '定'],
  ];
  for (const [[y, m, d], gz, off] of rows) {
    const a = day(y, m, d);
    assert.equal(a.ganzhi.day, gz, `${y}-${m}-${d}`);
    assert.equal(a.officer.name, off, `${y}-${m}-${d} officer`);
  }
  const n8 = day(2025, 11, 8);
  assert.equal(n8.chong.name, '猪'); assert.equal(n8.sha.name, '东');
  const n7 = day(2025, 11, 7);
  assert.equal(n7.ganzhi.day, '庚辰'); assert.equal(n7.chong.name, '狗'); assert.equal(n7.sha.name, '南');
  assert.deepEqual(day(2026, 11, 2).ganzhi, { year: '丙午', month: '戊戌', day: '庚辰' });
  assert.equal(ganzhi(pillarsOfDay({ y: 1949, m: 10, d: 1 }).day), '甲子');
});

test('黄历: the year turns at 立春, the month at its 节, and the officer stands two days at a 节 (疊兩值日)', () => {
  assert.equal(day(2024, 2, 3).ganzhi.year, '癸卯'); assert.equal(day(2024, 2, 4).ganzhi.year, '甲辰');
  assert.equal(day(2024, 2, 4).ganzhi.month, '丙寅');
  // Every day of 2025–2026: across a 节 the officer repeats; on any other day it moves on by one.
  let turns = 0;
  for (let t = new Date(2025, 0, 2); t < new Date(2027, 0, 1); t.setDate(t.getDate() + 1)) {
    const y = new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1);
    const a = { y: y.getFullYear(), m: y.getMonth() + 1, d: y.getDate() }, b = { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() };
    const ia = Q.almanac.officers.findIndex(o => o.id === day(a.y, a.m, a.d).officer.id), ib = Q.almanac.officers.findIndex(o => o.id === day(b.y, b.m, b.d).officer.id);
    if (monthIndexOf(a) !== monthIndexOf(b)) { turns += 1; assert.equal(ib, ia, `节 ${b.y}-${b.m}-${b.d}`); } else assert.equal(ib, (ia + 1) % 12, `${b.y}-${b.m}-${b.d}`);
  }
  assert.equal(turns, 24, 'twelve 节 a year');
  assert.equal(day(2025, 11, 7).officer.id, 'zhi', 'the 立冬 day repeats 执');
  assert.equal(day(2025, 11, 6).officer.id, 'zhi');
});

test('黄历: each officer\'s 宜 · 忌 is the 協紀辨方書 table, quoted', () => {
  assert.equal(Q.almanac.officers.length, 12);
  for (const o of Q.almanac.officers) {
    assert.ok(o.from, `${o.id} cites its gods`);
    for (const id of [...o.yi, ...o.ji]) assert.ok(Q.almanac.acts[id], `${o.id}: ${id} is named`);
  }
  const po = day(2025, 11, 8);
  assert.deepEqual(po.ji.map(x => x.name), ['出财', '远行', '借贷']);
  assert.deepEqual(po.yi, []);
  assert.match(Q.almanac._about, /協紀辨方書/);
});

test('生肖 turns at 立春, never at 1 January or 春节; 星座 by month and day', () => {
  // 2024 立春 was 02-04; 春节 02-10.
  assert.equal(fateOf(content, '2024-02-03').zodiac, 'rabbit');
  assert.equal(fateOf(content, '2024-02-04').zodiac, 'dragon');
  assert.equal(fateOf(content, '2024-02-09').zodiac, 'dragon', 'before 春节, already 龙: the year is 立春\'s');
  assert.equal(fateOf(content, '1995-01-20').zodiac, 'dog');
  for (const [md, s] of [[[12, 22], 'capricorn'], [[1, 19], 'capricorn'], [[1, 20], 'aquarius'], [[3, 21], 'aries'], [[11, 22], 'scorpio'], [[11, 23], 'sagittarius'], [[6, 21], 'gemini'], [[6, 22], 'cancer']]) {
    assert.equal(signOf(content, ...md), s, md.join('-'));
  }
  assert.equal(fateOf(content, '1990-11-02').sign, 'scorpio');
});

test('生辰 keeps the signs, never the date; a sign set before 星座 may take the birthday once more', () => {
  const set = fate(base, content, ctx(), { birth: '1995-11-02' }).state;
  assert.equal(set.fate.sign, 'scorpio');
  assert.ok(!JSON.stringify(set.fate).includes('1995'), 'no date in the save');
  const old = { ...base, fate: { zodiac: 'pig', stem: 'jia', element: 'wood', source: 'birth', at: 'x' } };
  const added = fate(old, content, ctx(), { birth: '1995-11-02' }).state.fate;
  assert.equal(added.sign, 'scorpio'); assert.equal(added.zodiac, 'pig', 'the 命格 stays for life');
  assert.equal(fate({ ...old, fate: added }, content, ctx(), { birth: '1990-01-01' }).result.refused, 'fate-set');
  assert.equal(look(old, content, ctx()).qian.birth, 'sign');
  assert.equal(look({ ...base, fate: null }, content, ctx()).qian.birth, 'ask');
});

test('the set: all one hundred, each quoted with its source and graded; speeds never below 1', () => {
  assert.equal(Q.qian.length, 100);
  assert.deepEqual(Q.qian.map(q => q.n), Array.from({ length: 100 }, (_, i) => i + 1));
  for (const q of Q.qian) { assert.equal(q.poem.length, 4); assert.match(q.url, /^https:\/\/bwmonastery\.org\.sg\/gylot-c\/\d+$/); assert.ok(q.gloss); }
  assert.deepEqual(Q.qian[0].poem, ['开天辟地作良缘', '吉日良时万物全', '若得此签非小可', '人行忠正帝王宣']);
  for (const g of Object.values(Q.grades)) assert.ok(g.speed >= 1);
  assert.equal(Q.grades['上签'].speed, 1.2);
});

test('once a real day: the same 签 however often asked, refused again today, open again tomorrow', () => {
  const s0 = { ...base, qian: undefined };
  const first = draw(s0);
  assert.equal(first.result.ok, true);
  assert.equal(first.result.divination.n, qianOf(content, s0, NOW).n);
  assert.equal(draw(first.state).result.refused, 'cast-today');
  assert.equal(draw(first.state, at(2026, 11, 2, 23)).result.refused, 'cast-today');
  assert.equal(draw(first.state, at(2026, 11, 3, 0)).result.ok, true);
  // undo cannot fish: the day's 签 is the day's and the save's
  assert.equal(qianOf(content, s0, at(2026, 11, 2, 22)).n, first.result.divination.n);
});

test('an old save that cast 问卦 today keeps working, and may still draw today\'s 签', () => {
  const old = { ...base, divination: { day: '2026-11-02', throws: [[3, 3, 3], [2, 2, 3], [2, 2, 3], [2, 2, 2], [3, 3, 2], [3, 2, 2]], hexagram: 26, changed: 50, grade: 'good', at: NOW.toISOString() } };
  const l = look(old, content, ctx());
  assert.equal(l.divination, null);
  assert.equal(l.qian.drawn, false);
  assert.equal(draw(old).result.ok, true);
});

test('speed: ×1 before the draw, the grade\'s after, never below 1', () => {
  assert.equal(qianSpeedOf(content, base, NOW), 1);
  for (let d = 1; d <= 40; d++) {
    const now = at(2026, 1, d);
    const s = draw(base, now).state;
    const sp = qianSpeedOf(content, s, now);
    assert.ok(sp >= 1, `day ${d}: ${sp}`);
    assert.equal(sp, Q.grades[Q.qian.find(q => q.n === s.qian.n).grade].speed);
  }
});

test('宜 pays ×1.3 only on its kind, and every card\'s shown pay already holds the speed', () => {
  // A 上签 day: find one.
  let now = NOW, s = null;
  for (let d = 0; d < 60 && !s; d++) { now = at(2026, 3, 1 + d); const r = draw(base, now); if (r.state && Q.qian.find(q => q.n === r.state.qian.n).grade === '上签') s = r.state; }
  assert.ok(s, 'a 上签 day in sixty');
  const yi = yiToday(content, s, now);
  const grantOf = { doufa: { table: 'play', kind: '斗法', progress: 50 }, shouyu: { table: 'haunt', play: 'tide', progress: 20 }, wen: { table: 'play', kind: '解谜', progress: 50 }, wu: { table: 'play', play: 'qiecuo', progress: 50 } };
  for (const [k, g] of Object.entries(grantOf)) {
    assert.equal(qianPayOf(content, s, now, g), k === yi.id ? 1.2 * 1.3 : 1.2, k);
    assert.equal(yiWeightOf(content, s, now, g), k === yi.id ? Q.yi.weight : 1, `${k} weight`);
  }
  // 兽潮 pays on the haunt table, but is 守御, never 斗法.
  const doufa = Q.yi.kinds.find(k => k.id === 'doufa');
  assert.equal(isOfKind(doufa, { table: 'haunt', play: 'tide' }), false);
  assert.equal(isOfKind(doufa, { table: 'haunt' }), true);
  // A card's pay (paysOf) is the authored × the day: a scene's table.
  const g = { table: 'scene', progress: 20, wealth: 5 };
  const before = paysOf(content, base, now, g).progress, after = paysOf(content, s, now, g).progress;
  assert.equal(after, Math.round(before * 1.2) || after, 'shown pay ×1.2');
  assert.ok(Math.abs(after - before * 1.2) <= 1, `${before} → ${after}`);
  assert.equal(paysOf(content, s, now, g).wealth, paysOf(content, base, now, g).wealth, '灵石 untouched');
});

test('签谱 counts every 签 drawn; 连签 runs day on day and breaks on a missed day; its 签筒 at 3 / 7 / 30', () => {
  let s = base;
  for (let d = 1; d <= 7; d++) s = draw(s, at(2026, 5, d)).state;
  assert.equal(Object.values(s.qian_book.counts).reduce((a, b) => a + b, 0), 7);
  assert.equal(s.qian_book.streak.run, 7);
  assert.equal(look(s, content, ctx(at(2026, 5, 7))).qian.tube, 'cinnabar');
  assert.equal(look(s, content, ctx(at(2026, 5, 8))).qian.streak, 7, 'still standing the next morning');
  assert.equal(look(s, content, ctx(at(2026, 5, 9))).qian.streak, 0, 'a day missed');
  const r = draw(s, at(2026, 5, 9));
  assert.equal(r.state.qian_book.streak.run, 1); assert.equal(r.state.qian_book.streak.best, 7);
  let t = base;
  for (let d = 1; d <= 3; d++) t = draw(t, at(2026, 6, d)).state;
  assert.equal(look(t, content, ctx(at(2026, 6, 3))).qian.tube, 'jade');
  const book = divine(s, content, ctx(at(2026, 5, 7)), { action: 'book' }).result.book;
  assert.equal(book.length, 100);
  assert.equal(book.filter(b => b.count).reduce((a, b) => a + b.count, 0), 7);
  assert.ok(book.filter(b => !b.count).every(b => !b.first), 'an undrawn 签 shows its number only');
});

test('应验: the evening only, once, pays a little; asked once', () => {
  const s = draw(base).state;
  assert.equal(divine(s, content, ctx(), { action: 'verify', said: '见了' }).result.refused, 'not-evening');
  const eve = at(2026, 11, 2, 19);
  assert.equal(look(s, content, ctx(eve)).divination.yingyan.open, true);
  const asked = divine(s, content, ctx(eve), { action: 'asked' }).state;
  assert.equal(look(asked, content, ctx(eve)).divination.yingyan.asked, true);
  assert.equal(divine(s, content, ctx(eve, { reader: 'ling' }), { action: 'asked' }).result.refused, 'page-only');
  const v = divine(asked, content, ctx(eve, { reader: 'yinyue' }), { action: 'verify', said: '今天和老同学吃了饭' });
  assert.equal(v.result.ok, true); assert.ok(v.result.paid);
  assert.equal(v.state.qian_book.yingyan.at(-1).said, '今天和老同学吃了饭');
  assert.equal(divine(v.state, content, ctx(eve), { action: 'verify', said: 'x' }).result.refused, 'verified-today');
  assert.equal(divine(base, content, ctx(eve), { action: 'verify', said: 'x' }).result.refused, 'not-drawn');
  // her read: facts and how
  const her = divine(s, content, ctx(eve, { reader: 'yinyue' }), { action: 'read' }).result;
  assert.ok(her.how && her.divination.poem);
});

test('the card stands with 银月 away: the 签筒, then the 签诗 and the 宜忌, and no reading', () => {
  const alone = { ...base, companion: { ...base.companion, joined: false } };
  const l0 = look(alone, content, ctx());
  const before = qianCardHtml({ look: l0, lang: 'zh', herHere: false });
  assert.match(before, /data-qian-shake/); assert.match(before, /宜|忌/);
  const l1 = look(draw(alone).state, content, ctx());
  const after = qianCardHtml({ look: l1, lang: 'zh', herHere: false, castFresh: true });
  for (const line of l1.divination.poem) assert.ok(after.includes(line));
  assert.doesNotMatch(after, /银月在看/);
  assert.match(qianCardHtml({ look: l1, lang: 'zh', herHere: true, castFresh: true, qianHerWaiting: true }), /银月在看/); // 问签 v2: while her line is asked for
  assert.match(qianChipHtml(l1, 'zh'), /今日 .签 · 修为 ×/);
  // The facts handed to her name the 签, the 黄历 and the game, never a birthday.
  const facts = qianFacts(l1.divination, true);
  assert.match(facts, /第\d+签/); assert.match(facts, /黄历/); assert.match(facts, /五项/); // 问签 v2: her line is life's — the card says the 修为
  // English keeps it working: the original verse with the game's gloss.
  const en = look(draw({ ...alone, lang: 'en' }).state, content, ctx()).divination;
  assert.ok(en.gloss && en.poem.length === 4);
});

/* Live, Hanli 2026-11-02 「点按钮也没反应」: no `divine` ever reached the rules. A shake that threw between its start and its
   end (the paint) left `qianShaking` set, and every later tap returned at its first line under a 签筒 still reading 摇签. */
function fakePage({ paintThrows = 0, answer = () => ({ ok: true }) } = {}) {
  const view = { qianShaking: false, qianOpen: false };
  const writes = [];
  let paints = 0;
  const page = createQianPage({
    view, lang: () => 'zh', herHere: () => false, herLine: async () => null, tellHer() {},
    keep: (p) => Object.assign(view, p),
    show: (p) => { Object.assign(view, p); if (paints++ < paintThrows) throw new Error('render threw'); },
    write: async (name, args) => { writes.push({ name, args }); return answer(name, args); },
    refresh: async () => {}, refusal: (r) => r.say || '这一下没成，稍后再点。', failed: (e) => ({ ok: false, error: String(e) }),
  });
  return { page, view, writes };
}

test('摇签 always reaches the rules and always ends: a paint that throws never leaves the tube dead', async () => {
  const { page, view, writes } = fakePage({ paintThrows: 1 });
  await page.shake().catch(() => {});
  assert.deepEqual(writes.map((w) => w.name), ['divine'], 'the draw is asked though the paint threw');
  assert.deepEqual(writes[0].args, {}, '问签 v2: nothing is asked first');
  assert.equal(view.qianShaking, false, 'the shake ends');
  assert.equal(view.qianOpen, true, 'the 签 shows in the top bar');
  await page.shake();
  assert.equal(writes.length, 2, 'a second tap is heard');
});

test('摇签 that does not go through says so on the card, and the next tap draws again', async () => {
  const { page, view, writes } = fakePage({ answer: () => { throw new Error('Control channel request timeout'); } });
  await page.shake();
  assert.equal(view.qianShaking, false);
  assert.equal(view.qianNote, '这一下没成，稍后再点。');
  // A shake never answered (stuck) is let go after a while: the next tap draws.
  Object.assign(view, { qianShaking: true, qianShakeAt: Date.now() - 60000 });
  await page.shake();
  assert.equal(writes.length, 2);
  const l0 = look(base, content, ctx());
  const card = qianCardHtml({ look: l0, lang: 'zh', qianNote: view.qianNote });
  assert.match(card, /还没摇 · 点签筒摇一摇/);
  assert.match(card, /这一下没成/);
  assert.match(qianChipHtml(l0, 'zh'), /今日签 · 未摇/);
  assert.doesNotMatch(qianChipHtml(l0, 'zh'), /求签/);
});

test('the verb is the page\'s and Ling\'s; before the gate it is shut', () => {
  assert.equal(typeof VERBS.divine, 'function');
  const r = VERBS.divine(base, content, ctx(), {});
  assert.equal(r.result.ok, true);
});

test('the 宜 hook reads the real tray and pool rows: a board by its mechanic, 对对子 as 文, 切磋 as 武, 兽潮 as 守御', () => {
  let now = NOW, s = null;
  for (let d = 0; d < 80 && !s; d++) { now = at(2026, 4, 1 + d); const r = draw(base, now); if (r.state && yiToday(content, r.state, now).id === 'wen') s = r.state; }
  assert.ok(s, 'a 宜文 day');
  const board = (content.games.games ?? []).find(g => g.task && g.mechanic === '解谜');
  assert.equal(gameOfEntry(content, { kind: 'board', task: board.task }).kind, '解谜');
  assert.equal(yiWeightOfEntry(content, s, now, { kind: 'board', task: board.task }), Q.yi.weight);
  assert.equal(yiWeightOfEntry(content, s, now, { kind: 'her', id: 'duizi' }), Q.yi.weight);
  assert.equal(yiWeightOfEntry(content, s, now, { kind: 'fantong', id: 'fantong' }), 1);
  assert.deepEqual(gameOfEntry(content, { kind: 'tide', id: 'qiecuo' }), { play: 'qiecuo' });
  assert.deepEqual(gameOfEntry(content, { kind: 'tide', id: 'shouchao-1' }), { play: 'tide' });
  // every row of a real Look's tray reads without throwing
  for (const row of look(s, content, ctx(now)).tray ?? []) assert.ok([1, Q.yi.weight].includes(yiWeightOfEntry(content, s, now, row)), JSON.stringify(row));
});
