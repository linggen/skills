// What Ling's Look carries for the player's words (rules/inquiry.mjs):
// `about` for a 问询, `bout` for a fight the page just finished. Seen live
// 2026-09-25: 「说说雷神」 away from 雷泽 answered 「没有可靠记述」 and pointed at
// the page; `[scene] won` made up the last blow and the spoils.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { act, battle, begin, foeTurn, offers, tokenOf } from '../scripts/battle.js';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { resolve, task, win } from '../scripts/rules.mjs';
import { THEN_ABOUT, THEN_ABOUT_NONE, THEN_BOUT, THEN_BOUT_BARE } from '../scripts/rules/inquiry.mjs';

const content = loadContent();
const NOW = new Date('2026-10-05T10:00:00');
const ROOT = path.resolve(import.meta.dirname, '..');
const catalog = Object.fromEntries(content.cards.cards.map(x => [x.id, x]));

const must = (fn, s, args) => {
  const out = fn(s, content, { now: NOW, quests: [] }, args);
  assert.ok(out.result.ok, JSON.stringify(out.result));
  return out.state;
};
function openWorld() {
  let s = newState(content, 'zh', NOW);
  for (const [fn, args] of [[resolve, { exit: 'reach' }], [resolve, { exit: 'name', value: '青玄' }], [resolve, { exit: 'touch' }],
    [win, { id: 'alchemy-first' }], [task, { action: 'done', id: 'alchemy-first' }], [resolve, { exit: 'set-out' }], [resolve, { exit: 'gift' }], [resolve, { exit: 'rest' }]]) s = must(fn, s, args);
  return s;
}

/* A save on disk and the command line, as the page and Ling call it. */
function world(state) {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lingjing-inquiry-'));
  fs.writeFileSync(path.join(data, 'state.json'), JSON.stringify(state));
  const env = { ...process.env, LINGJING_DATA: data, LINGJING_QUESTS: path.join(data, 'none'), LINGJING_NOW: NOW.toISOString(), LINGGEN_SESSION_ID: 's1' };
  const cli = (...args) => JSON.parse(spawnSync(process.execPath, ['scripts/rules.mjs', ...args], { cwd: ROOT, env, encoding: 'utf8' }).stdout);
  return { data, cli, saved: () => JSON.parse(fs.readFileSync(path.join(data, 'state.json'), 'utf8')), done: () => fs.rmSync(data, { recursive: true, force: true }) };
}

/* Play the fight the page's way: the most taken off the beast per turn, or nothing at all. */
function picksFor(setup, pass = false) {
  const st = begin(setup, catalog), actions = [];
  for (let guard = 0; guard < 200 && st.outcome === 'open'; guard += 1) {
    if (st.whose === 'foe') { foeTurn(st); continue; }
    const can = pass ? [] : offers(st).filter(o => o.ok && o.action.kind !== 'end');
    const best = can.map(o => ({ o, hp: battle([...actions, tokenOf(o.action)], setup, catalog).foe.hp })).sort((a, b) => a.hp - b.hp)[0]?.o;
    const a = best ? best.action : { kind: 'end' };
    act(st, a, 'you');
    actions.push(tokenOf(a));
  }
  return { actions, outcome: st.outcome };
}

const atHaunt = () => ({ ...openWorld(), chapter: '01-ji', scene: null, place: 'fajiu', tier: 'foundation', step: 0, progress: 0, stamina: 50, updated: NOW.toISOString() });

test('说说雷神 away from 雷泽: Look carries the creature from its heritage, and the 问询 then', () => {
  const w = world(atHaunt());
  try {
    const r = w.cli('look', '--said=说说雷神', '--for=ling');
    assert.equal(r.about.creature, 'leishen');
    assert.equal(r.about.name, '雷神');
    assert.equal(r.about.haunt, '雷泽');
    assert.match(r.about.quote, /雷泽中有雷神/);
    assert.ok(r.about.source && r.about.look && r.about.root && r.about.elite);
    assert.ok(r.then.endsWith(THEN_ABOUT));
    const colon = w.cli('look', '--said=说说雷神：它为什么住在雷泽？', '--for=ling');
    assert.equal(colon.about.creature, 'leishen', 'the subject before the colon');
    assert.ok(colon.then.endsWith(THEN_ABOUT));
    assert.match(THEN_ABOUT, /Never say there is no record/);
    assert.match(THEN_ABOUT, /do NOT call AskUser/);
  } finally { w.done(); }
});

