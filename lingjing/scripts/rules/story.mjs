// rules/story.mjs — 九鼎录: the spine as a book, the 前情提要, and the story's nodes.
// Part of the rules engine; rules.mjs is its one door.
//
// His (2026-09-24): 「主线剧情要能让用户查看…我现在也对主线故事没有太深印象，
// 这点要强化，让银月和Ling多讨论剧情」 (redesign-v2 § 六). The words are all
// authored — each scene's `recap`, each chapter's `intro` and `mystery` — and
// the rules only choose which of them the player has earned: what was DONE,
// in the order it was done. Nothing not yet reached leaves this file: a
// chapter ahead is a dark cauldron with its province and nothing more.
import { seenLog } from './examine.mjs';
import { CAST } from '../content.mjs';
import { fill, pick } from '../state.mjs';
import { cauldronsFound, companionOf, giftAt, hasCompanion, herAwake, recalledOf } from './companion.mjs';
import { threadOf } from './errands.mjs';
import { cardBook } from './cards.mjs';
import { albumOf } from './memories.mjs';
import { seenOf } from './codex.mjs';
import { atScene, creatureOf, inMade, sceneOf } from './world.mjs';
import { chapterHuis, chapterLabel, endLabel, huiEnded, huiLabel, huiNow, huiOf } from './hui.mjs';

const HOUR = 3600000;
/* 前情提要 opens every sitting (his, 2026-09-25: 每次开始游戏时): a sitting is a
   new chat session of Ling's, or a return after this long with nothing
   played; told, it is not owed again until one of those comes round. */
const RECAP_AWAY = HOUR;
/* Owed and never told (the player played on the page alone) — let it go. */
const RECAP_STALE = 6 * HOUR;
const RECAP_LINES = 3;

const byId = (a, b) => a.id.localeCompare(b.id);
const chaptersOf = content => Object.values(content.chapters).sort(byId);
/* A chapter with a cauldron in it: every chapter of the spine but a corridor
   (the prologue) and one that says it holds none (`cauldron: false`, 外门 — 第五回 to 第八回). */
const holdsCauldron = ch => !ch.corridor && ch.cauldron !== false;

/* scene id → its chapter, once per world. */
const SCENES = new WeakMap();
function sceneIndex(content) {
  if (!SCENES.has(content)) {
    const m = new Map();
    for (const ch of Object.values(content.chapters)) for (const sc of Object.values(ch.scenes ?? {})) m.set(sc.id, { scene: sc, chapter: ch });
    SCENES.set(content, m);
  }
  return SCENES.get(content);
}

/* The chapter being played: the one the save stands in, or — that one ended
   (walked back into by Go, or the spine run out) — the next not ended. */
function currentOf(content, state) {
  const ended = new Set(state.ended ?? []);
  if (content.chapters[state.chapter] && !ended.has(state.chapter)) return content.chapters[state.chapter];
  return chaptersOf(content).find(c => !ended.has(c.id) && c.id > state.chapter) ?? null;
}

/* The scenes of one chapter the player has passed, in the order passed. A
   chapter ended on a save older than `done_scenes` gives its authored road. */
function passed(content, state, ch) {
  const done = (state.done_scenes ?? []).filter(id => ch.scenes?.[id]);
  if (done.length || !(state.ended ?? []).includes(ch.id)) return [...new Set(done)].map(id => ch.scenes[id]);
  const road = [];
  for (let id = ch.first_scene; id && ch.scenes[id] && !road.includes(ch.scenes[id]);) {
    road.push(ch.scenes[id]);
    id = ch.scenes[id].exits?.find(e => e.next)?.next;
  }
  return road;
}
const recapOf = (content, state, scenes) => scenes.map(sc => sc.recap).filter(Boolean).map(r => fill(pick(r, state.lang), state, content));

