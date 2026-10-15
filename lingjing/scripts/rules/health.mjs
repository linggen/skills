// rules/health.mjs — the game's own health check (Hanli, 2026-10-15: 「游戏的分支太多,
// 我们应该怎么测试呢」 … 「最好游戏的问题能让ling解决, 用户就不会卡住了」). Pure: given the
// content, a save and the time, it says what is wrong with where the save stands —
// never changes it. tools/explore.mjs runs it at every state the story can reach;
// Ling's Unstick (rules/unstick.mjs) runs it on the live save and applies only the
// repairs marked safe.
//
// health(content, state, now) → [{ id, level, text, repair? }]
//   level `error`: the save is stuck or wrong — no way on, a fight that should not
//          be there, a place the scene cannot be reached from, 修为 past the book;
//   level `offer`: nothing is wrong, but a player may be stuck here — a story
//          board he cannot win (the page's own 「算了，往下走」 rule, as a repair).
//   `text`: one plain line for the builder (English); Ling never reads it out.
//   `repair`: data, never applied here — { kind, ...args }, kinds in REPAIRS.
//
// contentHealth(content, chapters) → the same shape for the world itself: a need
// (mark, item, grade, errand) that nothing in those chapters provides.
import { pick, dayKey, stepOfLayer, tierOf } from '../state.mjs';
import { capOf, rankOf } from './cap.mjs';
import { owesTell } from './tell.mjs';
import { look } from './look.mjs';
import { atScene, inMade, pathOf, placeOf, sceneOf } from './world.mjs';
import { stageCards, stageSlots, duelCreature } from '../stage.mjs';

/* What a repair may do. Each takes nothing from the player's story and gives
   nothing: no 修为, no 灵石, no item, no mark, no scene skipped. */
export const REPAIRS = {
  'skip-board': 'the stuck story board ends with no grade and no reward — the page\'s 「算了，往下走」',
  'close-fight': 'a fight left open (another day, a tamed beast, a fight not here) is closed, nobody won, nothing paid',
  'pass-fight': 'a scene\'s fight against a beast already tamed counts as passed — no drop, no card',
  move: 'he stands at the place the scene is played at',
  retell: 'a passage owed and never told is owed again',
  'drop-owed': 'an owed passage that no longer exists is let go',
};

const problem = (id, level, text, repair = null) => ({ id, level, text, ...(repair ? { repair } : {}) });
const boardsOf = scene => [...new Set([...(scene?.show ?? []).filter(c => c.card === 'board').map(c => c.id), ...(scene?.offers?.tasks ?? [])])];
const ctxOf = now => ({ now, quests: [] });

/* Every check, in order; each returns a list. */
export function health(content, state, now = new Date()) {
  if (!state || inMade(state)) return [];
  const scene = sceneOf(content, state);
  if (state.scene && !scene) return [problem('no-scene', 'error', `the save stands in scene ${state.scene}, which ${state.chapter} does not have`)];
  let lk = null;
  try { lk = look(state, content, ctxOf(now)); } catch (err) { return [problem('look-throws', 'error', `Look throws: ${err?.message ?? err}`)]; }
  return [
    ...fightChecks(content, state, lk, now),
    ...placeChecks(content, state, scene, now),
    ...wayChecks(content, state, scene, lk, now),
    ...boardOffers(content, state, scene),
    ...bandChecks(content, state),
    ...tellChecks(content, state),
  ];
}

/* A fight open that should not be: from another day, against a beast he has
   tamed, or one neither the scene nor the place offers. A fight card on the
   stage against a tamed beast (Hanli, 2026-10-15: 狰 dealt again in 古七). */
