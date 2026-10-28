// rules/home.mjs — 主页: what the stage holds between passages (Hanli 10-27: the stage's default — where the story
// stands and its gate, the ONE thing to do next, and what waits). Facts only, read from the finished Look (`kept`, as
// rules/aside.mjs reads it), so whatever a story gate or a sealed room keeps out of Look stays out of it too; the page
// (cards.js home) and the phone (lingjing_play.dart) put the words on it. Small on purpose: Look reaches Ling.
//
//   home: { gate: { step, progress, of, short, chores, plays } | null,
//           next: { kind, … },            // the first of NEXT that has anything — the one primary action
//           todo: [{ kind, … }] }         // what waits, each a tap into its own sheet
//
// 「约 N 局」 is the boards' honest count: the practice boards on the open map, best first, each day's replay share
// falling as rules/playpay.mjs pays it (100 · 50 · 10%), after today's undone 人间功课 is counted (it is worth ~7 boards).
import { dayKey } from '../state.mjs';
import { chorePlay, playGrant } from './playpay.mjs';
import { questOf, taskOf } from './errands.mjs';
import { gamesToday } from './rotation.mjs';
import { strengthen } from './strengthen.mjs';
import { allPlaces, sceneOf } from './world.mjs';
import { sideLine } from './hui.mjs';
import { entryGate, stageGate } from './gates.mjs';

const MAX_PLAYS = 200;
const floorAt = content => (content.balance?.play_pay?.replay ?? [1]).length - 1;

/* The practice boards the open map hosts on a day (a place's fixed `has.games` and the day's of its pool,
   rules/rotation.mjs — a hosted board that is no stall). */
function practiceIds(content, kept, now) {
  const open = new Set([kept.place?.id, ...(kept.place?.places ?? []).filter(p => !p.closed).map(p => p.id)].filter(Boolean));
  const ids = new Set();
  for (const p of allPlaces(content)) if (open.has(p.id)) for (const id of gamesToday(content, p, now)) {
    const t = taskOf(content, id);
    if (t?.hosted && t.kind === 'board' && !t.stall) ids.add(id);
  }
  return [...ids];
}

/* Boards to fill `need` 修为: greedy, best grant first, the replay share per board per day; a day rolls over when
   the best left is at the floor share — and the next day's boards are that day's. Returns the plays, or null when no board pays. */
export function playsFor(content, state, kept, need, now) {
  if (need <= 0) return 0;
  let day = 0, ids = practiceIds(content, kept, now);
  if (!ids.length || !content.balance?.play_pay) return null;
  const today = dayKey(now), floor = floorAt(content);
  let counts = state.plays?.day === today ? { ...state.plays.ids } : {};
  const grant = id => playGrant(content, { ...state, plays: { day: today, ids: counts } }, id, taskOf(content, id), now)?.progress ?? 0;
  let left = need, plays = 0;
  while (left > 0 && plays < MAX_PLAYS) {
    const best = ids.map(id => ({ id, g: grant(id), at: counts[id] ?? 0 })).sort((a, b) => b.g - a.g)[0];
    if (!best?.g) return null;
    if (best.at >= floor) { // a new day: every board fresh again, and the day's own
      counts = {}; day += 1;
      ids = practiceIds(content, kept, new Date(now.getTime() + day * 864e5));
      if (!ids.length) return null;
      continue;
    }
    left -= best.g; plays += 1; counts[best.id] = best.at + 1;
  }
  return plays;
}

/* Today's undone 人间功课, as it would land (Look's `quests`, unpaid, not 开府). */
const choresOpen = kept => (kept.quests ?? []).filter(q => !q.paid && q.period !== 'once' && (q.pays?.progress ?? 0) > 0);

