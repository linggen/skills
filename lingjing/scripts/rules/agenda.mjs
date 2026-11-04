// rules/agenda.mjs — 事: ONE ordered list, shown at two sizes (Hanli 2026-11-04: 「可以, 按你说的做」). The tray under the
// stage is its head; the 事 view is all of it, in the same order. Part of the rules engine; rules.mjs is its one door.
//
// Three groups, in a fixed order:
//   main  主线 — the story's next step (the goal line, Look's `waypoint`); when the stage quest holds the story, the stage
//               quest leads and the goal line rides under it (`way: true`, never a second item). Then the story's boards.
//   goal  目标 — the stage quest (when it does not lead) and the repeatables that serve it: the ones its `work` points at
//               (a fight at that place, the errands offered there) — each `serves` the step, the page words 「练气五层 ↑」.
//   other 其他 — everything else: what can be handed in, the tray's games and cooldowns, the boards kept, the errands in
//               hand, 机缘, 开府, the 人间功课 chores, what is offered, the work a walk away, a visiting shop.
// Every item appears once (`key`). An item is a reference — `kind` and `id` name where its facts already are in Look
// (`book`, `tray`, `kept`, `offers`, `kaifu`, `stage_quest`, `waypoint` …); the page and the phone draw it from there.
// `tray: true` marks the head the tray shows: the 主线 card (and the story's boards), up to two of 目标, then what can be
// played or handed in, as many as TRAY_MAX holds. `ready`: it can be handed in now (the 「交N」 on 「全部 ›」).

/* How many items the tray shows before 「全部 ›」 (agent's pick: one row of cards on a Mac's width). */
export const TRAY_MAX = 6;
/* 目标 in the tray: at most two (Hanli 11-04's shape: 「[主线] [目标] [日常…] [全部 ›]」). */
const GOAL_MAX = 2;

/* Does the stage quest hold the story now? The goal line is the stage quest's (waypointOf `gate.kind: 'stage'`), or he
   stands in the very scene that waits on it. Else its gate is further on and the story is free. */
export function stageLeads(look, state) {
  const sq = look?.stage_quest;
  if (!sq || sq.met) return false;
  return look.waypoint?.gate?.kind === 'stage' || (Boolean(look.scene) && sq.scene != null && sq.scene === state?.scene);
}

/* A tray row's place: where it is, or where its walk goes. */
const rowPlace = (e) => e.where?.id ?? e.go?.id ?? null;
/* The kinds of tray row a stage quest's `work` points at, by what it is (errands.mjs workOf: an errand of 修行, a beast). */
const SERVES = { beast: new Set(['pool', 'yaoshou']), errand: new Set(['errands']) };

/* The work the stage quest points at, when it is short: { kind, place } — the place a fact, never a title matched. */
function stageWork(look) {
  const sq = look?.stage_quest;
  if (!sq || sq.met) return null;
  const w = sq.work ?? null;
  return w?.place?.id ? w : null;
}

/* A stage's step without its 圆满 (ladder.json `full`), as fullName (state.mjs) put it on. */
function layerOnly(content, step, lang) {
  const full = content?.ladder?.full, word = full ? (typeof full === 'string' ? full : full[lang] ?? full.zh) : null;
  if (!word) return step;
  const tail = lang === 'zh' ? word : `, ${word}`;
  return step.endsWith(tail) ? step.slice(0, -tail.length) : step;
}

