// phone.js — Linggen Mobile as DJ's native sync target. The phone pulls the
// library itself over the paired channel, so there is nothing to push from
// here: this module only reads state — which devices are paired (the engine's
// pair registry) and what each has already fetched (the engine's dj-sync
// ledger) — so the UI can say "Liang's iPhone — 12/14 tracks • 2 waiting".

// Basenames NFC-normalized on both sides, same as sync.js: macOS paths and
// the phone's fetch log can disagree on Unicode composition.
const basename = (p) => String(p).split('/').pop().toLowerCase().normalize('NFC');

/// Paired devices with their fetch ledgers: [{ id, name, files, last_fetch }],
/// most recently active first — every `phone[0]` reader (the header chip, the
/// coverage card) then speaks about the device actually in use, not whichever
/// row happened to pair first.
export async function phoneDevices() {
  try {
    const res = await fetch('/api/skill-sync/dj/devices');
    if (!res.ok) return [];
    const devices = (await res.json()).devices || [];
    // last_fetch is epoch seconds; a device that never fetched sorts last.
    return devices.sort((a, b) => (b.last_fetch || 0) - (a.last_fetch || 0));
  } catch {
    return [];
  }
}

/// How much of `tracks` (library rows with a `file`) one device has.
export function coverage(tracks, device) {
  const have = new Set((device.files || []).map(basename));
  const withFile = tracks.filter((t) => t.file);
  const synced = withFile.filter((t) => have.has(basename(t.file))).length;
  return { total: withFile.length, synced, waiting: withFile.length - synced };
}

/// Is this track's audio file on ANY paired phone?
export function onAnyPhone(track, devices) {
  if (!track.file) return false;
  const name = basename(track.file);
  return devices.some((d) => (d.files || []).some((f) => basename(f) === name));
}

/// Fresh pairing QR ({ svg, url, host }) for the not-yet-paired promo card.
export async function pairQr() {
  try {
    const res = await fetch('/api/pair/qr');
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/// "just now" / "2h ago" / "3d ago" — for the device card's last-sync line.
export function agoLabel(tsSeconds) {
  if (!tsSeconds) return 'never synced';
  const mins = Math.max(0, Math.floor(Date.now() / 1000 - tsSeconds) / 60);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${Math.floor(mins)}m ago`;
  if (mins < 60 * 24) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 60 / 24)}d ago`;
}