function fightChecks(content, state, lk, now) {
  const out = [], cast = new Set(state.cast ?? []), f = state.fight;
  if (f) {
    const here = new Set([...(sceneOf(content, state)?.exits ?? []).filter(e => e.game?.kind === 'duel').map(e => e.game.id), lk.place?.encounter?.game?.id].filter(Boolean));
    if (f.at && dayKey(new Date(f.at)) !== dayKey(now)) out.push(problem('fight-stale', 'error', `a fight (${f.game}) left open since ${dayKey(new Date(f.at))}`, { kind: 'close-fight' }));
    else if (cast.has(f.creature)) out.push(problem('fight-tamed', 'error', `a fight open against ${f.creature}, whom he has tamed`, { kind: 'close-fight' }));
    else if (f.game && !here.has(f.game) && !String(f.game).includes(':')) out.push(problem('fight-elsewhere', 'error', `a fight open (${f.game}) that neither the scene nor the place offers`, { kind: 'close-fight' }));
  }
  for (const c of lk.stage ?? []) {
    const who = duelCreature(lk, c);
    if (!who || !cast.has(who)) continue;
    const exit = (lk.scene?.exits ?? []).find(e => e.game?.kind === 'duel' && e.game.id === c.id);
    out.push(problem('tamed-offered', 'error', `a fight card (${c.id}) against ${who}, whom he has tamed`, exit ? { kind: 'pass-fight', game: c.id } : null));
  }
  return out;
}

/* At a scene's chapter but not at its place, with no road there he may walk. */
function placeChecks(content, state, scene, now) {
  if (!scene?.at || atScene(content, state)) return [];
  const here = placeOf(content, state.place), there = placeOf(content, scene.at);
  if (!there) return [problem('scene-place-unknown', 'error', `scene ${scene.id} is played at ${scene.at}, which no map has`)];
  if (here && pathOf(content, state, here, there, now)) return [];
  return [problem('wrong-place', 'error', `scene ${scene.id} is played at ${scene.at}; he stands at ${state.place ?? 'nowhere'} with no road there`, { kind: 'move', place: scene.at })];
}

/* A way on: the stage holds something to tap, and at a scene at least one exit
   can be taken now or after what the stage offers (a board, a fight, a look,
   a day). */
function wayChecks(content, state, scene, lk, now) {
  if (state.seclusion || state.fight || (lk.locked ?? []).includes?.('everything')) return [];
  const out = [];
  const slots = stageSlots(lk, lk.stage ?? stageCards(lk));
  const taps = lk.scene?.panel?.taps ?? [];
  const roads = !lk.director?.corridor && (lk.director?.near ?? []).length > 0;
  const told = owesTell(content, state);
  if (!told && !slots.main.length && !taps.length && !roads && !lk.waypoint && !(lk.chapter?.close)) {
    const at = scene?.at && !atScene(content, state) ? { kind: 'move', place: scene.at } : null;
    out.push(problem('blank-stage', 'error', `nothing to tap at ${scene?.id ?? state.place ?? '?'}: no card, no choice, no road`, at));
  }
  if (!scene || !atScene(content, state)) return out;
  const why = scene.exits.map(e => [e.id, blockOf(content, state, scene, e, lk)]);
  if (why.every(([, b]) => b)) {
    const board = why.map(([, b]) => b?.board).find(Boolean);
    out.push(problem('no-way-forward', 'error', `every way out of ${scene.id} is shut: ${why.map(([id, b]) => `${id} (${b.text})`).join(', ')}`, board ? { kind: 'skip-board', id: board } : null));
  }
  return out;
}

