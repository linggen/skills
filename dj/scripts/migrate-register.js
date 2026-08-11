// migrate-register.js — one-shot lift of the LWW register into library.json.
//
// Until 2026-08-11 the playlists lived in `data/playlist-edits.json` as cells
// and library.json carried a projection of them, rewritten on every save. The
// op-log lane made this Mac the single applier, so the merge those cells
// existed for was gone and the two files held one set of facts. store.js took
// over; this reads the register one last time and deletes it.
//
// The library already holds everything live in the register — the projection
// ran on every save — so this is belt and braces. It is worth the belt: if that
// claim is wrong anywhere, the cost is a phone silently sweeping its music.
// The REGISTER wins here, because it was the source.
//
// Deletable in one commit once no install can still have the file.

import fs from 'node:fs';

import { base, normalize } from './store.js';

/// Live cells under a prefix, as [suffix, value]. A `v` of null is a tombstone
/// — the key is *known to be unset*, which the old merge needed and nothing
/// downstream of this function does.
const cells = (reg, prefix) =>
  Object.entries(reg)
    .filter(([k, e]) => k.startsWith(prefix) && e && e.v !== null && e.v !== undefined)
    .map(([k, e]) => [k.slice(prefix.length), e.v]);

/// One view's playlists, exactly as the register's projection built them:
/// members ranked by the stored order, anything filed since it was last set
/// appended alphabetically rather than lost.
function listsFrom(reg, { list, member, order }) {
  const members = new Map(cells(reg, `${list}:`).map(([name]) => [name, []]));
  for (const [rest] of cells(reg, `${member}:`)) {
    const cut = rest.lastIndexOf('|');
    if (cut < 0) continue;
    const name = rest.slice(cut + 1);
    if (!members.has(name)) members.set(name, []);
    members.get(name).push(rest.slice(0, cut));
  }
  const orders = new Map(cells(reg, `${order}:`).filter(([, v]) => Array.isArray(v)));
  return [...members.entries()]
    .map(([name, files]) => {
      const rank = new Map((orders.get(name) || []).map((f, i) => [base(f), i]));
      const known = files.filter((f) => rank.has(f)).sort((a, b) => rank.get(a) - rank.get(b));
      const rest = files.filter((f) => !rank.has(f)).sort((a, b) => a.localeCompare(b));
      return { name, files: [...known, ...rest] };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/// Fold the register into `lib`, in place. Returns false when there is nothing
/// to migrate — the state every install reaches after the first run.
export function migrateRegister(lib, regFile) {
  let state;
  try {
    state = JSON.parse(fs.readFileSync(regFile, 'utf8'));
  } catch {
    return false; // no register: already migrated, or never had one
  }
  const reg = state?.reg;
  if (!reg || typeof reg !== 'object') return false;

  normalize(lib);
  lib.playlists = listsFrom(reg, { list: 'pln', member: 'pl', order: 'plo' });
  lib.phone.playlists = listsFrom(reg, { list: 'ppn', member: 'ppl', order: 'ppo' });
  lib.phone.files = cells(reg, 'ref:').map(([f]) => f).sort((a, b) => a.localeCompare(b));

  // A tombstoned song had already left the library through the projection; this
  // only catches a row that outlived one. Its file went at delete time.
  const dead = new Set(cells(reg, 'del:').map(([f]) => f));
  lib.tracks = lib.tracks.filter((t) => !t.file || !dead.has(base(t.file)));

  return true;
}
