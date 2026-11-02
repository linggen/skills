// 问签 v2 (rules/fortune.mjs, qian.json; Hanli 2026-11-02: 「可以, 按你说的做」): one shake, one full reading — the 签诗
// verbatim, its 白话签解, 五项运势 from the 签's tones and today's 黄历, the 签's own 宜 kind; 替人求签 (deterministic, three a
// day, pays nothing, never a birthday kept or logged); the share image's drawn text (qian-share.js) never a birthday.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { playTo } from '../scripts/rules.mjs';
import { almanacOf } from '../scripts/rules/almanac.mjs';
import { aspectsOf, divine, friendQianOf, qianLook, qianPayOf, qianSpeedOf, yiToday } from '../scripts/rules/fortune.mjs';

process.env.LINGJING_STAMINA_LIMIT = '0';
const here = path.dirname(fileURLToPath(import.meta.url));
const content = loadContent();
const Q = content.qian;
const at = (y, m, d, h = 9) => new Date(y, m - 1, d, h);
const NOW = at(2026, 11, 2);
const base = playTo(content, newState(content, 'zh', NOW), '古七', { now: NOW }).state;
const ctx = (now = NOW, extra = {}) => ({ now, quests: [], ...extra });
const call = (s, args = {}, now = NOW, extra = {}) => divine(s, content, ctx(now, extra), args);
const day = (y, m, d, lang = 'zh') => almanacOf(Q.almanac, content.traits.fate.zodiac, { y, m, d }, lang);

test('every 签 has its 签诗 as v1 quoted it, a 白话签解, a tone for each of the five 项 and a kind tag', () => {
  const v1 = JSON.parse(execFileSync('git', ['-C', here, 'show', '3243ca21:lingjing/worlds/jiuding/qian.json'], { encoding: 'utf8' }));
  assert.equal(Q.qian.length, 100);
  const kinds = Q.yi.kinds.map(k => k.id), counts = {};
  for (const e of Q.qian) {
    const old = v1.qian.find(x => x.n === e.n);
    assert.deepEqual(e.poem, old.poem, `签${e.n}: the verse is untouched`);
    assert.equal(e.grade, old.grade, `签${e.n}: the grade is untouched`);
    assert.ok(typeof e.jie === 'string' && e.jie.length >= 12, `签${e.n}: 签解`);
    assert.ok(e.gloss, `签${e.n}: the English gloss`);
    assert.ok(kinds.includes(e.kind), `签${e.n}: kind`);
    assert.equal(e.luck.length, 5, `签${e.n}: five 项`);
    counts[e.kind] = (counts[e.kind] ?? 0) + 1;
  }
  assert.deepEqual(counts, { shouyu: 31, wen: 25, doufa: 22, wu: 22 }, 'the counts _about states');
  assert.match(Q._about, /TAGGING RULE/);
  assert.equal(Q.asks, undefined, 'no ask picker any more');
});

test('the 宜 kind is the 签\'s own tag, not its number', () => {
  const s = call(base).state, n = s.qian.n, e = Q.qian.find(x => x.n === n);
  assert.equal(yiToday(content, s, NOW).id, e.kind);
  // A 签 whose tag differs from v1's (n − 1) mod 4 exists — the old rule is gone.
  assert.ok(Q.qian.some(x => Q.yi.kinds[(x.n - 1) % 4].id !== x.kind));
});

test('one shake, one full reading: 签解, five 项, 黄历 — no ask, in zh and in en', () => {
  const r = call(base, { ask: 'love', ask_text: 'x' });
  assert.ok(r.result.ok);
  const d = r.result.divination;
  assert.equal(d.ask, undefined); assert.equal(d.ask_text, undefined); assert.equal(r.state.qian.ask, undefined);
  assert.ok(d.jie && d.poem.length === 4);
  assert.deepEqual(d.aspects.map(a => a.name), ['事业', '感情', '财运', '出行', '健康']);
  for (const a of d.aspects) assert.ok(a.line, a.id);
  assert.equal(d.day, '2026-11-02');
  assert.equal(r.result.qian.asks, undefined);
  const en = call({ ...base, lang: 'en' }).result.divination;
  assert.deepEqual(en.aspects.map(a => a.name), ['Work', 'Love', 'Money', 'Travel', 'Health']);
  assert.equal(en.jie, Q.qian.find(x => x.n === en.n).gloss, 'the English 签解 is the gloss');
});

