// ledger.js — the multi-account reconciliation engine. Pure functions, no I/O
// (the page reads/writes the year-partitioned JSONL via /api/bash). This is the
// deterministic layer that runs BEFORE the LLM: money math must be exact and
// private, so dedup + internal-transfer detection happen here, never in the model.
//
// Two problems it solves when several accounts (cards + checking) are merged:
//   1. Re-import / overlap duplicates  → dedup by stable txn id, then by
//      account + date + amount + occurrence for rows whose merchant text changed.
//   2. Internal transfers (the dangerous one) — your checking pays your cards,
//      so the card shows the purchases PLUS "payment received", and checking
//      shows "payment to card". Counting both double-counts spend. We detect the
//      transfer pair and exclude both from spend/income.

import { txnId } from './hash.js';
import { analyzeTransactions, budgetsFor, keywordRe, cleanMerchant, merchantKey, PAYMENT_IN_RE, PAYMENT_UNDONE_RE } from './analyze.js';
import { accountCurrency, fxRate, leadCurrency } from './currency.js';

// The key a merchant rule (`ov:<key>`) is stored under: the cleaned, lowercased
// name — one rule covers every raw variant (store numbers, city suffixes), and
// it is what categorization matches. Every rule-writing path uses this.
export const ruleKey = (merchant) => (cleanMerchant(merchant) || String(merchant)).toLowerCase();

const daysBetween = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000);
const PAYMENT_RE = /\b(payment|autopay|auto pay|bill ?pay|e-?transfer|transfer|thank you|pymt|pmt|paiement)\b/i;

// A card row that says a payment was RECEIVED but carries a minus: a misread
// sign (a statement parsed before its card's payment wording was known). No
// reading of "payment received" on a card is spend, so it counts as the
// credit it is — pairing matches it to the bank's debit by size, and alone it
// is a transfer, never spend. The row keeps its stored sign; `wrong_sign`
// says so for this run.
const isCredit = (acc) => (acc?.type || '').toLowerCase() === 'credit';
function wrongSignPayment(row, account) {
  return row.amount < 0 && isCredit(account) && PAYMENT_IN_RE.test(row.merchant || '') && !PAYMENT_UNDONE_RE.test(row.merchant || '');
}
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
  'bank transfer', 'transfer to', 'transfer from', 'online banking transfer',
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

// Does this single row read as a self-transfer / credit-card payment? Says
// where the money went: 'card' — a card bill paid from a bank account (the
// card is not imported, or pairing would have taken it); 'account' — to or
// from an account of some other kind; null — not a transfer.
function transferSignal(row, account) {
  const m = row.merchant || '';
  const type = (account?.type || '').toLowerCase();
  // Paying a credit-card bill from chequing/savings → debit to a card issuer.
  if ((type === 'checking' || type === 'savings') && row.amount < 0 && CARD_ISSUER_RES.some((re) => re.test(m))) return 'card';
  if (TRANSFER_RES.some((re) => re.test(m))) return 'account';
  // The card side of that payment landing as a credit on a credit account.
  if (type === 'credit' && (row.amount > 0 || row.wrong_sign) && PAYMENT_RE.test(m) && !REFUND_RE.test(m)) return 'account';
  return null;
}

// The user's own rule for a row (config.category_overrides): the value of the
// longest keyword that matches, or null.
function userRuleValue(merchant, overrides) {
  if (!overrides) return null;
  const ml = (merchant || '').toLowerCase();
  let val = null, len = -1;
  for (const [kw, v] of Object.entries(overrides)) {
    if (kw && kw.length > len && keywordRe(kw).test(ml)) { val = v; len = kw.length; }
  }
  return val;
}

// The user's ruling on a row. 'transfer' → force EXCLUDE; 'savings' → out of
// spend, into Saved; any category / 'income' → the user says it's real money,
// so force KEEP (overrides the heuristics above).
const RULE_EFFECT = { transfer: 'exclude', savings: 'saved' };
function userTransferRule(merchant, overrides) {
  const val = userRuleValue(merchant, overrides);
  return val == null ? null : RULE_EFFECT[val] || 'keep';
}

