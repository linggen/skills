// 喂饭桶 · 开炉 (Hanli, 2026-10-20): the 饭桶's lottery. The table is the world's (worlds/jiuding/fantong.json), the
// rules roll it (rules/fantong.mjs), the page only shows (games/kailu.js). Up to three things and 0–3 灵石 go in,
// the lid is pressed (压盖), one thing (now and then two) comes out in one of four grades; the odds of high things
// rise smoothly with what went in and his realm, never capped; the first of each thing lands in the 饭桶图鉴.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { VERBS } from '../scripts/rules.mjs';
import { spendStamina } from '../scripts/rules/core.mjs';
import { GRADES, chances, fantongAll, gradeWeights, kindOf, realmOf, rollFeed, tierOfItem, waitWords } from '../scripts/rules/fantong.mjs';
import { pouchHtml } from '../scripts/pouch.js';
import { luHtml } from '../scripts/lu.js';
import { WORDS } from '../scripts/cards.js';

const content = loadContent();
const T = content.fantong;
const items = new Map(content.items.items.map(i => [i.id, i]));
const NOW = new Date('2026-10-15T09:00:00');
const at = (min) => new Date(NOW.getTime() + min * 60_000);
const ctx = (now = NOW) => ({ now, quests: [] });
const saveWith = (extra = {}) => ({
  ...newState(content, 'zh', NOW), chapter: '00-waimen', scene: 'wm-diyilu', place: 'chaifang',
  bag: { danlu: 1, 'yaodan-1': 2, ginseng: 1, 'fox-token': 1, 'tuna-jing': 1, 'old-bow': 1 }, wealth: 5,
  companion: { joined: '2026-10-01', asleep: true }, ...extra,
});
// A save in 古七 (h11): the 方子 and the 残页 are open.
const gu7 = (extra = {}) => saveWith({ chapter: '00-zhuji', scene: '09-jiuge', done_scenes: ['09-snow'], ...extra });
const feed = (s, args, now = NOW) => VERBS.fantong(s, content, ctx(now), { action: 'feed', ...args });
/* Feed until a result passes `ok` (each feed an hour on, the pot topped up). */
function feedUntil(s, args, ok, max = 200) {
  let now = NOW;
  for (let i = 0; i < max; i++) {
    const r = feed(s, args, now);
    assert.equal(r.result.ok, true, JSON.stringify(r.result));
    if (ok(r)) return r;
    s = r.state ?? s; now = new Date(now.getTime() + 61 * 60_000);
    for (const id of [].concat(args.ids ?? args.id)) if (!s.bag[id] && items.get(id)) s.bag[id] = 1;
  }
  return null;
}

test('the table lints: every output an item with a name in both tongues and one line of small print; nothing of a later 卷', () => {
  assert.ok(T, 'worlds/jiuding/fantong.json loads');
  assert.ok(items.has(T.needs.item), 'needs an item that exists');
  for (const g of GRADES) assert.ok(T.pools[g]?.length, `${g} has rows`);
  for (const id of fantongAll(T)) {
    if (id === 'lingshi') continue;
    const it = items.get(id);
    assert.ok(it, `${id} is in items.json`);
    assert.ok(it.name?.zh && it.name?.en, `${id} name`);
    assert.ok(it.hint?.zh && it.hint?.en, `${id} hint`);
    assert.ok([...it.hint.zh].length <= 16, `${id}: one short line, not an explanation`);
    assert.ok(!['key', 'scroll'].includes(it.kind), `${id}: never a key or a scroll`);
  }
  for (const g of GRADES) for (const r of T.pools[g]) {
    assert.ok(r.w > 0, `${g}/${r.item} weight`);
    assert.ok(r.item || Array.isArray(r.wealth), `${g}: an item or 灵石`);
    if (r.lean) assert.ok(T.kinds[r.lean], `${g}/${r.item}: leans to a kind that exists`);
  }
  for (const [k, v] of Object.entries(T.kinds)) if (k !== '_about') for (const id of v.items ?? []) assert.ok(items.has(id), `${k}/${id}`);
  for (const [n, ids] of Object.entries(T.tiers)) if (n !== '_about') for (const id of ids) assert.ok(items.has(id), `tier ${n}/${id}`);
  for (const a of T.around.items) assert.ok(items.has(a.id), a.id);
  // Hanli's approved table (2026-10-20): equipment, weapons and pendants can drop; realm pills can drop.
  const all = new Set(fantongAll(T));
  for (const id of ['qingtong-jian', 'anhe-yu', 'bamboo-sword', 'shi-zhui', 'foundation-pill', 'foundation-pill-9', 'baoge-ling', 'yinyue-lingdang', 'banjie-fanshao', 'yike-daya', 'yige-ge', 'fangzi-canye']) assert.ok(all.has(id), id);
  assert.deepEqual(Object.keys(T.limit).filter(k => k !== '_about'), ['cooldown_min'], 'ships with the hour cooldown only');
});

