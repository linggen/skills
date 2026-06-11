// hash.js — stable, synchronous, non-crypto hashes used as LOCAL grouping keys
// (account identity, transaction dedup). These never leave the machine and are
// not a security boundary — they only need to be stable and collision-resistant
// enough to group re-imports of the same card / dedupe the same transaction.

// cyrb53 — fast 53-bit string hash, deterministic across browser + node.
export function hashId(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

// Fingerprint an account from its raw account/card number. We hash the digits
// then DISCARD the raw — same privacy as full redaction, but re-imports of the
// same account map to the same id. Returns null when no number is available.
export function accountFingerprint(rawAccountNumber) {
  const digits = String(rawAccountNumber || '').replace(/\D/g, '');
  return digits.length >= 4 ? `acct_${hashId(digits)}` : null;
}

// Stable id for a transaction — dedup key within an account. `occurrence`
// distinguishes genuine same-day duplicates (two identical coffees) within one
// statement; occurrence 0 keeps the legacy un-suffixed id so ledgers written
// before the suffix existed still dedup on re-import.
export function txnId(account, date, merchant, amount, occurrence = 0) {
  const base = `${account || ''}|${date || ''}|${merchant || ''}|${amount}`;
  return hashId(occurrence ? `${base}|${occurrence}` : base);
}
