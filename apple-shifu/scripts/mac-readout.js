// The Mac's system readout, in the same shape the phone's Shifu produces.
//
// One schema, two hosts. Yinyue pulls `get_environment` on the phone and gets
// `{ score, readings[], notes[] }`; ling reads this file through the
// SystemReadout tool and gets the same thing about the Mac. An agent that
// learns to read one has learned to read the other, and a rule written for one
// — do not fill in an unreadable row, mark what you looked up — binds both.
//
// Built from the `results` object the dashboard itself was built from, so the
// agent and the user are looking at one scan and not two.

/** A row that was read off this machine. */
function measured(id, group, label, value, detail) {
  return { id, group, label, value, detail, source: 'measured' };
}

/**
 * A row that is true of this model rather than read from this unit.
 *
 * The Mac has real ones and the phone does not: the machine's age is inferred
 * from the chip generation (an M4 means 2024), which is a table, not a
 * reading. Marking it is the difference between telling someone their Mac is
 * two years old and telling them Macs with this chip are.
 */
function lookedUp(id, group, label, value, detail) {
  return { id, group, label, value, detail, source: 'looked_up' };
}

/** A row this machine could not answer, kept on the list with the reason. */
function unreadable(id, group, label, why, whereToLook) {
  return {
    id,
    group,
    label,
    unreadable: why,
    where_to_look: whereToLook,
    source: 'measured',
  };
}

function gb(value) {
  return value == null ? null : `${value} GB`;
}

/**
 * Turn a completed scan into the readout an agent reads.
 *
 * Sections a scan mode did not run are absent rather than empty: a quick scan
 * has no security block, and inventing six passing checks for it would be the
 * worst kind of wrong.
 */
