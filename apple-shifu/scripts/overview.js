// The System tab's first view, composed — Clearable first.
//
// Same shape as Health's Home: the page holds a short stack of findings, each
// with its facts and at most one button, in an order the rules pick. The
// agent may move one card to the lead (the Lead tool) and says why in the
// chat; the user's pin or hide beats it. A subject with nothing to say has no
// card — a quiet Mac is an empty stack and one line.
//
// Pure: no DOM. doctor.js draws what comes back.

import { fmtGb, freePercent, isLowDisk, LOW_DISK_PCT } from './system-page.js';

// ── the overview: what needs them, composed ──

/** Where each security check is switched on — facts the card shows so it
    needs no chat turn to be useful. */
export const SECURITY_WHERE = {
  Firewall: 'System Settings → Network → Firewall',
  FileVault: 'System Settings → Privacy & Security → FileVault',
  Gatekeeper: 'System Settings → Privacy & Security → Security',
  SIP: 'Recovery mode → Terminal → csrutil enable',
  'Remote Login': 'System Settings → General → Sharing → Remote Login',
  'Open ports': 'System Settings → General → Sharing',
};

/** The cards the overview can hold, before the layout orders them. Each is a
    finding with its facts; a subject with nothing to say has no card. */
export function overviewCards({ disk = null, clearable, backup = null, security = null } = {}) {
  const cards = [];
  if (isLowDisk(disk)) {
    cards.push({
      id: 'disk', tone: 'alert', warning: true,
      label: 'Disk nearly full',
      title: `${fmtGb(disk.free_gb)} free — ${freePercent(disk)}% of ${fmtGb(disk.total_gb)}`,
      sub: `Under ${LOW_DISK_PCT}% free`,
    });
  }
  if (clearable === null) {
    cards.push({
      id: 'clearable', tone: 'info', label: 'Space you can get back',
      title: 'Not looked for yet',
      sub: 'Build output, caches, old installers and logs',
      action: { label: 'Find what can go', kind: 'files' },
    });
  } else if (clearable && (clearable.safe_gb > 0 || clearable.review_gb > 0)) {
    cards.push({
      id: 'clearable', tone: clearable.safe_gb >= 1 ? 'good' : 'info', label: 'Space you can get back',
      title: clearable.safe_gb > 0 ? `${fmtGb(clearable.safe_gb)} safely` : 'Nothing marked safe',
      sub: [clearable.review_gb > 0 ? `${fmtGb(clearable.review_gb)} more to review` : '', clearable.finished ? `checked ${clearable.finished}` : '']
        .filter(Boolean).join(' · '),
      action: clearable.safe_gb > 0
        ? { label: 'Review and clear', kind: 'clear' }
        : { label: 'Open Clearable', kind: 'files' },
    });
  }
  if (backup?.count > 0) {
    cards.push({
      id: 'backup', tone: 'warn', label: 'iPhone backup',
      title: `${backup.count.toLocaleString()} item${backup.count === 1 ? '' : 's'} with no copy on this Mac`,
      sub: 'Nothing is deleted before it has one',
      action: { label: 'Back up', kind: 'media' },
    });
  }
  const gaps = (security?.checks || []).filter((c) => c.status !== 'green');
  if (gaps.length) {
    const first = gaps.find((c) => c.status === 'red') || gaps[0];
    cards.push({
      id: 'security', tone: first.status === 'red' ? 'alert' : 'warn', label: 'Security',
      title: `${first.label}: ${first.detail}`,
      sub: [`${security.passing} of ${security.total} checks pass`, SECURITY_WHERE[first.label]].filter(Boolean).join(' · '),
    });
  }
  return cards;
}

/** The layout file (data/layout.txt): `key=value` lines — lead, why, by the
    agent; pinned, hidden (comma list), by the user. */
export function parseLayout(text) {
  const out = { lead: null, why: null, pinned: null, hidden: [] };
  for (const line of String(text || '').split('\n')) {
    const at = line.indexOf('=');
    if (at < 1) continue;
    const k = line.slice(0, at).trim();
    const v = line.slice(at + 1).trim();
    if (k === 'hidden') out.hidden = v ? v.split(',').map((x) => x.trim()).filter(Boolean) : [];
    else if (k in out) out[k] = v || null;
  }
  return out;
}

/** Order the cards: the user's pin first, then a warning, then the agent's
    lead, then the default order. A hidden card is gone — the user's hide
    beats everything, a warning included (user actions are never gated). */
export function orderCards(cards, layout = {}) {
  const hidden = new Set(layout.hidden || []);
  const shown = cards.filter((c) => !hidden.has(c.id));
  const rank = (c) => {
    if (layout.pinned && c.id === layout.pinned) return 0;
    if (c.warning) return 1;
    if (layout.lead && c.id === layout.lead) return 2;
    return 3;
  };
  return shown
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i)
    .map(({ c }) => c);
}

/** Security checks back out of the readout the last scan saved — for a page
    that has not scanned in this browser yet. The readout keeps each check's
    value and marks a failing one "Worth a look."; the two the scan calls red
    are the ones macOS ships on. */
const RED_WHEN_OFF = new Set(['Gatekeeper', 'SIP']);

export function securityFromReadout(readout) {
  const rows = (readout?.readings || []).filter((r) => r.group === 'Security' && !r.unreadable);
  if (!rows.length) return null;
  const checks = rows.map((r) => ({
    label: r.label,
    detail: r.value,
    status: r.detail ? (RED_WHEN_OFF.has(r.label) ? 'red' : 'yellow') : 'green',
  }));
  return { checks, passing: checks.filter((c) => c.status === 'green').length, total: checks.length };
}