// ── Money put away: investing wording, bank-neutral — plan acronyms, fund
// words, plan codes, brokerages. It only ever SUGGESTS 'savings' (the page's
// approval card); a confirmed rule moves the totals. Never a bare "inv"
// (an invoice).
// "IRA" and "ISA" only with a word that makes them a plan: alone they are
// also names ("Isa's Bakery", "IRA KITCHEN").
const SAVINGS_WORDS = [
  'resp', 'rrsp', 'tfsa', 'fhsa', 'rrif', '401k', '401(k)', '403b', '403(b)', 'roth ira', 'traditional ira', 'sep ira',
  'ira contrib', 'ira contribution', 'ira deposit', 'stocks and shares isa', 'stocks & shares isa', 'lifetime isa', 'cash isa',
  'junior isa', 'isa contribution', 'isa subscription', 'isa deposit', 'sipp', 'mutual fund', 'mutual funds', 'fonds', 'index fund',
  'investment contribution', 'investment plan', 'invest contrib', 'pension contribution', 'brokerage',
];
const BROKERAGES = [
  'wealthsimple', 'questrade', 'qtrade', 'vanguard', 'fidelity', 'schwab', 'e*trade', 'etrade', 'interactive brokers',
  'robinhood', 'betterment', 'wealthfront', 'acorns', 'stash invest', 'm1 finance', 'merrill edge', 'edward jones',
  'td direct investing', 'rbc direct investing', 'bmo investorline', 'scotia itrade', 'moomoo', 'webull', 'trading 212',
  'hargreaves lansdown', 'aj bell', 'nutmeg', 'moneybox', 'freetrade', 'vanguard investor', 'trade republic',
  'scalable capital', 'degiro', 'nordnet', 'avanza', 'sharesies', 'raiz', 'commsec', 'selfwealth', 'betashares',
];
const SAVINGS_RES = [...SAVINGS_WORDS, ...BROKERAGES].map(keywordRe);
// A plan code: "INV/PLA", "INV PLAN", "INVEST/PLN".
const PLAN_CODE_RE = /\binv(?:est)?\s*[/-]?\s*pl(?:a|an|n)\b/i;

export function savingsWording(merchant) {
  const m = merchant || '';
  return PLAN_CODE_RE.test(m) || SAVINGS_RES.some((re) => re.test(m));
}

// ── The other side of an unpaired transfer: which account the money went to
// or came from, read off the description with the transfer words dropped —
// "Online Transfer, TF 0133-482" and "TF 0133-482" are the same account.
const COUNTERPARTY_NOISE = new Set([
  'online', 'transfer', 'tf', 'tfr', 'xfer', 'to', 'from', 'payment', 'bill', 'pay', 'banking', 'internal',
  'account', 'acct', 'funds', 'wire', 'bank', 'mobile', 'web', 'the', 'thank', 'you', 'received', 'autopay',
  'internet', 'ach', 'pmt', 'pymt', 'epayment', 'e-payment', 'directpay',
]);
const bareWord = (w) => w.toLowerCase().replace(/[^a-z0-9]/g, '');
export function counterpartyLabel(merchant) {
  const clean = cleanMerchant(merchant);
  const words = clean.split(/[\s,]+/).filter((w) => bareWord(w) && !COUNTERPARTY_NOISE.has(w.toLowerCase()) && !COUNTERPARTY_NOISE.has(bareWord(w)));
  return words.join(' ') || clean;
}
export const counterpartyKey = (merchant) => counterpartyLabel(merchant).toLowerCase();

// Parsed {date, merchant, amount} list (one statement) → ledger rows for an account.
// Identical rows within the statement (same date/merchant/amount — e.g. two of
// the same coffee in one day) get an occurrence index so they don't collapse to
// one id; statement order is stable, so re-imports reproduce the same indices.
//
// `currency` is the account's (currency.js) — stored on the row, never part of
// its id, so a row's identity is the same before and after currencies existed.
export function toLedgerRows(transactions, accountId, currency = null) {
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
      ...(currency ? { currency } : {}),
    };
  });
}

// The merchant-blind key: account|date|amount|n, n the row's place among the
// given rows sharing that account, date and amount. A row's id hashes its
// merchant as parsed, so a better cleaner or parser would give an old
// statement's rows new ids; this key still knows them.
function looseKeyed(rows) {
  const occ = new Map();
  return rows.map((r) => {
    const base = `${r.account || ''}|${r.date || ''}|${r.amount}`;
    const n = occ.get(base) || 0;
    occ.set(base, n + 1);
    return [`${base}|${n}`, r];
  });
}