export function buildReadout(results, score, breakdown) {
  const r = results || {};
  const rows = [];

  // ── Storage ──
  if (r.disk) {
    rows.push(measured(
      'disk', 'Storage', 'Free space', gb(r.disk.free_gb),
      `of ${r.disk.total_gb} GB · ${100 - r.disk.percent}% free`,
    ));
  }
  for (const dir of (r.disk?.top_dirs || []).slice(0, 8)) {
    rows.push(measured(
      `dir:${dir.path}`, 'Storage', dir.path, gb(dir.size_gb), null,
    ));
  }
  const reclaimable = (r.garbage || []).filter((g) => g.risk === 'safe');
  if (reclaimable.length) {
    const total = reclaimable.reduce((sum, g) => sum + (g.size_gb || 0), 0);
    rows.push(measured(
      'reclaimable', 'Storage', 'Safe to delete', gb(+total.toFixed(1)),
      reclaimable.map((g) => g.path).join(' · '),
    ));
  }

  // ── Device ──
  const hw = r.hardware || {};
  if (hw.modelName) {
    rows.push(measured('model', 'Device', 'Model', hw.modelName, hw.modelId));
  }
  if (hw.chip) rows.push(measured('chip', 'Device', 'Chip', hw.chip, null));
  if (hw.age != null) {
    // The one row on this panel that is not a reading. `system_profiler` never
    // says when the machine was made; the year comes from what chip it has.
    rows.push(lookedUp(
      'age', 'Device', 'Age', `about ${hw.age} year${hw.age === 1 ? '' : 's'}`,
      `Inferred from the ${hw.chip} generation (${hw.year}), not read from `
      + 'this machine. The true purchase date is in the warranty record.',
    ));
  }
  if (r.system?.os) rows.push(measured('os', 'Device', 'macOS', r.system.os, null));
  if (r.system?.uptime) {
    rows.push(measured('uptime', 'Device', 'Uptime', r.system.uptime, 'Since the last restart.'));
  }

  // ── Battery ──
  const battery = r.battery || {};
  if (battery.percent != null) {
    rows.push(measured(
      'battery', 'Device', 'Charge', `${battery.percent}%`,
      [battery.status, battery.source, battery.remaining && `${battery.remaining} remaining`]
        .filter(Boolean).join(' · '),
    ));
  }
  if (battery.cycleCount != null) {
    // A Mac gives this up and an iPhone does not — worth the agent knowing,
    // because the same question gets a real answer on one end and a Settings
    // path on the other.
    rows.push(measured(
      'battery_cycles', 'Device', 'Battery cycles', `${battery.cycleCount}`,
      'Apple rates most modern Mac batteries for 1,000 cycles.',
    ));
  } else if (battery.percent != null) {
    rows.push(unreadable(
      'battery_cycles', 'Device', 'Battery cycles',
      'ioreg reported no cycle count on this machine.',
      'System Settings › General › About › System Report › Power',
    ));
  }
  // Only where there is a battery. A desktop has none, and telling its owner
  // we cannot read the health of a part they do not have is clutter wearing
  // honesty's clothes — the same reason the score drops battery out entirely
  // on a Mac mini rather than scoring it zero.
  if (battery.percent != null) {
    rows.push(unreadable(
      'battery_health', 'Device', 'Battery health',
      'This scan does not read maximum capacity.',
      'System Settings › Battery › Battery Health',
    ));
  }

  // ── Processor ──
  const sys = r.system || {};
  if (sys.cpuBrand) {
    rows.push(measured(
      'cpu', 'Processor', 'CPU', sys.cpuBrand,
      sys.cpuCores ? `${sys.cpuCores} cores · ${sys.arch}` : sys.arch,
    ));
  }
  if (sys.cpuUsage != null) {
    rows.push(measured(
      'cpu_usage', 'Processor', 'Load', `${sys.cpuUsage}%`,
      sys.loadAvg?.length ? `Load average ${sys.loadAvg.join(' · ')}` : null,
    ));
  }

  // ── Graphics ──
  const gpu = r.gpu || {};
  if (gpu.chipset) {
    rows.push(measured(
      'gpu', 'Graphics', 'GPU', gpu.chipset,
      [gpu.cores ? `${gpu.cores} cores` : null, gpu.metal].filter(Boolean).join(' · '),
    ));
  }

  // ── Memory ──
  if (sys.memory?.total_gb) {
    rows.push(measured(
      'memory', 'Memory', 'Memory', `${sys.memory.used_gb} GB in use`,
      `of ${sys.memory.total_gb} GB · ${sys.memory.percent}%`,
    ));
  }
  if (r.performance?.swapUsedMb != null) {
    rows.push(measured(
      'swap', 'Memory', 'Swap', `${r.performance.swapUsedMb} MB`,
      'Steady swap under light use is the sign worth acting on, not the number itself.',
    ));
  }

  // ── Network ──
  if (r.network?.ip) {
    rows.push(measured('ip', 'Network', 'Address', r.network.ip, r.network.iface));
  }
  if (r.network?.wifi) {
    rows.push(measured('wifi', 'Network', 'Wi-Fi', r.network.wifi, null));
  }

  // ── Security ──
  for (const check of r.security?.checks || []) {
    rows.push(measured(
      `sec:${check.label}`, 'Security', check.label, check.detail,
      check.status === 'green' ? null : 'Worth a look.',
    ));
  }

  // ── Performance ──
  for (const proc of (r.performance?.memProcs || []).slice(0, 5)) {
    rows.push(measured(
      `mem:${proc.name}`, 'Performance', proc.name, `${proc.memory_mb} MB`, null,
    ));
  }

  return {
    scanned_at: new Date().toISOString(),
    score: score == null ? null : { value: score, breakdown: breakdown || null },
    readings: rows,
    notes: NOTES,
  };
}

/**
 * What the agent must not do with this, carried with the data rather than left
 * to a system prompt that a later edit could quietly drop. Deliberately the
 * same rules the phone sends, minus the ones that are only true of iOS.
 */
const NOTES = [
  'Rows marked `measured` were read off this machine in this scan. Rows marked '
  + '`looked_up` are true of the model, not read from the unit — say so rather '
  + 'than presenting them as findings about their machine.',
  'Anything you add from elsewhere — what a chip is normally paired with, what '
  + 'a battery is usually like at this age, what a part costs — is yours, and '
  + 'you must say so.',
  'A row marked unreadable stays unreadable. Do not estimate a value for it; '
  + 'give the user the path under `where_to_look` instead.',
  'This is one scan, and it has a timestamp. If it is stale, say when it ran '
  + 'rather than describing old numbers as current.',
];