/* A chapter as the book's 回 (rules/hui.mjs): its scenes passed, by the 回
   they belong to — [{hui, scenes}] in the book's order, each 回's scenes in
   the order passed. The save's own chapter ends on the 回 it stands in, even
   with none of it passed yet. A chapter with no 回 (one still to be
   rewritten) is one part, `hui` null. */
function partsOf(content, state, ch) {
  const by = new Map(), n = id => huiOf(content, id)?.n ?? Infinity;
  for (const sc of passed(content, state, ch)) {
    const hui = sc.hui ?? null;
    if (!by.has(hui)) by.set(hui, { hui, scenes: [] });
    by.get(hui).scenes.push(sc);
  }
  const now = ch.id === state.chapter ? huiNow(content, state) : null;
  if (!by.size) by.set(null, { hui: now ?? chapterHuis(content, ch)[0] ?? null, scenes: [] });
  else if (now && !by.has(now)) by.set(now, { hui: now, scenes: [] });
  return [...by.values()].sort((a, b) => n(a.hui) - n(b.hui));
}

/* Where the current chapter stands this moment: the scene's place when one is
   being played, else the road the thread names. */
function nowOf(content, state, now) {
  if (inMade(state)) return null;
  const scene = sceneOf(content, state);
  if (scene && atScene(content, state)) return fill(pick(scene.place, state.lang), state, content);
  const t = threadOf(content, state, now);
  return t?.text ?? t?.title ?? null;
}

/* A chapter's riddle as the player may know it: `mystery`, until the scene
   `mystery_after.after` is passed — then its own words. 外门 (第五回 to 第八回) names 息壤 only
   once the 秘境 is behind him (his, 2026-09-29: the 录 spoiled it from the start). */
export const mysteryOf = (ch, state, lang = state.lang) => {
  const later = ch?.mystery_after;
  return pick(later && (state.done_scenes ?? []).includes(later.after) ? later : ch?.mystery, lang);
};

const nameOf = (content, id, lang) => pick(CAST[id] ?? creatureOf(content, id)?.name, lang) ?? null;

/* 人物谱: who the story has put before the player — the scenes passed, the
   beasts that walk with them, the ones fought, the people of finished rumors.
   Yinyue is her own page of the book; Ling narrates and is no one. */
function peopleOf(content, state) {
  const lang = state.lang, her = companionOf(content)?.id, out = new Map();
  const add = (id, name, kind, from = null) => { if (name && !out.has(id)) out.set(id, { id, name, kind, ...(from ? { from } : {}) }); };
  for (const id of state.cast ?? []) add(id, nameOf(content, id, lang), 'tamed');
  const index = sceneIndex(content);
  const met = [...(state.done_scenes ?? []), ...(atScene(content, state) && !inMade(state) ? [state.scene] : [])];
  for (const sid of met) {
    const at = index.get(sid);
    const when = at && (huiLabel(content, at.scene.hui, lang, 'short') ?? pick(at.chapter.title, lang));
    for (const id of at?.scene.cast ?? []) if (id !== her && id !== 'ling') add(id, nameOf(content, id, lang), 'story', when);
  }
  for (const [id, d] of Object.entries(state.duels ?? {})) if (d?.outcome && d.outcome !== 'open') add(id, nameOf(content, id, lang), 'fought');
  for (const k of state.known ?? []) add(`known:${k.id}`, k.name, 'known', k.from);
  return [...out.values()];
}

/* The ending reached, as it is named: {id, title}. */
function endingOf(content, state) {
  if (!state.ending) return null;
  const ch = chaptersOf(content).find(c => c.ending?.id === state.ending.id);
  return ch ? { id: state.ending.id, title: pick(ch.ending.title, state.lang), at: state.ending.at } : null;
}

/* ── The book ── */

