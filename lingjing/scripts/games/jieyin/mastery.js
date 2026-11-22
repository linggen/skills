// mastery.js — the 印谱's side of a game (师父传印, 2026-11-11): what a seal's mastery lends its spell, and the clean casts
// a kit reports back. The rules own both (rules/seals.mjs, the `seals` verb); a game knows them only through the seams its
// host hands in `data` — `sealBook(args)` (a read) and `sealed(args)` (a write) — so a host with none (a bare page, a test,
// the proof bots) plays exactly as before: every factor 1, nothing reported.
//
//   masteryFor(data, { ms }) → Promise<{ bonus, learned, report(move), flush() }>   the read waits `ms` (1.5 s) at most
//     bonus      { move id: 1 + power } — only the seals learned and past 生 (a kit multiplies its spell by `bonus[id] ?? 1`)
//     learned    [move id] — every seal the 印谱 holds as learned (at 生 too: a lesson counts once its 考 is passed, the story's
//                seeds at once; the rules' `learned`), in the book's order. The dock turns the seal it asks for among these
//                (helper.js askRing; Hanli 11-21). The same one read as `bonus` — the ONLY way the book reaches a board. [] — no
//                book, a slow one, a save with none — leaves the dock asking for the sword seal.
//     report(id) one clean cast of a move; sent in batches (BATCH casts) and at flush(): a camera cast (a kit has no tap
//                stand-in), so the rules count it fully
//     flush()    the rest of the casts, at the dock's close
export const NONE = Object.freeze({ bonus: Object.freeze({}), learned: Object.freeze([]), report() {}, flush() {} });
const BATCH = 4;

/** The casts as the rules read them: `id:n,id:n`. */
export const castsText = (casts) => Object.entries(casts).filter(([, n]) => n > 0).map(([id, n]) => `${id}:${n}`).join(',');

const READ_MS = 1500;

/** The book's read, given `ms` at most: a game's start never waits on the rules (lead.js's way) — none in time, no bonus. */
export async function masteryFor(data = {}, { ms = READ_MS } = {}) {
  if (typeof data.sealBook !== 'function') return NONE;
  let bonus = {}, learned = [], timer = 0;
  try {
    const late = new Promise((done) => { timer = setTimeout(() => done(null), ms); });
    const r = await Promise.race([Promise.resolve(data.sealBook({ action: 'book' })), late]);
    if (r?.ok && r.bonus && typeof r.bonus === 'object') bonus = r.bonus;
    if (r?.ok && Array.isArray(r.rows)) learned = [...new Set(r.rows.filter((row) => row.learned).flatMap((row) => row.move ?? []))];
  } catch { /* the book unreachable: no bonus, nothing lost */ } finally { clearTimeout(timer); }
  let casts = {}, n = 0;
  const flush = () => {
    if (!n || typeof data.sealed !== 'function') { casts = {}; n = 0; return; }
    const sent = castsText(casts);
    casts = {};
    n = 0;
    Promise.resolve(data.sealed({ action: 'cast', casts: sent, how: 'hands' })).catch(() => {});
  };
  return { bonus, learned, report: (id) => { casts[id] = (casts[id] ?? 0) + 1; n += 1; if (n >= BATCH) flush(); }, flush };
}

/** A kit's strength for a move: its factor (1 where the book lends none). */
export const factorOf = (bonus, id) => (Number.isFinite(bonus?.[id]) && bonus[id] > 0 ? bonus[id] : 1);

/** The dock's handle with the report flushed when it closes (every host closes its dock through `close()`). */
export const closing = (handle, mastery) => (handle && mastery?.flush ? { ...handle, close: () => { try { handle.close(); } finally { mastery.flush(); } } } : handle);
