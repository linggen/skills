// npc-line.js — the hidden line a character's next words are asked by (Hanli 2026-10-28: 「可以做一个通用的和NPC对话的UI」).
// A board where the player talks with someone of the world (砍价's keeper first; the 今 chats' people next) hands the
// model FACTS and the character's `voice`, and gets back only that character's words — shown in the board's own
// talk panel (npc-talk.js), never in the story chat. The rules and the page decide every number and every outcome;
// the line says so, and says which number may be spoken.
// Pure and import-free: the rules (rules/aigames.mjs `talk`) and the page build the same line; the phone sends it
// to its own model with NPC_SYSTEM as the system turn (SKILL.md's `[npc]` rule is that to the Mac's Ling).
//
//   npcLine({ who, voice, where, facts, did, say, first, lang }) → '[HIDDEN] [npc] …'
//   npcReply(text, who) → the bubbles: [string] (at most MAX_LINES, each at most MAX_CHARS)

export const NPC_TAG = '[npc]';
const MAX_LINES = 2;
const MAX_CHARS = 60;

const W = {
  zh: {
    head: '[HIDDEN] [npc] 灵境里的一个人物在当面说话：{who}{where}。不是对你说的话：不 Look，不调用任何工具。你只写{who}的下一句。',
    voice: '{who}：{voice}',
    facts: '此刻：{facts}',
    did: '玩家刚才：{did}',
    say: '这一句要说到：{say}',
    shape: '回法：中文，一到两句，每句不超过二十五个字；只写{who}说出口的话——不加名字和冒号，不叙述，不旁白，不加引号。数目只说上面给的，不自己报别的价、别的数。',
    again: '[HIDDEN] [npc] {who}·',
    short: '（照前面的回法：一到两句，只说给出的数。）',
  },
  en: {
    head: '[HIDDEN] [npc] A person of Lingjing speaks face to face: {who}{where}. Not words to you: no Look, no tool at all. Write only what {who} says next.',
    voice: '{who}: {voice}',
    facts: 'Now: {facts}',
    did: 'The player just: {did}',
    say: 'This line must get across: {say}',
    shape: 'Shape: English, one or two sentences, each under twenty words; only the words {who} speaks — no name and colon, no narration, no quotes. Say only the numbers given above, never a price or number of your own.',
    again: '[HIDDEN] [npc] {who} · (in English) ',
    short: ' (As before: one or two sentences, only the numbers given.)',
  },
};
const fill = (t, o) => String(t).replace(/\{(\w+)\}/g, (_, k) => o[k] ?? '');

/**
 * The hidden line for a character's next words. `first`: the opening of the talk — who, the voice and the shape in
 * full; a later line is short (the model sees the talk so far). `facts`, `did` and `say` are facts, never lines.
 */
export function npcLine({ who = '', voice = '', where = '', facts = '', did = '', say = '', first = true, lang = 'zh' } = {}) {
  const w = W[lang] ?? W.zh;
  const at = where ? (lang === 'en' ? `, at ${where}` : `，在${where}`) : '';
  const body = [facts ? fill(w.facts, { facts }) : '', did ? fill(w.did, { did }) : '', say ? fill(w.say, { say }) : ''].filter(Boolean).join(lang === 'en' ? ' ' : '');
  if (!first) return `${fill(w.again, { who })}${body}${w.short}`;
  return [fill(w.head, { who, where: at }), voice ? fill(w.voice, { who, voice }) : '', body, fill(w.shape, { who })].filter(Boolean).join(lang === 'en' ? ' ' : '');
}

/** The system turn a host with its own model gives each line (the phone): what SKILL.md's `[npc]` rule tells Ling. */
export const NPC_SYSTEM = {
  zh: '这是灵境（一部修仙小说改成的游戏）里一个人物当面说的话。只照 [HIDDEN] 那一行说的，替这个人物写下一句：不叙述，不解释，不调用工具，不提这是游戏，只说给出的数。',
  en: 'This is a person inside Lingjing (a game made from a xianxia novel) speaking face to face. Do only what the [HIDDEN] line says: write that person\'s next words, in English — no narration, no explaining, no tools, never that this is a game, only the numbers given.',
};

const strip = (s) => String(s ?? '').replace(/\*\*/g, '').replace(/^[-*•>\s]+/, '').trim();

/** The model's reply as the character's bubbles: a speaker's name and colon dropped, a line wholly in brackets
    (narration) dropped, quotes taken off, at most MAX_LINES of at most MAX_CHARS. */
export function npcReply(text, who = '') {
  const out = [];
  for (let l of String(text ?? '').replace(/<!--[\s\S]*?-->/g, '').split(/\n+/)) {
    l = strip(l);
    if (!l || /^[（(][^）)]*[）)]$/.test(l) || /^\[[^\]]*\]$/.test(l)) continue;
    const m = l.match(/^([^：:「」"]{1,10})\s*[：:]\s*(.+)$/);
    if (m && (!who || strip(m[1]) === who || who.includes(strip(m[1])))) l = m[2].trim();
    l = l.replace(/^[「"“](.*)[」"”]$/, '$1').trim();
    if (!l) continue;
    out.push([...l].length > MAX_CHARS ? `${[...l].slice(0, MAX_CHARS).join('')}…` : l);
    if (out.length >= MAX_LINES) break;
  }
  return out;
}