test('五项 read today\'s 黄历: 出行 the day\'s 忌远行, 财运 宜/忌 only, 健康 never medical', () => {
  const e = Q.qian.find(x => x.n === 14);
  const po = day(2025, 11, 8); // 破: 忌 出财 · 远行 · 借贷
  const a = Object.fromEntries(aspectsOf(content, e, po, 'zh').map(x => [x.id, x]));
  assert.match(a.travel.line, /今日忌远行/);
  assert.match(a.wealth.line, /今日忌出财/);
  assert.doesNotMatch(a.health.line, /医|药|病|针/);
  // Every 财运 line speaks in 宜 or 忌; no 健康 line names a cure, a doctor or a medicine.
  for (const tone of ['up', 'even', 'slow']) {
    for (const l of Q.aspects.list.find(x => x.id === 'wealth').lines[tone]) assert.match(l.zh, /宜|忌/, l.zh);
    for (const l of Q.aspects.list.find(x => x.id === 'health').lines[tone]) assert.doesNotMatch(l.zh + l.en, /医|药|病|doctor|medic|cure/i, l.zh);
  }
  assert.deepEqual(Q.aspects.list.find(x => x.id === 'health').ji, []);
  assert.deepEqual(Q.aspects.list.find(x => x.id === 'health').yi, []);
  const en = Object.fromEntries(aspectsOf(content, e, day(2025, 11, 8, 'en'), 'en').map(x => [x.id, x]));
  assert.match(en.travel.line, /avoid a long journey/);
});

test('替人求签: the same 签 all day by the 称呼, three people a day, pays nothing, his own 签 untouched', () => {
  const mine = call(base).state;
  const speed = qianSpeedOf(content, mine, NOW), pay = qianPayOf(content, mine, NOW, { play: 'duel' });
  const r1 = call(mine, { action: 'friend', name: '  阿 星 ' });
  assert.ok(r1.result.ok);
  assert.equal(r1.result.friend.name, '阿 星');
  assert.equal(r1.result.friend.speed, undefined); assert.equal(r1.result.friend.yi, undefined);
  assert.ok(r1.result.friend.jie && r1.result.friend.aspects.length === 5);
  // Asked again (the same person, the same day, a later hour): the same 签, no second place taken.
  const again = call(r1.state, { action: 'friend', name: '阿 星' }, at(2026, 11, 2, 20));
  assert.equal(again.result.friend.n, r1.result.friend.n);
  assert.equal(again.result.qian.friend_left, 2);
  assert.equal(friendQianOf(content, mine, NOW, '阿 星').n, r1.result.friend.n);
  let s = again.state;
  for (const n of ['Alex', '小周']) s = call(s, { action: 'friend', name: n }).state;
  const fourth = call(s, { action: 'friend', name: '第四位' });
  assert.equal(fourth.result.refused, 'friends-today');
  assert.equal(call(s, { action: 'friend', name: 'Alex' }).result.ok, true, 'one of the three, again: fine');
  // Nothing paid, nothing of his own moved.
  for (const k of ['progress', 'wealth', 'stamina']) assert.equal(s[k], mine[k], k);
  assert.deepEqual(s.qian, mine.qian); assert.deepEqual(s.qian_book, mine.qian_book);
  assert.equal(qianSpeedOf(content, s, NOW), speed); assert.equal(qianPayOf(content, s, NOW, { play: 'duel' }), pay);
  // The next day the three are free again.
  assert.equal(call(s, { action: 'friend', name: '第四位' }, at(2026, 11, 3)).result.ok, true);
  assert.equal(call(base, { action: 'friend', name: '' }).result.refused, 'no-name');
});

test('替人求签: a birthday gives the 生肖 and 星座 and is never kept; 不保存 keeps no friend; a kept one can go', () => {
  const r = call(base, { action: 'friend', name: '老牛', birth: '1985-03-01' });
  assert.equal(r.result.friend.signs.zodiac.name, '牛');
  assert.equal(r.result.friend.signs.sign.name, '双鱼座');
  assert.deepEqual(r.state.qian_friends, [{ name: '老牛', zodiac: 'ox', sign: 'pisces' }]);
  assert.doesNotMatch(JSON.stringify(r.state), /1985|03-01/);
  assert.deepEqual(qianLook(content, r.state, NOW).friends, [{ name: '老牛', signs: { zodiac: { id: 'ox', name: '牛' }, sign: { id: 'pisces', name: '双鱼座' } } }]);
  // A kept friend asked again without the birthday keeps the signs.
  assert.equal(call(r.state, { action: 'friend', name: '老牛' }).result.friend.signs.zodiac.id, 'ox');
  const quiet = call(base, { action: 'friend', name: '路人', birth: '1990-07-07', keep: false });
  assert.ok(quiet.result.ok);
  assert.equal(quiet.state.qian_friends, undefined);
  assert.doesNotMatch(JSON.stringify(quiet.state), /路人|1990/);
  assert.equal(quiet.result.qian.friend_left, 2, '不保存 still counts');
  const gone = call(r.state, { action: 'forget_friend', name: '老牛' });
  assert.deepEqual(gone.state.qian_friends, []);
  assert.equal(call(base, { action: 'friend', name: 'x', birth: '2099-01-01' }).result.refused, 'birth-invalid');
});

