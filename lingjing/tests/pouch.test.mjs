// 储物袋 (Hanli, 2026-09-25; rules/pouch.mjs): the bag has room, counted in
// slots — one id one slot, stacks unlimited, the story's keys free; room by
// realm plus a bigger pouch bought once each. Full: drops, rewards and grants
// wait at the door for his choice (`full_offer`: swap · take · let go — Hanli
// 11-02 「待取感觉应该删掉」); a find and a purchase are refused.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { everyJuan } from './prologue.mjs';
import { newState } from '../scripts/state.mjs';
import { meet, trade, VERBS } from '../scripts/rules.mjs';
import { drop, giveCharm } from '../scripts/rules/arms.mjs';
import { pay } from '../scripts/rules/core.mjs';
import { freeSlot, pouchCap, slotsUsed } from '../scripts/rules/pouch.mjs';
import { itemOf } from '../scripts/rules/errands.mjs';

// The engine on the old spine, every 卷 open (prologue.mjs everyJuan); tests/juan.test.mjs walls 卷一.
const content = everyJuan(loadContent());
const NOW = new Date('2026-09-25T12:00:00');
const ctx = () => ({ now: NOW, quests: [] });
// A fixed seed: a new save's is its creation instant, and NOW is wall-clock local time — under another time zone it is
// another instant, another seed, and the fights' 1-in-3 符 coin (arms.mjs drop) falls otherwise.
const base = { ...newState(content, 'zh', NOW), seed: 'pouch', scene: null, chapter: '02-yan', ended: ['00-prologue', '01-ji'], name: '清玄', traits: ['wood', 'water'], place: 'pengcheng', wealth: 5000 };
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
  // 鹿皮 is free only while an exit of the open chapter still needs it (the rent).
  assert.equal(freeSlot(content, at({}, { chapter: '00-prologue', ended: [], done_scenes: [] }), 'deer-hide'), true);
  assert.equal(freeSlot(content, at({}), 'deer-hide'), false);
});

