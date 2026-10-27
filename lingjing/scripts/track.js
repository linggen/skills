// track.js — 数据埋点, the page's half (rules/analytics.mjs keeps the lines; stats.html reads them back). Local only:
// a batch goes to the rules' `track` verb on this machine and nowhere else; nothing here goes online.
//
// The page calls in at a few seams (lingjing.js): a board dealt, won, lost, skipped or left; a fight opened and
// settled; a passage on the stage; an ask tapped; a verb refused; the save's Look (a gate shut or open, the scene
// moved on). Everything else is here: the sitting (active time — an input gap over IDLE_CUT is not counted), the
// stall watch (a board standing with no input), page errors, and the flush — batched, on a board's end, a scene
// change, the tab hidden or left, and once a minute while something waits. No timer runs per frame.
//
// What is kept is ids, times, counts and outcomes — never what was typed or said (the rules clean every field again).

const IDLE_CUT_MS = 120_000; //    a gap with no input longer than this is not play
const NEW_SITTING_MS = 30 * 60_000; // away this long, and the next input begins a new sitting
const STALL_MS = 3 * 60_000; //    a board on the stage with no input this long is a soft-lock signal
const TICK_MS = 60_000; //         the flush's own pace while events wait
const KEEPALIVE_MAX = 60_000; //   a keepalive request's body is capped at 64 KB
/* The page's own calls that ask and may be told no without any tap of his (银月's greeting, a passage's hold …). */
const QUIET_VERBS = new Set(['greet', 'reading', 'hergame', 'tell', 'look', 'track']);
const PENDING_KEY = (save) => `lingjing.track.pending.${save || 'main'}`;

const rid = () => Math.random().toString(36).slice(2, 10);
const now = () => Date.now();

