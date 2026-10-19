// hersay.js — 银月 as the player's companion at the moments that matter
// (Hanli, 2026-10-15: 「战斗胜利, 银月要出声祝贺, 突破等成就大成, 银月要祝贺.
// 失败了要安慰. 银月的情感伴侣的作用要充分发挥.」 and 「注意银月的台词. 故事里,
// 她是高傲的妖王.」).
//
// She is a proud demon king in a girl's form, half her power gone: praise
// comes lordly and backhanded, comfort through pride and command, never
// pity; real care shows only in a crack — one softer word, then she covers it.
//
// THE PAGE GIVES FACTS, SHE WRITES THE WORDS. Each moment goes to her as
// facts plus the register (`momentFacts`); her line comes back on the chat's
// guest stream. The pools below are the only code-held wording of hers: the
// fallback when she is slow (WAIT_MS) or nobody will hear (a scratch save, the
// pet off) — and, by the engine's gate, her whole voice while she sleeps in
// the 木牌 (SKILL.md `place.yinyue.absent_until: companion.awake`: the engine
// answers 409 to every moment then, so the asleep voice is the pool's).
//
// NOTHING WAITS ON HER. `speak` returns at once; her line, should it land
// late, still takes the bubble while that moment is the newest.
//
// Pure of the DOM: the page hands in `ask`, the clock, the timers and storage.

export const WAIT_MS = 7000;

/* Where she is for the player right now (Look's `companion`):
   absent — not met yet, or away on a line she does not live on (今线);
   asleep — met, in the 木牌: while a passage of the story holds the stage
            (Look's `telling`, or the page's own hold, `{ telling: true }`),
            or a sleep the book gives her (`asleep`): drowsy, clipped, still proud;
   awake  — walking with the player (herHere): the games, the map, the nights, the chat. */
export function herMode(look, { telling = false } = {}) {
  const c = look?.companion;
  if (!c?.joined || c.away) return 'absent';
  return c.asleep || c.telling || telling ? 'asleep' : 'awake';
}

/* ── The moments, declared ──
   group: what kind of word it is (her mood follows it).
   once: how often it may be said — 'day' (once a day), 'key' (once for each
   key the page names: a board, a 回, a game), or a cooldown in ms.
   A fight's win is weighed (weighWin) before it is said. */
export const MOMENTS = {
  won: { group: 'cheer' },
  lost: { group: 'comfort', repeatMs: 10 * 60_000 }, //  a second loss inside this: the short word
  rise: { group: 'cheer' },
  hui: { group: 'cheer' },
  tamed: { group: 'cheer' },
  quest: { group: 'cheer', once: 'key' }, //               the 修行 stage quest done (its reward toast)
  rare: { group: 'cheer', once: 'key' }, //                饭桶's 逆天, a 稀有 drop, a 密室 escape
  game_first: { group: 'cheer', once: 'key' }, //          the first win at an AI mini-game, ever
  bt_failed: { group: 'comfort' },
  skipped: { group: 'comfort', once: 30 * 60_000 }, //     a board left: gentle, never guilt
  stuck: { group: 'comfort', once: 'key' }, //             once a board — and Ling's help is there
  grind: { group: 'comfort', once: 'day' }, //             a long day of the same fights
  poor: { group: 'comfort', once: 'day' }, //              the purse near empty
};
export const MOOD = { cheer: 'happy', comfort: 'sad' };

/* A repeatable fight (a pool's beast, the 秘境's rooms) is weighed: the full
   word only when the win means something; otherwise a short one, at most one
   per SHORT_GAP_MS; otherwise just a small reaction in the bubble (no model,
   nothing in the chat). A story fight — a 试, a 比试, an elite, a named fight —
   always gets the full word. */
export const STREAKS = [3, 5, 10, 20];
export const SHORT_GAP_MS = 5 * 60_000;
export const GRIND_AT = 8; //   the eighth repeatable fight of a day: a light word, once
export const POOR_AT = 5; //    灵石 under this, from at or over it
export const CLOSE_AT = 0.3; // 气血 under this share at the end: a close win

/* What a won fight was, for the weigh: { story, strong, close, firstToday,
   newBeast, streak } → its reasons, and 'full' | 'short' | 'react'. */
export function weighWin(f, { lastShort = -Infinity, now = 0 } = {}) {
  const why = ['story', 'strong', 'close', 'firstToday', 'newBeast'].filter((k) => f[k]);
  if (STREAKS.includes(f.streak)) why.push('streak');
  if (why.length) return { weight: 'full', why };
  return { weight: now - lastShort >= SHORT_GAP_MS ? 'short' : 'react', why };
}

