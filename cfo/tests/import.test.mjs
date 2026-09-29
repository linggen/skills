// Import: rows already on file (by id, or merchant-blind when the merchant text
// changed) and the account a name-only file lands on. fixtures/import/cases.json
// is shared with linggen-mobile (test/cfo/import_cases_test.dart answers the
// same cases), so the Mac and the phone dedup and resolve alike.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toLedgerRows, mergeLedger, mergeImport, idsToRevert } from '../scripts/ledger.js';
import { bestAccountMatch, labelFromFilename, guessType } from '../scripts/accounts.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CASES = JSON.parse(readFileSync(join(HERE, 'fixtures', 'import', 'cases.json'), 'utf8'));

// Each statement on file lands as its own import, in order.
const ledgerOf = (statements, account = 'acct') =>
  statements.reduce((rows, s) => mergeLedger(rows, toLedgerRows(s, account)).merged, []);

for (const c of CASES.merge) {
  test(`merge: ${c.name}`, () => {
    const incoming = toLedgerRows(c.incoming, c.incoming_account || 'acct');
    const { added } = mergeLedger(ledgerOf(c.on_file), incoming);
    assert.deepEqual(added.map((r) => r.merchant), c.expect.added);
  });
}

for (const c of CASES.accounts) {
  test(`account: ${c.name}`, () => {
    assert.equal(bestAccountMatch(c.filename, c.accounts, c.kind, c.fingerprint), c.expect.match);
    assert.equal(labelFromFilename(c.filename), c.expect.label);
    assert.equal(guessType(c.filename, c.kind), c.expect.type);
  });
}

// Undo keys on ids: a re-import after the cleaner changed records the rows it
// carried by their ids on file, so it holds them like any overlapping import.
const oldText = [
  { date: '2026-08-03', merchant: 'SQ *BLUE BOTTLE #12', amount: -6.5 },
  { date: '2026-08-05', merchant: 'AMZN MKTP CA*1A2B3', amount: -40 },
];
const newText = [
  { date: '2026-08-03', merchant: 'Blue Bottle', amount: -6.5 },
  { date: '2026-08-05', merchant: 'Amazon', amount: -40 },
  { date: '2026-08-07', merchant: 'Shell', amount: -30 },
];

test('a re-import records the rows it carried by their ids on file', () => {
  const first = mergeImport([], toLedgerRows(oldText, 'acct'));
  const again = mergeImport(first.merged, toLedgerRows(newText, 'acct'));
  assert.deepEqual(again.fresh.map((r) => r.merchant), ['Shell']);
  assert.deepEqual(again.ids.slice(0, 2), first.fresh.map((r) => r.id));
  const log = [
    { id: 'old', added_ids: first.fresh.map((r) => r.id), row_ids: first.ids },
    { id: 'new', added_ids: again.fresh.map((r) => r.id), row_ids: again.ids },
  ];
  assert.deepEqual(idsToRevert(log, 'old'), [], 'the re-import still holds the old rows');
  assert.deepEqual(idsToRevert(log, 'new'), [again.fresh[0].id], 'undoing it takes only its new row');
});

test('re-importing a reverted statement after the cleaner changed lifts the old tombstones', () => {
  const first = mergeImport([], toLedgerRows(oldText, 'acct'));
  const deleted = new Set(first.fresh.map((r) => r.id));
  const again = mergeImport(first.merged, toLedgerRows(newText, 'acct'), (id) => deleted.has(id));
  assert.equal(again.added.length, 1);
  assert.deepEqual(again.restored.map((r) => r.id), first.fresh.map((r) => r.id));
  assert.equal(again.fresh.length, 3);
});
