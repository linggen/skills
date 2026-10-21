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
// bag, cards, marks, 修为, 灵石 gained on the way — and, at a 回's stage quest, the layer filled as
// its routine would fill it (rules/gates.mjs earned; the days are tools/balance.mjs's).
//
// Targets: a scene id (wm-mijing); a 回 (h07, j04, an absorbed h03; 古五, 今二,
// 第五回 — its first scene as played); a sealed instance's name or beat (秘境 —
// its entry scene).
import { pick, realmName, threshold } from '../state.mjs';
import { act, begin, foeTurn, offers, tokenOf } from '../battle.js';
import { lookahead } from '../fightline.js';
import { bookEntries, idsOf } from '../book-order.js';
import { VERBS } from './verbs.mjs';
import { allPlaces, encounterOf, foeOf, placeOf } from './world.mjs';
import { fightPill, fightSetup, pouchBrief, pouchFor, readOf } from './cards.mjs';
import { shelfOf } from './look.mjs';
import { fightStuck } from './skips.mjs';
import { riddleOf } from './core.mjs';
import { tellOf } from './tell.mjs';
import { earned, stageGate } from './gates.mjs';

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
/* A player who thinks a turn ahead (fightline.js lookahead) — the fights are
   tuned to be lost by a careless line, so the seed tries this one first. Its
   plain play-out only: the deep one cost the forward run ~3 s of CPU a pass
   (tests/seed-at.test.mjs) and a deal it loses is dealt again tomorrow. */
function thinkLine(setup, catalog) {
  const st = begin(setup, catalog), picks = [];
  for (let g = 0; g < 400 && st.outcome === 'open'; g += 1) {
    if (st.whose === 'foe') { foeTurn(st); continue; }
    const action = lookahead(st);
    act(st, action, 'you');
    picks.push(tokenOf(action));
  }
  return { outcome: st.outcome, picks };
}
export function winningPicks(setup, catalog, tries = 24) {
  const thought = thinkLine(setup, catalog);
  if (thought.outcome === 'won') return thought.picks;
  for (let w = 0; w < tries; w += 1) {
    const line = playLine(setup, catalog, w);
    if (line.outcome === 'won') return line.picks;
  }
  return null;
}

/* A fight is weighed to be won about 60% of the first times by a player who
   thinks a turn ahead (tests/fight-band.test.mjs): a day's deal may be lost
   by every line, so the seed tries the next day's deal, up to this many. */
const FIGHT_DAYS = 12;
/* Pills: two carried into a fight that is not won bare (the bands' player), and two fights' worth
   kept in the bag where a shelf sells them. */
const PILLS_IN = 2, PILLS_KEPT = 4;