/* ── Her register, told to her model with every moment ── */
export const REGISTER = {
  zh: '以骄傲妖王的口吻（自称本王，嘴硬带刺）：夸要居高临下、反着夸；安慰靠傲气和命令，不可怜；真心最多漏一个软字就收回。不说恭喜，不哄。',
  en: 'Be the proud demon king ("this king"): backhanded praise, comfort by command, no pity; one soft word at most.',
};
const LENGTH = {
  full: { zh: '一两句短话。', en: '1-2 short lines.' },
  short: { zh: '只一句，越短越好（十字内）。', en: 'A few words.' },
};

/* What each moment asks of her, after its facts. */
const ASKS = {
  won: { zh: '玩家赢了一仗。', en: 'They won a fight.' },
  lost: { zh: '玩家输了这一仗。', en: 'They lost this fight.' },
  rise: { zh: '玩家刚突破，舞台上金光正亮。', en: 'They just broke through; gold on the stage.' },
  hui: { zh: '一回走完了。', en: 'A chapter is done.' },
  tamed: { zh: '玩家收服了灵兽，从此随行。', en: 'They won over a beast; it follows now.' },
  quest: { zh: '修行的阶段功课刚完成，得了奖赏。', en: 'A practice stage done, reward paid.' },
  rare: { zh: '玩家刚得了难得的东西。', en: 'They came by something rare.' },
  game_first: { zh: '玩家第一次赢下这个游戏。', en: 'Their first win at this game.' },
  bt_failed: { zh: '渡劫失败，雷把玩家打了回来。境界还在。', en: 'The breakthrough failed; realm kept.' },
  skipped: { zh: '玩家放下了一个解不开的题，往下走了。别怪他，轻轻带过。', en: 'They left a puzzle and moved on. No blame.' },
  stuck: { zh: '玩家卡在一个题上好一会儿了。激他一句；可以提一句问问Ling。', en: 'Stuck on a puzzle a while. Spur them; Ling can help.' },
  grind: { zh: '玩家今天已经打了很多场一样的仗。轻轻一句，可以让他歇歇。', en: 'The same fights all day. Light; maybe rest.' },
  poor: { zh: '玩家的灵石快见底了。轻轻一句。', en: 'Nearly out of stones. Light.' },
};

/* The facts she is given for a moment: what happened (the page's `what`,
   already in the player's language — how close, what it took), the ask, the
   register and the length. Kept under `max` characters (the engine keeps
   300, the name line in front): `what` gives way first. */
export function momentFacts(kind, what, lang = 'zh', { weight = 'full', max = 260 } = {}) {
  const zh = lang !== 'en', L = zh ? 'zh' : 'en', sep = zh ? '' : ' ';
  const tail = [ASKS[kind]?.[L] ?? '', REGISTER[L], (LENGTH[weight] ?? LENGTH.full)[L]].filter(Boolean).join(sep);
  const room = max - [...tail].length - (what ? [...sep].length : 0);
  let w = String(what ?? '').trim();
  if ([...w].length > room) w = room > 1 ? `${[...w].slice(0, room - 1).join('')}…` : '';
  return w ? `${w}${sep}${tail}` : tail;
}

/* ── The pools: moment × asleep/awake × zh/en (weight 'short' and 'react'
   for a repeatable win; the rest are full words). ── */
