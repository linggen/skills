// What a finished scan hands the agent: facts, not a layout.
//
// The page has already drawn every figure. The agent's turn is to say what it
// means — what grew, what can go, what is not backed up — in its own words
// (SKILL.md "After a scan"). So this is a short list of measured lines, each
// with the earlier value beside it when there is one; the agent pulls
// SystemReadout for anything more.
//
// Pure: no DOM, no fetch.

import { fmtGb, freePercent, isLowDisk, LOW_DISK_PCT } from './system-page.js';

/** A home folder this much bigger than last scan is worth naming. */
export const GREW_GB = 1;

/** The Files tab's Clearable summary, first two lines:
    "Clearable scan · finished 2026-09-23 14:56 in 213s"
    "safe 423.4 GB · review 517.0 GB · careful 0 KB" */
export function parseClearableSummary(text) {
  const lines = String(text || '').split('\n');
  const head = lines[0] || '';
  const totals = lines[1] || '';
  const size = (label) => {
    const m = new RegExp(`${label} ([\\d.]+) (KB|MB|GB|TB)`).exec(totals);
    if (!m) return null;
    return parseFloat(m[1]) * { KB: 1e-6, MB: 1e-3, GB: 1, TB: 1e3 }[m[2]];
  };
  const safe = size('safe');
  if (safe == null) return null;
  const at = /finished (\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?)/.exec(head);
  return { safe_gb: safe, review_gb: size('review') || 0, finished: at ? at[1] : null, running: /still running/.test(head) };
}

/** The compact facts a scan leaves for the next one to compare with. */
export function scanFacts(r, at = Date.now()) {
  const f = { at };
  if (r.disk) {
    f.disk = {
      total_gb: r.disk.total_gb, used_gb: r.disk.used_gb, free_gb: r.disk.free_gb, percent: r.disk.percent,
      top_dirs: (r.disk.top_dirs || []).map((d) => ({ path: d.path, size_gb: d.size_gb })),
    };
  }
  if (r.security?.checks) {
    f.security = { checks: r.security.checks, passing: r.security.passing, total: r.security.total };
  }
  if (r.performance?.memProcs) {
    f.performance = {
      top: r.performance.memProcs.slice(0, 3).map((p) => ({ name: p.name, memory_mb: p.memory_mb })),
      swap_mb: Math.round(r.performance.swapUsedMb || 0),
    };
  }
  if (r.healthScore != null) f.score = r.healthScore;
  return f;
}

/** Merge a section scan's facts over the last full ones — a disk rescan
    leaves security as it was. */
export function mergeFacts(prev, next) {
  return { ...(prev || {}), ...next };
}

/** Home folders that grew by GREW_GB or more, biggest growth first. */
export function grewSince(prevDirs, nowDirs) {
  const before = new Map((prevDirs || []).map((d) => [d.path, d.size_gb]));
  return (nowDirs || [])
    .filter((d) => before.has(d.path) && d.size_gb - before.get(d.path) >= GREW_GB)
    .map((d) => ({ path: d.path, grew_gb: +(d.size_gb - before.get(d.path)).toFixed(1), size_gb: d.size_gb }))
    .sort((a, b) => b.grew_gb - a.grew_gb);
}

function day(ms) {
  return ms ? new Date(ms).toISOString().slice(0, 10) : 'earlier';
}

/** The hidden message after a user-started scan. `kind` names what ran. */
export function reportPrompt({ kind = 'full', prev = null, now, clearable = null, backup = null, order = null }) {
  const lines = [];
  const was = prev?.at ? ` (last scan ${day(prev.at)})` : '';
  const d = now?.disk;
  if (d && (kind === 'full' || kind === 'disk')) {
    const pd = prev?.disk;
    const delta = pd?.free_gb != null ? ` — was ${fmtGb(pd.free_gb)}` : '';
    lines.push(`- Disk: ${fmtGb(d.free_gb)} free of ${fmtGb(d.total_gb)} (${freePercent(d)}% free)${delta}`);
    if (isLowDisk(d)) lines.push(`- WARNING: under ${LOW_DISK_PCT}% free`);
    const grew = grewSince(pd?.top_dirs, d.top_dirs).slice(0, 3);
    if (grew.length) lines.push(`- Grew since last scan: ${grew.map((g) => `${g.path} +${fmtGb(g.grew_gb)} (now ${fmtGb(g.size_gb)})`).join('; ')}`);
    else if (pd?.top_dirs?.length) lines.push(`- No home folder grew by ${GREW_GB} GB or more`);
  }
  if (now?.score != null && kind === 'full') {
    lines.push(`- Health score: ${now.score}/100${prev?.score != null ? ` — was ${prev.score}` : ''}`);
  }
  const s = now?.security;
  if (s && (kind === 'full' || kind === 'security')) {
    const off = s.checks.filter((c) => c.status !== 'green').map((c) => `${c.label} ${c.detail}`);
    const ps = prev?.security;
    lines.push(`- Security: ${s.passing} of ${s.total} pass${off.length ? ` — not passing: ${off.join(', ')}` : ''}${
      ps && ps.passing !== s.passing ? ` — was ${ps.passing} of ${ps.total}` : ''}`);
  }
  const perf = now?.performance;
  if (perf && (kind === 'full' || kind === 'performance')) {
    lines.push(`- Heaviest processes: ${perf.top.map((p) => `${p.name} ${fmtGb(p.memory_mb / 1000)}`).join(', ')}${
      perf.swap_mb > 0 ? ` · swap ${fmtGb(perf.swap_mb / 1000)}` : ''}`);
  }
  if (clearable) {
    lines.push(`- Clearable (Files tab): ${fmtGb(clearable.safe_gb)} safe, ${fmtGb(clearable.review_gb)} to review${
      clearable.finished ? ` — checked ${clearable.finished}` : ''}`);
  } else if (clearable === null) {
    lines.push('- Clearable (Files tab): not looked for yet');
  }
  if (backup) lines.push(`- iPhone items with no copy on this Mac: ${backup.count.toLocaleString()}`);
  if (order) lines.push(`- The Overview shows, in order: ${order.length ? order.join(', ') : 'nothing — the Mac is quiet'}`);
  return [
    `[SHIFU_SCAN] The user just ran a ${kind} scan${was}. The page already shows every figure.`,
    'Report it per "After a scan" in your instructions — words only, no PageUpdate.',
    '',
    ...lines,
  ].join('\n');
}
