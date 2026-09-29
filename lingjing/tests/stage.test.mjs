// The stage: one list, read by the page and by the rules. His law, 2026-09-18 —
// a widget may stand in the chat or on the stage, both sides are told, and only
// one of them shows it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { askMinusStage, lineHere, stageCards, stageOwns } from '../scripts/stage.mjs';

const kinds = cards => cards.map(c => (c.id ? `${c.card}:${c.id}` : c.card));
const AWAKE = { companion: { joined: true } }; // 银月 awake: the coins are hers to throw
const world = (over = {}) => ({ place: { id: 'ye', name: '邺城' }, scene: null, tasks: [], ...AWAKE, ...over });

test('the stage is one ordered list, and Ling\'s own cards stand whatever else is true', () => {
  // nothing shown, nothing waiting: the day's coins fill it
  assert.deepEqual(kinds(stageCards(world())), ['hexagram']);
  // what she showed
  assert.deepEqual(kinds(stageCards(world(), { focus: [{ card: 'creature', id: 'fuzhu' }] })), ['creature:fuzhu']);
  // the head cards come first, in order
  const busy = world({ building: { paint: [1] }, stamina: { empty: true }, quest: { step: 'bell' } });
  assert.deepEqual(kinds(stageCards(busy)), ['building', 'empty', 'quest', 'hexagram']);
  // a fight takes the whole column
  assert.deepEqual(kinds(stageCards(busy, { fight: true })), ['fight']);
});

test('a line running under his feet takes the stage, and the page adds nothing of its own', () => {
  // 2026-09-18: standing at the water with the bell, the stage said 摇一摇铃 and
  // offered the day's coins beside it — 「在一个故事线或任务中走, 显示相关内容」
  const atWater = world({ quest: { step: 'ring', at_water: true }, place: { id: 'zhangnan', encounter: { tamed: false, game: { id: 'haunt:x' }, creature: { id: 'x' } } }, tasks: [{ kind: 'board', id: 'b', status: 'open' }] });
  assert.ok(lineHere(atWater));
  assert.deepEqual(kinds(stageCards(atWater)), ['quest']);
  // …and off the line, the same place shows all of it
  const walking = { ...atWater, quest: { step: 'ring', at_water: false } };
  assert.equal(lineHere(walking), null);
  assert.deepEqual(kinds(stageCards(walking)), ['quest', 'hexagram', 'board:b', 'duel:haunt:x']);
  // the market he stands in counts as the line too
  assert.ok(lineHere(world({ quest: { step: 'bell', shop_here: true } })));
  assert.equal(lineHere(world({ quest: { step: 'bell', shop_here: false, market: { id: 'puyang' } } })), null);
});

test('what the stage owns, the question does not offer — whichever side it came from', () => {
  const look = world({ quest: { step: 'ring', at_water: true }, place: { id: 'p', encounter: { tamed: false, beaten: true, likes: { id: 'x', name: 'X', held: 1 }, game: { id: 'haunt:longzhi' }, creature: { id: 'longzhi' } }, places: [{ id: 'p', here: true }, { id: 'ye' }] } });
  const owns = stageOwns(look, [{ card: 'quest' }, { card: 'duel', id: 'haunt:longzhi' }, { card: 'creature', id: 'longzhi' }, { card: 'map' }, { card: 'hexagram' }]);
  assert.ok(owns.has('ring'), '摇一摇铃 is on the quest card');
  assert.ok(owns.has('exit:haunt:longzhi') && owns.has('tame:longzhi'), '出手 on the duel card, 收服 on the beaten beast\'s own');
  assert.ok(!stageOwns(look, [{ card: 'duel', id: 'haunt:longzhi' }]).has('tame:longzhi'), 'the duel card carries no feeding (先降后收)');
  assert.ok(!owns.has('duel:haunt:longzhi'), 'no key the question cannot carry');
  assert.ok(owns.has('move:ye'), 'a place on the map walks there');
  assert.ok(owns.has('divine'), 'the coins, until they are cast');
  assert.ok(!stageOwns({ divination: { day: 'today' } }, [{ card: 'hexagram' }]).has('divine'), 'cast already: the card is only telling');

  const ask = { header: '此处', question: '何去何从？', options: [{ label: '摇一摇铃', ring: true }, { label: '邺城', move: 'ye' }, { label: '濮水', move: 'pushui' }, { label: '看看四周', look: true }] };
  const left = askMinusStage(ask, owns);
  assert.deepEqual(left.options.map(o => o.label), ['濮水', '看看四周'], 'only what no card shows');
  // nothing left worth asking: the chat says nothing and the stage has it all
  assert.equal(askMinusStage({ ...ask, options: ask.options.slice(0, 2) }, owns), null);
  assert.equal(askMinusStage(null, owns), null);
  // an answer to a riddle is not the card's 摇一摇铃 — it stays
  assert.equal(askMinusStage({ ...ask, options: [{ label: '甲', ring: true, answer: '甲' }, { label: '乙', ring: true, answer: '乙' }] }, owns).options.length, 2);
});

