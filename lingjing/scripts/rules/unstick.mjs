// rules/unstick.mjs — Ling's Unstick (Hanli, 2026-10-15: 「最好游戏的问题能让ling解决,
// 用户就不会卡住了」). The health check (rules/health.mjs) run on the save, and only its
// safe repairs applied: a story board he cannot win left with no grade and no reward
// (the page's 「算了，往下走」), a fight that should not be there closed, him put at the
// place his scene is played at, a passage owed again or one the book no longer has let
// go. It never pays, never grants, never moves the story past a scene: the scene he is
// in is the scene he stays in.
//
// Ling's call is asked first, in the world's words (rules/confirm.mjs guard: the first
// call is refused `not-confirmed` with the `ask`; its first option tapped, Unstick
// runs) — and the save before it is logged like any move, so Undo takes it back.
// The page never calls it.
import { dayKey, pick } from '../state.mjs';
import { clone } from './core.mjs';
import { health } from './health.mjs';
import { skipBoard as leaveBoard } from './skips.mjs';
import { placeName, placeOf, sceneOf } from './world.mjs';

/* The repairs Unstick applies now: every error's repair, then — when no error
   repair already ends it — the board standing before him. One per kind and target. */
export function plan(content, state, now) {
  const found = health(content, state, now);
  const errors = found.filter(p => p.level === 'error' && p.repair);
  const offers = found.filter(p => p.level === 'offer' && p.repair);
  const picked = [...errors, ...(errors.some(p => p.repair.kind === 'skip-board') ? [] : offers)];
  const seen = new Set();
  return {
    found,
    repairs: picked.filter(p => { const k = JSON.stringify(p.repair); if (seen.has(k)) return false; seen.add(k); return true; }),
  };
}

/* What each repair does to a copy of the save. */
const APPLY = {
  'skip-board': (s, r, content, now) => skipBoard(s, content, r.id, now),
  'close-fight': (s) => {
    const f = s.fight;
    if (!f) return false;
    delete s.fight;
    if (s.duels?.[f.creature]?.outcome === 'open') s.duels[f.creature] = { ...s.duels[f.creature], outcome: 'withdrew' };
    return true;
  },
  'pass-fight': (s, r, content, now) => { s.wins = { ...s.wins, [r.game]: now.toISOString() }; return true; },
  move: (s, r, content) => { if (!placeOf(content, r.place)) return false; s.place = r.place; return true; },
  retell: (s, r) => {
    s.told_scenes = (s.told_scenes ?? []).filter(id => id !== r.scene);
    s.tell_owed = [...(s.tell_owed ?? []).filter(k => k !== `scene/${r.scene}`), `scene/${r.scene}`];
    return true;
  },
  'drop-owed': (s, r) => { s.tell_owed = (s.tell_owed ?? []).filter(k => k !== r.key); return true; },
};

/* The page's 「算了，往下走」, the one rule (rules/skips.mjs): the board stands done and
   skipped — no grant, no grade, no mark, no errand counted; its passage owed as after a win;
   offered again by itself on a later day. Applied to the copy in hand. */
export function skipBoard(s, content, id, now) {
  const r = leaveBoard(s, content, { now, quests: [] }, id);
  if (!r.state) return false;
  for (const k of Object.keys(s)) delete s[k];
  Object.assign(s, r.state);
  return true;
}

/* The verb. Facts only — Ling says them in the world's words. */
export function unstick(state, content, ctx) {
  const now = ctx.now;
  const { found, repairs } = plan(content, state, now);
  const left = found.filter(p => p.level === 'error' && !p.repair).map(p => p.id);
  if (!repairs.length) return { state: null, result: { ok: true, fixed: [], left, say: null } };
  const s = clone(state);
  delete s.confirm;
  const fixed = [];
  for (const p of repairs) if (APPLY[p.repair.kind]?.(s, p.repair, content, now)) fixed.push(factOf(content, s, p));
  if (!fixed.length) return { state: null, result: { ok: true, fixed: [], left, say: null } };
  s.unstuck = { at: now.toISOString(), day: dayKey(now), fixed: fixed.map(f => f.kind) };
  return { state: s, result: { ok: true, fixed, left, say: null } };
}

/* One repair as a fact for Ling: its kind, and what it names. */
function factOf(content, s, p) {
  const r = p.repair, lang = s.lang;
  if (r.kind === 'skip-board') return { kind: r.kind, board: r.id, title: pick(content.tasks.tasks.find(t => t.id === r.id)?.title, lang) ?? null };
  if (r.kind === 'move') return { kind: r.kind, place: placeName(content, s, placeOf(content, r.place)) };
  return { kind: r.kind, ...(r.game ? { game: r.game } : {}), ...(r.scene ? { scene: r.scene } : {}) };
}

/* The one question, in the world's words, naming what would change. Null: nothing to mend. */
const PHRASE = {
  'skip-board': { zh: '这一关先放下，往下走', en: 'set this one aside and go on' },
  'close-fight': { zh: '这一架就此作罢', en: 'let this fight go' },
  'pass-fight': { zh: '它已归你，这一架不必再打', en: 'it is yours already; no need to fight it' },
  move: { zh: '先回到该在的地方', en: 'go back to where the story waits' },
  retell: { zh: '把漏掉的那段再讲一遍', en: 'hear the part that was missed' },
  'drop-owed': { zh: '理一理乱了的书页', en: 'straighten the book\'s pages' },
};
export function unstickAsk(content, state, now) {
  const { repairs } = plan(content, state, now);
  if (!repairs.length) return null;
  const lang = state.lang === 'zh' ? 'zh' : 'en', zh = lang === 'zh';
  const parts = [...new Set(repairs.map(p => pick(PHRASE[p.repair.kind], lang)).filter(Boolean))];
  const question = zh ? `${parts.join('，')}？不得好处，也不失什么。` : `${parts.join('; ')}? Nothing gained, nothing lost.`;
  return { question, yes: zh ? '就这么办' : 'Do that' };
}