/* Story — the 九鼎录, a read: the page's book whole; `short` (Ling's tool) small. */
export function story(state, content, ctx, args = {}) {
  const lang = state.lang, short = String(args.short ?? '') === 'true';
  if (content.world.made) return { state: null, result: { ok: true, made: true, cauldrons: [], chapters: [], people: peopleOf(content, state), her: null, open: [], ending: null } };
  const ended = new Set(state.ended ?? []), cur = currentOf(content, state);
  const cauldrons = chaptersOf(content).filter(holdsCauldron).map(ch => {
    const st = ended.has(ch.id) ? 'found' : ch.id === cur?.id ? 'current' : 'dark';
    return { chapter: ch.id, province: pick(content.dictionary.provinces[ch.province] ?? ch.province, lang) ?? ch.province, state: st, ...(st === 'dark' ? {} : { title: pick(ch.title, lang) }) };
  });
  const done = chaptersOf(content).filter(ch => ended.has(ch.id));
  // The book is the novel's 回 (his, 2026-09-29: 「故事叫回和卷，游戏也需要一致的叫法」):
  // each chapter reached, cut into its 回; the chapter's intro opens its first,
  // its riddle and where it stands close its last.
  // Ling's short book: a 回 done is its title and closing line — the last one,
  // with nothing after it, its last three — and her last three memories.
  const tail = !cur && done.at(-1)?.id;
  const chapters = [...done, ...(cur ? [cur] : [])].flatMap(ch => {
    const parts = partsOf(content, state, ch), open = ch === cur;
    return parts.map((p, i) => {
      const last = i === parts.length - 1, st = open && last ? 'current' : 'done', lines = recapOf(content, state, p.scenes);
      const title = huiLabel(content, p.hui, lang, 'book') ?? pick(ch.title, lang);
      // Ling's short book names a 回 done by its 回目's first line only: 卷一 holds ten 回 (2026-09-30).
      if (short && st === 'done') return { title: huiLabel(content, p.hui, lang, 'head') ?? title, state: st, recap: lines.slice(ch.id === tail && last ? -3 : -1) };
      return {
        id: p.hui ?? ch.id, chapter: ch.id, title, state: st, ...(i === 0 ? { intro: pick(ch.intro, lang) } : {}), recap: lines,
        ...(last ? { mystery: mysteryOf(ch, state, lang) } : {}), ...(st === 'current' ? { now: nowOf(content, state, ctx.now) } : {}),
      };
    });
  });
  const recalled = hasCompanion(state) ? recalledOf(content, state).map(r => r.line) : null;
  const her = short && recalled ? recalled.slice(-3) : recalled;
  const people = peopleOf(content, state);
  return {
    state: null,
    result: {
      ok: true, cauldrons: short ? cauldrons.map(({ province, state: st }) => ({ province, state: st })) : cauldrons, found: cauldrons.filter(c => c.state === 'found').length, chapters,
      people: short ? people.map(({ name, kind }) => ({ name, kind })) : people,
      her, open: cur?.mystery ? [mysteryOf(cur, state, lang)] : [], ending: endingOf(content, state),
      ...(short ? {} : { cards: cardBook(content, state) }),
      // 银月的记忆 — the album in 录: eight frames, lit one by one (rules/memories.mjs).
      ...(short ? {} : { album: albumOf(content, state) }),
      // 图鉴 — the entries met (ids; the page draws them from the codex, unmet ones as empty slots).
      ...(short || !content.codex ? {} : { codex: seenOf(content, state, sceneOf(content, state)) }),
      // 所见 — what was looked at along the way, scene by scene, and what was passed by (rules/examine.mjs).
      ...(short || !state.looked?.length ? {} : { seen: seenLog(content, state) }),
    },
  };
}

/* ── 前情提要 ── */

/* Owed? At a sitting's start, with a story to tell: Ling's first Look of a
   chat session (`session`, LINGGEN_SESSION_ID — remembered on the save, so
   once a session), or the first call after RECAP_AWAY since the save last
   changed. Marked on the state in place (rules.mjs keeps it; never logged,
   so Undo still takes back the last real move). Answers true when it wrote. */