test('full: a fight\'s drop and a grant wait at the door for his choice, said in the rules\' line; nothing is held', () => {
  const creature = content.creatures.creatures.find(c => c.drops);
  const s = at(fill(24, {}, [creature.drops, 'talisman']));
  const got = drop(content, s, creature, NOW);
  assert.ok(!got.some(g => g.id === 'talisman'), 'this save\'s coin leaves no 符 off the fight (the seed is pinned above)');
  const mine = got.find(g => g.id === creature.drops);
  assert.equal(mine.offered, true);
  assert.equal(s.bag[creature.drops], undefined, 'nothing new in the pouch');
  assert.deepEqual(s.full_offer[0], { id: creature.drops, n: 1, from: 'fight' }, 'it waits at the door, its source named');
  // An errand's or a scene's grant (pay), a rumor's 符 — the same, queued on the one card.
  const want = plain.find(id => !s.bag[id] && !s.full_offer.some(o => o.id === id));
  const paid = pay(content, s, ctx(), { table: 'quest', progress: 0, wealth: 0, item: want });
  assert.equal(paid.offered, true);
  assert.equal(paid.pouch_full, `储物袋满了：${itemOf(content, want).name.zh}等你定夺。`);
  const charm = giveCharm(content, s);
  assert.equal(charm.offered, true);
  assert.deepEqual(s.full_offer.map(o => o.id), [creature.drops, want, 'talisman']);
  assert.equal('held' in s, false, 'no 待取 written');
  // The same thing again: one row, more of it.
  giveCharm(content, s);
  assert.equal(s.full_offer.filter(o => o.id === 'talisman').length, 1);
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

test('at the door: swap drops a stack for the new thing, take wants room, letgo lets it go; toss throws a slot away', () => {
  const s = at(fill(24, {}, ['qi-pill', 'ginseng']), { full_offer: [{ id: 'qi-pill', n: 2, from: 'fight' }, { id: 'ginseng', n: 1 }] });
  assert.equal(VERBS.bag(s, content, ctx(), { action: 'take', id: 'qi-pill' }).result.refused, 'bag-full');
  const swapped = VERBS.bag(s, content, ctx(), { action: 'swap', id: plain[0], take: 'qi-pill' });
  assert.equal(swapped.result.ok, true);
  assert.equal(swapped.state.bag[plain[0]], undefined, 'the stack dropped');
  assert.equal(swapped.state.bag['qi-pill'], 2, 'the new thing in, all of it');
  assert.deepEqual(swapped.state.full_offer.map(o => o.id), ['ginseng'], 'the next waits on the same card');
  assert.deepEqual([swapped.result.pouch.used, swapped.result.pouch.cap], [24, 24]);
  assert.deepEqual(swapped.result.pouch.offers.map(o => [o.id, o.room]), [['ginseng', false]]);
  const gone = VERBS.bag(swapped.state, content, ctx(), { action: 'letgo', id: 'ginseng' });
  assert.equal(gone.result.ok, true);
  assert.equal(gone.state.full_offer, undefined, 'nothing left waiting');
  assert.equal(gone.state.bag.ginseng, undefined, 'let go: never in the bag');
  // Room made another way (a 卖, a 丢): 收下.
  const tossed = VERBS.bag(s, content, ctx(), { action: 'toss', id: plain[0] });
  assert.equal(tossed.result.pouch.used, 23);
  assert.deepEqual(tossed.result.pouch.offers.map(o => o.room), [true, true]);
  const took = VERBS.bag(tossed.state, content, ctx(), { action: 'take', id: 'qi-pill' });
  assert.equal(took.state.bag['qi-pill'], 2);
  // A key the story needs and a thing worn are not thrown away, nor swapped out.
  assert.equal(VERBS.bag(at({ 'ferry-token': 1 }), content, ctx(), { action: 'toss', id: 'ferry-token' }).result.refused, 'key-in-use');
  assert.equal(VERBS.bag(at({ 'bamboo-sword': 1 }, { wear: { weapon: 'bamboo-sword' } }), content, ctx(), { action: 'toss', id: 'bamboo-sword' }).result.refused, 'worn');
  assert.equal(VERBS.bag(at({ 'bamboo-sword': 1 }, { wear: { weapon: 'bamboo-sword' }, full_offer: [{ id: 'qi-pill', n: 1 }] }), content, ctx(), { action: 'swap', id: 'bamboo-sword', take: 'qi-pill' }).result.refused, 'worn');
  assert.equal(VERBS.bag(at({}), content, ctx(), { action: 'letgo', id: 'qi-pill' }).result.refused, 'not-offered');
  assert.equal(VERBS.bag(at({}), content, ctx(), { action: 'claim', id: 'qi-pill' }).result.refused, 'unknown-action', 'claim is gone');
});

test('a save\'s old 待取 moves into the pouch while there is room, the rest to the door — never dropped', async () => {
  const { fitHeld } = await import('../scripts/rules/pouch.mjs');
  const roomy = fitHeld(content, at({ 'qi-pill': 1 }, { held: { yuanzhi: 1, 'qi-pill': 2 } }));
  assert.equal('held' in roomy, false);
  assert.deepEqual([roomy.bag.yuanzhi, roomy.bag['qi-pill'], roomy.full_offer], [1, 3, undefined]);
  const full = fitHeld(content, at(fill(24, {}, ['yuanzhi']), { held: { yuanzhi: 1 } }));
  assert.equal('held' in full, false);
  assert.deepEqual(full.full_offer, [{ id: 'yuanzhi', n: 1, from: 'held' }]);
  const none = at({});
  assert.equal(fitHeld(content, none), none, 'nothing to move: the state itself');
  // Look carries the door's queue for the card: the thing, its tile, whether there is room.
  const { look } = await import('../scripts/rules/look.mjs');
  const seen = look(full, content, ctx()).full_offer;
  assert.deepEqual(seen.map(o => [o.id, o.name, o.n, o.room, o.from]), [['yuanzhi', itemOf(content, 'yuanzhi').name.zh, 1, false, 'held']]);
  assert.equal('full_offer' in look(roomy, content, ctx()), false);
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

test('an old save over its room keeps everything; new things wait at the door', () => {
  const old = at(fill(28));
  const g = VERBS.gear(old, content, ctx()).result.gear;
  assert.deepEqual([g.pouch.used, g.pouch.cap], [28, 24]);
  assert.equal(g.bag.length, 28, 'nothing taken away');
  const s = structuredClone(old);
  pay(content, s, ctx(), { table: 'quest', progress: 0, wealth: 0, item: 'pouch-mid' });
  assert.deepEqual(s.full_offer, [{ id: 'pouch-mid', n: 1, from: 'quest' }]);
  assert.equal(Object.keys(s.bag).length, 28);
});

test('the gear read carries the pouch, what waits at the door, `free` and whether a market is here', () => {
  const g = VERBS.gear(at({ 'ferry-token': 1, 'qi-pill': 2 }, { full_offer: [{ id: 'ginseng', n: 1 }] }), content, ctx()).result.gear;
  assert.equal(g.market, true);
  assert.deepEqual(g.pouch.offers.map(h => [h.id, h.n, h.room]), [['ginseng', 1, true]]);
  assert.equal(g.bag.find(b => b.id === 'ferry-token').free, true);
  assert.equal(g.bag.find(b => b.id === 'qi-pill').free, undefined);
});

test('the English line', () => {
  const s = at(fill(24), { lang: 'en' });
  const paid = pay(content, s, ctx(), { table: 'quest', progress: 0, wealth: 0, item: plain[27] });
  assert.match(paid.pouch_full, /^The storage pouch is full — .+ waits on your choice\.$/);
});

test('the panel: header used/cap, no 待取, tabs with counts, tiles, the detail and its taps — zh and en', async () => {
  const { WORDS } = await import('../scripts/cards.js');
  const { pouchHtml, tabOf } = await import('../scripts/pouch.js');
  const s = at({ 'qi-pill': 3, 'bamboo-sword': 1, ginseng: 2, talisman: 1, 'ferry-token': 1, 'pouch-mid': 1 });
  const g = VERBS.gear(s, content, ctx()).result.gear;
  assert.deepEqual(Object.fromEntries(g.bag.map(i => [i.id, tabOf(i)])),
    { 'qi-pill': 'pill', 'bamboo-sword': 'arms', ginseng: 'material', talisman: 'charm', 'ferry-token': 'story', 'pouch-mid': 'arms' });
  for (const lang of ['zh', 'en']) {
    const c = { look: { lang, words: content.dictionary.words?.[lang] ?? {} }, gear: VERBS.gear({ ...s, lang }, content, ctx()).result.gear, lang, words: WORDS[lang], artBase: '../worlds/jiuding/' };
    const all = pouchHtml(c, {});
    assert.match(all, lang === 'zh' ? /储物袋[\s\S]*5\/24 格/ : /Storage Pouch[\s\S]*5\/24 slots/, `${lang}: the ferry token takes no slot`);
    assert.doesNotMatch(all, /data-pouch-pane="held"|待取|data-claim/);
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
    assert.match(pill, new RegExp(`data-sell="qi-pill"[^>]*>[^<]*${content.items.items.find(i => i.id === 'qi-pill').sell}<`));
    assert.match(pill, /data-toss="qi-pill"/);
    assert.match(pouchHtml(c, { sel: 'qi-pill', toss: 'qi-pill' }), /role="alertdialog"[\s\S]*data-toss-yes="qi-pill"[\s\S]*data-toss-no/);
    // the story's key: no 卖, no 丢
    const key = pouchHtml(c, { sel: 'ferry-token' });
    assert.doesNotMatch(key, /data-sell="ferry-token"|data-toss="ferry-token"/);
    // a bigger pouch is carried
    assert.match(pouchHtml(c, { sel: 'pouch-mid' }), /data-use="pouch-mid"/);
    // The head is one row of segments and one 合上 (Hanli 10-27: 「回储物袋这个按钮和其他几个关系不合理」):
    // the shown one marked, the same head on every pane, no 「回储物袋」 anywhere, the worn row under 储物袋 only.
    for (const pane of [null, 'held']) {
      const h = pouchHtml(c, { pane });
      const head = h.match(/<header class="luhead phead">([\s\S]*?)<\/header>/)[1];
      assert.deepEqual([...head.matchAll(/class="pseg( on)?" data-pouch-pane="(\w*)"/g)].map((m) => [m[2], Boolean(m[1])]), [['', true], ['deck', false]], 'a 待取 asked for is no pane');
      assert.equal((head.match(/data-pouch-close/g) ?? []).length, 1);
      assert.doesNotMatch(h, /回储物袋|Back to the pouch|pback/);
      assert.equal(/class="pwornrow"/.test(h), true, 'a 待取 asked for falls back to the grid, the worn row over it');
    }
    // away from a market there is no 卖
    const road = { ...c, gear: VERBS.gear({ ...s, lang, place: 'sishui' }, content, ctx()).result.gear };
    assert.doesNotMatch(pouchHtml(road, { sel: 'qi-pill' }), /data-sell/);
  }
  // over the room: said, never taken away
  const over = VERBS.gear(at(fill(28)), content, ctx()).result.gear;
  assert.match(pouchHtml({ look: {}, gear: over, lang: 'zh', words: WORDS.zh }, {}), /28\/24 格[\s\S]*超出 4 格/);
});

test('a pill from 银月\'s furnace is its own 九转 item — more 修为 than the market\'s, not sold, and its card shows nine gold lines (his, 2026-09-29)', async () => {
  const { zhuanHtml, pouchHtml } = await import('../scripts/pouch.js');
  const { WORDS } = await import('../scripts/cards.js');
  const item = id => content.items.items.find(i => i.id === id);
  for (const [nine, market] of [['mend-pill-9', 'mend-pill'], ['qi-pill-9', 'qi-pill']]) {
    assert.equal(item(nine).zhuan, 9, nine);
    assert.ok((item(nine).effect?.progress ?? 0) > (item(market).effect?.progress ?? 0), `${nine} does more than ${market}`);
    assert.match(item(nine).name.zh, /^九转/);
    assert.equal(item(nine).sell, 0, '九转丹不能卖');
    assert.deepEqual(item(nine).sold, []);
  }
  const diyilu = content.chapters['00-waimen'].scenes['wm-diyilu'].exits.find(e => e.id === 'save'); // 留给爹 (2026-10-02: one pill, kept for his knee)
  assert.equal(diyilu.grant.item, 'mend-pill-9', 'the furnace\'s first pill is the 九转');
  assert.equal(content.quests.find(q => q.id === 'xu-yaoyuan-canzhu').grant.item, 'qi-pill-9');
  const html = zhuanHtml(9);
  assert.equal((html.match(/<i><\/i>/g) ?? []).length, 9);
  assert.match(html, /class="zhuan gold"/);
  assert.match(html, /九转 · 九道纹/);
  assert.equal(zhuanHtml(undefined), '');
  const s = at({ 'mend-pill-9': 1 });
  const gear = VERBS.gear(s, content, ctx(), {}).result.gear;
  const pill = gear.bag.find(i => i.id === 'mend-pill-9');
  assert.equal(pill.zhuan, 9);
  assert.equal(pill.usable, true);
  const pop = pouchHtml({ gear, words: WORDS.zh, lang: 'zh', look: {} }, { sel: 'mend-pill-9' });
  assert.match(pop, /class="pzhuan"><span class="zhuan gold"/);
});

test('the pouch he carries is named: the brief holds the realm\'s room and each bigger pouch put to use (Hanli 11-02: 「看不出来在身上」)', () => {
  const before = VERBS.gear(at({ 'pouch-low': 1 }, { tier: 'qi' }), content, ctx()).result.gear.pouch;
  assert.deepEqual([before.cap, before.base, before.carried], [24, 24, undefined]);
  const s = at({ 'pouch-low': 1, 'pouch-mid': 2 }, { tier: 'qi', place: 'ye' });
  const r = trade(s, content, ctx(), { action: 'use', id: 'pouch-low' });
  assert.equal(r.state.bag['pouch-low'], undefined, 'used for good: it leaves the bag');
  const p = r.result.pouch;
  assert.deepEqual([p.cap, p.base], [30, 24]);
  assert.deepEqual(p.carried, [{ id: 'pouch-low', name: '下品储物袋', art: itemOf(content, 'pouch-low').art, adds: 6 }]);
  const both = trade(r.state, content, ctx(), { action: 'use', id: 'pouch-mid' }).result.pouch;
  assert.deepEqual(both.carried.map(c => [c.id, c.adds]), [['pouch-mid', 12], ['pouch-low', 6]], 'biggest first');
  assert.equal(both.cap, 42);
});

test('the panel: a 储物袋 cell in the worn row, the header 24/30, 换上 says what it adds, a carried kind shows as on him — zh and en', async () => {
  const { WORDS } = await import('../scripts/cards.js');
  const { pouchHtml } = await import('../scripts/pouch.js');
  const unused = at({ 'pouch-low': 1, 'pouch-mid': 2, 'qi-pill': 1 }, { tier: 'qi', place: 'ye' });
  const used = trade(trade(unused, content, ctx(), { action: 'use', id: 'pouch-low' }).state, content, ctx(), { action: 'use', id: 'pouch-mid' }).state;
  const ctxOf = (s, lang) => ({ look: { lang, words: content.dictionary.words?.[lang] ?? {} }, gear: VERBS.gear({ ...s, lang }, content, ctx()).result.gear, lang, words: WORDS[lang] });
  for (const lang of ['zh', 'en']) {
    const zh = lang === 'zh';
    const cell = (h) => h.match(/<div class="pworn ppouch">([\s\S]*?)<\/div>/)?.[1] ?? '';
    const before = pouchHtml(ctxOf(unused, lang), { sel: 'pouch-low' });
    assert.match(cell(before), zh ? /储物袋<\/span><b>随身储物袋 · 24 格<\/b>/ : /Pouch<\/span><b>Plain pouch · 24 slots<\/b>/);
    assert.match(before, zh ? /data-use="pouch-low">换上 · 多 6 格</ : /data-use="pouch-low">Carry it · \+6 slots</);
    assert.doesNotMatch(cell(before), /data-remove/, 'used for good: no 卸下');
    const after = pouchHtml(ctxOf(used, lang), { sel: 'pouch-mid' });
    assert.match(after, zh ? /2\/42 格/ : /2\/42 slots/, 'the header counts the room he carries');
    assert.match(cell(after), zh ? /<b>中品储物袋、下品储物袋 · 42 格<\/b>/ : /<b>Middle-grade storage pouch \+ Low-grade storage pouch · 42 slots<\/b>/);
    assert.doesNotMatch(after, /data-pouch-item="pouch-low"/, 'the one used left the bag');
    // A second 中品储物袋 adds nothing: marked as on him, no 换上, said so.
    assert.match(after, new RegExp(`class="ptile sel worn"[^>]*data-pouch-item="pouch-mid"[\\s\\S]*?<span class="pmark">${WORDS[lang].worn}</span>`));
    assert.doesNotMatch(after, /data-use="pouch-mid"/);
    assert.match(after, zh ? /这样的储物袋已在身上/ : /You carry one like it already/);
    assert.doesNotMatch(after, /已换上|Carried:/, 'the worn row names it, not a line under the head');
    assert.doesNotMatch(before + after, /undefined|\{[a-z]+\}|\[object/);
  }
});

test('the open panel reads the gear again after every bag verb — a use that landed redraws its count and 格数 at once (Hanli 11-02: 「服用聚气丹时, UI没刷新, 数量没减少」)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  // openGear on an open panel only switches its pane (600754dd); each write path rereads the rules' gear itself.
  for (const fn of ['useItem', 'bagTap', 'fedFantong', 'firePanglu']) {
    const body = src.match(new RegExp(`async function ${fn}\\([^)]*\\) \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? '';
    assert.match(body, /await rereadGear\(\)/, `${fn} rereads the gear`);
  }
  assert.match(src, /async function rereadGear\(\) \{\s*const g = await verb\('gear'\)[\s\S]*?keep\(\{ gear: g\.gear \}\)/);
  // …and what the reread carries is the use: one pill fewer, the panel's tile says so.
  const { WORDS } = await import('../scripts/cards.js');
  const { pouchHtml } = await import('../scripts/pouch.js');
  const s = at({ 'qi-pill': 6 }, { tier: 'qi' });
  const after = trade(s, content, ctx(), { action: 'use', id: 'qi-pill' }).state;
  const html = pouchHtml({ look: {}, gear: VERBS.gear(after, content, ctx()).result.gear, lang: 'zh', words: WORDS.zh }, { sel: 'qi-pill' });
  assert.match(html, /data-pouch-item="qi-pill"[\s\S]*?<b class="pn">×5<\/b>/);
});

test('储物袋满了: the card shows the new thing on the bag\'s tile, 丢一样换它 opens the same grid, 不要了, the queue counted — zh and en', async () => {
  const { WORDS } = await import('../scripts/cards.js');
  const { fullOfferHtml } = await import('../scripts/pouch.js');
  const { look } = await import('../scripts/rules/look.mjs');
  const s = at(fill(24, { 'bamboo-sword': 1, 'ferry-token': 1 }, ['qi-pill', 'ginseng', 'bamboo-sword']), { wear: { weapon: 'bamboo-sword' }, full_offer: [{ id: 'qi-pill', n: 2, from: 'fight' }, { id: 'ginseng', n: 1 }] });
  for (const lang of ['zh', 'en']) {
    const zh = lang === 'zh';
    const l = look({ ...s, lang }, content, ctx());
    const gear = VERBS.gear({ ...s, lang }, content, ctx()).result.gear;
    const c = { look: l, gear, lang, words: WORDS[lang] };
    const card = fullOfferHtml(l.full_offer, c, {});
    assert.match(card, zh ? /储物袋满了/ : /The pouch is full/);
    assert.match(card, /class="ptile[^"]*"[^>]*>[\s\S]*?<span class="pname">[^<]+<\/span>[\s\S]*?×2/);
    assert.match(card, zh ? /data-offer-swap="qi-pill">丢一样换它</ : /data-offer-swap="qi-pill">Drop one for it</);
    assert.match(card, zh ? /data-offer-letgo="qi-pill">不要了</ : /data-offer-letgo="qi-pill">Let it go</);
    assert.equal((card.match(/class="fullrow"/g) ?? []).length, 2, 'the queue: a row each, one choice each');
    assert.match(card, /data-offer-letgo="ginseng"/);
    assert.doesNotMatch(card, /data-offer-drop/, 'the grid opens on 丢一样换它');
    const pick = fullOfferHtml(l.full_offer, c, { swap: 'qi-pill' });
    assert.match(pick, /class="ptabs"[\s\S]*class="pgrid"/, 'the bag\'s own tabs and grid');
    assert.equal((pick.match(/data-offer-drop="/g) ?? []).length, gear.bag.filter(i => !i.free && !i.worn).length);
    assert.doesNotMatch(pick, /data-offer-drop="(bamboo-sword|ferry-token)"/, 'worn and the story\'s: no drop');
    assert.match(pick, /class="ptile[^"]* off"[^>]*aria-disabled="true"/);
    assert.doesNotMatch(card + pick, /undefined|\{[a-z]+\}|\[object/);
  }
  assert.equal(fullOfferHtml(undefined, { lang: 'zh', words: WORDS.zh }), '');
  // In the panel too, over every pane (the 饭桶's outputs land while he is in it).
  const { pouchHtml } = await import('../scripts/pouch.js');
  const l = look(s, content, ctx()), gear = VERBS.gear(s, content, ctx()).result.gear;
  for (const pane of [null, 'deck']) assert.match(pouchHtml({ look: l, gear, lang: 'zh', words: WORDS.zh }, { pane }), /<\/header><div class="card fulloffer"/);
  // Room once more: the card says 收下.
  const room = look(at({}, { full_offer: [{ id: 'qi-pill', n: 1 }] }), content, ctx());
  assert.match(fullOfferHtml(room.full_offer, { look: room, lang: 'zh', words: WORDS.zh }), /data-offer-take="qi-pill">收下</);
});

test('no 待取 is written anywhere: every door that stows sends a full pouch to the door', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const dir = new URL('../scripts/rules/', import.meta.url);
  for (const f of readdirSync(dir).filter(f => f.endsWith('.mjs'))) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    assert.doesNotMatch(src, /\b(state|s)\.held\s*=|held:\s*\{\s*\.\.\.\(?(state|s)\.held/, `${f} writes no held`);
    assert.doesNotMatch(src, /storedLine|存进洞府待取/, `${f}: the old line`);
  }
});
