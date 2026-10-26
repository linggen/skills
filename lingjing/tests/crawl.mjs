// tests/crawl.mjs — the headless half of the playtest crawler (tools/playtest.mjs is the page's):
// every scene of 卷一 reached from a fresh save, every exit of each taken once, with the rules
// alone. At each scene the walk does what the page would do before a way on — walks to the
// scene's place, plays the boards an exit waits on, wins its fight, looks at what must be seen,
// waits out a day — and asserts the stage always holds a way on. What it had to FORCE (a mark,
// an errand, an item no earlier step gave) is reported, never hidden: each is a road a player
// might not find.
import { look, move, resolve, VERBS } from '../scripts/rules.mjs';
import { newState } from '../scripts/state.mjs';
import { stageCards, stageSlots, wonWayOn } from '../scripts/stage.mjs';
import { boardsFor, V1_BIRTH, walk } from './prologue.mjs';
import { earnedFor } from './earn.mjs';

const DAY = 86400000;
export const JUAN_ONE = ['00-prologue', '00-waimen', '00-zhuji'];
const sceneOf = (content, s) => content.chapters[s.chapter]?.scenes?.[s.scene] ?? null;
const fresh = (s, now) => ({ ...s, stamina: 100, stamina_at: now.toISOString() });

/* The args a way on is taken with, as the page sends them (a 生辰, a name, a story's own name). */
function argsFor(content, s, exit) {
  const a = { exit: exit.id };
  if (exit.born) a.birth = V1_BIRTH;
  if (exit.value) a.value = [exit.value.offer ?? exit.value.offers ?? exit.value.choices ?? []].flat()[0] ?? (s.lang === 'en' ? 'Alex' : '小满');
  if (exit.names) a.said = exit.names.value;
  return a;
}

/* The boards an exit waits on, left (「算了，往下走」, rules/skips.mjs) — every one before it in the
   scene's `show` first, as the page lays them. A skip pays nothing; the story must go on all the same. */
function skipsFor(content, s, exit) {
  const sc = sceneOf(content, s), need = exit.needs?.task;
  if (!need || s.tasks?.[need]?.status === 'done') return [];
  const order = (sc?.show ?? []).filter((c) => c.card === 'board').map((c) => c.id);
  const ids = [...order.slice(0, Math.max(0, order.indexOf(need))), need].filter((id) => s.tasks?.[id]?.status !== 'done');
  return ids.map((id) => ['task', { action: 'skip', id }]);
}

/* Make what the exit waits on true, the page's way first; what only forcing can do is named.
   `boards`: 'play' wins each board (with the grade the exit wants), 'skip' leaves each. */
function prepare(content, s, exit, now, forced, boards = 'play') {
  const sc = sceneOf(content, s);
  if (sc?.at && s.place !== sc.at) {
    let r = move(s, content, { now, quests: [] }, { place: sc.at });
    // A room that holds the way (places' has.guard): played as the page plays it — its pool fight won, its board — then on.
    for (let k = 0; k < 3 && (r.result.guarded || r.result.refused === 'guarded'); k++) {
      s = clearGuard(content, r.state ?? s);
      r = move(s, content, { now, quests: [] }, { place: sc.at });
    }
    if (r.result.ok && r.state) s = r.state;
    else forced.push(`walk to ${sc.at}: ${r.result.refused}`);
  }
  if (exit.needs?.task) s = walk(s, boards === 'skip' ? skipsFor(content, s, exit) : boardsFor(s, content, exit.id), content, now);
  const n = exit.needs ?? {};
  if (n.seen) for (const at of [n.seen].flat()) s = VERBS.look(s, content, { now, quests: [] }, { at }).state ?? s;
  if (n.mark && !(s.marks ?? []).includes(n.mark)) { forced.push(`mark ${n.mark}`); s = { ...s, marks: [...(s.marks ?? []), n.mark] }; }
  // The other side of a fork (`no_mark`, 古六's 刮鞋底 reading 古三's steps): the walk took one side earlier; the other
  // side is a road an earlier step opens just as well (00-gate's rush), so the mark is set aside, not forced.
  if (n.no_mark && (s.marks ?? []).includes(n.no_mark)) s = { ...s, marks: s.marks.filter((m) => m !== n.no_mark) };
  if (n.quest && !s.quests?.[n.quest]?.done_at) { forced.push(`errand ${n.quest}`); s = { ...s, quests: { ...s.quests, [n.quest]: { took: 'x', have: {}, done_at: now.toISOString() } } }; }
  if (n.bag && !(s.bag?.[n.bag] > 0)) { forced.push(`item ${n.bag}`); s = { ...s, bag: { ...s.bag, [n.bag]: 1 } }; }
  if (n.wealth && !(s.wealth >= n.wealth)) { forced.push(`wealth ${n.wealth}`); s = { ...s, wealth: n.wealth }; }
  const game = exit.game ?? null;
  if (game && !s.wins?.[game.id]) s = { ...s, wins: { ...s.wins, [game.id]: now.toISOString() } };
  if (exit.breakthrough && !atPeak(content, s)) {
    forced.push(`breakthrough at peak (stood at ${s.tier} ${s.step} · ${s.progress})`);
    s = peakOf(content, s);
  }
  return s;
}
function clearGuard(content, s) {
  const g = content.places && Object.values(content.places).flatMap(d => d.places).find(p => p.id === s.place)?.has?.guard;
  if (!g) return s;
  return { ...s, ...(g.won ? { hunted: { ...s.hunted, [s.place]: g.won.n } } : {}), ...(g.task ? { tasks: { ...s.tasks, [g.task.id]: { status: 'done' } } } : {}) };
}
const atPeak = (content, s) => {
  const tier = content.ladder.tiers.find((t) => t.id === s.tier);
  return s.step === tier.thresholds.length - 1 && s.progress >= tier.thresholds.at(-1);
};
const peakOf = (content, s) => {
  const tier = content.ladder.tiers.find((t) => t.id === s.tier);
  return { ...s, step: tier.thresholds.length - 1, progress: tier.thresholds.at(-1) };
};

