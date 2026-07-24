// lww.js — the edit register: every mutable thing the user changes (a category
// correction, a merchant rule, a budget cap, a commitment term, an account
// field, a reverted row) as one last-write-wins cell keyed by a path.
//
// Why a register and not just files: two devices edit the same CFO. Files carry
// one mtime for the whole blob, so a merge can only pick a file and throw the
// other side's edits away. A cell carries its own timestamp, so the merge is
// per-field, symmetric and idempotent — order never matters.
//
// This mirrors linggen-mobile's `engine/store.dart` cell-for-cell (same key
// prefixes, same {v,ts,d} shape, same tiebreak). The two must not drift: the
// phone's state and this one merge into each other verbatim.
//
// Key space (identical on both sides):
//   cat:<txnId>        a correction on ONE transaction (null = cleared)
//   ov:<keyword>       a merchant-keyword rule -> category | 'transfer' | 'income'
//   bud:<category>     monthly cap
//   com:<key>|<field>  a commitment term (balance, rate_pct, renewal_date, kind)
//   acc:<id>|<field>   an account field (label, type)
//   del:<txnId>        true = reverted out of the report (rows are grow-only)

/// One cell. `v === null` is a tombstone: the key is *known to be unset*, which
/// is not the same as absent — a tombstone still competes in the merge, so a
/// removal sticks instead of being resurrected by the other device's older cell.
export class LwwEntry {
  constructor(v, ts, d) {
    this.v = v;
    this.ts = ts;
    this.d = d;
  }

  /// (ts, device) ordering — the device id breaks ties so two devices editing
  /// the same key in the same millisecond still converge on one winner.
  newerThan(o) {
    return this.ts !== o.ts ? this.ts > o.ts : String(this.d) > String(o.d);
  }

  static fromJson(j) {
    return new LwwEntry(j.v === undefined ? null : j.v, Number(j.ts) || 0, String(j.d || ''));
  }

  toJson() {
    return { v: this.v, ts: this.ts, d: this.d };
  }
}

export class Register {
  /**
   * @param {string} deviceId stable per machine; the LWW tiebreak, not a secret
   * @param {object|null} state previously saved `toState()` output
   */
  constructor(deviceId, state) {
    this.deviceId = deviceId;
    this.cells = new Map();
    this.lastTs = 0;
    if (state) this.loadState(state);
  }

  // Strictly-increasing local clock: never goes backward even if the wall clock
  // does, so this device's edits always order after its own previous ones.
  stamp(now = Date.now()) {
    this.lastTs = now > this.lastTs ? now : this.lastTs + 1;
    return this.lastTs;
  }

  set(key, value) {
    this.cells.set(key, new LwwEntry(value === undefined ? null : value, this.stamp(), this.deviceId));
  }

  remove(key) {
    this.set(key, null);
  }

  /// The live value, or undefined when the key was never written here. A
  /// tombstone reads as null — "known to be unset", which callers must treat as
  /// authoritative rather than falling back to a legacy file.
  get(key) {
    const e = this.cells.get(key);
    return e ? e.v : undefined;
  }

  has(key) {
    return this.cells.has(key);
  }

  get size() {
    return this.cells.size;
  }

  /// Live (non-tombstoned) entries under a prefix, as [suffix, value] pairs.
  entries(prefix) {
    const out = [];
    for (const [k, e] of this.cells) {
      if (k.startsWith(prefix) && e.v !== null) out.push([k.slice(prefix.length), e.v]);
    }
    return out;
  }

  /// Live entries under a `prefix<id>|<field>` key space, grouped by id.
  grouped(prefix) {
    const out = {};
    for (const [rest, v] of this.entries(prefix)) {
      const sep = rest.indexOf('|');
      if (sep < 0) continue;
      const id = rest.slice(0, sep), field = rest.slice(sep + 1);
      (out[id] ||= {})[field] = v;
    }
    return out;
  }

  // ── Sync ──
  toState() {
    const reg = {};
    for (const [k, e] of this.cells) reg[k] = e.toJson();
    return { device: this.deviceId, lastTs: this.lastTs, reg };
  }

  loadState(state) {
    this.cells.clear();
    this.lastTs = Number(state.lastTs) || 0;
    for (const [k, ej] of Object.entries(state.reg || {})) this.cells.set(k, LwwEntry.fromJson(ej));
  }

  /// Merge a peer's register: per-key last-write-wins. Symmetric and idempotent.
  mergeState(remote) {
    for (const [k, ej] of Object.entries((remote && remote.reg) || {})) {
      const e = LwwEntry.fromJson(ej);
      const cur = this.cells.get(k);
      if (!cur || e.newerThan(cur)) this.cells.set(k, e);
    }
    // Never let a future local edit collide with a just-merged timestamp.
    for (const e of this.cells.values()) if (e.ts > this.lastTs) this.lastTs = e.ts;
  }
}

// ── Projections: the register in the shapes the page already speaks ─────────
// Each mirrors the same-named getter in store.dart.

/// keyword -> category | 'transfer' | 'income'
export const overridesOf = (reg) => Object.fromEntries(reg.entries('ov:'));

/// category -> monthly cap
export const budgetsOf = (reg) => Object.fromEntries(reg.entries('bud:'));

/// merchant key -> {balance, rate_pct, renewal_date, kind}
export const commitmentsOf = (reg) => reg.grouped('com:');

/// account id -> {label, type}
export const accountsOf = (reg) => reg.grouped('acc:');

/// The correction on one row: a category, or null when the register knows there
/// is none. `undefined` means this row was never touched here — only then may a
/// caller fall back to whatever the ledger file carries.
export const correctionOf = (reg, id) => reg.get(`cat:${id}`);

export const isDeleted = (reg, id) => reg.get(`del:${id}`) === true;

/// Ledger rows as the report must see them: reverted rows dropped, corrections
/// applied. The file stays grow-only — a revert is a tombstone, so a peer that
/// still holds the row can't resurrect it on the next merge.
export function activeRows(reg, rows) {
  const out = [];
  for (const r of rows) {
    if (isDeleted(reg, r.id)) continue;
    const corr = correctionOf(reg, r.id);
    out.push(corr === undefined ? r : { ...r, category: corr });
  }
  return out;
}

// ── Migration: the register seeded from the files that used to hold this ────

/// Fold the legacy shapes into an empty register. Idempotent by construction —
/// callers only run it when the register has no cells, and it writes each key
/// once. `rows` are raw ledger rows; a non-null `category` on one is a
/// correction the user made before the register existed.
export function seedFromLegacy(reg, { overrides, budgets, commitments, accounts, rows } = {}) {
  for (const [kw, cat] of Object.entries(overrides || {})) if (kw) reg.set(`ov:${kw}`, cat);
  for (const [cat, cap] of Object.entries(budgets || {})) if (Number(cap) > 0) reg.set(`bud:${cat}`, cap);
  for (const [key, terms] of Object.entries(commitments || {})) {
    for (const [field, v] of Object.entries(terms || {})) if (v !== null && v !== '') reg.set(`com:${key}|${field}`, v);
  }
  for (const [id, acct] of Object.entries(accounts || {})) {
    for (const [field, v] of Object.entries(acct || {})) if (v !== null && v !== '') reg.set(`acc:${id}|${field}`, v);
  }
  for (const r of rows || []) if (r && r.id != null && r.category) reg.set(`cat:${r.id}`, r.category);
  return reg;
}