/* Why an exit cannot be taken, now or after what stands before him; null: it can. */
function blockOf(content, state, scene, exit, lk) {
  const n = exit.needs ?? {};
  if (exit.snub && (state.marks ?? []).includes(exit.mark)) return { text: 'turned down already' };
  if (exit.once && exit.mark && (state.marks ?? []).includes(exit.mark)) return { text: 'taken once already' };
  if (n.task) {
    const t = state.tasks?.[n.task];
    if (t?.status === 'done') {
      if (n.grade && ![n.grade].flat().includes(state.grades?.[n.task])) return { text: `${n.task} done with another grade` };
    } else if (!boardsOf(scene).includes(n.task) && !content.tasks.tasks.some(x => x.id === n.task && x.hosted)) {
      return { text: `board ${n.task} is offered nowhere here`, board: n.task };
    }
  }
  if (n.mark && !(state.marks ?? []).includes(n.mark) && !providedHere(scene, 'mark', n.mark, content)) return { text: `needs mark ${n.mark}` };
  if (n.bag && !(state.bag?.[n.bag] > 0)) return { text: `needs item ${n.bag}` };
  if (n.wealth && !(state.wealth >= n.wealth)) return { text: `needs ${n.wealth} 灵石` };
  if (n.quest && !state.quests?.[n.quest]) return { text: `needs errand ${n.quest}` };
  if (n.seen && !(scene.look ?? []).some(l => [n.seen].flat().includes(l.id)) && !(state.looked ?? []).length) return { text: `needs ${n.seen} seen, which the scene has no look for` };
  const game = exit.game;
  if (game?.kind === 'duel' && !state.wins?.[game.id] && (state.cast ?? []).includes(game.creature)) return { text: `fight against tamed ${game.creature}` };
  return null;
}

/* Something in the scene itself sets this (another exit's mark, a board's grade mark, a look). */
function providedHere(scene, kind, id, content) {
  if (scene.exits.some(e => e.mark === id && !e.snub)) return true;
  if ((scene.look ?? []).some(l => l.mark === id || l.gives?.mark === id)) return true;
  return boardsOf(scene).some(b => Object.values(content.tasks.tasks.find(t => t.id === b)?.marks ?? {}).includes(id));
}

/* A story board of the scene, not yet done: the player may be stuck on it.
   The first open one in the scene's order — the one on the stage (the rest wait
   behind it, stage.mjs boardWaits). */
function boardOffers(content, state, scene) {
  if (!scene || !atScene(content, state)) return [];
  const first = boardsOf(scene).find(id => state.tasks?.[id] && state.tasks[id].status !== 'done' && !state.wins?.[id]);
  if (!first) return [];
  const t = content.tasks.tasks.find(x => x.id === first);
  return [problem('board-open', 'offer', `story board ${first} (${pick(t?.title, 'zh') ?? t?.game ?? first}) stands before him`, { kind: 'skip-board', id: first })];
}

/* 修为 inside the 回's band: never past the story's cap; never short of a rise the
   story has already carried him through (the story's floor). */
function bandChecks(content, state) {
  const cap = capOf(content, state);
  const out = [];
  const rank = rankOf(content, state.tier, state.step);
  if (cap && rank > cap.story) out.push(problem('over-cap', 'error', `realm ${state.tier}:${state.step} is past the 回's story cap ${cap.at.tier}:${cap.at.layer}`));
  const floor = floorOf(content, state);
  if (floor != null && rank < floor.rank) out.push(problem('under-floor', 'error', `realm ${state.tier}:${state.step} is under the layer ${floor.scene}'s story already carried him to`));
  return out;
}
function floorOf(content, state) {
  const tier = content.ladder.tiers[0];
  if (state.tier !== tier.id) return null;
  let best = null;
  for (const id of state.done_scenes ?? []) {
    const sc = Object.values(content.chapters).map(ch => ch.scenes?.[id]).find(Boolean);
    const forward = (sc?.exits ?? []).filter(e => e.next || e.ends);
    if (!forward.length || !forward.every(e => e.rise != null)) continue;
    const layer = Math.min(...forward.map(e => (typeof e.rise === 'object' ? e.rise.layer : e.rise)));
    const rank = rankOf(content, tier.id, Math.min(stepOfLayer(content, tier.id, layer), tierOf(content, tier.id).thresholds.length - 1));
    if (!best || rank > best.rank) best = { rank, scene: id };
  }
  return best;
}

