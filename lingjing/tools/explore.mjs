// tools/explore.mjs — Layer 1 of the game's tests: 卷一's state space, by the rules alone
// (Hanli, 2026-10-15: 「游戏的分支太多, 我们应该怎么测试呢」 → 「做一个自动化测试. 确保覆盖率」).
//
//   node tools/explore.mjs [--fast] [--json] [--lang=zh|en]
//   node tools/explore.mjs --sweep[=all-win|all-skip|lose-retry|random] [--seeds=50]   (Layer 2)
//
// From a fresh save it takes every way a player can: every exit of every scene, every
// board an exit waits on won with each grade it keeps and left (「算了，往下走」), every
// scene fight won and lost-then-fought-again the next day, the looks an exit waits on,
// the day a dated beat waits for. Equivalent saves are merged (the scene, the marks and
// grades the story reads, the boards done here, the items and 灵石 thresholds it reads,
// the beasts with him, her presence, the realm) so it ends. At every save it runs the
// health check (scripts/rules/health.mjs), and at the end it asks: was every scene
// reached, every exit taken, and does every save still lead to 卷一's end?
//
// Nothing is forced. What the page does for him on the way (a passage told, a walk to
// the scene's place, a room's guard beaten) is done as the page does it; an exit whose
// need no earlier step gave is simply shut on that branch — and an exit shut on EVERY
// branch shows up as never taken.
//
// --fast (CI): one grade per board besides the skip — the first grade, and a second
// only where an exit reads it (needs.grade). The full run plays every grade.
import { fileURLToPath } from 'node:url';
import { loadContent } from '../scripts/content.mjs';
import { layerNo, newState } from '../scripts/state.mjs';
import { look, move, resolve, task, win, VERBS } from '../scripts/rules.mjs';
import { tellOf } from '../scripts/rules/tell.mjs';
import { health } from '../scripts/rules/health.mjs';
import { atScene } from '../scripts/rules/world.mjs';
import { earned, entryGate, stageGate } from '../scripts/rules/gates.mjs';

const DAY = 86400000;
export const JUAN_ONE = ['00-prologue', '00-waimen', '00-zhuji'];
export const BIRTH = '1986-07-07';
const ctxOf = now => ({ now, quests: [] });
const sceneOf = (content, s) => content.chapters[s.chapter]?.scenes?.[s.scene] ?? null;
const rested = (s, now) => ({ ...s, stamina: 100, stamina_at: now.toISOString() });
const taskOf = (content, id) => content.tasks.tasks.find(t => t.id === id);

/* ── What the story reads, from the content: the merge key keeps only these ── */
export function readsOf(content, chapters = JUAN_ONE) {
  const marks = new Set(), grades = new Set(), bag = new Set(), wealth = new Set(), quests = new Set();
  for (const ch of chapters) for (const sc of Object.values(content.chapters[ch]?.scenes ?? {})) for (const e of sc.exits ?? []) {
    const n = e.needs ?? {};
    if (n.mark) marks.add(n.mark);
    if (n.no_mark) marks.add(n.no_mark); // a fork's other side (守灶台's raindrop by the way 00-masan went): a save with it is another save
    if (e.once && e.mark) marks.add(e.mark);
    if (e.snub && e.mark) marks.add(e.mark);
    if (n.grade) grades.add(n.task);
    if (n.bag) bag.add(n.bag);
    if (e.take?.bag) bag.add(e.take.bag);
    if (n.wealth) wealth.add(n.wealth);
    if (n.quest) quests.add(n.quest);
  }
  return { marks, grades, bag, wealth: [...wealth].sort((a, b) => a - b), quests };
}

