// 银月 as companion (scripts/hersay.js, Hanli 2026-10-15): which moments she
// speaks at, how often, asleep in the 木牌 vs awake, the pool when she is slow
// or cannot be heard, and that nothing ever waits on her. Her register is the
// proud 妖王's — the pools hold no sweet stock lines.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GRIND_AT, MOMENTS, POOLS, SHORT_GAP_MS, STREAKS, WAIT_MS, createHerSay, herMode, momentFacts, poolOf, weighWin } from '../scripts/hersay.js';
import { FALLBACK, FALLBACK_ASLEEP, LIMITS, createFightSay } from '../scripts/fightsay.js';

const manual = () => {
  const q = [];
  return { q, set: (fn, ms) => { const h = { fn, ms }; q.push(h); return h; }, clear: (h) => { const i = q.indexOf(h); if (i >= 0) q.splice(i, 1); }, fire: () => { const all = q.splice(0); for (const h of all) h.fn(); } };
};
const tick = () => new Promise((r) => setImmediate(r));
function rig({ mode = 'awake', answer = 'none', clock = { t: Date.parse('2026-10-15T10:00:00') } } = {}) {
  const lines = [], asked = [], timers = manual(), mem = { v: {} };
  const ask = (kind, facts, opts) => {
    asked.push({ kind, facts, ...opts });
    if (answer === 'silent') return { sent: Promise.resolve(false), line: new Promise(() => {}) };
    if (answer === 'her') return { sent: Promise.resolve(true), line: Promise.resolve('**银月**：哼，还行。') };
    return { sent: Promise.resolve(true), line: new Promise(() => {}) };
  };
  const say = createHerSay({ ask, onLine: (l) => lines.push(l), mode: () => mode, now: () => clock.t, timers, store: { get: () => mem.v, set: (o) => { mem.v = structuredClone(o); } } });
  return { say, lines, asked, timers, clock, mem, setMode: (m) => { mode = m; } };
}

test('her mode comes from the save’s companion: absent before she is met and on 今线, asleep in the 木牌, awake', () => {
  assert.equal(herMode({}), 'absent');
  assert.equal(herMode({ companion: { joined: false } }), 'absent');
  assert.equal(herMode({ companion: { joined: true, away: true } }), 'absent');
  assert.equal(herMode({ companion: { joined: true, asleep: true } }), 'asleep');
  assert.equal(herMode({ companion: { joined: true, awake: true } }), 'awake');
});

test('every moment has a pool, asleep and awake, zh and en, two lines or more — and none of them sweet', () => {
  const sweet = /我在呢|我陪着你|替你高兴|恭喜|I'm here|I'm with you|congratulations/i;
  for (const mode of ['awake', 'asleep']) for (const lang of ['zh', 'en']) {
    for (const kind of Object.keys(MOMENTS)) {
      const p = POOLS[mode][lang][kind];
      assert.ok(Array.isArray(p) && p.length >= 2, `${mode}/${lang}/${kind}`);
    }
    for (const line of Object.values(POOLS[mode][lang]).flat()) assert.doesNotMatch(line, sweet, line);
  }
  for (const pool of [FALLBACK, FALLBACK_ASLEEP]) for (const line of Object.values(pool.zh).concat(Object.values(pool.en)).flat()) assert.doesNotMatch(line, sweet, line);
  // Asleep, her lines are drowsy (the 木牌's ……) — the selection really switches.
  assert.ok(poolOf('won', { mode: 'asleep' }).every((l) => l.startsWith('……')));
  assert.ok(poolOf('won', { mode: 'awake' }).every((l) => !l.startsWith('……')));
});

test('the facts she is given carry the moment, the 妖王 register and fit the engine’s cap', () => {
  for (const lang of ['zh', 'en']) for (const kind of Object.keys(MOMENTS)) {
    const t = momentFacts(kind, 'x'.repeat(400), lang, { max: 260 });
    assert.ok([...t].length <= 260, `${lang}/${kind}: ${[...t].length}`);
  }
  assert.match(momentFacts('won', '胜了狰。', 'zh'), /^胜了狰。.*本王/);
  assert.match(momentFacts('lost', 'Lost to Zheng.', 'en'), /demon king/);
  assert.match(momentFacts('won', '', 'zh', { weight: 'short' }), /十字内/);
});

test('a repeatable win is weighed: full when it means something, else short once in SHORT_GAP_MS, else a reaction', () => {
  for (const k of ['story', 'strong', 'close', 'firstToday', 'newBeast']) assert.equal(weighWin({ [k]: true }).weight, 'full', k);
  assert.equal(weighWin({ streak: STREAKS[0] }).weight, 'full');
  assert.equal(weighWin({ streak: 2 }, { lastShort: -Infinity, now: 0 }).weight, 'short');
  assert.equal(weighWin({ streak: 2 }, { lastShort: 0, now: SHORT_GAP_MS - 1 }).weight, 'react');
});