export function owesRecap(state, now, session = null) {
  if (!state?.updated) return false;
  const r = state.recap ?? {}, lived = (state.done_scenes ?? []).length > 0;
  if (session && r.session !== session) {
    state.recap = { ...r, session, ...(lived && !r.owed ? { owed: now.toISOString() } : {}) };
    return true;
  }
  if (!lived) return false;
  if (r.owed && now - new Date(r.owed) < RECAP_STALE) return false;
  const last = Math.max(new Date(state.updated).getTime(), r.told ? new Date(r.told).getTime() : 0);
  if (now - last < RECAP_AWAY) {
    if (r.owed) { delete state.recap.owed; return true; }
    return false;
  }
  if (r.owed) return false;
  state.recap = { ...r, owed: now.toISOString() };
  return true;
}

/* Look's 前情提要 while owed: the last few lines the player lived, and the question still open. */
export function recapLook(content, state) {
  if (!state.recap?.owed || content.world.made) return {};
  const lines = [];
  for (const sid of state.done_scenes ?? []) {
    const r = sceneIndex(content).get(sid)?.scene.recap;
    if (r) lines.push(fill(pick(r, state.lang), state, content));
  }
  if (!lines.length) return {};
  const cur = currentOf(content, state);
  return { recap_due: true, recap: { lines: [...new Set(lines)].slice(-RECAP_LINES), ...(cur ? { chapter: chapterLabel(content, state, cur, state.lang, 'head'), mystery: mysteryOf(cur, state) } : {}) } };
}

/* A 回's close — 「第二回 · 完」, its 回目 and the 回 now beginning — on the
   first scene of the next (hui.mjs huiEnded: derived, never flagged). And a
   chapter's (chapter.json `close`), while it is over and the next one waits:
   「第三回 · 完」 for the 回 it ended on, one line of what THIS player did —
   each `did` part whose `if` holds on the save (none: always), joined — and
   the teaser (his, 2026-09-29). Its id is the 回's, so the page puts either away once. */
const CLOSE_IF = {
  cast: (s, id) => (s.cast ?? []).includes(id), //                      walks with him
  owed: (s, who) => (s.ledger ?? []).some(e => e.who === who && e.kind === '恩'), // an 恩 in the 恩仇簿
  not: (s, c) => !closeHolds(s, c),
};
const closeHolds = (s, c) => Object.entries(c ?? {}).every(([k, v]) => CLOSE_IF[k]?.(s, v) ?? false);
export function closeOf(content, state) {
  const ch = content.chapters[state.chapter], c = ch?.close, lang = state.lang;
  if (inMade(state) || content.world.made) return null;
  const turned = huiEnded(content, state);
  if (turned) return { id: turned, title: endLabel(content, turned, lang), huimu: pick(huiOf(content, turned).huimu, lang), next: huiLabel(content, huiNow(content, state), lang, 'head') };
  if (!c || state.scene || !(state.ended ?? []).includes(ch.id)) return null;
  const parts = (c.did ?? []).filter(d => closeHolds(state, d.if)).map(d => fill(pick(d, lang), state, content));
  const did = parts.length ? parts.join(lang === 'zh' ? '，' : ', ') + (lang === 'zh' ? '。' : '.') : '';
  const hui = huiNow(content, state);
  return { id: hui ?? ch.id, title: endLabel(content, hui, lang) ?? pick(c.title, lang) ?? pick(ch.title, lang), ...(did ? { did } : {}), teaser: pick(c.teaser, lang) };
}

/* Look's chapter, named as the book names it — the 回 it stands in
   (「卷一 · 第五回　漏勺夜半通三关」, hui.mjs) — with its intro while it has only
   just begun (no scene of it passed yet) — the stage raises its title card
   then — its close once a 回 or it is over (closeOf), and the ending once reached. */
