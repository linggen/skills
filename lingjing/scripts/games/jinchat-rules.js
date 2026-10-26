// jinchat-rules.js — 今's 聊天, the pure half (Hanli 10-22, the 调息 sweep: 「你说的1-6 都是好主意, 按你说的改一遍.
// 关键是能留住玩家」). One chat game for every 今 board, driven by data (games.json `jinchat` · `data.chats`): who is
// in the chat, the book's own opening lines, the facts and the goal Ling is handed, how many lines he may send.
//
// Who writes what (design.md: Ling writes every word a player reads; code gives facts):
//   - the opening bubbles and the fallback are the BOOK's lines, verbatim (tests/jinchat.test.mjs holds each to
//     story/jiuding-lu/今线/*.md);
//   - every other bubble from them is Ling's, as that person (SKILL.md § 今 chat; she is handed `facts` and `goal`
//     in a hidden line, never shown);
//   - the rules here decide: how many lines he sends (`turns`), when it is over, and the grade. Ling judges only the
//     fuzzy part — whether what the goal says has happened — by one tag on its own line (TAG), and the rules take it
//     only after he has sent a line (never on her own initiative before he speaks).
// The 今 never pays the 古 (「不跨线」): its task's grant is the task table with nothing in it, like every 今 board.

// The tag is an HTML comment (10-22: the tag must never show to the player — 「【成】」 stood in the chat panel): the engine's chat panel drops
// every `<!-- … -->` before it renders a reply (linggen ui MarkdownContent.tsx), and the bubbles never carry it. The
// older bracket spellings are still read as the tag (and stripped), should she write one.
export const TAG = '<!--成-->';
const TAG_RE = /<!--\s*(?:成|done)\s*-->|[【\[]\s*(?:成|done)\s*[】\]]/gi;
const MAX_LINES = 4;
const MAX_CHARS = 80;

const pick = (v, lang) => (v == null ? '' : typeof v === 'string' ? v : v[lang] ?? v.zh ?? '');

/** The people in a chat, as the page shows them: id, name, art (people.json rows, or the chat's own `{ id, name }`). */
export function castOf(chat, people = {}, lang = 'zh') {
  return (chat?.who ?? []).map((w) => {
    const id = typeof w === 'string' ? w : w.id;
    const p = people[id] ?? (typeof w === 'object' ? w : {});
    return { id, name: pick(p.name, lang) || id, art: p.art ?? null, voice: pick(p.voice, lang) };
  });
}

const strip = (s) => String(s ?? '').replace(/\*\*/g, '').replace(/^[-*•>\s]+/, '').trim();

/**
 * Ling's reply as the chat's bubbles: `{ lines: [{ who, text }], met }`. A line may start with a speaker's name and a
 * colon (a group chat asks for it; a one-person chat strips it); a line wholly in brackets is narration and dropped;
 * TAG anywhere is the goal met, and never a bubble.
 */
