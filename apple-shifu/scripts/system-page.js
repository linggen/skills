// The System tab's page, built from the scan by code.
//
// The page shows the facts it holds; the agent tells (2026-09-09, and the
// Health rules this app now follows). A scan used to send the agent a hidden
// turn whose only job was to re-type these numbers into widgets — slow, paid,
// and the one place a figure could be misread on its way to the screen. Now
// this module draws the scan as it came, and the agent only comments.
//
// Pure: no DOM, no fetch. doctor.js renders what comes back; the tests read it.

// ── formatting ──

export function fmtGb(gb) {
  if (gb == null || isNaN(gb)) return '--';
  if (gb >= 1000) return `${(gb / 1000).toFixed(1)} TB`;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  if (gb >= 0.001) return `${Math.round(gb * 1000)} MB`;
  return '0 MB';
}

/** Percent of the volume still free — free over total, the figure Finder's
    "available" means. df's own "capacity" column leaves out purgeable space
    and reads a point or two worse. */
export function freePercent(disk) {
  if (!disk?.total_gb || disk.free_gb == null) return null;
  return Math.round((disk.free_gb / disk.total_gb) * 1000) / 10;
}

/** Under this much free, the disk is a warning rather than a reading: macOS
    starts failing updates and swapping hard well before zero. */
export const LOW_DISK_PCT = 10;

export function isLowDisk(disk) {
  const pct = freePercent(disk);
  return pct != null && pct < LOW_DISK_PCT;
}

// ── the details view: every row of the scan ──

export function topBar(r) {
  const out = [];
  const s = r.system;
  if (s) {
    const chip = r.hardware?.chip || s.cpuBrand;
    out.push({ widget: 'cpu', data: { value: s.cpuUsage ?? 0, label: [chip, s.cpuCores ? `${s.cpuCores} cores` : ''].filter(Boolean).join(' · ') } });
    if (s.memory?.total_gb) {
      out.push({ widget: 'memory', data: { value: s.memory.percent, used: s.memory.used_gb, total: s.memory.total_gb } });
    }
  }
  if (r.disk) out.push({ widget: 'disk', data: { value: r.disk.percent, used: r.disk.used_gb, total: r.disk.total_gb } });
  if (r.battery?.percent != null) {
    out.push({ widget: 'battery', data: { value: r.battery.percent, cycles: r.battery.cycleCount || null, status: r.battery.source || r.battery.status || '' } });
  }
  if (r.healthScore != null) out.push({ widget: 'score', data: { value: r.healthScore, label: 'of 100' } });
  if (r.network?.ip) out.push({ widget: 'network', data: { wifi: r.network.wifi, ip: r.network.ip } });
  if (r.gpu?.chipset) out.push({ widget: 'gpu', data: { cores: r.gpu.cores, metal: r.gpu.metal, chipset: r.gpu.chipset } });
  if (r.io) out.push({ widget: 'io', data: r.io });
  return out;
}

export function infoWidget(r) {
  const hw = r.hardware || {};
  const s = r.system || {};
  const fields = [];
  if (hw.chip || s.cpuBrand) fields.push({ label: 'Chip', value: hw.chip || s.cpuBrand });
  if (s.memory?.total_gb) fields.push({ label: 'Memory', value: `${s.memory.total_gb} GB` });
  if (s.os) fields.push({ label: 'System', value: s.os });
  if (s.uptime) fields.push({ label: 'Up', value: s.uptime });
  // Inferred from the chip generation — a table, not a reading, and labelled so.
  if (hw.age != null) fields.push({ label: 'Age', value: `about ${hw.age} years (from the chip)` });
  if (!fields.length) return null;
  return { type: 'info', icon: '💻', title: hw.modelName || s.hostname || 'This Mac', fields };
}

export function diskWidget(disk) {
  if (!disk) return null;
  const items = (disk.top_dirs || []).slice(0, 8)
    .map((d) => ({ label: d.path, value: d.size_gb, max: disk.total_gb }));
  return { type: 'bars', title: 'Disk Usage', badge: `${fmtGb(disk.free_gb)} free`, items };
}

export function securityWidget(sec) {
  if (!sec?.checks?.length) return null;
  return {
    type: 'scorecard',
    title: 'Security',
    badge: `${sec.passing}/${sec.total} passing`,
    items: sec.checks.map((c) => ({ label: c.label, status: c.status, detail: c.detail })),
  };
}

/** A cache path to the page's own Cleanup id — the renderer writes the command
    for these ids and for nothing else. */
const CACHE_IDS = [
  [/\/\.Trash$/, 'empty-trash', 'The Trash'],
  [/\/Library\/Caches$/, 'library-caches', 'App caches'],
  [/\/Xcode\/DerivedData$/, 'xcode-derived-data', 'Xcode DerivedData'],
  [/\/CoreSimulator$/, 'ios-simulators', 'iOS simulators'],
];

