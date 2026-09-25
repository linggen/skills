#!/usr/bin/env node
// spend-watch.js — the Watch's spending pass. Zero LLM: code finds what moved
// in the user's spending since the last night, Ling writes one line per event,
// code keeps the brief. Reads data/report.json (the page and the phone rebuild
// it on every import); writes only data/spend-watch.json.
//
//   node spend-watch.js scan              what is new since the last saved night
//   node spend-watch.js save lines=JSON   Ling's lines for the last scan → the brief
//   node spend-watch.js last              the newest spending brief + the market
//                                         brief (watch.json), for chat
//
// An event is never handed over twice: every scanned id is `seen` once saved.
// A night with nothing new costs no reading — `quiet` is set and the scan's
// counts are the one-line quiet version.
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEEN_DAYS = 120;
const BRIEFS_KEPT = 14;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/// Every event the report holds today, each with a stable id. Pure.
export function spendEvents(report, prevThrough) {
  const r = report || {};
  const through = r.date_range?.end || null;
  const events = [];
  const fresh = (r.transactions || []).filter((t) => t.date && (!prevThrough || t.date > prevThrough));
  const spent = fresh.filter((t) => t.amount < 0);
  if (fresh.length) {
    events.push({
      id: `txns:${through}`, kind: 'new_transactions', count: fresh.length,
      spend: round2(-spent.reduce((a, t) => a + t.amount, 0)), from: prevThrough, through,
    });
  }
  const b = r.budgets;
  for (const c of b?.categories || []) {
    if (c.state !== 'over') continue;
    events.push({ id: `budget:${b.month}:${c.category}`, kind: 'budget_over', category: c.category, budget: c.budget, mtd: c.mtd, projected: b.projection_ready ? c.projected : null, month: b.month });
  }
  for (const s of r.subscriptions || []) {
    if (!s.active || s.essential || !s.increased) continue;
    events.push({ id: `hike:${s.merchant}:${s.last_amount}`, kind: 'price_hike', merchant: s.merchant, from_amount: s.prior_amount, to_amount: s.last_amount, increase: s.increase_amount });
  }
  const ANOMALY_KIND = { new_recurring: 'new_subscription', trial_charge: 'trial_charge', double_charge: 'double_charge', bill_spike: 'bill_spike' };
  for (const a of r.anomalies || []) {
    const kind = ANOMALY_KIND[a.type];
    if (!kind) continue;
    const { id, type, ...facts } = a;
    events.push({ id: `anomaly:${id}`, kind, ...facts });
  }
  for (const p of r.payment_schedule || []) {
    if (!p.missed_in_data) continue;
    events.push({ id: `missed:${p.account}:${p.next_expected}`, kind: 'missed_payment', card: p.label, expected: p.next_expected, last_paid: p.last_paid });
  }
  return { through, events };
}

/// What the scan hands Ling: the unseen events and the counts of what was
/// looked at (the quiet night's line is made of these).
export function scan(report, state, now) {
  const st = state || {};
  const { through, events } = spendEvents(report, st.data_through || null);
  const seen = st.seen || {};
  const unseen = events.filter((e) => !seen[e.id]);
  const r = report || {};
  return {
    since: st.last_run || null,
    scanned_at: now,
    currency: r.currency || null,
    data_through: through,
    checked: {
      transactions: events.find((e) => e.kind === 'new_transactions')?.count || 0,
      budgets: (r.budgets?.categories || []).length,
      subscriptions: (r.subscriptions || []).filter((s) => s.active).length,
      cards: (r.payment_schedule || []).length,
    },
    events: unseen,
    quiet: unseen.length === 0,
  };
}

/// Fold Ling's lines for a scan into the state. Every scanned event is seen
/// from now on, lined or not. Pure.
export function save(state, sc, lines, today) {
  const st = { ...(state || {}) };
  const byId = new Map((Array.isArray(lines) ? lines : []).filter((l) => l && l.id && typeof l.line === 'string').map((l) => [l.id, l.line.replace(/\s+/g, ' ').trim().slice(0, 300)]));
  const told = sc.events.filter((e) => byId.get(e.id)).map((e) => ({ id: e.id, kind: e.kind, line: byId.get(e.id) }));
  const seen = { ...(st.seen || {}) };
  for (const e of sc.events) seen[e.id] ||= today;
  const forget = new Date(Date.parse(today) - SEEN_DAYS * 86400000).toISOString().slice(0, 10);
  for (const k of Object.keys(seen)) if (seen[k] < forget) delete seen[k];
  st.seen = seen;
  st.last_run = sc.scanned_at;
  if (sc.data_through) st.data_through = sc.data_through;
  const briefs = { ...(st.briefs || {}), [today]: { made_at: sc.scanned_at, checked: sc.checked, currency: sc.currency, lines: told, quiet: told.length === 0 } };
  for (const d of Object.keys(briefs).sort().slice(0, -BRIEFS_KEPT)) delete briefs[d];
  st.briefs = briefs;
  return st;
}

const newest = (briefs) => {
  const days = Object.keys(briefs || {}).sort();
  return days.length ? { day: days.at(-1), ...briefs[days.at(-1)] } : null;
};

/// The market brief's newest lines from watch.json (market.pl's file).
export function marketBrief(doc) {
  const b = newest(doc?.briefs);
  if (!b) return null;
  const items = new Map((doc.items || []).map((i) => [i.id, i]));
  return { day: b.day, quiet: !!b.quiet, lines: (b.lines || []).map((id) => items.get(id)).filter(Boolean).map((i) => ({ symbol: i.symbol || null, line: i.line, stake: i.stake ?? null, currency: i.currency ?? null })) };
}

// ── CLI ──────────────────────────────────────────────────────────────────
const dataDir = () => join(process.env.SKILL_DIR || join(dirname(fileURLToPath(import.meta.url)), '..'), 'data');
const readJson = (p, fb) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fb; } };
const writeJson = (p, v) => { writeFileSync(`${p}.tmp`, JSON.stringify(v, null, 2)); renameSync(`${p}.tmp`, p); };
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function main(argv) {
  const dir = dataDir();
  const statePath = join(dir, 'spend-watch.json');
  const cmd = argv[0];
  const state = readJson(statePath, {});
  if (cmd === 'scan') {
    const sc = scan(readJson(join(dir, 'report.json'), {}), state, new Date().toISOString());
    writeJson(join(dir, 'spend-candidates.json'), sc); // what save judges against
    return sc;
  }
  if (cmd === 'save') {
    const raw = (argv.find((a) => a.startsWith('lines=')) || 'lines=[]').slice(6);
    let lines;
    try { lines = /^\s*(\{\{\w+\}\})?\s*$/.test(raw) ? [] : JSON.parse(raw); } catch { throw new Error('lines: a JSON array of {id, line}'); }
    if (lines && !Array.isArray(lines) && Array.isArray(lines.lines)) lines = lines.lines;
    const candidates = join(dir, 'spend-candidates.json');
    if (!existsSync(candidates)) throw new Error('no scan to save — call SpendScan first');
    const next = save(state, readJson(candidates, { events: [] }), lines, localDay());
    writeJson(statePath, next);
    return newest(next.briefs);
  }
  if (cmd === 'last') {
    return { spending: newest(state.briefs), market: marketBrief(readJson(join(dir, 'watch.json'), null)) };
  }
  throw new Error('usage: spend-watch.js scan | save lines=JSON | last');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try { console.log(JSON.stringify(main(process.argv.slice(2)))); }
  catch (e) { console.log(JSON.stringify({ error: e.message })); process.exit(1); }
}
