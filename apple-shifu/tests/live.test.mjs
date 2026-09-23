// The System tab's live top row: live.sh's reply parses with the scan's own
// parsers, rates come from two counter readings, and polling pauses whenever
// nobody is looking at the Mac's System tab.
// Run: node --test apple-shifu/tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLive, parseNetCounters, netRate, shouldPoll, fmtRate, cardViews } from '../scripts/live.js';

const here = path.dirname(fileURLToPath(import.meta.url));

// A laptop on battery, from a real `live.sh` reply with the lines trimmed.
const LAPTOP = {
  cpu: 'CPU usage: 12.5% user, 7.25% sys, 80.25% idle ',
  memsize: '17179869184',
  vm: [
    'Mach Virtual Memory Statistics: (page size of 16384 bytes)',
    'Pages free:                                  100000.',
    'Pages active:                                 300000.',
    'Pages wired down:                             100000.',
    'Pages occupied by compressor:                  50000.',
  ].join('\n'),
  pressure: '2',
  df: [
    'Filesystem   1024-blocks       Used Available Capacity iused     ifree %iused  Mounted on',
    '/dev/disk3s5  976562500 781250000  195312500    80% 9029358 967661960    1%   /System/Volumes/Data',
  ].join('\n'),
  batt: "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1)\t64%; discharging; 3:12 remaining present: true",
  iostat: [
    '              disk0              disk4 ',
    '    KB/t  tps  MB/s     KB/t  tps  MB/s ',
    '   40.00  120  4.69     0.00    0  0.00 ',
  ].join('\n'),
  iface: 'en0',
  net: [
    'Name       Mtu   Network       Address            Ipkts Ierrs     Ibytes    Opkts Oerrs     Obytes  Coll',
    'en0        1500  <Link#14>   0a:43:b9:04:3a:de  4031178     0 3939019215  3037067     0 2964586536     0',
  ].join('\n'),
};

test('parseLive: every reading through the scan parsers', () => {
  const r = parseLive(JSON.stringify(LAPTOP));
  assert.equal(r.cpu, 20);                      // 12.5 user + 7.25 sys, rounded
  assert.deepEqual(r.memory, { total_gb: 16, used_gb: 6.9, percent: 43, pressure: 'warn' });
  assert.deepEqual(r.disk, { total_gb: 1000, used_gb: 800, free_gb: 200, percent: 80 });
  assert.equal(r.battery.percent, 64);
  assert.equal(r.battery.status, 'discharging');
  assert.equal(r.battery.remaining, '3:12');
  assert.deepEqual(r.io, { kb_per_transfer: 40, transfers_per_sec: 120, mb_per_sec: 4.69 });
  assert.deepEqual(r.net, { iface: 'en0', bytesIn: 3939019215, bytesOut: 2964586536 });
});

test('parseLive: a desktop Mac has no battery; junk is null, not a throw', () => {
  const r = parseLive({ ...LAPTOP, batt: "Now drawing from 'AC Power'" });
  assert.equal(r.battery, null);
  assert.equal(parseLive('not json'), null);
  assert.equal(parseLive('null'), null);
});

test('parseLive: the last "CPU usage" line wins — the first is since boot', () => {
  const r = parseLive({ ...LAPTOP, cpu: 'CPU usage: 50.0% user, 40.0% sys, 10.0% idle\nCPU usage: 3.0% user, 2.0% sys, 95.0% idle' });
  assert.equal(r.cpu, 5);
});

test('parseNetCounters: a blank Address column does not shift the counters', () => {
  const net = [
    'Name       Mtu   Network       Address            Ipkts Ierrs     Ibytes    Opkts Oerrs     Obytes  Coll',
    'utun3      1380  <Link#20>                          5000     0     900000     4000     0     700000     0',
  ].join('\n');
  assert.deepEqual(parseNetCounters(net), { bytesIn: 900000, bytesOut: 700000 });
  assert.equal(parseNetCounters(''), null);
});

test('live.sh on this Mac: valid JSON the page can read', { skip: process.platform !== 'darwin' }, () => {
  const out = execFileSync(path.join(here, '../scripts/live.sh'), { encoding: 'utf8' });
  assert.ok(out.endsWith('\n'), 'trailing newline for the /api/bash sentinel strip');
  const r = parseLive(out);
  assert.ok(r.cpu >= 0 && r.cpu <= 100);
  assert.ok(r.memory.total_gb > 0);
  assert.ok(r.disk.total_gb > 0);
  assert.ok(r.io);
});

test('netRate: bytes per second from two readings', () => {
  const a = { iface: 'en0', bytesIn: 1_000_000, bytesOut: 500_000, at: 10_000 };
  const b = { iface: 'en0', bytesIn: 6_000_000, bytesOut: 750_000, at: 15_000 };
  assert.deepEqual(netRate(a, b), { down: 1_000_000, up: 50_000 });
});

test('netRate: no honest rate after a pause, an interface change or a reset', () => {
  const a = { iface: 'en0', bytesIn: 1000, bytesOut: 1000, at: 0 };
  assert.equal(netRate(null, a), null);
  assert.equal(netRate(a, { ...a, at: 60_000, bytesIn: 9000 }), null);        // long gap
  assert.equal(netRate(a, { ...a, iface: 'en1', at: 5000 }), null);           // switched network
  assert.equal(netRate(a, { ...a, bytesIn: 10, at: 5000 }), null);            // counters reset
  assert.equal(netRate(a, { ...a, at: 0 }), null);                            // no time passed
});

test('shouldPoll: only the Mac System tab, in view, between scans, one call at a time', () => {
  const on = { tab: 'system', source: 'mac', visible: true, scanning: false, inFlight: false, hasCards: true };
  assert.equal(shouldPoll(on), true);
  assert.equal(shouldPoll({ ...on, tab: 'files' }), false);
  assert.equal(shouldPoll({ ...on, source: 'phone' }), false);
  assert.equal(shouldPoll({ ...on, visible: false }), false);
  assert.equal(shouldPoll({ ...on, scanning: true }), false);
  assert.equal(shouldPoll({ ...on, inFlight: true }), false);
  assert.equal(shouldPoll({ ...on, hasCards: false }), false);
});

test('fmtRate: Apple decimal units', () => {
  assert.equal(fmtRate(0), '0 KB/s');
  assert.equal(fmtRate(40_400), '40 KB/s');
  assert.equal(fmtRate(1_250_000), '1.3 MB/s');
  assert.equal(fmtRate(null), '--');
});

test('cardViews: live numbers, scan-only parts kept from the scan', () => {
  const r = parseLive(LAPTOP);
  const v = cardViews(r, { down: 1_200_000, up: 40_000 }, { cpu: { label: 'M4 · 10 cores' }, battery: { cycles: 212 } });
  assert.equal(v.cpu.value, '20%');
  assert.equal(v.cpu.sub, 'M4 · 10 cores');
  assert.equal(v.memory.sub, '6.9 / 16 GB');
  assert.equal(v.memory.title, 'Memory pressure: warn');
  assert.equal(v.disk.value, '80%');
  assert.equal(v.battery.sub, '212 cycles · 3:12 left');
  assert.equal(v.network.sub, '↓ 1.2 MB/s · ↑ 40 KB/s');
  assert.equal(v.io.value, '4.69 MB/s');
  assert.equal(cardViews(r, null).network, undefined);   // first reading: no rate yet
});