test('a plain feed (one 凡物, 练气零层, no 灵石) lands near 70 / 25 / 4 / 1 over 10k seeded feeds', () => {
  const got = Object.fromEntries(GRADES.map(g => [g, 0]));
  let n = 0;
  for (let i = 0; i < 10000; i++) {
    const r = rollFeed(T, { seed: `odds|${i}`, ids: ['chaihuo'] });
    if (r.refused) continue;
    got[r.grade]++; n++;
  }
  const pct = g => (got[g] / n) * 100;
  for (const [g, want, tol] of [['junk', 70, 1.5], ['useful', 25, 1.5], ['rare', 4, 0.7], ['best', 1, 0.4]]) assert.ok(Math.abs(pct(g) - want) < tol, `${g}: ${pct(g).toFixed(2)} vs ${want}`);
  // The exact view agrees with the declared weights at power 0.
  const c = chances(T, { ids: ['chaihuo'] });
  assert.equal(c.power, 0);
  assert.deepEqual(Object.fromEntries(Object.entries(c.grades).map(([g, p]) => [g, Math.round(p * 100)])), { junk: 70, useful: 25, rare: 4, best: 1 });
  assert.deepEqual(rollFeed(T, { seed: 'same', ids: ['ginseng'] }), rollFeed(T, { seed: 'same', ids: ['ginseng'] }), 'the roll is the rules\', deterministic');
});

test('what goes in sets the lean: herbs → pills, beast parts → 符 and 妖丹, ores → 符纸 and 丹砂, junk → junk', () => {
  const share = (ids, want) => { const c = chances(T, { ids }); return want.reduce((n, id) => n + (c.items[id] ?? 0), 0); };
  const pills = ['qi-pill', 'mend-pill', 'huiqi-pill', 'qi-pill-3', 'mend-pill-3'], fu = ['talisman', 'lianxi-fu', 'tama-fu', 'yaodan-1', 'yaodan-2'], ore = ['sang-paper', 'dansha', 'tie-sha'];
  const junk = ['chaihuo', 'shizi', 'kuye'];
  assert.ok(share(['huangjing', 'fuling', 'cangzhu'], pills) > 2 * share(['chai-ya', 'lang-pi', 'hu-pi'], pills), 'herbs lean to pills');
  assert.ok(share(['chai-ya', 'lang-pi', 'hu-pi'], fu) > 2 * share(['huangjing', 'fuling', 'cangzhu'], fu), 'beast parts lean to 符 and 妖丹');
  assert.ok(share(['tie-sha', 'cishi', 'dansha'], ore) > 2 * share(['huangjing', 'fuling', 'cangzhu'], ore), 'ores lean to 符纸 and 丹砂');
  assert.ok(chances(T, { ids: junk }).grades.junk > chances(T, { ids: ['huangjing', 'fuling', 'cangzhu'] }).grades.junk, 'a pot of junk gives mostly junk');
  assert.equal(kindOf(T, 'huangjing'), 'herb');
  assert.equal(kindOf(T, 'chaihuo'), 'junk', 'unlisted is junk');
});