export const POOLS = {
  awake: {
    zh: {
      won: ['哼，本王的人，赢是应该的。', '总算没丢本王的脸。', '还行。下回别让它碰着你。'],
      won_short: ['嗯，还行。', '应该的。', '哼。'],
      won_react: ['哼。', '嗯。', '……还行。'],
      lost: ['输给这种东西？起来，本王还没说你可以趴下。', '记住它怎么出手的。下回，本王要看它趴下。', '哭丧着脸给谁看？……没伤着吧。起来。'],
      lost_short: ['又输？……起来。', '再来。本王看着。'],
      rise: ['这一步，本王等你很久了。……别得意，路还长。', '总算像个修士了。本王的人，就该往上走。', '哼，比本王当年慢了些。……不过，走得稳。'],
      hui: ['这一回，算你没白走。', '一回完了。本王陪你走的路，可不止这些。'],
      tamed: ['又收了一个。本王的队伍，总算有点样子。', '它肯跟你？……眼光倒不差。'],
      quest: ['功课做完了？本王早说你行——咳，本王是说，应该的。', '这点功课，本该如此。……做得还算干净。'],
      rare: ['这东西可不常见。收好，别让人瞧见。', '运气不错。本王的运气，分你一点也无妨。'],
      game_first: ['赢了？本王还以为要等到明年。', '头一回就赢——哼，本王教得好。'],
      bt_failed: ['雷劈一下就怕了？本王当年挨的比这多。歇好了再来。', '境界还在，怕什么。……疼就歇着，本王守着。'],
      skipped: ['不解也罢，这种题配不上本王的人。走。', '放下就放下，往前看。'],
      stuck: ['盯着它发呆，它也不会自己开。……实在不行，问问Ling。', '换个想法。本王不说，你自己来。……卡住了就问Ling。'],
      grind: ['打了一天了，手不酸？歇一歇，本王也乏了。', '天天打这几只，它们都认得你了。歇会儿。'],
      poor: ['灵石见底了？本王的储物袋……哼，自己想办法。', '穷成这样，出门别说是本王的人。'],
    },
    en: {
      won: ['Hmph. One of mine — winning is only proper.', 'At least you did not shame this king.', 'Passable. Next time, do not let it touch you.'],
      won_short: ['Passable.', 'As it should be.', 'Hmph.'],
      won_react: ['Hmph.', 'Mm.', '…Passable.'],
      lost: ['Lose to that? Up. This king has not said you may lie down.', 'Remember how it moved. Next time, this king wants it on the ground.', 'Who is the long face for? …Not hurt, are you. Up.'],
      lost_short: ['Again? …Up.', 'Once more. This king is watching.'],
      rise: ['This king has waited long for that step. …Do not gloat — the road is long.', 'At last you look like a cultivator. Mine should climb.', 'Slower than this king was. …But steady.'],
      hui: ['This chapter was not walked for nothing.', 'One more done. The road this king walks with you is longer than that.'],
      tamed: ['Another one. This king’s train starts to look like something.', 'It follows you? …Its eye is not bad.'],
      quest: ['Done? This king said you could — ahem. As it should be.', 'A small task, done as it ought to be. …Cleanly, even.'],
      rare: ['You do not see that often. Keep it close, out of sight.', 'Lucky. This king can spare you a little luck.'],
      game_first: ['Won? This king thought it would take till next year.', 'First win — hmph. This king taught you well.'],
      bt_failed: ['One bolt and you flinch? This king took worse. Rest, then again.', 'The realm is kept; what is there to fear. …Rest if it hurts. This king keeps watch.'],
      skipped: ['Leave it — a riddle like that is beneath one of mine. On.', 'Set it down and look ahead.'],
      stuck: ['Staring will not open it. …If it will not give, ask Ling.', 'Think another way. This king will not say. …Stuck, ask Ling.'],
      grind: ['A whole day of this — your arms not sore? Rest. Even this king is tired.', 'The same few beasts every day; they know your face by now. Rest a while.'],
      poor: ['Out of stones? This king’s pouch is… hmph. Find your own way.', 'This poor — do not tell anyone you are mine.'],
    },
  },
  // From the 木牌: the same pride, drowsy and clipped.
  asleep: {
    zh: {
      won: ['……赢了？嗯，还行。', '……吵什么，赢了就赢了。', '……没丢本王的脸。睡了。'],
      won_short: ['……嗯。', '……还行。'],
      won_react: ['……嗯。', '……哼。'],
      lost: ['……别哭丧着脸。再来。', '……趴着干什么，起来。本王还在。', '……输了？……下回赢回来。'],
      lost_short: ['……又输。起来。', '……再来。'],
      rise: ['……破境了？……哼，总算。', '……这一步，本王听见了。……别吵，路还长。'],
      hui: ['……一回完了？……嗯。', '……走完了就好。本王再睡会儿。'],
      tamed: ['……又捡了一只？……随你。', '……它肯跟你？……哼，眼光不差。'],
      quest: ['……功课做完了？……应该的。', '……嗯，做得还行。'],
      rare: ['……好东西。收好。', '……这个，不常见。……别弄丢。'],
      game_first: ['……赢了？……哼。', '……总算赢了一回。'],
      bt_failed: ['……雷劈的？……歇着，再来。', '……境界还在。……怕什么。'],
      skipped: ['……不解就不解。走。', '……放下吧。'],
      stuck: ['……还没解开？……问Ling去。', '……换个想法。……本王困。'],
      grind: ['……还打？……歇会儿。', '……手不酸？……睡了。'],
      poor: ['……又没灵石了？……哼。', '……穷。'],
    },
    en: {
      won: ['…Won? Mm. Passable.', '…What is the noise — won is won.', '…You did not shame this king. Sleeping.'],
      won_short: ['…Mm.', '…Passable.'],
      won_react: ['…Mm.', '…Hmph.'],
      lost: ['…Drop the long face. Again.', '…Why lie there. Up. This king is still here.', '…Lost? …Win it back.'],
      lost_short: ['…Again. Up.', '…Once more.'],
      rise: ['…Broke through? …Hmph. At last.', '…This king heard that step. …Quiet. The road is long.'],
      hui: ['…A chapter done? …Mm.', '…Done is good. This king sleeps a little more.'],
      tamed: ['…Picked up another? …As you like.', '…It follows you? …Hmph. Not a bad eye.'],
      quest: ['…The task is done? …As it should be.', '…Mm. Passable work.'],
      rare: ['…A good thing. Keep it.', '…That is rare. …Do not lose it.'],
      game_first: ['…Won? …Hmph.', '…At last, one win.'],
      bt_failed: ['…The lightning? …Rest. Then again.', '…The realm is kept. …What is there to fear.'],
      skipped: ['…Leave it then. On.', '…Set it down.'],
      stuck: ['…Still stuck? …Ask Ling.', '…Think another way. …This king is sleepy.'],
      grind: ['…Still fighting? …Rest.', '…Arms not sore? …Sleeping.'],
      poor: ['…Out of stones again? …Hmph.', '…Poor.'],
    },
  },
};

