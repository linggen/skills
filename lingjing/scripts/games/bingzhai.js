// 讨饼债, the story's round at 00-yinyue (Hanli 10-22, of the 二十问 it replaces: 「这个设计不太好. 太简单, 反倒不知道是答案.....
// 怎么改一下呢?」 → 「可以, 试一下」): she ate the Shens' last white flour last night and is eating his breakfast corner now,
// and the proud 妖王 will not own it. The player's goal, plainly on the card: make her ADMIT the debt. Typed here, or
// said to @银月 in the chat (the mic is the chat's) — she answers in her own voice, as hers, in the game's own chat; she
// dodges (pride, deflection) and gives in only to a good case: evidence, wit, a dare, a bargain.
//
// The model only talks. Whether she owned it is checked HERE on her own reply (bingzhai-rules.js `admits`, a data list
// with negation guards) — never a tag of hers; how many exchanges, when the way out shows: the task's deal (tasks/world.json
// `yinyue-what`). Her lines come from her (SKILL.md `place.yinyue`); the only words sent for her are the round's facts in
// brackets on the first line (`deal.context`), as 画猜 sends its scene. Unmet at 00-yinyue, she is held on the stage for
// the round (rules/hergame.mjs `stage`: deal.wake/rest). In the 游戏厅 (no deal on the row) the task's deal is fetched.
//
// mount(container, { data, lang, signal }) → { won: true, grade: 'admitted' | 'dodged', stars }
//   data: { exchanges, skip_after, context: {zh, en}, session(), seam ('stub' | 'off'), wake(), rest() }
// 「算了，往下走」 is the page's (stuck.js): `stuck()` says so once `skip_after` lines are sent, or she cannot be asked.
import { refusalOf } from './drawguess-rules.js';
import { admits, starsFor } from './bingzhai-rules.js';

export { admits, starsFor };

export const meta = {
  id: 'bingzhai',
  name: { zh: '讨饼债', en: 'The flatbread debt' },
  how: { zh: '让她认下这笔饼债。', en: 'Make her own the flatbread debt.' },
  ai: true, // the other half is a model's (no bot plays it: tests/board-bots.test.mjs)
  stuckClock: false, // the way out is the questions' (stuck below), not 75 s: her answers take a while
};

const SKILL = 'lingjing';
const POLL_MS = 600, TIMEOUT_MS = 40000;

const T = {
  zh: {
    lead: '让她认下这笔饼债。', lead2: '凭据、嘴皮、激将、讲条件，都行——在这儿打字，或在对话里 @银月 说。',
    ask: '跟她说……', go: '说', count: '已说 {n}/{max}', wait: '银月在想……',
    won: '她认了。', missed: '她到底没认。', far: '这里叫不应银月。', off: '这个测试存档不叫银月（chat=off）。', absent: '银月不在。', err: '她没答上来，再问一句。',
  },
  en: {
    lead: 'Make her own the flatbread debt.', lead2: 'Evidence, wit, a dare, a bargain — type it here, or say it to @Yinyue in the chat.',
    ask: 'Tell her…', go: 'Say', count: 'Said {n}/{max}', wait: 'Yinyue is thinking…',
    won: 'She owned it.', missed: 'She never owned up.', far: 'Yinyue can\'t be reached here.', off: 'This test save calls no one (chat=off).', absent: 'Yinyue isn\'t here.', err: 'No answer from her. Ask again.',
  },
};
const fill = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => o[k] ?? '');
const AT = { zh: '@银月 ', en: '@Yinyue ' };

/** The line sent for the player: the round's facts in brackets on the first line; every other line is his own words. */
export function lineFor(deal, q, { first = false, lang = 'zh' } = {}) {
  const en = lang === 'en';
  const fact = first ? deal?.context : null;
  const note = fact ? (en ? `(${fact.en ?? fact.zh}) ` : `（${fact.zh}）`) : '';
  return `${AT[en ? 'en' : 'zh']}${note}${q}`;
}

/* The 游戏厅's 试玩 stands the board with no deal (its row carries none): the story task's own, fetched once. */
const WORLD = new URL('../../worlds/jiuding/', import.meta.url);
let dealP = null;
const storyDeal = () => (dealP ??= fetch(new URL('tasks/world.json', WORLD)).then((r) => r.json())
  .then((w) => (w.tasks ?? []).find((t) => t.game === 'bingzhai')?.deal ?? {}).catch(() => ({})));