/* The bar toward the 回's stage quest (or a cauldron that waits on 修为), the boards it still asks. */
function gateOf(content, state, kept, now) {
  const q = kept.stage_quest;
  if (!q || q.met) return null;
  const short = Math.max(0, (q.now?.of ?? 0) - (q.now?.progress ?? 0));
  const chores = choresOpen(kept).reduce((n, c) => n + c.pays.progress, 0);
  return { step: q.step, progress: q.now?.progress ?? 0, of: q.now?.of ?? 0, short, ...(chores ? { chores } : {}), plays: playsFor(content, state, kept, short - chores, now) };
}

/* The story's way on held by a stage quest: every way out of the scene he stands in the story at waits on its gate
   (rules/gates.mjs — the scene's own gate, or the gate of the scene each way leads into). */
function wayHeld(content, state) {
  const sc = sceneOf(content, state);
  const ways = (sc?.exits ?? []).filter(e => !e.stay);
  return ways.length > 0 && ways.every(e => stageGate(content, state, sc.id, e.id) ?? entryGate(content, state, e));
}
const here = kept => kept.place?.id ?? null;
/* He stands in the story's scene whose ways a stage quest holds, at that scene's own place. */
const inHeldScene = (content, state, kept) => Boolean(kept.scene) && sceneOf(content, state)?.at === here(kept) && wayHeld(content, state);
const placeRef = p => (p ? { id: p.id, name: p.name } : null);

/* A loss not yet made good: a story fight lost and not won since, or a beast's pool lost at more than won. */
const lostAt = (state, place) => (state.hunt_losses?.[place] ?? 0) > (state.hunted?.[place] ?? 0);
const lostAny = state => Object.values(state.fight_losses ?? {}).some(n => n > 0) || Object.keys(state.hunt_losses ?? {}).some(p => lostAt(state, p));
/* …and is it the thing in the way (Hanli 10-27: a buy button for an old 后山 loss, with the gate 41 short and a 功课 open):
   Only the story's own fight: a haunt is matched to his hand and never runs dry (rules/match.mjs), so a loss there
   never stands in his way — it is a 待办 line at most (Hanli 10-27, again: 「这个买东西的按钮是什么意思?」). */
function lossInWay(content, state, kept) {
  return (kept.scene?.exits ?? []).filter(e => e.game?.kind === 'duel').some(e => (state.fight_losses?.[e.game.id] ?? 0) > 0);
}
/* The best way to grow stronger now that is a thing to do (rules/strengthen.mjs): put on, buy, the 丹囊. */
const strongerWay = (content, state, now) => strengthen(content, state, { now }).find(o => ['wear', 'buy', 'pills'].includes(o.kind)) ?? null;

/* A practice board here that still pays above the floor share (the replay's last), best first — or, `tide`, 兽潮 when it is up. */
function boardHere(content, state, kept, now, tide) {
  const played = id => (state.plays?.day === dayKey(now) ? state.plays.ids?.[id] ?? 0 : 0);
  const rows = (kept.tasks ?? []).filter(t => (tide ? t.tide : t.practice) && t.status === 'offered' && !t.skipped);
  // Not one he has already played today: the 主页 never sends him straight back into the board he just finished
  // (Hanli, 2026-10-27: 「拼图刚玩完, 又出来了」); it stays in the tray for a replay of his own choosing.
  const paying = rows.filter(t => t.tide || ((t.pays?.progress ?? 0) > 0 && played(t.id) === 0));
  return paying.sort((a, b) => (b.pays?.progress ?? 0) - (a.pays?.progress ?? 0))[0] ?? null;
}