export function cleanupWidget(caches) {
  const items = [];
  for (const c of caches || []) {
    const hit = CACHE_IDS.find(([re]) => re.test(c.path));
    if (!hit || !(c.size_gb >= 0.1)) continue;
    items.push({ id: hit[1], title: hit[2], description: c.path.replace(/^\/Users\/[^/]+/, '~'), savings_gb: c.size_gb });
  }
  if (!items.length) return null;
  items.sort((a, b) => b.savings_gb - a.savings_gb);
  const total = items.reduce((s, i) => s + i.savings_gb, 0);
  return { type: 'recommendations', title: 'Cleanup', badge: fmtGb(total), items };
}

// ── Apps to Review: the rule the agent used to apply by hand, in code ──

/** "1.4G" / "120M" / "8K" → GB (Apple's decimal GB). */
export function sizeToGb(s) {
  const m = /^([\d.]+)\s*([KMGT])?/i.exec(String(s || '').trim());
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const mult = { K: 1e-6, M: 1e-3, G: 1, T: 1e3 }[(m[2] || 'M').toUpperCase()];
  return n * mult;
}

const MAINTENANCE = /uninstall|updater|helper|daemon/i;
const APPLE_BUNDLED = /^(Pages|Numbers|Keynote|GarageBand|iMovie|Music)\.app$/;
const PAID_SUITE = /^Microsoft |^Adobe /;
const DORMANT_DAYS = 90;
const MIN_NEVER_GB = 0.05;
const APPS_CAP = 12;

function appNote(name) {
  if (APPLE_BUNDLED.test(name)) return 'Apple bundled — keep if you ever might use it.';
  if (PAID_SUITE.test(name)) return 'Paid suite — check the license before removing.';
  return 'Not opened recently.';
}

/** Lines of `<last-used>\t<size>\t<name>` → the Apps to Review widget, or
    null. Never-opened apps of 50 MB and up, and anything unopened for 90
    days; maintenance entries left out. The command only ever moves an app to
    the Trash — recoverable — and the renderer accepts no other shape. */
export function appsWidget(raw, now = Date.now()) {
  const items = [];
  for (const line of String(raw || '').split('\n')) {
    const [used, size, name] = line.split('\t');
    if (!name || MAINTENANCE.test(name)) continue;
    const gb = sizeToGb(size);
    let when = null;
    if (used === 'never') {
      if (gb < MIN_NEVER_GB) continue;
    } else {
      const t = Date.parse(used.replace(' +0000', 'Z').replace(' ', 'T'));
      if (!Number.isFinite(t) || now - t < DORMANT_DAYS * 86400e3) continue;
      when = new Date(t).toISOString().slice(0, 10);
    }
    items.push({
      title: name,
      description: `Last opened ${when || '— never'} · ${fmtGb(gb)} · ${appNote(name)}`,
      savings_gb: +gb.toFixed(3),
      risk: 'review',
      command: `mv -i "/Applications/${name}" ~/.Trash/`,
    });
  }
  if (!items.length) return null;
  items.sort((a, b) => b.savings_gb - a.savings_gb);
  const shown = items.slice(0, APPS_CAP);
  const total = shown.reduce((s, i) => s + i.savings_gb, 0);
  return {
    type: 'recommendations',
    title: 'Apps to Review',
    badge: `${shown.length} app${shown.length === 1 ? '' : 's'} · ${fmtGb(total)}`,
    items: shown,
  };
}

export function processesWidget(perf) {
  const procs = perf?.memProcs || [];
  if (!procs.length) return null;
  const cpu = new Map((perf.cpuProcs || []).map((p) => [p.name, p.cpu_percent]));
  return {
    type: 'table',
    title: 'Top processes',
    badge: perf.swapUsedMb > 0 ? `swap ${fmtGb(perf.swapUsedMb / 1000)}` : '',
    columns: ['Process', 'Memory', 'CPU'],
    rows: procs.slice(0, 8).map((p) => [p.name, fmtGb(p.memory_mb / 1000), cpu.has(p.name) ? `${cpu.get(p.name)}%` : '']),
  };
}

export function footer(r) {
  const hw = r.hardware || {};
  const bits = [hw.modelName, hw.chip || r.system?.cpuBrand, r.system?.os].filter(Boolean);
  return bits.length ? { text: bits.join(' · ') } : null;
}

/** The whole details view from one scan. */
export function buildSystemPage(r) {
  const body = [
    infoWidget(r),
    diskWidget(r.disk),
    securityWidget(r.security),
    cleanupWidget(r.caches),
    appsWidget(r.applicationsRaw),
    processesWidget(r.performance),
  ].filter(Boolean);
  return { top_bar: topBar(r), body, footer: footer(r) };
}
