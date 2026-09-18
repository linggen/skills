// The shipped content lints clean, and the lint catches what it exists to
// catch: a dead next, a grant over its cap, a missing language, a creature
// with no picture, a scene nobody can reach.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lint, listWorlds, loadContent, loadWorld } from '../scripts/content.mjs';

const fresh = () => loadContent();
const prologue = c => c.chapters['00-prologue'];
const has = (problems, text) => problems.some(p => p.includes(text));

test('every shipped world lints clean', () => {
  assert.deepEqual(listWorlds(), ['jiuding']);
  for (const id of listWorlds()) assert.deepEqual(lint(loadWorld(id)), [], id);
});

test('the arts name an effect the bout knows and a tier on the ladder', () => {
  const c = loadWorld('jiuding');
  assert.deepEqual(c.arts.arts.map(a => a.id), ['fushui', 'wulei', 'yujian']);
  const bad = structuredClone(c);
  bad.arts.arts[0].effect = 'hit-harder'; bad.arts.arts[1].tier = 'god';
  const problems = lint(bad);
  assert.ok(has(problems, 'art fushui: unknown effect hit-harder'));
  assert.ok(has(problems, 'art wulei: unknown tier god'));
  const sold = structuredClone(c);
  sold.items.items.find(i => i.id === 'talisman').sold = ['徐'];
  assert.ok(has(lint(sold), 'item talisman: a made thing is not sold'));
});

test('a world is loaded by its id, and an unknown id names the ones that exist', () => {
  assert.equal(loadWorld('jiuding').world.id, 'jiuding');
  assert.equal(loadWorld().world.title.zh, '九鼎');
  assert.throws(() => loadWorld('nowhere'), /unknown world nowhere; worlds: jiuding/);
  assert.throws(() => loadWorld('../jiuding'), /unknown world/);
});

test('a novel\'s name anywhere in the world is caught', () => {
  const c = fresh();
  prologue(c).scenes['00-river'].setup.zh += '，韩立在岸边。';
  assert.ok(has(lint(c), 'scenes.00-river.setup.zh: names 韩立 (凡人修仙传)'));
  const d = fresh();
  d.creatures.creatures[0].quote.en += ' Xiao Yan';
  assert.ok(!has(lint(d), 'names'), 'only the listed names, never a translation the list lacks');
  d.creatures.creatures[0].quote.zh += '萧炎';
  assert.ok(has(lint(d), 'names 萧炎 (斗破苍穹)'));
});

test('the world card needs a folder-shaped id and a bilingual title and style', () => {
  const c = fresh();
  c.world.id = 'Jiu Ding';
  delete c.world.style.en;
  const problems = lint(c);
  assert.ok(has(problems, 'world: id must be'));
  assert.ok(has(problems, 'world: style needs zh and en'));
});

test('the prologue runs from the river to its end', () => {
  const ch = prologue(fresh());
  const path = [];
  for (let id = ch.first_scene; id; ) {
    path.push(id);
    const scene = ch.scenes[id];
    const onward = scene.exits.find(e => e.next && scene.buttons.includes(e.id));
    id = onward?.next;
  }
  assert.deepEqual(path, ['00-river', '00-waking', '00-stone', '00-practice', '00-fuzhu', '00-north']);
  assert.ok(ch.scenes['00-north'].exits.some(e => e.ends === '00-prologue'));
});

test('feeding Fuzhu is an exit no button offers', () => {
  const fuzhu = prologue(fresh()).scenes['00-fuzhu'];
  assert.ok(fuzhu.exits.some(e => e.id === 'gift'));
  assert.ok(!fuzhu.buttons.includes('gift'));
});

test('a dead next is caught', () => {
  const c = fresh();
  prologue(c).scenes['00-river'].exits[0].next = '00-nowhere';
  assert.ok(has(lint(c), 'next 00-nowhere does not exist'));
});

test('a grant over its cap is caught', () => {
  const c = fresh();
  prologue(c).scenes['00-fuzhu'].exits[0].grant.progress = 999;
  assert.ok(has(lint(c), 'over the scene cap'));
});