export function keyOf(content, reads, s) {
  const sc = sceneOf(content, s);
  const here = new Set([...(sc?.show ?? []).filter(c => c.card === 'board').map(c => c.id), ...(sc?.offers?.tasks ?? [])]);
  const duels = (sc?.exits ?? []).filter(e => e.game).map(e => e.game.id);
  return [
    `${s.chapter}/${s.scene}`,
    (s.marks ?? []).filter(m => reads.marks.has(m)).sort().join(','),
    Object.entries(s.grades ?? {}).filter(([t]) => reads.grades.has(t)).map(([t, g]) => `${t}=${g}`).sort().join(','),
    [...here].filter(id => s.tasks?.[id]?.status === 'done').sort().join(','),
    duels.filter(id => s.wins?.[id]).join(','),
    [...reads.bag].filter(id => s.bag?.[id] > 0).sort().join(','),
    reads.wealth.filter(w => s.wealth >= w).join(','),
    [...reads.quests].filter(q => s.quests?.[q]?.done_at).join(','),
    (s.cast ?? []).slice().sort().join(','),
    s.companion ? `${s.companion.joined ? 'j' : ''}${s.companion.asleep ? 'z' : ''}` : '-',
    `${s.tier}:${s.step}`,
  ].join('|');
}

/* ── The page's own moves on the way ── */

/* The passages owed, played by the stage (rules.mjs pageTell): marked told. */
function told(content, s) {
  const t = tellOf(content, s);
  return t ? { ...s, tell_owed: t.keep.tell_owed, told_scenes: t.keep.told_scenes } : s;
}

/* Walk to the scene's place, a room's guard beaten on the way (its pool fights won, its board). */
function walkTo(content, s, now) {
  const sc = sceneOf(content, s);
  if (!sc?.at || atScene(content, s)) return { s };
  let r = move(s, content, ctxOf(now), { place: sc.at });
  for (let k = 0; k < 3 && (r.result.guarded || r.result.refused === 'guarded'); k++) {
    s = beatGuard(content, r.state ?? s);
    r = move(s, content, ctxOf(now), { place: sc.at });
  }
  if (r.result.ok && r.state) return { s: r.state };
  return { s, refused: r.result.refused ?? 'move' };
}
function beatGuard(content, s) {
  const g = Object.values(content.places).flatMap(d => d.places).find(p => p.id === s.place)?.has?.guard;
  if (!g) return s;
  return { ...s, ...(g.won ? { hunted: { ...s.hunted, [s.place]: g.won.n } } : {}), ...(g.task ? { tasks: { ...s.tasks, [g.task.id]: { status: 'done' } } } : {}) };
}

/* A board: won with a grade (the page sends `win` with the module's grade, then hands it in),
   or left — the page's 「算了，往下走」, Task skip (rules/skips.mjs): done, nothing paid. */
export function playBoard(content, s, id, grade, now) {
  if (grade === 'skip') { const r = task(s, content, ctxOf(now), { action: 'skip', id }); return r.result.ok ? r.state : null; }
  const w = win(s, content, ctxOf(now), { id, ...(grade && grade !== 'skip' && grade !== 'won' ? { grade } : {}) });
  if (!w.result.ok) return null;
  const d = task(w.state, content, ctxOf(now), { action: 'done', id });
  return d.result.ok ? d.state : null;
}

/* The outcomes a board offers: each grade it keeps (the first only, in fast mode, unless an
   exit reads it), else won — and the skip. */
export function gradesOf(content, id, { fast = false, reads } = {}) {
  const keeps = Object.keys(taskOf(content, id)?.marks ?? {});
  const wins = !keeps.length ? ['won'] : fast && !reads?.grades.has(id) ? keeps.slice(0, 1) : keeps;
  return [...wins, 'skip'];
}

/* The boards an exit waits on, in the scene's order (each one before it played first). */
function boardsBefore(content, s, exit) {
  const sc = sceneOf(content, s), need = exit.needs?.task;
  if (!need) return [];
  const order = [...new Set([...(sc.show ?? []).filter(c => c.card === 'board').map(c => c.id), ...(sc.offers?.tasks ?? [])])];
  const upto = order.includes(need) ? order.slice(0, order.indexOf(need) + 1) : [need];
  return upto.filter(id => s.tasks?.[id]?.status !== 'done');
}

/* Every combination of board outcomes, as [{id, grade}] lists. */
function boardPlans(content, ids, opts) {
  let plans = [[]];
  for (const id of ids) plans = plans.flatMap(p => gradesOf(content, id, opts).map(g => [...p, { id, grade: g }]));
  return plans;
}

