// The play log is bounded (rules/log.mjs): trimmed once it passes a size, a fight's marks slimmed to the first and the
// newest of a run — and what reads it (Undo, the fight's settle for Ling's Look) is the same after it.
import { lookahead } from '../scripts/fightline.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { act, begin, foeTurn, tokenOf } from '../scripts/battle.js';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { THEN_BOUT, THEN_BOUT_BARE } from '../scripts/rules/inquiry.mjs';
import { LOG_CAP, appendLog, markOf, slimMarks, trimLog } from '../scripts/rules/log.mjs';
import { TO_OPEN, walk } from './prologue.mjs';

const content = loadContent();
const NOW = new Date('2026-10-05T10:00:00-03:00');
const ROOT = path.resolve(import.meta.dirname, '..');
const catalog = Object.fromEntries(content.cards.cards.map(x => [x.id, x]));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lingjing-logcap-'));
const rm = d => fs.rmSync(d, { recursive: true, force: true });

/* `n` valid log lines, each about `kb` KB, numbered. */
const junk = (n, kb, from = 0) => Array.from({ length: n }, (_, i) =>
  JSON.stringify({ at: NOW.toISOString(), verb: 'move', args: { n: from + i }, before: { pad: 'x'.repeat(kb * 1024) } }) + '\n').join('');
const linesOf = file => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);

function world(state) {
  const data = tmp();
  fs.writeFileSync(path.join(data, 'state.json'), JSON.stringify(state));
  const env = { ...process.env, LINGJING_DATA: data, LINGJING_QUESTS: path.join(data, 'none'), LINGJING_NOW: NOW.toISOString(), LINGGEN_SESSION_ID: 's1' };
  const cli = (...args) => JSON.parse(spawnSync(process.execPath, ['scripts/rules.mjs', ...args], { cwd: ROOT, env, encoding: 'utf8' }).stdout);
  return { data, cli, log: path.join(data, 'log.jsonl'), saved: () => JSON.parse(fs.readFileSync(path.join(data, 'state.json'), 'utf8')), done: () => rm(data) };
}
function picksFor(setup) {
  const st = begin(setup, catalog), actions = [];
  for (let guard = 0; guard < 200 && st.outcome === 'open'; guard += 1) {
    if (st.whose === 'foe') { foeTurn(st); continue; }
    const a = lookahead(st);
    act(st, a, 'you');
    actions.push(tokenOf(a));
  }
  return { actions, outcome: st.outcome };
}
const ROAD_HAND = ['niangbing', 'yijian', 'tuna', 'mucao', 'zheng', 'huiqi', 'huoya', 'huodan', 'bingzhui', 'jinren', 'tuqiang', 'mutang', 'yangzhen', 'houtu', 'luying', 'suijin', 'zhennu', 'ruxi'];
const atHaunt = () => ({ ...walk(newState(content, 'zh', NOW), TO_OPEN, content, NOW), chapter: '01-ji', scene: null, place: 'fuli', tier: 'core', step: 0, progress: 0, stamina: 50, cards: ROAD_HAND, wear: { weapon: 'huochai-jian' }, bag: { 'huochai-jian': 1 }, updated: NOW.toISOString() });

test('a 30 MB log is trimmed to its newest lines, valid, fast', () => {
  const dir = tmp(), file = path.join(dir, 'log.jsonl');
  try {
    for (let i = 0; i < 6; i += 1) fs.appendFileSync(file, junk(150, 40, i * 150)); // 900 lines × 40 KB ≈ 36 MB
    const all = fs.statSync(file).size;
    assert.ok(all > 30 * 1024 * 1024, `${all}`);
    const lastLine = linesOf(file).at(-1);
    const t0 = process.hrtime.bigint();
    assert.equal(trimLog(file), true);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    console.log(`# trim of ${(all / 1048576).toFixed(1)} MB took ${ms.toFixed(0)} ms`);
    assert.ok(ms < 1500, `${ms} ms`);
    const kept = linesOf(file);
    assert.ok(fs.statSync(file).size <= LOG_CAP.keepBytes + 1);
    assert.ok(kept.length <= LOG_CAP.keepLines && kept.length > 50, `${kept.length}`);
    for (const l of kept) JSON.parse(l);
    assert.equal(kept.at(-1), lastLine, 'the newest line is the same');
    assert.equal(JSON.parse(kept.at(-2)).args.n, 898, 'whole lines in order, newest last');
    assert.equal(fs.readdirSync(dir).length, 1, 'no tmp file left');
    assert.equal(trimLog(file), false, 'under the threshold: left alone');
  } finally { rm(dir); }
});