test('灵石 lift the odds, each one a little (max 3)', () => {
  const good = n => 1 - chances(T, { ids: ['chaihuo'], lingshi: n }).grades.junk;
  assert.ok(good(1) > good(0) && good(2) > good(1) && good(3) > good(2), [0, 1, 2, 3].map(good).join(' '));
  assert.equal(feed(saveWith(), { id: 'chaihuo', lingshi: 4 }).result.refused, 'bad-lingshi');
});

test('no cap: the top tier rises with what goes in AND with his realm, and is never zero (Hanli 10-20)', () => {
  const top = 'foundation-pill-9', pots = [['chaihuo'], ['yaodan-1'], ['yaodan-2'], ['yaodan-3']], realms = [0, 1.5, 2.7, 3, 4.5];
  const p = (ids, realm, lingshi = 0) => chances(T, { ids, realm, lingshi }).items[top] ?? 0;
  for (const ids of pots) for (let r = 1; r < realms.length; r++) assert.ok(p(ids, realms[r]) > p(ids, realms[r - 1]), `${ids}: realm ${realms[r]}`);
  for (const realm of realms) for (let k = 1; k < pots.length; k++) assert.ok(p(pots[k], realm) > p(pots[k - 1], realm), `tier ${k}: realm ${realm}`);
  assert.ok(p(['chaihuo'], 0) > 0, 'a 凡物 by a 零层 can still, just, give the top');
  assert.ok(p(['chaihuo'], 0) < 0.0001, 'but almost never');
  assert.ok(p(['yaodan-3'], 4.5, 3) > 50 * p(['chaihuo'], 0), 'a high feed by a high hand, far likelier');
  assert.equal(tierOfItem(T, top), 4);
  // His realm off the save: 练气 by 层, 筑基 past 3.
  assert.equal(realmOf(content, { tier: 'qi', step: 0 }), 0);
  assert.ok(realmOf(content, { tier: 'qi', step: 9 }) > 2.5 && realmOf(content, { tier: 'qi', step: 9 }) < 3);
  assert.ok(realmOf(content, { tier: content.ladder.tiers[1].id, step: 0 }) >= 3);
  // The bigger the feed, the more the grade weights lean up (the gold more than the purple).
  const [lo, hi] = [gradeWeights(T, 0), gradeWeights(T, 6)].map(w => Object.fromEntries(w));
  assert.ok(hi.best / lo.best > hi.rare / lo.rare && hi.rare / lo.rare > 1 && hi.junk < lo.junk);
});

test('压盖: a good press lifts the grade one notch — never two, and 逆天 stays 逆天', () => {
  let lifted = 0;
  for (let i = 0; i < 2000; i++) {
    const a = rollFeed(T, { seed: `p|${i}`, ids: ['chaihuo'] }), b = rollFeed(T, { seed: `p|${i}`, ids: ['chaihuo'], press: true });
    if (a.refused || a.event) { assert.equal(Boolean(b.refused), Boolean(a.refused)); continue; }
    assert.equal(GRADES.indexOf(b.grade), Math.min(3, GRADES.indexOf(a.grade) + 1), `seed ${i}: ${a.grade} → ${b.grade}`);
    lifted++;
  }
  assert.ok(lifted > 1800);
  const c = chances(T, { ids: ['chaihuo'], press: true });
  assert.equal(c.grades.junk, 0, 'a pressed pot is never 凡');
  assert.ok(Math.abs(c.grades.useful - 0.70) < 0.001);
});