test('a missing language is caught', () => {
  const c = fresh();
  delete prologue(c).scenes['00-river'].setup.en;
  assert.ok(has(lint(c), 'needs both zh and en'));
});

test('a creature without its picture is caught', () => {
  const c = fresh();
  delete c.creatures.creatures[0].art;
  assert.ok(has(lint(c), 'needs art and art_source'));
});

test('a scene nobody can reach is caught', () => {
  const c = fresh();
  prologue(c).scenes['00-stray'] = { id: '00-stray', chapter: '00-prologue', buttons: [], exits: [{ id: 'x', means: 'x', stay: true }] };
  assert.ok(has(lint(c), 'scene 00-stray: cannot be reached'));
});

test('a need without a refusal line is caught', () => {
  const c = fresh();
  delete prologue(c).scenes['00-practice'].exits[0].refuse;
  assert.ok(has(lint(c), 'a need needs a refusal line'));
});

test('places: a road to nowhere, a road that does not come back, a tier off the ladder, a scene at no place', () => {
  const c = fresh();
  const xu = c.places['徐'];
  xu.places[0].roads.push('atlantis');
  xu.places[1].roads = xu.places[1].roads.filter(r => r !== 'sishui');
  xu.places[2].tier = 9;
  prologue(c).scenes['00-river'].at = 'atlantis';
  const problems = lint(c);
  assert.ok(has(problems, 'place sishui: road to atlantis, which is not a place'));
  assert.ok(has(problems, 'place sishui: road to sibei does not come back'));
  assert.ok(has(problems, 'place pengcheng: tier 9 is not on the ladder'));
  assert.ok(has(problems, 'scene 00-river: at atlantis, which is not a place of 徐'));
  const d = fresh();
  for (const p of d.places['徐'].places) p.roads = p.roads.filter(r => r !== 'xushan');
  d.places['徐'].places.find(p => p.id === 'xushan').roads = [];
  assert.ok(has(lint(d), 'place xushan: no road reaches it from the start'));
});

test('the catalog: a price below its sell, a missing picture, a pill over its table, a bag that names no item', () => {
  const c = fresh();
  const item = id => c.items.items.find(i => i.id === id);
  item('qi-pill').buy = 10;
  item('ginseng').art = 'art/items/nothing.svg';
  item('lingzhi').effect = { progress: 99, table: 'puzzle' };
  item('moon-bell').effect = { wear: 'hat' };
  item('jade-fish').kind = 'relic';
  prologue(c).scenes['00-fuzhu'].exits.find(e => e.id === 'gift').needs.bag = 'unicorn-horn';
  c.tasks.tasks[0].gives = { bag: 'unicorn-horn' };
  const problems = lint(c);
  assert.ok(has(problems, 'item qi-pill: buys for 10, below its sell price 20'));
  assert.ok(has(problems, 'item ginseng: art art/items/nothing.svg is missing'));
  assert.ok(has(problems, 'item lingzhi: progress 99 is over the puzzle cap of 20'));
  assert.ok(has(problems, 'item moon-bell: cannot wear on hat'));
  assert.ok(has(problems, 'item jade-fish: unknown kind relic'));
  assert.ok(has(problems, 'unknown item unicorn-horn'));
  assert.ok(has(problems, 'gives unknown item unicorn-horn'));
});

test('a shipped creature carries its pinyin, one syllable a character; the card reads it over the name', async () => {
  const c = loadWorld('jiuding');
  assert.equal(c.creatures.creatures.find(x => x.id === 'kui').pinyin, 'kuí');
  const bad = structuredClone(c);
  delete bad.creatures.creatures.find(x => x.id === 'kui').pinyin;
  bad.creatures.creatures.find(x => x.id === 'longzhi').pinyin = 'lóngzhí';
  const problems = lint(bad);
  assert.ok(has(problems, 'creature kui: needs pinyin'));
  assert.ok(has(problems, 'creature longzhi: pinyin "lóngzhí" needs one syllable for each of 2 characters'));
  const { spoken } = await import('../scripts/cards.js');
  assert.equal(spoken('蠪侄', 'lóng zhí'), '<ruby class="py">蠪<rt>lóng</rt>侄<rt>zhí</rt></ruby>');
  assert.equal(spoken('Kui', 'kuí'), 'Kui');
  assert.equal(spoken('雷神'), '雷神');
});

