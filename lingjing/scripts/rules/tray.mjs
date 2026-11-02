// rules/tray.mjs — 手边的棋局: every game playable now beside the story, and the cooldowns that come back within hours
// (Hanli 2026-11-02: 「可以, 按你说的做」 — after a reload he could not find where the timed games were).
// Part of the rules engine; rules.mjs is its one door.
//
// The tray is one row: the 回's story boards (the page's own, from Look's `tasks`), then this list — Look's `tray`. Each
// system declares its own entry in the one registry (rules/aside.mjs PLAY_KINDS `tray`); here they are read, placed and
// ordered, nothing more: where he stands or where it opens anywhere, 开局 (`act: 'open'`); else a walk there when `move`
// would take him (`act: 'go'`, the same checks the verb makes); else no button. Then the cooldowns, only those back
// within hours (COOL_MAX_MIN) — a game done for today waits for tomorrow out of the tray (Hanli 10-28: 「玩过一次怎么还有?」).
import { gated } from './locks.mjs';
import { move } from './travel.mjs';
import { placeName, placeOf } from './world.mjs';
import { PLAY_KINDS } from './aside.mjs';
import { drawPool } from './pool.mjs';

/* A cooldown is in the tray while it comes back within this many minutes (agent's pick, Hanli delegated 11-02: 6 时辰).
   兽潮 · 切磋 · 妖兽出没 · 饭桶 · a pool at rest wait 1–3 h; nothing daily waits past this, and a wait that long is tomorrow's. */
export const COOL_MAX_MIN = 12 * 60;

/* The order of the row after the story boards: 开局 here, a walk there, a notice, a cooldown. */
const RANK = { open: 0, go: 1, notice: 2, cool: 3 };

/* Whether a tap may walk him to `id` now: the verb itself asked, through every gate the page's call passes
   (the story's locks, a sealed instance, the book set aside, a fight, 闭关, a 秘境 run) — a road refused shows no button. */
let walker = null; // made at first use: the rules' modules import one another
function wayTo(content, state, ctx, id) {
  if (state.fight || state.seclusion || state.mijing?.run) return null;
  walker ??= gated({ move }).move;
  const r = walker(state, content, { ...ctx, quests: ctx.quests ?? [] }, { place: id })?.result;
  return r?.ok && !r.here ? placeName(content, state, placeOf(content, id)) : null;
}

/* Look's `tray`: the registry's entries, each placed and given its button; the book set aside, only what
   先放一放 does not already offer, and no walk (Move waits for the book). */
export function trayLook(content, state, view, ctx, asideOffers = []) {
  if (!view || state.mijing?.run) return { rows: [], hour: null };
  const now = ctx.now ?? new Date(), offered = new Set(state.aside ? asideOffers.map(o => o.id) : []);
  const ways = new Map(), way = id => (ways.has(id) ? ways.get(id) : ways.set(id, wayTo(content, state, ctx, id)).get(id));
  const name = id => placeName(content, state, placeOf(content, id));
  const rows = PLAY_KINDS.filter(k => k.tray && k.in !== 'shi').flatMap(k => k.tray(content, state, view, now).map(e => ({ kind: k.kind, ...e })))
    .filter(e => !offered.has(e.id))
    .flatMap((e) => {
      const { places = null, notice, ...row } = e;
      const here = !places || places.includes(state.place);
      const where = places ? name(here ? state.place : places[0]) : null;
      if (e.wait_min > 0) return e.wait_min <= COOL_MAX_MIN ? [{ ...row, seg: 'cool', ...(where ? { where } : {}) }] : [];
      if (notice) return [{ ...row, seg: 'notice', ...(where ? { where } : {}) }];
      if (here && e.opens) return [{ ...row, seg: 'open', act: 'open', ...(where ? { where } : {}) }];
      const to = state.aside ? null : (places ?? []).filter(id => id !== state.place).map(way).find(Boolean);
      return [to ? { ...row, seg: 'go', act: 'go', where: to, go: to } : { ...row, seg: 'notice', ...(where ? { where } : {}) }];
    });
  // 小游戏池 (rules/pool.mjs): of the pool's members only the 时辰's three stand, until played — and a round still open.
  const { drawn, members, shichen, open } = drawPool(content, state, rows, PLAY_KINDS, now);
  const shown = new Set([...drawn.filter(d => !d.played).map(d => d.id), ...open]);
  const kept = rows.filter(r => !members.has(r.id) || shown.has(r.id));
  const sorted = kept.map((r, i) => [r, i]).sort((a, b) => RANK[a[0].seg] - RANK[b[0].seg] || a[1] - b[1]).map(([r]) => r);
  return { rows: sorted, hour: { i: shichen.i, ends_min: Math.max(1, Math.ceil((shichen.end - now) / 60_000)), drawn: drawn.length, played: drawn.filter(d => d.played).length } };
}