test('fights: every win and loss gets her; the pool-fight grind is weighed; a reaction asks no model', async () => {
  const r = rig();
  const won = (extra = {}) => r.say.fight({ outcome: 'won', repeat: true, what: '胜了狰。', ...extra });
  assert.equal(won().weight, 'full'); //                     first win of the day
  r.clock.t += 60_000;
  assert.equal(won().weight, 'short'); //                    an ordinary second
  r.clock.t += 60_000;
  const third = won(); //                                    streak 3 → full again
  assert.equal(third.weight, 'full');
  assert.deepEqual(third.why, ['streak']);
  r.clock.t += 60_000;
  await tick(); await tick();
  const n = r.asked.length;
  assert.equal(won().weight, 'react');
  await tick(); await tick();
  assert.equal(r.asked.length, n, 'a reaction is the pool’s, no ask');
  assert.equal(r.lines.at(-1).from, 'react');
  assert.equal(won({ close: true }).weight, 'full');
  // A story fight (a 试, a 比试): always the full word.
  assert.equal(won({ repeat: false }).weight, 'full');
  // Losses: comfort every time; a second inside ten minutes is the short word.
  assert.equal(r.say.fight({ outcome: 'lost', repeat: true }).weight, 'full');
  r.clock.t += 60_000;
  assert.equal(r.say.fight({ outcome: 'lost', repeat: true }).weight, 'short');
  await tick(); await tick();
  assert.equal(r.asked.at(-1).kind, 'lost');
  // Said in the fight already: the page does not say it twice.
  const before = r.asked.length;
  r.say.fight({ outcome: 'lost', saidInFight: true });
  await tick(); await tick();
  assert.equal(r.asked.length, before);
  // The losses broke the streak.
  assert.equal(r.say.mem.wins > 0, true);
});

test('the grind word comes once, at the GRIND_AT-th repeatable fight of a day', async () => {
  const r = rig();
  for (let i = 0; i < GRIND_AT + 3; i++) { r.clock.t += 1000; r.say.fight({ outcome: 'won', repeat: true }); await tick(); await tick(); }
  assert.equal(r.asked.filter((a) => a.kind === 'grind').length + r.lines.filter((l) => l.kind === 'grind' && l.from === 'react').length, 1);
});

test('once-rules: a stuck board once per board, a skip once in 30 min, a first win once per game', () => {
  const r = rig();
  assert.ok(r.say.say('stuck', '', { key: 'b1' }));
  assert.equal(r.say.say('stuck', '', { key: 'b1' }), null);
  assert.ok(r.say.say('stuck', '', { key: 'b2' }));
  assert.ok(r.say.say('skipped', ''));
  r.clock.t += 10 * 60_000;
  assert.equal(r.say.say('skipped', ''), null);
  r.clock.t += 21 * 60_000;
  assert.ok(r.say.say('skipped', ''));
  assert.ok(r.say.say('game_first', '', { key: 'twenty' }));
  assert.equal(r.say.say('game_first', '', { key: 'twenty' }), null);
  // Kept in the browser's store: a reload remembers.
  assert.ok(r.mem.v.once['game_first|twenty']);
});

test('achievements always speak; absent (before she is met, 今线) nothing at all', () => {
  const r = rig();
  for (const k of ['rise', 'hui', 'tamed', 'bt_failed']) { assert.ok(r.say.say(k, 'x')); assert.ok(r.say.say(k, 'x')); }
  r.setMode('absent');
  const n = r.lines.length;
  assert.equal(r.say.say('rise', 'x'), null);
  assert.equal(r.say.fight({ outcome: 'won' }).id, null);
  assert.equal(r.lines.length, n);
});

test('never blocks: say returns at once; slow → the pool at WAIT_MS; her late line still takes the bubble', async () => {
  const r = rig();
  const id = r.say.say('rise', '练气一层 → 练气二层。');
  assert.equal(typeof id, 'number');
  assert.equal(r.lines.at(-1).from, 'wait');
  assert.equal(r.timers.q[0].ms, WAIT_MS);
  r.timers.fire();
  assert.equal(r.lines.at(-1).from, 'fallback');
  assert.ok(POOLS.awake.zh.rise.includes(r.lines.at(-1).text));
});

test('asleep: nobody can hear her (the engine’s gate) → the 木牌’s pool at once, drowsy', async () => {
  const r = rig({ mode: 'asleep', answer: 'silent' });
  r.say.say('won', '胜了狰。');
  await tick(); await tick();
  assert.equal(r.asked.at(-1).mode, 'asleep');
  const l = r.lines.at(-1);
  assert.equal(l.from, 'fallback');
  assert.equal(l.mode, 'asleep');
  assert.ok(POOLS.asleep.zh.won.includes(l.text));
});

test('awake and answered: her own line, cleaned', async () => {
  const r = rig({ answer: 'her' });
  r.say.say('tamed', '收服了犰狳。');
  await tick(); await tick();
  assert.equal(r.lines.at(-1).from, 'her');
  assert.equal(r.lines.at(-1).text, '哼，还行。');
  assert.equal(r.asked.at(-1).mood, 'happy');
});

test('in a fight, asleep: one 问银月 and only the closing word', async () => {
  const lines = [];
  const timers = manual();
  const say = createFightSay({ ask: () => ({ sent: Promise.resolve(false), line: new Promise(() => {}) }), onLine: (l) => lines.push(l), mode: () => 'asleep', timers });
  const v = (turn, extra = {}) => ({ outcome: 'open', whose: 'you', turn, ...extra });
  assert.equal(say.asksLeft(), LIMITS.asleep.ask);
  assert.ok(say.ask(v(1), 'f'));
  await tick(); await tick();
  assert.ok(FALLBACK_ASLEEP.zh.ask.includes(lines.at(-1).text));
  assert.equal(say.canAsk(v(3)), false);
  assert.equal(say.cue(['charge'], v(5), () => 'f'), null);
  assert.equal(say.cue(['low'], v(7), () => 'f'), null);
  assert.ok(say.cue(['lost'], v(9, { outcome: 'lost' }), () => 'f'));
  await tick(); await tick();
  assert.ok(FALLBACK_ASLEEP.zh.lost.includes(lines.at(-1).text));
});