test('替人求签 is the page\'s alone: Ling and 银月 are refused', () => {
  for (const reader of ['ling', 'yinyue']) assert.equal(call(base, { action: 'friend', name: 'A' }, NOW, { reader }).result.refused, 'page-only');
});

test('through the command line: neither a birthday nor a 称呼 not kept is written anywhere in the data', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qian2-'));
  const rules = path.join(here, '../scripts/rules.mjs');
  const env = { ...process.env, LINGJING_DATA: dir, LINGJING_NOW: NOW.toISOString(), LINGJING_STAMINA_LIMIT: '0', LINGJING_SAVE: 'qian2' };
  const run = (...a) => JSON.parse(execFileSync('node', [rules, ...a], { env, encoding: 'utf8' }));
  run('seed', '--at=古七');
  run('divine');
  const r = run('divine', '--action=friend', '--name=秘密朋友', '--birth=1977-12-24', '--keep=false');
  assert.ok(r.ok, JSON.stringify(r));
  const k = run('divine', '--action=friend', '--name=留着的', '--birth=1983-06-15');
  assert.ok(k.ok);
  const all = [];
  const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : all.push(fs.readFileSync(p, 'utf8')); } };
  walk(dir);
  const text = all.join('\n');
  assert.doesNotMatch(text, /1977|1983|12-24|06-15/, 'no birthday on disk');
  assert.doesNotMatch(text, /秘密朋友/, 'a 称呼 not kept is nowhere');
  assert.match(text, /留着的/, 'a kept 称呼 is in the save');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the share image says the reading and never a birthday, a sign, his name or his save', async () => {
  const { shareLines, paintShare } = await import('../scripts/qian-share.js');
  const mine = call(base).state;
  const r = call(mine, { action: 'friend', name: '老牛', birth: '1985-03-01' });
  const f = r.result.friend;
  const rows = shareLines(f, { friend: f.name, her: '你那位朋友属牛，今日宜早睡。', lang: 'zh' });
  // What the painter draws, read back from a canvas that records every fillText.
  const drawn = [];
  const g = { measureText: (t) => ({ width: [...t].length * 30 }), fillText: (t) => drawn.push(t), fillRect() {}, strokeRect() {}, createLinearGradient: () => ({ addColorStop() {} }) };
  paintShare({ getContext: () => g }, rows, { font: 'serif' });
  const text = drawn.join('');
  for (const ch of text) assert.ok(rows.some((row) => row.text.includes(ch)), `drawn ${ch} is a row's`);
  for (const bad of ['1985', '03-01', '3月1', '双鱼', 'pisces', base.name, '修为']) assert.ok(!text.includes(bad), `no ${bad}`);
  assert.ok(rows.some((x) => x.role === 'for' && x.text.includes('老牛')));
  assert.ok(rows.some((x) => x.role === 'brand' && x.text === '灵境 · linggen.dev'));
  assert.ok(rows.some((x) => x.role === 'date' && x.text === '2026年11月2日'));
  assert.equal(rows.filter((x) => x.role === 'poem').length, 4);
  assert.equal(rows.filter((x) => x.role === 'aspect').length, 5);
  // His own: no 修为, no 宜 kind, no signs.
  const d = mine && call(base).result.divination;
  const own = shareLines({ ...d, signs: { zodiac: { id: 'pig', name: '猪' } } }, { lang: 'zh' }).map((x) => x.text).join('');
  assert.doesNotMatch(own, /修为|×|属猪/);
});

test('the share image: no 宜 row on a day with no 宜', async () => {
  const { shareLines } = await import('../scripts/qian-share.js');
  const d = call(base).result.divination;
  const none = { ...d, almanac: { ...d.almanac, yi: [], ji: [{ id: 'chucai', name: '出财' }] } };
  const rows = shareLines(none, { lang: 'zh' });
  assert.equal(rows.some((x) => x.role === 'yi'), false);
  assert.equal(rows.some((x) => x.role === 'ji'), true);
  assert.ok(!rows.some((x) => /无大事/.test(x.text)));
});