/* The ranking — Hanli's order, the first that has anything wins. Each returns a fact or null. */
const NEXT = [
  // 1 · the story: set aside → 接着读; the way on open → walk it. (A passage owed the page tells by itself: the 主页
  //     stands only between passages.)
  (c, s, k) => (k.aside?.on ? { kind: 'resume' } : null),
  (c, s, k) => { const to = k.waypoint?.toward; return to && !k.waypoint.gate && !k.waypoint.held && to.id !== here(k) && !wayHeld(c, s) ? { kind: 'way', place: placeRef(to), ...(to.via?.length ? { via: to.via } : {}) } : null; },
  // 2 · something to hand in here: the stage quest met, an errand or a 功课 done.
  (c, s, k) => (k.stage_quest?.met ? { kind: 'turnin', stage: true, title: k.stage_quest.step } : null),
  (c, s, k) => { const q = (k.book ?? []).find(b => b.ready && !b.away); return q ? { kind: 'turnin', id: q.id, title: q.title } : null; },
  // The gate short by what one thing here pays: that thing, named as enough (Hanli 10-27, 429/470 with 算账 +94 open and
  // the button saying 「去执事堂 · 买铁蒺藜」) — a 功课 to do (the smallest that covers it), else the best board here.
  (c, s, k, now) => {
    const short = k.stage_quest && !k.stage_quest.met ? (k.stage_quest.now?.of ?? 0) - (k.stage_quest.now?.progress ?? 0) : 0;
    if (short <= 0) return null;
    const q = choresOpen(k).filter(x => !x.done && x.pays.progress >= short).sort((a, b) => a.pays.progress - b.pays.progress)[0];
    if (q) return { kind: 'gongke', id: q.id, title: q.title, ...(q.means ? { means: q.means } : {}), progress: q.pays.progress, enough: true };
    const t = boardHere(c, s, k, now, false);
    return t && (t.pays?.progress ?? 0) >= short ? { kind: 'board', id: t.id, title: t.title, progress: t.pays.progress, enough: true } : null;
  },
  // 3 · something to do here: an errand's count met here, the place's beast, a board that still pays well, an errand to take.
  (c, s, k) => {
    const q = (k.book ?? []).find(b => !b.ready && !b.chore && b.where?.id === here(k));
    if (!q) return null;
    // A board it asks for, offered here: that board, one tap (修屋顶's 七巧).
    const t = (questOf(c, q.id)?.need ?? []).map(n => n.task && (k.tasks ?? []).find(x => x.id === n.task && x.status === 'offered')).find(Boolean);
    return t ? { kind: 'board', id: t.id, title: t.title, for: q.title } : { kind: 'errand', id: q.id, title: q.title };
  },
  (c, s, k) => { const e = k.place?.encounter; return e?.game && !(e.won || e.withdrawn || e.tamed) ? { kind: 'fight', id: e.game.id, title: e.creature?.name ?? null } : null; },
  // Standing in the gated scene (its ways held, at its own place): the gate's own errand to take before a practice board
  // (decided 2026-10-27 for Hanli: 接下 · 后山的野猪 at the 药园 first). Anywhere else a board that pays comes first, as at 外门.
  (c, s, k) => { const o = inHeldScene(c, s, k) && (k.offers ?? []).find(x => !x.locked); return o ? { kind: 'take', id: o.id, title: o.title } : null; },
  (c, s, k, now) => { const t = boardHere(c, s, k, now, false); return t ? { kind: 'board', id: t.id, title: t.title, ...(t.pays?.progress ? { progress: t.pays.progress } : {}) } : null; },
  (c, s, k) => { const o = (k.offers ?? []).find(x => !x.locked); return o ? { kind: 'take', id: o.id, title: o.title } : null; },
  (c, s, k, now) => { const t = boardHere(c, s, k, now, true); return t ? { kind: 'board', id: t.id, title: t.title, tide: true } : null; },
  // 4 · somewhere with work: the stage quest's work, else the nearest, else an errand in hand elsewhere.
  (c, s, k) => { const w = k.stage_quest?.work ?? k.work; return w?.place && !w.here ? { kind: 'go', place: placeRef(w.place), titles: (w.titles ?? []).slice(0, 2) } : null; },
  (c, s, k) => { const q = (k.book ?? []).find(b => !b.chore && b.where?.id && b.where.id !== here(k)); return q ? { kind: 'go', place: placeRef(q.where), titles: [q.title] } : null; },
  // 5 · the soonest cooldown.
  (c, s, k) => { const w = [...(k.waits ?? [])].sort((a, b) => (a.wait_min ?? 0) - (b.wait_min ?? 0))[0]; return w ? { kind: 'wait', id: w.id, title: w.title, wait_min: w.wait_min } : null; },
  // 6 · 闭关.
  (c, s, k) => (!(k.locked ?? []).includes('seclusion') && !k.seclusion ? { kind: 'seclude' } : null),
];

