// page-did.js — what the page did, as facts: the status line the person sees
// and the note Ling reads on her next turn (data/page-did.jsonl, handed over
// once by latest.sh as `page_did`). Code never words a chat message; these
// are facts, and she writes the words. Pure — tests/page-did.test.mjs.

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/// The status line after an import batch: counts only.
export function importStatus({ files, added, dup, skipped = [], failed = [] }) {
  const parts = [`Imported ${files > 1 ? `${files} statements` : ''}`.trim() + ` — ${added} new`];
  if (dup) parts[0] += `, ${dup} already on file`;
  if (skipped.length) parts.push(`skipped ${skipped.join(', ')} (no account)`);
  if (failed.length) parts.push(`couldn't read ${failed.join(', ')}`);
  return parts.join(' · ') + '.';
}

/// The note for Ling: which files, which accounts, how many rows.
export function importNote(ok, skipped = [], failed = []) {
  const each = ok.map((r) => `${r.file} → ${r.label}: ${plural(r.added, 'new transaction')}${r.dup ? `, ${r.dup} already on file` : ''}`);
  const tail = [
    skipped.length ? `skipped (no account chosen): ${skipped.join(', ')}` : '',
    failed.length ? `unreadable: ${failed.join(', ')}` : '',
  ].filter(Boolean);
  return `imported ${each.join('; ')}${tail.length ? `; ${tail.join('; ')}` : ''}`;
}

/// One JSONL line of the page's log.
export const pageDidLine = (verb, what, at) => JSON.stringify({ at, verb, what }) + '\n';

/// A card's payment state against today — one table, no if-chain in the
/// renderer. `missed` wins; then "expected but the data stops before it";
/// then "next"; else on track.
export const PAY_STATES = {
  missed: { cls: 'warn', badge: (p) => `⚠ no payment seen around ${p.next_expected}` },
  unknown: { cls: 'unknown', badge: (p) => `◌ expected ~${p.next_expected} — import your latest statement to check` },
  next: { cls: 'ok', badge: (p) => `⏳ next ~${p.next_expected}` },
  ok: { cls: 'ok', badge: () => '✓ on track' },
};
const PAY_RULES = [
  ['missed', (p) => !!p.missed_in_data],
  ['unknown', (p, today) => !!p.next_expected && today >= p.next_expected && (!p.data_through || p.data_through < p.next_expected)],
  ['next', (p, today) => !!p.next_expected && today < p.next_expected],
];
export function paymentState(p, today) {
  const hit = PAY_RULES.find(([, test]) => test(p, today));
  return hit ? hit[0] : 'ok';
}
