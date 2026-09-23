// Page words that are the page's only reading of Ling's reply.
import test from 'node:test';
import assert from 'node:assert/strict';
import { yinyueLine } from '../scripts/cards.js';

test('Yinyue\'s line is read from the reply as she said it — the last one, plain — or not at all', () => {
  const reply = '你答“明”。\n\n**银月：**它让路了。走，山脚。\n\n潮水退至海底。\n\n**银月：** 做得好，清玄。\n\n修为 +40 · 灵石 +10';
  assert.equal(yinyueLine(reply), '做得好，清玄。');
  assert.equal(yinyueLine('**Yinyue:** Well *done*, Qingxuan.'), 'Well done, Qingxuan.');
  assert.equal(yinyueLine('银月察觉鼎在海底吸潮。'), null);
  assert.equal(yinyueLine(''), null);
});

test('the day\'s cast card: the coins wait with a word to Ling, then six lines as they fell with the grade and what it does', async () => {
  const { WORDS, cardHtml } = await import('../scripts/cards.js');
  const { loadWorld } = await import('../scripts/content.mjs');
  const content = { ...loadWorld('jiuding'), hexagrams: loadWorld('jiuding').hexagrams.hexagrams };
  const ctx = (divination) => ({ look: { divination }, lang: 'zh', words: WORDS.zh, content });
  const waiting = cardHtml({ card: 'hexagram' }, ctx(null));
  assert.match(waiting, /今日未卜/);
  assert.match(waiting, /data-say="请银月起一卦">起一卦</);
  const cast = cardHtml({ card: 'hexagram' }, ctx({
    ask: { id: 'bout', name: '问斗法' }, throws: [[3, 3, 3], [2, 3, 3], [2, 2, 3], [2, 3, 3], [3, 3, 2], [2, 2, 2]],
    values: [9, 8, 7, 8, 8, 6], moving: [0, 5],
    hexagram: { id: 3, name: '屯', lines: [1, 0, 1, 0, 0, 0], judgment: '元亨，利贞。', image: '云雷，屯；君子以经纶。' },
    changed: { id: 8, name: '比' }, grade: { id: 'ill', name: '凶' }, effect: { spell: -2, root: { id: 'wood', name: '木' } },
  }));
  assert.equal((cast.match(/class="yao /g) ?? []).length, 6);
  assert.equal((cast.match(/<em>[○×]<\/em>/g) ?? []).length, 2);
  assert.match(cast, /今日卦象 · 屯 · <span class="grade">凶<\/span>/);
  assert.match(cast, /之卦 · 比/);
  assert.match(cast, /问斗法<\/span> 木法术 -2/);
  assert.equal((cast.match(/<b class="face">/g) ?? []).length, 3 + 2 + 1 + 2 + 2);
});

test('the 灵根 card takes the birthday for 命格 on the page, or shows the sign once set', async () => {
  const { WORDS, cardHtml } = await import('../scripts/cards.js');
  const { loadWorld } = await import('../scripts/content.mjs');
  const w = loadWorld('jiuding');
  const content = { ...w, traits: w.traits };
  const ctx = (fate, extra = {}) => ({ look: { traits: { ids: ['wood', 'water', 'fire', 'earth'], name: '四灵根' }, fate }, lang: 'zh', words: WORDS.zh, content, ...extra });
  const form = cardHtml({ card: 'traits' }, ctx(null));
  assert.match(form, /<input type="date" id="fate-birth"/);
  assert.match(form, /data-fate="birth">定命格</); assert.match(form, /data-fate="random">随机</); assert.match(form, /data-fate="decline">不必了</);
  assert.match(form, /不入存档，不入对话/);
  assert.match(cardHtml({ card: 'traits' }, ctx({ declined: true })), /data-fate-open>定命格</);
  const set = cardHtml({ card: 'traits' }, ctx({ zodiac: { id: 'snake', name: '蛇' }, stem: { id: 'yi', name: '乙' }, element: { id: 'wood', name: '木' }, source: 'birth' }));
  assert.match(set, /属蛇 · 日主乙木 · 天生亲近木/);
  assert.doesNotMatch(set, /fate-birth/);
});

test('the fight card draws both pools, the creature\'s stance and every choice with its cost', async () => {
  const { WORDS } = await import('../scripts/cards.js');
  const { duelHtml } = await import('../scripts/duel-card.js');
  const { foeOf } = await import('../scripts/duel.js');
  const { loadWorld } = await import('../scripts/content.mjs');
  const content = loadWorld('jiuding');
  const kui = content.creatures.creatures.find((c) => c.id === 'kui');
  const exit = { game: { id: 'subdue-kui' }, duel: {
    creature: { name: '夔', root: 'water', root_name: '水' }, sword: null, charm: null,
    foe: foeOf(kui, 'qi', 0, 'seed'),
    arts: [],
    kit: { roots: ['wood', 'water', 'fire', 'earth'], tier: 'qi', step: 0, arts: {} },
  } };
  const ctx = { lang: 'zh', words: WORDS.zh, content };
  const open = duelHtml(exit, { status: 'open', picks: [] }, ctx);
  // Both sides' pools, the lean, and who moves first.
  assert.match(open, /气血/);
  assert.match(open, /灵力/);
  assert.match(open, /厚皮/);
  assert.match(open, /战力/);
  // A root of one's own, and nothing borrowed: 借势 was cut on 2026-09-18.
  assert.match(open, /data-duel-pick="cast:fire"/);
  assert.doesNotMatch(open, /data-duel-pick="borrow/);
  // 物理攻击 and 辅助 are always there; a 符 the player does not hold is not.
  assert.match(open, /data-duel-pick="strike"/);
  assert.match(open, /data-duel-pick="assist:guard"/);
  assert.doesNotMatch(open, /data-duel-pick="talisman"/);
  // Idle draws no pools, only the way in.
  const idle = duelHtml(exit, { status: 'idle', picks: [] }, ctx);
  assert.match(idle, /data-duel-start="subdue-kui"/);
  // In English a bare 火 says nothing: the root's name stands beside the cost.
  const en = duelHtml(exit, { status: 'open', picks: [] }, { lang: 'en', words: WORDS.en, content });
  assert.match(en, /data-duel-pick="cast:fire"[^>]*>火<small>Fire · 4\u00a0Force<\/small>/);
});

test('the page knows the cast\'s own question by the rules\' words, so the coins stay in the air through it', async () => {
  const { WORDS } = await import('../scripts/cards.js');
  const { askOf } = await import('../scripts/rules.mjs');
  const { loadContent } = await import('../scripts/content.mjs');
  const { newState } = await import('../scripts/state.mjs');
  const content = loadContent();
  for (const lang of ['zh', 'en']) {
    const s = newState(content, lang, new Date('2026-09-17T12:00:00Z'));
    assert.equal(askOf(content, s, { now: new Date('2026-09-17T12:00:00Z'), quests: [] }, { refused: 'needs-ask' }).question, WORDS[lang].castAsk);
  }
});

test('the challenge card on the scene: who you are about to fight, and the one way in', async () => {
  // It renders. That sounds like nothing, and it is exactly the bug that broke
  // the whole stage on 2026-09-18 — `spoken` was used and never imported, and
  // no test had ever drawn this card (the page died at "正在展开…").
  const { WORDS, challengeHtml } = await import('../scripts/battle-card.js');
  const brief = {
    id: 'subdue-leishen',
    creature: { id: 'leishen', name: '雷神', pinyin: 'léi shén', root: 'wood', root_name: '木', lean: 'ward', art: 'art/leishen.webp', about: '雷泽中有雷神。' },
    setup: { mode: 'pve', you: { tier: 'qi', root: 'fire', deck: [] }, foe: { tier: 'qi', root: 'wood', deck: [] } },
    today: null,
  };
  const ctx = { lang: 'zh', words: WORDS.zh, title: '降妖', artBase: '../worlds/jiuding/' };
  const html = challengeHtml(brief, ctx);
  assert.match(html, /雷 ?神|雷神/);
  assert.match(html, /data-duel-start="subdue-leishen"/);
  assert.match(html, /避法/, 'its lean is on the card');
  assert.match(html, /art\/leishen\.webp/, 'and its plate');
  // won today: no way in, and it says why
  const done = challengeHtml({ ...brief, today: { outcome: 'won' } }, ctx);
  assert.doesNotMatch(done, /data-duel-start/);
  assert.match(done, /今日已降/);
  // and it draws in English too
  assert.match(challengeHtml(brief, { ...ctx, lang: 'en', words: WORDS.en }), /Begin/);
});

test('the fight room draws itself: a hand you can read, both ranks, and the two buttons', async () => {
  // Nothing had ever drawn `battleHtml` in a test, and on 2026-09-18 he played
  // a whole fight in a room where the hand could not be played — twenty taps,
  // nine cards still held. A surface no test renders is a surface that breaks
  // in his face; this one renders here now.
  const { WORDS, battleHtml } = await import('../scripts/battle-card.js');
  const { begin, offers, view } = await import('../scripts/battle.js');
  const { loadWorld } = await import('../scripts/content.mjs');
  const content = loadWorld('jiuding');
  const catalog = Object.fromEntries(content.cards.cards.map(c => [c.id, { ...c, name: c.name.zh }]));
  const setup = {
    mode: 'pve', seed: 'a-day|leishen|Qingxuan',
    you: { tier: 'core', step: 0, root: 'wood', deck: ['jixiao', 'huoya', 'houtu', 'luying', 'leiming', 'jingwei', 'zhennu', 'luoshi', 'fenghuo', 'linmu'], extra: ['yinyue'] },
    foe: { tier: 'core', root: 'wood', deck: content.creatures.creatures.find(c => c.id === 'leishen').deck },
  };
  const st = begin(setup, catalog);
  const ctx = { lang: 'zh', words: WORDS.zh, catalog, board: st.mode.board, artBase: '../worlds/jiuding/', title: '降妖', foeName: '雷神', youName: '清玄' };
  const html = battleHtml(view(st), offers(st), ctx);
  for (const id of st.you.hand) assert.match(html, new RegExp(catalog[id].name), `${id} is in hand and on screen`);
  assert.match(html, /银月/, 'she rides along in hand, out of the ten');
  assert.match(html, /class="bhand"/);
  assert.match(html, /data-spot="power"/, '主灵根一击');
  assert.match(html, /data-spot="end"/, '结束回合');
  assert.match(html, /雷神/, 'and who is across the table');
  // and at least one card in that hand may actually be played
  assert.ok(offers(st).some(o => o.ok && o.action.kind === 'play'), 'a fight that opens is a fight that can be played');
  // 问斗法 on the card: the lifted number, and why it differs from the print
  const cast = begin({ ...setup, you: { ...setup.you, extra: ['yinyue', 'qingteng'], boost: { element: 'wood', n: 2 } } }, catalog);
  const lifted = battleHtml(view(cast), offers(cast), ctx);
  assert.match(lifted, new RegExp(`打 ${catalog.qingteng.effect.damage + 2} 点 <b class="blift">卦 \\+2</b>`));
  assert.doesNotMatch(html, /blift/, 'no cast, no mark');
});

test('杀招 on the page: the beast gathering says what will land, and on whom, in the fight\'s own numbers', async () => {
  const { battleHtml, WORDS } = await import('../scripts/battle-card.js');
  const { act, begin, offers, view } = await import('../scripts/battle.js');
  const { loadWorld } = await import('../scripts/content.mjs');
  const content = loadWorld('jiuding');
  const catalog = Object.fromEntries(content.cards.cards.map(c => [c.id, { ...c, name: c.name.zh }]));
  const leishen = content.creatures.creatures.find(c => c.id === 'leishen');
  const st = begin({ mode: 'pve', seed: 's', you: { tier: 'qi', root: 'metal', deck: ['xiaoyao'] }, foe: { tier: 'qi', root: 'wood', deck: leishen.deck, signature: leishen.signature } }, catalog);
  const ctx = { lang: 'zh', words: WORDS.zh, catalog, board: st.mode.board, foeName: '雷神', youName: '清玄' };
  assert.doesNotMatch(battleHtml(view(st), offers(st), ctx), /bcharge/, 'nothing gathers at full 气血');
  st.you.mana = 9;
  st.you.hand = ['jinzhua', 'jinzhua', 'jinzhua', 'jinzhua'];
  while (st.foe.hp > st.foe.hpMax / 2) act(st, { kind: 'play', index: 0 }, 'you');
  const html = battleHtml(view(st), offers(st), ctx);
  assert.match(html, /杀招 · 雷霆/);
  assert.match(html, /你 −\d+（护主可挡）/);
  assert.match(html, /它在蓄力/);
  assert.match(html, /雷神 开始蓄力：雷霆/, 'and the last-move line says so');
});

test('a fight whose cards the page cannot name is refused, not opened', async () => {
  // The empty catalog of 2026-09-18: the hand is dealt, nothing may be played,
  // and the only buttons that answer are 主灵根一击 and 结束回合. Silence there
  // cost a fight, a day's 体力 and the day's beast.
  const { begin, missingCards } = await import('../scripts/battle.js');
  const setup = { mode: 'pve', seed: 's', you: { tier: 'qi', root: 'wood', deck: ['xiaoyao'], extra: ['yinyue'] }, foe: { tier: 'qi', root: 'earth', deck: ['shanjing'] } };
  assert.deepEqual(missingCards(setup, {}), ['xiaoyao', 'yinyue', 'shanjing']);
  assert.throws(() => begin(setup, {}), /no card row for xiaoyao, yinyue, shanjing/);
  const { loadWorld } = await import('../scripts/content.mjs');
  const catalog = Object.fromEntries(loadWorld('jiuding').cards.cards.map(c => [c.id, c]));
  assert.deepEqual(missingCards(setup, catalog), []);
});

test('the challenge card says what stopped the last 出手 — and stands aside once the day is written', async () => {
  const { WORDS, challengeHtml } = await import('../scripts/battle-card.js');
  const brief = {
    id: 'haunt:leishen',
    creature: { id: 'leishen', name: '雷神', pinyin: 'léi shén', root: 'wood', root_name: '木', lean: 'ward', art: 'art/leishen.webp', about: null },
    setup: { mode: 'pve', you: { tier: 'qi', root: 'fire', deck: [] }, foe: { tier: 'qi', root: 'wood', deck: [] } },
    today: null,
  };
  const ctx = { lang: 'zh', words: WORDS.zh, artBase: '../worlds/jiuding/', title: '降妖' };
  assert.match(challengeHtml(brief, { ...ctx, say: '丹田已空，先去调息。' }), /丹田已空/);
  // the day's own outcome already says it: one line, not two (台上不重复)
  assert.doesNotMatch(challengeHtml({ ...brief, today: { outcome: 'won' } }, { ...ctx, say: '丹田已空，先去调息。' }), /丹田已空/);
  assert.doesNotMatch(challengeHtml(brief, ctx), /undefined|null/);
});

test('a wear is hers: no 佩戴 until she walks with him', async () => {
  // He bought 银月铃 before he had ever found 银月, and the card offered 佩戴 —
  // a button whose only possible answer is the rules' `no-companion` refusal
  // (2026-09-18). The line under it still says whose it is.
  const { WORDS, cardHtml } = await import('../scripts/cards.js');
  const { loadWorld } = await import('../scripts/content.mjs');
  const content = loadWorld('jiuding');
  const bell = content.items.items.find(i => i.id === 'moon-bell');
  const shelf = [{ ...bell, name: bell.name.zh, about: bell.about.zh, held: 1, worn: false }];
  const look = companion => ({ lang: 'zh', wealth: 500, bag: [{ id: 'moon-bell', n: 1 }], world: { id: 'jiuding', dir: 'worlds/jiuding' }, place: { shelf }, companion });
  const ctx = companion => ({ look: look(companion), lang: 'zh', words: WORDS.zh, content, artBase: '../worlds/jiuding/' });

  const alone = cardHtml({ card: 'item', id: 'moon-bell' }, ctx(null));
  assert.doesNotMatch(alone, /data-do="use" data-id="moon-bell"/, 'no one to wear it yet');
  assert.match(alone, /可赠银月佩戴/, 'but the card still says whose it is');
  const together = cardHtml({ card: 'item', id: 'moon-bell' }, ctx({ id: 'yinyue', name: '银月', joined: true }));
  assert.match(together, /data-do="use" data-id="moon-bell">佩戴</, 'once she walks with him, it can go on (a page tap, nothing to the chat)');
  // his own arms never waited on her
  const sword = content.items.items.find(i => i.id === 'iron-sword');
  const armCtx = { ...ctx(null), look: { ...look(null), bag: [{ id: 'iron-sword', n: 1 }], place: { shelf: [{ ...sword, name: sword.name.zh, about: sword.about.zh, held: 1, worn: false }] } } };
  assert.match(cardHtml({ card: 'item', id: 'iron-sword' }, armCtx), /data-do="use" data-id="iron-sword">佩戴</);
});

test('every card kind draws — the sweep no surface had until 2026-09-18', async () => {
  // A missing import killed the whole stage at 正在展开… that morning, and the
  // fight room drew an empty hand that afternoon. Both were kinds no test had
  // ever rendered. This one renders all of them.
  const { WORDS, cardHtml } = await import('../scripts/cards.js');
  const { loadWorld } = await import('../scripts/content.mjs');
  const { newState } = await import('../scripts/state.mjs');
  const { look } = await import('../scripts/rules.mjs');
  const content = loadWorld('jiuding');
  const now = new Date('2026-09-18T12:00:00Z');
  const state = { ...newState(content, 'zh', now), name: 'Qingxuan', tier: 'core', traits: ['wood', 'water'], place: 'fuli', scene: null, bag: { 'moon-bell': 1 } };
  const view = look(state, content, { now, quests: [] });
  const ctx = { look: view, lang: 'zh', words: WORDS.zh, content: { ...content, herbs: content.herbs.herbs, hexagrams: content.hexagrams.hexagrams, creatures: content.creatures.creatures.map(c => ({ ...c, dir: 'worlds/jiuding' })), dir: 'worlds/jiuding' }, artBase: '../worlds/jiuding/', mapView: 'province', boardFor: () => ({ tiles: [], taskId: 't' }), duelFor: () => null };
  for (const card of [
    { card: 'creature', id: 'longzhi' }, { card: 'traits' }, { card: 'map' }, { card: 'hexagram' },
    { card: 'item', ids: ['moon-bell', 'iron-sword'] }, { card: 'item', id: 'moon-bell' },
    { card: 'gate', chapter: '01-ji', opens: '2026-10-01' }, { card: 'tribulation' }, { card: 'treasure' },
  ]) {
    const html = cardHtml(card, ctx);
    assert.equal(typeof html, 'string', `${card.card} draws`);
    assert.ok(!/undefined|\[object Object\]/.test(html), `${card.card} draws no holes: ${html.slice(0, 120)}`);
  }
});

test('装备 · 背包 open together: what he wears, what he carries, and the one tap each thing takes', async () => {
  // His ask, 2026-09-22: 需要有个装备的card, show what is equipped · 需要同时打开装备和背包.
  const { WORDS, gearChipHtml, gearPopHtml } = await import('../scripts/cards.js');
  const { VERBS, look } = await import('../scripts/rules.mjs');
  const { loadContent } = await import('../scripts/content.mjs');
  const content = loadContent();
  const s = {
    ...(await import('../scripts/state.mjs')).newState(content, 'zh', new Date('2026-09-22T12:00:00')),
    traits: ['wood', 'water', 'fire', 'earth'], tier: 'core', companion: { joined: '2026-09-18' },
    bag: { 'bamboo-sword': 1, 'moon-bell': 1, 'qi-silk': 1, 'qi-pill': 1, talisman: 1 }, wear: { yinyue: 'moon-bell' },
  };
  const seen = look(s, content, { now: new Date('2026-09-22T12:00:00'), quests: [] });
  assert.equal(seen.gear, undefined, 'never in Look: Ling pays for every character of it');
  const g = VERBS.gear(s, content).result.gear;
  assert.deepEqual(g.slots.map((x) => [x.slot, x.item?.id ?? null]), [['weapon', null], ['robe', null], ['pendant', null]]);
  assert.equal(g.her.item.id, 'moon-bell');
  assert.equal(g.fight.power, 0, 'a sword in the bag is not worn');
  const ctx = { look: seen, gear: g, lang: 'zh', words: WORDS.zh };
  const pop = gearPopHtml(ctx);
  assert.match(pop, /装备[\s\S]*背包/, 'both, worn above, carried below');
  assert.match(pop, /data-wear="bamboo-sword"[^>]*>戴上 · 法器/);
  assert.match(pop, /data-wear="qi-silk"/, 'hers, now she walks with him');
  assert.doesNotMatch(pop, /data-wear="moon-bell"/, 'already on her');
  assert.match(pop, /data-use="qi-pill"/);
  assert.doesNotMatch(pop, /data-wear="talisman"|data-use="talisman"/, 'a 符 is for a fight');
  assert.doesNotMatch(pop, /undefined|\{[a-z]+\}/);
  assert.match(gearChipHtml(ctx, false), /data-gear/);
  // worn: the slot shows it, the fight line says what it gives, the button is gone
  const worn = { ...s, wear: { ...s.wear, weapon: 'bamboo-sword' } };
  const armed = look(worn, content, { now: new Date('2026-09-22T12:00:00'), quests: [] });
  const armedGear = VERBS.gear(worn, content).result.gear;
  const pop2 = gearPopHtml({ ...ctx, look: armed, gear: armedGear });
  assert.match(pop2, /法器<\/span>\s*<span><b>竹剑/);
  assert.match(pop2, /主灵根一击 \+1/);
  assert.doesNotMatch(pop2, /data-wear="bamboo-sword"/);
  assert.match(gearChipHtml({ ...ctx, look: armed }, false), /装备 1/);
  // 牌: every card he holds, the day's ten lit, 银月 in hand
  assert.match(pop, /牌 · \d+/);
  assert.match(pop, /class="gcard in"[^>]*><b>2<\/b> 银月 · 在手/);
  assert.ok(g.cards.filter((c) => c.deck).length === 10);
  // 卸下: the slot's own button, and the rules put it back in the bag
  assert.match(pop2, /data-remove="bamboo-sword"[^>]*>卸下/);
  const { trade } = await import('../scripts/rules.mjs');
  const off = trade(worn, content, { now: new Date('2026-09-22T12:00:00'), quests: [] }, { action: 'remove', id: 'bamboo-sword' });
  assert.equal(off.result.ok, true);
  assert.equal(off.state.wear.weapon, undefined);
  assert.equal(off.state.bag['bamboo-sword'], 1);
  assert.equal(off.state.wear.yinyue, 'moon-bell', 'hers stays on her');
  assert.equal(trade(worn, content, { now: new Date(), quests: [] }, { action: 'remove', id: 'moon-bell' }).result.refused, 'not-worn', 'what she wears is hers');
  // English stands up too
  assert.doesNotMatch(gearPopHtml({ look: armed, gear: armedGear, lang: 'en', words: WORDS.en }), /undefined|\{[a-z]+\}/);
});

test('所得: a won fight leaves its new card on the stage, drawn as it will be in the hand', async () => {
  const { WORDS, spoilsHtml } = await import('../scripts/battle-card.js');
  const { loadWorld } = await import('../scripts/content.mjs');
  const content = loadWorld('jiuding');
  for (const lang of ['zh', 'en']) {
    const catalog = Object.fromEntries(content.cards.cards.map(c => [c.id, { ...c, name: c.name[lang] }]));
    const spoils = { place: 'sibei', cards: [{ id: 'hantan', name: '寒潭指', card: true }], items: [{ id: 'yaodan-2', name: '二阶妖丹', n: 1 }] };
    const html = spoilsHtml(spoils, { catalog, lang, words: WORDS[lang], artBase: '../worlds/jiuding/' });
    assert.match(html, new RegExp(catalog.hantan.name));
    assert.match(html, /class="bcost">3</);
    assert.match(html, /data-spoils-close/);
    assert.match(html, /二阶妖丹/);
    assert.doesNotMatch(html, /undefined|\{[a-z]+\}/);
  }
});

test('让页面算: the hand and the aimed-at say what a blow really takes off, and why when 五行 bites', async () => {
  const { WORDS, battleHtml } = await import('../scripts/battle-card.js');
  const { begin, offers, view } = await import('../scripts/battle.js');
  const { loadWorld } = await import('../scripts/content.mjs');
  const content = loadWorld('jiuding');
  const catalog = Object.fromEntries(content.cards.cards.map(c => [c.id, { ...c, name: c.name.zh }]));
  // wood against an earth beast: 木克土, ×1.5
  const setup = { mode: 'pve', seed: 's', you: { tier: 'core', root: 'wood', deck: ['xiaoyao', 'leipu', 'tuou'], extra: ['qingteng', 'huodan'] }, foe: { tier: 'core', root: 'earth', deck: content.creatures.creatures.find(c => c.id === 'paoxiao').deck } };
  const st = begin(setup, catalog);
  const ctx = { lang: 'zh', words: WORDS.zh, catalog, board: st.mode.board };
  const html = battleHtml(view(st), offers(st), ctx);
  assert.match(html, /打 2 点[\s\S]*?→ 对它 3 · 木克土/, 'the hand says it');
  assert.doesNotMatch(html, /class="bdmg/, 'nothing aimed, no badge');
  // 主灵根一击 held: the beast shows the number (2 at 结丹 → 3)
  const aimed = battleHtml(view(st), offers(st), ctx, { from: 'power' });
  assert.match(aimed, /class="bdmg up">−3 · 木克土/);
  // fire against earth changes nothing: no word, no mark
  assert.doesNotMatch(html, /火弹术[\s\S]{0,300}对它/);
  // English too
  assert.match(battleHtml(view(st), offers(st), { ...ctx, lang: 'en', words: WORDS.en }, { from: 'power' }), /−3 · wood over earth/);
});

test('every card has a 五行 — only a 丹药 has none', async () => {
  // His rulings, 2026-09-22: 这个要align with 凡人, 都有五行属性 · 丹药不配五行.
  const { loadWorld } = await import('../scripts/content.mjs');
  const bare = loadWorld('jiuding').cards.cards.filter((c) => !c.element && !c.pill);
  assert.deepEqual(bare.map((c) => c.id), [], 'give it an element, or mark it a pill');
  for (const c of loadWorld('jiuding').cards.cards.filter((x) => x.pill)) assert.ok(!c.element, `${c.id}: a pill takes no element`);
});

test('可接的差事: one card, a row each; a row opens to the giver; taken, only the other is left', async () => {
  const { WORDS, cardHtml } = await import('../scripts/cards.js');
  const { look, quest } = await import('../scripts/rules.mjs');
  const { loadContent } = await import('../scripts/content.mjs');
  const { newState } = await import('../scripts/state.mjs');
  const content = loadContent();
  const now = new Date('2026-09-22T12:00:00');
  // his save's morning: 彭城, the elder's errand done before, so 蠪侄 and the day's notice are up
  const s = { ...newState(content, 'zh', now), traits: ['wood', 'water', 'fire', 'earth'], tier: 'core', chapter: '03-qing', scene: null, place: 'pengcheng',
    quests: { 'xu-elder-herb': { took: '2026-09-21', have: {}, done_at: '2026-09-21T19:48:20Z' } } };
  const seen = look(s, content, { now, quests: [] });
  assert.ok(seen.offers.length >= 2, JSON.stringify(seen.offers.map((o) => o.id)));
  const ctx = (l, offerRow = null) => ({ look: l, offerRow, lang: 'zh', words: WORDS.zh, content });
  const html = cardHtml({ card: 'offer' }, ctx(seen));
  assert.equal((html.match(/class="card offer"/g) ?? []).length, 1, 'one card');
  assert.equal((html.match(/data-offerrow=/g) ?? []).length, seen.offers.length, 'a row each');
  assert.equal(html.split(`>${WORDS.zh.take}</button>`).length - 1, seen.offers.length, 'one 接下 button each');
  assert.doesNotMatch(html, /class="offerdetail"/, 'two or more: closed until tapped');
  assert.match(cardHtml({ card: 'offer' }, ctx(seen, seen.offers[0].id)), new RegExp(`offerdetail[\\s\\S]*${seen.offers[0].say.slice(0, 6)}`));
  // taken, the card holds only the other
  const took = quest(s, content, { now, quests: [] }, { action: 'take', id: seen.offers[0].id });
  const after = look(took.state, content, { now, quests: [] });
  assert.deepEqual(after.offers.map((o) => o.id), seen.offers.slice(1).map((o) => o.id));
  if (after.offers.length === 1) assert.match(cardHtml({ card: 'offer' }, ctx(after)), /class="offerdetail"/, 'a lone errand stands open');
});

test('遇 in the mist: the veil card says nothing of what waits', async () => {
  const { WORDS, cardHtml } = await import('../scripts/cards.js');
  for (const lang of ['zh', 'en']) {
    const look = { place: { meet: { kind: 'beast', creature: { id: 'longzhi', name: '蠪侄' }, veiled: true } } };
    const html = cardHtml({ card: 'veil' }, { look, lang, words: WORDS[lang] });
    assert.match(html, /class="card veil"/);
    assert.match(html, new RegExp(WORDS[lang].veilLine));
    assert.doesNotMatch(html, /蠪侄|longzhi|<button/, 'no name, nothing to tap');
    assert.equal(cardHtml({ card: 'veil' }, { look: { place: { meet: { kind: 'beast' } } }, lang, words: WORDS[lang] }), '', 'revealed, no mist');
  }
});