test('the goal is one slim line on the stage; its road is the question\'s to offer', async () => {
  // 2026-09-18: he walked 彭城 → 泗水岸 → asked for a map → tried a place with
  // no road → 「where to go, what should do」. The rules knew the whole time.
  // 2026-09-21: the card and the book moved behind the 事 chip (「current UI is
  // crowded」); the line stays, with nothing to tap, so the chat keeps the road.
  const { stageCards, stageOwns, askMinusStage } = await import('../scripts/stage.mjs');
  const look = { ...AWAKE, place: { id: 'sibei' }, tasks: [], waypoint: { scene: '03-cauldron', place: { id: 'liubo', name: '流波山' }, province: '青州', text: '路通向流波山。', toward: { id: 'liubo', name: '流波山' } } };
  assert.deepEqual(stageCards(look).map(c => c.card), ['goal', 'hexagram']);
  const owns = stageOwns(look, stageCards(look));
  assert.ok(!owns.has('move:liubo'), 'a line with no button owns no road');
  const ask = { header: '泗水北岸', question: '何去何从？', options: [{ label: '流波山', move: 'liubo' }, { label: '云龙山', move: 'yunlong' }] };
  assert.deepEqual(askMinusStage(ask, owns).options.map(o => o.label), ['流波山', '云龙山']);
  // no thread left: no line
  assert.deepEqual(stageCards({ ...look, waypoint: null }).map(c => c.card), ['hexagram']);
});

test('差事: an offer is what the stage is about — the book is behind the chip, the creature card gives way', async () => {
  const { stageCards, stageOwns } = await import('../scripts/stage.mjs');
  const look = { place: { id: 'sibei' }, tasks: [], offers: [{ id: 'xu-lvliang-look', title: '吕梁洪的水声' }], book: [{ id: 'x', title: 'x', need: [], ready: false }] };
  const focus = [{ card: 'creature', id: 'fuzhu' }];
  assert.deepEqual(stageCards(look, { focus }).map(c => c.card), ['offer'], 'no book on the stage, no beast beside the errand, no coins either');
  assert.deepEqual(stageCards({ ...look, offers: [] }, { focus }).map(c => c.card), ['creature'], 'taken, the place has its card back');
  // a shelf is something to DO, so it stays beside an offer
  assert.deepEqual(stageCards(look, { focus: [{ card: 'item', ids: ['lingzhi'] }, ...focus] }).map(c => c.card), ['offer', 'item']);
  // 接下 is on its own card, and the question never offers it: the card owns no key
  assert.ok(![...stageOwns(look, stageCards(look))].some(k => k.startsWith('quest:')), 'no key the question cannot carry');
  assert.deepEqual(stageCards({ ...AWAKE, place: { id: 'p' }, tasks: [] }).map(c => c.card), ['hexagram']);
  // two errands at one place: ONE card, and both 接下 are on it (彭城, 2026-09-22)
  const two = { ...look, offers: [...look.offers, { id: 'daily-20260922-patrol-sishui', title: '榜文' }] };
  assert.deepEqual(stageCards(two).map(c => c.card), ['offer']);
  // and every key it owns is one askMinusStage can match
  const owns = stageOwns(two, stageCards(two));
  assert.ok([...owns].every(k => /^(divine|ring|write|linger|(move|exit|tame):.+)$/.test(k)), [...owns].join(' '));
});

test('every card kind says whether it holds the stage — a new card cannot skip the decision', async () => {
  // 2026-09-21: "we fixed it several times, still exists". The chat's silence was decided by a hand-written
  // list in the rules that no new card was ever added to. Now the kinds declare it, and this sweep is the lock.
  const { CARD_KINDS, stageHolds, stageCards } = await import('../scripts/stage.mjs');
  const cards = await import('../scripts/cards.js');
  const fs = await import('node:fs');
  const drawn = [...fs.readFileSync(new URL('../scripts/cards.js', import.meta.url), 'utf8').match(/const RENDER = \{([^}]+)\}/)[1].matchAll(/\w+/g)].map(m => m[0]);
  for (const kind of [...drawn, 'fight']) assert.ok(kind in CARD_KINDS, `card kind "${kind}" is drawn but never says whether it holds the stage`);
  for (const [kind, k] of Object.entries(CARD_KINDS)) assert.ok(['boolean', 'function'].includes(typeof k.holds), `${kind}.holds`);
  void cards;
  // an offer, a find, a shelf hold; the coins and a creature's picture do not
  const at = { place: { id: 'p' }, tasks: [] };
  assert.equal(stageHolds(at, stageCards({ ...at, offers: [{ id: 'x' }] })), true);
  assert.equal(stageHolds(at, stageCards({ ...at, place: { id: 'p', meet: { kind: 'find' } } })), true);
  assert.equal(stageHolds(at, [{ card: 'item', ids: ['a'] }]), true);
  assert.equal(stageHolds(at, stageCards(at)), false, 'the day\'s coins never silence the chat');
  assert.equal(stageHolds(at, [{ card: 'creature', id: 'fuzhu' }, { card: 'goal' }]), false);
  // a beast holds until it has been met today
  const beast = won => ({ place: { id: 'p', encounter: { game: { id: 'haunt:kui' }, won } } });
  assert.equal(stageHolds(beast(false), [{ card: 'duel', id: 'haunt:kui' }]), true);
  assert.equal(stageHolds(beast(true), [{ card: 'duel', id: 'haunt:kui' }]), false);
});

