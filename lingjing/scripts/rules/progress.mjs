// rules/progress.mjs — 进度: a save played forward to any point of the story, by the
// rules alone (Hanli, 2026-10-15: 「每回一个agent并行测试」). Part of the rules
// engine; rules.mjs is its one door (`seed --save=<name> --at=<target>`).
//
// From a fresh save it plays what a player would: at each scene it walks to the
// scene's place, plays the boards a way on waits on (won with the grade that
// way wants, or left — `boards: 'skip'`), looks at what must be seen, fights a
// scene's fight to a win (the page's settle: a pick list the rules replay),
// waits out a real day where the story asks one, and takes the way on — the
// first one that leads on (a declared `default` first; a way that stays in the
// scene is taken and the rest tried again). Nothing is forced: a way that
// cannot be met by play is not taken, and when no way on can be, it stops and
// says where and why. The save it ends with is the save a player would hold —
// bag, cards, marks, 修为, 灵石 gained on the way.
//
// Targets: a scene id (wm-mijing); a 回 (h07, j04, an absorbed h03; 古五, 今二,
// 第五回 — its first scene as played); a sealed instance's name or beat (秘境 —
// its entry scene).
import { pick, realmName } from '../state.mjs';
import { act, begin, foeTurn, offers, tokenOf } from '../battle.js';
import { bookEntries, idsOf } from '../book-order.js';
import { VERBS } from './verbs.mjs';
import { allPlaces, encounterOf, placeOf } from './world.mjs';
import { riddleOf } from './core.mjs';

const DAY = 86_400_000;
/* The birthday a way on that reads the roots is taken with (tests/prologue.mjs V1_BIRTH). */
export const SEED_BIRTH = '1986-07-07';

const sceneOf = (content, s) => content.chapters[s.chapter]?.scenes?.[s.scene] ?? null;
const where = (s) => `${s.chapter}/${s.scene}`;

/* ── targets ── */
const ZH_N = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const zhNum = (t) => (/^\d+$/.test(t) ? Number(t) : t.length === 2 && t[0] === '十' ? 10 + ZH_N[t[1]] : t.length === 2 && t[1] === '十' ? ZH_N[t[0]] * 10 : ZH_N[t] ?? null);

/* What `--at` names: {kind: 'scene', id} or {kind: 'hui', ids: [...]}, or null. */
export function targetOf(content, raw) {
  const t = String(raw ?? '').trim().replace(/[\s·・]/g, '');
  if (!t) return null;
  for (const ch of Object.values(content.chapters ?? {})) if (ch.scenes?.[t]) return { kind: 'scene', id: t, label: t };
  for (const ch of Object.values(content.chapters ?? {})) {
    for (const b of ch.beats ?? []) {
      if (!b.sealed) continue;
      const names = [b.id, pick(b.sealed.label, 'zh'), pick(b.sealed.label, 'en')].filter(Boolean).map((n) => String(n).replace(/[\s·・]/g, ''));
      if (names.includes(t) || t === '秘境' || t === 'mijing') return { kind: 'scene', id: b.scenes[0], label: t };
    }
  }
  const entries = bookEntries(content.book, { draft: true }).filter((h) => h.volume);
  const byId = entries.find((h) => idsOf(h).includes(t));
  if (byId) return { kind: 'hui', ids: idsOf(byId), label: t };
  const m = /^(古|今|未|第)(.+?)回?$/.exec(t);
  if (m) {
    const n = zhNum(m[2]);
    const line = m[1] === '今' ? 'jin' : m[1] === '未' ? 'wei' : 'gu';
    const h = entries.find((e) => e.line === line && e.n === n);
    if (h) return { kind: 'hui', ids: idsOf(h), label: t };
  }
  return null;
}
const atTarget = (content, s, target) => Boolean(s.scene) && (target.kind === 'scene' ? s.scene === target.id : target.ids.includes(sceneOf(content, s)?.hui));