/* What waits, compact: hand-ins, errands in hand and where, today's 功课, 兽潮 · 秘境, the boards set aside. */
function todoOf(kept, way = null) {
  const out = [];
  // A loss not in the way: a way to grow stronger, a line at most — never the one button.
  if (way) out.push({ kind: 'strengthen', way });
  const ready = [...(kept.stage_quest?.met ? [{ title: kept.stage_quest.step }] : []), ...(kept.book ?? []).filter(b => b.ready && !b.away)];
  if (ready.length) out.push({ kind: 'ready', n: ready.length, title: ready[0].title });
  // In hand, and where each is handed in: one done with its giver elsewhere (`away`) points at the giver (Look's `where`).
  // Named by the place of its next act (the errand's `go`, rules/errand-line.mjs: 彭城 for the 灵芝, never the 执事堂 he
  // stands in), and carrying that act, so the tap does what the 事 book's row does (Hanli 10-28: 「点…待办…也没反应」).
  for (const q of (kept.book ?? []).filter(b => !b.chore && (!b.ready || b.away)).slice(0, 3)) {
    const at = q.go?.place ?? q.where;
    out.push({ kind: 'held', id: q.id, title: q.title, ...(at ? { place: placeRef(at) } : {}), ...(q.go ? { go: q.go } : {}), ...(q.ready ? { done: true } : {}) });
  }
  for (const q of choresOpen(kept).filter(c => !c.done)) out.push({ kind: 'gongke', id: q.id, title: q.title, ...(q.means ? { means: q.means } : {}), progress: q.pays.progress });
  // 兽潮 and 切磋 (rules/qiecuo.mjs), each up: a row each.
  for (const tide of (kept.tasks ?? []).filter(t => t.tide && t.status === 'offered')) out.push({ kind: 'tide', id: tide.id, title: tide.title, ...(tide.qiecuo ? { qiecuo: true } : {}) });
  for (const w of kept.waits ?? []) out.push({ kind: 'wait', id: w.id, title: w.title, wait_min: w.wait_min });
  // 妖兽出没 (rules/yaoshou.mjs): a batch up — one row, said where it waits; standing there, the fight is the stage's own.
  const ys = kept.yaoshou;
  if (ys?.up && ys.left > 0 && !ys.here && ys.places?.length) out.push({ kind: 'yaoshou', title: ys.title, left: ys.left, place: placeRef(ys.places[0]) });
  // The boards set aside: the count, and the first, which the row's tap opens again.
  const skipped = (kept.aside?.offers ?? []).filter(o => o.kind === 'replay');
  if (skipped.length) out.push({ kind: 'skipped', n: skipped.length, id: skipped[0].id });
  return out;
}

/* The 主页, or null where it never stands: a fight, 闭关, a 今 interlude (its own ways only), a sealed run. */
export function homeOf(content, state, kept, now) {
  if (!kept || kept.fight || kept.seclusion) return null;
  const sc = sceneOf(content, state);
  if (sc && sideLine(content, sc)) return null;
  let next = NEXT.reduce((got, rule) => got ?? rule(content, state, kept, now), null);
  const way = lostAny(state) ? strongerWay(content, state, now) : null;
  const inWay = way && lossInWay(content, state, kept);
  if (inWay) next = { kind: 'strengthen', way };
  return { gate: gateOf(content, state, kept, now), next, todo: todoOf(kept, inWay ? null : way) };
}
