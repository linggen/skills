// sync-now.js — 「同步」 by hand (Hanli 11-03: 「给用户一个同步的按钮, 可以手动同步」): the engine's own skill-save sync
// (POST /api/skill-cloud/lingjing/sync, the one the turn edges run), from the page's settings (settings.html). The
// same rules as the edges: never under an open board (the play page says whether one is open: `PAGE_CHANNEL`), never
// a 测试存档, a pull read again by the page (the engine's `save_changed`), the side that lost kept as a copy.

export const PAGE_CHANNEL = 'lingjing-page';

export const SYNC_WORDS = {
  zh: { name: '同步', line: '把本机存档和云端对一下。', go: '同步', pulled: '已同步 · 从云端拉取', pushed: '已同步 · 推到云端', same: '云端已是最新',
    local: '仅本机 · 订阅后可存云端', signedOut: '仅本机 · 登录后可存云端', far: '连不上云端', open: '先合上棋局再同步', scratch: '测试存档不同步', kept: '另一份已另存' },
  en: { name: 'Sync', line: 'Bring this save and the cloud copy into step.', go: 'Sync', pulled: 'Synced · taken from the cloud', pushed: 'Synced · sent to the cloud',
    same: 'The cloud is up to date', local: 'This Mac only · subscribe to keep it in the cloud', signedOut: 'This Mac only · sign in to keep it in the cloud',
    far: "Can't reach the cloud", open: 'Close the board first, then sync', scratch: 'A test save never syncs', kept: 'the other was kept as a copy' },
};

/** The outcome's one line. `r`: the sync's answer (`{done: {action}, conflicts}`), null when the site was out of
    reach; `why`: 'scratch' | 'open' | 'signed-out' when it never ran. */
export function syncLine(r, { why = null, en = false } = {}) {
  const w = SYNC_WORDS[en ? 'en' : 'zh'];
  if (why === 'scratch') return w.scratch;
  if (why === 'open') return w.open;
  if (why === 'signed-out') return w.signedOut;
  if (!r) return w.far;
  const line = { pull: w.pulled, push: w.pushed, nothing: w.same, local: w.local }[r.done?.action ?? r.done] ?? w.same;
  return r.conflicts?.length ? `${line} · ${w.kept}` : line;
}

/** Ask the play page, if one is open, whether a board or fight is up, and whether it plays a 测试存档. No page: neither. */
export function askPage({ Channel = globalThis.BroadcastChannel, waitMs = 300 } = {}) {
  if (!Channel) return Promise.resolve({ open: false, scratch: null });
  return new Promise((done) => {
    const ch = new Channel(PAGE_CHANNEL);
    const end = (v) => { clearTimeout(timer); ch.close(); done(v); };
    const timer = setTimeout(() => end({ open: false, scratch: null }), waitMs);
    ch.onmessage = (e) => { if (e.data?.t === 'state') end({ open: Boolean(e.data.open), scratch: e.data.scratch ?? null }); };
    ch.postMessage({ t: 'ask' });
  });
}

/** The page's side: answer what it holds (`state()` → {open, scratch}). */
export function answerPage(state, { Channel = globalThis.BroadcastChannel } = {}) {
  if (!Channel) return null;
  const ch = new Channel(PAGE_CHANNEL);
  ch.onmessage = (e) => { if (e.data?.t === 'ask') ch.postMessage({ t: 'state', ...state() }); };
  return ch;
}

/** One sync by hand: the page asked first, then the engine's sync. `sync()` → the answer or null; `signedIn()` → bool. */
export async function syncNow({ sync, signedIn, ask = askPage, en = false }) {
  const page = await ask();
  if (page.scratch) return syncLine(null, { why: 'scratch', en });
  if (page.open) return syncLine(null, { why: 'open', en });
  if (!(await signedIn())) return syncLine(null, { why: 'signed-out', en });
  return syncLine(await sync().catch(() => null), { en });
}