/* ── the fight: a careful player, weighed move by move, a few lines tried until one wins ── */
const body = (side) => side.board.reduce((n, m) => n + m.atk + m.hp * 0.6 + (m.taunt ? 2 : 0), 0);
function playLine(setup, catalog, wobble) {
  const st = begin(setup, catalog);
  const picks = [];
  let k = 0;
  for (let g = 0; g < 400 && st.outcome === 'open'; g += 1) {
    if (st.whose === 'foe') { foeTurn(st); continue; }
    const scored = [];
    for (const o of offers(st).filter((x) => x.ok && x.action.kind !== 'end')) {
      const copy = structuredClone({ ...st, catalog: undefined });
      copy.catalog = st.catalog;
      if (!act(copy, o.action, 'you').ok) continue;
      const v = (st.foe.hp - copy.foe.hp) * 2 + (copy.you.hp - st.you.hp) + (body(copy.you) - body(st.you)) * 1.2 + (body(st.foe) - body(copy.foe));
      scored.push({ o, v });
    }
    scored.sort((a, b) => b.v - a.v);
    // A line other than the first takes, now and then, the second-best move (a fixed walk, so a run repeats).
    k += 1;
    const best = wobble && scored.length > 1 && ((k * 7 + wobble * 13) % 5 === 0) ? scored[1] : scored[0];
    const action = best && best.v > 0.5 ? best.o.action : { kind: 'end' };
    act(st, action, 'you');
    picks.push(tokenOf(action));
  }
  return { outcome: st.outcome, picks };
}
export function winningPicks(setup, catalog, tries = 24) {
  for (let w = 0; w < tries; w += 1) {
    const line = playLine(setup, catalog, w);
    if (line.outcome === 'won') return line.picks;
  }
  return null;
}

/* ── one step ── */
class Stuck extends Error {
  constructor(s, why) { super(`stuck at ${where(s)}: ${why}`); this.scene = where(s); this.why = why; }
}

function makeRunner(content, opts) {
  const catalog = Object.fromEntries(content.cards.cards.map((c) => [c.id, c]));
  const r = { now: opts.now, days: 0, log: [] };
  const ctx = () => ({ now: r.now, quests: [] });
  r.call = (verb, s, args) => VERBS[verb](s, content, ctx(), args);
  r.must = (verb, s, args) => {
    const out = r.call(verb, s, args);
    if (!out.result?.ok) throw new Stuck(s, `${verb} ${JSON.stringify(args)} refused ${out.result?.refused}${out.result?.say ? ` — ${out.result.say}` : ''}`);
    return out.state ?? s;
  };
  r.nextDay = () => { r.now = new Date(r.now.getTime() + DAY); r.days += 1; };
  r.fight = (s, game) => {
    for (let d = 0; d < 4; d += 1) {
      const started = r.call('duel', s, { id: game.id });
      if (!started.result.ok) {
        if (['withdrawn', 'spent-today', 'subdued-today'].includes(started.result.refused)) { r.nextDay(); continue; }
        throw new Stuck(s, `fight ${game.id} refused ${started.result.refused}`);
      }
      const t = started.state;
      const picks = winningPicks(t.fight.setup, catalog);
      if (!picks) {
        // No line wins this deal: the beast withdraws for the day, and tomorrow deals again.
        const lost = playLine(t.fight.setup, catalog, 0).picks;
        s = r.call('duel', t, { id: game.id, picks: lost.join(',') }).state ?? t;
        r.nextDay();
        continue;
      }
      const settled = r.call('duel', t, { id: game.id, picks: picks.join(',') });
      if (!settled.result.ok || !settled.state?.wins?.[game.id]) throw new Stuck(s, `fight ${game.id} settle ${settled.result.refused ?? 'not won'}`);
      return settled.state;
    }
    throw new Stuck(s, `fight ${game.id}: no winning line in 4 days`);
  };
  return r;
}

