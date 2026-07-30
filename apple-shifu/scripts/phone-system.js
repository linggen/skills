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
  const info = probe ? await media('info') : lastInfo;
  lastInfo = info;
  if (probe) publishSourceInfo(info);
  const ctx = { info, backup: getBackupSummary() };

  const groups = new Map();
  for (const row of ROWS) {
    if (!groups.has(row.group)) groups.set(row.group, []);
    const reading = row.cable && !info.connected ? { unreadable: NO_CABLE } : row.read(ctx);
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
    </div>`).join('') + noteHtml(groups);
}

/** Why there is no number here. A score off this slice would sit next to the
    phone's own full score and disagree with it — two figures, one subject. */
function noteHtml(groups) {
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
    return `<div class="ps-row out">
      <span class="ps-label">${esc(row.label)}</span>
      <span class="ps-reason">${esc(row.unreadable)}</span></div>`;
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
