// Live top row — the System tab's CPU, memory, disk, battery, network and IO
// cards refresh every few seconds from scripts/live.sh while you look at them.
//
// Only the numbers move: each tick rewrites a card's value, sub line and bar
// in place, never the page. GPU and the health score stay the scan's, and so
// does Ling — her SystemReadout is the last full scan, not this.
//
// live.sh hands back raw lines; they are parsed here with the scan's own
// parsers (scan.js), so a live figure and a scan figure never disagree by
// parse. Everything above the DOM section is pure and tested.

import {
  bash, parseCpuUsage, parseMemory, parseDiskUsage, parseBatteryInfo, parseIoStats,
} from './scan.js';

const LIVE_SH = '"$HOME"/.linggen/skills/apple-shifu/scripts/live.sh';
export const LIVE_EVERY_MS = 5_000;
// A rate over a longer gap than this (a pause, a hidden tab) is an average of
// the pause, not now — drop it and wait for the next pair.
const RATE_MAX_GAP_MS = 15_000;
// The daemon ends a stuck call here, so one hang can't hold every later tick.
const LIVE_TIMEOUT_MS = 15_000;
const PRESSURE = { 1: 'normal', 2: 'warn', 4: 'critical' };

// ── Parse ──

/** Byte counters from `netstat -ibn` header + Link row. Columns are found by
    header name counted from the right: the Address column can be blank. */
export function parseNetCounters(netOut) {
  const [head, row] = (netOut || '').trim().split('\n');
  if (!head || !row) return null;
  const cols = head.trim().split(/\s+/);
  const vals = row.trim().split(/\s+/);
  const at = (name) => {
    const fromRight = cols.length - cols.indexOf(name);
    return parseInt(vals[vals.length - fromRight], 10);
  };
  const bytesIn = at('Ibytes');
  const bytesOut = at('Obytes');
  if (!Number.isFinite(bytesIn) || !Number.isFinite(bytesOut)) return null;
  return { bytesIn, bytesOut };
}

/** One live.sh reply (JSON text or object) to readings; null if unreadable. */
export function parseLive(raw) {
  let r = raw;
  if (typeof raw === 'string') {
    try { r = JSON.parse(raw); } catch { return null; }
  }
  if (!r || typeof r !== 'object') return null;
  const memory = parseMemory(r.memsize, r.vm);
  const battery = parseBatteryInfo(r.batt || '');
  const net = parseNetCounters(r.net);
  return {
    cpu: parseCpuUsage(r.cpu),
    memory: { ...memory, pressure: PRESSURE[parseInt(r.pressure, 10)] || null },
    disk: parseDiskUsage(r.df || ''),
    battery: battery.percent == null ? null : battery,
    io: parseIoStats(r.iostat || ''),
    net: net ? { iface: r.iface || null, ...net } : null,
  };
}

/** Down/up bytes per second from two counter readings `{iface, bytesIn,
    bytesOut, at}`; null when there is no honest rate to give. */
export function netRate(prev, next, maxGapMs = RATE_MAX_GAP_MS) {
  if (!prev || !next || prev.iface !== next.iface) return null;
  const dt = (next.at - prev.at) / 1000;
  if (!(dt > 0) || dt * 1000 > maxGapMs) return null;
  const down = next.bytesIn - prev.bytesIn;
  const up = next.bytesOut - prev.bytesOut;
  if (down < 0 || up < 0) return null;   // counters reset (sleep, re-join)
  return { down: down / dt, up: up / dt };
}

/** Poll only while someone is looking at the Mac's System tab with cards to
    refresh, no scan owns the machine, and the last call has come back. */
export function shouldPoll({ tab, source, visible, scanning, inFlight, hasCards }) {
  return tab === 'system' && source === 'mac' && visible && hasCards && !scanning && !inFlight;
}

/** Bytes/s in Apple's decimal units: "0 KB/s", "40 KB/s", "1.2 MB/s". */
export function fmtRate(bps) {
  if (bps == null || !Number.isFinite(bps)) return '--';
  if (bps >= 1e6) return `${(bps / 1e6).toFixed(1)} MB/s`;
  return `${Math.round(bps / 1e3)} KB/s`;
}

function barColor(pct) {
  if (pct > 90) return 'var(--danger)';
  if (pct > 75) return 'var(--warning)';
  return 'var(--accent)';
}

function batteryColor(pct) {
  if (pct < 50) return 'var(--danger)';
  if (pct < 80) return 'var(--warning)';
  return 'var(--success)';
}

function batteryState(b) {
  if (/^charging/i.test(b.status || '')) return 'Charging';
  if (/charged|finishing/i.test(b.status || '')) return 'Charged';
  if (/discharging/i.test(b.status || '')) return b.remaining ? `${b.remaining} left` : 'On battery';
  return /AC/.test(b.source || '') ? 'AC' : 'Battery';
}

