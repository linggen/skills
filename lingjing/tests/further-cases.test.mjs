// tests/further-cases.test.mjs — the owner of the cases that hold SKILL.md's `cloud.further` to ONE answer.
//
// Which of two saves is further on is declared once (SKILL.md `cloud.further`) and read by two interpreters: the phone
// (linggen-mobile lib/services/lingjing/lingjing_further.dart) and the Mac's engine
// (linggen crates/linggen-engine/src/account/cloud_save/further.rs). tests/further-cases.json is the cases both run —
// two saves, the winner, one line of why. THIS file is the owner; the phone and the engine each hold a copy that must
// be byte for byte the same, and each repo's test pins the same sha256.
//
// To change a case: edit tests/further-cases.json, run both suites' copies in (linggen-mobile
// test/fixtures/lingjing_further_cases.json, linggen crates/linggen-engine/src/account/cloud_save/further/
// further-cases.json), and set the pin in all three tests (this one, the phone's lingjing_further_cases_test.dart, the
// engine's further/cases.rs). The pin is what holds the copies together with no sibling checkout (CI has none).
// When the siblings ARE checked out beside this repo, they are compared too: an extra check, never the proof.
//
// The file's rule is SKILL.md's, resolved as the phone is shipped it (tools/further.mjs): this test fails when the
// declaration moves and the cases do not (regenerate the `rule` object from `node tools/further.mjs`).
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newest, resolved } from '../tools/further.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OWNER = path.join(HERE, 'further-cases.json');
const PINNED = '9730cdfee72c1531490c570821e3576394c67436650bc6e6b8cd18e6074ce16d';

const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

test('the owner\'s file is the pinned one: the phone and the engine pin the same digest', () => {
  assert.equal(sha(OWNER), PINNED, 'further-cases.json changed: copy it to linggen-mobile and linggen, and set the pin in all three tests');
});

test('the cases\' rule is the one SKILL.md declares now', () => {
  const doc = JSON.parse(fs.readFileSync(OWNER, 'utf8'));
  const { ignore: _ignore, ...further } = resolved();
  assert.deepEqual(doc.rule.further, further, 'SKILL.md cloud.further moved: regenerate `rule.further` from `node tools/further.mjs` and re-run the cases on both sides');
  assert.deepEqual(doc.rule.newest, newest(resolved()));
});

test('every case names a winner, a reason, and a side the rule can read', () => {
  const doc = JSON.parse(fs.readFileSync(OWNER, 'utf8'));
  const names = new Set();
  for (const c of doc.cases) {
    assert.ok(!names.has(c.name), `a case name twice: ${c.name}`);
    names.add(c.name);
    assert.ok(['here', 'there', 'tie'].includes(c.winner), c.name);
    assert.ok(typeof c.why === 'string' && c.why.length > 0, `${c.name}: why`);
    for (const side of [c.here, c.there]) {
      assert.ok(side === null || typeof side === 'string' || (typeof side === 'object' && !Array.isArray(side)), c.name);
    }
  }
  assert.ok(doc.cases.length > 30);
});

// The siblings, when they are checked out beside this repo (../linggen, ../linggen-mobile): an extra, never the proof.
const SIBLINGS = {
  'linggen': 'crates/linggen-engine/src/account/cloud_save/further/further-cases.json',
  'linggen-mobile': 'test/fixtures/lingjing_further_cases.json',
};
for (const [repo, rel] of Object.entries(SIBLINGS)) {
  const copy = path.resolve(HERE, '../../..', repo, rel);
  test(`the sibling ${repo}, when checked out, holds the same file`, { skip: fs.existsSync(copy) ? false : `no ${repo} checkout beside this one` }, () => {
    assert.equal(sha(copy), sha(OWNER));
  });
}