/** The tracker, bound to a page: `send(body)` posts one batch (the rules' `track` verb), `scratch` its save. */
export function createTracker({ send, scratch = null, win = globalThis.window, doc = globalThis.document, clock = now } = {}) {
  let off = false;
  let queue = [];
  let sid = null, startedAt = 0, lastInput = 0, activeMs = 0, tickedActive = 0, tickedAt = 0;
  const boards = new Map(); //  id → { at, active0, g, retries, hints, asks, ctx, stalled }
  const fights = new Map(); //  id → { at, active0, ctx }
  let read = null; //           the passage on the stage: { key, scene, chars, at, active0, skipped }
  let gates = new Map(); //     what → since (ms)
  let scene = null, refusedStreak = 0, errors = 0;

  const activeS = () => Math.round(activeMs / 1000);
  const push = (kind, fields = {}) => { if (!off) queue.push({ kind, sid, t: clock(), ...fields }); };

  /* ── The sitting ── */
  function begin() {
    sid = rid(); startedAt = clock(); lastInput = startedAt; activeMs = 0; tickedActive = 0; tickedAt = startedAt;
    push('session', { op: 'start' });
  }
  /* The time since the last tick, as a line: the report sums these by the 回 and layer they were stamped at. */
  function tick(op = 'tick', why = null) {
    if (!sid) return;
    const a = Math.max(0, activeS() - tickedActive), w = Math.round((clock() - tickedAt) / 1000);
    if (op === 'tick' && !a) return;
    push('session', { op, active_s: a, wall_s: w, ...(why ? { why } : {}) });
    tickedActive = activeS(); tickedAt = clock();
  }
  function end(why) {
    if (!sid) return;
    for (const id of [...boards.keys()]) boardEnd(id, 'left', { why });
    for (const id of [...fights.keys()]) fightEnd(id, { outcome: 'left' });
    readEnd();
    tick('end', why);
    sid = null;
  }
  function input() {
    const t = clock();
    if (!sid) begin();
    else if (t - lastInput > NEW_SITTING_MS) { end('idle'); begin(); }
    else if (t - lastInput <= IDLE_CUT_MS) activeMs += t - lastInput;
    lastInput = t;
    for (const b of boards.values()) b.stalled = false;
  }

  /* ── Boards ── */
  /** A board on the stage, as the page holds it (`g`, its deal): new → open; a new deal of the same id → a retry. */
  function boardSeen(id, g, ctx = () => ({})) {
    if (!id || !g || off) return g;
    const b = boards.get(id);
    if (!b) boards.set(id, { at: clock(), active0: activeMs, g, retries: 0, hints: 0, asks: 0, ctx: ctx(id) ?? {} });
    else if (b.g !== g) { b.g = g; b.retries += 1; }
    return g;
  }
  function boardLost(id) { const b = boards.get(id); if (b) b.lost = true; }
  function boardHint(id) { const b = boards.get(id); if (b) b.hints += 1; push('hint', { board: id, n: b?.hints ?? 1 }); }
  function boardEnd(id, outcome, { stars = null, grade = null, why = null } = {}) {
    const b = boards.get(id);
    if (!b) return;
    boards.delete(id);
    const o = outcome === 'left' && b.lost ? 'lost' : outcome;
    push('board', {
      id, ...b.ctx, ms: clock() - b.at, active_s: Math.round((activeMs - b.active0) / 1000), outcome: o,
      ...(Number.isFinite(stars) ? { stars } : {}), ...(grade ? { grade: String(grade) } : {}), retries: b.retries, hints: b.hints, asks: b.asks,
      ...(why ? { why } : {}),
    });
    flush('board');
  }

  /* ── Fights ── */
  function fightOpen(id, ctx = {}) { if (!off && id) fights.set(id, { at: clock(), active0: activeMs, ctx }); }
  function fightEnd(id, { outcome = null, turns = null } = {}) {
    const f = fights.get(id);
    if (!f) return;
    fights.delete(id);
    push('fight', { id, ...f.ctx, outcome: outcome ?? 'left', ...(Number.isFinite(turns) ? { turns } : {}), ms: clock() - f.at, active_s: Math.round((activeMs - f.active0) / 1000) });
    flush('fight');
  }

  /* ── Passages ── */
  /** The passage on the stage now (`key` its place in the reading, null when none): one ends as the next begins. */
  function reading(key, { scene: sc = null, chars = 0, skipped = false } = {}) {
    if (off) return;
    if (read && read.key === key) { if (skipped) read.skipped = true; return; }
    readEnd();
    if (key) read = { key, scene: sc, chars, at: clock(), active0: activeMs, skipped };
  }
  function readSkipped() { if (read) read.skipped = true; }
  function readEnd() {
    if (!read) return;
    const r = read; read = null;
    // A passage that stood less than a second (a redraw's blip, not a read) is not one.
    if (clock() - r.at < 1000 && !r.skipped) return;
    push('read', { scene: r.scene, chars: r.chars, ms: clock() - r.at, active_s: Math.round((activeMs - r.active0) / 1000), skipped: r.skipped });
  }

  /* ── The rest ── */
  function ask(to, what = null, board = null) {
    push('ask', { to, ...(what ? { what } : {}), ...(board ? { board } : {}) });
    if (board && boards.has(board)) boards.get(board).asks += 1;
  }
  /** A verb's answer: a refusal counts toward the streak; a refusal of `busy` (two writers at once) is not his. */
  function answer(name, r) {
    if (r?.ok) { refusedStreak = 0; return; }
    if (!r || r.refused === 'busy' || r.refused === 'page-only' || QUIET_VERBS.has(name)) return;
    refusedStreak += 1;
    push('refused', { verb: name, why: r.refused ?? (r.error ? 'error' : 'unknown'), streak: refusedStreak });
  }
  /** The save's Look: what is shut by a gate (the 回's cap, 体力 spent …), and the scene. */
  function watchLook(look, shut = []) {
    if (off || !look) return;
    const nowShut = new Set(shut.filter(Boolean));
    for (const w of nowShut) if (!gates.has(w)) { gates.set(w, clock()); push('gate', { what: w, op: 'shut' }); }
    for (const [w, since] of [...gates]) if (!nowShut.has(w)) { gates.delete(w); push('gate', { what: w, op: 'open', waited_s: Math.round((clock() - since) / 1000) }); }
    const sc = look.scene?.id ?? null;
    if (sc !== scene) {
      const was = scene;
      scene = sc;
      // The boards of the scene left behind are over (left), whatever stands next.
      if (was) for (const [id, b] of [...boards]) if (b.ctx.scene === was && b.ctx.source === 'story') boardEnd(id, 'left', { why: 'moved' });
      if (was) flush('scene');
    }
  }
  function error(where, msg) {
    if (errors >= 20) return;
    errors += 1;
    push('error', { where, msg: String(msg ?? '').slice(0, 200) });
  }

  /* The stall watch: a board standing with no input. Checked with the flush's tick, never per frame. */
  function stallWatch() {
    if (!sid || doc?.hidden) return;
    const idle = clock() - lastInput;
    if (idle < STALL_MS) return;
    for (const [id, b] of boards) {
      if (b.stalled) continue;
      b.stalled = true;
      push('stall', { what: 'board-idle', board: id, idle_s: Math.round(idle / 1000), ...(b.ctx.scene ? { scene: b.ctx.scene } : {}) });
    }
  }

  /* ── The flush ── */
  const pendingKey = PENDING_KEY(scratch);
  /* What may not have arrived, kept by batch: sent again on the next load under the same batch id, which the rules
     keep once — a batch that did arrive (its answer lost as the page went) is never kept twice. */
  const readPending = () => { try { const p = JSON.parse(win?.localStorage?.getItem(pendingKey) ?? '[]'); return Array.isArray(p) ? p.filter((b) => b?.batch && Array.isArray(b.events)) : []; } catch { return []; } };
  const writePending = (list) => { try { if (list.length) win?.localStorage?.setItem(pendingKey, JSON.stringify(list.slice(-20))); else win?.localStorage?.removeItem(pendingKey); } catch { /* this load only */ } };
  const keepPending = (b) => writePending([...readPending().filter((x) => x.batch !== b.batch), b]);
  const dropPending = (batch) => writePending(readPending().filter((x) => x.batch !== batch));

  /* A batch's pieces, each under the keepalive cap. */
  function pieces(events) {
    const out = [];
    let cur = [], size = 0;
    for (const e of events) {
      const n = JSON.stringify(e).length + 1;
      if (cur.length && size + n > KEEPALIVE_MAX) { out.push(cur); cur = []; size = 0; }
      cur.push(e); size += n;
    }
    if (cur.length) out.push(cur);
    return out;
  }
  async function sendBatch(b, leaving) {
    if (leaving) keepPending(b);
    try {
      const r = await send({ events: b.events, batch: b.batch, keepalive: leaving });
      if (r?.off) { off = true; queue = []; }
      if (r?.ok || r?.off) dropPending(b.batch);
      else if (!leaving) keepPending(b);
    } catch {
      if (!leaving) keepPending(b); // sent again on the next load
    }
  }
  async function flush(why = 'tick', { leaving = false } = {}) {
    if (off) { queue = []; return; }
    if (why !== 'tick' || queue.length) tick();
    if (!queue.length) return;
    const events = queue; queue = [];
    for (const part of pieces(events)) await sendBatch({ batch: rid() + rid(), events: part }, leaving);
  }

  function bind() {
    if (!doc) return;
    const opts = { capture: true, passive: true };
    for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) doc?.addEventListener?.(ev, input, opts);
    doc?.addEventListener?.('visibilitychange', () => { if (doc.hidden) { readEnd(); flush('hidden', { leaving: true }); } });
    win?.addEventListener?.('pagehide', () => { end('left'); flush('left', { leaving: true }); });
    win?.addEventListener?.('error', (e) => error(`${String(e.filename ?? '').split('/').pop() || 'page'}:${e.lineno ?? 0}`, e.message));
    win?.addEventListener?.('unhandledrejection', (e) => error('promise', e.reason?.message ?? e.reason));
    setInterval(() => { stallWatch(); if (queue.length) flush('tick'); }, TICK_MS)?.unref?.();
  }

  /** Begin: the switch read, what an earlier load could not send sent now, the sitting opened. */
  async function start({ status = null } = {}) {
    try { const s = status ? await status() : null; off = Boolean(s?.off); } catch { /* kept until told otherwise */ }
    if (off) return api;
    for (const b of readPending()) sendBatch(b, false);
    begin();
    bind();
    return api;
  }

  const api = {
    start, flush, boardSeen, boardLost, boardHint, boardEnd, fightOpen, fightEnd, reading, readSkipped, ask, answer, watchLook, error, input,
    get off() { return off; }, get queued() { return queue.length; }, get open() { return { boards: [...boards.keys()], fights: [...fights.keys()] }; },
    _stallWatch: stallWatch, _end: end,
  };
  return api;
}

/** The page's send: the rules' `track` verb through the page's tool door (rules.js), `keepalive` on the way out. */
export function trackSender(scratch) {
  return async ({ events, batch, keepalive = false }) => {
    const flags = [`--events=${JSON.stringify(events)}`, `--batch=${batch}`, ...(scratch ? [`--save=${scratch}`] : [])];
    const res = await fetch('/api/skills/lingjing/tools/Verb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ verb: 'track', flags }), keepalive });
    if (!res.ok) throw new Error(`track ${res.status}`);
    const out = await res.json();
    return JSON.parse((out.stdout || '').trim().split('\n').pop() || '{}');
  };
}

/** A passage's characters, from its beats (the reading's item, dialogue.js). */
export function charsOf(item, lang = 'zh') {
  const b = item?.beats;
  const list = Array.isArray(b) ? b : b?.[lang]?.length ? b[lang] : b?.zh ?? b?.en ?? [];
  return list.reduce((n, x) => n + (typeof x === 'string' ? x.length : String(x?.text ?? '').length), 0);
}
