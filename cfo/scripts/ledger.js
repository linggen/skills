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
import { analyzeTransactions } from './analyze.js';

const daysBetween = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000);
const PAYMENT_RE = /\b(payment|autopay|auto pay|bill ?pay|e-?transfer|transfer|thank you|pymt)\b/i;
const REFUND_RE = /\b(refund|reversal|rebate|cash ?back|chargeback)\b/i;

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

// Detect internal transfers (problem 2). A debit on one account matched by a
// credit of the EXACT same amount on a DIFFERENT account within ±windowDays,
// where at least one side's DESCRIPTION looks like a payment/transfer. Account
// type alone is not evidence — a refund landing on a card is indistinguishable
// from a payment by type, and pairing it with an unrelated equal debit would
// erase real spend. Conservative on purpose — better to miss a transfer than
// to wrongly erase real spend. Mutates rows in place; idempotent.
export function detectTransfers(rows, accountsById = {}, windowDays = 5) {
  for (const r of rows) { r.transfer = false; r.transfer_pair = null; }
  const credits = rows.filter((r) => r.amount > 0 && r.date);
  const debits = rows.filter((r) => r.amount < 0 && r.date);
  const usedCredit = new Set();

  for (const d of debits) {
    let best = null, bestGap = Infinity;
    for (const c of credits) {
      if (usedCredit.has(c.id) || c.account === d.account) continue;
      if (Math.abs(Math.abs(c.amount) - Math.abs(d.amount)) > 0.005) continue; // exact amount
      const gap = daysBetween(d.date, c.date);
      if (gap > windowDays) continue;
      // A money-move between the user's own accounts: payment-ish wording on
      // either side, and the credit isn't a refund/reversal (never a transfer).
      const looksTransfer = (PAYMENT_RE.test(d.merchant) || PAYMENT_RE.test(c.merchant))
        && !REFUND_RE.test(c.merchant);
      if (!looksTransfer) continue;
      if (gap < bestGap) { best = c; bestGap = gap; }
    }
    if (best) {
      d.transfer = best.transfer = true;
      d.transfer_pair = best.id;
      best.transfer_pair = d.id;
      usedCredit.add(best.id);
    }
  }
  return rows;
}

// Compute the report from ledger rows — transfers excluded so spend/income are
// real and not double-counted. Reuses analyzeTransactions (categories, monthly
// trend, subscriptions). `opts.categoryOverrides` is threaded through.
export function reportFromLedger(rows, accountsById = {}, opts = {}) {
  detectTransfers(rows, accountsById, opts.transferWindowDays || 5);
  const spendable = rows
    .filter((r) => !r.transfer)
    .map((r) => ({ date: r.date, merchant: r.merchant, amount: r.amount }));
  const report = analyzeTransactions(spendable, { source: 'ledger' }, opts);
  report.transfer_count = rows.filter((r) => r.transfer).length;
  report.account_count = new Set(rows.map((r) => r.account)).size;
  return report;
}
