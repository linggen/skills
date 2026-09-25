// The composed first view: at most three cards, the most urgent first, their
// pin and hide beat Ling's lead, Ling's lead beats the rules. The cases file
// is the one truth linggen-mobile's cfo_compose.dart is held to as well.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compose, layoutOf, focusRefusal, MAX_CARDS } from '../scripts/compose.js';
import { Register } from '../scripts/lww.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CASES = JSON.parse(readFileSync(join(HERE, 'fixtures', 'compose', 'cases.json'), 'utf8'));

for (const c of CASES) {
  test(`CP ${c.name}`, () => {
    const v = compose(c.report, c.layout);
    assert.deepEqual({ brief: v.brief, focus: v.focus ? { id: v.focus.id, by: v.focus.by } : null, attention: v.attention.map((i) => i.id), more: v.more }, c.expect);
    assert.ok((v.brief ? 1 : 0) + (v.focus ? 1 : 0) + v.attention.length <= MAX_CARDS);
  });
}

test('CP layout cells round-trip through the register', () => {
  const reg = new Register('mac-t', null);
  reg.set('lay:pin', 'trends');
  reg.set('lay:hide:brief', true);
  reg.set('lay:hide:budgets', true);
  reg.remove('lay:hide:budgets');
  reg.set('lay:focus', { id: 'subscriptions', why: 'Netflix went up' });
  assert.deepEqual(layoutOf(reg), { pin: 'trends', hides: ['brief'], focus: { id: 'subscriptions', why: 'Netflix went up' } });
});

test('CP her lead is refused by their pin or hide', () => {
  const report = CASES.find((c) => c.name.startsWith('quiet month: rules')).report;
  assert.equal(focusRefusal(report, { pin: 'trends' }, 'budgets'), 'they pinned trends');
  assert.equal(focusRefusal(report, { hides: ['budgets'] }, 'budgets'), 'budgets: they set it aside');
  assert.equal(focusRefusal(report, {}, 'budgets'), null);
  assert.match(focusRefusal(report, {}, 'pizza'), /unknown card/);
});

test('CP focus.js writes lay:focus into the register', () => {
  const d = mkdtempSync(join(tmpdir(), 'cfo-focus-'));
  mkdirSync(join(d, 'data'));
  const report = CASES.find((c) => c.name.startsWith('quiet month: rules')).report;
  writeFileSync(join(d, 'data', 'report.json'), JSON.stringify(report));
  const run = (...a) => JSON.parse(execFileSync('node', [join(HERE, '..', 'scripts', 'focus.js'), ...a], { env: { ...process.env, SKILL_DIR: d }, encoding: 'utf8' }));
  assert.deepEqual(run('view').first_view.focus, { id: 'budgets', by: 'rules', why: '' });
  const set = run('agent', 'commitments', 'the', 'mortgage', 'renews');
  assert.equal(set.ok, true);
  assert.deepEqual(set.first_view.focus, { id: 'commitments', by: 'ling', why: 'the mortgage renews' });
  const reg = JSON.parse(readFileSync(join(d, 'data', 'edits.json'), 'utf8'));
  assert.deepEqual(reg.reg['lay:focus'].v, { id: 'commitments', why: 'the mortgage renews' });
  assert.equal(run('agent', 'none').first_view.focus.by, 'rules');
});