test('an item and a place named so carry theirs; an unknown name gets the fallback, never "no record"', () => {
  const w = world(atHaunt());
  try {
    const item = w.cli('look', '--said=说说雷击木', '--for=ling');
    assert.equal(item.about.item, 'leijimu');
    assert.ok(item.about.about, 'its description in words');
    assert.equal(w.cli('look', '--said=说说雷泽：舜在这里做过什么？', '--for=ling').about.place, 'leize');
    const none = w.cli('look', '--said=说说烛龙：它睁眼时如何？', '--for=ling');
    assert.equal(none.about, undefined);
    assert.ok(none.then.endsWith(THEN_ABOUT_NONE));
    assert.match(THEN_ABOUT_NONE, /山海经/);
    assert.match(THEN_ABOUT_NONE, /Never say there is no record/);
    assert.match(THEN_ABOUT_NONE, /never point at the page/);
  } finally { w.done(); }
});

test('the page\'s own Look (no --for) carries neither', () => {
  const w = world(atHaunt());
  try {
    const page = w.cli('look', '--said=说说雷神');
    assert.equal(page.about, undefined);
    assert.ok(!String(page.then).includes('问询'));
  } finally { w.done(); }
});

test('[scene] won: the finish and the spoils from the settle\'s record, told once', () => {
  const w = world(atHaunt());
  try {
    const started = w.cli('duel', '--id=haunt:jingwei');
    assert.ok(started.ok, JSON.stringify(started));
    const { actions, outcome } = picksFor(started.duel.setup);
    assert.equal(outcome, 'won');
    const settled = w.cli('duel', '--id=haunt:jingwei', `--picks=${actions.join(',')}`);
    assert.equal(settled.outcome, 'won');
    // The record the bout is told from: the settle, logged with the fight it began from.
    const log = fs.readFileSync(path.join(w.data, 'log.jsonl'), 'utf8');
    assert.ok(log.includes('"verb":"duel"') && log.includes('"picks"'));
    const r = w.cli('look', '--said=[scene] won haunt:jingwei', '--for=ling');
    assert.equal(r.bout.outcome, 'won');
    assert.equal(r.bout.name, '精卫');
    assert.ok(r.bout.turns > 0);
    assert.ok(r.bout.last.length >= 2 && r.bout.last.length <= 3);
    assert.ok(r.bout.last.every(l => !/\d/.test(l)), 'no numbers in the words');
    assert.deepEqual(r.bout.dropped, (settled.dropped ?? []).map(d => d.name).filter(Boolean));
    assert.ok(r.then.startsWith(THEN_BOUT) || r.then.includes(THEN_BOUT));
    assert.match(THEN_BOUT, /Never Show a card `stage` already lists/);
    assert.match(THEN_BOUT, /never a number/);
    assert.ok(w.saved().guided.bout, 'the bout told is kept on the save');
    assert.ok(!fs.readFileSync(path.join(w.data, 'log.jsonl'), 'utf8').includes('"bout"'), 'never logged: Undo takes back moves');
    assert.equal(w.cli('look', '--said=[scene] won haunt:jingwei', '--for=ling').bout, undefined, 'once');
    assert.equal(w.cli('look', '--for=ling').bout, undefined, 'not on a later Look');
  } finally { w.done(); }
});

test('[scene] lost / withdrew carry their outcome; no record (an old save) gets the plain then', () => {
  const w = world(atHaunt());
  try {
    const started = w.cli('duel', '--id=haunt:jingwei');
    const { actions, outcome } = picksFor(started.duel.setup, true);
    assert.ok(['lost', 'withdrew'].includes(outcome), outcome);
    w.cli('duel', '--id=haunt:jingwei', `--picks=${actions.join(',')}`);
    const r = w.cli('look', `--said=[scene] ${outcome} haunt:jingwei`, '--for=ling');
    assert.equal(r.bout.outcome, outcome);
    assert.deepEqual(r.bout.dropped, []);
    assert.ok(r.then.includes(THEN_BOUT));
  } finally { w.done(); }
  const old = world({ ...atHaunt(), duels: { kui: { day: '2026-10-05', outcome: 'withdrew' } } });
  try {
    const r = old.cli('look', '--said=[scene] withdrew haunt:kui', '--for=ling');
    assert.equal(r.bout.outcome, 'withdrew');
    assert.equal(r.bout.last, undefined);
    assert.ok(r.then.includes(THEN_BOUT_BARE));
    assert.match(THEN_BOUT_BARE, /never invent/);
  } finally { old.done(); }
  // A board's win is not a fight.
  const board = world(atHaunt());
  try { assert.equal(board.cli('look', '--said=[scene] won alchemy-first', '--for=ling').bout, undefined); } finally { board.done(); }
});
