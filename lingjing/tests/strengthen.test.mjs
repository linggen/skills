// After a fight lost, the ways forward (rules/strengthen.mjs; Hanli 2026-10-27, lost to the 后山's 狼 at
// 练气一层 with the 弓 and 灰袍 still in the pouch: 「玩家战败, 卡在这里, 可以让yinyue给一点提示, 去增强战力,
// 或者得到卡片, 武器, 再来刷怪」). The order is a rule; these hold it to the fight's own numbers at the wm-chaifang
// gate (tools/story-fights.mjs h05g, the band's careful line), and the loss's result to carry it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { begin, act, foeTurn } from '../scripts/battle.js';
import { duel, fightSetup, strengthen } from '../scripts/rules.mjs';
import { encounterOf } from '../scripts/rules/world.mjs';
import { content, FIGHTS, foeOf, NOW, stateAt } from '../tools/story-fights.mjs';
import { lookahead } from '../scripts/fightline.js';

process.env.LINGJING_STAMINA_LIMIT ??= '1';
const catalog = Object.fromEntries(content.cards.cards.map(c => [c.id, c]));
const SEEDS = 40;

/* A save at the gate as he had it: the 弓 and 灰袍 in the pouch, not worn; 136 灵石; on the 后山. */
function gateSave(extra = {}) {
  const s = stateAt('h05g');
  Object.assign(s, { wear: {}, wealth: 136, place: 'houshan', done_scenes: [...new Set([...(s.done_scenes ?? []), 'wm-zhoutian', 'wm-yaoyuan'])], stamina: 100, stamina_at: NOW.toISOString() }, extra);
  s.bag = { ...s.bag, 'old-bow': 1, 'grey-robe': 1 };
  delete s.fight;
  return s;
}

/* The share of fixed deals won at the gate's 后山 by the careful line, with the save as given. */
function rate(save, ids = ['lang', 'yezhu', 'fushe']) {
  let won = 0, n = 0;
  for (const id of ids) {
    const f = FIGHTS.find(x => x.id === id && x.pool === 'yaoyuan-wai');
    const real = setupFor(save, f);
    for (let k = 0; k < SEEDS; k += 1) {
      const st = begin({ ...real, seed: `strong|${k}` }, catalog);
      for (let g = 0; g < 300 && st.outcome === 'open'; g += 1) { if (st.whose === 'foe') { foeTurn(st); continue; } act(st, lookahead(st), 'you'); }
      if (st.outcome === 'won') won += 1;
      n += 1;
    }
  }
  return won / n;
}
const setupFor = (save, f) => fightSetup(content, save, foeOf(f), NOW, `haunt:${f.id}`);

test('his save at the gate: put on the 弓 and 灰袍 first, then a card at the 外门库房, a pill, another beast, 闭关, 功课', () => {
  const way = strengthen(content, gateSave(), { now: NOW, game: { hunt: 'houshan' } });
  assert.deepEqual(way.map(o => o.kind), ['wear', 'wear', 'buy', 'buy', 'pills', 'another', 'seclude', 'gongke']);
  assert.deepEqual(way.filter(o => o.kind === 'wear').map(o => o.item).sort(), ['grey-robe', 'old-bow']);
  const buy = way.find(o => o.kind === 'buy');
  assert.equal(buy.card, 'caoren', 'a body that stands in front first');
  assert.equal(buy.place, 'zhishi');
  assert.ok(buy.steps > 0 && buy.price <= 136, JSON.stringify(buy));
  assert.ok(way.every(o => o.kind !== 'buy' || o.price <= 136));
});

test('what he cannot afford or already holds is never offered; the 坊市 below the gate is not in reach', () => {
  const poor = strengthen(content, gateSave({ wealth: 10, wear: { weapon: 'old-bow', robe: 'grey-robe' } }), { now: NOW });
  assert.ok(!poor.some(o => o.kind === 'buy' || o.kind === 'pills' || o.kind === 'wear'), JSON.stringify(poor));
  const held = strengthen(content, gateSave({ cards: [...stateAt('h05g').cards, 'caoren', 'sanhuo', 'tieji'] }), { now: NOW });
  assert.ok(!held.some(o => o.kind === 'buy'));
  assert.ok(strengthen(content, gateSave(), { now: NOW }).every(o => o.place !== 'fangshi'), '外门弟子无令不得下山');
});

test('the order holds on the fight: worn beats bare, and a card bought beats worn', () => {
  const bare = rate(gateSave());
  const worn = rate(gateSave({ wear: { weapon: 'old-bow', robe: 'grey-robe' } }));
  const bought = rate(gateSave({ wear: { weapon: 'old-bow', robe: 'grey-robe' }, cards: [...stateAt('h05g').cards, 'caoren'] }));
  const two = rate(gateSave({ wear: { weapon: 'old-bow', robe: 'grey-robe' }, cards: [...stateAt('h05g').cards, 'caoren', 'sanhuo'] }));
  assert.ok(worn >= bare + 0.12, `worn ${worn} vs bare ${bare}`);
  assert.ok(bought >= worn + 0.1, `a card bought ${bought} vs worn ${worn}`);
  assert.ok(two >= 0.75, `two cards bought win ${two} — the model's ~0.8 for a player who bought`);
});

