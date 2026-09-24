// voice.js — who may speak unprompted, and when (Hanli's cadence, 2026-09-24).
//
// The page tells 银月 what happened as facts (POST /api/yinyue/event); she
// writes her own words. This is the one place that decides whether a fact is
// told at all — a code-owned speech budget, so the game never chatters:
//
// - Ling and Yinyue together: at most one unprompted line per QUIET_MS,
//   except big moments (a realm broken, a chapter opened, a beast won over,
//   a rumor's finale won, 今日传闻 finished, 体力 spent) — those
//   are always told, and carry `converse` (Ling may answer her once).
// - Asked moments (the player turned to her: the cast, the 命格, the day's
//   greeting) are the player's own doing: always told.
// - A small moment has its own cooldown too; but once nobody has spoken for
//   STILL_MS of active play, the next small moment is not skipped.
// - Nothing small is told during a fight or a burst of taps: it is held, and
//   weighed again once the stage is calm (held facts go together — one line).
// - The player idle on the page IDLE_MS: she hears it once, and may speak.
//
// Pure of the DOM: the page hands in a clock, a post and what it can see.

export const QUIET_MS = 90_000;
export const STILL_MS = 5 * 60_000;
export const IDLE_MS = 150_000;
const BURST = { taps: 4, within: 5_000 };
const HOLD_MAX = 4;
// Play counts as active while the last tap or key is this recent.
const ACTIVE_MS = 60_000;

/* Every moment the page tells her: who answers it, how much it weighs, and
   how long before the same moment may be told again.
   who: 'yinyue' — she alone; 'both' — she, then Ling once (converse).
   priority: big (always, converse) · asked (always) · high (the budget, then
   the engine's screen-settle) · low (the budget and its cooldown). */
export const MOMENTS = {
  rise: { who: 'both', priority: 'big' },
  chapter: { who: 'both', priority: 'big' },
  tamed: { who: 'both', priority: 'big' },
  finale: { who: 'both', priority: 'big' },
  tale_end: { who: 'both', priority: 'big' },
  spent: { who: 'both', priority: 'big' },
  greet: { who: 'yinyue', priority: 'asked' },
  reading: { who: 'yinyue', priority: 'asked' },
  fate: { who: 'yinyue', priority: 'asked' },
  lost: { who: 'yinyue', priority: 'high', cooldown: 0 },
  chance: { who: 'yinyue', priority: 'high', cooldown: 0 },
  won: { who: 'yinyue', priority: 'low', cooldown: 10 * 60_000 },
  withdrew: { who: 'yinyue', priority: 'low', cooldown: 10 * 60_000 },
  unleash: { who: 'yinyue', priority: 'low', cooldown: 10 * 60_000 },
  hurt: { who: 'yinyue', priority: 'low', cooldown: 10 * 60_000 },
  gain: { who: 'yinyue', priority: 'low', cooldown: 10 * 60_000 },
  trial: { who: 'yinyue', priority: 'low', cooldown: 5 * 60_000 },
  chance_late: { who: 'yinyue', priority: 'low', cooldown: 30 * 60_000 },
  idle: { who: 'yinyue', priority: 'low', cooldown: 0 },
};

/* The flags a moment is posted with (the engine's § App moments). */
export function flagsOf(id, table = MOMENTS) {
  const m = table[id];
  if (!m) return null;
  return {
    ...(m.priority === 'big' || m.priority === 'high' ? { big: true } : {}),
    ...(m.priority === 'asked' ? { asked: true } : {}),
    ...(m.who === 'both' ? { converse: true } : {}),
  };
}

/* One voice budget for the page.
   post(id, fact, flags, opts) → Promise<boolean> (true when she will hear it).
   sees() → { fighting, present } — a fight on the stage; she walks with the
   player and is here. */
export function createVoice({ now = () => Date.now(), post, sees = () => ({}), table = MOMENTS } = {}) {
  const st = {
    lastLine: -Infinity, // any line, Ling's or hers
    lastInput: now(),
    taps: [],
    told: {}, //          moment id → when last told
    held: [], //          small moments waiting out a fight or a burst
    still: 0, //          active play since the last line (ms)
    stillAt: now(),
    idleTold: false,
  };
  const bursting = (t) => st.taps.filter((x) => t - x < BURST.within).length >= BURST.taps;
  const stamp = (t) => { st.lastLine = t; st.still = 0; st.stillAt = t; };
  /* Active play since the last line: counted in steps, only while the player
     is at it (a recent tap or key). */
  const settle = (t) => {
    if (t - st.lastInput < ACTIVE_MS) st.still += t - st.stillAt;
    st.stillAt = t;
  };
  /* The budget's verdict on one small moment: 'open', or why not. */
  function gate(id, t) {
    const m = table[id];
    settle(t);
    if (st.still >= STILL_MS) return 'open';
    if (t - st.lastLine < QUIET_MS) return 'quiet';
    if (m.cooldown && t - (st.told[id] ?? -Infinity) < m.cooldown) return 'cooldown';
    return 'open';
  }
  function send(id, fact, opts, t) {
    st.told[id] = t;
    return Promise.resolve(post(id, fact, flagsOf(id, table), opts)).catch(() => false);
  }

  return {
    st,
    /* A moment happened. Answers what became of it: 'sent' | 'held' | a
       reason it was skipped — and `said`, the post's promise when sent. */
    moment(id, fact, opts = {}) {
      const m = table[id];
      const t = now();
      if (!m) return { verdict: 'unknown', said: Promise.resolve(false) };
      if (m.priority === 'big' || m.priority === 'asked') {
        stamp(t);
        return { verdict: 'sent', said: send(id, fact, opts, t) };
      }
      const seen = sees();
      if (seen.fighting || bursting(t)) {
        st.held = [...st.held.filter((h) => h.id !== id), { id, fact, opts }].slice(-HOLD_MAX);
        return { verdict: 'held', said: Promise.resolve(false) };
      }
      const why = gate(id, t);
      if (why !== 'open') return { verdict: why, said: Promise.resolve(false) };
      stamp(t);
      return { verdict: 'sent', said: send(id, fact, opts, t) };
    },
    /* A line was spoken — Ling's turn ended, or her line landed. */
    heard() { stamp(now()); },
    /* A tap or a key: play is active; the idle word may come again. */
    input() {
      const t = now();
      settle(t);
      st.lastInput = t;
      st.taps = [...st.taps.filter((x) => t - x < BURST.within), t];
      st.idleTold = false;
    },
    /* Every few seconds: held moments weighed once the stage is calm, and the
       idle word. Returns what it sent, for the tests. */
    tick({ visible = true, busy = false, idleFact = null } = {}) {
      const t = now();
      const seen = sees();
      if (seen.fighting || bursting(t)) return null;
      if (st.held.length) {
        const held = st.held;
        st.held = [];
        const open = held.filter((h) => gate(h.id, t) === 'open');
        if (!open.length) return null;
        stamp(t);
        for (const h of open) send(h.id, h.fact, h.opts, t);
        return open.map((h) => h.id);
      }
      if (!visible || busy || !seen.present || st.idleTold) return null;
      if (t - st.lastInput < IDLE_MS || t - st.lastLine < QUIET_MS) return null;
      st.idleTold = true;
      stamp(t);
      send('idle', idleFact, {}, t);
      return ['idle'];
    },
  };
}