/* The one list. `view`: Look as built so far (after the locks and the sealed instance); `trayRows`: Look's `tray`. */
export function agendaLook(content, state, view, trayRows = []) {
  if (!view) return [];
  const items = [], seen = new Set();
  const add = (group, kind, id, extra = {}) => {
    const key = `${kind}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ key, group, kind, id, ...extra });
  };
  // `serves`: the layer the stage quest asks, without the world's word for full (练气五层圆满 → 练气五层) — the page's 「练气五层 ↑」.
  const sq = view.stage_quest ?? null, step = sq?.step ? layerOnly(content, sq.step, view.lang ?? state?.lang) : null, lead = stageLeads(view, state);
  const work = stageWork(view), tray = trayRows ?? [];

  // ── 主线 ──
  if (lead) add('main', 'stage', 'stage', { ...(view.waypoint ? { way: true } : {}) });
  else if (view.waypoint) add('main', 'way', 'way');
  else if (view.capped?.story?.here) add('main', 'here', 'here');
  // The story's boards before him (Look's `tasks`, not a tray entry's own and not an errand's): the scene's games.
  const theirs = new Set(tray.map((e) => e.task).filter(Boolean));
  const boards = (view.tasks ?? []).filter((t) => !theirs.has(t.id) && !t.played_today && t.status !== 'done');
  const storys = (t) => !t.practice && !t.hosted && !t.for_errand;
  for (const t of boards) if (storys(t)) add('main', 'task', t.id);

  // ── 目标 ──
  if (sq && !lead) add('goal', 'stage', 'stage', sq.met ? { ready: true } : {});
  const serving = (e) => work && SERVES[work.kind]?.has(e.kind) && rowPlace(e) === work.place.id;
  for (const e of tray) if (serving(e)) add('goal', 'tray', e.id, { serves: step });
  // An errand of 修行 offered where he stands, when that is where the work is.
  if (work?.kind === 'errand' && work.here) for (const o of view.offers ?? []) add('goal', 'offer', o.id, { serves: step });
  // The work a walk away (the 事 row 「去X找事做」), when it is the stage's.
  const workRow = view.work && !view.work.here ? view.work : null;
  if (work && workRow && workRow.place?.id === work.place.id && workRow.kind === work.kind) add('goal', 'work', 'work', { serves: step });
  // Nothing in the tray or the book stands for it: the pointer itself (「妖兽出没 · 上山路」), the walk there.
  if (work && !items.some((i) => i.group === 'goal' && i.serves)) add('goal', 'aim', 'aim', { serves: step });

  // ── 其他 ──
  const book = view.book ?? [];
  const readyNow = (q) => Boolean(q.ready && !q.away);
  for (const q of book) if (readyNow(q)) add('other', q.chore ? 'chore' : 'errand', q.id, { ready: true });
  // An errand's board or one hosted here, beside the story (not a tray entry's own): played from here as before.
  for (const t of boards) if (!storys(t)) add('other', 'task', t.id);
  for (const e of tray) add('other', 'tray', e.id, e.seg === 'cool' ? { cool: true } : {});
  if ((view.kept ?? []).length) add('other', 'kept', 'kept');
  for (const q of book) if (!readyNow(q) && !q.chore) add('other', 'errand', q.id);
  if (view.chance && !view.chance.taken && !view.chance.missed && view.chance.until && (view.chance.minutes_left ?? 1) > 0) add('other', 'chance', 'chance');
  if (view.kaifu) add('other', 'kaifu', 'kaifu', view.kaifu.ready ? { ready: true, n: view.kaifu.ready } : {});
  for (const q of book) if (!readyNow(q) && q.chore) add('other', 'chore', q.id);
  for (const o of view.offers ?? []) add('other', 'offer', o.id);
  if (workRow) add('other', 'work', 'work');
  for (const v of view.visitors ?? []) add('other', 'visitor', v.place?.id ?? v.say);

  // ── The tray's head ──
  let goals = 0, shown = 0;
  const playable = (i) => i.ready || i.kind === 'kept' || i.kind === 'task' || (i.kind === 'tray' && ['open', 'go'].includes(tray.find((e) => e.id === i.id)?.seg))
    || ['offer', 'work', 'chance'].includes(i.kind);
  const mainFirst = items.find((i) => i.group === 'main');
  for (const i of items) {
    const take = i.group === 'main' ? i === mainFirst || i.kind === 'task'
      : i.group === 'goal' ? goals < GOAL_MAX && (goals += 1)
        : shown < TRAY_MAX && playable(i);
    if (!take) continue;
    i.tray = true;
    if (i.group === 'other') shown += 1;
  }
  // Room left: the cooldowns back within hours, muted (Hanli 11-02: after a reload the timed games were nowhere to be found).
  for (const i of items) if (!i.tray && i.cool && shown < TRAY_MAX) { i.tray = true; shown += 1; }
  return items;
}

/* How many can be handed in now: 「全部 › 交N」. 开府 counts each of its done rows. */
export const agendaReady = (items) => (items ?? []).reduce((n, i) => n + (i.ready ? (i.n ?? 1) : 0), 0);