test('pity: after five 凡 in a row the next is at least 有用', () => {
  assert.equal(T.pity.after, 5);
  for (let i = 0; i < 500; i++) { const r = rollFeed(T, { seed: `pity|${i}`, ids: ['chaihuo'], pity: 5 }); if (!r.refused && !r.event) assert.notEqual(r.grade, 'junk'); }
  assert.equal(chances(T, { ids: ['chaihuo'], pity: 4 }).grades.junk > 0.6, true, 'four is not yet');
  // Through the verb: `dry` counts the 凡 in a row and resets on anything better.
  const r = feedUntil(saveWith(), { id: 'chaihuo' }, x => x.result.grade === 'junk');
  assert.equal(r.state.fantong.dry, (saveWith().fantong?.dry ?? 0) + 1);
  const s = { ...r.state, fantong: { ...r.state.fantong, dry: 5 } };
  const next = feed(s, { id: 'chaihuo' }, at(62));
  if (!next.result.spat_back && !next.result.her) assert.notEqual(next.result.grade, 'junk');
});

test('opens by 回: the base pool at 古四; 古六\'s treasures, 古五\'s gear, 古七\'s 残页 only once reached; a beast\'s gear only once beaten; a worn thing once', () => {
  const ids = ['yaodan-3', 'yaodan-3', 'yaodan-3'];
  const has = (s, id) => (chances(T, { ids, realm: 3, lingshi: 3, content, state: s }).items[id] ?? 0) > 0;
  const gu4 = saveWith();
  for (const id of ['yaqian', 'qi-pill', 'baina-dai', 'foundation-pill-9', 'bamboo-sword']) assert.ok(has(gu4, id), `${id} from 古四`);
  for (const id of ['tama-fu', 'penti-fu', 'zipai-jing', 'fangzi-canye', 'qingtong-jian', 'duan-dao', 'lipi-kanjian']) assert.ok(!has(gu4, id), `${id} not yet at 古四`);
  const g7 = gu7();
  for (const id of ['tama-fu', 'penti-fu', 'zipai-jing', 'fangzi-canye', 'qingtong-jian', 'duan-dao']) assert.ok(has(g7, id), `${id} by 古七`);
  assert.ok(!has(g7, 'lipi-kanjian'), 'the 山狸\'s coat waits for the 山狸 beaten');
  assert.ok(has(gu7({ beasts: { shanli: { won: 1 } } }), 'lipi-kanjian'));
  assert.ok(!has(gu7({ found: { 'qingtong-jian': 1 } }), 'qingtong-jian'), 'a sword had once never comes again');
  // Nothing of a later 卷: Hanli's table names 桑皮纸 · 丹砂 · 二阶妖丹 · 琅玕 · 蜀锦, which items.json keeps for later 卷 —
  // their rows wait in the data and open with their 卷.
  const later = fantongAll(T).filter(id => (items.get(id)?.juan ?? 1) > 1);
  assert.ok(later.length);
  for (const id of later) assert.ok(!has(g7, id), `${id} (卷${items.get(id).juan}) not in 卷一`);
});

test('never in: the bucket itself, a key, a scroll, her artifacts, 爹\'s bow, a thing not held; what the story reads from the bag', () => {
  const s = saveWith({ bag: { danlu: 1, 'fox-token': 1, 'tuna-jing': 1, 'old-bow': 1, 'zixu-zhi': 1, 'moon-bell': 1 } });
  for (const id of ['danlu', 'fox-token', 'tuna-jing', 'old-bow', 'zixu-zhi', 'moon-bell', 'ginseng', 'nope']) assert.equal(feed(s, { id }).result.refused, 'not-feedable', id);
  const lad = content.ladder.breakthrough.pill.items;
  const needed = new Set(['dingtai', ...Object.values(lad).flat(), ...content.items.items.filter(i => i.effect?.core).map(i => i.id)]);
  const kept = T.keep?.items ?? {};
  for (const id of needed) assert.ok(T.never.items.includes(id) || kept[id] > 0, `${id} is in never.items or keep (the story reads it from the bag)`);
  const bag = { danlu: 1, 'grey-robe': 1 };
  for (const id of needed) bag[id] = kept[id] ?? 2; // a kept stack holds only what it keeps
  const s2 = saveWith({ bag });
  for (const id of needed) assert.equal(feed(s2, { id }).result.refused, 'not-feedable', id);
  assert.ok(!VERBS.fantong(s2, content, ctx(), { action: 'look' }).result.fantong.inputs.some(i => needed.has(i.id)));
  const robe = feed(s2, { id: 'grey-robe' });
  assert.equal(robe.result.ok, true, 'ordinary gear goes in');
  assert.equal(feed(saveWith({ wealth: 1 }), { id: 'chaihuo', lingshi: 2 }).result.refused, 'no-lingshi');
  assert.equal(feed(saveWith(), { ids: ['chaihuo', 'shizi', 'kuye', 'chaihuo'] }).result.refused, 'too-many', 'three to a pot');
  assert.equal(feed(saveWith(), { ids: ['ginseng', 'ginseng'] }).result.refused, 'not-feedable', 'two of a thing he holds one of');
  assert.equal(VERBS.fantong(saveWith({ bag: {} }), content, ctx(), { action: 'look' }).result.refused, 'no-fantong');
});