test('a loss at the 后山 carries what beat him and the way forward', () => {
  let s = gateSave();
  const enc = encounterOf(content, s, NOW);
  assert.ok(enc?.game?.id?.startsWith('haunt:'), 'a beast is up on the 后山');
  const started = duel(s, content, { now: NOW, quests: [] }, { id: enc.game.id });
  assert.equal(started.result.ok, true, JSON.stringify(started.result));
  const st = begin(started.result.duel.setup, catalog), picks = [];
  for (let g = 0; g < 400 && st.outcome === 'open'; g += 1) { if (st.whose === 'foe') { foeTurn(st); continue; } act(st, { kind: 'end' }, 'you'); picks.push('end'); }
  const r = duel(started.state, content, { now: NOW, quests: [] }, { id: enc.game.id, picks: picks.join(',') }).result;
  assert.notEqual(r.outcome, 'won');
  assert.ok(r.beat && Number.isFinite(r.beat.foe_hp) && Number.isFinite(r.beat.guards), JSON.stringify(r.beat));
  assert.equal(r.way?.[0]?.kind, 'wear', JSON.stringify(r.way));
});

test('a pool beast Ling Showed before stands no more once the place deals another: never a blank stage', async () => {
  const { stageCards } = await import('../scripts/stage.mjs');
  const look = { place: { id: 'houshan', encounter: { game: { id: 'haunt:chihu' }, creature: { id: 'chihu' } } }, companion: { joined: true, asleep: true } };
  const ids = stageCards(look, { focus: [{ card: 'duel', id: 'haunt:lang' }, { card: 'duel', id: 'haunt:mihou' }] }).filter(c => c.card === 'duel').map(c => c.id);
  assert.deepEqual(ids, ['haunt:chihu']);
});

test('a story fight lost carries no way (a key beat may lock the map; its own 算了 stands) — only a roaming fight does', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../scripts/rules/tasks.mjs', import.meta.url), 'utf8');
  assert.match(src, /const way = won \|\| exit \? null : lossWay\(/);
});

test('her loss facts lead with the step, so it survives the cap, in both languages', async () => {
  const { momentFacts, wayFacts } = await import('../scripts/hersay.js');
  const way = strengthen(content, gateSave({ wear: { weapon: 'old-bow', robe: 'grey-robe' } }), { now: NOW, game: { hunt: 'houshan' } });
  for (const zh of [true, false]) {
    const tail = zh ? '输给了狼，撑了9回合；它还剩气血3/20，叫出3个护主。' : ' Lost to Wolf after 9 turns; it had 3/20 Life left, 3 guards called.';
    const facts = momentFacts('lost', wayFacts(way, zh) + tail, zh ? 'zh' : 'en', { max: 260 });
    assert.ok(facts.includes(way[0].name) && facts.includes(String(way[0].place_name).split(' · ').at(-1)), facts);
  }
});

/* Hanli 2026-10-27: 「去执事堂 · 买铁蒺藜, 如果是推荐玩家变强, 应该让yinyue解释一下, 为什么要买东西? 能增强什么」 — the
   step says what it is and does, which fight it is for, and the odds there before → after; 银月 is given the same. */
const lostAtHoushan = (extra = {}) => gateSave({ wear: { weapon: 'old-bow', robe: 'grey-robe' }, hunt_losses: { houshan: 1 }, duels: { 'hunt:houshan': { day: '2026-10-26', outcome: 'lost', n: 1, last: ['chihu'] } }, ...extra });

test('each step says what it is and does: a card its cost, body, keywords and effect; gear its slot and what it lends; a pill its effect', () => {
  const way = strengthen(content, gateSave(), { now: NOW });
  const bow = way.find(o => o.item === 'old-bow');
  assert.deepEqual(bow.does, { atk: 2, root: 'wood' });
  const caoren = strengthen(content, gateSave({ wear: { weapon: 'old-bow', robe: 'grey-robe' } }), { now: NOW }).find(o => o.card === 'caoren');
  assert.deepEqual(caoren.does, { card_kind: 'minion', cost: 2, atk: 1, hp: 3, keywords: ['taunt'], element: 'wood' });
  assert.equal(caoren.line.split(' · ')[0], '替身草人');
  assert.match(caoren.line, /2 灵力 · 1\/3 · 护主/);
  const tieji = strengthen(content, lostAtHoushan({ wealth: 45 }), { now: NOW }).find(o => o.card === 'tieji');
  assert.deepEqual(tieji.does.effect, { damage: 1, draw: 1 });
  const pill = way.find(o => o.kind === 'pills');
  assert.deepEqual(pill.does, { heal: 10 });
});

