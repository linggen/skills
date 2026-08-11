// ledger.js — the multi-account reconciliation engine. Pure functions, no I/O
// (the page reads/writes the year-partitioned JSONL via /api/bash). This is the
// deterministic layer that runs BEFORE the LLM: money math must be exact and
// private, so dedup + internal-transfer detection happen here, never in the model.
//
// Two problems it solves when several accounts (cards + checking) are merged:
//   1. Re-import / overlap duplicates  → dedup by stable txn id.
//   2. Internal transfers (the dangerous one) — your checking pays your cards,
//      so the card shows the purchases PLUS "payment received", and checking
//      shows "payment to card". Counting both double-counts spend. We detect the
//      transfer pair and exclude both from spend/income.

import { txnId } from './hash.js';
import { analyzeTransactions, keywordRe } from './analyze.js';

const daysBetween = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000);
const PAYMENT_RE = /\b(payment|autopay|auto pay|bill ?pay|e-?transfer|transfer|thank you|pymt)\b/i;
const REFUND_RE = /\b(refund|reversal|rebate|cash ?back|chargeback)\b/i;

// ── Single-row transfer signals ─────────────────────────────────────────────
// Cross-account pairing (in detectTransfers) only fires when BOTH accounts are
// imported. But money also leaves to accounts you DON'T track — paying an Amex
// you never imported, moving cash to savings at another bank. Those rows have no
// pair to match, so the only evidence is the description text. These are the
// universal (not bank-specific) signals; users extend them via the dropdown /
// Settings, which write config.category_overrides values of 'transfer'.
//
// Matched on WORD BOUNDARIES (keywordRe) so a short token like "tf" can never
// match inside a real merchant ("neTFlix") and erase real spend. Deliberately
// conservative: bare "e-transfer"/"interac" is NOT here — an e-transfer can be
// real spend (rent) or income, so we leave it for the user/agent to classify
// rather than guess and silently delete money.
const TRANSFER_VOCAB = [
  'tf', 'tfr', 'xfer', 'wire transfer', 'wire payment', 'funds transfer',
  'online transfer', 'account transfer', 'acct transfer', 'internal transfer',
  'bank transfer', 'transfer to', 'transfer from',
];
// Card networks / issuers. A debit FROM a deposit account to one of these is a
// credit-card bill payment (a transfer, not spend). Bank names count too:
// moving money to your own account at another bank is still a transfer.
const CARD_ISSUER_VOCAB = [
  'amex', 'american express', 'visa', 'mastercard', 'master card', 'discover',
  'rogers bk', 'rogers bank', 'pc mc', 'pc mastercard', 'capital one',
  'cibc', 'tangerine', 'neo financial', 'card payment',
];
const TRANSFER_RES = TRANSFER_VOCAB.map(keywordRe);
const CARD_ISSUER_RES = CARD_ISSUER_VOCAB.map(keywordRe);

// Does this single row read as a self-transfer / credit-card payment?
function transferSignal(row, account) {
  const m = row.merchant || '';
  if (TRANSFER_RES.some((re) => re.test(m))) return true;
  const type = (account?.type || '').toLowerCase();
  // Paying a credit-card bill from chequing/savings → debit to a card issuer.
  if ((type === 'checking' || type === 'savings') && row.amount < 0 && CARD_ISSUER_RES.some((re) => re.test(m))) return true;
  // The card side of that payment landing as a credit on a credit account.
  if (type === 'credit' && row.amount > 0 && PAYMENT_RE.test(m) && !REFUND_RE.test(m)) return true;
  return false;
}

// The user's own ruling on a row (from config.category_overrides), longest
// keyword wins. 'transfer' → force EXCLUDE; any category / 'income' → the user
// says it's real money, so force KEEP (overrides the heuristics above).
function userTransferRule(merchant, overrides) {
  if (!overrides) return null;
  const ml = (merchant || '').toLowerCase();
  let val = null, len = -1;
  for (const [kw, v] of Object.entries(overrides)) {
    if (kw && kw.length > len && keywordRe(kw).test(ml)) { val = v; len = kw.length; }
  }
  if (val == null) return null;
  return val === 'transfer' ? 'exclude' : 'keep';
}

// Parsed {date, merchant, amount} list (one statement) → ledger rows for an account.
// Identical rows within the statement (same date/merchant/amount — e.g. two of
// the same coffee in one day) get an occurrence index so they don't collapse to
// one id; statement order is stable, so re-imports reproduce the same indices.
export function toLedgerRows(transactions, accountId) {
  const occ = new Map();
  return (transactions || []).map((t) => {
    const key = `${t.date}|${t.merchant}|${t.amount}`;
    const n = occ.get(key) || 0;
    occ.set(key, n + 1);
    return {
      id: txnId(accountId, t.date, t.merchant, t.amount, n),
      account: accountId,
      date: t.date,
      merchant: t.merchant,
      amount: t.amount,
      category: t.category || null,
      transfer: false,
      transfer_pair: null,
    };
  });
}