/* The book's passages: an owed key that no longer exists; the scene just left,
   its passage never told and no longer owed. */
function tellChecks(content, state) {
  const out = [];
  const find = sid => Object.values(content.chapters).map(ch => ch.scenes?.[sid]).find(Boolean);
  for (const key of state.tell_owed ?? []) {
    const [sid, eid] = key.split('/');
    const ok = sid === 'scene' || sid === 'after' ? Boolean(find(eid)) : Boolean(find(sid)?.exits?.some(e => e.id === eid));
    if (!ok) out.push(problem('owed-missing', 'error', `an owed passage ${key} that the book no longer has`, { kind: 'drop-owed', key }));
  }
  const last = (state.done_scenes ?? []).at(-1), sc = last && content.chapters[state.chapter]?.scenes?.[last];
  if (sc?.story && Array.isArray(state.told_scenes) && state.told_scenes.length && !state.told_scenes.includes(last) && !(state.tell_owed ?? []).some(k => k.endsWith(`/${last}`) || k.startsWith(`${last}/`))) {
    out.push(problem('untold', 'error', `scene ${last} was passed and its passage never told`, { kind: 'retell', scene: last }));
  }
  return out;
}

/* ── The world itself: a need nothing provides ── */
export function contentHealth(content, chapters = Object.keys(content.chapters)) {
  const scenes = chapters.flatMap(ch => Object.values(content.chapters[ch]?.scenes ?? {}));
  const marks = new Set(), items = new Set(), quests = new Set((content.quests ?? []).map(q => q.id));
  for (const sc of scenes) {
    for (const e of sc.exits ?? []) {
      if (e.mark) marks.add(e.mark);
      for (const g of [e.grant].filter(Boolean)) { if (g.item) items.add(g.item); for (const id of Object.keys(g.more ?? {})) items.add(id); }
    }
    for (const l of sc.look ?? []) { if (l.mark) marks.add(l.mark); if (l.gives?.mark) marks.add(l.gives.mark); const it = l.gives?.item ?? l.item; if (it) items.add(it); }
  }
  for (const t of content.tasks.tasks) { for (const m of Object.values(t.marks ?? {})) marks.add(m); if (t.gives?.bag) items.add(t.gives.bag); if (t.grant?.item) items.add(t.grant.item); }
  for (const q of content.quests ?? []) for (const k of ['grant', 'gives', 'reward']) if (q[k]?.item) items.add(q[k].item);
  const sold = new Set(Object.values(content.places ?? {}).flatMap(d => d.places ?? []).flatMap(p => (typeof p.has?.shop === 'object' ? Object.keys(p.has.shop.goods ?? p.has.shop) : [])));
  const out = [];
  for (const sc of scenes) for (const e of sc.exits ?? []) {
    const n = e.needs ?? {}, at = `${sc.id}:${e.id}`;
    if (n.mark && !marks.has(n.mark)) out.push(problem('need-unprovided', 'error', `${at} needs mark ${n.mark}, which nothing sets`));
    if (n.bag && !items.has(n.bag) && !sold.has(n.bag) && !content.items.items.some(i => i.id === n.bag && i.buy)) out.push(problem('need-unprovided', 'error', `${at} needs item ${n.bag}, which nothing gives`));
    if (n.quest && !quests.has(n.quest)) out.push(problem('need-unprovided', 'error', `${at} needs errand ${n.quest}, which no notice offers`));
    if (n.task && !content.tasks.tasks.some(t => t.id === n.task)) out.push(problem('need-unprovided', 'error', `${at} needs board ${n.task}, which is no task`));
    if (n.grade) {
      const keeps = Object.keys(content.tasks.tasks.find(t => t.id === n.task)?.marks ?? {});
      for (const g of [n.grade].flat()) if (!keeps.includes(g)) out.push(problem('need-unprovided', 'error', `${at} needs ${n.task} graded ${g}, which the board never gives`));
    }
  }
  return out;
}