test('a small log is never touched; a trim that fails leaves the old file and throws nothing', () => {
  const dir = tmp(), file = path.join(dir, 'log.jsonl');
  try {
    fs.writeFileSync(file, junk(20, 40));
    const was = fs.statSync(file);
    assert.equal(trimLog(file), false);
    assert.equal(fs.statSync(file).mtimeMs, was.mtimeMs);
    assert.equal(trimLog(path.join(dir, 'none.jsonl')), false, 'no file');
    // Over the line but unreadable as a file: a directory where the log should be.
    const odd = path.join(dir, 'odd');
    fs.mkdirSync(odd);
    assert.equal(trimLog(odd, { trimAt: 0, keepBytes: 10, keepLines: 1 }), false);
    assert.ok(fs.statSync(odd).isDirectory());
    // …and the rename failing after the read: the directory is read-only (skipped where it does not stop the owner).
    fs.writeFileSync(file, junk(30, 40));
    fs.chmodSync(dir, 0o555);
    let stopped = true;
    try { fs.writeFileSync(path.join(dir, 'probe'), ''); stopped = false; fs.rmSync(path.join(dir, 'probe')); } catch { /* read-only holds */ }
    const before = fs.readFileSync(file, 'utf8');
    assert.equal(trimLog(file, { trimAt: 1024, keepBytes: 100 * 1024, keepLines: 2 }), !stopped);
    fs.chmodSync(dir, 0o755);
    if (stopped) assert.equal(fs.readFileSync(file, 'utf8'), before, 'the old file stands');
  } finally { try { fs.chmodSync(dir, 0o755); } catch { /* gone */ } rm(dir); }
});

test('a run of one fight\'s marks keeps its first line and its newest; other lines and other fights are never taken', () => {
  const dir = tmp(), file = path.join(dir, 'log.jsonl');
  const mark = (id, n) => ({ at: NOW.toISOString(), verb: 'duel', args: { id, action: 'mark', picks: 'a,'.repeat(n) }, before: { fight: { picks: n - 1 }, pad: 'x'.repeat(2048) } });
  try {
    for (let n = 1; n <= 6; n += 1) appendLog(file, mark('haunt:a', n));
    let lines = linesOf(file).map(l => JSON.parse(l));
    assert.deepEqual(lines.map(e => e.before.fight.picks), [0, 5], 'the first mark, and the newest');
    appendLog(file, mark('haunt:b', 1));
    appendLog(file, mark('haunt:b', 2));
    appendLog(file, { at: NOW.toISOString(), verb: 'duel', args: { id: 'haunt:b', picks: 'a,b' }, before: { fight: { picks: 2 } } }); // the settle
    appendLog(file, mark('haunt:b', 3));
    lines = linesOf(file).map(l => JSON.parse(l));
    assert.deepEqual(lines.map(e => `${e.args.id}:${e.args.action ?? 'settle'}`), ['haunt:a:mark', 'haunt:a:mark', 'haunt:b:mark', 'haunt:b:mark', 'haunt:b:settle', 'haunt:b:mark']);
    assert.equal(markOf(JSON.stringify(lines[0])), 'haunt:a');
    assert.equal(markOf(JSON.stringify(lines[4])), null);
    // The trim slims a run the same way (an old install's 28 MB is mostly these).
    const old = Array.from({ length: 8 }, (_, i) => JSON.stringify(mark('haunt:c', i + 1))).concat(JSON.stringify(mark('haunt:d', 1)));
    assert.equal(slimMarks(old).length, 3);
  } finally { rm(dir); }
});

test('Undo restores the same saves after a trim as before it', () => {
  const play = () => {
    const w = world({});
    fs.rmSync(path.join(w.data, 'state.json'));
    w.cli('init');
    w.cli('look');
    w.cli('win', '--id=rain-basins', '--grade=dry');
    w.cli('task', '--action=done', '--id=rain-basins');
    w.cli('resolve', '--exit', 'begin');
    return w;
  };
  const plain = play(), padded = play();
  try {
    const own = linesOf(padded.log);
    assert.ok(own.length >= 3, `${own.length}`);
    fs.writeFileSync(padded.log, junk(220, 40) + own.join('\n') + '\n'); // 8.6 MB of older play before the real lines
    assert.ok(fs.statSync(padded.log).size > LOG_CAP.trimAt);
    padded.cli('look'); // the first call after the update trims
    assert.ok(fs.statSync(padded.log).size <= LOG_CAP.keepBytes + 1, 'trimmed');
    assert.ok(linesOf(padded.log).length >= own.length);
    for (const l of linesOf(padded.log)) JSON.parse(l);
    for (let i = 0; i < own.length; i += 1) {
      const a = plain.cli('undo'), b = padded.cli('undo');
      assert.deepEqual(b, a, `undo ${i}`);
      assert.deepEqual({ ...padded.saved(), run: 0 }, { ...plain.saved(), run: 0 }, `the save after undo ${i}`); // a play's run id is drawn fresh
    }
  } finally { plain.done(); padded.done(); }
});