/* The pool for a moment, a weight and her mode, in turn. */
export function poolOf(kind, { mode = 'awake', lang = 'zh', weight = 'full' } = {}) {
  const p = POOLS[mode === 'asleep' ? 'asleep' : 'awake'][lang === 'en' ? 'en' : 'zh'];
  return (weight !== 'full' && p[`${kind}_${weight}`]) || (weight === 'react' && p[`${kind}_short`]) || p[kind] || p.won;
}

/* Her line as it came: one or two lines, trimmed for the bubble. */
export function cleanLine(text, max = 90) {
  const len = (t) => [...t].length;
  let t = String(text ?? '').replace(/^\s*(\*\*)?(银月|Yinyue)(\*\*)?\s*[:：]\s*/i, '').replace(/\s+/g, ' ').trim();
  if (!t || /^SILENT\b/i.test(t)) return null;
  if (len(t) <= max) return t;
  const cut = [...t].slice(0, max).join('');
  const at = Math.max(...['。', '！', '？', '.', '!', '?', '…'].map((p) => cut.lastIndexOf(p)));
  return at > max / 3 ? cut.slice(0, at + 1) : `${cut}…`;
}

/* Called as methods, the browser's own would throw (Illegal invocation): wrapped. */
export const BROWSER_TIMERS = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h) };

/* The one way she is asked and answered — a fight's words (fightsay.js) and
   the page's moments alike. `st` carries { seq, pending, over }; `ask(kind,
   facts)` → { sent: Promise<boolean>, line: Promise<string|null> }; `show`
   gets {kind, text, from: 'wait'|'her'|'fallback', id}; `fallbackOf(kind)`
   the pool's next line. Returns the moment's id, at once. */
export function sayer(st, { ask, show, fallbackOf, wait = WAIT_MS, timers = BROWSER_TIMERS }) {
  return function speak(kind, facts) {
    const id = ++st.seq;
    let settled = false;
    st.pending = true;
    show({ kind, text: null, from: 'wait', id });
    const fall = () => {
      if (settled || id !== st.seq) return;
      settled = true;
      st.pending = false;
      show({ kind, text: fallbackOf(kind), from: 'fallback', id });
    };
    const timer = timers.set(fall, wait);
    // Never awaited by the caller: nothing waits on her.
    Promise.resolve()
      .then(() => ask(kind, facts))
      .then((r) => {
        Promise.resolve(r?.sent).then((sent) => { if (!sent) { timers.clear(timer); fall(); } }, () => { timers.clear(timer); fall(); });
        return r?.line;
      })
      .then((text) => {
        const said = cleanLine(text);
        if (!said || id !== st.seq || st.over) return;
        timers.clear(timer);
        settled = true;
        st.pending = false;
        show({ kind, text: said, from: 'her', id });
      })
      .catch(() => { timers.clear(timer); fall(); });
    return id;
  };
}

const dayOf = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

