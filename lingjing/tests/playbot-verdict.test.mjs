// The play bot's review verdict (tools/playbot/verdict.mjs): every case of the two-tier review — Claude's sure
// pass / sure fail / unsure, Hanli's answers, the legacy files written before certainty, and the gate's line.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { derive, deriveDir, gateLine, noteState, blankReview } from '../tools/playbot/verdict.mjs';

const VERDICT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../tools/playbot/verdict.mjs');
const RUN = 'r1';
const clean = { run_id: RUN, findings: [{ kind: 'layout-warn', hard: false }] };
const done = (notes, extra = {}) => ({ run_id: RUN, verdict: 'pass', reviewer: 'claude', shots_total: 3, shots_answered: 3, notes, ...extra });
const sure = (shot, more = {}) => ({ shot, answer: 'fine', certainty: 'sure', ...more });
const unsure = (shot, more = {}) => ({ shot, answer: 'hmm', certainty: 'unsure', ask: '这行字在手机上看得清吗？', ...more });
const at = '2026-11-07T10:00:00Z';
const v = (review, findings = clean, expectedId) => derive({ review, findings, expectedId });

test('no review, or another run\'s review → pending', () => {
  assert.equal(v(null).verdict, 'pending');
  assert.equal(v(null).why, 'no-review');
  const d = v(done([]), clean, 'r2');
  assert.equal(d.verdict, 'pending');
  assert.equal(d.why, 'other-run');
  assert.match(gateLine(d)[1], /review\.json is for run r1, not r2/);
});

test('the expected id defaults to findings.json\'s run_id, matched exactly', () => {
  assert.equal(v(done([]), { run_id: 'r1 ' , findings: [] }).why, 'other-run');
  assert.equal(v(done([]), { run_id: RUN, findings: [] }).verdict, 'pass');
});

test('a fresh pack is pending', () => {
  const d = v(blankReview(RUN, 10));
  assert.equal(d.verdict, 'pending');
  assert.equal(d.why, 'claude-not-done');
  assert.equal(gateLine(d)[0], 'REVIEW');
});

test('a hard finding fails, whatever the review says — Hanli cannot clear it', () => {
  const hard = { run_id: RUN, findings: [{ kind: 'layout', hard: true }] };
  assert.equal(v(done([sure('a', { hanli: { ok: true, at } })]), hard).verdict, 'fail');
  assert.equal(v(done([sure('a', { hanli: { ok: true, at } })]), hard).why, 'hard-findings');
  assert.equal(v(blankReview(RUN, 3), hard).verdict, 'fail');
});

test('all sure, Claude done → pass without Hanli', () => {
  const d = v(done([sure('a'), sure('b')]));
  assert.equal(d.verdict, 'pass');
  assert.equal(gateLine(d)[0], 'PASS');
});

test('a shot with no note, counted as answered, is a sure pass', () => {
  assert.equal(v(done([sure('a')], { shots_total: 70, shots_answered: 70 })).verdict, 'pass');
});

test('Claude not done → pending: no reviewer, or shots short', () => {
  assert.equal(v(done([sure('a')], { reviewer: null })).why, 'claude-not-done');
  assert.equal(v(done([sure('a')], { shots_answered: 2 })).why, 'claude-not-done');
});

test('a sure fail fails at once — without waiting for Hanli, and before Claude is done', () => {
  assert.equal(v(done([sure('a', { fail: true })])).verdict, 'fail');
  assert.equal(v(done([sure('a', { fail: true }), unsure('b')])).verdict, 'fail');
  assert.equal(v(done([sure('a', { fail: true })], { shots_answered: 1 })).verdict, 'fail');
});

test('an unsure not yet answered → pending, the gate naming the shots', () => {
  const d = v(done([sure('shots/001.png'), unsure('shots/002.png'), unsure('shots/003.png')]));
  assert.equal(d.verdict, 'pending');
  assert.equal(d.why, 'waiting-for-hanli');
  assert.equal(d.waiting.length, 2);
  const [st, detail] = gateLine(d);
  assert.equal(st, 'REVIEW');
  assert.match(detail, /REVIEW PENDING — 2 items wait for Hanli: 002\.png, 003\.png/);
  assert.doesNotMatch(detail, /\t|\n/);
});