/* A way on stands: the scene's card with a choice, a card in main, or the roads. */
export function wayOn(content, s, now) {
  const lk = look(s, content, { now, quests: [] });
  const slots = stageSlots(lk, lk.stage ?? stageCards(lk));
  const taps = lk.scene?.panel?.taps ?? [];
  const roads = !lk.seclusion && !lk.director?.corridor && (lk.director?.near ?? []).length > 0;
  return { ok: slots.main.length > 0 || taps.length > 0 || roads, lk, slots, roads };
}

/* The crawl: breadth first over scenes, each exit of each scene once, from the state the
   scene was first reached in. */
export function crawlRules(content, { start = new Date('2026-09-29T09:00:00'), chapters = JUAN_ONE, lang = 'zh', limit = 600, boards = 'play' } = {}) {
  const scenes = new Map(), exits = new Map(), findings = [], forcedAll = [], states = new Map();
  // The boards left on the way (`boards: 'skip'`): as each exit is prepared — a branch's state may not be the one kept.
  const left = new Set();
  const key = (s) => `${s.chapter}/${s.scene}`;
  const queue = [{ s: newState(content, lang, start), now: start, path: [] }];
  let n = 0;
  while (queue.length && n++ < limit) {
    const { s: arrived, now: t0, path } = queue.shift();
    let s0 = arrived;
    if (!chapters.includes(s0.chapter) || !s0.scene || scenes.has(key(s0))) continue;
    scenes.set(key(s0), path);
    states.set(key(s0), { s: s0, now: t0 });
    const sc = sceneOf(content, s0);
    if (!sc) { findings.push({ scene: key(s0), what: 'no such scene', path }); continue; }
    const way = wayOn(content, fresh(s0, t0), t0);
    if (!way.ok) findings.push({ scene: sc.id, what: 'arrived and nothing to tap', path });
    for (const exit of sc.exits) {
      let now = t0;
      const forced = [];
      // A 回's stage quest (rules/gates.mjs): the routine's days are the economy's — earned here.
      let s = earnedFor(content, prepare(content, fresh(s0, now), exit, now, forced, boards), exit.id);
      for (const e of s.skipped ?? []) left.add(e.task);
      let r = resolve(s, content, { now, quests: [] }, argsFor(content, s, exit));
      // A day that must pass (the 大比 is tomorrow): the page's clock moves on.
      for (let d = 0; d < 3 && r.result.refused === 'needs' && exit.needs?.day_after; d++) {
        now = new Date(now.getTime() + DAY);
        s = prepare(content, fresh(s, now), exit, now, forced, boards);
        r = resolve(s, content, { now, quests: [] }, argsFor(content, s, exit));
      }
      const id = `${sc.id}:${exit.id}`;
      if (forced.length) forcedAll.push({ exit: id, forced });
      const snub = r.result.refused === 'snubbed';
      exits.set(id, r.result.ok ? 'ok' : snub ? 'snubbed' : r.result.refused);
      if (!r.result.ok && !snub) { findings.push({ scene: sc.id, exit: exit.id, what: `refused ${r.result.refused}: ${r.result.say ?? ''}`, path }); continue; }
      // A scene's fight won leaves the page one way on to take for him (stage.mjs wonWayOn).
      if (exit.game?.kind === 'duel') {
        // Looked at where the page stands once it has walked there (prepare), the fight just won.
        const lk = look({ ...fresh(s0, t0), place: s.place, wins: { ...s0.wins, [exit.game.id]: t0.toISOString() } }, content, { now: t0, quests: [] });
        if (!lk.fight && !wonWayOn(lk) && lk.scene?.exits?.filter((e) => e.game?.kind === 'duel' && e.won).length !== 2) findings.push({ scene: sc.id, exit: exit.id, what: 'a won fight leaves no way on (wonWayOn)', path });
      }
      const next = r.state ?? s;
      if (key(next) === key(s0) && !snub) {
        // A stay: the scene goes on — something must still stand.
        if (!wayOn(content, fresh(next, now), now).ok) findings.push({ scene: sc.id, exit: exit.id, what: 'stayed and nothing to tap', path });
        // …and the scene's other ways are taken from there, as the player would (a mark set by one is another's need).
        s0 = next;
        continue;
      }
      if (!snub) queue.push({ s: next, now, path: [...path, id] });
    }
  }
  return { scenes, exits, findings, forced: forcedAll, states, left };
}