/** What each live card shows, keyed by top-bar widget. `scan` is the card's
    own scan data, for the parts that stay the scan's (cycles, CPU label). */
export function cardViews(reading, rate, scan = {}) {
  const v = {};
  const { memory: m, disk: d, battery: b, io } = reading;
  v.cpu = { value: `${reading.cpu}%`, sub: scan.cpu?.label, bar: reading.cpu, color: barColor(reading.cpu) };
  if (m.total_gb) {
    v.memory = {
      value: `${m.percent}%`, sub: `${m.used_gb} / ${m.total_gb} GB`, bar: m.percent, color: barColor(m.percent),
      title: m.pressure ? `Memory pressure: ${m.pressure}` : undefined,
    };
  }
  if (d) v.disk = { value: `${d.percent}%`, sub: `${d.used_gb} / ${d.total_gb} GB`, bar: d.percent, color: barColor(d.percent) };
  if (b) {
    const cycles = scan.battery?.cycles ? `${scan.battery.cycles} cycles · ` : '';
    v.battery = { value: `${b.percent}%`, sub: cycles + batteryState(b), bar: b.percent, color: batteryColor(b.percent) };
  }
  if (rate) v.network = { sub: `↓ ${fmtRate(rate.down)} · ↑ ${fmtRate(rate.up)}` };
  if (io) v.io = { value: `${io.mb_per_sec} MB/s`, sub: `${io.transfers_per_sec} ops/s` };
  return v;
}

// ── DOM ──

/** Rewrite one card's text and bar in place; the node and its size stay. */
function paintCard(card, view) {
  const value = card.querySelector('.card-value');
  const sub = card.querySelector('.card-sub');
  const fill = card.querySelector('.card-bar-fill');
  if (value && view.value != null) {
    value.textContent = view.value;
    value.style.color = view.color && view.bar > 75 ? view.color : '';
  }
  if (sub && view.sub != null) sub.textContent = view.sub;
  if (fill && view.bar != null) {
    fill.style.width = `${Math.min(100, view.bar)}%`;
    fill.style.background = view.color || 'var(--accent)';
  }
  if (view.title) card.title = view.title;
  if (!card.querySelector('.live-dot')) {
    const dot = document.createElement('span');
    dot.className = 'live-dot';
    dot.title = 'Live';
    card.appendChild(dot);
  }
}

function liveCards() {
  const cards = {};
  for (const c of document.querySelectorAll('#top-bar-area .top-bar-card[data-widget]')) {
    cards[c.dataset.widget] = c;
  }
  return cards;
}

function paintAll(reading, rate, stale) {
  const cards = liveCards();
  const scan = Object.fromEntries(Object.entries(cards).map(([k, c]) => [k, c._scan || {}]));
  const views = reading ? cardViews(reading, rate, scan) : {};
  for (const [widget, view] of Object.entries(views)) {
    if (cards[widget]) paintCard(cards[widget], view);
  }
  for (const dot of document.querySelectorAll('#top-bar-area .live-dot')) {
    dot.classList.toggle('stale', stale);
  }
}

/** Start the poller. The shell's tab/source getters and listeners come in as
    arguments, with `isScanning` for the page's own scan flag. */
export function startLiveTopBar({ getActiveTab, getSource, onTabChange, onSourceChange, isScanning }) {
  let inFlight = false;
  let reading = null;
  let rate = null;
  let prevNet = null;
  let stale = false;

  const tick = async () => {
    const ok = shouldPoll({
      tab: getActiveTab(), source: getSource(), visible: document.visibilityState === 'visible',
      scanning: isScanning(), inFlight, hasCards: Object.keys(liveCards()).length > 0,
    });
    if (!ok) return;
    inFlight = true;
    try {
      const res = await bash(LIVE_SH, undefined, LIVE_TIMEOUT_MS);
      const next = res?.exit_code === 0 ? parseLive(res.stdout) : null;
      if (!next) throw new Error('live.sh gave nothing');
      const net = next.net ? { ...next.net, at: Date.now() } : null;
      rate = netRate(prevNet, net) || rate;
      prevNet = net;
      reading = next;
      stale = false;
    } catch {
      stale = true;   // keep the last numbers; only the dot says so
    } finally {
      inFlight = false;
    }
    paintAll(reading, rate, stale);
  };

  // The model redraws the row from scan data — put the live numbers back.
  const area = document.getElementById('top-bar-area');
  if (area) new MutationObserver(() => paintAll(reading, rate, stale)).observe(area, { childList: true });

  setInterval(tick, LIVE_EVERY_MS);
  // Coming back to the tab reads at once rather than up to five seconds late.
  onTabChange(tick);
  onSourceChange(tick);
  document.addEventListener('visibilitychange', tick);
  tick();
}