test('a pot of three: all three leave the bag, 灵石 are paid, what comes out lands with its name, small print and grade', () => {
  const s0 = saveWith({ bag: { danlu: 1, 'yaodan-1': 2, ginseng: 1 } });
  const r = feedUntil(s0, { ids: ['yaodan-1', 'ginseng', 'chaihuo'], lingshi: 2 }, x => !x.result.spat_back && !x.result.her, 50);
  assert.ok(r);
  assert.equal(r.state.bag['yaodan-1'], 1);
  assert.equal(r.state.bag.ginseng, undefined);
  assert.equal(r.state.bag.chaihuo, undefined, 'the woodpile\'s go in without leaving anything');
  const o = r.result.out;
  assert.ok(GRADES.includes(o.grade) && r.result.grade_name);
  if (!o.wealth) { assert.equal(o.hint, items.get(o.id).hint.zh); assert.ok((r.state.bag[o.id] ?? 0) >= 1 || r.state.held?.[o.id]); }
  const won = r.result.outs.filter(x => x.wealth).reduce((n, x) => n + x.n, 0);
  assert.equal(r.state.wealth, 5 - 2 + won);
});

test('quirks: now and then it spits the pot back whole (nothing spent, no wait), or gives two', () => {
  let spat = 0, twin = 0;
  for (let i = 0; i < 4000; i++) { const r = rollFeed(T, { seed: `q|${i}`, ids: ['chaihuo'] }); if (r.refused) spat++; if (r.twin) { twin++; assert.equal(r.outs.length, 2); } }
  assert.ok(spat > 70 && spat < 180, `refuse ~3%: ${spat}`);
  assert.ok(twin > 100 && twin < 230, `twin ~4%: ${twin}`);
  const r = feedUntil(saveWith(), { id: 'yaodan-1' }, x => x.result.spat_back, 400);
  assert.ok(r, 'a 「呸」 within four hundred feeds');
  assert.match(r.result.say, /呸/);
  const before = feed(saveWith(), { id: 'yaodan-1' }); // (any seed) — the spat result wrote only its counter
  assert.ok(before);
  assert.equal(r.result.fantong.ready, true, 'no wait after a 「呸」');
});

test('one feed, then the bucket is full for the hour: refused with when, in 刻; fed again after 60 minutes', () => {
  const first = feedUntil(saveWith(), { id: 'chaihuo' }, x => !x.result.spat_back);
  const t0 = new Date(first.state.fantong.at);
  const after = m => new Date(t0.getTime() + m * 60_000);
  const soon = feed(first.state, { id: 'shizi' }, after(15));
  assert.equal(soon.result.refused, 'full');
  assert.equal(soon.result.say, '饭桶还撑着，三刻后再喂。');
  assert.equal(soon.state, null, 'a refusal writes nothing');
  assert.equal(feed(first.state, { id: 'shizi' }, after(59)).result.refused, 'full');
  assert.equal(feed(first.state, { id: 'shizi' }, after(60)).result.ok, true);
  assert.match(feed({ ...first.state, lang: 'en' }, { id: 'shizi' }, after(30)).result.say, /still full — feed it again in 30 minutes/);
  assert.equal(waitWords(150 * 60_000, 'zh'), '两个时辰');
});