// The round now on the stage (one at a time): `stuck` reads it.
let current = null;
export const stuck = () => Boolean(current && !current.done && (current.unasked || current.asked >= current.skipAfter));

const STYLE = `.g-tq{gap:10px}.g-tq-lead{width:100%;font-family:var(--serif);font-size:15px;line-height:1.7;color:var(--text)}
.g-tq-lead b{display:block;font-size:18px;color:var(--ling);font-weight:600}
.g-tq-count{width:100%;font-size:12px;color:var(--faint);font-family:var(--ui);text-align:right}
.g-tq-say{width:100%;box-sizing:border-box;min-height:52px;padding:8px 12px;border-radius:10px;background:var(--surface);border:1px solid var(--line);font-family:var(--serif);font-size:15px;line-height:1.6}
.g-tq-say b{color:var(--ling);margin-right:6px}.g-tq-say.is-wait{color:var(--faint)}.g-tq-say:empty{display:none}
.g-tq-q{width:100%;font-size:13px;color:var(--dim);font-family:var(--serif)}.g-tq-q:empty{display:none}
.g-tq-form{display:flex;gap:8px;width:100%}.g-tq-form input{flex:1;min-width:0;min-height:44px;padding:6px 12px;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--text);font:16px var(--serif)}
.g-tq-form .g-btn{flex:0 0 auto;min-width:64px}.g-tq .g-btn:disabled{opacity:.45;cursor:default}
.g-tq-foot{width:100%;font-size:12px;color:var(--faint);font-family:var(--ui);min-height:1em}`;
function styleOnce(doc) {
  if (doc.getElementById('g-tq-style')) return;
  const el = doc.createElement('style');
  el.id = 'g-tq-style';
  el.textContent = STYLE;
  doc.head.append(el);
}

let apiP = null;
const api = () => (apiP ??= import('/shared/api.js'));
const channel = (url, init) => globalThis.LinggenChannel.fetch(url, init);
/** The chat's rows between the player and her, oldest first: `[from, text]`. */
async function rowsOf(sid) {
  const { fetchSessionMessages } = await api();
  const rows = await fetchSessionMessages(SKILL, sid).catch(() => []);
  return rows.filter(([m]) => (m?.from === 'yinyue' && m.to === 'user') || (m?.from === 'user' && m.to === 'yinyue')).map(([m, t]) => [m.from, String(t ?? '')]);
}

