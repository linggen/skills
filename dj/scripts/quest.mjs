// quest.mjs — DJ's quest facts, for any app that counts real-life practice
// (Lingjing reads ~/.linggen/quests/*.json). The file is DJ's MENU — every
// chore a player can do here — and each entry's `done_at` is DJ's own record
// of the last time it saw that chore done. `pool: true` offers an entry to the
// game's one-chore-a-day pick; `device` is where the player does it.
//
//   quest.mjs <id>     stamp <id> done now; prints one JSON line
//   quest.mjs dj-sync  look at what the phones hold (witnessSync) and stamp
//                      dj-sync only when one gained songs
//
// Only the fact crosses — due, done, when — never which song, which list or
// what was sung. Read-merge-write: every other entry keeps its `done_at`, and
// an entry this menu does not know stays as it is. A failure here never fails
// the action it follows: the CLI always exits 0, and callers swallow errors.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OPEN = '/apps/dj/scripts/index.html';

export const MENU = [
  {
    id: 'dj-fetch', period: 'day', reward: 20, stamina: 10, device: 'mac', pool: true, open: OPEN,
    title: { zh: '采风 · 在 DJ 收一首新曲', en: 'Gather a song · download a new track in DJ' },
  },
  {
    id: 'dj-sing', period: 'day', reward: 25, stamina: 15, device: 'mac', pool: true, open: OPEN,
    title: { zh: '对歌 · 唱一首卡拉OK', en: 'Sing one · a karaoke song' },
  },
  {
    id: 'dj-playlist', period: 'week', reward: 25, stamina: 15, device: 'mac', pool: true, open: OPEN,
    title: { zh: '编曲 · 建一个新歌单', en: 'Make a set · create a playlist' },
  },
  {
    id: 'dj-sync', period: 'week', reward: 25, stamina: 15, device: 'both', pool: true, open: OPEN,
    title: { zh: '携曲 · 把新歌同步到手机', en: 'Carry the songs · sync new tracks to your phone' },
  },
];

/// Where quest facts live. A library kept elsewhere (DJ_DIR — a test) writes
/// beside itself, so it can never overwrite the real file.
export const questsDir = (env = process.env) =>
  env.DJ_QUESTS ||
  (env.DJ_DIR ? path.join(env.DJ_DIR, 'data', 'quests') : path.join(env.HOME || '', '.linggen', 'quests'));

/// The file's next body: the menu, each entry's `done_at` from `stamps` when
/// given there, else from what the file held.
export function merged(doc, stamps, menu = MENU, app = 'dj') {
  const held = Array.isArray(doc?.quests) ? doc.quests.filter((q) => q && typeof q === 'object') : [];
  const was = new Map(held.map((q) => [q.id, q]));
  const mine = new Set(menu.map((m) => m.id));
  return {
    app,
    quests: [
      ...menu.map((m) => ({
        ...m,
        due: true,
        done_at: m.id in stamps ? stamps[m.id] : (was.get(m.id)?.done_at ?? null),
      })),
      ...held.filter((q) => !mine.has(q.id)),
    ],
  };
}

/// Stamp `id` done at `now`, written whole (tmp + rename). Throws on an id
/// the menu does not know — nothing is written then.
export function stamp(id, { dir = questsDir(), now = new Date() } = {}) {
  if (!MENU.some((m) => m.id === id)) throw new Error(`unknown quest ${id}`);
  const file = path.join(dir, 'dj.json');
  let doc = null;
  try {
    doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    /* none yet, or torn — the menu starts it again */
  }
  const body = merged(doc, { [id]: now.toISOString() });
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(body)}\n`);
  fs.renameSync(tmp, file);
  return body.quests.find((q) => q.id === id);
}

// ── dj-sync: the Mac's own record of what a phone holds ─────────────────────
// A phone reports its inventory to the engine (`/api/skill-sync/dj/have`),
// which keeps ~/.linggen/sync/dj.json: { <device>: { files, last_fetch } },
// last_fetch in epoch seconds. A song a phone holds now that it did not the
// last time DJ looked is a sync of new songs, done at that last_fetch. DJ's
// memo of what it last saw lives in its own data dir, never in the quest file.

export const syncLedger = (env = process.env) =>
  env.DJ_SYNC_LEDGER || path.join(env.HOME || '', '.linggen', 'sync', 'dj.json');

/// Pure: the next memo, and when the newest new song reached a phone (ISO), or
/// null. A device DJ has not seen before is a baseline, never a sync.
export function syncFact(ledger, memo) {
  const next = {};
  let at = 0;
  for (const [device, row] of Object.entries(ledger && typeof ledger === 'object' ? ledger : {})) {
    const songs = (Array.isArray(row?.files) ? row.files : []).filter((f) => /\.mp3$/i.test(f));
    const t = Number(row?.last_fetch) || 0;
    next[device] = { songs, last_fetch: t };
    const was = memo?.[device];
    if (!was || !Array.isArray(was.songs)) continue;
    const had = new Set(was.songs);
    if (t > (Number(was.last_fetch) || 0) && songs.some((f) => !had.has(f))) at = Math.max(at, t);
  }
  return { memo: next, at: at ? new Date(at * 1000).toISOString() : null };
}

/// Look at the ledger, remember it, and stamp dj-sync when a phone gained songs.
export function witnessSync({
  ledgerFile = syncLedger(),
  memoFile = path.join(process.env.DJ_DIR || path.join(process.env.HOME || '', '.linggen', 'skills', 'dj'), 'data', 'quest-sync.json'),
  dir = questsDir(),
} = {}) {
  let ledger = null;
  try {
    ledger = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
  } catch {
    return null; // no phone has reported yet
  }
  let memo = null;
  try {
    memo = JSON.parse(fs.readFileSync(memoFile, 'utf8'));
  } catch {
    /* first look: a baseline */
  }
  const fact = syncFact(ledger, memo);
  fs.mkdirSync(path.dirname(memoFile), { recursive: true });
  const tmp = `${memoFile}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(fact.memo)}\n`);
  fs.renameSync(tmp, memoFile);
  return fact.at ? stamp('dj-sync', { dir, now: new Date(fact.at) }) : null;
}

/// For a verb that already ran: stamp, and never let the stamp fail it.
export function stampQuietly(id) {
  try {
    stamp(id);
  } catch {
    /* the next time it is done writes it again */
  }
}

const real = (p) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
};
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  try {
    const id = String(process.argv[2] || '');
    const q = id === 'dj-sync' ? witnessSync() : stamp(id);
    console.log(JSON.stringify({ ok: true, id, done_at: q?.done_at ?? null }));
  } catch (e) {
    console.log(JSON.stringify({ ok: false, error: String(e?.message || e) }));
  }
}
