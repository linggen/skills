// 银月 in a fight (scripts/fightsay.js, Hanli 2026-10-15): the facts she is given
// are what the page shows (view(st)) and fit the engine's cap; her cues are
// limited; a silence or a slow model falls back at once or at WAIT_MS; and the
// fight never waits on her.
import test from 'node:test';
import assert from 'node:assert/strict';
import { act, begin, view } from '../scripts/battle.js';
import { WORDS, boutWords } from '../scripts/battle-card.js';
import { ASK_LIMIT, CUE_LIMIT, FACTS_MAX, FALLBACK, WAIT_MS, bigPlay, cleanLine, createFightSay, cuesOf, fightFacts, strongFoe } from '../scripts/fightsay.js';

const CATALOG = {
  bolt: { id: 'bolt', name: { zh: '寒泉', en: 'Cold Spring' }, kind: 'spell', cost: 2, element: 'water', effect: { damage: 3 } },
  mend: { id: 'mend', name: { zh: '回春', en: 'Mend' }, kind: 'spell', cost: 1, element: 'wood', effect: { heal: 3 } },
  cub: { id: 'cub', name: { zh: '石卫', en: 'Stone Ward' }, kind: 'minion', cost: 2, element: 'earth', atk: 1, hp: 3, keywords: ['taunt'] },
  secretclaw: { id: 'secretclaw', name: { zh: '暗爪', en: 'Hidden Claw' }, kind: 'spell', cost: 1, element: 'fire', effect: { damage: 2 } },
};
const SETUP = {
  mode: 'pve', seed: 't',
  you: { tier: 'foundation', root: 'water', deck: ['bolt', 'mend', 'cub', 'bolt', 'mend', 'cub', 'bolt', 'mend', 'cub', 'bolt'] },
  foe: { tier: 'foundation', root: 'fire', deck: Array(12).fill('secretclaw'), signature: { id: 'quake', name: { zh: '裂地', en: 'Rend' }, effect: { damage: 6 } } },
};
const ctx = (lang = 'zh') => ({ catalog: CATALOG, lang, foeName: lang === 'en' ? 'Zheng' : '狰', tiers: { you: 'foundation', foe: 'foundation' }, words: boutWords(WORDS[lang], {}, lang) });
const fresh = () => begin(structuredClone(SETUP), CATALOG);
const NAME_LINE = '（灵境里玩家叫沈小满。）';

test('the facts are what the page shows, and fit the engine’s 300 with the name line', () => {
  for (const lang of ['zh', 'en']) {
    const st = fresh();
    const text = fightFacts(view(st), ctx(lang), 'ask');
    assert.ok([...text].length <= FACTS_MAX, `${lang}: ${[...text].length}`);
    assert.ok([...(NAME_LINE + text)].length <= 300);
    // both 气血, the player's hand by name, the ask itself
    assert.match(text, lang === 'zh' ? /你气血\d+\/\d+.*它气血\d+\/\d+/ : /You \d+\/\d+ Life.*it \d+\/\d+/);
    assert.match(text, lang === 'zh' ? /寒泉|回春|石卫/ : /Cold Spring|Mend|Stone Ward/);
    assert.match(text, lang === 'zh' ? /玩家问你/ : /asks how to play/);
    // never the beast's hand: its cards are a count, not names
    assert.doesNotMatch(text, /暗爪|Hidden Claw/);
  }
});

test('the facts never carry the beast’s plan without 望气术, nor its 杀招 before it is announced', () => {
  const st = fresh();
  const v = view(st);
  assert.equal(v.foe.intent, undefined);
  const text = fightFacts(v, ctx(), 'ask');
  assert.doesNotMatch(text, /望气|裂地/);
  // Announced: the 杀招 leads the facts.
  st.foe.charge = { phase: 'gathering' };
  const told = fightFacts(view(st), ctx(), 'ask');
  assert.match(told, /蓄杀招「裂地」/);
  // With 望气术 the plan the page draws is told too.
  const seen = begin({ ...structuredClone(SETUP), you: { ...structuredClone(SETUP.you), insight: 2 } }, CATALOG);
  assert.match(fightFacts(view(seen), ctx(), 'ask'), /望气：它下回合/);
});

test('cues: the 杀招 begun, 气血 under 30% crossed, the loss, the win over a strong foe', () => {
  const st = fresh();
  const before = view(st);
  const after = structuredClone(before);
  assert.deepEqual(cuesOf(before, after, [{ act: 'charge', who: 'foe' }]), ['charge']);
  after.you.hp = Math.floor(after.you.hpMax * 0.29);
  assert.deepEqual(cuesOf(before, after, []), ['low']);
  assert.deepEqual(cuesOf(after, after, []), [], 'already low: no second word');
  assert.deepEqual(cuesOf(before, { ...after, outcome: 'lost' }, []), ['lost']);
  assert.deepEqual(cuesOf(before, { ...after, outcome: 'won' }, [], { strong: false }), []);
  assert.deepEqual(cuesOf(before, { ...after, outcome: 'won' }, [], { strong: true }), ['won']);
  assert.ok(strongFoe({ creature: { elite: true } }));
  assert.ok(strongFoe({ creature: {}, setup: { you: { tier: 'qi' }, foe: { tier: 'foundation' } } }));
  assert.ok(!strongFoe({ creature: {}, setup: { you: { tier: 'core' }, foe: { tier: 'foundation' } } }));
  // a big play: a third of its 气血 in one move, or two of its rank driven off
  const v = view(st);
  assert.ok(bigPlay([{ act: 'hurt', who: 'foe', amount: Math.ceil(v.foe.hpMax / 3) }], v));
  assert.equal(bigPlay([{ act: 'hurt', who: 'foe', amount: 1 }], v), null);
  assert.ok(bigPlay([{ act: 'withdrew', who: 'foe' }, { act: 'withdrew', who: 'foe' }], v));
});