/* The args a way on is taken with, as the page sends them. */
function argsFor(s, exit) {
  const a = { exit: exit.id };
  if (exit.born) a.birth = BIRTH;
  if (exit.value) a.value = [exit.value.offer ?? exit.value.offers ?? exit.value.choices ?? []].flat()[0] ?? (s.lang === 'en' ? 'Alex' : '小满');
  if (exit.names) a.said = exit.names.value;
  return a;
}

/* One exit taken under one plan: the boards played, the looks looked, the fight won (or
   lost and fought again tomorrow), the day waited. → {state, now, result, tags} */
function take(content, s0, now0, exit, plan, fight) {
  let s = s0, now = now0;
  const tags = [];
  for (const b of plan) {
    const next = playBoard(content, s, b.id, b.grade, now);
    if (!next) return { result: { ok: false, refused: `board ${b.id} would not play (${b.grade})` }, tags };
    s = next;
    tags.push(`board:${b.id}:${b.grade}`);
  }
  for (const at of [exit.needs?.seen ?? []].flat()) s = VERBS.look(s, content, ctxOf(now), { at }).state ?? s;
  const game = exit.game;
  if (game?.kind === 'duel' && !s.wins?.[game.id]) {
    if (fight === 'lost') {
      s = { ...s, duels: { ...s.duels, [game.creature]: { day: new Date(now).toISOString().slice(0, 10), outcome: 'lost' } } };
      const tried = resolve(s, content, ctxOf(now), argsFor(s, exit));
      if (tried.result.ok) return { result: { ok: false, refused: 'a lost fight let him through' }, tags };
      if (!game.retry) now = new Date(now.getTime() + DAY);
      s = rested(s, now);
      tags.push(`fight:${game.id}:lost`);
    }
    s = { ...s, wins: { ...s.wins, [game.id]: now.toISOString() } };
    tags.push(`fight:${game.id}:won`);
  } else if (game && !s.wins?.[game.id]) {
    // A scene's own board game (not a duel) won as the page records it.
    s = { ...s, wins: { ...s.wins, [game.id]: now.toISOString() } };
  }
  // 阶段任务 (rules/gates.mjs): the routine that fills the layer is the economy's (tools/balance.mjs) — earned here.
  const gate = stageGate(content, s, sceneOf(content, s)?.id, exit.id) ?? entryGate(content, s, exit);
  if (gate) { s = earned(content, s, gate); tags.push(`stage:${gate.hui}:${gate.layer}`); }
  let r = resolve(s, content, ctxOf(now), argsFor(s, exit));
  for (let d = 0; d < 3 && r.result.refused === 'needs' && exit.needs?.day_after; d++) {
    now = new Date(now.getTime() + DAY);
    s = rested(s, now);
    r = resolve(s, content, ctxOf(now), argsFor(s, exit));
  }
  return { state: r.state ?? s, now, result: r.result, tags };
}

