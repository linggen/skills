#!/usr/bin/env node
// run-lww.mjs — the edit register: LWW ordering, symmetric merge, the
// projections the page reads, and the one-time migration off the legacy files.
//
//   node tests/run-lww.mjs
//
// The register is the half of CFO that syncs, so the properties that matter are
// convergence properties: merge must be order-independent, idempotent, and must
// not resurrect a removal. Everything here is pure — no daemon, no files.

import {
  Register,
  LwwEntry,
  overridesOf,
  budgetsOf,
  commitmentsOf,
  accountsOf,
  correctionOf,
  isDeleted,
  activeRows,
  seedFromLegacy,
} from '../scripts/lww.js';

let pass = 0, fail = 0;
const t = (name, ok, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Registers are Maps: two equal registers can differ in key ORDER, which
// JSON.stringify would report as a difference. Compare canonically.
const canon = (reg) => JSON.stringify(Object.fromEntries(Object.entries(reg).sort(([a], [b]) => a.localeCompare(b))));
const sameReg = (a, b) => canon(a) === canon(b);

// ── Cells ──────────────────────────────────────────────────────────────────
{
  const reg = new Register('A');
  reg.set('bud:dining', 400);
  t('a written cell reads back', reg.get('bud:dining') === 400);
  t('an unwritten key is undefined', reg.get('bud:travel') === undefined);

  reg.remove('bud:dining');
  t('a removal is a tombstone, not an absence', reg.get('bud:dining') === null && reg.has('bud:dining'));
  t('tombstones stay out of projections', eq(budgetsOf(reg), {}));

  const ts = [];
  const frozen = new Register('A');
  for (let i = 0; i < 3; i++) { frozen.set(`k${i}`, i, 0); ts.push(frozen.cells.get(`k${i}`).ts); }
  t('the local clock strictly increases', ts[0] < ts[1] && ts[1] < ts[2]);

  const back = new Register('A');
  back.stamp(5000);
  back.stamp(1000); // wall clock jumped backwards
  t('a backwards wall clock never rewinds the stamp', back.lastTs === 5001);

  t('same ms, device id breaks the tie',
    new LwwEntry(1, 10, 'B').newerThan(new LwwEntry(2, 10, 'A')) &&
    !new LwwEntry(1, 10, 'A').newerThan(new LwwEntry(2, 10, 'B')));
}

// ── Merge ──────────────────────────────────────────────────────────────────
{
  // Two devices, disjoint edits: both sides end up with both.
  const mac = new Register('mac');
  const phone = new Register('phone');
  mac.set('ov:uber eats', 'dining');
  phone.set('bud:groceries', 500);
  const macState = mac.toState(), phoneState = phone.toState();
  mac.mergeState(phoneState);
  phone.mergeState(macState);
  t('disjoint edits survive on both sides',
    eq(overridesOf(mac), overridesOf(phone)) && eq(budgetsOf(mac), budgetsOf(phone)) &&
    mac.get('bud:groceries') === 500 && phone.get('ov:uber eats') === 'dining');

  // Same key, different values: the later edit wins, whichever way it merges.
  const a = new Register('a'), b = new Register('b');
  a.set('bud:dining', 300);
  b.cells.set('bud:dining', new LwwEntry(400, a.cells.get('bud:dining').ts + 10, 'b'));
  const a2 = new Register('a', a.toState()), b2 = new Register('b', b.toState());
  a2.mergeState(b.toState());
  b2.mergeState(a.toState());
  t('the later edit wins in both directions', a2.get('bud:dining') === 400 && b2.get('bud:dining') === 400);

  // Merge order must not matter, and merging twice must change nothing.
  const seed = () => {
    const r = new Register('x');
    r.cells.set('ov:shell', new LwwEntry('transport', 100, 'x'));
    r.cells.set('bud:dining', new LwwEntry(200, 300, 'x'));
    return r;
  };
  const other = new Register('y');
  other.cells.set('ov:shell', new LwwEntry('travel', 200, 'y'));
  other.cells.set('cat:abc', new LwwEntry('groceries', 50, 'y'));
  const once = seed(); once.mergeState(other.toState());
  const twice = seed(); twice.mergeState(other.toState()); twice.mergeState(other.toState());
  const reversed = new Register('y', other.toState()); reversed.mergeState(seed().toState());
  t('merge is idempotent', sameReg(once.toState().reg, twice.toState().reg));
  t('merge is order-independent', sameReg(once.toState().reg, reversed.toState().reg));

  // The one that bites without tombstones: a removal must not come back.
  const macDel = new Register('mac');
  macDel.set('bud:dining', 400);
  const stale = new Register('phone', macDel.toState()); // phone synced, still holds it
  macDel.remove('bud:dining'); // then the Mac removes it
  stale.mergeState(macDel.toState());
  t('a removal is not resurrected by a peer that still holds the value', stale.get('bud:dining') === null);

  // A merged-in future timestamp must not let the next local edit tie with it.
  const local = new Register('local');
  const future = new Register('far');
  future.cells.set('bud:x', new LwwEntry(1, Date.now() + 60_000, 'far'));
  local.mergeState(future.toState());
  local.set('bud:x', 2);
  t('a local edit after merging a future stamp still wins', local.get('bud:x') === 2);
}

// ── Projections ────────────────────────────────────────────────────────────
{
  const reg = new Register('A');
  reg.set('ov:uber eats', 'dining');
  reg.set('bud:dining', 400);
  reg.set('com:MORTGAGE ABC BANK|balance', 320000);
  reg.set('com:MORTGAGE ABC BANK|rate_pct', 4.5);
  reg.set('acc:acct_1|label', 'Chase Visa');
  reg.set('acc:acct_1|type', 'credit');
  reg.set('cat:row1', 'groceries');
  reg.set('del:row2', true);

  t('overrides project', eq(overridesOf(reg), { 'uber eats': 'dining' }));
  t('budgets project', eq(budgetsOf(reg), { dining: 400 }));
  t('commitment terms group by merchant key',
    eq(commitmentsOf(reg), { 'MORTGAGE ABC BANK': { balance: 320000, rate_pct: 4.5 } }));
  t('account fields group by id', eq(accountsOf(reg), { acct_1: { label: 'Chase Visa', type: 'credit' } }));

  const rows = [
    { id: 'row1', merchant: 'NO FRILLS', amount: -20, category: null },
    { id: 'row2', merchant: 'OOPS', amount: -99, category: null },
    { id: 'row3', merchant: 'JOE PIZZA', amount: -35, category: null },
  ];
  const active = activeRows(reg, rows);
  t('a reverted row drops out', active.length === 2 && !active.some((r) => r.id === 'row2'));
  t('a correction applies to its row', active.find((r) => r.id === 'row1').category === 'groceries');
  t('an untouched row is passed through unchanged', active.find((r) => r.id === 'row3') === rows[2]);
  t('isDeleted / correctionOf read the cells', isDeleted(reg, 'row2') && correctionOf(reg, 'row1') === 'groceries');

  // Cleared correction: authoritative "no correction", NOT a fallback to the
  // category sitting in the ledger file.
  const cleared = new Register('A');
  cleared.set('cat:row1', null);
  const legacy = [{ id: 'row1', merchant: 'NO FRILLS', amount: -20, category: 'dining' }];
  t('a cleared correction beats the category in the file',
    activeRows(cleared, legacy)[0].category === null);
  t('an untouched row keeps the file category',
    activeRows(new Register('A'), legacy)[0].category === 'dining');
}

// ── Migration off the legacy files ─────────────────────────────────────────
{
  const reg = seedFromLegacy(new Register('mac'), {
    overrides: { 'uber eats': 'dining', shell: 'transport' },
    budgets: { dining: 400, travel: 0 }, // a 0 cap is "no budget", not a cap
    commitments: { 'MORTGAGE ABC BANK': { balance: 320000, rate_pct: 4.5, renewal_date: '' } },
    accounts: { acct_1: { label: 'Chase Visa', type: 'credit' } },
    rows: [
      { id: 'r1', category: 'groceries' }, // a correction made before the register
      { id: 'r2', category: null }, // never corrected
    ],
  });

  t('rules migrate', eq(overridesOf(reg), { 'uber eats': 'dining', shell: 'transport' }));
  t('a zero cap does not migrate as a budget', eq(budgetsOf(reg), { dining: 400 }));
  t('empty terms do not migrate',
    eq(commitmentsOf(reg), { 'MORTGAGE ABC BANK': { balance: 320000, rate_pct: 4.5 } }));
  t('accounts migrate', eq(accountsOf(reg), { acct_1: { label: 'Chase Visa', type: 'credit' } }));
  t('a row category migrates as a correction, an untouched row does not',
    correctionOf(reg, 'r1') === 'groceries' && correctionOf(reg, 'r2') === undefined);

  // Round-trip through the file shape.
  const reloaded = new Register('mac', JSON.parse(JSON.stringify(reg.toState())));
  t('the register round-trips through JSON', sameReg(reloaded.toState().reg, reg.toState().reg));
}

console.log(`\n${fail ? '❌' : '✅'} ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