const gradeOf = (content, id, wanted) => {
  if (wanted != null) return [wanted].flat()[0];
  const marks = content.tasks.tasks.find((t) => t.id === id)?.marks;
  return marks ? Object.keys(marks)[0] : null;
};
/* The boards an exit waits on, in the scene's `show` order: won and handed in, or left. */
function boards(content, r, s, exit, policy) {
  const need = exit.needs?.task;
  if (!need || s.tasks?.[need]?.status === 'done') return s;
  const order = (sceneOf(content, s)?.show ?? []).filter((c) => c.card === 'board').map((c) => c.id);
  const ids = [...order.slice(0, Math.max(0, order.indexOf(need))), need].filter((id) => s.tasks?.[id]?.status !== 'done' && !(policy === 'skip' && (s.skipped ?? []).some((e) => e.task === id)));
  for (const id of ids) {
    if (policy === 'skip') { s = r.must('task', s, { action: 'skip', id }); continue; }
    const grade = gradeOf(content, id, id === need ? exit.needs.grade : null);
    s = r.must('win', s, { id, ...(grade ? { grade } : {}) });
    s = r.must('task', s, { action: 'done', id });
  }
  return s;
}

/* The args a way on is taken with, as the page sends them (a riddle's way: its answer, as he would say it). */
function argsFor(content, s, exit, now) {
  const a = { exit: exit.id };
  if (exit.key) a.answer = content.riddles[s.lang]?.riddles?.[riddleOf(s, sceneOf(content, s), exit, now)]?.a?.[0];
  if (exit.born) a.birth = SEED_BIRTH;
  if (exit.value) a.value = [exit.value.offer ?? exit.value.offers ?? exit.value.choices ?? []].flat()[0] ?? (s.lang === 'en' ? 'Alex' : '小满');
  if (exit.names) a.said = exit.names.value;
  return a;
}

/* A room that holds the way on (places' `has.guard`): its pool's beasts fought until
   enough are won, its board played (a guard's board is the way itself — played even
   when the story's boards are left), then on. */
function clearGuard(content, r, s) {
  const g = allPlaces(content).find((p) => p.id === s.place)?.has?.guard;
  if (!g) return s;
  for (let k = 0; k < 6 && g.won && (s.hunted?.[s.place] ?? 0) < g.won.n; k += 1) {
    const enc = encounterOf(content, s, r.now);
    if (!enc?.game) throw new Stuck(s, `guarded at ${s.place}: no beast up to fight`);
    s = r.fight(s, enc.game);
  }
  if (g.task && s.tasks?.[g.task.id]?.status !== 'done') {
    const grade = gradeOf(content, g.task.id, null);
    s = r.must('win', s, { id: g.task.id, ...(grade ? { grade } : {}) });
    s = r.must('task', s, { action: 'done', id: g.task.id });
  }
  return s;
}
function walkTo(content, r, s, place) {
  for (let k = 0; k < 4; k += 1) {
    const m = r.call('move', s, { place });
    if (m.result.refused === 'guarded') { s = clearGuard(content, r, s); continue; }
    if (!m.result.ok) throw new Stuck(s, `walk to ${place} refused ${m.result.refused}${m.result.say ? ` — ${m.result.say}` : ''}`);
    s = m.state ?? s;
    if (s.place === place) return s;
    if (m.result.guarded) s = clearGuard(content, r, s);
  }
  if (s.place !== place) throw new Stuck(s, `walk to ${place} stopped at ${s.place}`);
  return s;
}

/* Try one way on from `s`: everything it waits on done by play, then taken. Returns the state or throws Stuck. */
function take(content, r, s, exit, policy) {
  const sc = sceneOf(content, s);
  if (sc?.at && s.place !== sc.at) s = walkTo(content, r, s, sc.at);
  s = boards(content, r, s, exit, policy);
  for (const at of [exit.needs?.seen ?? []].flat()) s = r.call('look', s, { at }).state ?? s;
  const game = exit.game ?? null;
  if (game?.kind === 'duel' && !s.wins?.[game.id]) s = r.fight(s, game);
  let out = r.call('resolve', s, argsFor(content, s, exit, r.now));
  // A day that must pass (the 大比 is tomorrow): the clock moves on, as `shift` does.
  for (let d = 0; d < 3 && out.result.refused === 'needs' && exit.needs?.day_after; d += 1) {
    r.nextDay();
    out = r.call('resolve', s, argsFor(content, s, exit, r.now));
  }
  if (!out.result.ok) throw new Stuck(s, `${exit.id} refused ${out.result.refused}${out.result.say ? ` — ${out.result.say}` : ''}`);
  return out.state ?? s;
}