test('a fight\'s marks: one line each at most, and Undo takes the newest back as it did', () => {
  const w = world(atHaunt());
  try {
    const started = w.cli('duel', '--id=haunt:longzhi');
    const { actions } = picksFor(started.duel.setup);
    assert.ok(actions.length >= 4);
    for (let n = 1; n <= 4; n += 1) assert.equal(w.cli('duel', '--id=haunt:longzhi', '--action=mark', `--picks=${actions.slice(0, n).join(',')}`).marked, n);
    const lines = linesOf(w.log).map(l => JSON.parse(l));
    const marks = lines.filter(e => e.args?.action === 'mark');
    assert.equal(marks.length, 2, 'the first and the newest');
    assert.deepEqual(marks.map(e => e.before.fight.picks?.length ?? 0), [0, 3]);
    assert.equal(w.saved().fight.picks.length, 4);
    assert.equal(w.cli('undo').undid, 'duel');
    assert.equal(w.saved().fight.picks.length, 3, 'the newest mark taken back to the one before, as before');
  } finally { w.done(); }
});

test('a fight settled lately is still told after a trim; one trimmed away is told bare, nothing throws', () => {
  const settle = () => {
    const w = world(atHaunt());
    const started = w.cli('duel', '--id=haunt:longzhi');
    const { actions, outcome } = picksFor(started.duel.setup);
    assert.equal(outcome, 'won');
    for (let n = 1; n <= 3; n += 1) w.cli('duel', '--id=haunt:longzhi', '--action=mark', `--picks=${actions.slice(0, n).join(',')}`);
    assert.equal(w.cli('duel', '--id=haunt:longzhi', `--picks=${actions.join(',')}`).outcome, 'won');
    return w;
  };
  const recent = settle();
  try {
    const own = fs.readFileSync(recent.log, 'utf8');
    fs.writeFileSync(recent.log, junk(220, 40) + own);
    const r = recent.cli('look', '--said=[scene] won haunt:longzhi', '--for=ling');
    assert.ok(fs.statSync(recent.log).size <= LOG_CAP.keepBytes + 1, 'trimmed on that call');
    assert.equal(r.bout.outcome, 'won');
    assert.ok(r.bout.last.length >= 2, 'told from the record');
    assert.ok(r.then.includes(THEN_BOUT));
  } finally { recent.done(); }
  const gone = settle();
  try {
    fs.appendFileSync(gone.log, junk(220, 40)); // a long while of play after it
    const r = gone.cli('look', '--said=[scene] won haunt:longzhi', '--for=ling');
    assert.ok(!linesOf(gone.log).some(l => l.includes('"picks"')), 'the settle is out of the log');
    assert.equal(r.bout.outcome, 'won');
    assert.equal(r.bout.last, undefined, 'no record: the plain telling');
    assert.ok(r.then.includes(THEN_BOUT_BARE));
  } finally { gone.done(); }
});

test('a scratch save keeps and trims its own log; the player\'s is untouched', () => {
  const w = world(atHaunt());
  try {
    w.cli('look');
    const real = fs.existsSync(w.log) ? fs.readFileSync(w.log, 'utf8') : null;
    const own = path.join(w.data, 'saves', 'test', 'log.jsonl');
    w.cli('init', '--save=test');
    w.cli('init', '--save=test'); // the second restart logs the save it replaces
    fs.writeFileSync(own, junk(220, 40) + fs.readFileSync(own, 'utf8'));
    w.cli('look', '--save=test');
    assert.ok(fs.statSync(own).size <= LOG_CAP.keepBytes + 1);
    assert.equal(w.cli('undo', '--save=test').ok, true);
    assert.equal(fs.existsSync(w.log) ? fs.readFileSync(w.log, 'utf8') : null, real);
  } finally { w.done(); }
});
