#!/usr/bin/env node
// run-page.mjs — end-to-end RENDERED-PAGE check: load the live CFO page in
// headless Chrome, read the KPI cards out of the real DOM, and compare them to
// an independent recompute from the on-disk ledger. Closes the gap that the
// node suites can't cover (the browser render layer).
//
//   node tests/run-page.mjs            # needs the daemon on :9527 + Chrome
//
// Skips gracefully (exit 0 with a notice) when Chrome or the server is absent.

import { existsSync } from 'node:fs';
import { reportFromLedger, viewFromLedger } from '../scripts/ledger.js';
import { loadLive } from './lib/live-data.mjs';
import { renderPage } from './lib/render-page.mjs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// 9527 since the 2026-07 port migration. This default was left on 9898, where a
// stale daemon still LISTENS without answering — so Chrome sat waiting on a
// socket that never replied and --dump-dom never fired. That reads as "the test
// hangs"; it was a dead port. Hence the reachability probe below: an
// unreachable daemon has to SKIP in a second, not block for three minutes.
// ?lang=en: the cards below are read by their English labels, and the page
// speaks the person's set language (zh-Hans here since 2026-10-15) otherwise.
const URL = process.env.CFO_URL || 'http://localhost:9527/apps/cfo/scripts/cfo.html?lang=en';

if (!existsSync(CHROME)) { console.log('SKIP — Chrome not found at', CHROME); process.exit(0); }
// Accounts, rules and reverts come from the edit register, as the page reads
// them (accounts.json is retired) — see tests/lib/live-data.mjs.
const live = loadLive();
if (!live || !live.rows.length) { console.log('SKIP — no live ledger to compare against'); process.exit(0); }

// Ask before committing Chrome to it: a listening-but-wedged daemon is exactly
// the case a plain connect can't distinguish from a healthy one.
try {
  const res = await fetch(URL, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) { console.log(`SKIP — ${URL} answered ${res.status}`); process.exit(0); }
} catch (e) {
  console.log(`SKIP — no daemon answering at ${URL} (${e.name === 'TimeoutError' ? 'timed out' : e.message})`);
  process.exit(0);
}

// Rendered in REAL time over the DevTools protocol, waiting for the head cards.
// Not `--dump-dom --virtual-time-budget`: the page's data comes over WebRTC, and
// on a virtual clock the ICE-gather cap fires before any real candidate, so the
// channel never opened and every card read "undefined" (red in check.sh all of
// 2026-10-26). The daemon answered, so a page that never renders is a FAILURE.
const dom = await renderPage(CHROME, URL, { ready: "document.querySelector('#cards .k') && !document.getElementById('report').hidden" });
if (!dom) { console.log(`❌ ${URL} answered but the report never rendered (30 s) — open it and read the console`); process.exit(1); }

const cards = Object.fromEntries(
  [...dom.matchAll(/<div class="k">([^<]+)<\/div><div class="v">([^<]+?)(?:<span[^>]*>([^<]*)<\/span>)?<\/div>/g)]
    .map((m) => [m[1], m[2] + (m[3] || '')]),
);
const subsLine = (dom.match(/(\d+ active(?: · \d+ stopped)?)/) || [])[1] || '';

const { rows, accounts, opts } = live;
// The head cards cover the SELECTED range, so recompute for the range the page
// actually resolved — it publishes it on #range-bar for exactly this reason.
// Rates (subscriptions, commitments) stay full-history on the page, so they
// still compare against the unranged report.
const m = dom.match(/id="range-bar"[^>]*data-range="([^"]+)"/);
const shown = m && m[1] !== 'all' ? { from: m[1].split('..')[0], to: m[1].split('..')[1] } : null;
const view = viewFromLedger(rows, accounts, opts, shown);
const rep = reportFromLedger(rows, accounts, opts);
console.log(`page range: ${m ? m[1] : '(none published)'}`);
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const expect = {
  Spend: money(view.totals.spend),
  Income: money(view.totals.income),
  Net: money(view.totals.net),
  Subscriptions: '$' + rep.subscription_monthly_total.toFixed(2) + '/mo',
};
const expectSubs = `${rep.active_subscription_count} active${rep.stopped_subscription_count ? ` · ${rep.stopped_subscription_count} stopped` : ''}`;

let fail = 0;
for (const [k, v] of Object.entries(expect)) {
  const got = cards[k];
  const ok = got === v;
  if (!ok) fail++;
  console.log(`${ok ? '✅' : '❌'} ${k}: page "${got}" vs ledger "${v}"`);
}
const subsOk = subsLine === expectSubs;
if (!subsOk) fail++;
console.log(`${subsOk ? '✅' : '❌'} subs: page "${subsLine}" vs ledger "${expectSubs}"`);
console.log(fail ? `\n${fail} MISMATCH(ES)` : '\nrendered page matches the ledger exactly.');
process.exit(fail ? 1 : 0);