// Merge incoming rows into existing, dropping exact-id duplicates (problem 1).
// Returns { merged, added } — `added` is what should be appended to the JSONL.
export function mergeLedger(existing, incoming) {
  const seen = new Set((existing || []).map((r) => r.id));
  const added = [];
  for (const r of incoming || []) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    added.push(r);
  }
  return { merged: (existing || []).concat(added), added };
}

// Detect transfers (problem 2), in three passes of decreasing certainty:
//   1. USER RULES win, both ways. 'transfer' excludes; a category/'income'
//      LOCKS the row as real money so the heuristics can't re-flag it.
//   2. CROSS-ACCOUNT PAIRING — a debit matched by an EXACT-amount credit on a
//      DIFFERENT account within ±windowDays, payment-ish wording, credit not a
//      refund. The original, most conservative signal (both sides imported).
//      Runs BEFORE single-row signals so it can claim BOTH sides of a pair —
//      otherwise a card-side "payment received" would get flagged alone here
//      and orphan its chequing-side debit.
//   3. SINGLE-ROW SIGNALS — description reads as a transfer / card payment even
//      when the counterparty account was never imported (the common case: an
//      Amex you don't track). Only the rows pairing couldn't resolve.
// Mutates rows in place; idempotent. `overrides` = config.category_overrides.
const byDateThenId = (a, b) =>
  (a.date || '').localeCompare(b.date || '') || a.id.localeCompare(b.id);

// Which of two equally-close credits should pair with this debit. Money leaves
// the account and then lands, so a credit ON or AFTER the debit beats one before
// it — a card's "PAYMENT THANK YOU" the day after you paid it, rather than an
// unrelated bill payment for the same amount the day before. The smaller id
// settles what's left, so the answer never depends on iteration order.
function preferredCredit(debit, candidate, best) {
  const candidateAfter = candidate.date >= debit.date;
  const bestAfter = best.date >= debit.date;
  if (candidateAfter !== bestAfter) return candidateAfter;
  return candidate.id < best.id;
}

export function detectTransfers(rows, accountsById = {}, windowDays = 5, overrides = null) {
  for (const r of rows) { r.transfer = false; r.transfer_pair = null; }

  // 1. User rules.
  const locked = new Set();
  for (const r of rows) {
    const rule = userTransferRule(r.merchant, overrides);
    if (!rule) continue;
    if (rule === 'exclude') r.transfer = true;
    locked.add(r.id); // 'keep' too: the user said it's real, shield it below.
  }

  // 2. Cross-account exact-amount pairing.
  //
  // Order-independent by construction. This Mac walks the ledger in file order
  // and the phone walks it sorted, so ANY decision left to "whichever came first
  // in the list" makes two devices holding the same ledger report different
  // numbers — it cost $900 of June income once. Candidates are sorted, and ties
  // are settled by a stated rule (see `preferredCredit`), never by arrival.
  const avail = (r) => r.date && !r.transfer && !locked.has(r.id);
  const credits = rows.filter((r) => r.amount > 0 && avail(r)).sort(byDateThenId);
  const debits = rows.filter((r) => r.amount < 0 && avail(r)).sort(byDateThenId);
  const usedCredit = new Set();
  for (const d of debits) {
    let best = null, bestGap = Infinity;
    for (const c of credits) {
      if (usedCredit.has(c.id) || c.account === d.account) continue;
      if (Math.abs(Math.abs(c.amount) - Math.abs(d.amount)) > 0.005) continue; // exact amount
      const gap = daysBetween(d.date, c.date);
      if (gap > windowDays) continue;
      const looksTransfer = (PAYMENT_RE.test(d.merchant) || PAYMENT_RE.test(c.merchant))
        && !REFUND_RE.test(c.merchant);
      if (!looksTransfer) continue;
      if (best === null || gap < bestGap || (gap === bestGap && preferredCredit(d, c, best))) {
        best = c; bestGap = gap;
      }
    }
    if (best) {
      d.transfer = best.transfer = true;
      d.transfer_pair = best.id;
      best.transfer_pair = d.id;
      usedCredit.add(best.id);
    }
  }

  // 3. Single-row signals on whatever pairing left unresolved.
  for (const r of rows) {
    if (locked.has(r.id) || r.transfer) continue;
    if (transferSignal(r, accountsById[r.account])) r.transfer = true;
  }
  return rows;
}

// Payment cadence per credit account — the deterministic half of "don't miss a
// card payment". Statements carry no due dates, so this is the user's own
// pattern: payments to a card recur ~monthly, so last_paid + cadence predicts
// the next one. `missed_in_data` only fires when the ledger has data PAST the
// expected date + grace and still no payment — stale data must not alarm.
const addDays = (iso, days) => new Date(new Date(iso).getTime() + days * 86400000).toISOString().slice(0, 10);