export function chapterLook(content, state) {
  const ch = content.chapters[state.chapter];
  const fresh = !inMade(state) && !content.world.made && ch?.intro && !(state.ended ?? []).includes(ch.id)
    && !(state.done_scenes ?? []).some(id => ch.scenes?.[id]);
  const ending = endingOf(content, state), close = closeOf(content, state);
  return {
    chapter: { id: ch.id, title: chapterLabel(content, state, ch, state.lang, 'head'), ...(huiNow(content, state) ? { hui: huiNow(content, state) } : {}), ...(fresh ? { fresh: true, intro: pick(ch.intro, state.lang) } : {}), ...(close ? { close } : {}) },
    ...(ending ? { ending: { id: ending.id, title: ending.title } } : {}),
  };
}

/* ── Story nodes: the moments the page raises ── */

/* A scene passed, a chapter closed (a cauldron found), a memory come back —
   told as the facts, so 银月 and Ling can talk over what it means. `before`
   is the save as the move found it, `s` as it leaves it. Kept on the save
   (`node`) so the page sees it on its next Look, whoever moved. */
export function storyNode(content, before, s, scene, exit, now) {
  const lang = s.lang, ch = content.chapters[before.chapter];
  const had = new Set(recalledOf(content, before).map(r => r.id));
  const memory = recalledOf(content, s).filter(r => !had.has(r.id)).map(r => r.line);
  const next = s.chapter !== before.chapter && content.chapters[s.chapter] && !(s.ended ?? []).includes(s.chapter) ? content.chapters[s.chapter] : null;
  const ended = exit.ends && !(before.ended ?? []).includes(exit.ends);
  const kind = !ended ? 'scene' : holdsCauldron(ch) ? 'cauldron' : 'chapter';
  const found = kind === 'cauldron' ? cauldronsFound(content, s) : 0;
  // The ③ ⑥ ⑨ cauldron gives her an ability and takes a reflection
  // (rules/companion.mjs § Beside her): she hears it as facts, once she walks with him.
  const gift = found && hasCompanion(s) ? giftAt(content, found) : null;
  const unease = ended ? uneaseAt(content, s, ch.id) : null;
  const node = {
    kind, at: now.toISOString(),
    chapter: { id: ch.id, title: huiLabel(content, scene.hui, lang) ?? pick(ch.title, lang) },
    ...(scene.recap ? { recap: fill(pick(scene.recap, lang), s, content) } : {}),
    ...(ch.mystery ? { mystery: mysteryOf(ch, s, lang) } : {}),
    ...(kind === 'cauldron' ? { found } : {}),
    ...(gift ? { gift: { name: pick(gift.name, lang), does: pick(gift.does, lang), cost: costKnown(content, s) } } : {}),
    ...(memory.length ? { memory } : {}),
    ...(unease ? { unease } : {}),
    ...(ended && ch.ending ? { ending: pick(ch.ending.title, lang) } : {}),
    // An exit's `doors` (息壤): the five 灵根 opening one by one, a line each — the page's moment.
    ...(exit.doors ? { doors: exit.doors.map(d => ({ el: d.el, line: fill(pick(d, lang), s, content) })) } : {}),
    // An exit's `setpiece` (大场面, setpiece.js): the whole stage plays it before the node's other moments.
    ...(exit.setpiece ? { setpiece: exit.setpiece } : {}),
    ...(next ? { next: { id: next.id, title: chapterLabel(content, s, next, lang), mystery: mysteryOf(next, s, lang) } } : {}),
  };
  return node;
}

/* ── Her price, showing — once, as a chapter ends (redesign-v2 § 六 item 3) ──
   Hanli, 2026-09-25: 小异样太难看出来, 给大异样. From the chapter she realizes
   it (companion.json `secret.realized`) to the one she tells it (`secret.unease`), each chapter
   ended shows the price on her, big: the stage plays `show`, she hears `fact`
   (what just happened to her, what she must not yet say) and says it in her
   own words, aloud; Ling may write `ling`, one sentence of what she does.
   Only once she walks with the player; marked on the save (`unease`), so it
   is never handed over twice. */