// Which incoming rows are already on file, as { incoming id → id on file }.
// An exact id is the row itself. What is left is matched merchant-blind, both
// sides counted among their unmatched rows only (existing in id order, so both
// devices pair the same way; incoming in statement order) — two merchants on
// one day for one amount stay two, and an overlapping statement's new row is
// never taken for a row it already matched by id.
export function onFileIds(existing, incoming, isDeleted = () => false) {
  const have = new Set((existing || []).map((r) => r.id));
  const onFile = new Map();
  for (const r of incoming || []) if (have.has(r.id)) onFile.set(r.id, r.id);
  const claimed = new Set(onFile.values());
  // Live rows before deleted ones: a row the person deleted by hand stays
  // deleted when a live twin (same day, same amount) can take the match.
  const rank = (r) => (isDeleted(r.id) ? 1 : 0);
  const rest = (existing || []).filter((r) => !claimed.has(r.id))
    .sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
  const loose = new Map(looseKeyed(rest));
  for (const [key, r] of looseKeyed((incoming || []).filter((r) => !have.has(r.id)))) {
    if (loose.has(key)) onFile.set(r.id, loose.get(key).id);
  }
  return onFile;
}

// Merge incoming rows into existing, dropping rows already on file (problem 1).
// Returns { merged, added, onFile } — `added` is what should be appended to
// the JSONL; `onFile` maps each incoming row already there to its id on file.
export function mergeLedger(existing, incoming, isDeleted = () => false) {
  const onFile = onFileIds(existing, incoming, isDeleted);
  const seen = new Set();
  const added = [];
  for (const r of incoming || []) {
    if (onFile.has(r.id) || seen.has(r.id)) continue;
    seen.add(r.id);
    added.push(r);
  }
  return { merged: (existing || []).concat(added), added, onFile };
}

// An import against a ledger that may hold reverted rows. Rows already on
// file add nothing to the file — re-importing a file you reverted brings its
// rows back by lifting their tombstones. `fresh` is what this import brought
// into the report either way: it is what the import log records as
// `added_ids`, so the import reports "N new" and can be undone again. `ids` is
// every row the statement carried, by its id on file — the log's `row_ids`.
export function mergeImport(existing, incoming, isDeleted = () => false) {
  const { merged, added, onFile } = mergeLedger(existing, incoming, isDeleted);
  const ids = (incoming || []).map((r) => onFile.get(r.id) || r.id);
  const byId = new Map(merged.map((r) => [r.id, r]));
  const restored = [...new Set(ids)].filter((id) => isDeleted(id)).map((id) => byId.get(id));
  const seen = new Set(), fresh = [];
  for (const r of [...added, ...restored]) if (!seen.has(r.id)) { seen.add(r.id); fresh.push(r); }
  return { merged, added, restored, fresh, ids };
}

// Which rows undoing one import may take out of the report. Its own additions,
// plus rows it also carried whose adding import was already undone — minus any
// row another LIVE import still holds (overlapping statements share rows: the
// later one's copy deduped, so it never recorded them as added). `row_ids` is
// every row a statement carried; entries without it (older, or the phone's)
// hold their `added_ids`.
export function idsToRevert(log, importId) {
  const entry = (log || []).find((e) => e.id === importId);
  if (!entry || entry.reverted) return [];
  const others = log.filter((e) => e.id !== importId);
  const held = new Set(others.filter((e) => !e.reverted).flatMap((e) => e.row_ids || e.added_ids || []));
  const orphaned = new Set(others.filter((e) => e.reverted).flatMap((e) => e.added_ids || []));
  const mine = new Set(entry.added_ids || []);
  for (const id of entry.row_ids || []) if (orphaned.has(id)) mine.add(id);
  return [...mine].filter((id) => !held.has(id));
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
  // A credit stored with its right sign beats a misread one (wrong_sign) — the
  // bank's own export over an older parse of the same payment.
  if (!!candidate.wrong_sign !== !!best.wrong_sign) return !candidate.wrong_sign;
  const candidateAfter = candidate.date >= debit.date;
  const bestAfter = best.date >= debit.date;
  if (candidateAfter !== bestAfter) return candidateAfter;
  return candidate.id < best.id;
}

// Across currencies (a USD card paid from CAD chequing) the two sides can't be
// equal, so pass 2b pairs them by the date window and wording alone — within
// 8% of the day's rate when there is one — and marks both `transfer_fx`.
// Same-currency pairing (pass 2) is untouched and runs first.
const FX_PAIR_TOLERANCE = 0.08;
const curOf = (r) => r.currency || null;

// Flags a report run sets on rows and never stores: cleared on every run.
const RUN_FLAGS = ['transfer_fx', 'saved', 'via', 'household', 'refund', 'one_off', 'wrong_sign'];