/* ── one step ── */
class Stuck extends Error {
  constructor(s, why) { super(`stuck at ${where(s)}: ${why}`); this.scene = where(s); this.why = why; this.state = s; }
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
  /* A sensible player puts on what he is given before a fight (tools/story-fights.mjs weighs the
     fights so): the best 法器 · 法衣 · 佩 in the bag, each by its own number. */
  r.dress = (s) => {
    const best = {};
    for (const id of Object.keys(s.bag ?? {})) {
      const it = content.items.items.find((i) => i.id === id), e = it?.effect ?? {};
      const slot = { weapon: 'weapon', robe: 'robe', pendant: 'pendant' }[it?.kind];
      const n = e.atk ?? e.def ?? Object.values(e.ward ?? {}).reduce((a, b) => a + b, 0);
      if (slot && n > (best[slot]?.n ?? 0)) best[slot] = { id, n };
    }
    for (const [slot, { id }] of Object.entries(best)) {
      if (s.wear?.[slot] === id) continue;
      const out = r.call('trade', s, { action: 'use', id });
      if (out.result?.ok) s = out.state;
    }
    return s;
  };
  /* 丹囊: the bands are weighed for a player who carries pills in (tests/fight-band.test.mjs: about 45%
     bare, about 65% with two), so when no line wins today's deal bare, a sensible player takes what pills
     he holds through the door — a pill is spent only if the line takes it. Bare first, so a fight he wins
     without them costs none. Null to leave the door as it is; '' to carry none. */
  r.pouch = (s, game) => {
    if (s.fight) return null;
    const brief = pouchBrief(content, s);
    const carried = pouchFor(content, s).length > 0;
    if (!brief) return carried ? '' : null;
    const bare = fightSetup(content, { ...s, pill_pick: [] }, foeOf(content, game), r.now, game.id, game.deal, readOf(s, game));
    // Won bare: none carried (an old pick at the door is put down, so the pills last the night).
    if (winningPicks(bare, catalog)) return carried ? '' : null;
    const left = Object.fromEntries(brief.pills.map((p) => [p.id, p.n])), pick = [];
    // Two, as the bands weigh (TWO_PILLS: a heal and 灵力 where he holds both) — one of each kind first.
    const most = Math.min(PILLS_IN, brief.max);
    while (pick.length < most && brief.pills.some((p) => left[p.id] > 0)) {
      for (const p of brief.pills) if (left[p.id] > 0 && pick.length < most) { pick.push(p.id); left[p.id] -= 1; }
    }
    return pick.join(',');
  };
  /* Stocked before the night (balance.json `model.pills_bought`, the pills a player carries into his
     fights): where a shelf sells them and he holds fewer than two fights' worth (PILLS_KEPT), he buys them, one of each
     in turn, with what he has. Called as he comes to a scene, so a locked beat (world.mjs fitLock) is
     entered stocked from the last shelf on the road — inside it no shelf is reachable. */
  r.stock = (s) => {
    const want = content.balance?.model?.pills_bought ?? [];
    const place = placeOf(content, s.place);
    if (!want.length || !place?.has?.shop || s.fight) return s;
    const sold = new Set(shelfOf(content, place, s, r.now).map((i) => i.id));
    const held = () => Object.entries(s.bag ?? {}).reduce((n, [id, k]) => n + (fightPill(content, id) ? k : 0), 0);
    for (let i = 0; held() < PILLS_KEPT && i < 2 * PILLS_KEPT; i += 1) {
      const id = want[i % want.length];
      if (!sold.has(id)) continue;
      const out = r.call('trade', s, { action: 'buy', id });
      if (!out.result?.ok) break;
      s = out.state;
    }
    return s;
  };
  r.fight = (s, game) => {
    s = r.dress(s);
    for (let d = 0; d < FIGHT_DAYS; d += 1) {
      const pills = r.pouch(s, game);
      const started = r.call('duel', s, { id: game.id, ...(pills != null ? { pills } : {}) });
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
    // The last resort: inside a key beat's lock, a fight lost often enough may be left (rules/skips.mjs
    // fightStuck, Hanli 2026-10-21) — the way on is taken with `pass`, paying nothing.
    if (fightStuck(content, s, game)) { r.leave = game.id; return s; }
    throw new Stuck(s, `fight ${game.id}: no winning line in ${FIGHT_DAYS} days`);
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

/* 交差 on the 回's stage quest once it stands met, as a player does (rules/gates.mjs stageTurn): paid
   now and kept on the save — a seed never leaves it behind for the first load to pay back
   (2026-10-21: a save seeded at 01-altar got 540 灵石 of 补发 on its first load). */
function handIn(r, s) {
  const out = r.call('quest', s, { id: 'stage', action: 'turn' });
  if (out.result?.ok) r.log.push(`handed in ${out.result.key}`);
  return out.state ?? s;
}

/* Try one way on from `s`: everything it waits on done by play, then taken. Returns the state or throws Stuck. */
function take(content, r, s, exit, policy) {
  const sc = sceneOf(content, s);
  if (sc?.at && s.place !== sc.at) s = walkTo(content, r, s, sc.at);
  s = boards(content, r, s, exit, policy);
  for (const at of [exit.needs?.seen ?? []].flat()) s = r.call('look', s, { at }).state ?? s;
  // 阶段任务 (rules/gates.mjs): the way on waits on the layer full — the days of the routine that
  // fill it are the economy's (tools/balance.mjs), not played here: the realm stands there, earned.
  // Earned before the way on's fight: a player grinds the layer the gate asks, then goes up
  // (古八's 腊八 final is weighed at the 八层 its gate holds — tools/story-fights.mjs h09b).
  const gate = stageGate(content, s, sc?.id, exit.id);
  if (gate) { s = earned(content, s, gate); r.log.push(`earned ${gate.hui} ${gate.tier}:${gate.layer}`); }
  s = handIn(r, s); // the 回's stage quest met (earned here, or already by the realm he holds): 交差
  const game = exit.game ?? null;
  if (game?.kind === 'duel' && !s.wins?.[game.id]) s = r.fight(s, game);
  const pass = game && r.leave === game.id ? { pass: 1 } : {};
  let out = r.call('resolve', s, { ...argsFor(content, s, exit, r.now), ...pass });
  // A day that must pass (the 大比 is tomorrow): the clock moves on, as `shift` does.
  for (let d = 0; d < 3 && out.result.refused === 'needs' && exit.needs?.day_after; d += 1) {
    r.nextDay();
    out = r.call('resolve', s, { ...argsFor(content, s, exit, r.now), ...pass });
  }
  // 渡劫's throw missed (a 95% throw misses one save in twenty — 2026-10-21, a seed at 01-altar stuck at 09-cliff with
  // 「every way taken」): a player waits out the cauldron's cooldown, sits the 修为 it took back, and throws again.
  for (let k = 0; k < THROWS && out.result.ok && out.result.breakthrough?.success === false; k += 1) {
    s = refilled(content, out.state ?? s);
    while (r.now < new Date(out.result.breakthrough.again_at)) r.nextDay();
    out = r.call('resolve', s, { ...argsFor(content, s, exit, r.now), ...pass });
  }
  if (!out.result.ok) throw new Stuck(s, `${exit.id} refused ${out.result.refused}${out.result.say ? ` — ${out.result.say}` : ''}`);
  return out.state ?? s;
}

/* Throws a forward run makes at one breakthrough before it calls the way stuck. */
const THROWS = 5;
/* The realm's step full again after a missed throw (闭关 brings the 修为 back, ladder.json `_breakthrough`). */
const refilled = (content, s) => ({ ...s, progress: Math.max(s.progress ?? 0, threshold(content, s)) });

/* The ways on in the order a forward run tries them: a declared default first,
   then those that name a next scene, then the rest (a stay, a chapter's end). */
const order = (exits) => [...exits.filter((e) => e.default), ...exits.filter((e) => !e.default && e.next), ...exits.filter((e) => !e.default && !e.next)];

/* One scene played until the save stands somewhere else. `route` — exit ids to take, in order, where offered. */
function stepScene(content, r, s, policy, route) {
  s = r.stock(s);
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

/* The save a seed hands over owes the stage only the target scene's own passage:
   everything the run walked through is marked told, and the scene it stands in
   is owed afresh. The run's owed list (40-odd passages) once folded into a 前情
   catch-up on the first load, and the target scene's own opening could be lost
   behind it (今一, 2026-10-15). A key waiting for arrival stays owed. */
export function toldUpTo(content, s) {
  const t = tellOf(content, s);
  if (!t) return s;
  const here = s.scene;
  const told = t.keep.told_scenes.filter((id) => id !== here);
  const owed = t.keep.tell_owed.filter((k) => k !== `scene/${here}`);
  const story = content.chapters[s.chapter]?.scenes?.[here]?.story;
  return { ...t.keep, told_scenes: told, tell_owed: story ? [...owed, `scene/${here}`] : owed };
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