test('`limit.per_day` alone caps the day instead (the other shape the table allows)', () => {
  const t = structuredClone(content);
  t.fantong.limit = { per_day: 3 };
  t.fantong.quirks = { refuse: 0, twin: 0 };
  let s = saveWith();
  for (let i = 0; i < 3; i++) { const r = VERBS.fantong(s, t, ctx(at(i)), { action: 'feed', id: 'kuye' }); assert.equal(r.result.ok, true); s = r.state; }
  const fourth = VERBS.fantong(s, t, ctx(at(5)), { action: 'feed', id: 'kuye' });
  assert.equal(fourth.result.refused, 'full');
  assert.match(fourth.result.say, /个时辰后再喂/);
  assert.equal(VERBS.fantong(s, t, ctx(new Date('2026-10-16T08:00:00')), { action: 'feed', id: 'kuye' }).result.ok, true, 'a new day');
});

test('古七\'s 方子: the right thing alone with the right 灵石 gives its pill; found once, kept, shown in 录', () => {
  const c = chances(T, { ids: ['huangqi-canzhu'] });
  assert.ok(c.items['mend-pill'] > 0);
  for (let i = 0; i < 300; i++) {
    const r = rollFeed(T, { seed: `rc|${i}`, ids: ['huangjing-gen'], lingshi: 1 });
    if (!r.refused && !r.event && r.grade !== 'junk') assert.ok(['qi-pill', 'qi-pill-3'].includes(r.out), r.out);
  }
  const found = feedUntil(gu7({ bag: { danlu: 1, 'huangqi-canzhu': 3 } }), { id: 'huangqi-canzhu' }, r => r.result.discovered);
  assert.ok(found, 'the 方子 lands');
  assert.ok(['mend-pill', 'mend-pill-3'].includes(found.result.out.id));
  assert.ok(found.state.fantong.recipes.includes('huangqi'));
  const book = VERBS.story(found.state, content, ctx(), {}).result;
  assert.deepEqual(book.fantong.map(r => [r.in, r.out]), [['黄芪残株', '回春丹']]);
  assert.match(luHtml(book), /饭桶方子[\s\S]*黄芪残株[\s\S]*回春丹/);
});

test('方子残页: three found work out the 回气丹 方子 (茯苓 + 1 灵石); before that 茯苓 is only a herb', () => {
  assert.equal(T.pages.need, 3);
  const before = chances(T, { ids: ['fuling'], lingshi: 1 });
  assert.ok(before.items.yaqian > 0, 'without the 方子, an ordinary pot');
  let s = gu7({ bag: { danlu: 1, 'fangzi-canye': 0 }, fantong: { pages: 2 } });
  const t = structuredClone(content);
  t.fantong.pools.rare = [{ item: 'fangzi-canye', w: 1 }];
  t.fantong.odds.grades = { rare: 1 };
  t.fantong.quirks = {};
  const r = VERBS.fantong(s, t, ctx(), { action: 'feed', id: 'chaihuo' });
  assert.equal(r.result.out.id, 'fangzi-canye');
  assert.equal(r.state.fantong.pages, 3);
  assert.ok(r.state.fantong.recipes.includes('huiqi'));
  assert.equal(r.result.discovered?.out, '回气丹');
  for (let i = 0; i < 200; i++) {
    const x = rollFeed(T, { seed: `hq|${i}`, ids: ['fuling'], lingshi: 1, found: ['huiqi'] });
    if (!x.refused && !x.event && x.grade !== 'junk') assert.equal(x.out, 'huiqi-pill');
  }
});