export function uneaseAt(content, s, chapter) {
  const c = companionOf(content);
  if (!c || !hasCompanion(s) || (s.unease ?? []).includes(chapter)) return null;
  const lore = content.lore?.id === c.id ? content.lore : null;
  const u = lore?.secret?.unease?.[chapter];
  if (!u) return null;
  s.unease = [...(s.unease ?? []), chapter];
  const lang = s.lang, name = s.name || (lang === 'zh' ? '你一路叫惯的那个称呼' : 'the name you always call them');
  return { chapter, show: u.show, fact: pick(u.fact, lang).replaceAll('{name}', name), ling: pick(u.ling, lang) };
}

/* What she knows of a gift's price — a reflection of hers, taken with the
   cauldron (companion.json `secret`): not yet ('unknown'), known and kept
   from the player ('kept'), or told ('told'). */
function costKnown(content, s) {
  const sec = content.lore?.id === companionOf(content)?.id ? content.lore.secret : null, ended = new Set(s.ended ?? []);
  return !sec || !ended.has(sec.realized) ? 'unknown' : ended.has(sec.told) ? 'told' : 'kept';
}

/* She joins, and what the cauldrons already gave back comes to her at once. */
export function joinNode(content, s, now) {
  const memory = recalledOf(content, s).map(r => r.line);
  return memory.length ? { kind: 'memory', at: now.toISOString(), memory } : null;
}

/* ── Her beat — a line the story wrote for her, said by her ──
   Hanli, 2026-09-24: 银月 writes her own words; Ling writes the scene only.
   A move that plays a line of hers — an exit's beat, or the scene it walks
   into — once she walks with the player hands it over as facts: what
   happened and the authored line as her reference (she
   says it her way, same meaning). Before she is found the line is its
   `alone` narration, Ling's as ever (look.mjs `spoken`). */
export function herBeat(content, s, { id, lines, happened = [] }) {
  const c = companionOf(content);
  if (!c || !herAwake(s)) return null;
  const lang = s.lang, sep = lang === 'zh' ? '' : ' ';
  const said = (lines ?? []).filter(l => l.who === c.id).map(l => fill(pick(l.text, lang), s));
  if (!said.length) return null;
  const what = happened.filter(Boolean).join(sep);
  return { id, facts: { ...(what ? { happened: what } : {}), line: said.join(sep) } };
}
/* The page hears her beat on its next Look, with the move's story node when
   there is one (one moment, one line from her), else as a node of its own. */
export const withHerBeat = (node, her, now) => (!her ? node : node ? { ...node, her_beat: her } : { kind: 'beat', at: now.toISOString(), her_beat: her });

/* A refusal of hers — the rules turn the player back with a word the story
   wrote for her (Move's `too-hard`): once she walks with the player it is her
   beat, facts only — what happened, where fits, her line as reference. A
   refusal writes nothing, so the command line keeps it on the save as a
   `beat` node, unlogged (rules.mjs), for the page to raise. Before she is
   found: null, and the refusal's own words are Ling's. */
export function refusalBeat(content, s, { id, happened, fitting, line }) {
  if (!companionOf(content) || !herAwake(s)) return null;
  return { id, facts: { ...(happened ? { happened } : {}), ...(fitting ? { fitting } : {}), line } };
}

/* A scene walked into (Move, Go) with a line of hers in it: her beat, kept
   on the save for the page. Null when she has none there. */
export function enteredBeat(content, s, scene, now) {
  const her = scene && herBeat(content, s, { id: scene.id, lines: scene.lines, happened: [fill(pick(scene.setup, s.lang), s, content)] });
  if (her) s.node = withHerBeat(null, her, now);
  return her;
}

/* Look's `story_node`: the last node while it is fresh (the page's; Ling has it in the result). */
const NODE_FRESH = 30 * 60000;
export const nodeLook = (state, now) => (state.node && now - new Date(state.node.at) < NODE_FRESH ? { story_node: state.node } : {});