/* ── The explorer ── */
export function explore(content, { fast = false, lang = 'zh', start = new Date('2026-09-29T09:00:00'), chapters = JUAN_ONE, limit = 30000 } = {}) {
  // `limit`: 30000 since 2026-10-27 — 卷一 holds 20023 distinct saves once 古七's years and 古六's 三层 eve land (19063 before); the cap is headroom, never the count.
  const reads = readsOf(content, chapters);
  const opts = { fast, reads };
  const nodes = new Map(); // key → {key, scene, path, edges:Set<key|END>, problems}
  const covered = { scenes: new Set(), exits: new Set(), boards: new Set(), grades: new Set(), fights: new Set() };
  const refusedExits = new Map(); // exit → reasons seen
  const problems = [];
  const END = 'END';
  const queue = [];
  const push = (s, now, path, from) => {
    const inJuan = s.scene && chapters.includes(s.chapter);
    if (!inJuan) { if (from) nodes.get(from).edges.add(END); return; }
    const k = keyOf(content, reads, s);
    if (from) nodes.get(from).edges.add(k);
    if (nodes.has(k)) return;
    nodes.set(k, { key: k, scene: `${s.chapter}/${s.scene}`, path, edges: new Set(), problems: [] });
    queue.push({ k, s, now, path });
  };
  push(newState(content, lang, start), start, [], null);
  let n = 0;
  while (queue.length && n++ < limit) {
    const { k, s: arrived, now, path } = queue.shift();
    const node = nodes.get(k);
    const sc = sceneOf(content, arrived);
    covered.scenes.add(node.scene);
    // The page: the passages played, the walk to the scene's place.
    let s = rested(told(content, arrived), now);
    const walked = walkTo(content, s, now);
    s = walked.s;
    if (walked.refused) problems.push({ at: node.scene, id: 'walk-refused', text: `the walk to ${sc.at} is refused: ${walked.refused}`, path });
    for (const p of health(content, s, now).filter(x => x.level === 'error')) {
      node.problems.push(p);
      problems.push({ at: node.scene, id: p.id, text: p.text, path });
    }
    // Each way the boards went (a grade, a skip) must leave some exit open — one that waits on
    // no more than those boards' outcomes.
    const tried = new Map(); // plan key → plan
    const passed = [];
    for (const exit of sc.exits) {
      const plans = boardPlans(content, boardsBefore(content, s, exit), opts);
      const fights = exit.game?.kind === 'duel' && !s.wins?.[exit.game.id] ? ['won', 'lost'] : [null];
      for (const plan of plans) for (const fight of fights) {
        const out = take(content, s, now, exit, plan, fight);
        const id = `${sc.id}:${exit.id}`;
        const snub = out.result.refused === 'snubbed';
        const pk = plan.map(b => `${b.id}:${b.grade}`);
        tried.set(pk.join(','), pk);
        if (out.result.ok && !snub) passed.push(new Set(pk));
        if (!out.result.ok && !snub) {
          if (!refusedExits.has(id)) refusedExits.set(id, new Set());
          refusedExits.get(id).add(out.result.refused);
          continue;
        }
        covered.exits.add(id);
        for (const t of out.tags) {
          const [kind, tid, how] = t.split(':');
          if (kind === 'board') { covered.boards.add(tid); covered.grades.add(`${tid}:${how}`); }
          if (kind === 'fight') covered.fights.add(`${tid}:${how}`);
        }
        push(out.state, out.now, [...path, `${id}${plan.length ? `[${plan.map(b => b.grade).join(',')}]` : ''}${fight === 'lost' ? '[lost]' : ''}`], k);
      }
    }
    for (const [pk, plan] of tried) {
      if (!plan.length || passed.some(q => [...q].every(x => plan.includes(x)))) continue;
      problems.push({ at: node.scene, id: 'board-outcome-shuts', text: `after ${pk} every way out of ${sc.id} is shut (${sc.exits.map(e => `${e.id}: ${[...(refusedExits.get(`${sc.id}:${e.id}`) ?? [])].join('/') || '?'}`).join(', ')})`, path });
    }
    if (!node.edges.size) problems.push({ at: node.scene, id: 'dead-end', text: `no exit of ${sc.id} can be taken on this branch (${sc.exits.map(e => `${e.id}: ${[...(refusedExits.get(`${sc.id}:${e.id}`) ?? [])].join('/') || '?'}`).join(', ')})`, path });
  }
  // Every save must still lead to the end: walk back from END.
  const back = new Map();
  for (const node of nodes.values()) for (const to of node.edges) { if (!back.has(to)) back.set(to, []); back.get(to).push(node.key); }
  const reach = new Set([END]), stack = [END];
  while (stack.length) for (const from of back.get(stack.pop()) ?? []) if (!reach.has(from)) { reach.add(from); stack.push(from); }
  const stranded = [...nodes.values()].filter(nd => !reach.has(nd.key));
  for (const nd of stranded) if (nd.edges.size) problems.push({ at: nd.scene, id: 'no-way-to-end', text: `from here 卷一's end cannot be reached`, path: nd.path });
  return { nodes, covered, problems, refusedExits, reachedEnd: reach.size > 1 && nodes.size > 0, cut: queue.length > 0, totals: totalsOf(content, chapters, opts) };
}

/* ── Layer 2: one player at a time, by a policy ──
   A policy picks, at each scene, the order to try its exits, each board's outcome and
   each fight's. The sweep plays until 卷一 ends; at every scene the health check runs and
   the realm is kept per 回 (the book's rank: tier and layer as each 回 is left). */
