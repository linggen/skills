// activity.mjs — the records DJ leaves in the Mac's activity log
// (linggen/doc/perception-spec.md §3): a download that landed and songs that
// left the library. `app` is the skill's own name and the verbs are the ones
// SKILL.md `activity-verbs` declares; the engine refuses anything else. Pure —
// actions.mjs posts them after the verb, outside the lock.

const SONGS_NAMED = 3;

const named = (t) => [t?.title, t?.artist].filter((x) => x && String(x).trim()).map((x) => String(x).trim()).join(' - ');

/// One song fetched: its name in the user's terms, not its file.
export function downloadRecord(item) {
  const name = named({ title: item.title, artist: item.artist }) || 'a song';
  return { by: 'user', app: 'dj', verb: 'download', object: name };
}

/// Songs deleted in one call: the song's name, or how many, with the first
/// few names in `detail`.
export function deleteRecord(rows) {
  const names = rows.map(named).filter(Boolean);
  const object = rows.length === 1 ? names[0] || 'a song' : `${rows.length} songs`;
  return {
    by: 'user', app: 'dj', verb: 'delete', object,
    detail: { count: rows.length, ...(rows.length > 1 && names.length ? { songs: names.slice(0, SONGS_NAMED) } : {}) },
  };
}
