// The System tab under 📱 — what this Mac can honestly say about the iPhone.
//
// Everything here comes off the lockdown connection (`media info`) or off data
// already on this Mac. Rows the Mac cannot reach are still drawn, greyed, with
// the reason — the same rule the phone's own panel follows.
//
// Rows are a registry, not a render function: a row declares its group and how
// to read itself, and the panel draws whatever comes back. Adding a line means
// adding a row.

import { media } from './media.js';
import { getBackupSummary, setSourceInfo } from './shifu-shell.js';
import { fmtBytes, esc } from './shifu-io.js';

/** A reading the Mac cannot take from here. */
const onPhone = (what) => ({ unreadable: `${what} is readable on the phone — open Shifu in Linggen Mobile` });

/** Rows marked `cable` come off the lockdown connection. With no iPhone
    attached they are not "not reported" — nothing asked. Saying which one it
    is matters: one means the device answered nothing, the other means there
    was no device. */
const NO_CABLE = 'no iPhone on the cable — connect one by USB to read this';

const ROWS = [
  {
    group: 'Storage', label: 'Free space', cable: true,
    read: ({ info }) => (info.free_gb == null
      ? { unreadable: 'the iPhone did not report its disk usage' }
      : {
        value: `${info.free_gb} GB`,
        detail: info.total_gb ? `of ${info.total_gb} GB` : '',
        bar: info.total_gb ? 1 - info.free_gb / info.total_gb : null,
      }),
  },
  {
    group: 'Storage', label: 'Camera roll', cable: true,
    // "0 GB" from the device and "0 GB" because nothing measured it are not
    // the same claim, so the figure carries where it came from.
    read: ({ info }) => (info.photos_gb == null
      ? { unreadable: 'iOS 26 stopped reporting photo usage — run a USB sync to measure it' }
      : {
        value: `${info.photos_gb} GB`,
        detail: info.photos_source === 'dcim_walk' ? 'measured at the last USB sync' : '',
      }),
  },
  {
    group: 'Storage', label: 'Not archived here',
    // Local data, so it answers whether or not a cable is attached.
    read: ({ backup }) => (!backup
      ? { unreadable: 'nothing synced from this iPhone yet' }
      : backup.count
        ? { value: `${backup.count.toLocaleString()} items`, detail: fmtBytes(backup.bytes) }
        : { value: 'nothing pending', detail: 'every item has a verified copy' }),
  },
  {
    group: 'Device', label: 'Device', cable: true,
    read: ({ info }) => (info.name ? { value: info.name } : { unreadable: 'the iPhone did not report a name' }),
  },
  {
    group: 'Device', label: 'Model', cable: true,
    read: ({ info }) => (info.model ? { value: info.model } : { unreadable: 'the iPhone did not report a model identifier' }),
  },
  {
    group: 'Device', label: 'iOS', cable: true,
    // Shown, never judged: nothing on this Mac knows what the latest iOS is.
    read: ({ info }) => (info.ios ? { value: info.ios } : { unreadable: 'the iPhone did not report an OS version' }),
  },
  {
    group: 'Device', label: 'Battery', cable: true,
    read: ({ info }) => (info.battery_percent == null
      ? { unreadable: 'this iPhone does not report battery level over the cable' }
      : {
        value: `${info.battery_percent}%`,
        detail: info.battery_charging ? 'charging' : info.battery_plugged ? 'plugged in' : '',
      }),
  },
  { group: 'Device', label: 'Battery health', read: () => ({ unreadable: 'no public API on iOS — Settings › Battery › Battery Health' }) },
  { group: 'On the phone only', label: 'Thermal state', read: () => onPhone('Thermal state') },
  { group: 'On the phone only', label: 'Low Power Mode', read: () => onPhone('Low Power Mode') },
  { group: 'On the phone only', label: 'Passcode & biometrics', read: () => onPhone('The passcode check') },
  { group: 'On the phone only', label: 'Device integrity', read: () => onPhone('The integrity check') },
  { group: 'On the phone only', label: 'Library tidiness', read: () => onPhone('Duplicate and screenshot share') },
];

let lastInfo = null;
/** The probe currently running, so concurrent callers share one device read. */
let inFlight = null;

// ── What the phone said about itself ────────────────────────────────────────
//
// The rows above are what a Mac can reach over a cable. The phone can read
// every row, and publishes its whole readout to the daemon whenever it is
// awake and connected — retained, so it survives the phone going back in a
// pocket. The Mac cannot ask for a fresh one: iOS suspends the app within
// seconds of backgrounding, and a suspended process cannot run a probe.
//
// So this is a *last known* reading and it is drawn as one, in its own section,
// stamped with when the phone took it. It is never blended into the cable rows
// — one section is what this Mac just read, the other is what the phone said
// earlier, and a reader has to be able to tell which is which.