export function mount(container, { data = {}, lang = 'zh', signal } = {}) {
  const doc = container.ownerDocument, w = T[lang] ?? T.zh;
  styleOnce(doc);
  const max = Math.max(1, Number(data.exchanges) || 10), skipAfter = Math.max(1, Number(data.skip_after) || 4);
  const sessionOf = () => (typeof data.session === 'function' ? data.session() : data.session ?? null);
  const root = doc.createElement('div');
  root.className = 'g-ink g-tq';
  root.innerHTML = `<div class="g-tq-lead"><b>${w.lead}</b>${w.lead2}</div><div class="g-tq-count"></div><div class="g-tq-q"></div><div class="g-tq-say"></div>`
    + `<form class="g-tq-form"><input type="text" maxlength="60" autocomplete="off" enterkeyhint="send" placeholder="${w.ask}"><button type="submit" class="g-btn g-btn-main">${w.go}</button></form><div class="g-tq-foot"></div>`;
  container.replaceChildren(root);
  const $ = (s) => root.querySelector(s);
  const input = $('input'), btn = $('button'), form = $('form');
  const r = { asked: 0, skipAfter, done: false, unasked: false, busy: false, seen: 0, mine: new Set() };
  current = r;
  const count = () => { $('.g-tq-count').textContent = fill(w.count, { n: r.asked, max }); };
  const foot = (t) => { $('.g-tq-foot').textContent = t ?? ''; };
  const say = (t, wait = false) => { const el = $('.g-tq-say'); el.classList.toggle('is-wait', wait); el.innerHTML = ''; if (!t) return; if (!wait) { const b = doc.createElement('b'); b.textContent = lang === 'en' ? 'Yinyue' : '银月'; el.append(b); } el.append(doc.createTextNode(t)); };
  const lock = (on) => { r.busy = on; btn.disabled = on || r.done || r.unasked; input.disabled = r.done || r.unasked; };
  const cannot = (why) => { r.unasked = true; foot(why); lock(false); };
  count();
  const dealt = data.context || data.seam ? Promise.resolve(data) : storyDeal().then((d) => ({ ...d, ...data }));
  const woke = typeof data.wake === 'function' ? Promise.resolve(data.wake()).catch(() => null) : Promise.resolve(null);
  if (data.seam === 'off') cannot(w.off);
  else if (data.seam !== 'stub' && (!globalThis.LinggenChannel?.fetch || !sessionOf())) cannot(w.far);

  return new Promise((resolve) => {
    let poll = null;
    const finish = (res) => {
      if (r.done) return;
      r.done = true;
      clearInterval(poll);
      lock(false);
      if (typeof data.rest === 'function') Promise.resolve(data.rest()).catch(() => {});
      if (current === r) current = null;
      resolve(res);
    };
    const end = (owned) => {
      root.classList.add(owned ? 'is-won' : 'is-over');
      foot(owned ? w.won : w.missed);
      setTimeout(() => finish({ won: true, grade: owned ? 'admitted' : 'dodged', stars: owned ? starsFor(r.asked) : 0 }), 2600);
    };
    // A line counted once, whoever sent it (this box, or the chat's own @银月 line).
    const counted = (q) => {
      r.asked += 1;
      count();
      $('.g-tq-q').textContent = q;
      if (r.asked >= max) r.over = true;
    };
    // Her reply, wherever it came: shown, and checked here — has she owned the debt?
    const heard = (line) => { say(line); if (admits(line)) r.won = true; };
    const awaitReply = async (sid, seenHers) => {
      const until = performance.now() + TIMEOUT_MS;
      while (performance.now() < until && !signal?.aborted) {
        await new Promise((ok) => setTimeout(ok, POLL_MS));
        const hers = (await rowsOf(sid)).filter(([f]) => f === 'yinyue');
        if (hers.length > seenHers) return hers.at(-1)[1];
      }
      return null;
    };
    const ask = async (q) => {
      if (r.busy || r.done || r.unasked) return;
      lock(true);
      const first = r.asked === 0;
      counted(q);
      say(w.wait, true);
      try {
        if (data.seam === 'stub') {
          await new Promise((ok) => setTimeout(ok, 700));
          heard(r.asked >= 3 ? '[stub] ……罢了。本王欠你一张饼。' : '[stub] 哼，本王只是见它孤零零的，顺手收留了。');
        } else {
          await woke;
          const sid = sessionOf();
          const seenHers = (await rowsOf(sid)).filter(([f]) => f === 'yinyue').length;
          const text = lineFor(await dealt, q, { first, lang });
          r.mine.add(text);
          const res = await channel('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_root: '', agent_id: 'yinyue', message: text, session_id: sid, skill_name: SKILL }) });
          const refused = refusalOf(await res.json().catch(() => null));
          if (!res.ok || refused) { say(''); cannot(refused === 'absent' || refused === 'unavailable' ? w.absent : w.far); return; }
          const line = await awaitReply(sid, seenHers);
          if (line) heard(line); else { say(''); foot(w.err); }
          r.seen = (await rowsOf(sid)).length;
        }
      } catch { say(''); foot(w.err); }
      lock(false);
      if (r.won) end(true); else if (r.over) end(false);
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (!q || r.busy) return;
      input.value = '';
      ask(q);
    });
    // The chat's own lines to her count too — typed or said there (the mic is the chat's).
    if (data.seam !== 'stub' && !r.unasked) {
      (async () => { const sid = sessionOf(); if (sid) r.seen = (await rowsOf(sid)).length; })().catch(() => {});
      poll = setInterval(async () => {
        if (r.busy || r.done || r.unasked) return;
        const sid = sessionOf();
        if (!sid) return;
        const rows = await rowsOf(sid).catch(() => null);
        if (!rows || rows.length <= r.seen) return;
        const fresh = rows.slice(r.seen);
        r.seen = rows.length;
        for (const [from, text] of fresh) {
          if (from === 'user' && !r.mine.has(text) && ![...r.mine].some((m) => m.endsWith(text))) counted(text.replace(/^@\S+\s*/, ''));
          if (from === 'yinyue') heard(text);
        }
        if (r.won) end(true); else if (r.over) end(false);
      }, 1500);
    }
    if (signal) signal.addEventListener('abort', () => finish({ won: false, left: true }), { once: true });
  });
}