test('the first step is for the fight he lost, and its odds there are weighed once and kept on the save', async () => {
  const { strongFit } = await import('../scripts/rules.mjs');
  const s = lostAtHoushan({ wealth: 45 });
  const fitted = strongFit(content, s, NOW);
  assert.notEqual(fitted, s, 'weighed and written');
  assert.equal(fitted.strong_odds.for.creature, 'chihu', 'the beast he lost to, not the one standing now');
  assert.equal(strongFit(content, fitted, NOW), fitted, 'kept: a read weighs nothing again');
  const top = strengthen(content, fitted, { now: NOW })[0];
  assert.equal(top.card, 'tieji');
  assert.equal(top.for.name, '赤狐');
  assert.ok(top.odds.after > top.odds.before, JSON.stringify(top.odds));
  assert.match(top.line, /^铁蒺藜 · 1 灵力 · 打 1 点，抽 1 张 · 对赤狐 \d+% → \d+%$/);
  // The hand changes (the card bought): the kept odds no longer hold, and are weighed again for the next step.
  const bought = { ...fitted, cards: [...fitted.cards, 'tieji'], wealth: 5 };
  assert.equal(strengthen(content, bought, { now: NOW }).find(o => o.odds), undefined, 'stale odds are never shown');
  const refit = strongFit(content, bought, NOW);
  assert.ok(!refit.strong_odds || refit.strong_odds.key !== fitted.strong_odds.key);
  // Made good (won there since): nothing is kept.
  const won = strongFit(content, { ...fitted, hunted: { houshan: 1 } }, NOW);
  assert.equal(won.strong_odds, undefined);
});

test('odds that do not rise are no reason: neither the line nor her facts carry them', async () => {
  const { wayLine } = await import('../scripts/wayline.js');
  const { wayFacts, whyFacts } = await import('../scripts/hersay.js');
  const o = { kind: 'buy', name: '铁蒺藜', price: 40, place_name: '沉鼎观 · 执事堂', steps: 4, card: 'tieji', does: { card_kind: 'spell', cost: 1, effect: { damage: 1, draw: 1 } }, for: { name: '赤狐' }, odds: { before: 0.5, after: 0.5 } };
  assert.equal(wayLine(o, 'zh'), '铁蒺藜 · 1 灵力 · 打 1 点，抽 1 张');
  assert.ok(!wayFacts([o], true).includes('%') && !whyFacts(o, true).includes('%'));
  const up = { ...o, odds: { before: 0.44, after: 0.56 } };
  assert.equal(wayLine(up, 'zh'), '铁蒺藜 · 1 灵力 · 打 1 点，抽 1 张 · 对赤狐 44% → 56%');
  assert.equal(wayLine(up, 'en'), '铁蒺藜 · 1 Force · 1 damage, draw 1 · vs 赤狐 44% → 56%');
  assert.match(whyFacts(up, true), /输给过赤狐.*胜算约44%→56%（1 灵力 · 打 1 点，抽 1 张）/);
});

test('her loss facts keep the step, its odds (and in Chinese what it does) under the cap, in both languages', async () => {
  const { momentFacts, wayFacts } = await import('../scripts/hersay.js');
  const { strongFit } = await import('../scripts/rules.mjs');
  const s = strongFit(content, lostAtHoushan({ wealth: 45 }), NOW);
  for (const zh of [true, false]) {
    const way = strengthen(content, { ...s, lang: zh ? 'zh' : 'en' }, { now: NOW, game: { hunt: 'houshan' } });
    const tail = zh ? '输给了赤狐，撑了9回合；它还剩气血3/20，叫出3个护主。' : ' Lost to Red Fox after 9 turns; it had 3/20 Life left, 3 guards called.';
    const facts = momentFacts('lost', wayFacts(way, zh) + tail, zh ? 'zh' : 'en', { max: 260 });
    const pct = `${Math.round(way[0].odds.after * 100)}%`;
    // English leaves little room under the register: the name and the odds lead, what it does follows as room allows.
    assert.ok(facts.includes(pct) && facts.includes(way[0].name) && (!zh || facts.includes('打 1 点')), facts);
  }
});

test('the 主页 hands its way with the fact line (the phone reads `line` from Look); the ? asks her by the asked moment', async () => {
  const { readFileSync } = await import('node:fs');
  const cards = readFileSync(new URL('../scripts/cards.js', import.meta.url), 'utf8');
  assert.match(cards, /data-home-why="\$\{at\}"/);
  const page = readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');
  assert.match(page, /herSay\.say\('why_strong', whyFacts\(/);
  const { MOMENTS, flagsOf } = await import('../scripts/voice.js');
  assert.deepEqual(flagsOf('strong_ask', MOMENTS), { asked: true });
});