/* The ways on in the order a forward run tries them: a declared default first,
   then those that name a next scene, then the rest (a stay, a chapter's end). */
const order = (exits) => [...exits.filter((e) => e.default), ...exits.filter((e) => !e.default && e.next), ...exits.filter((e) => !e.default && !e.next)];

/* One scene played until the save stands somewhere else. `route` — exit ids to take, in order, where offered. */
function stepScene(content, r, s, policy, route) {
  const sc = sceneOf(content, s);
  if (!sc) throw new Stuck(s, 'no such scene');
  const stayed = new Set();
  for (let n = 0; n <= sc.exits.length; n += 1) {
    // `--route`: its next way is taken at the first scene that has one by that id; elsewhere, the default.
    const forced = route.length ? sc.exits.find((e) => e.id === route[0]) ?? null : null;
    const why = [];
    let next = null;
    for (const exit of forced ? [forced] : order(sc.exits).filter((e) => !stayed.has(e.id))) {
      try {
        next = take(content, r, s, exit, policy);
        if (forced) route.shift();
        r.log.push(`${sc.id}:${exit.id}`);
        stayed.add(exit.id);
        break;
      } catch (e) {
        if (!(e instanceof Stuck) || forced) throw e;
        why.push(`${exit.id}: ${e.why}`);
      }
    }
    if (!next) throw new Stuck(s, `no way on — ${why.join('; ') || 'every way taken, still here'}`);
    if (where(next) !== where(s)) return next;
    s = next; // a stay: the scene goes on, its other ways tried again from here
  }
  throw new Stuck(s, 'every way taken, still here');
}

/* Play `state` forward until it stands at `target` (or, with `targets`, at each of
   them, calling `onAt(label, state, runner)` the first time each stands). Returns
   {state, now, days, steps}; throws an Error with `.scene` and `.why` when it
   cannot go on. Every call here is in memory: nothing is written. */
export function playTo(content, state, target, { now = new Date(), policy = 'win', route = [], limit = 400, targets = null, onAt = null } = {}) {
  const r = makeRunner(content, { now });
  const want = targets ?? [[String(target), targetOf(content, target)]];
  for (const [label, t] of want) if (!t) throw Object.assign(new Error(`unknown target ${label}`), { scene: null, why: 'unknown-target' });
  const pending = new Map(want);
  const rest = [...route];
  let s = state;
  const check = () => {
    for (const [label, t] of [...pending]) if (atTarget(content, s, t)) { pending.delete(label); onAt?.(label, s, r); }
  };
  check();
  for (let n = 0; n < limit && pending.size; n += 1) {
    if (!s.scene) throw new Stuck(s, `the story stands nowhere (chapter ${s.chapter} ended${s.ended?.length ? `; ended ${s.ended.join(', ')}` : ''})`);
    s = stepScene(content, r, s, policy, rest);
    check();
  }
  if (pending.size) throw new Stuck(s, `not reached in ${limit} scenes: ${[...pending.keys()].join(', ')}`);
  if (rest.length) throw new Stuck(s, `--route ${rest.join(',')} never offered on the way`);
  return { state: s, now: r.now, days: r.days, steps: r.log };
}

/* The one line a seed prints: where the save stands and what it holds. */
export function summaryOf(content, s) {
  const lang = s.lang ?? 'zh';
  return {
    scene: s.scene, chapter: s.chapter, hui: sceneOf(content, s)?.hui ?? null,
    place: pick(placeOf(content, s.place)?.name, lang) ?? s.place, realm: realmName(content, s, lang),
    xiuwei: s.progress, lingshi: s.wealth, cards: (s.cards ?? []).length, bag: Object.keys(s.bag ?? {}).length,
  };
}
