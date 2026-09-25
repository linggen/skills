// 储物袋 (Hanli, 2026-09-25; rules/pouch.mjs): the bag has room, counted in
// slots — one id one slot, stacks unlimited, the story's keys free; room by
// realm plus a bigger pouch bought once each. Full: drops, rewards and grants
// wait at the 洞府 (待取); a find and a purchase are refused; 待取 is tapped in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { meet, trade, VERBS } from '../scripts/rules.mjs';
import { drop, giveCharm } from '../scripts/rules/arms.mjs';
import { pay } from '../scripts/rules/core.mjs';
import { freeSlot, pouchCap, slotsUsed } from '../scripts/rules/pouch.mjs';
import { itemOf } from '../scripts/rules/errands.mjs';

const content = loadContent();
const NOW = new Date('2026-09-25T12:00:00');
const ctx = () => ({ now: NOW, quests: [] });
const base = { ...newState(content, 'zh', NOW), scene: null, chapter: '02-yan', ended: ['00-prologue', '01-ji'], name: '清玄', traits: ['wood', 'water'], place: 'pengcheng', wealth: 5000 };
// Things that each take a slot: no key, no bell, no pouch, none the story needs.
const plain = content.items.items.filter(i => !freeSlot(content, base, i.id) && i.kind !== 'pouch' && !i.made).map(i => i.id);
const fill = (n, extra = {}, skip = []) => Object.fromEntries([...plain.filter(id => !skip.includes(id)).slice(0, n).map(id => [id, 1]), ...Object.entries(extra)]);
const at = (bag, more = {}) => ({ ...base, bag, ...more });

test('the room grows with the realm, from rewards.json', () => {
  assert.deepEqual(content.rewards.pouch.by_tier, { qi: 24, foundation: 36, core: 48, nascent: 60 });
  assert.equal(pouchCap(content, at({}, { tier: 'qi' })), 24);
  assert.equal(pouchCap(content, at({}, { tier: 'foundation' })), 36);
  assert.equal(pouchCap(content, at({}, { tier: 'core' })), 48);
  assert.equal(pouchCap(content, at({}, { tier: 'nascent' })), 60);
  assert.equal(pouchCap(content, at({}, { tier: 'deity' })), 60, 'past the table, its top row');
  assert.ok(plain.length >= 25, 'the catalog can fill a 练气 pouch');
});

test('a stack is one slot; a key, her bell and a carried errand thing take none', () => {
  assert.equal(slotsUsed(content, at({ 'qi-pill': 9, ginseng: 3 })), 2);
  assert.equal(slotsUsed(content, at({ 'ferry-token': 1, 'moon-bell': 1 })), 0, 'a key and her bell are free');
  // 灵芝 is free only while an exit of the open chapter still needs it.
  assert.equal(freeSlot(content, at({}, { chapter: '00-prologue', ended: [], done_scenes: [] }), 'lingzhi'), true);
  assert.equal(freeSlot(content, at({}), 'lingzhi'), false);
});

test('full: a fight\'s drop and a grant wait at the 洞府, said in the rules\' line', () => {
  const creature = content.creatures.creatures.find(c => c.drops);
  const s = at(fill(24, {}, [creature.drops, 'talisman']));
  const got = drop(content, s, creature, NOW);
  const mine = got.find(g => g.id === creature.drops);
  assert.equal(mine.stored, true);
  assert.equal(s.bag[creature.drops], undefined, 'nothing new in the pouch');
  assert.equal(s.held[creature.drops], 1, 'it waits at the 洞府');
  // An errand's or a scene's grant (pay), a rumor's 符 — the same.
  const want = plain.find(id => !s.bag[id] && !s.held?.[id]);
  const paid = pay(content, s, ctx(), { table: 'quest', progress: 0, wealth: 0, item: want });
  assert.equal(paid.stored, true);
  assert.equal(paid.pouch_full, `储物袋已满，${itemOf(content, want).name.zh}存进洞府待取。`);
  const charm = giveCharm(content, s);
  assert.equal(charm.stored, true);
  // A stack he already holds still takes one more.
  const held = plain[0];
  pay(content, s, ctx(), { table: 'quest', progress: 0, wealth: 0, item: held });
  assert.equal(s.bag[held], 2);
});

test('with room, a grant goes straight into the pouch', () => {
  const s = at({});
  const paid = pay(content, s, ctx(), { table: 'quest', progress: 0, wealth: 0, item: 'ginseng' });
  assert.equal(s.bag.ginseng, 1);
  assert.equal(paid.pouch_full, undefined);
});