// `external` = the person's answers about accounts that aren't imported
// ({counterpartyKey: 'mine' | 'household'}, register `ext:` cells): money in
// from a 'household' one is income, not a transfer.
export function detectTransfers(rows, accountsById = {}, windowDays = 5, overrides = null, fx = null, external = null) {
  for (const r of rows) {
    r.transfer = false; r.transfer_pair = null;
    for (const f of RUN_FLAGS) if (f in r) delete r[f];
  }

  // 1. User rules.
  const locked = new Set();
  for (const r of rows) {
    const rule = userTransferRule(r.merchant, overrides);
    if (!rule) continue;
    if (rule !== 'keep') r.transfer = true;
    if (rule === 'saved') r.saved = true; // out of spend, counted as Saved
    locked.add(r.id); // 'keep' too: the user said it's real, shield it below.
  }

  // 2. Cross-account exact-amount pairing.
  //
  // Order-independent by construction. This Mac walks the ledger in file order
  // and the phone walks it sorted, so ANY decision left to "whichever came first
  // in the list" makes two devices holding the same ledger report different
  // numbers — it cost $900 of June income once. Candidates are sorted, and ties
  // are settled by a stated rule (see `preferredCredit`), never by arrival.
  for (const r of rows) if (wrongSignPayment(r, accountsById[r.account])) r.wrong_sign = true;
  const avail = (r) => r.date && !r.transfer && !locked.has(r.id);
  const credits = rows.filter((r) => (r.amount > 0 || r.wrong_sign) && avail(r)).sort(byDateThenId);
  const debits = rows.filter((r) => r.amount < 0 && !r.wrong_sign && avail(r)).sort(byDateThenId);
  const usedCredit = new Set();
  for (const d of debits) {
    let best = null, bestGap = Infinity;
    for (const c of credits) {
      if (usedCredit.has(c.id) || c.account === d.account) continue;
      if (curOf(c) !== curOf(d)) continue; // across currencies: pass 2b
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

  // 2b. Cross-currency pairing: date window + both sides' wording; the amount
  // only has to agree with the day's rate when a rate is known.
  for (const d of debits) {
    if (d.transfer || !curOf(d)) continue;
    let best = null, bestDev = Infinity, bestGap = Infinity;
    for (const c of credits) {
      if (usedCredit.has(c.id) || c.transfer || c.account === d.account) continue;
      if (!curOf(c) || curOf(c) === curOf(d)) continue;
      const gap = daysBetween(d.date, c.date);
      if (gap > windowDays) continue;
      const looksTransfer = (PAYMENT_RE.test(d.merchant) || PAYMENT_RE.test(c.merchant))
        && !REFUND_RE.test(c.merchant);
      if (!looksTransfer) continue;
      const k = fxRate(fx, curOf(d), curOf(c));
      let dev = 1; // no rate: every candidate is equally unmeasured
      if (k != null) {
        const expect = Math.abs(d.amount) * k;
        dev = expect > 0 ? Math.abs(Math.abs(c.amount) - expect) / expect : Infinity;
        if (dev > FX_PAIR_TOLERANCE) continue;
      }
      if (best === null || dev < bestDev
        || (dev === bestDev && (gap < bestGap || (gap === bestGap && preferredCredit(d, c, best))))) {
        best = c; bestDev = dev; bestGap = gap;
      }
    }
    if (best) {
      d.transfer = best.transfer = true;
      d.transfer_pair = best.id;
      best.transfer_pair = d.id;
      d.transfer_fx = best.transfer_fx = true;
      usedCredit.add(best.id);
    }
  }

  // 3. Single-row signals on whatever pairing left unresolved. `via` says
  // where the money went — the report's "not imported" lines read it.
  for (const r of rows) {
    if (locked.has(r.id) || r.transfer) continue;
    const via = transferSignal(r, accountsById[r.account]);
    if (!via) continue;
    if (via === 'account' && r.amount > 0 && external?.[counterpartyKey(r.merchant)] === 'household') { r.household = true; continue; }
    r.transfer = true;
    r.via = via;
  }
  return rows;
}

// Money back — a positive row that is not a payment on a card, or any
// refund / reversal / rebate / cash-back wording — is spend returning, never
// income. The person's own 'income' rule says otherwise, and wins. A "card"
// whose credits outweigh its charges is a bank account typed as a card (a
// new account's type is a guess): its deposits stay income.
function cardsThatLookLikeCards(rows, accountsById) {
  const sums = {};
  for (const r of rows) {
    if (r.transfer || r.household || !isCredit(accountsById[r.account])) continue;
    const s = (sums[r.account] ||= { out: 0, back: 0 });
    if (r.amount < 0) s.out -= cents(r.amount);
    else if (!PAYMENT_RE.test(r.merchant)) s.back += cents(r.amount);
  }
  return new Set(Object.entries(sums).filter(([, s]) => s.back <= s.out).map(([id]) => id));
}
export function markRefunds(rows, accountsById = {}, overrides = null) {
  const cards = cardsThatLookLikeCards(rows, accountsById);
  for (const r of rows) {
    if (r.transfer || r.household || !(r.amount > 0)) continue;
    if (userRuleValue(r.merchant, overrides) === 'income') continue;
    if ((cards.has(r.account) && !PAYMENT_RE.test(r.merchant)) || REFUND_RE.test(r.merchant)) r.refund = true;
  }
  return rows;
}

// A one-off lump: what one payee took on one day (a fee paid in two parts is
// one lump) over 3× the median month's spend, from a payee seen on at most
// two days in the twelve months to the ledger's last day. Label only; the
// totals keep it. `rows` are the spendable rows (no transfers).
const ONE_OFF_TIMES = 3;
const ONE_OFF_MAX_DAYS = 2;
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
export function markOneOffs(rows) {
  const last = rows.reduce((m, r) => (r.date && r.date > m ? r.date : m), '');
  if (!last) return rows;
  const from = `${+last.slice(0, 4) - 1}${last.slice(4)}`;
  const charges = rows.filter((r) => r.amount < 0 && r.date && r.date > from);
  // Whole cents: integers add exactly in any order (the phone walks the
  // ledger sorted, this Mac in file order).
  const monthly = {}, lumps = new Map(), days = {};
  const payee = (r) => merchantKey(cleanMerchant(r.merchant));
  for (const r of charges) {
    const m = r.date.slice(0, 7);
    monthly[m] = (monthly[m] || 0) + Math.round(-r.amount * 100);
    const k = `${payee(r)}|${r.date}`;
    if (!lumps.has(k)) (days[payee(r)] ||= new Set()).add(r.date);
    lumps.set(k, (lumps.get(k) || 0) + Math.round(-r.amount * 100));
  }
  const bar = ONE_OFF_TIMES * median(Object.values(monthly));
  for (const r of charges) {
    if (lumps.get(`${payee(r)}|${r.date}`) > bar && days[payee(r)].size <= ONE_OFF_MAX_DAYS) r.one_off = true;
  }
  return rows;
}

// Payment cadence per credit account — the deterministic half of "don't miss a
// card payment". Statements carry no due dates, so this is the user's own
// pattern: payments to a card recur ~monthly, so last_paid + cadence predicts
// the next one. `missed_in_data` only fires when the ledger has data PAST the
// expected date + grace and still no payment — stale data must not alarm.
// "Data" is the CARD's own rows: a card imported through June beside chequing
// through August has no evidence about July, so it must not read as missed.
const addDays = (iso, days) => new Date(new Date(iso).getTime() + days * 86400000).toISOString().slice(0, 10);

export function detectPaymentSchedule(rows, accountsById = {}) {
  const lastByAccount = {};
  for (const r of rows) {
    if (r.date && r.date > (lastByAccount[r.account] || '')) lastByAccount[r.account] = r.date;
  }
  const out = [];
  for (const [id, acc] of Object.entries(accountsById)) {
    if ((acc.type || '').toLowerCase() !== 'credit') continue;
    const dataThrough = lastByAccount[id] || '';
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
const STATEMENT_ARTIFACT_RE = /\b(closing +(totals?|balance)|opening +balance|balance +forward|beginning +balance|previous +(total +)?balance|new +(total +)?balance)\b/i;

export function isStatementArtifact(merchant) {
  return STATEMENT_ARTIFACT_RE.test(merchant || '');
}

// Each row's currency = its account's (currency.js accountCurrency), falling
// back to what the row carries, then the home currency. Stamped on the row so
// every reader (transfer pairing, the transaction list) sees the same one.
// Rows with none of the three stay without — a ledger from before currencies,
// read with no home set, reports exactly as it always did.
export function stampCurrencies(rows, accountsById, home) {
  for (const r of rows) {
    const acc = accountsById[r.account];
    const c = acc && acc.currency ? accountCurrency(acc, home).currency : (r.currency || home || null);
    if (c) r.currency = c;
  }
}

const txnOf = (r) => ({
  date: r.date, merchant: r.merchant, amount: r.amount, category: r.category || null,
  ...(r.refund ? { refund: true } : {}), ...(r.one_off ? { one_off: true } : {}),
});
const tag = (list, currency) => (list || []).map((x) => ({ ...x, currency }));

// What one currency's figures look like beside the others.
function currencySlice(part) {
  const c = part.commitments || {};
  return {
    totals: part.totals || { spend: 0, income: 0, net: 0, months: 0 },
    by_month: part.by_month || {},
    by_category: part.by_category || [],
    by_category_monthly: part.by_category_monthly || {},
    top_merchants: part.top_merchants || [],
    subscription_monthly_total: part.subscription_monthly_total || 0,
    recurring_bills_monthly_total: part.recurring_bills_monthly_total || 0,
    active_subscription_count: part.active_subscription_count || 0,
    stopped_subscription_count: part.stopped_subscription_count || 0,
    commitments: { monthly_total: c.monthly_total || 0, split: c.split || null, pct_of_income: c.pct_of_income ?? null },
    forecast: part.forecast || null,
  };
}

// The one combined figure: every currency's totals converted into `lead` at
// the day's rate. Approximate by construction, and null when any currency has
// no rate — a partial sum would read as the whole.
function combine(slices, order, fx, lead) {
  // The currencies the rate table lacks (not the ones they'd fail to reach).
  const missing = order.filter((c) => !fx || fxRate(fx, c, fx.base) == null);
  if (missing.length) return { combined: null, missing };
  const totals = { spend: 0, income: 0, net: 0 };
  const byMonth = {};
  const rates = {};
  for (const c of order) {
    const k = fxRate(fx, c, lead);
    if (c !== lead) rates[c] = k;
    const t = slices[c].totals;
    totals.spend += t.spend * k; totals.income += t.income * k; totals.net += t.net * k;
    for (const [m, v] of Object.entries(slices[c].by_month)) {
      const b = (byMonth[m] ||= { spend: 0, income: 0, net: 0 });
      b.spend += v.spend * k; b.income += v.income * k; b.net += v.net * k;
    }
  }
  const r2 = (n) => Math.round(n * 100) / 100;
  for (const k of Object.keys(totals)) totals[k] = r2(totals[k]);
  const by_month = Object.fromEntries(Object.entries(byMonth).sort()
    .map(([m, v]) => [m, { spend: r2(v.spend), income: r2(v.income), net: r2(v.net) }]));
  return {
    combined: { currency: lead, approx: true, fx_date: fx.date || null, fx_source: fx.source || null, rates, totals, by_month },
    missing: [],
  };
}

// Budgets stay in the home currency. Spending in another currency counts
// toward them converted at the day's rate — approximate, and said so; a
// currency with no rate is left out and named.
function budgetsAcross(rows, budgetCur, fx, opts) {
  if (!opts.budgets) return null;
  const converted = new Set(), missing = new Set(), txns = [];
  for (const r of rows) {
    if (r.currency === budgetCur) { txns.push(txnOf(r)); continue; }
    const k = fxRate(fx, r.currency, budgetCur);
    if (k == null) { if (r.currency) missing.add(r.currency); continue; }
    converted.add(r.currency);
    txns.push({ ...txnOf(r), amount: Math.round(r.amount * k * 100) / 100 });
  }
  const b = budgetsFor(txns, opts);
  if (!b) return null;
  return { ...b, currency: budgetCur, approx: converted.size > 0, converted_from: [...converted].sort(), fx_missing: [...missing].sort(), fx_date: converted.size ? fx.date || null : null };
}

export function viewFromLedger(rows, accountsById = {}, opts = {}, range = null) {
  const home = opts.homeCurrency || null;
  const fx = opts.fx || null;
  stampCurrencies(rows, accountsById, home);
  detectTransfers(rows, accountsById, opts.transferWindowDays || 5, opts.categoryOverrides || null, fx, opts.externalAccounts || null);
  markRefunds(rows, accountsById, opts.categoryOverrides || null);
  const spendableAll = rows.filter((r) => !r.transfer && !isStatementArtifact(r.merchant));
  markOneOffs(spendableAll);
  let spendable = spendableAll;
  const months_available = [...new Set(spendable.filter((r) => r.date).map((r) => r.date.slice(0, 7)))].sort();
  if (range && range.from && range.to) {
    spendable = spendable.filter((r) => r.date && r.date.slice(0, 7) >= range.from && r.date.slice(0, 7) <= range.to);
  }
  const currencies = [...new Set(spendableAll.map((r) => r.currency).filter(Boolean))].sort();
  let report;
  if (currencies.length <= 1) {
    // One currency (or none known): the report as it always was.
    const only = currencies[0] || home || null;
    report = analyzeTransactions(spendable.map(txnOf), { source: 'ledger', currency: only }, opts);
    if (currencies.length) report.currencies = currencies;
  } else {
    report = multiCurrencyView(spendableAll, spendable, currencies, home, fx, opts);
  }
  report.months_available = months_available;
  report.range = range || null;
  report.transfer_count = rows.filter((r) => r.transfer).length;
  if (rows.some((r) => r.transfer_fx)) report.transfer_fx_count = rows.filter((r) => r.transfer_fx).length;
  report.account_count = new Set(rows.map((r) => r.account)).size;
  Object.assign(report, sideLines(rows, range, multi(currencies) ? report.currency : null, opts.externalAccounts || null));
  report.saving_suggestions = savingSuggestions(rows, opts.categoryOverrides || null);
  report.payment_schedule = detectPaymentSchedule(rows, accountsById);
  const isMulti = multi(currencies);
  const accCur = (id) => rows.find((r) => r.account === id && r.currency)?.currency || null;
  if (isMulti) report.payment_schedule = report.payment_schedule.map((p) => ({ ...p, currency: accCur(p.account) }));

  // Card-payment events for the bill calendar — transfers are excluded from
  // the analyze layer by design, so they join here: paid ones this month from
  // the transfer credits on credit accounts, expected ones from the schedule.
  const dataThrough = rows.reduce((m, r) => (r.date && r.date > m ? r.date : m), '');
  if (dataThrough && Array.isArray(report.bill_calendar)) {
    const month = dataThrough.slice(0, 7);
    const y = +month.slice(0, 4), mo = +month.slice(5, 7);
    const nextMonth = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
    const winEnd = `${nextMonth}-${String(new Date(Date.UTC(+nextMonth.slice(0, 4), +nextMonth.slice(5, 7), 0)).getUTCDate()).padStart(2, '0')}`;
    const cur = (c) => (isMulti ? { currency: c } : {});
    for (const r of rows) {
      if (r.transfer && r.amount > 0 && r.date && r.date.startsWith(month)
        && (accountsById[r.account]?.type || '').toLowerCase() === 'credit') {
        report.bill_calendar.push({ date: r.date, label: `${accountsById[r.account]?.label || r.account} payment`, amount: -Math.abs(r.amount), kind: 'card', status: 'paid', ...cur(r.currency || null) });
      }
    }
    for (const p of report.payment_schedule) {
      if (p.next_expected && p.next_expected > dataThrough && p.next_expected <= winEnd) {
        report.bill_calendar.push({ date: p.next_expected, label: `${p.label} payment`, amount: -Math.abs(p.last_paid.amount), kind: 'card', status: 'expected', ...cur(p.currency || null) });
      }
    }
    report.bill_calendar.sort((a, b) => a.date.localeCompare(b.date));
  }
  return report;
}

const multi = (currencies) => currencies.length > 1;
const cents = (n) => Math.round(n * 100);
const inRange = (range) => (r) => r.date && (!range || !range.from || !range.to
  || (r.date.slice(0, 7) >= range.from && r.date.slice(0, 7) <= range.to));

// Rows summed by a key into lines, in whole cents, largest first then by key
// — the same list on this Mac and the phone whatever order each walks.
function linesBy(rows, keyOf, labelOf, sign) {
  const by = new Map();
  for (const r of rows) {
    const k = keyOf(r);
    const e = by.get(k) || { key: k, label: labelOf(r), in: 0, out: 0, count: 0, last: '' };
    if (r.amount > 0) e.in += cents(r.amount); else e.out -= cents(r.amount);
    e.count++;
    const label = labelOf(r); // the newest row names the line; a same-day tie, the smaller name
    if (r.date > e.last || (r.date === e.last && label < e.label)) { e.last = r.date; e.label = label; }
    by.set(k, e);
  }
  return [...by.values()]
    .map((e) => ({ key: e.key, label: e.label, amount: (sign * (e.out - e.in)) / 100, in: e.in / 100, out: e.out / 100, count: e.count }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount) || a.key.localeCompare(b.key));
}
const sumOf = (lines, f) => lines.reduce((a, l) => a + cents(l[f]), 0) / 100;

// The money the headline doesn't count as spend or income, said as lines so
// nothing vanishes without a word, over the view's range (and, with several
// currencies, the lead one's rows):
//   saved      — rows under a 'savings' rule: put away, not spent;
//   paid_to_cards_not_imported — card bills paid from a bank account whose
//                card isn't imported (pairing takes over once it is);
//   moved_not_imported — transfers to / from accounts not imported, net per
//                account, each with the person's answer (ext: cell) or
//                `ask: true` when money came in and nobody said what it is.
function sideLines(rows, range, currency, external) {
  const pick = rows.filter(inRange(range)).filter((r) => !currency || r.currency === currency);
  const saved = linesBy(pick.filter((r) => r.saved), (r) => merchantKey(cleanMerchant(r.merchant)), (r) => cleanMerchant(r.merchant), 1);
  const cards = linesBy(pick.filter((r) => r.via === 'card'), (r) => counterpartyKey(r.merchant), (r) => counterpartyLabel(r.merchant), 1);
  const moved = linesBy(pick.filter((r) => r.via === 'account' || r.household), (r) => counterpartyKey(r.merchant), (r) => counterpartyLabel(r.merchant), -1)
    .map((l) => {
      const answer = external?.[l.key] || null;
      return { ...l, answer, ask: !answer && l.in > 0 };
    });
  return {
    saved: { total: sumOf(saved, 'amount'), lines: saved },
    paid_to_cards_not_imported: { total: sumOf(cards, 'amount'), lines: cards },
    moved_not_imported: { in: sumOf(moved, 'in'), out: sumOf(moved, 'out'), net: sumOf(moved, 'amount'), lines: moved },
  };
}

// Payees whose wording reads as investing, spent from and not yet ruled
// savings / transfer / income: the page offers 'savings' for each (one tap
// writes the rule). Full history, not the range — a quiet month hides none.
const RULED = new Set(['savings', 'transfer', 'income']);
function savingSuggestions(rows, overrides) {
  const by = new Map();
  for (const r of rows) {
    if (!(r.amount < 0) || r.saved || r.transfer_pair || !savingsWording(r.merchant)) continue;
    if (RULED.has(userRuleValue(r.merchant, overrides))) continue;
    const k = ruleKey(r.merchant);
    const label = cleanMerchant(r.merchant);
    const e = by.get(k) || { merchant: k, label, type: 'savings', count: 0, cents: 0 };
    if (label < e.label) e.label = label;
    e.count++; e.cents -= cents(r.amount);
    by.set(k, e);
  }
  return [...by.values()].map(({ cents: c, ...e }) => ({ ...e, total: c / 100 }))
    .sort((a, b) => b.total - a.total || a.merchant.localeCompare(b.merchant));
}

// Several currencies: one analysis per currency, never a sum across them.
// Top-level figures are the LEAD currency's (the one the combined line is in)
// so a reader that knows nothing of currencies still gets one honest,
// labelled set; every list item carries its own `currency`; `by_currency`
// holds each currency's figures; `combined` is the single ≈ line.
function multiCurrencyView(spendableAll, spendable, currencies, home, fx, opts) {
  const activity = {};
  for (const c of currencies) activity[c] = { amount: 0, rows: 0 };
  // Summed in whole cents: integers add exactly in any order, and this Mac and
  // the phone walk the ledger in different orders.
  for (const r of spendableAll) { activity[r.currency].amount += Math.round(Math.abs(r.amount) * 100); activity[r.currency].rows++; }
  for (const c of currencies) activity[c].amount /= 100;
  const lead = leadCurrency(activity, fx, home);
  const order = [lead, ...currencies.filter((c) => c !== lead)];
  const subOpts = { ...opts, budgets: null };
  const parts = {}, slices = {};
  for (const c of order) {
    parts[c] = analyzeTransactions(spendable.filter((r) => r.currency === c).map(txnOf), { source: 'ledger', currency: c }, subOpts);
    slices[c] = currencySlice(parts[c]);
  }
  const main = parts[lead];
  const report = { ...main, errors: main.errors || [] };
  report.currency = lead;
  report.currencies = order;
  report.by_currency = slices;
  const byDateDesc = (a, b) => (b.date || '').localeCompare(a.date || '');
  report.subscriptions = order.flatMap((c) => tag(parts[c].subscriptions, c));
  report.anomalies = order.flatMap((c) => tag(parts[c].anomalies, c)).sort(byDateDesc).slice(0, 12);
  report.bill_calendar = order.flatMap((c) => tag(parts[c].bill_calendar, c)).sort((a, b) => a.date.localeCompare(b.date));
  report.transactions = order.flatMap((c) => tag(parts[c].transactions, c));
  if (main.commitments) {
    report.commitments = { ...main.commitments, currency: lead, items: order.flatMap((c) => tag(parts[c].commitments?.items, c)) };
  }
  if (main.forecast) report.forecast = { ...main.forecast, currency: lead };
  const { combined, missing } = combine(slices, order, fx, lead);
  report.combined = combined;
  report.fx_missing = missing;
  report.budgets = budgetsAcross(spendable, home || lead, fx, opts);
  return report;
}

// The agent's report: always full history.
export function reportFromLedger(rows, accountsById = {}, opts = {}) {
  return viewFromLedger(rows, accountsById, opts, null);
}