test('a card Ling shows that the head already draws stands once (2026-09-25: 眼下要做的 twice)', () => {
  const look = { waypoint: { text: '鼎气要结丹后期' }, place: { id: 'puyang' } };
  const cards = stageCards(look, { focus: [{ card: 'goal' }, { card: 'map' }] });
  assert.equal(cards.filter(c => c.card === 'goal').length, 1);
  assert.ok(cards.some(c => c.card === 'map'), 'what the head does not draw stays');
});

/* 此地 · 此刻 · 行 — the stage in fixed slots (Hanli, 2026-09-29). On 马三's
   scene Ling Showed [panel, people]; the page drew panel, people, panel,
   people — the scene's own panel and people were put in front AFTER her Show
   was measured against the head. Now the page's kinds are never hers, and
   main holds one thing. */
test('马三\'s scene: Ling showing the panel and the people draws each once — the people in the header, ONE panel in main', async () => {
  const { loadContent } = await import('../scripts/content.mjs');
  const { newState } = await import('../scripts/state.mjs');
  const { look } = await import('../scripts/rules.mjs');
  const { show } = await import('../scripts/rules/verbs.mjs');
  const { stageSlots } = await import('../scripts/stage.mjs');
  const { TO_VALLEY, walk } = await import('./prologue.mjs');
  const content = loadContent(), NOW = new Date('2026-09-29T18:00:00'), ctx = { now: NOW, quests: [] };
  const s = walk(newState(content, 'zh', NOW), TO_VALLEY.slice(0, 1), content, NOW);
  const before = look(s, content, ctx);
  assert.ok(before.scene?.panel && before.scene?.people?.length, 'the scene has a panel and people');
  // The verb drops what the page owns, and says so; nothing left, the save is untouched.
  const r = show(s, content, ctx, { cards: [{ card: 'panel' }, { card: 'people' }] });
  assert.deepEqual(r.result.shown, []);
  assert.deepEqual(r.result.dropped, ['panel', 'people']);
  assert.equal(r.state, s, 'nothing written');
  // Written anyway (an old save), the stage still draws each once.
  const direct = stageCards(before, { focus: [{ card: 'panel' }, { card: 'people' }] });
  assert.deepEqual(direct.filter(c => c.card === 'panel' || c.card === 'people').map(c => c.card), ['panel', 'people'], 'the 2026-09-29 bug: panel, people, panel, people');
  const l = look({ ...s, shown: [{ card: 'panel' }, { card: 'people' }], shown_at: s.scene }, content, ctx);
  assert.deepEqual(l.stage.filter(c => c.card === 'panel' || c.card === 'people').map(c => c.card).sort(), ['panel', 'people']);
  const slots = stageSlots(l, l.stage);
  assert.deepEqual(kinds(slots.header), ['people']);
  assert.deepEqual(slots.main.map(c => c.card).filter(k => k === 'panel'), ['panel'], 'ONE panel in main');
  assert.ok(!slots.queue.some(t => t.cards.some(c => c.card === 'panel' || c.card === 'people')));
  // A card of hers beside them is kept.
  const mixed = show(s, content, ctx, { cards: [{ card: 'panel' }, { card: 'creature', id: 'fuzhu' }] });
  assert.deepEqual(mixed.result.shown, [{ card: 'creature', id: 'fuzhu' }]);
  assert.deepEqual(mixed.result.dropped, ['panel']);
});

