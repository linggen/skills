// The stage: one list, read by the page and by the rules. His law, 2026-09-18 —
// a widget may stand in the chat or on the stage, both sides are told, and only
// one of them shows it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { askMinusStage, lineHere, stageCards, stageOwns } from '../scripts/stage.mjs';

const kinds = cards => cards.map(c => (c.id ? `${c.card}:${c.id}` : c.card));
const world = (over = {}) => ({ place: { id: 'ye', name: '邺城' }, scene: null, tasks: [], ...over });

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
  const look = world({ quest: { step: 'ring', at_water: true }, place: { id: 'p', encounter: { tamed: false, game: { id: 'haunt:longzhi' }, creature: { id: 'longzhi' } }, places: [{ id: 'p', here: true }, { id: 'ye' }] } });
  const owns = stageOwns(look, [{ card: 'quest' }, { card: 'duel', id: 'haunt:longzhi' }, { card: 'map' }, { card: 'hexagram' }]);
  assert.ok(owns.has('ring'), '摇一摇铃 is on the quest card');
  assert.ok(owns.has('exit:haunt:longzhi') && owns.has('tame:longzhi'), '出手 and the feeding are on the beast\'s card');
  assert.ok(owns.has('move:ye'), 'a place on the map walks there');
  assert.ok(owns.has('divine'), 'the coins, until they are cast');
  assert.ok(!stageOwns({ divination: { day: 'today' } }, [{ card: 'hexagram' }]).has('divine'), 'cast already: the card is only telling');

  const ask = { header: '此处', question: '何去何从？', options: [{ label: '摇一摇铃', ring: true }, { label: '邺城', move: 'ye' }, { label: '濮水', move: 'pushui' }, { label: '问问银月', ask: true }] };
  const left = askMinusStage(ask, owns);
  assert.deepEqual(left.options.map(o => o.label), ['濮水', '问问银月'], 'only what no card shows');
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
  const look = { place: { id: 'sibei' }, tasks: [], waypoint: { scene: '03-cauldron', place: { id: 'liubo', name: '流波山' }, province: '青州', text: '路通向流波山。', toward: { id: 'liubo', name: '流波山' } } };
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
  assert.ok(stageOwns(look, stageCards(look)).has('quest:xu-lvliang-look'), '接下 is on its own card');
  assert.deepEqual(stageCards({ place: { id: 'p' }, tasks: [] }).map(c => c.card), ['hexagram']);
});
