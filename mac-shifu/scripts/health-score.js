// Health score — weighted composite 0-100.
// Stored as history in localStorage for trend tracking.

const HISTORY_KEY = 'mac-shifu:score-history';
const MAX_HISTORY = 30;

/**
 * Calculate health score from scan results.
 * Weights: disk 30%, memory 15%, battery 15%, security 20%, garbage 10%, freshness 10%.
 * @param {object} results — from runScan()
 * @returns {{ score: number, breakdown: object }}
 */
export function calculateHealthScore(results) {
  const breakdown = {};

  // Disk free (30%) — >20% free = 100, <5% free = 0
  let diskScore = 100;
  if (results.disk) {
    const freePct = 100 - (results.disk.percent || 0);
    diskScore = freePct >= 20 ? 100 : freePct <= 5 ? 0 : Math.round((freePct - 5) / 15 * 100);
  }
  breakdown.disk = { score: diskScore, weight: 30 };

  // Memory (15%) — <70% used = 100, >95% = 0
  let memScore = 100;
  if (results.system?.memory) {
    const used = results.system.memory.percent || 0;
    memScore = used <= 70 ? 100 : used >= 95 ? 0 : Math.round((95 - used) / 25 * 100);
  }
  breakdown.memory = { score: memScore, weight: 15 };

  // Battery (15%) — >90% health = 100, <70% = 0. Skip on desktop.
  let batteryScore = 100;
  let batteryWeight = 15;
  if (results.battery?.percent != null) {
    const health = results.battery.percent;
    batteryScore = health >= 90 ? 100 : health <= 70 ? 0 : Math.round((health - 70) / 20 * 100);
  } else {
    batteryWeight = 0; // no battery — omit from breakdown
  }
  if (batteryWeight > 0) {
    breakdown.battery = { score: batteryScore, weight: batteryWeight };
  }

  // Security (20%) — % of checks passing
  let securityScore = 100;
  if (results.security) {
    securityScore = results.security.total > 0
      ? Math.round(results.security.passing / results.security.total * 100)
      : 100;
  }
  breakdown.security = { score: securityScore, weight: 20 };

  // Garbage ratio (10%) — reclaimable as % of used. Less is better.
  let garbageScore = 100;
  if (results.garbage?.length && results.disk) {
    const reclaimable = results.garbage.reduce((s, g) => s + (g.size_gb || 0), 0);
    const reclaimPct = results.disk.used_gb > 0 ? reclaimable / results.disk.used_gb * 100 : 0;
    garbageScore = reclaimPct <= 2 ? 100 : reclaimPct >= 20 ? 0 : Math.round((20 - reclaimPct) / 18 * 100);
  }
  breakdown.garbage = { score: garbageScore, weight: 10 };

  // Software freshness (10%) — placeholder, model can adjust
  breakdown.freshness = { score: 80, weight: 10 };

  // Weighted total
  const totalWeight = Object.values(breakdown).reduce((s, b) => s + b.weight, 0);
  const weightedSum = Object.values(breakdown).reduce((s, b) => s + b.score * b.weight, 0);
  const score = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

  return { score, breakdown };
}

/** Save score to history. */
export function saveScoreHistory(score, diskFreeGb) {
  try {
    const history = getScoreHistory();
    history.push({
      date: new Date().toISOString().slice(0, 10),
      score,
      disk_free_gb: diskFreeGb,
    });
    // Keep last N entries
    while (history.length > MAX_HISTORY) history.shift();
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch { /* quota */ }
}

/** Get score history. */
export function getScoreHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

/** Get last score (or null). */
export function getLastScore() {
  const history = getScoreHistory();
  return history.length > 0 ? history[history.length - 1] : null;
}

/**
 * Estimate days until disk is full based on score history.
 * Returns null if not enough data or disk isn't growing.
 */
export function estimateDiskFillRate() {
  const history = getScoreHistory().filter(h => h.disk_free_gb != null);
  if (history.length < 2) return null;

  const recent = history[history.length - 1];
  const older = history[history.length - 2];

  // Calculate GB consumed per day between last two scans
  const daysBetween = Math.max(1, (new Date(recent.date) - new Date(older.date)) / 86400000);
  const gbConsumed = (older.disk_free_gb || 0) - (recent.disk_free_gb || 0);

  if (gbConsumed <= 0) return null; // disk isn't growing

  const gbPerDay = gbConsumed / daysBetween;
  const daysUntilFull = Math.round((recent.disk_free_gb || 0) / gbPerDay);

  return {
    gbPerDay: +gbPerDay.toFixed(2),
    daysUntilFull,
    currentFreeGb: recent.disk_free_gb,
  };
}

/**
 * Estimate battery remaining lifespan based on cycle count.
 * Apple rates batteries at ~1000 cycles to 80% health.
 */
export function estimateBatteryLife(cycleCount, healthPct) {
  if (!cycleCount || !healthPct) return null;

  const maxCycles = 1000; // Apple's rated cycle count
  const remainingCycles = Math.max(0, maxCycles - cycleCount);
  const healthTrend = healthPct < 80 ? 'past-rated' : healthPct < 85 ? 'declining' : 'healthy';

  return {
    cycleCount,
    healthPct,
    remainingCycles,
    healthTrend,
    recommendation: healthTrend === 'past-rated'
      ? 'Battery is past its rated lifespan. Consider replacement or plan for an upgrade.'
      : healthTrend === 'declining'
        ? 'Battery is entering decline zone. Monitor closely over the next few months.'
        : 'Battery health is good.',
  };
}