/* A rig: a clock the test moves, and an ask the test answers. */
function rig({ sent = true } = {}) {
  let t = 0;
  const due = [];
  const timers = { set: (fn, ms) => { const h = { fn, at: t + ms }; due.push(h); return h; }, clear: (h) => { h.fn = null; } };
  const lines = [];
  const asks = [];
  const say = createFightSay({
    ask: (kind, facts) => {
      let answer;
      const line = new Promise((r) => { answer = r; });
      asks.push({ kind, facts, answer });
      return { sent: Promise.resolve(sent), line };
    },
    onLine: (l) => lines.push(l), timers,
  });
  const run = async (ms) => { t += ms; for (const h of due) if (h.fn && h.at <= t) { const f = h.fn; h.fn = null; f(); } await new Promise((r) => setImmediate(r)); };
  return { say, lines, asks, run };
}
const at = (turn, extra = {}) => ({ outcome: 'open', whose: 'you', turn, ...extra });

test('问银月: one a turn, ASK_LIMIT a fight, only on the player’s turn', async () => {
  const r = rig();
  assert.ok(r.say.canAsk(at(1)));
  assert.ok(!r.say.canAsk(at(1, { whose: 'foe' })));
  r.say.ask(at(1), 'f');
  await r.run(0);
  r.asks[0].answer('先打护主。');
  await r.run(0);
  assert.equal(r.say.ask(at(1), 'f'), null, 'once a turn');
  assert.ok(r.say.ask(at(3), 'f'));
  await r.run(WAIT_MS);
  assert.equal(r.say.asksLeft(), ASK_LIMIT - 2);
  assert.equal(r.say.ask(at(5), 'f'), null, 'the fight’s asks are spent');
});

test('cues: at most CUE_LIMIT a fight, each kind once, never on consecutive turns; the closing one may follow', async () => {
  const r = rig();
  const facts = () => 'f';
  assert.ok(r.say.cue(['charge'], at(2), facts));
  await r.run(WAIT_MS);
  assert.equal(r.say.cue(['low'], at(3), facts), null, 'the next turn: not two in a row');
  assert.equal(r.say.cue(['charge'], at(6), facts), null, 'each kind once');
  assert.ok(r.say.cue(['low', 'big'], at(4), facts));
  assert.equal(r.lines.at(-1).kind, 'low', 'low before big when both fire');
  await r.run(WAIT_MS);
  assert.ok(r.say.cue(['lost'], at(5), facts), 'the loss follows anything');
  await r.run(WAIT_MS);
  assert.equal(r.say.st.cues, CUE_LIMIT);
  assert.equal(r.say.cue(['big'], at(9), facts), null, 'the cap');
});

test('nobody to hear it (scratch save, pet off): the fallback at once — no wait', async () => {
  const r = rig({ sent: false });
  r.say.ask(at(1), 'f');
  assert.equal(r.lines[0].from, 'wait');
  await r.run(0);
  assert.equal(r.lines.at(-1).from, 'fallback');
  assert.ok(FALLBACK.zh.ask.includes(r.lines.at(-1).text));
});

test('a slow model: the fallback at WAIT_MS, and her own line takes its place if it lands while the fight is open', async () => {
  const r = rig();
  r.say.ask(at(1), 'f');
  await r.run(WAIT_MS - 1);
  assert.equal(r.lines.at(-1).from, 'wait');
  await r.run(1);
  assert.equal(r.lines.at(-1).from, 'fallback');
  r.asks[0].answer('银月：先把那个护主打掉，它下回合要放杀招。');
  await r.run(0);
  assert.deepEqual([r.lines.at(-1).from, r.lines.at(-1).text], ['her', '先把那个护主打掉，它下回合要放杀招。']);
  // After the room closes, a late line goes to the chat only.
  r.say.cue(['lost'], at(2), () => 'f');
  await r.run(0);
  r.say.close();
  r.asks[1].answer('没事。');
  await r.run(0);
  assert.notEqual(r.lines.at(-1).text, '没事。');
});

test('her line as it came: SILENT is no line; a long one is cut at a sentence', () => {
  assert.equal(cleanLine('SILENT'), null);
  assert.equal(cleanLine('  '), null);
  assert.equal(cleanLine('**银月**：好。'), '好。');
  const long = `${'先稳住。'.repeat(30)}`;
  assert.ok([...cleanLine(long)].length <= 90);
  assert.ok(cleanLine(long).endsWith('。'));
});

test('the fight never waits on her: speak returns before the ask answers, and a move plays on', async () => {
  let asked = 0;
  const say = createFightSay({ ask: () => { asked += 1; return { sent: new Promise(() => {}), line: new Promise(() => {}) }; }, timers: { set: () => null, clear: () => {} } });
  const st = fresh();
  const id = say.ask(view(st), 'f');
  assert.equal(typeof id, 'number', 'a number back, not a promise');
  // the move goes through while her answer never comes
  const res = act(st, { kind: 'end' }, 'you');
  assert.ok(res.ok);
  await new Promise((r) => setImmediate(r));
  assert.equal(asked, 1);
});