test('a riddle offers three or four answers to tap, exactly one of them right', () => {
  const c = loadWorld('jiuding');
  const bad = structuredClone(c);
  delete bad.riddles.zh.riddles['kui-1'].choices;
  bad.riddles.en.riddles['lei-1'].choices = ['wind', 'a river', 'a flood'];
  bad.riddles.zh.riddles['wu-1'].choices = ['鱼', '鸟', '鸟'];
  const problems = lint(bad);
  assert.ok(has(problems, 'riddle kui-1 (zh): needs three or four different choices'));
  assert.ok(has(problems, 'riddle lei-1 (en): choices need exactly one right answer'));
  assert.ok(has(problems, 'riddle wu-1 (zh): needs three or four different choices'));
});

test('the world map is on disk, and every place of a world with one stands on it', () => {
  const c = loadWorld('jiuding');
  const bad = structuredClone(c);
  delete bad.places['青'].places.find(p => p.id === 'penglai').map;
  bad.places['徐'].places.find(p => p.id === 'pengcheng').map = [1.2, 0.5];
  bad.world.atlas = { ...bad.world.atlas, file: 'art/map/nowhere.svg', provinces: { ...bad.world.atlas.provinces, 蜀: [0.1, 0.5] } };
  const problems = lint(bad);
  assert.ok(has(problems, 'place penglai: needs map [x, y]'));
  assert.ok(has(problems, 'place pengcheng: needs map [x, y]'));
  assert.ok(has(problems, 'atlas: map art/map/nowhere.svg is missing'));
  assert.ok(has(problems, 'atlas: unknown province 蜀'));
});

test('a creature needs a root; a duel needs a known creature, a kind and its withdrawn line', () => {
  const c = fresh();
  c.creatures.creatures[0].root = 'plasma';
  const subdue = prologue(c).scenes['00-fuzhu'].exits.find(e => e.id === 'subdue');
  subdue.game = { id: 'subdue-x', kind: 'duel', creature: 'qilin' };
  delete subdue.withdrawn;
  prologue(c).scenes['00-fuzhu'].exits.find(e => e.id === 'around').game = { id: 'tickle-x', kind: 'tickle' };
  const problems = lint(c);
  assert.ok(has(problems, 'creature fuzhu: needs a root the traits know, not plasma'));
  assert.ok(has(problems, 'unknown game kind tickle'));
  assert.ok(has(problems, 'duels unknown creature qilin'));
  assert.ok(has(problems, 'a duel needs a withdrawn line'));
});

test('a road may cross into another province; a breakthrough needs its line and a gated chapter', () => {
  const c = fresh();
  assert.ok(c.places['徐'].places.find(p => p.id === 'sibei').roads.includes('zhangnan'));
  assert.deepEqual(lint(c), []);
  const take = c.chapters['01-ji'].scenes['01-cauldron'].exits.find(e => e.id === 'take');
  delete take.refuse;
  c.chapters['01-ji'].gate = 99;
  const problems = lint(c);
  assert.ok(has(problems, 'a breakthrough needs a refusal line'));
  assert.ok(has(problems, 'no tier on the ladder has gate 99'));
});

test('chapter 1 walks from the Zhang to the cauldron and ends', () => {
  const ch = fresh().chapters['01-ji'];
  assert.equal(ch.opens, null, 'no lock while the game is built and tested'); assert.equal(ch.gate, 1); assert.equal(ch.corridor, false);
  const at = Object.values(ch.scenes).map(s => `${s.id}@${s.at}`);
  assert.deepEqual(at, ['01-altar@hebo', '01-arrive@zhangnan', '01-cauldron@zhangyuan', '01-deep@zhangyuan', '01-end@zhangyuan', '01-ye@ye']);
  assert.ok(ch.scenes['01-end'].exits.some(e => e.ends === '01-ji'));
  assert.ok(ch.scenes['01-cauldron'].exits.find(e => e.id === 'take').breakthrough);
});