test('the gate lists at most five shots on one line', () => {
  const d = v(done(['1', '2', '3', '4', '5', '6', '7'].map((s) => unsure(`shots/${s}.png`)), { shots_total: 7, shots_answered: 7 }));
  assert.match(gateLine(d)[1], /7 items wait for Hanli: 1\.png, 2\.png, 3\.png, 4\.png, 5\.png, …/);
});

test('Hanli says ok to every unsure → pass', () => {
  const d = v(done([sure('a'), unsure('b', { hanli: { ok: true, at } })]));
  assert.equal(d.verdict, 'pass');
  assert.match(gateLine(d)[1], /1 answered by Hanli/);
});

test('Hanli says no to an unsure → fail', () => {
  const d = v(done([unsure('b', { hanli: { ok: false, said: '太小了', at } })]));
  assert.equal(d.verdict, 'fail');
  assert.equal(d.fails[0].by, 'hanli');
  assert.match(gateLine(d)[1], /b \(Hanli\): 太小了/);
});

test('Hanli overrules a sure fail → it passes; a sure pass he says no to → fail', () => {
  assert.equal(v(done([sure('a', { fail: true, hanli: { ok: true, at } })])).verdict, 'pass');
  assert.equal(v(done([sure('a', { hanli: { ok: false, at } })])).verdict, 'fail');
});

test('one unsure answered, one waiting → still pending', () => {
  assert.equal(v(done([unsure('a', { hanli: { ok: true, at } }), unsure('b')])).verdict, 'pending');
});

test('legacy files (no certainty anywhere): verdict as written', () => {
  const legacy = (verdict, extra = {}) => ({ run_id: RUN, verdict, reviewer: 'claude', shots_total: 70, shots_answered: 70, notes: [{ shot: 'a', answer: 'x' }], ...extra });
  assert.equal(v(legacy('pass')).verdict, 'pass');
  assert.equal(v(legacy('fail')).verdict, 'fail');
  assert.equal(v(legacy('fail')).why, 'reviewer-fail');
  assert.equal(v(legacy('pending')).verdict, 'pending');
  assert.equal(v(legacy('pass', { shots_answered: 18 })).verdict, 'pending');
  assert.equal(v(legacy('pending', { reviewer: null, shots_answered: 0 })).verdict, 'pending');
  assert.equal(v(legacy('pass')).legacy, true);
  // Hanli answering on a legacy file: his no fails it, his yes does not clear the reviewer's written fail.
  const hanli = (ok) => ({ notes: [{ shot: 'a', answer: 'x', hanli: { ok, at } }] });
  assert.equal(v(legacy('pass', hanli(false))).verdict, 'fail');
  assert.equal(v(legacy('fail', hanli(true))).verdict, 'fail');
  assert.equal(v(legacy('pass', hanli(true))).verdict, 'pass');
});

test('a missing certainty is sure; a fail flag on a sure note is the fail', () => {
  assert.deepEqual(noteState({ shot: 'a' }), { certainty: 'sure', hanli: null, result: 'pass', by: 'claude' });
  assert.equal(noteState({ shot: 'a', fail: true }).result, 'fail');
  assert.equal(noteState({ shot: 'a', certainty: 'unsure' }).result, 'waiting');
  assert.equal(noteState({ shot: 'a', certainty: 'unsure', hanli: { ok: 'yes' } }).result, 'waiting');
});

test('the cli prints the gate line from a report folder', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-verdict-'));
  fs.writeFileSync(path.join(dir, 'findings.json'), JSON.stringify(clean));
  fs.writeFileSync(path.join(dir, 'review.json'), JSON.stringify(done([unsure('shots/009.png')])));
  const r = spawnSync(process.execPath, [VERDICT, dir, RUN], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^REVIEW\tREVIEW PENDING — 1 items wait for Hanli: 009\.png/);
  assert.equal(deriveDir(dir).verdict, 'pending');
  fs.rmSync(dir, { recursive: true });
});