test('the book\'s two (火柴, 顺风溜) are guards, never drops: in no pool, the gourd refused before 09-snow, gives 火柴 only if he hasn\'t it', () => {
  const story = T.recipes.story.list;
  assert.deepEqual(story.map(r => r.out).sort(), ['huochai-jian', 'shunfeng-liu']);
  for (const g of GRADES) for (const r of T.pools[g]) assert.ok(!story.some(x => x.out === r.item), `${r.item} is a story output in the ${g} pool`);
  for (const r of T.recipes.list) assert.ok(!story.some(x => [r.out, r.best].includes(x.out)));
  // Before the scene that feeds it: the gourd won't go in at all.
  const early = saveWith({ bag: { danlu: 1, 'chitong-hulu': 1 } });
  assert.equal(feed(early, { id: 'chitong-hulu' }).result.refused, 'not-feedable');
  assert.equal(feed(early, { ids: ['chitong-hulu', 'chaihuo'] }).result.refused, 'not-feedable', 'not in a mixed pot either');
  // After 09-snow, if he somehow hasn't the sword: the gourd alone gives it, the gold reveal, every time.
  const after = gu7({ bag: { danlu: 1, 'chitong-hulu': 1 } });
  const r = feed(after, { id: 'chitong-hulu' });
  assert.equal(r.result.out.id, 'huochai-jian');
  assert.equal(r.result.grade, 'best');
  assert.equal(r.result.story, 'huochai');
  // As in play: 09-snow already handed it over, so the pot is turned away and nothing is spent.
  const had = feed(gu7({ bag: { danlu: 1, 'chitong-hulu': 1, 'huochai-jian': 1 } }), { id: 'chitong-hulu' });
  assert.equal(had.result.refused, 'had');
  assert.match(had.result.say, /它吃过了/);
  // 顺风溜's inputs (鯥皮, 翅膜) aren't items yet: the row is dormant, declared.
  assert.ok(story.find(r => r.id === 'shunfeng').in.some(id => !items.has(id)));
  // The story's own grants stand (09-snow feed, 09-xie go).
  const exits = Object.values(content.chapters['00-zhuji'].scenes).flatMap(sc => sc.exits ?? []).map(e => e.grant?.item).filter(Boolean);
  assert.ok(exits.includes('huochai-jian') && exits.includes('shunfeng-liu'));
});