export const POLICIES = {
  'all-win': () => ({ exits: es => es, board: (content, id) => gradesOf(content, id)[0], fight: () => 'won' }),
  'all-skip': () => ({ exits: es => es, board: () => 'skip', fight: () => 'won' }),
  'lose-retry': () => ({ exits: es => es, board: (content, id) => gradesOf(content, id)[0], fight: () => 'lost' }),
  random: seed => {
    let h = 2166136261 ^ Number(seed);
    const rnd = () => { h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0; return (h >>> 0) / 4294967296; };
    const shuffle = xs => xs.map(x => [rnd(), x]).sort((a, b) => a[0] - b[0]).map(p => p[1]);
    return { exits: es => shuffle(es), board: (content, id) => { const g = gradesOf(content, id); return g[Math.floor(rnd() * g.length)]; }, fight: () => (rnd() < 0.3 ? 'lost' : 'won') };
  },
};

export function sweep(content, policyName, { seed = 1, lang = 'zh', start = new Date('2026-09-29T09:00:00'), chapters = JUAN_ONE, steps = 600, arrive = null } = {}) {
  const policy = POLICIES[policyName](seed);
  let s = newState(content, lang, start), now = start;
  const problems = [], ranks = [], path = [];
  const taken = new Map(); // a scene's exits taken at this save (key) — a stay is not taken twice
  let hui = null;
  for (let n = 0; n < steps; n++) {
    if (!s.scene || !chapters.includes(s.chapter)) return { ended: true, problems, ranks: [...ranks, { hui, tier: s.tier, layer: s.step }], path, now };
    const sc = sceneOf(content, s);
    // `arrive`: the save as he steps into each scene (passages still owed) — tools/page-crawl.mjs seeds its saves from it.
    arrive?.(sc.id, s, now);
    if (sc.hui !== hui) { if (hui) ranks.push({ hui, tier: s.tier, layer: s.step }); hui = sc.hui; }
    s = rested(told(content, s), now);
    const walked = walkTo(content, s, now);
    s = walked.s;
    for (const p of health(content, s, now).filter(x => x.level === 'error')) problems.push({ at: sc.id, id: p.id, text: p.text, path: path.slice(-4) });
    const key = keyOf(content, readsOf(content, chapters), s);
    const done = taken.get(key) ?? new Set();
    const order = policy.exits(sc.exits.filter(e => !done.has(e.id)));
    let moved = false;
    // A board goes one way, whichever exit is tried after it; so does a fight.
    const went = new Map(), fought = new Map();
    const outcome = id => { if (!went.has(id)) went.set(id, policy.board(content, id)); return went.get(id); };
    for (const exit of [...order, ...sc.exits.filter(e => done.has(e.id))]) {
      const plan = boardsBefore(content, s, exit).map(id => ({ id, grade: outcome(id) }));
      const duel = exit.game?.kind === 'duel' && !s.wins?.[exit.game.id] ? exit.game.id : null;
      if (duel && !fought.has(duel)) fought.set(duel, policy.fight());
      const fight = duel ? fought.get(duel) : null;
      const out = take(content, s, now, exit, plan, fight);
      if (!out.result.ok && out.result.refused !== 'snubbed') continue;
      done.add(exit.id); taken.set(key, done);
      path.push(`${sc.id}:${exit.id}${plan.length ? `[${plan.map(b => b.grade).join(',')}]` : ''}${fight === 'lost' ? '[lost]' : ''}`);
      s = out.state; now = out.now; moved = true;
      break;
    }
    if (!moved) { problems.push({ at: sc.id, id: 'dead-end', text: `${policyName}: no exit of ${sc.id} could be taken`, path: path.slice(-4) }); return { ended: false, problems, ranks, path, now }; }
  }
  problems.push({ at: s.scene, id: 'too-long', text: `${policyName}: 卷一 not ended in ${steps} steps`, path: path.slice(-6) });
  return { ended: false, problems, ranks, path, now };
}