export function parseChat(text, cast) {
  const raw = String(text ?? '');
  const met = TAG_RE.test(raw);
  TAG_RE.lastIndex = 0;
  const names = cast.map((c) => c.name);
  let who = cast[0]?.id ?? null;
  const lines = [];
  // Two speakers on one line (live 10-22: 「老蔡：……。 眼镜：我查了。……」) are two bubbles.
  const esc = (n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const split = names.length > 1 ? new RegExp(`\\s*(?=(?:\\*\\*)?(?:${names.map(esc).join('|')})(?:\\*\\*)?\\s*[：:])`, 'g') : null;
  const body = raw.replace(TAG_RE, '');
  for (let l of (split ? body.replace(split, '\n') : body).split(/\n+/)) {
    l = strip(l);
    if (!l || /^[（(][^）)]*[）)]$/.test(l)) continue;
    const m = l.match(/^([^：:「」"]{1,8})\s*[：:]\s*(.+)$/);
    if (m && names.includes(strip(m[1]))) {
      who = cast[names.indexOf(strip(m[1]))].id;
      l = m[2].trim();
    }
    l = l.replace(/^[「"](.*)[」"]$/, '$1').trim();
    if (!l) continue;
    lines.push({ who, text: [...l].length > MAX_CHARS ? `${[...l].slice(0, MAX_CHARS).join('')}…` : l });
    if (lines.length >= MAX_LINES) break;
  }
  return { lines, met };
}

/** How a chat came out, the rules' call: the goal met after he spoke → 3 stars, `met`; his lines used up → 1, `talked`. */
export function outcome({ met = false, sent = 0, turns = 5 } = {}) {
  if (met && sent >= 1) return { over: true, won: true, grade: 'met', stars: 3 };
  if (sent >= turns) return { over: true, won: true, grade: 'talked', stars: 1 };
  return { over: false };
}

const W = {
  zh: {
    head: '[HIDDEN] [jinchat] 舞台上的手机聊天（今线）：{title}，{when}。不是对你说的话：不 Look，不调用任何工具。',
    you: '你只写{names}发的下一条消息。',
    people: '{name}：{voice}',
    facts: '此刻：{facts}',
    shown: '屏幕上已有——{lines}',
    goal: '他这一局想做到（你心里有数，不说破，不替他做到；他真做到了，就认）：{goal}',
    shape: '回法：一到三行，每行不超过三十字{multi}；不叙述，不旁白。哪一条他做到了，那一条回复最后另起一行只写 <!--成-->（原样，别加别的）。',
    multi: '，每行以说话人的名字加冒号开头',
    count: '第{k}条（共{n}条）。',
    last: '这是他最后一条：顺着话收个尾，自然地结束这段聊天。',
    said: '他发来：「{text}」',
    again: '[HIDDEN] [jinchat] {title}·',
    tag: '（照目标，他这一条之后确实已经做到了，才另起一行写 <!--成-->；还差一点就不写。）',
  },
  en: {
    head: '[HIDDEN] [jinchat] A phone chat on the stage (the present line): {title}, {when}. Not words to you: no Look, no tool at all.',
    you: 'Write only the next message(s) from {names}.',
    people: '{name}: {voice}',
    facts: 'Now: {facts}',
    shown: 'Already on the screen — {lines}',
    goal: 'What he wants this round (you know it; never say it, never do it for him; once he truly has, own it): {goal}',
    shape: 'Shape: one to three lines, each under twenty words{multi}; no narration. The reply in which he has done it ends with a line of only <!--成--> (exactly that).',
    multi: ', each line starting with the speaker\'s name and a colon',
    count: 'Line {k} of {n}.',
    last: 'This is his last line: answer it and let the chat end naturally.',
    said: 'He sends: "{text}"',
    again: '[HIDDEN] [jinchat] {title} · ',
    tag: ' (Only if, by the goal, he has truly done it now: a last line <!--成-->; not yet, none.)',
  },
};
const fill = (t, o) => t.replace(/\{(\w+)\}/g, (_, k) => o[k] ?? '');

/**
 * The hidden line one of his messages goes to Ling as: the first (`k` 1) with who, the facts, what is on the screen and
 * the goal; the later ones short (she sees the dialogue). Facts only — her words are hers.
 */
export function turnLine(chat, { k = 1, text = '', cast = [], shown = [], lang = 'zh' } = {}) {
  const w = W[lang] ?? W.zh;
  const n = Math.max(1, Number(chat?.turns) || 5);
  const tail = [fill(w.count, { k, n }), k >= n ? w.last : '', fill(w.said, { text: String(text).trim() })].join('');
  // Every later line carries the tag's rule again: live 10-22 the first line's rule was forgotten by the fifth
  // (马小宝 「手没那么麻了」, no tag) — the goal was met and the chat ran out instead.
  if (k > 1) return `${fill(w.again, { title: pick(chat.title, lang) })}${tail}${w.tag}`;
  const names = cast.map((c) => c.name).join(lang === 'en' ? ' and ' : '和');
  const lines = shown.map((s) => `${cast.find((c) => c.id === s.who)?.name ?? (lang === 'en' ? 'he' : '他')}：「${s.text}」`).join(' ');
  return [
    fill(w.head, { title: pick(chat.title, lang), when: pick(chat.when, lang) }),
    fill(w.you, { names }),
    ...cast.filter((c) => c.voice || chat.voices?.[c.id]).map((c) => fill(w.people, { name: c.name, voice: pick(chat.voices?.[c.id], lang) || c.voice })),
    fill(w.facts, { facts: pick(chat.facts, lang) }),
    lines ? fill(w.shown, { lines }) : '',
    fill(w.goal, { goal: pick(chat.goal, lang) }),
    fill(w.shape, { multi: cast.length > 1 ? w.multi : '' }),
    tail,
  ].filter(Boolean).join('');
}

/** The system turn a host with its own model gives each line (games/jinchat.js `data.ask`; the phone): what SKILL.md's
    `[jinchat]` rule tells the Mac's Ling — their reply only, in the shape the hidden line asks, nothing else. */
export const HOST_SYSTEM = {
  zh: '这是灵境（一部修仙小说改成的游戏）里的一段聊天。只照 [HIDDEN] 那一行说的，替书中人物写下一条回话：不叙述，不解释，不调用工具，不提这是游戏。',
  en: 'This is a chat inside Lingjing (a game made from a xianxia novel). Do only what the [HIDDEN] line says: write the next message from the people of the book — no narration, no explaining, no tools, never that this is a game.',
};

/** A 测试存档's stub (`&her=stub`): a marked line from the first in the chat, the goal met on his second line. */
export function stubReply(cast, k) {
  const who = cast[0]?.name ?? '';
  return k >= 2 ? `${who}：[stub] 行，听你的。\n${TAG}` : `${who}：[stub] 嗯？`;
}