test('chapter 3 walks from the Wei to the cauldron under the sea and ends', () => {
  const ch = fresh().chapters['03-qing'];
  assert.equal(ch.opens, null); assert.equal(ch.gate, 3); assert.equal(ch.province, '青');
  const at = Object.values(ch.scenes).map(s => `${s.id}@${s.at}`);
  assert.deepEqual(at, ['03-arrive@weishui', '03-cauldron@liubo', '03-deep@liubo', '03-end@liubo', '03-shore@penglai', '03-town@linzi']);
  assert.ok(ch.scenes['03-end'].exits.some(e => e.ends === '03-qing'));
  assert.ok(ch.scenes['03-cauldron'].exits.find(e => e.id === 'take').breakthrough);
  assert.deepEqual(ch.scenes['03-shore'].buttons, ['subdue', 'riddle', 'enough']);
});

// ── Made worlds ──
import { WORLD, lintMadeWorld, overlayWorld, madeWorldsDir } from '../scripts/content.mjs';

const outline = () => JSON.parse(JSON.stringify(loadContent().templates.world));

test('the made-world template is playable over the shipped world', () => {
  assert.deepEqual(lintMadeWorld(outline(), loadContent()), []);
  assert.equal(WORLD.places[1], 8);
});

test('a made world: a shipped id, a base province, a road that does not come back, a creature with art, a word the harness lacks', () => {
  const base = loadContent();
  const a = outline(); a.id = 'jiuding';
  assert.ok(has(lintMadeWorld(a, base), 'jiuding is a shipped world'));
  const b = outline(); b.province.id = '冀';
  assert.ok(has(lintMadeWorld(b, base), 'province: id must be lowercase'));
  const m = outline(); m.creatures[0].id = 'map';
  assert.ok(has(lintMadeWorld(m, base), 'map names the world'));
  const c = outline(); c.places[0].roads = ['bell'];
  assert.ok(has(lintMadeWorld(c, base), 'does not come back'));
  const d = outline(); d.creatures[0].art = 'art/x.png';
  assert.ok(has(lintMadeWorld(d, base), 'art is drawn later'));
  const e = outline(); e.words = { hitpoints: { zh: '血', en: 'HP' } };
  assert.ok(has(lintMadeWorld(e, base), 'word hitpoints: is not an id the harness has'));
  const f = outline(); f.cast = ['dragon'];
  assert.ok(has(lintMadeWorld(f, base), 'dragon is not in the bestiary'));
  const g = outline(); g.scene.exits[1].grant = { table: 'scene', progress: 50 };
  assert.ok(has(lintMadeWorld(g, base), 'grant only from branch'));
  const h = outline(); h.premise.zh = '韩立来到云梦泽';
  assert.ok(has(lintMadeWorld(h, base), 'names 韩立'));
});

test('a made world lays its story over the base: its province, its creatures marked, one stub chapter, the opening scene', () => {
  const base = loadContent();
  const o = outline();
  const merged = overlayWorld(base, { ...o, opening: o.scene.id, made: true }, {
    dictionary: { words: { progress: { zh: '道行', en: 'the Way' } }, provinces: { yunmeng: o.province.name } },
    creatures: { creatures: o.creatures },
    places: { yunmeng: { province: 'yunmeng', start: o.start, places: o.places } },
    scenes: { [o.scene.id]: o.scene },
  });
  assert.equal(merged.world.made, true);
  assert.equal(merged.dictionary.words.progress.zh, '道行');
  assert.equal(merged.dictionary.words.wealth.zh, base.dictionary.words.wealth.zh, 'unrenamed words are the base\'s');
  assert.deepEqual(Object.keys(merged.places), ['yunmeng'], 'only its own province is on the map');
  assert.ok(merged.creatures.creatures.some(c => c.id === 'fuzhu') && merged.creatures.creatures.find(c => c.id === 'lushu').made);
  assert.deepEqual(Object.keys(merged.chapters), ['story']);
  assert.equal(merged.chapters.story.first_scene, null);
  assert.equal(merged.ladder, base.ladder);
  assert.ok(madeWorldsDir().endsWith('/data/worlds'));
});