test('full: a find on the road is refused and stays there to take', () => {
  const find = content.meets.finds['徐'].findIndex(f => f.item);
  const item = content.meets.finds['徐'][find].item;
  const s = at(fill(24, {}, [item]), { place: 'huaidu', meets: { day: '2026-09-25', places: { huaidu: { kind: 'find', find: '徐', n: find } } } });
  const r = meet(s, content, ctx(), { action: 'take' });
  assert.equal(r.result.refused, 'bag-full');
  assert.equal(r.result.say, '储物袋已满，先卖或丢一样。');
  assert.equal(r.state, null, 'nothing changed: the meet is still open');
  // One slot freed, it is taken.
  const room = at(fill(23, {}, [item]), { place: 'huaidu', meets: s.meets });
  assert.equal(meet(room, content, ctx(), { action: 'take' }).result.ok, true);
});

test('full: buying something new is refused (bag-full); a stack held is bought', () => {
  const s = at(fill(24, {}, ['jade-ring']));
  const r = trade(s, content, ctx(), { action: 'buy', id: 'jade-ring' });
  assert.equal(s.bag['jade-ring'], undefined);
  assert.equal(r.result.refused, 'bag-full');
  const stack = trade(at(fill(24, { 'qi-pill': 1 })), content, ctx(), { action: 'buy', id: 'qi-pill' });
  assert.equal(stack.result.ok, true);
});

test('claim moves 待取 into the pouch when there is room; toss throws a slot away', () => {
  const s = at(fill(24, {}, ['qi-pill']), { held: { 'qi-pill': 2 } });
  assert.equal(VERBS.bag(s, content, ctx(), { action: 'claim', id: 'qi-pill' }).result.refused, 'bag-full');
  const tossed = VERBS.bag(s, content, ctx(), { action: 'toss', id: plain[0] });
  assert.equal(tossed.result.ok, true);
  assert.equal(tossed.state.bag[plain[0]], undefined);
  assert.equal(tossed.result.pouch.used, 23);
  const claimed = VERBS.bag(tossed.state, content, ctx(), { action: 'claim', id: 'qi-pill' });
  assert.equal(claimed.result.ok, true);
  assert.equal(claimed.state.bag['qi-pill'], 2);
  assert.equal(claimed.state.held, undefined, 'nothing left waiting');
  assert.deepEqual([claimed.result.pouch.used, claimed.result.pouch.cap], [24, 24]);
  // A key the story needs and a thing worn are not thrown away.
  assert.equal(VERBS.bag(at({ 'ferry-token': 1 }), content, ctx(), { action: 'toss', id: 'ferry-token' }).result.refused, 'key-in-use');
  assert.equal(VERBS.bag(at({ 'bamboo-sword': 1 }, { wear: { weapon: 'bamboo-sword' } }), content, ctx(), { action: 'toss', id: 'bamboo-sword' }).result.refused, 'worn');
  assert.equal(VERBS.bag(at({}), content, ctx(), { action: 'claim', id: 'qi-pill' }).result.refused, 'not-held');
});

test('a bigger 储物袋 raises the room for good, once each', () => {
  const s = at({ 'pouch-mid': 2 }, { place: 'ye' });
  const r = trade(s, content, ctx(), { action: 'use', id: 'pouch-mid' });
  assert.equal(r.result.ok, true);
  assert.deepEqual(r.state.pouch, ['pouch-mid']);
  assert.equal(pouchCap(content, r.state), 36);
  assert.equal(r.result.pouch.cap, 36);
  assert.equal(trade(r.state, content, ctx(), { action: 'use', id: 'pouch-mid' }).result.refused, 'pouch-used');
  assert.equal(trade(r.state, content, ctx(), { action: 'buy', id: 'pouch-mid' }).result.refused, 'pouch-used');
  const high = { ...r.state, pouch: ['pouch-mid', 'pouch-high'], tier: 'core' };
  assert.equal(pouchCap(content, high), 48 + 12 + 24);
});

test('an old save over its room keeps everything; new things wait at the 洞府', () => {
  const old = at(fill(28));
  const g = VERBS.gear(old, content, ctx()).result.gear;
  assert.deepEqual([g.pouch.used, g.pouch.cap], [28, 24]);
  assert.equal(g.bag.length, 28, 'nothing taken away');
  const s = structuredClone(old);
  pay(content, s, ctx(), { table: 'quest', progress: 0, wealth: 0, item: 'pouch-mid' });
  assert.equal(s.held['pouch-mid'], 1);
  assert.equal(Object.keys(s.bag).length, 28);
});