test('the slots: the header is the page\'s, main holds ONE thing by fixed priority, the rest wait and the footer counts them', async () => {
  const { stageSlots } = await import('../scripts/stage.mjs');
  const at = (over = {}) => world({ scene: { panel: { taps: [] }, people: [{ name: '马三' }], exits: [{ id: 'name', value: true }] }, waypoint: { text: '去' }, ...over });
  // the panel and the scene's own choice card are one thing
  const l = at({ offers: [{ id: 'x' }], tasks: [{ kind: 'board', id: 'b', status: 'open' }] });
  const slots = stageSlots(l, stageCards(l, { focus: [{ card: 'creature', id: 'fuzhu' }] }));
  assert.deepEqual(kinds(slots.header), ['people', 'goal']);
  assert.deepEqual(kinds(slots.main), ['panel', 'value:name']);
  assert.deepEqual(slots.queue.map(t => kinds(t.cards).join(' ')), ['board:b', 'offer'], 'a board before an errand; Ling\'s creature gives way to the errand');
  assert.equal(slots.footer.waiting, 2);
  assert.equal(slots.key, 'panel:');
  // 还有 N 件 › puts the one in main off to the end of the line
  const next = stageSlots(l, stageCards(l), { skip: ['panel:'] });
  assert.deepEqual(kinds(next.main), ['board:b']);
  assert.equal(next.queue.at(-1).key, 'panel:');
  // a fight or 闭关 is the whole of main
  assert.deepEqual(kinds(stageSlots(l, stageCards(l, { fight: true })).main), ['fight']);
  // the coins are filler: alone they stand, beside anything else they go
  assert.deepEqual(kinds(stageSlots(world(), stageCards(world())).main), ['hexagram']);
  const shelf = stageSlots(world(), [{ card: 'item', ids: ['a'] }, { card: 'hexagram' }]);
  assert.deepEqual(kinds(shelf.main), ['item']);
  assert.equal(shelf.queue.length, 0);
  // the roads stand in the footer only while something holds — never in 闭关 or a corridor
  assert.equal(shelf.footer.roads, true);
  assert.equal(stageSlots(world(), stageCards(world())).footer.roads, false);
  assert.equal(stageSlots(world({ director: { corridor: true } }), [{ card: 'item', ids: ['a'] }]).footer.roads, false);
});

test('every card kind lives in exactly one slot, and the page\'s own kinds are never Ling\'s', async () => {
  const { CARD_KINDS, HEADER, MAIN, PAGE_OWNS, showable } = await import('../scripts/stage.mjs');
  for (const kind of Object.keys(CARD_KINDS)) {
    const homes = (HEADER.includes(kind) ? 1 : 0) + MAIN.filter(r => r.kinds.includes(kind)).length;
    assert.equal(homes, 1, `card kind "${kind}" lives in ${homes} slots`);
  }
  for (const kind of ['panel', 'people', 'goal', 'value', 'born', 'building', 'empty']) {
    assert.ok(PAGE_OWNS.has(kind));
    assert.equal(showable({ card: kind }), false);
  }
  assert.equal(showable({ card: 'creature' }), true);
  // Ling's Show can only fill MAIN: no kind of hers is in the header
  for (const kind of HEADER) assert.ok(PAGE_OWNS.has(kind), `${kind} is the page's`);
});

test('the page draws the slots: header, main (#focus) holding the one thing, footer with the roads, the count, the ask bar and the chips', async () => {
  const fs = await import('node:fs');
  const html = fs.readFileSync(new URL('../scripts/index.html', import.meta.url), 'utf8');
  const src = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  assert.match(html, /<div class="slothead" id="slotHead"><div class="huiline" id="huiLine"><\/div><div class="place" id="place"><\/div><div class="headcards" id="headCards"><\/div><\/div>\s*<div class="focus" id="focus"><\/div>/);
  assert.match(html, /<footer class="slotfoot" id="slotFoot"><div class="footrow" id="footRow"><\/div><div class="footchips" id="footChips"><\/div><div class="askbar" id="askbar" hidden><\/div><\/footer>/);
  assert.match(html, /id="stage"/, 'her place on the stage stays');
  const focus = src.slice(src.indexOf('function focusHtml(slots)'), src.indexOf('function toastsHtml()'));
  assert.match(focus, /slots\.main\.map\(drawCard\)/, 'main draws the one thing only');
  assert.doesNotMatch(src, /splitStage|queueHtml|const HEAD = /, 'no second list of where cards go');
  assert.match(src, /stageSlots\(look, cards\.filter\(inQueue\), \{ skip: view\.qSkip \}\)/);
  const strip = src.slice(src.indexOf('function statusHtml()'), src.indexOf('function statusHtml()') + 1500);
  assert.doesNotMatch(strip.slice(0, strip.indexOf('\n}')), /ChipHtml/, 'the chips are the footer\'s');
});

test('the day\'s coins wait for 银月 awake — asleep in the token, or not yet met, no 「请银月三钱六掷」 (his, 2026-09-29)', () => {
  assert.deepEqual(kinds(stageCards(world())), ['hexagram']);
  assert.deepEqual(kinds(stageCards(world({ companion: { joined: true, asleep: true } }))), []);
  assert.deepEqual(kinds(stageCards(world({ companion: null }))), []);
});