test('银月\'s facts: the five 项 and the signs against today; a friend\'s about the friend, by no name', async () => {
  const { qianFacts, friendFacts, qianAsk } = await import('../scripts/qian-facts.js');
  const d = call({ ...base, fate: { zodiac: 'ox', stem: 'jia', element: 'wood', source: 'birth' } }).result.divination;
  const f = qianFacts(d, true);
  for (const a of d.aspects) assert.ok(f.includes(a.line), a.id);
  assert.match(f, /他属牛/);
  const fr = call(base, { action: 'friend', name: '阿秘', birth: '1985-03-01' }).result.friend;
  const ff = friendFacts(fr, true);
  assert.match(ff, /那位朋友属牛/);
  assert.doesNotMatch(ff, /阿秘|1985/);
  assert.match(qianAsk(fr, true, { friend: true }), /你那位朋友/);
  assert.match(qianAsk(d, true), /不提名字/);
  assert.ok([...f].length <= 270 && [...ff].length <= 270, 'under the engine\'s 300 with his name line');
});

test('the card: the full reading, no ask, no 出处 link; no 宜 row on a day with no 宜; the 签谱 names its source plainly', async () => {
  const { qianCardHtml } = await import('../scripts/qian-card.js');
  const { look } = await import('../scripts/rules.mjs');
  const s = call(base).state, l = look(s, content, ctx());
  const html = qianCardHtml({ look: l, lang: 'zh', herHere: false, qianHer: '属猪的，今日不冲，早点睡。' });
  for (const a of l.divination.aspects) assert.ok(html.includes(a.line), a.id);
  assert.ok(html.includes(l.divination.jie));
  assert.match(html, /白话签解（灵境自译）/);
  assert.match(html, /属猪的，今日不冲/);
  assert.doesNotMatch(html, /bwmonastery|出处|data-qian-ask|qian-ask-text|无大事/);
  assert.match(html, /data-qian-share="save"/);
  assert.match(html, /data-qian-friend="open"/);
  const before = qianCardHtml({ look: look(base, content, ctx()), lang: 'zh', herHere: false });
  assert.doesNotMatch(before, /data-qian-ask|想问什么/);
  // A day without 宜 (破: 忌 出财 · 远行 · 借贷): no 宜 row, and never 「无大事」.
  const po = { ...l, divination: { ...l.divination, almanac: day(2025, 11, 8) } };
  const poHtml = qianCardHtml({ look: po, lang: 'zh', herHere: false });
  assert.doesNotMatch(poHtml, /class="yi"/); assert.match(poHtml, /class="ji"/); assert.doesNotMatch(poHtml, /无大事/);
  const book = qianCardHtml({ look: l, lang: 'zh', qianBookOpen: true, qianBook: [] });
  assert.match(book, /签文出自观音灵签（据新加坡宝聚寺所传本）/);
  assert.match(qianCardHtml({ look: { ...l, lang: 'en' }, lang: 'en', qianBookOpen: true, qianBook: [] }), /Verses from the Guanyin oracle/);
  // 替人求签: the form, and a friend's card in his card's place — 「替 X 求签」, its own share.
  const form = qianCardHtml({ look: l, lang: 'zh', qianFriendOpen: true });
  assert.match(form, /id="qian-friend-name"/); assert.match(form, /不保存/); assert.match(form, /今日还可替 3 人/);
  const f = call(s, { action: 'friend', name: '阿星' }).result.friend;
  const fh = qianCardHtml({ look: l, lang: 'zh', qianFriend: f });
  assert.match(fh, /替 阿星 求签/); assert.match(fh, /data-qian-who="friend"/);
  assert.doesNotMatch(fh, /修为 ×/);
});

test('placement (Hanli 11-02 「…放最下面吧…」): no top-bar chip; a modal that pops once a day; the tray until shaken; 书 shows it again', async () => {
  const src = fs.readFileSync(path.join(here, '../scripts/lingjing.js'), 'utf8');
  assert.doesNotMatch(src, /omenChip|qianChipHtml|data-qian-chip/, 'nothing of the 签 on the top bar');
  assert.match(src, /function qianAutoPop\(\)[\s\S]*?lingjing:qian-pop:/, 'the first open of the day pops it, once');
  assert.match(src, /qianagain" data-divine/, '书 → 今日签 opens it again');
  const { stageCards } = await import('../scripts/stage.mjs');
  const { look } = await import('../scripts/rules.mjs');
  assert.ok(!stageCards(look(base, content, ctx())).some((c) => c.card === 'hexagram'), 'never on the stage');
  const tray = look(base, content, ctx()).tray ?? [];
  assert.ok(tray.some((r) => r.id === 'divine'), 'unshaken: the tray card');
  assert.ok(!(look(call(base).state, content, ctx()).tray ?? []).some((r) => r.id === 'divine'), 'shaken: gone');
});