/* What there is to cover. */
export function totalsOf(content, chapters = JUAN_ONE, opts = {}) {
  const scenes = [], exits = [], boards = new Set(), grades = new Set(), fights = new Set();
  for (const ch of chapters) for (const sc of Object.values(content.chapters[ch]?.scenes ?? {})) {
    scenes.push(`${ch}/${sc.id}`);
    for (const e of sc.exits) {
      exits.push(`${sc.id}:${e.id}`);
      if (e.needs?.task) boards.add(e.needs.task);
      if (e.game?.kind === 'duel') { fights.add(`${e.game.id}:won`); fights.add(`${e.game.id}:lost`); }
    }
    for (const c of sc.show ?? []) if (c.card === 'board') boards.add(c.id);
  }
  for (const id of boards) for (const g of gradesOf(content, id, opts)) grades.add(`${id}:${g}`);
  return { scenes, exits, boards: [...boards], grades: [...grades], fights: [...fights] };
}

export function coverage(r) {
  const pct = (have, all) => ({ covered: all.filter(x => have.has(x)).length, total: all.length, missing: all.filter(x => !have.has(x)) });
  const boardsPlayed = r.totals.boards.filter(b => r.covered.boards.has(b));
  return {
    states: r.nodes.size,
    scenes: pct(r.covered.scenes, r.totals.scenes),
    exits: pct(r.covered.exits, r.totals.exits),
    boards: { covered: boardsPlayed.length, total: r.totals.boards.length, missing: r.totals.boards.filter(b => !r.covered.boards.has(b)) },
    grades: pct(r.covered.grades, r.totals.grades),
    fights: pct(r.covered.fights, r.totals.fights),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const flags = Object.fromEntries(process.argv.slice(2).map(a => /^--([^=]+)(?:=(.*))?$/.exec(a)).filter(Boolean).map(m => [m[1], m[2] ?? true]));
  process.env.LINGJING_STAMINA_LIMIT ??= '0';
  const t0 = Date.now();
  if (flags.sweep) {
    const content = loadContent();
    const runs = flags.sweep === 'random' ? Array.from({ length: Number(flags.seeds ?? 50) }, (_, i) => ['random', i + 1]) : (flags.sweep === true ? ['all-win', 'all-skip', 'lose-retry'] : [flags.sweep]).map(p => [p, 1]);
    for (const [p, seed] of runs) {
      const r = sweep(content, p, { seed, lang: flags.lang ?? 'zh' });
      console.log(`${p}${p === 'random' ? `#${seed}` : ''}: ${r.ended ? 'ended' : 'STUCK'} in ${r.path.length} steps, ${r.problems.length} problems · ${r.ranks.map(x => `${x.hui} ${x.tier}${layerNo(content, x.tier, x.layer)}`).join(' ')}`);
      for (const pr of r.problems.slice(0, 5)) console.log(`  ${pr.id} @ ${pr.at}: ${pr.text}`);
    }
    process.exit(0);
  }
  const r = explore(loadContent(), { fast: Boolean(flags.fast), lang: flags.lang ?? 'zh' });
  const cov = coverage(r);
  if (flags.json) console.log(JSON.stringify({ coverage: cov, problems: r.problems, ms: Date.now() - t0 }, null, 1));
  else {
    const line = (name, c) => `${name.padEnd(7)} ${c.covered}/${c.total}${c.missing?.length ? `  missing: ${c.missing.slice(0, 12).join(', ')}${c.missing.length > 12 ? ' …' : ''}` : ''}`;
    console.log(`卷一 explored in ${Date.now() - t0} ms — ${cov.states} distinct saves${r.cut ? ' (CUT at the limit)' : ''}`);
    for (const k of ['scenes', 'exits', 'boards', 'grades', 'fights']) console.log(line(k, cov[k]));
    const byId = new Map();
    for (const p of r.problems) { const key = `${p.id} @ ${p.at}`; if (!byId.has(key)) byId.set(key, p); }
    console.log(`problems: ${r.problems.length} (${byId.size} distinct)`);
    for (const [key, p] of byId) console.log(`  ${key}: ${p.text}\n    via ${p.path.slice(-4).join(' → ')}`);
  }
  process.exitCode = r.problems.length || cov.scenes.missing.length || cov.exits.missing.length ? 1 : 0;
}