export function detectPaymentSchedule(rows, accountsById = {}) {
  const dataThrough = rows.reduce((m, r) => (r.date && r.date > m ? r.date : m), '');
  const out = [];
  for (const [id, acc] of Object.entries(accountsById)) {
    if ((acc.type || '').toLowerCase() !== 'credit') continue;
    const pays = rows
      .filter((r) => r.account === id && r.amount > 0 && r.date && (r.transfer || PAYMENT_RE.test(r.merchant)))
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!pays.length) continue;
    const last = pays[pays.length - 1];
    const gaps = pays.slice(1).map((p, i) => daysBetween(p.date, pays[i].date));
    const monthlyish = gaps.filter((g) => g >= 24 && g <= 35);
    const cadence = monthlyish.length
      ? Math.round(monthlyish.reduce((a, b) => a + b, 0) / monthlyish.length)
      : (pays.length >= 2 ? null : 30); // single payment: assume monthly until we know
    const next_expected = cadence ? addDays(last.date, cadence) : null;
    out.push({
      account: id,
      label: acc.label || id,
      last_paid: { date: last.date, amount: last.amount },
      cadence_days: cadence,
      next_expected,
      data_through: dataThrough || null,
      missed_in_data: !!(next_expected && dataThrough && addDays(next_expected, 5) < dataThrough),
    });
  }
  return out;
}

// Compute a report from ledger rows — transfers excluded so spend/income are
// real and not double-counted. Reuses analyzeTransactions (categories, monthly
// trend, subscriptions). `range` ({from, to} as 'YYYY-MM', or null for all
// history) filters the VIEW; transfer detection and the payment schedule always
// run on the full ledger so pairs straddling the range boundary still match.
// Statement bookkeeping lines some bank exports carry as rows — "Closing
// totals", "Balance forward". Not transactions: one of them counted as spend
// turns the month's pace math into fiction. They stay in the ledger (the
// transaction list shows what the export said), but no rollup reads them.
const STATEMENT_ARTIFACT_RE = /\b(closing +(totals?|balance)|opening +balance|balance +forward|beginning +balance)\b/i;

export function isStatementArtifact(merchant) {
  return STATEMENT_ARTIFACT_RE.test(merchant || '');
}

export function viewFromLedger(rows, accountsById = {}, opts = {}, range = null) {
  detectTransfers(rows, accountsById, opts.transferWindowDays || 5, opts.categoryOverrides || null);
  let spendable = rows.filter((r) => !r.transfer && !isStatementArtifact(r.merchant));
  const months_available = [...new Set(spendable.filter((r) => r.date).map((r) => r.date.slice(0, 7)))].sort();
  if (range && range.from && range.to) {
    spendable = spendable.filter((r) => r.date && r.date.slice(0, 7) >= range.from && r.date.slice(0, 7) <= range.to);
  }
  const report = analyzeTransactions(
    spendable.map((r) => ({ date: r.date, merchant: r.merchant, amount: r.amount, category: r.category || null })),
    { source: 'ledger' }, opts,
  );
  report.months_available = months_available;
  report.range = range || null;
  report.transfer_count = rows.filter((r) => r.transfer).length;
  report.account_count = new Set(rows.map((r) => r.account)).size;
  report.payment_schedule = detectPaymentSchedule(rows, accountsById);

  // Card-payment events for the bill calendar — transfers are excluded from
  // the analyze layer by design, so they join here: paid ones this month from
  // the transfer credits on credit accounts, expected ones from the schedule.
  const dataThrough = rows.reduce((m, r) => (r.date && r.date > m ? r.date : m), '');
  if (dataThrough && Array.isArray(report.bill_calendar)) {
    const month = dataThrough.slice(0, 7);
    const y = +month.slice(0, 4), mo = +month.slice(5, 7);
    const nextMonth = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
    const winEnd = `${nextMonth}-${String(new Date(Date.UTC(+nextMonth.slice(0, 4), +nextMonth.slice(5, 7), 0)).getUTCDate()).padStart(2, '0')}`;
    for (const r of rows) {
      if (r.transfer && r.amount > 0 && r.date && r.date.startsWith(month)
        && (accountsById[r.account]?.type || '').toLowerCase() === 'credit') {
        report.bill_calendar.push({ date: r.date, label: `${accountsById[r.account]?.label || r.account} payment`, amount: -Math.abs(r.amount), kind: 'card', status: 'paid' });
      }
    }
    for (const p of report.payment_schedule) {
      if (p.next_expected && p.next_expected > dataThrough && p.next_expected <= winEnd) {
        report.bill_calendar.push({ date: p.next_expected, label: `${p.label} payment`, amount: -Math.abs(p.last_paid.amount), kind: 'card', status: 'expected' });
      }
    }
    report.bill_calendar.sort((a, b) => a.date.localeCompare(b.date));
  }
  return report;
}

// The agent's report: always full history.
export function reportFromLedger(rows, accountsById = {}, opts = {}) {
  return viewFromLedger(rows, accountsById, opts, null);
}