test('the gear read carries the pouch, the 待取 list, `free` and whether a market is here', () => {
  const g = VERBS.gear(at({ 'ferry-token': 1, 'qi-pill': 2 }, { held: { ginseng: 1 } }), content, ctx()).result.gear;
  assert.equal(g.market, true);
  assert.deepEqual(g.pouch.held.map(h => [h.id, h.n]), [['ginseng', 1]]);
  assert.equal(g.bag.find(b => b.id === 'ferry-token').free, true);
  assert.equal(g.bag.find(b => b.id === 'qi-pill').free, undefined);
});

test('the English line', () => {
  const s = at(fill(24), { lang: 'en' });
  const paid = pay(content, s, ctx(), { table: 'quest', progress: 0, wealth: 0, item: plain[27] });
  assert.match(paid.pouch_full, /^The storage pouch is full — .+ waits at the abode\.$/);
});

test('the panel: header used/cap and 待取, tabs with counts, tiles, the detail and its taps — zh and en', async () => {
  const { WORDS } = await import('../scripts/cards.js');
  const { pouchHtml, tabOf } = await import('../scripts/pouch.js');
  const s = at({ 'qi-pill': 3, 'bamboo-sword': 1, ginseng: 2, talisman: 1, 'ferry-token': 1, 'pouch-mid': 1 }, { held: { 'jade-fish': 1 } });
  const g = VERBS.gear(s, content, ctx()).result.gear;
  assert.deepEqual(Object.fromEntries(g.bag.map(i => [i.id, tabOf(i)])),
    { 'qi-pill': 'pill', 'bamboo-sword': 'arms', ginseng: 'material', talisman: 'charm', 'ferry-token': 'story', 'pouch-mid': 'arms' });
  for (const lang of ['zh', 'en']) {
    const c = { look: { lang, words: content.dictionary.words?.[lang] ?? {} }, gear: VERBS.gear({ ...s, lang }, content, ctx()).result.gear, lang, words: WORDS[lang], artBase: '../worlds/jiuding/' };
    const all = pouchHtml(c, {});
    assert.match(all, lang === 'zh' ? /储物袋[\s\S]*5\/24 格/ : /Storage Pouch[\s\S]*5\/24 slots/, `${lang}: the ferry token takes no slot`);
    assert.match(all, lang === 'zh' ? /data-pouch-pane="held">待取 1</ : /data-pouch-pane="held">1 waiting</);
    assert.match(all, /data-pouch-tab="all"[^>]*>[^<]+<span>6<\/span>/);
    assert.match(all, /data-pouch-tab="arms"[^>]*>[^<]+<span>2<\/span>/);
    assert.match(all, /data-pouch-tab="story"[^>]*>[^<]+<span>1<\/span>/);
    assert.equal((all.match(/class="ptile/g) ?? []).length, 6);
    assert.match(all, /<b class="pn">×3<\/b>/);
    assert.match(all, /src="\.\.\/worlds\/jiuding\/art\/items\/qi-pill\.webp"/);
    assert.doesNotMatch(all, /undefined|\{[a-z]+\}|\[object/);
    // a tab narrows the grid
    assert.equal((pouchHtml(c, { tab: 'pill' }).match(/class="ptile/g) ?? []).length, 1);
    // the detail: a pill is taken, sold at this market, dropped with a question first
    const pill = pouchHtml(c, { sel: 'qi-pill' });
    assert.match(pill, /data-use="qi-pill"/);
    assert.match(pill, /data-sell="qi-pill"[^>]*>[^<]*20</);
    assert.match(pill, /data-toss="qi-pill"/);
    assert.match(pouchHtml(c, { sel: 'qi-pill', toss: 'qi-pill' }), /role="alertdialog"[\s\S]*data-toss-yes="qi-pill"[\s\S]*data-toss-no/);
    // the story's key: no 卖, no 丢
    const key = pouchHtml(c, { sel: 'ferry-token' });
    assert.doesNotMatch(key, /data-sell="ferry-token"|data-toss="ferry-token"/);
    // a bigger pouch is carried; 待取 has its 收进
    assert.match(pouchHtml(c, { sel: 'pouch-mid' }), /data-use="pouch-mid"/);
    assert.match(pouchHtml(c, { pane: 'held' }), /data-claim="jade-fish"/);
    // away from a market there is no 卖
    const road = { ...c, gear: VERBS.gear({ ...s, lang, place: 'sishui' }, content, ctx()).result.gear };
    assert.doesNotMatch(pouchHtml(road, { sel: 'qi-pill' }), /data-sell/);
  }
  // over the room: said, never taken away
  const over = VERBS.gear(at(fill(28)), content, ctx()).result.gear;
  assert.match(pouchHtml({ look: {}, gear: over, lang: 'zh', words: WORDS.zh }, {}), /28\/24 格[\s\S]*超出 4 格/);
});
