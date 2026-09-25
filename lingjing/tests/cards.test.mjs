// Page words that are the page's only reading of Ling's reply.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { yinyueLine } from '../scripts/cards.js';

test('Yinyue\'s line is read from the reply as she said it — the last one, plain — or not at all', () => {
  const reply = '你答“明”。\n\n**银月：**它让路了。走，山脚。\n\n潮水退至海底。\n\n**银月：** 做得好，清玄。\n\n修为 +40 · 灵石 +10';
  assert.equal(yinyueLine(reply), '做得好，清玄。');
  assert.equal(yinyueLine('**Yinyue:** Well *done*, Qingxuan.'), 'Well done, Qingxuan.');
  assert.equal(yinyueLine('银月察觉鼎在海底吸潮。'), null);
  assert.equal(yinyueLine(''), null);
});

test('问卦 on one card: the coins wait for one tap, then six lines as they fell, the grade and what it does to the day\'s fights', async () => {
  const { WORDS, cardHtml } = await import('../scripts/cards.js');
  const { loadWorld } = await import('../scripts/content.mjs');
  const content = { ...loadWorld('jiuding'), hexagrams: loadWorld('jiuding').hexagrams.hexagrams };
  const ctx = (divination) => ({ look: { divination }, lang: 'zh', words: WORDS.zh, content });
  const waiting = cardHtml({ card: 'hexagram' }, ctx(null));
  assert.match(waiting, /今日未卜/);
  assert.match(waiting, /data-divine>起一卦</, 'one tap, nothing to choose');
  assert.doesNotMatch(waiting, /问修行|问财运|问斗法/);
  assert.doesNotMatch(waiting, /data-say/, 'a tap, not a word to Ling');
  const cast = cardHtml({ card: 'hexagram' }, ctx({
    throws: [[3, 3, 3], [2, 3, 3], [2, 2, 3], [2, 3, 3], [3, 3, 2], [2, 2, 2]],
    values: [9, 8, 7, 8, 8, 6], moving: [0, 5],
    hexagram: { id: 3, name: '屯', lines: [1, 0, 1, 0, 0, 0], judgment: '元亨，利贞。', image: '云雷，屯；君子以经纶。' },
    changed: { id: 8, name: '比' }, grade: { id: 'ill', name: '凶' }, effect: { card: -1, root: { id: 'wood', name: '木' } },
  }));
  assert.equal((cast.match(/class="yao /g) ?? []).length, 6);
  assert.equal((cast.match(/<em>[○×]<\/em>/g) ?? []).length, 2);
  assert.match(cast, /今日卦象 · 屯 · <span class="grade">凶<\/span>/);
  assert.match(cast, /之卦 · 比/);
  assert.match(cast, /今日斗法，木法术 -1/);
  assert.equal((cast.match(/<b class="face">/g) ?? []).length, 3 + 2 + 1 + 2 + 2);
  const good = cardHtml({ card: 'hexagram' }, ctx({ throws: Array(6).fill([2, 2, 3]), values: [7, 7, 7, 7, 7, 7], moving: [], hexagram: { id: 1, name: '乾', lines: [1, 1, 1, 1, 1, 1], judgment: '元亨利贞。', image: '天行健' }, changed: null, grade: { id: 'good', name: '吉' }, effect: { card: 1, sight: 1, root: { id: 'metal', name: '金' } } }));
  assert.match(good, /今日斗法，金法术 \+1 · 看得出妖下回合的架势/, '望气 at 吉');
});

test('命格 is set on the 问卦 card — the birthday typed there, or the sign once set; the 灵根 card holds the roots alone', async () => {
  const { WORDS, cardHtml } = await import('../scripts/cards.js');
  const { loadWorld } = await import('../scripts/content.mjs');
  const w = loadWorld('jiuding');
  const content = { ...w, traits: w.traits, hexagrams: w.hexagrams.hexagrams };
  const ctx = (fate, extra = {}) => ({ look: { traits: { ids: ['wood', 'water', 'fire', 'earth'], name: '四灵根' }, fate, divination: null }, lang: 'zh', words: WORDS.zh, content, ...extra });
  assert.doesNotMatch(cardHtml({ card: 'traits' }, ctx(null)), /fate-birth|命格/, 'not on the roots card');
  const form = cardHtml({ card: 'hexagram' }, ctx(null));
  assert.match(form, /<input type="date" id="fate-birth"/);
  assert.match(form, /data-fate="birth">定命格</); assert.match(form, /data-fate="random">随机</); assert.match(form, /data-fate="decline">不必了</);
  assert.match(form, /不入存档，不入对话/);
  assert.match(cardHtml({ card: 'hexagram' }, ctx({ declined: true })), /data-fate-open>定命格</);
  const set = cardHtml({ card: 'hexagram' }, ctx({ zodiac: { id: 'snake', name: '蛇' }, stem: { id: 'yi', name: '乙' }, element: { id: 'wood', name: '木' }, source: 'birth' }));
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

test('问卦 asks nothing: Divine with no question casts, and no answer asks 所问何事', async () => {
  const { askOf, VERBS } = await import('../scripts/rules.mjs');
  const { loadContent } = await import('../scripts/content.mjs');
  const { newState } = await import('../scripts/state.mjs');
  const content = loadContent();
  const now = new Date('2026-09-17T12:00:00Z');
  for (const lang of ['zh', 'en']) {
    const s = { ...newState(content, lang, now), name: 'Alex' };
    const r = VERBS.divine(s, content, { now, quests: [] }, {});
    assert.equal(r.result.ok, true);
    assert.notEqual(askOf(content, s, { now, quests: [] }, { refused: 'needs-ask' })?.question, lang === 'zh' ? '所问何事？' : 'What do you ask about?');
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

test('the way in says 精英 — its deck is harder — and never a wound: every fight begins whole', async () => {
  const { challengeHtml, WORDS } = await import('../scripts/battle-card.js');
  const brief = {
    id: 'haunt:leishen', today: null,
    creature: { id: 'leishen', name: '雷神', pinyin: 'léi shén', root: 'wood', root_name: '木', elite: true, art: 'art/leishen.webp', about: null },
  };
  const html = challengeHtml(brief, { lang: 'zh', words: WORDS.zh });
  assert.match(html, /class="celite">精英/);
  // an older page's brief carrying a wound is shown none (伤势 was cut)
  assert.doesNotMatch(challengeHtml({ ...brief, health: { now: 14, max: 26 } }, { lang: 'zh', words: WORDS.zh }), /churt|带伤/);
  const whole = challengeHtml({ ...brief, creature: { ...brief.creature, elite: false } }, { lang: 'zh', words: WORDS.zh });
  assert.doesNotMatch(whole, /celite/);
});

test('抉择 on the stage: each way a button with how hard, the odds and the stake — then the line of the way taken', async () => {
  const { cardHtml, trialToldHtml, WORDS } = await import('../scripts/cards.js');
  const { stageCards } = await import('../scripts/stage.mjs');
  const look = { place: { id: 'huaidu', meet: { kind: 'trial', options: [
    { n: 0, label: '涉水而过', difficulty: 'hard', stake: 'wound', chance: 30 },
    { n: 1, label: '等船家', difficulty: 'easy', stake: 'coin', chance: 75 },
  ] } } };
  assert.ok(stageCards(look, []).some(c => c.card === 'road'), 'the ways stand on the stage, as the road card');
  assert.ok(!stageCards({ place: { meet: { kind: 'trial', waiting: true } } }, []).some(c => c.card === 'road'), 'not before Ling has written them');
  const html = cardHtml({ card: 'road' }, { look, lang: 'zh', words: WORDS.zh });
  assert.match(html, /路上 · 抉择/);
  assert.match(html, /data-trial="0"><b>涉水而过<\/b>/);
  assert.match(html, /难 · 30% 把握 · 失手折体力/, 'a wound on the road is 体力 now');
  assert.match(html, /易 · 75% 把握 · 失手破财/);
  const told = trialToldHtml({ success: false, line: '一脚踩空，被急流卷出三丈。', cost: '体力 −12' }, { lang: 'zh', words: WORDS.zh });
  assert.match(told, /抉择 · 失手/);
  assert.match(told, /一脚踩空，被急流卷出三丈。/);
  assert.match(told, /体力 −12/);
});

test('望气 on the page: 上卷 reads the shape, 下卷 every move with the number — and nothing without it', async () => {
  const { battleHtml, WORDS } = await import('../scripts/battle-card.js');
  const { begin, offers, view } = await import('../scripts/battle.js');
  const { loadWorld } = await import('../scripts/content.mjs');
  const content = loadWorld('jiuding');
  const catalog = Object.fromEntries(content.cards.cards.map(c => [c.id, { ...c, name: c.name.zh }]));
  const leishen = content.creatures.creatures.find(c => c.id === 'leishen');
  const at = insight => {
    const st = begin({ mode: 'pve', seed: 'w', you: { tier: 'core', root: 'metal', deck: ['xiaoyao'], insight }, foe: { tier: 'core', root: 'wood', deck: leishen.deck } }, catalog);
    return battleHtml(view(st), offers(st), { lang: 'zh', words: WORDS.zh, catalog, board: st.mode.board, foeName: '雷神', youName: '清玄' });
  };
  assert.doesNotMatch(at(0), /bintent/);
  const shape = at(1);
  assert.match(shape, /望气<\/b><span>它下回合：/);
  assert.doesNotMatch(shape.match(/bintent[\s\S]*?<\/div>/)[0], /\d/, '上卷: no numbers');
  assert.match(at(2).match(/bintent[\s\S]*?<\/div>/)[0], /\d/, '下卷: the numbers that land');
});

test('机缘 on the page: the book counts it down; met on the road, the one road card holds 收下 — and it is gone once missed', async () => {
  const { cardHtml, bookChipHtml, chanceLeft, WORDS } = await import('../scripts/cards.js');
  const { stageCards } = await import('../scripts/stage.mjs');
  const until = new Date(Date.now() + 100 * 60000).toISOString();
  const away = { chance: { place: { id: 'weishan', name: '微山湖' }, until, minutes_left: 100 }, book: [] };
  const chip = bookChipHtml({ look: away, words: WORDS.zh, lang: 'zh' }, true, false);
  assert.match(chip, /事 1 · 有机缘/);
  assert.match(chip, /机缘 · 微山湖[\s\S]*还剩 1 时 40 分/);
  assert.ok(!stageCards(away, []).some(c => c.card === 'road'), 'not on the stage from afar');
  const there = { ...away, place: { id: 'weishan', meet: { kind: 'chance', place: { id: 'weishan', name: '微山湖' }, until, minutes_left: 100, here: true } } };
  assert.deepEqual(stageCards(there, []).filter(c => c.card === 'road'), [{ card: 'road' }]);
  const html = cardHtml({ card: 'road' }, { look: there, lang: 'zh', words: WORDS.zh });
  assert.match(html, /路上 · 机缘 · 微山湖/);
  assert.match(html, /data-meet="take">收 下</);
  assert.equal(chanceLeft({ ...away.chance, missed: true }), null);
  const missed = { ...there, place: { ...there.place, meet: { ...there.place.meet, missed: true } } };
  assert.ok(!stageCards(missed, []).some(c => c.card === 'road'), 'missed: the card goes');
  assert.equal(bookChipHtml({ look: { chance: { ...away.chance, until: new Date(Date.now() - 1000).toISOString() }, book: [] }, words: WORDS.zh, lang: 'zh' }, false, false), '', 'run out: gone');
});

test('装备 on the page: no 历练, no 羁绊 — her row is what she wears; before 结丹 the ten are dealt, not buttons', async () => {
  const { gearPopHtml, cardHtml, WORDS } = await import('../scripts/cards.js');
  const cards = [{ id: 'qingteng', name: '青藤', cost: 1, deck: true }, { id: 'yinyue', name: '银月', cost: 2, hand: true }];
  const gear = { slots: [], her: { name: '银月', item: null }, bag: [], cards, fight: {} };
  const pop = (g, c = { name: '银月' }) => gearPopHtml({ gear: g, words: WORDS.zh, lang: 'zh', look: { treasure: null, companion: c } });
  const early = pop(gear);
  assert.doesNotMatch(early, /data-journey|羁绊|历练/);
  assert.doesNotMatch(early, /data-deck/, 'dealt by the roots: nothing to tap');
  assert.match(early, /结丹之后可以自己组牌/);
  const core = pop({ ...gear, can_pick: true });
  assert.match(core, /data-deck="qingteng"/, 'from 结丹 on each card is a tap');
  assert.equal(cardHtml({ card: 'journey' }, { look: { companion: { name: '银月' } }, lang: 'zh', words: WORDS.zh }), '', 'no journey card');
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
  assert.match(pop, /class="gcard in"[^>]*><b class="cost"[^>]*>2<\/b> 银月 · 在手/);
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

test('every card has a 五行 — only a 丹药 and a 符 have none', async () => {
  // His rulings, 2026-09-22: 这个要align with 凡人, 都有五行属性 · 丹药不配五行.
  // A 符 from the bag (charm) is cinnabar, not a root: 不论五行 (2026-09-24).
  const { loadWorld } = await import('../scripts/content.mjs');
  const bare = loadWorld('jiuding').cards.cards.filter((c) => !c.element && !c.pill && !c.charm);
  assert.deepEqual(bare.map((c) => c.id), [], 'give it an element, or mark it a pill');
  for (const c of loadWorld('jiuding').cards.cards.filter((x) => x.charm)) assert.ok(!c.element && c._token, `${c.id}: a 符 takes no element and is never dealt`);
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

test('路上 in the mist: no road card at all — the page plays a mist and reveals it itself', async () => {
  const { WORDS, cardHtml } = await import('../scripts/cards.js');
  for (const lang of ['zh', 'en']) {
    const look = { place: { meet: { kind: 'beast', creature: { id: 'longzhi', name: '蠪侄' }, veiled: true } } };
    assert.equal(cardHtml({ card: 'road' }, { look, lang, words: WORDS[lang] }), '', 'no static 前路起了雾 card');
    const find = { place: { meet: { kind: 'find', line: '路边有物。', wealth: 3, veiled: true } } };
    assert.equal(cardHtml({ card: 'road' }, { look: find, lang, words: WORDS[lang] }), '', 'nothing told before the reveal');
    assert.equal(cardHtml({ card: 'road' }, { look: { place: { meet: { kind: 'beast' } } }, lang, words: WORDS[lang] }), '', 'a road beast told is the duel card, not this');
    for (const old of ['veil', 'find', 'trial', 'chance']) assert.equal(cardHtml({ card: old }, { look, lang, words: WORDS[lang] }), '', `no ${old} card of its own`);
  }
});
test('路上 in the mist, the page: a short ink mist, then the page reveals it (Meet reveal) and tells Ling after — a 抉择 is left to her; no timer, no lift at stream end', () => {
  const src = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../scripts/lingjing.css', import.meta.url), 'utf8');
  const watch = src.slice(src.indexOf('function watchVeil()'), src.indexOf('}', src.indexOf('function watchVeil()')) + 1);
  assert.match(watch, /inkMist\(\)/);
  assert.match(watch, /m\.kind !== 'trial'\) \{ setTimeout\(liftVeil/);
  const lift = src.slice(src.indexOf('async function liftVeil()'), src.indexOf('function watchVeil()'));
  assert.match(lift, /write\('meet', \{ action: 'reveal' \}\)/, 'the page reveals it through the Verb door');
  assert.match(lift, /report\(`\[scene\] arrived/, 'Ling hears once, after the reveal');
  assert.doesNotMatch(src, /veilTimer|20000\)/, 'no 20 s fallback');
  const end = src.slice(src.indexOf('onStreamEnd:'), src.indexOf('onContentBlock:'));
  assert.doesNotMatch(end, /liftVeil/, 'no lift at stream end');
  assert.match(css, /prefers-reduced-motion: reduce\) \{ \.inkmist \{ display: none; \} \}/);
  assert.doesNotMatch(css, /\.veilline/);
});
test('a board done for the day never enters the stage — not even one Ling showed; reopened for an errand it does; drawn anyway it says it is done', async () => {
  const { stageCards, boardDoneToday } = await import('../scripts/stage.mjs');
  const { WORDS, cardHtml } = await import('../scripts/cards.js');
  const done = { id: 'alchemy-daily', title: '炼丹 · 配一炉丹', kind: 'board', status: 'done', won: false, game: 'lianliankan', done_at: '2026-09-24T14:09:09.608Z' };
  const look = { place: { id: 'fajiu' }, tasks: [done] };
  assert.equal(boardDoneToday(look, 'alchemy-daily'), true);
  assert.equal(boardDoneToday(look, 'lianliankan'), true, 'named by its game, it is its task');
  for (const focus of [[{ card: 'board', id: 'alchemy-daily' }], [{ card: 'board', id: 'lianliankan' }]]) {
    assert.ok(!stageCards(look, { focus }).some((c) => c.card === 'board'), `Ling's ${focus[0].id} stays off the stage`);
  }
  // Reopened for an errand (offered again, for_errand): on the stage.
  const again = { ...look, tasks: [{ ...done, status: 'offered', for_errand: true }] };
  assert.equal(boardDoneToday(again, 'alchemy-daily'), false);
  assert.ok(stageCards(again, { focus: [] }).some((c) => c.card === 'board' && c.id === 'alchemy-daily'));
  // A rumor's own board is its `tale:` id, never the day's practice.
  assert.equal(boardDoneToday(look, 'tale:x/1'), false);
  // Drawn anyway: a plain word, no tiles.
  for (const lang of ['zh', 'en']) {
    const html = cardHtml({ card: 'board', id: 'alchemy-daily' }, { look, lang, words: WORDS[lang], boardFor: () => { throw new Error('no deal'); } });
    assert.match(html, new RegExp(WORDS[lang].boardDoneToday));
    assert.doesNotMatch(html, /data-tile|data-game/);
    const game = { tasks: [{ id: 'wuziqi', title: '五子棋', kind: 'board', status: 'done', game: 'wuziqi', hosted: true }] };
    assert.match(cardHtml({ card: 'board', id: 'wuziqi' }, { look: game, lang, words: WORDS[lang], boardFor: () => null }), new RegExp(WORDS[lang].gameDoneToday));
    // 论道 won or lost today: it says so, no 开始.
    for (const outcome of ['won', 'lost']) {
      const l = cardHtml({ card: 'lundao' }, { look: { lundao: { outcome, name: '对对联', need: 3, good: 3, misses: 0, max_misses: 3 } }, lang, words: WORDS[lang] });
      assert.match(l, new RegExp(WORDS[lang][outcome === 'won' ? 'lundaoWon' : 'lundaoLost']));
      assert.doesNotMatch(l, /data-say|<button/);
    }
  }
  // The page's queue asks the same question.
  const src = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  assert.match(src, /if \(boardDoneToday\(look, c\.id\)\) return false;/);
});
test('所得: an errand handed in shows what it paid and the next step in hand', async () => {
  const { WORDS, cardHtml } = await import('../scripts/cards.js');
  const handed = [{ id: 'xu-elder-herb', title: '彭城老人的灵芝', who: '彭城的老人', paid: { progress: 40, wealth: 15 }, gives: '聚气丹',
    next: { id: 'xu-fuli-longzhi', title: '凫丽山的蠪侄', took: true, at: { id: 'pengcheng', name: '彭城' } } }];
  const html = cardHtml({ card: 'handed' }, { look: { handed }, lang: 'zh', words: WORDS.zh });
  assert.match(html, /交差 · 彭城老人的灵芝/);
  assert.match(html.replace(/<[^>]+>/g, ''), /修为 \+40 · 灵石 \+15 · 聚气丹/);
  assert.doesNotMatch(html, /fresh/, 'no clock given: shown, not animated');
  assert.match(cardHtml({ card: 'handed' }, { look: { handed }, lang: 'zh', words: WORDS.zh, handedAge: () => 100 }), /handedrow fresh" style="animation-delay:-100ms"/, 'fresh: it plays, picked up by its age');
  assert.match(html, /接下来 · 凫丽山的蠪侄/);
  const full = cardHtml({ card: 'handed' }, { look: { handed: [{ ...handed[0], next: { ...handed[0].next, took: false } }] }, lang: 'zh', words: WORDS.zh });
  assert.match(full, /手上已满，了一件再去彭城接/);
  assert.equal(cardHtml({ card: 'handed' }, { look: {}, lang: 'zh', words: WORDS.zh }), '');
});

test('short of the gate, the goal line names the next thing to do', async () => {
  const { WORDS, cardHtml } = await import('../scripts/cards.js');
  const waypoint = { text: '路通向流波山。', gate: { step: '结丹后期', progress: 1200, now: { step: '结丹初期', progress: 716, of: 800 } } };
  const errand = cardHtml({ card: 'goal' }, { look: { waypoint, work: { kind: 'errand', place: { name: '临淄' }, here: false, titles: ['榜文 · 走一趟琅琊台'] } }, lang: 'zh', words: WORDS.zh });
  assert.match(errand, /可做：临淄 · 榜文 · 走一趟琅琊台/);
  const beast = cardHtml({ card: 'goal' }, { look: { waypoint, work: { kind: 'beast', place: { name: '空桑' }, here: false, titles: ['夔'] } }, lang: 'zh', words: WORDS.zh });
  assert.match(beast, /可做：空桑的夔今日还未降/);
});

test('行路: the way walked is found over the roads, and drawn stop to stop', async () => {
  const { wayOf, travelHtml } = await import('../scripts/travel.js');
  const pts = new Map([
    ['taishan', { id: 'taishan', name: '泰山', map: [0.86, 0.34], roads: ['weishui'] }],
    ['weishui', { id: 'weishui', name: '潍水', map: [0.89, 0.34], roads: ['taishan', 'linzi'] }],
    ['linzi', { id: 'linzi', name: '临淄', map: [0.85, 0.32], roads: ['weishui'] }],
  ]);
  assert.deepEqual(wayOf(pts, 'taishan', 'linzi'), ['taishan', 'weishui', 'linzi']);
  assert.equal(wayOf(pts, 'taishan', 'nowhere'), null);
  const world = { dir: 'worlds/jiuding', atlas: { file: 'art/map/jiuzhou.svg', aspect: 1.3645 } };
  const html = travelHtml(['taishan', 'weishui', 'linzi'].map((id) => pts.get(id)), world);
  assert.match(html, /<polyline points="[\d.]+,[\d.]+ [\d.]+,[\d.]+ [\d.]+,[\d.]+"/, 'three stops, one line');
  assert.match(html, /泰山/); assert.match(html, /临淄/);
  assert.doesNotMatch(html, /潍水<\/span>/, 'a place walked through is a dot, not a name');
});

test('炼化本命 on the card: the materials held, a name the player types, and 炼化 — the page\'s own Refine', async () => {
  const { WORDS, cardHtml } = await import('../scripts/cards.js');
  const card = (refine_with, extra = {}) => cardHtml({ card: 'treasure' }, { look: { treasure: null, can_refine: true, refine_with }, lang: 'zh', words: WORDS.zh, ...extra });
  const held = { weapon: '铁剑', materials: [{ id: 'jingjin', name: '精金<b>', element: 'metal', n: 2 }, { id: 'hanyu', name: '寒玉', element: 'water', n: 1 }] };
  const html = card(held);
  assert.match(html, /data-refine-mat="jingjin" aria-pressed="true">精金&lt;b&gt; ×2</);
  assert.match(html, /data-refine-mat="hanyu" aria-pressed="false">寒玉</);
  assert.match(html, /<input type="text" id="refine-name" maxlength="12"/);
  assert.match(html, /data-refine="jingjin">炼化本命</);
  assert.match(html, /铁剑/);
  assert.doesNotMatch(html, /data-say/, 'no word to Ling');
  // The pick and the typed name stay across a redraw, escaped.
  const picked = card(held, { refineMat: 'hanyu', refineName: '青"锋', refineNote: '它还没有名字。' });
  assert.match(picked, /data-refine="hanyu"/);
  assert.match(picked, /value="青&quot;锋"/);
  assert.match(picked, /class="donote">它还没有名字。</);
  // Nothing to bind with: the card says what is missing, and offers no 炼化.
  assert.doesNotMatch(card({ weapon: null, materials: held.materials }), /data-refine=/);
  assert.match(card({ weapon: null, materials: held.materials }), /先佩一件兵器/);
  assert.match(card({ weapon: '铁剑', materials: [] }), /囊中没有天材地宝/);
});

test('the room dressed: the beast painted behind the fight, the boss and 银月 speak, why it is fought, and the end is a seal', async () => {
  const { WORDS, battleHtml } = await import('../scripts/battle-card.js');
  const { begin, offers, view } = await import('../scripts/battle.js');
  const { loadWorld } = await import('../scripts/content.mjs');
  const content = loadWorld('jiuding');
  const catalog = Object.fromEntries(content.cards.cards.map(c => [c.id, { ...c, name: c.name.zh }]));
  const foe = content.creatures.creatures.find(c => c.id === 'leishen');
  const st = begin({ mode: 'pve', seed: 'x', you: { tier: 'core', step: 0, root: 'wood', deck: ['jixiao', 'huoya', 'houtu', 'luying', 'leiming', 'jingwei', 'zhennu', 'luoshi', 'fenghuo', 'linmu'], extra: ['yinyue'] }, foe: { tier: 'core', root: 'wood', deck: foe.deck } }, catalog);
  const base = { lang: 'zh', words: WORDS.zh, catalog, board: st.mode.board, artBase: '../worlds/jiuding/', title: '降妖', foeName: '雷神', youName: '青玄', foeArt: '../worlds/jiuding/art/leishen.webp' };
  const plain = battleHtml(view(st), offers(st), base);
  assert.match(plain, /class="barena"[^>]*leishen\.webp/, 'the beast behind the fight');
  assert.match(plain, /class="battle el-wood/, 'the room wears its element');
  assert.doesNotMatch(plain, /bsay|bstake/, 'no line, no bubble; no stake, no line under the title');
  assert.doesNotMatch(plain, />空</, 'an empty place is a ring, not a word');
  const said = battleHtml(view(st), offers(st), { ...base, herName: '银月', stake: '为取青鼎', says: { foe: '雷泽是我的鼓。', her: '别让它蓄满。' } });
  assert.match(said, /<div class="bsay foe">雷泽是我的鼓。<\/div>/);
  assert.match(said, /<div class="bsay her"><b>银月<\/b>别让它蓄满。<\/div>/);
  assert.match(said, /<small class="bstake">为取青鼎<\/small>/);
  const won = battleHtml({ ...view(st), outcome: 'won' }, offers(st), { ...base, says: { end: '雷泽归你。' } });
  assert.match(won, /class="bover won"><b class="bseal">/);
  assert.match(won, /雷泽归你。/);
});