/* The page's companion: the moments above, their limits, her mode.
   ask(kind, facts, {mode, weight, mood}) as for `sayer` (asleep, the page
   answers sent: false — the engine's gate); onLine({kind, text, from, id,
   mode, weight}); mode() → herMode; store: { get(), set(obj) } for the day's
   counts (the browser's, per save — never the save itself). */
export function createHerSay({ ask, onLine = () => {}, mode = () => 'awake', lang = () => 'zh', now = () => Date.now(), wait = WAIT_MS, timers = BROWSER_TIMERS, store = null, max = () => 260 } = {}) {
  const st = { seq: 0, pending: false, over: false, used: {}, line: null };
  const load = () => { try { return store?.get?.() ?? {}; } catch { return {}; } };
  let mem = load();
  const save = () => { try { store?.set?.(mem); } catch { /* a private window: the counts live for this page only */ } };
  const today = () => dayOf(now());
  const dayMem = () => {
    if (mem.day !== today()) mem = { ...mem, day: today(), fights: 0, wins: 0, onceDay: {} };
    return mem;
  };
  let cur = { mode: 'awake', weight: 'full' };
  const fallbackOf = (kind) => {
    const pool = poolOf(kind, { mode: cur.mode, lang: lang(), weight: cur.weight });
    const key = `${cur.mode}|${kind}|${cur.weight}`, n = st.used[key] ?? 0;
    st.used[key] = n + 1;
    return pool[n % pool.length];
  };
  const speak = sayer(st, {
    ask: (kind, facts) => ask(kind, facts, { mode: cur.mode, weight: cur.weight, mood: MOOD[MOMENTS[kind]?.group] ?? null }),
    show: (line) => { st.line = { ...line, mode: cur.mode, weight: cur.weight }; onLine(st.line); },
    fallbackOf, wait, timers,
  });
  /* Whether a moment may be said now, by its `once` (and records it). */
  function allowed(kind, key) {
    const m = MOMENTS[kind], once = m?.once;
    if (!once) return true;
    const d = dayMem(), t = now();
    mem.once = mem.once ?? {};
    if (once === 'day') { if (d.onceDay[kind]) return false; d.onceDay[kind] = true; return true; }
    if (once === 'key') { const k = `${kind}|${key ?? ''}`; if (mem.once[k]) return false; mem.once[k] = t; return true; }
    const k = `${kind}|cool`;
    if (t - (mem.once[k] ?? -Infinity) < once) return false;
    mem.once[k] = t;
    return true;
  }
  /* A moment, said now: the pool alone for a reaction (no model, no chat). */
  function say(kind, what, { weight = 'full', key = null } = {}) {
    const m = mode();
    if (m === 'absent' || !MOMENTS[kind]) return null;
    if (!allowed(kind, key)) { save(); return null; }
    save();
    cur = { mode: m, weight };
    if (weight === 'react') {
      const id = ++st.seq;
      st.pending = false;
      st.line = { kind, text: fallbackOf(kind), from: 'react', id, mode: m, weight };
      onLine(st.line);
      return id;
    }
    return speak(kind, momentFacts(kind, what, lang(), { weight, max: max() }));
  }
  return {
    st,
    get mem() { return dayMem(); },
    say,
    /* A fight settled. f: { outcome, story, strong, close, newBeast, repeat,
       what, saidInFight }. Every win and every loss gets her — weighed. */
    fight(f) {
      const d = dayMem(), t = now();
      if (f.repeat) d.fights = (d.fights ?? 0) + 1;
      if (f.outcome === 'won') {
        mem.streak = (mem.streak ?? 0) + 1;
        const firstToday = !d.wins;
        d.wins = (d.wins ?? 0) + 1;
        const w = weighWin({ story: f.story || !f.repeat, strong: f.strong, close: f.close, firstToday, newBeast: f.newBeast, streak: mem.streak }, { lastShort: mem.lastShort ?? -Infinity, now: t });
        if (w.weight === 'short') mem.lastShort = t;
        save();
        // Said in the fight already (fightsay's closing word): not a second time.
        const id = f.saidInFight ? null : say('won', f.what, { weight: w.weight });
        if (f.repeat && d.fights === GRIND_AT) say('grind', '');
        return { ...w, id };
      }
      if (f.outcome === 'lost') {
        mem.streak = 0;
        const again = t - (mem.lastLoss ?? -Infinity) < MOMENTS.lost.repeatMs;
        mem.lastLoss = t;
        save();
        return { weight: again ? 'short' : 'full', id: f.saidInFight ? null : say('lost', f.what, { weight: again ? 'short' : 'full' }) };
      }
      return null;
    },
  };
}