const READOUT_URL = '/api/topic/latest?topic=shifu&op=readout';

async function fetchPhoneReadout() {
  try {
    const res = await fetch(READOUT_URL);
    if (!res.ok) return null;   // 404 — nothing published yet, which is a real answer
    const body = await res.json();
    const payload = body?.payload;
    if (!payload || !Array.isArray(payload.readings) || !payload.readings.length) return null;
    // `scanned_at` is when the phone measured; `retained_at` is when the
    // daemon received it. The first is the truer age and the second is the
    // fallback, for a readout published by a build that predates the field.
    return { ...payload, retained_at: body.retained_at };
  } catch {
    return null;               // daemon unreachable: say nothing rather than guess
  }
}

/** "just now" / "14 minutes ago" / "3 days ago" — an age, not a timestamp to decode. */
function ago(iso) {
  const then = Date.parse(iso || '');
  if (Number.isNaN(then)) return null;
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function phoneReadoutHtml(readout, measuredHere) {
  const when = ago(readout.scanned_at) || ago(readout.retained_at);
  const groups = new Map();
  for (const row of readout.readings) {
    // The cable answered this one just now — no need to say it twice, older.
    if (measuredHere.has(String(row.label || '').toLowerCase())) continue;
    if (!groups.has(row.group)) groups.set(row.group, []);
    groups.get(row.group).push(row);
  }
  const score = readout.score;
  const scoreLine = score
    ? `<span class="ps-from-score">${score.value}/100${score.verdict ? ` · ${esc(score.verdict)}` : ''}</span>`
    : '';
  return `<div class="ps-from-phone">
    <div class="ps-from-head">
      <h3 class="ps-group-title">From the phone</h3>
      ${scoreLine}
      <span class="ps-from-when">${when ? `read ${esc(when)}` : 'reading has no timestamp'}</span>
    </div>
    <p class="ps-note">The phone published these; this Mac did not measure them. It cannot ask for a
      fresh set — iOS suspends the app in the background — so open Shifu in Linggen Mobile to update.</p>
    ${[...groups.entries()].map(([name, rows]) => `
      <div class="ps-group">
        <h4 class="ps-subgroup-title">${esc(name)}</h4>
        ${rows.map(rowHtml).join('')}
      </div>`).join('')}
  </div>`;
}

/** The facts the panel last drew — the Report verb sends these to the agent. */
export function phoneFacts() { return lastInfo; }

/**
 * Draw the panel.
 * @param el     the container
 * @param probe  false re-draws from the last reading instead of going back to
 *               the cable — used when only the archive figure moved, so the
 *               row and the header badge stay in step without a fresh probe.
 *
 * The archive figure is read from the shell at draw time, never passed in: a
 * probe takes seconds, and a value captured before it would paint a row that
 * contradicts the badge beside it.
 */
export async function renderPhoneSystem(el, probe = true) {
  if (!el) return;
  if (!probe && !lastInfo) return;   // nothing read yet; the probing call will draw
  if (!lastInfo) el.innerHTML = '<div class="ps-loading">Looking for your iPhone…</div>';
  else if (probe) markProbing(el);

  let info = lastInfo;
  if (probe) {
    // One probe at a time. Every switch into this source starts one, and a
    // cold lockdown read runs to twenty seconds — flicking between tabs used
    // to stack them, each walking the device again for the same answer.
    inFlight = inFlight || media('info');
    try { info = await inFlight; } finally { inFlight = null; }
  }
  lastInfo = info;
  if (probe) publishSourceInfo(info);
  const ctx = { info, backup: getBackupSummary() };
  // Cheap and local — the daemon reads one file — so it costs nothing to ask
  // on every draw and keeps the age on screen honest.
  const readout = await fetchPhoneReadout();

  // Once the phone has published, the Mac's version of a row it answered for
  // stands down — that row was only ever a sign pointing at the phone.
  //
  // Two rules, because one was not enough either way round. Dropping the whole
  // "On the phone only" group missed Battery health, which the Mac lists under
  // Device and the phone also reports. Matching labels missed the reverse: the
  // phone calls them Temperature, Lock and Integrity where the sign says
  // Thermal state, Passcode & biometrics and Device integrity, so three signs
  // survived pointing at readings printed directly below them.
  const answered = new Set(
    (readout?.readings || []).map((r) => String(r.label || '').toLowerCase()),
  );

  // Labels this Mac just measured for itself. A live reading off the cable
  // beats one the phone took some time ago, so where both have a row the
  // fresher one keeps it and the other stands down — whichever side that is.
  const measuredHere = new Set();

  const groups = new Map();
  for (const row of ROWS) {
    if (readout && row.group === 'On the phone only') continue;
    const reading = row.cable && !info.connected ? { unreadable: NO_CABLE } : row.read(ctx);
    if (reading.unreadable && answered.has(row.label.toLowerCase())) continue;
    if (!reading.unreadable) measuredHere.add(row.label.toLowerCase());
    if (!groups.has(row.group)) groups.set(row.group, []);
    groups.get(row.group).push({ label: row.label, ...reading });
  }

  const banner = info.connected
    ? ''
    : `<div class="ps-banner">No iPhone on the cable right now${info.reason ? ` (${esc(info.reason)})` : ''}.
        Device readings need a USB connection; the archive figure below is from this Mac and is current either way.</div>`;

  el.innerHTML = banner + [...groups.entries()].map(([name, rows]) => `
    <div class="ps-group">
      <h3 class="ps-group-title">${esc(name)}</h3>
      ${rows.map(rowHtml).join('')}
    </div>`).join('')
    + (readout ? phoneReadoutHtml(readout, measuredHere) : '')
    + noteHtml(groups, readout);
}

/**
 * Say that a re-read is happening.
 *
 * The panel only draws its loading state when it has nothing yet, so a re-read
 * with rows already on screen sat silent for however long it took — under a
 * second warm, twenty on a cold cable — and then replaced them with the same
 * values. The strip is wiped by the redraw that follows.
 */
function markProbing(el) {
  if (el.querySelector('.ps-probing')) return;
  const strip = document.createElement('div');
  strip.className = 'ps-probing';
  strip.textContent = 'Reading the iPhone over the cable…';
  el.prepend(strip);
}

/** Why there is no number of *our own* here. A score off the cable slice would
    sit next to the phone's own full score and disagree with it — two figures,
    one subject. When the phone has published, its score is shown above, and
    this says whose it is rather than repeating that there isn't one. */
function noteHtml(groups, readout) {
  if (readout?.score) {
    const { readable, total } = readableCount(groups);
    return `<p class="ps-note">The score above is the phone's own, over every row it can read.
      This Mac does not compute one: it reads ${readable} of the ${total} row${total === 1 ? '' : 's'}
      it lists here, and a score off that slice would disagree with the phone's.</p>`;
  }
  const { readable, total } = readableCount(groups);
  return `<p class="ps-note">No health score here: ${readable} of the ${total} rows above are readable
    from a Mac, and a score built on that slice would disagree with the phone's own. The score lives
    in Linggen Mobile → Shifu, where every row can be read.</p>`;
}

/** This panel probes the device whether or not the Media tab was ever opened,
    so it feeds the header switch too — otherwise the switch sits detail-less
    beside a panel already showing the very numbers it wants. */
function publishSourceInfo(info) {
  setSourceInfo('phone', {
    label: info.name || 'iPhone',
    detail: info.free_gb != null ? `${info.free_gb} GB free` : '',
    title: info.connected ? 'iPhone connected over USB' : 'No iPhone connected',
  });
  if (info.mac_free_gb != null) {
    setSourceInfo('mac', { label: 'This Mac', detail: `${info.mac_free_gb} GB free`, title: 'This Mac' });
  }
}

function rowHtml(row) {
  if (row.unreadable) {
    // The phone sends `where_to_look` with a row it cannot answer, and that
    // path is the whole point of keeping the row: drop it and the panel says
    // only that nobody knows. The Mac's own rows carry theirs inline; the
    // phone's arrive in their own field.
    return `<div class="ps-row out">
      <span class="ps-label">${esc(row.label)}</span>
      <span class="ps-reason">${esc(row.unreadable)}</span>
      ${row.where_to_look ? `<span class="ps-where">${esc(row.where_to_look)}</span>` : ''}</div>`;
  }
  const bar = row.bar == null ? '' :
    `<span class="ps-bar"><i style="width:${Math.round(Math.min(1, Math.max(0, row.bar)) * 100)}%"></i></span>`;
  return `<div class="ps-row">
    <span class="ps-label">${esc(row.label)}</span>
    <span class="ps-value">${esc(row.value)}</span>
    ${row.detail ? `<span class="ps-detail">${esc(row.detail)}</span>` : ''}
    ${bar}</div>`;
}

function readableCount(groups) {
  let readable = 0;
  let total = 0;
  for (const rows of groups.values()) {
    for (const r of rows) { total += 1; if (!r.unreadable) readable += 1; }
  }
  return { readable, total };
}
