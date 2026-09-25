// page-did: the page hands Ling facts, never sentences in the chat. The
// status line and her note are pure; latest.sh hands the note over once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importStatus, importNote, pageDidLine, paymentState, PAY_STATES } from '../scripts/page-did.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const LATEST = join(HERE, '..', 'scripts', 'latest.sh');
const CFO_JS = readFileSync(join(HERE, '..', 'scripts', 'cfo.js'), 'utf8');

test('PD1 status is counts, no voice', () => {
  assert.equal(importStatus({ files: 1, added: 42, dup: 3 }), 'Imported — 42 new, 3 already on file.');
  assert.equal(importStatus({ files: 2, added: 0, dup: 9, failed: ['x.pdf'] }), "Imported 2 statements — 0 new, 9 already on file · couldn't read x.pdf.");
});

test('PD2 note names file, account and rows', () => {
  const n = importNote([{ file: 'visa.csv', label: 'Visa', added: 1, dup: 0 }], ['a.csv']);
  assert.equal(n, 'imported visa.csv → Visa: 1 new transaction; skipped (no account chosen): a.csv');
});

test('PD3 the page never writes an assistant message', () => {
  assert.doesNotMatch(CFO_JS, /addMessage\?\.\('assistant'/);
});

const run = (dir) => execFileSync('bash', [LATEST], { env: { ...process.env, SKILL_DIR: dir }, encoding: 'utf8' });
const skill = () => { const d = mkdtempSync(join(tmpdir(), 'cfo-latest-')); mkdirSync(join(d, 'data')); return d; };

test('PD4 latest.sh: report alone, then with page_did once', () => {
  const d = skill();
  assert.deepEqual(JSON.parse(run(d)), {});
  writeFileSync(join(d, 'data', 'report.json'), JSON.stringify({ totals: { spend: 10 } }));
  assert.deepEqual(JSON.parse(run(d)), { totals: { spend: 10 } });
  writeFileSync(join(d, 'data', 'page-did.jsonl'), pageDidLine('import', 'imported a.csv', 't1') + pageDidLine('undo', 'reverted a.csv', 't2'));
  const once = JSON.parse(run(d));
  assert.deepEqual(once.page_did.map((e) => e.verb), ['import', 'undo']);
  assert.equal(once.totals.spend, 10);
  assert.equal(existsSync(join(d, 'data', 'page-did.jsonl')), false);
  assert.equal(JSON.parse(run(d)).page_did, undefined, 'told once');
});

test('PD5 latest.sh: notes with no report', () => {
  const d = skill();
  writeFileSync(join(d, 'data', 'page-did.jsonl'), pageDidLine('undo', 'reverted a.csv', 't'));
  assert.deepEqual(JSON.parse(run(d)), { page_did: [{ at: 't', verb: 'undo', what: 'reverted a.csv' }] });
});

test('PD6 payment state is one table', () => {
  const today = '2026-09-20';
  assert.equal(paymentState({ missed_in_data: true, next_expected: '2026-09-01' }, today), 'missed');
  assert.equal(paymentState({ next_expected: '2026-09-10', data_through: '2026-09-05' }, today), 'unknown');
  assert.equal(paymentState({ next_expected: '2026-09-30' }, today), 'next');
  assert.equal(paymentState({ next_expected: '2026-09-10', data_through: '2026-09-15' }, today), 'ok');
  assert.equal(PAY_STATES.missed.cls, 'warn');
});
