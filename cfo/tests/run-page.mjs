#!/usr/bin/env node
// run-page.mjs — end-to-end RENDERED-PAGE check: load the live CFO page in
// headless Chrome, read the KPI cards out of the real DOM, and compare them to
// an independent recompute from the on-disk ledger. Closes the gap that the
// node suites can't cover (the browser render layer).
//
//   node tests/run-page.mjs            # needs the daemon on :9898 + Chrome
//
// Skips gracefully (exit 0 with a notice) when Chrome or the server is absent.

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { reportFromLedger, viewFromLedger } from '../scripts/ledger.js';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.CFO_URL || 'http://localhost:9898/apps/cfo/scripts/cfo.html';
const DATA = join(process.env.HOME, '.linggen/skills/cfo/data');

if (!existsSync(CHROME)) { console.log('SKIP — Chrome not found at', CHROME); process.exit(0); }
if (!existsSync(join(DATA, 'ledger'))) { console.log('SKIP — no live ledger to compare against'); process.exit(0); }

// The page opens a WebRTC channel, so headless rendering can take a while —
// generous timeout, and keep whatever DOM Chrome managed to dump even when it
// exits non-zero (it often does after --virtual-time-budget).
let dom;
try {
  dom = execFileSync(CHROME,
    ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=/tmp/cfo-page-test-${process.pid}`,
     '--virtual-time-budget=20000', '--dump-dom', URL],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 180000 });
} catch (e) { dom = e.stdout || ''; }
if (!dom || !dom.includes('id="report"')) { console.log('SKIP — could not render', URL, '(is the daemon running?)'); process.exit(0); }

const cards = Object.fromEntries(
  [...dom.matchAll(/<div class="k">([^<]+)<\/div><div class="v">([^<]+?)(?:<span[^>]*>([^<]*)<\/span>)?<\/div>/g)]
    .map((m) => [m[1], m[2] + (m[3] || '')]),
);
const subsLine = (dom.match(/(\d+ active(?: · \d+ stopped)?)/) || [])[1] || '';

const rows = [];
for (const f of readdirSync(join(DATA, 'ledger'))) {
  for (const l of readFileSync(join(DATA, 'ledger', f), 'utf8').split('\n')) if (l.trim()) rows.push(JSON.parse(l));
}
const accounts = JSON.parse(readFileSync(join(DATA, 'accounts.json'), 'utf8'));
// The head cards cover the SELECTED range, so recompute for the range the page
// actually resolved — it publishes it on #range-bar for exactly this reason.
// Rates (subscriptions, commitments) stay full-history on the page, so they
// still compare against the unranged report.
const m = dom.match(/id="range-bar"[^>]*data-range="([^"]+)"/);
const shown = m && m[1] !== 'all' ? { from: m[1].split('..')[0], to: m[1].split('..')[1] } : null;
const view = viewFromLedger(rows, accounts, {}, shown);
const rep = reportFromLedger(rows, accounts);
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
