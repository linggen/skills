// drawguess-rules.js — the page-side rules of 画猜 (games/drawguess.js): the word list's match,
// Ling's reply read into lines, and the call loop's throttle. No DOM, no engine: what the model
// says is only a guess, and whether it is the word is decided here, never by the model.

/** What may stand before a guessed noun and is not the noun (一只鸡, 是鹿, a fox). */
const LEAD = /^(?:(?:我猜|猜|这|那|它|是|像|应该|大概|好像)+)?(?:一|两|几)?(?:只|个|把|盏|座|张|棵|轮|口|头|条|根|朵|枝|块|顶|面)?(?=.)/;
const TAIL = /(?:吧|呀|啊|呢|嘛|吗|了|的样子)+$/;
const PUNCT = /[\s\p{P}\p{S}]/gu;

/** A guess or a word in one spelling: no spaces, no punctuation, lower case, no measure word. */
export function normalize(text) {
  const t = String(text ?? '').normalize('NFKC').toLowerCase();
  if (/[㐀-鿿]/.test(t)) return t.replace(PUNCT, '').replace(LEAD, '').replace(TAIL, '');
  const words = t.replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w && !EN_LEAD.has(w));
  return words.join(' ').replace(/(?<=[^s])s$/, '');
}
const EN_LEAD = new Set(['a', 'an', 'the', 'it', 'is', 'its', 'this', 'that', 'maybe']);

/** Every spelling a word is right under: the word, its synonyms, its English. */
export const spellings = (w) => [w.zh, ...(w.also ?? []), ...(w.en ? [w.en] : []), ...(w.enAlso ?? [])].map(normalize).filter(Boolean);

/** Whether a guess names the word. Exact on any spelling after normalize — never a substring
    (鸡蛋 is not 鸡, 山羊 is not 山). */
export function matches(guess, word) {
  const g = normalize(guess);
  return Boolean(g) && spellings(word).includes(g);
}

/** Ling's reply, three lines asked: a zh line, an en line, 「猜：<词>」. Read loosely: the guess
    line anywhere, the zh line the first with a 汉字, the en line the first with none. A reply with
    no guess line is a miss with whatever line it had. */
export function parseReply(text) {
  const lines = String(text ?? '').split(/\n+/).map((l) => l.trim().replace(/^[-*•>\s]+/, '')).filter(Boolean);
  let guess = null;
  const rest = [];
  for (const l of lines) {
    const m = l.match(/^(?:猜|guess)\s*[:：]\s*(.+)$/i);
    if (m && guess == null) guess = m[1].replace(/[。.!！]+$/, '').trim();
    else rest.push(l);
  }
  const zh = rest.find((l) => /[㐀-鿿]/.test(l)) ?? null;
  const en = rest.find((l) => !/[㐀-鿿]/.test(l) && /[a-z]/i.test(l)) ?? null;
  return { guess, zh: clip(zh, 24), en };
}

const clip = (s, n) => (s && [...s].length > n ? `${[...s].slice(0, n).join('')}…` : s);

/** The engine's own words when the bound model cannot see (chat/structured.rs's vision gate). */
export const isBlindReply = (text) => /cannot read images/i.test(String(text ?? ''));

/** The engine ran no turn for the guesser (chat/handler.rs `refused_reply`): 'absent' — the save
    has not met her yet (`place.yinyue.absent_until`) — or 'unavailable' (the pet is off); else null. */
export const refusalOf = (reply) => (['absent', 'unavailable'].includes(reply?.status) ? reply.status : null);

/** The eraser's width, in paper widths (the ring the page shows is the same size). */
export const ERASER = 0.07;

/** How a stroke lands on the ink layer: ink over, or (an eraser stroke) ink cut out. */
export const strokeOp = (stroke) => (stroke?.erase ? 'destination-out' : 'source-over');

/** The word for a round: a seeded pick, never the one just drawn. */
export function pickWord(words, rnd = Math.random, last = null) {
  const left = words.filter((w) => w.zh !== last);
  const pool = left.length ? left : words;
  return pool[Math.min(pool.length - 1, Math.floor(rnd() * pool.length))];
}

/** Stars by how many looks it took: one 3, two 2, more 1. */
export const starsFor = (calls) => (calls <= 1 ? 3 : calls === 2 ? 2 : 1);

/**
 * The call loop's throttle. A call goes when the strokes have rested `idleMs`, or at once on
 * 「画好了」 (`now()`); one call at a time, never two; a request made while one is out waits as
 * ONE trailing call (any number coalesce); at most `max` calls a round; a canvas unchanged since
 * the last call is not sent again; nothing goes before the first stroke. `close()` sends no more
 * but still hears the call already out; `stop()` ends the round: timers cleared, and a reply that
 * lands after it is dropped.
 *
 *   const loop = guessLoop({ send, max: 4, idleMs: 2500, timers });
 *   loop.stroke(); loop.rest(); loop.now(); loop.stop();
 *
 * `send(version, n)` → Promise of the reply; `onReply(reply, version)` hears it while the round
 * lives; `onSettle()` once no call is out.
 * `timers` ({ set, clear }) is injected so the tests run on a fake clock.
 */
export function guessLoop({ send, onReply = () => {}, onError = () => {}, onSettle = () => {}, max = 4, idleMs = 2500, timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (k) => clearTimeout(k) } }) {
  const s = { version: 0, sent: 0, calls: 0, busy: false, owed: false, idle: null, stopped: false, closed: false };
  const clearIdle = () => { if (s.idle != null) timers.clear(s.idle); s.idle = null; };
  const go = () => {
    clearIdle();
    if (s.stopped || s.closed || s.version === 0 || s.version === s.sent || s.calls >= max) return false;
    if (s.busy) { s.owed = true; return false; }
    s.busy = true;
    s.owed = false;
    s.calls += 1;
    s.sent = s.version;
    const v = s.version;
    Promise.resolve()
      .then(() => send(v, s.calls))
      .then((reply) => { if (!s.stopped) onReply(reply, v); }, (e) => { if (!s.stopped) onError(e); })
      .finally(() => {
        s.busy = false;
        if (s.owed && !s.stopped) go();
        if (!s.busy && !s.stopped) onSettle();
      });
    return true;
  };
  return {
    /** A stroke drawn, undone or cleared: the paper changed; the rest timer waits for the hand. */
    stroke() { if (s.stopped) return; s.version += 1; clearIdle(); },
    /** The hand lifted: a call after `idleMs` unless another stroke comes. */
    rest() {
      if (s.stopped) return;
      clearIdle();
      s.idle = timers.set(() => { s.idle = null; go(); }, idleMs);
    },
    /** 「画好了」: a call now (or the one trailing call if one is out). */
    now: () => go(),
    /** Time is up: no call goes any more, but the one already out may still land. */
    close() { s.closed = true; s.owed = false; clearIdle(); },
    stop() { s.stopped = true; s.owed = false; clearIdle(); },
    get calls() { return s.calls; },
    get busy() { return s.busy; },
    get left() { return Math.max(0, max - s.calls); },
    /** Whether the paper holds strokes no call has seen yet. */
    get fresh() { return s.version !== 0 && s.version !== s.sent; },
  };
}
