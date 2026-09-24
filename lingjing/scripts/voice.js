// voice.js — who may speak unprompted, and when (Hanli's cadence, 2026-09-24).
//
// The page tells 银月 what happened as facts (POST /api/yinyue/event); she
// writes her own words. This is the one place that decides whether a fact is
// told at all — a code-owned speech budget, so the game never chatters:
//
// - Ling and Yinyue together: at most one unprompted line per QUIET_MS,
//   except big moments (a realm broken, a chapter opened, a beast won over,
//   a rumor's finale won, 今日传闻 finished, 体力 spent, a story node) — those
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
  // now: the stage is showing it (a seal) — she is woken at once, so her
  // word meets the picture (his, 2026-09-24: 突破了, 银月反应有点平淡, 还有点晚).
  rise: { who: 'both', priority: 'big', now: true },
  chapter: { who: 'both', priority: 'big', now: true },
  tamed: { who: 'both', priority: 'big', now: true },
  finale: { who: 'both', priority: 'big' },
  tale_end: { who: 'both', priority: 'big' },
  spent: { who: 'both', priority: 'big' },
  // 九鼎录's story nodes (redesign-v2 § 六): she and Ling talk over what it means.
  scene_end: { who: 'both', priority: 'big' },
  cauldron: { who: 'both', priority: 'big' },
  memory: { who: 'both', priority: 'big' },
  // A line the story wrote for her, said by her (a node's moment carries it when there is one).
  her_beat: { who: 'yinyue', priority: 'big' },
  greet: { who: 'yinyue', priority: 'asked' },
  reading: { who: 'yinyue', priority: 'asked' },
  fate: { who: 'yinyue', priority: 'asked' },
  // After Ling's 前情提要, one feeling of hers — part of the opening he came back to.
  recap: { who: 'yinyue', priority: 'asked' },
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
    ...(m.now ? { now: true } : {}),
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

/* ── Story nodes as she hears them (九鼎录, story.mjs) ──
   A scene passed, a cauldron found, a memory come back: the facts, so she
   and Ling talk over what it means — never a line to recite. One node is
   one moment: `{id, zh, en, mood}`, or null for a kind she is not told. */
const quote = (zh, t) => (zh ? `「${t}」` : `“${t}”`);
/* Her beat — a line the story wrote for her (Hanli, 2026-09-24: she says
   her own words; Ling writes the scene only). The authored line is her
   reference; she says it her way. With a story node it rides in the node's
   moment — one beat, one line from her — else it is a moment of its own. */
export function herBeatFacts(h, zh) {
  const f = h?.facts ?? {};
  const bits = [];
  if (f.happened) bits.push(zh ? `刚才：${f.happened}` : `Just now: ${f.happened}`);
  if (f.fitting) bits.push(zh ? `该去的地方：${f.fitting}。` : `Where fits: ${f.fitting}.`);
  if (f.recalls) bits.push(zh ? `你想起的：${f.recalls}` : `What you recall: ${f.recalls}`);
  bits.push(zh ? `故事在这里给你写了一句：${quote(zh, f.line ?? '')}。这句是你的参考；用你自己的话说出来，意思不变，一两句，别复述发生了什么。`
    : `The story gives you a line here: ${quote(zh, f.line ?? '')}. The authored line is your reference; say it your way, same meaning — a line or two, without retelling what happened.`);
  return bits.join(zh ? '' : ' ');
}
export function nodeMoment(n) {
  if (!n) return null;
  const facts = (zh) => {
    if (n.kind === 'beat') return herBeatFacts(n.her_beat, zh);
    const ask = n.her_beat ? herBeatFacts({ facts: { line: n.her_beat.facts?.line, recalls: n.her_beat.facts?.recalls } }, zh)
      : zh ? '你就在玩家身边——说说你觉得这意味着什么，一两句；别复述发生了什么，也别替故事给出答案。' : 'You are beside the player — say what you make of it, a line or two; do not retell what happened or answer ahead of the story.';
    const bits = [];
    if (n.kind === 'scene') bits.push(zh ? `一幕刚过去：${n.recap ?? ''}` : `A scene has just passed: ${n.recap ?? ''}`);
    if (n.kind === 'cauldron') bits.push(zh ? `第${n.found}口鼎寻回了（${n.chapter?.title}）。${n.recap ?? ''}` : `Cauldron ${n.found} is found (${n.chapter?.title}). ${n.recap ?? ''}`);
    if (n.kind === 'chapter') bits.push(zh ? `${n.chapter?.title}走完了。${n.recap ?? ''}` : `${n.chapter?.title} is over. ${n.recap ?? ''}`);
    if (n.mystery) bits.push(n.kind === 'scene' ? (zh ? `这一章还悬着的谜：${quote(zh, n.mystery)}。` : `The riddle still open: ${quote(zh, n.mystery)}.`) : (zh ? `这一章的谜${quote(zh, n.mystery)}有了着落。` : `The chapter's riddle, ${quote(zh, n.mystery)}, has its answer.`));
    if (n.memory?.length) bits.push(zh ? `你记起了：${n.memory.map((m) => quote(zh, m)).join('')}。` : `A memory came back to you: ${n.memory.map((m) => quote(zh, m)).join(' ')}.`);
    if (n.ending) bits.push(zh ? `九鼎聚齐，故事到了终局：${n.ending}。` : `The nine are gathered; the story has reached its end: ${n.ending}.`);
    if (n.next) bits.push(zh ? `前面是${n.next.title}，新的谜：${quote(zh, n.next.mystery)}。` : `Ahead lies ${n.next.title}, and a new riddle: ${quote(zh, n.next.mystery)}.`);
    return `${bits.join(zh ? '' : ' ')}${zh ? '' : ' '}${ask}`;
  };
  const id = { scene: 'scene_end', cauldron: 'cauldron', chapter: 'cauldron', memory: 'memory', beat: 'her_beat' }[n.kind];
  if (!id) return null;
  return { id, zh: facts(true), en: facts(false), mood: n.kind === 'scene' || n.kind === 'beat' ? 'neutral' : n.memory?.length ? 'relaxed' : 'happy' };
}
