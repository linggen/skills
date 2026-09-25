// The System page is drawn from the scan by code, and what a scan hands the
// agent is facts. Run: node --test apple-shifu/tests/
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSystemPage, appsWidget, cleanupWidget, sizeToGb, freePercent, isLowDisk,
} from '../scripts/system-page.js';
import { reportPrompt, grewSince, scanFacts, parseClearableSummary } from '../scripts/scan-report.js';

const NOW = Date.parse('2026-09-25T12:00:00Z');

const RESULTS = {
  system: { os: 'macOS 26.0', cpuBrand: 'Apple M4 Max', cpuCores: 16, cpuUsage: 12, memory: { percent: 41, used_gb: 26.2, total_gb: 64 }, uptime: '3 days', hostname: 'mac' },
  hardware: { modelName: 'MacBook Pro', chip: 'Apple M4 Max', age: 1 },
  disk: { total_gb: 1995.2, used_gb: 1895.9, free_gb: 99.3, percent: 95, top_dirs: [{ path: '~/workspace', size_gb: 900.1 }, { path: '~/Library', size_gb: 300.5 }] },
  caches: [{ path: '/Users/a/Library/Caches', size_gb: 12.4 }, { path: '/Users/a/.Trash', size_gb: 0.05 }],
  battery: { percent: 100, source: 'AC', cycleCount: 131 },
  security: { checks: [{ label: 'Firewall', status: 'yellow', detail: 'off' }, { label: 'SIP', status: 'green', detail: 'enabled' }], passing: 1, total: 2 },
  performance: { memProcs: [{ name: 'Chrome', memory_mb: 2100 }], cpuProcs: [{ name: 'Chrome', cpu_percent: 8 }], swapUsedMb: 0 },
  healthScore: 53,
};

test('the page draws every scanned section with the measured figures', () => {
  const page = buildSystemPage(RESULTS);
  const types = page.body.map((w) => w.title || w.type);
  assert.deepEqual(types, ['MacBook Pro', 'Disk Usage', 'Security', 'Cleanup', 'Top processes']);
  const disk = page.top_bar.find((w) => w.widget === 'disk');
  assert.equal(disk.data.value, 95);
  assert.equal(page.body[1].badge, '99.3 GB free');
  assert.equal(page.body[2].badge, '1/2 passing');
});

test('a quick scan with no security block draws no Security card', () => {
  const { security, ...quick } = RESULTS;
  assert.ok(!buildSystemPage(quick).body.some((w) => w.title === 'Security'));
});

test('cleanup offers only the ids whose commands the page writes, small ones left out', () => {
  const w = cleanupWidget(RESULTS.caches);
  assert.deepEqual(w.items.map((i) => i.id), ['library-caches']);
  assert.equal(w.items[0].description, '~/Library/Caches');
});

test('apps to review: never-opened big apps and 90-day dormant ones, maintenance left out', () => {
  const raw = [
    'never\t1.4G\tGarageBand.app',
    'never\t20M\tTiny.app',
    'never\t15M\tUninstall AWS VPN Client.app',
    'never\t300M\tFoo Helper.app',
    '2023-07-25 09:11:28 +0000\t417M\tFirefox.app',
    '2026-09-20 09:11:28 +0000\t900M\tRecent.app',
    'never\t1.0G\tMicrosoft Teams.app',
  ].join('\n');
  const w = appsWidget(raw, NOW);
  assert.deepEqual(w.items.map((i) => i.title), ['GarageBand.app', 'Microsoft Teams.app', 'Firefox.app']);
  assert.match(w.items[0].description, /Apple bundled/);
  assert.match(w.items[1].description, /license/);
  assert.match(w.items[2].description, /2023-07-25/);
  for (const i of w.items) assert.equal(i.command, `mv -i "/Applications/${i.title}" ~/.Trash/`);
  assert.equal(w.badge, '3 apps · 2.8 GB');
});

test('sizes are Apple GB', () => {
  assert.equal(sizeToGb('1.4G'), 1.4);
  assert.equal(sizeToGb('120M'), 0.12);
});

test('low disk is under 10% free, free over total', () => {
  assert.equal(freePercent(RESULTS.disk), 5);
  assert.ok(isLowDisk(RESULTS.disk));
  assert.ok(!isLowDisk({ total_gb: 1000, free_gb: 150 }));
});

test('what grew: folders up a GB or more since last scan', () => {
  const g = grewSince([{ path: '~/workspace', size_gb: 890 }, { path: '~/Library', size_gb: 300 }], RESULTS.disk.top_dirs);
  assert.deepEqual(g, [{ path: '~/workspace', grew_gb: 10.1, size_gb: 900.1 }]);
});

test('the report is facts and asks for words only', () => {
  const prev = { at: NOW - 2 * 86400e3, disk: { free_gb: 110, total_gb: 1995.2, top_dirs: [{ path: '~/workspace', size_gb: 890 }] }, score: 55 };
  const now = scanFacts(RESULTS, NOW);
  const text = reportPrompt({ kind: 'full', prev, now, clearable: { safe_gb: 423.4, review_gb: 517, finished: '2026-09-23 14:56' }, backup: { count: 1204 } });
  assert.match(text, /^\[SHIFU_SCAN\]/);
  assert.match(text, /no PageUpdate/);
  assert.match(text, /99\.3 GB free .* was 110\.0 GB/);
  assert.match(text, /WARNING: under 10% free/);
  assert.match(text, /~\/workspace \+10\.1 GB/);
  assert.match(text, /423\.4 GB safe/);
  assert.match(text, /1,204/);
  assert.match(text, /Firewall off/);
});

test('the Files tab summary reads back as totals', () => {
  const c = parseClearableSummary('Clearable scan · finished 2026-09-23 14:56 in 213s\nsafe 423.4 GB · review 517.0 GB · careful 0 KB\n');
  assert.deepEqual(c, { safe_gb: 423.4, review_gb: 517, finished: '2026-09-23 14:56', running: false });
  assert.equal(parseClearableSummary(''), null);
});