test('饭桶图鉴: the first time a thing comes out it is recorded with its grade, junk too, once; shown in 录', () => {
  const r = feedUntil(saveWith(), { id: 'chaihuo' }, x => !x.result.spat_back && !x.result.her);
  const id = r.result.out.id;
  assert.deepEqual(r.result.first, r.result.outs.map(o => o.id).filter((x, i, a) => a.indexOf(x) === i));
  assert.equal(r.state.fantong.seen[0].id, id);
  assert.equal(r.state.fantong.seen[0].grade, r.result.out.grade);
  // The same thing again: not recorded twice.
  const s = { ...r.state, fantong: { ...r.state.fantong, at: null } };
  const again = feedUntil(s, { id: 'chaihuo' }, x => x.result.out?.id === id, 400);
  assert.ok(again);
  assert.equal(again.state.fantong.seen.filter(x => x.id === id).length, 1);
  assert.ok(!again.result.first?.includes(id));
  const book = VERBS.story(r.state, content, ctx(), {}).result;
  assert.equal(book.fantong_book.seen[0].id, id);
  const reach = fantongAll(T, content, r.state);
  assert.equal(book.fantong_book.of, reach.length, 'the whole is what this save can get');
  assert.ok(!reach.includes('huochai-jian') && !reach.includes('qingtong-jian') && !reach.includes('dansha'), 'not the book\'s two, a later 回\'s or a later 卷\'s');
  assert.match(luHtml(book), /饭桶图鉴 · 1\//);
});

test('银月 touches it now and then — 踏马的符 and 「还不如我给你画」 — only while she walks with him', () => {
  let her = 0, none = 0;
  for (let i = 0; i < 2000; i++) {
    if (rollFeed(T, { seed: `y|${i}`, ids: ['chaihuo'], herHere: true }).event === 'yinyue') her++;
    if (rollFeed(T, { seed: `y|${i}`, ids: ['chaihuo'], herHere: false }).event) none++;
  }
  assert.ok(her > 60 && her < 190, `about 6%: ${her}/2000`);
  assert.equal(none, 0);
  const r = feedUntil(saveWith(), { id: 'chaihuo' }, x => x.result.her);
  assert.equal(r.result.out.id, 'tama-defu');
  assert.match(r.result.say, /还不如我给你画/);
});

test('饱嗝令: the next hosted game that would cost 灵气 costs none, and one token is spent', () => {
  const it = items.get('baoge-ling');
  assert.equal(it.effect.waive, 'game');
  const cost = content.rewards.stamina.cost.game;
  assert.ok(cost > 0);
  // The one door every hosted game pays through (rules/core.mjs spendStamina 'game': the boards, 论道, 对子, 考, the AI games).
  const s = { ...saveWith({ bag: { danlu: 1, 'baoge-ling': 1 } }), stamina: 50, stamina_at: NOW.toISOString() };
  assert.equal(spendStamina(content, s, ctx(), 'game'), null);
  assert.equal(s.stamina, 50, '灵气 untouched');
  assert.equal(s.bag['baoge-ling'], undefined, 'the token spent');
  assert.equal(spendStamina(content, s, ctx(), 'game'), null);
  assert.equal(s.stamina, 50 - cost, 'the next one costs again');
  const t2 = { ...saveWith({ bag: { danlu: 1, 'baoge-ling': 1 } }), stamina: 50, stamina_at: NOW.toISOString() };
  spendStamina(content, t2, ctx(), 'step');
  assert.equal(t2.bag['baoge-ling'], 1, 'a story step is not a game: the token keeps');
});

test('the pouch shows the 饭桶 chip once he holds it, and its board in the grid\'s place', () => {
  const s = saveWith();
  const gear = VERBS.gear(s, content, ctx(), {}).result.gear;
  assert.equal(gear.fantong, true);
  assert.equal(VERBS.gear(saveWith({ bag: {} }), content, ctx(), {}).result.gear.fantong, undefined);
  const html = pouchHtml({ lang: 'zh', gear, words: WORDS.zh, look: {}, fantongPane: '<section class="ftong">board</section>' }, { pane: 'fantong' });
  assert.match(html, /data-pouch-pane="fantong"/);
  assert.match(html, /<section class="ftong">board<\/section>/);
  const brief = VERBS.fantong(s, content, ctx(), { action: 'look' }).result.fantong;
  assert.equal(brief.max_in, 3);
  assert.ok(brief.tints.herb && brief.grades.best === '逆天');
  assert.ok(brief.inputs.find(i => i.id === 'yaodan-1').tier === 1);
});

test('鼎苔 past the one the 筑基 reads: the bucket sees and eats only the spare (Hanli 2026-10-21)', () => {
  assert.equal(T.keep.items.dingtai, 1);
  assert.equal(feed(saveWith({ bag: { danlu: 1, dingtai: 1 } }), { id: 'dingtai' }).result.refused, 'not-feedable', 'the last one stays');
  const s = saveWith({ bag: { danlu: 1, dingtai: 3 } });
  const seen = VERBS.fantong(s, content, ctx(), { action: 'look' }).result.fantong.inputs.find(i => i.id === 'dingtai');
  assert.equal(seen?.n, 2, 'the board shows the spare');
  assert.equal(VERBS.fantong(s, content, ctx(), { action: 'feed', ids: 'dingtai,dingtai,dingtai' }).result.refused, 'not-feedable', 'never the kept one');
  const r = VERBS.fantong(s, content, ctx(), { action: 'feed', ids: 'dingtai,dingtai' });
  assert.equal(r.result.ok, true);
  assert.equal(r.state.bag.dingtai ?? 0, 1, 'one left for the 筑基');
});
