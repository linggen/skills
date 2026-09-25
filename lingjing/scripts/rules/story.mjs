// rules/story.mjs — 九鼎录: the spine as a book, the 前情提要, and the story's nodes.
// Part of the rules engine; rules.mjs is its one door.
//
// His (2026-09-24): 「主线剧情要能让用户查看…我现在也对主线故事没有太深印象，
// 这点要强化，让银月和Ling多讨论剧情」 (redesign-v2 § 六). The words are all
// authored — each scene's `recap`, each chapter's `intro` and `mystery` — and
// the rules only choose which of them the player has earned: what was DONE,
// in the order it was done. Nothing not yet reached leaves this file: a
// chapter ahead is a dark cauldron with its province and nothing more.
import { CAST } from '../content.mjs';
import { dayKey, fill, pick } from '../state.mjs';
import { cauldronsFound, companionOf, giftAt, hasCompanion, recalledOf } from './companion.mjs';
import { threadOf } from './errands.mjs';
import { cardBook } from './cards.mjs';
import { atScene, creatureOf, inMade, sceneOf } from './world.mjs';

const HOUR = 3600000;
/* 前情提要 is owed after this long away — or on a new day after RECAP_NEW_DAY
   (a midnight between two sittings an hour apart is not being away); told,
   it is not owed again until the player has been away that long once more. */
const RECAP_AWAY = 12 * HOUR;
const RECAP_NEW_DAY = 3 * HOUR;
/* Owed and never told (the player played on the page alone) — let it go. */
const RECAP_STALE = 6 * HOUR;
const RECAP_LINES = 3;

const byId = (a, b) => a.id.localeCompare(b.id);
const chaptersOf = content => Object.values(content.chapters).sort(byId);
/* A chapter with a cauldron in it: every chapter of the spine but a corridor (the prologue). */
const holdsCauldron = ch => !ch.corridor;

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
const recapLines = (content, state, ch) => passed(content, state, ch).map(sc => sc.recap).filter(Boolean).map(r => fill(pick(r, state.lang), state));

/* Where the current chapter stands this moment: the scene's place when one is
   being played, else the road the thread names. */
function nowOf(content, state, now) {
  if (inMade(state)) return null;
  const scene = sceneOf(content, state);
  if (scene && atScene(content, state)) return fill(pick(scene.place, state.lang), state);
  const t = threadOf(content, state, now);
  return t?.text ?? t?.title ?? null;
}

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
    for (const id of at?.scene.cast ?? []) if (id !== her && id !== 'ling') add(id, nameOf(content, id, lang), 'story', pick(at.chapter.title, lang));
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
  // Ling's short book: a chapter ended is its title and closing line — the
  // last one, with nothing after it, its last three — and her last three memories.
  const tail = !cur && done.at(-1)?.id;
  const chapters = [
    ...done.map(ch => {
      const lines = recapLines(content, state, ch), title = pick(ch.title, lang);
      if (short) return { title, state: 'done', recap: lines.slice(ch.id === tail ? -3 : -1) };
      return { id: ch.id, title, state: 'done', intro: pick(ch.intro, lang), recap: lines, mystery: pick(ch.mystery, lang) };
    }),
    ...(cur ? [{ id: cur.id, title: pick(cur.title, lang), state: 'current', intro: pick(cur.intro, lang), recap: recapLines(content, state, cur), mystery: pick(cur.mystery, lang), now: nowOf(content, state, ctx.now) }] : []),
  ];
  const recalled = hasCompanion(state) ? recalledOf(content, state).map(r => r.line) : null;
  const her = short && recalled ? recalled.slice(-3) : recalled;
  const people = peopleOf(content, state);
  return {
    state: null,
    result: {
      ok: true, cauldrons: short ? cauldrons.map(({ province, state: st }) => ({ province, state: st })) : cauldrons, found: cauldrons.filter(c => c.state === 'found').length, chapters,
      people: short ? people.map(({ name, kind }) => ({ name, kind })) : people,
      her, open: cur?.mystery ? [pick(cur.mystery, lang)] : [], ending: endingOf(content, state),
      ...(short ? {} : { cards: cardBook(content, state) }),
    },
  };
}

/* ── 前情提要 ── */

/* Owed? Away long enough since the save last changed, with a story to tell.
   Marked on the state in place (rules.mjs keeps it; never logged, so Undo
   still takes back the last real move). Answers true when newly marked. */
export function owesRecap(state, now) {
  if (!state?.updated || !(state.done_scenes ?? []).length) return false;
  const r = state.recap ?? {};
  if (r.owed && now - new Date(r.owed) < RECAP_STALE) return false;
  const last = Math.max(new Date(state.updated).getTime(), r.told ? new Date(r.told).getTime() : 0);
  const away = now - last;
  const newDay = dayKey(new Date(last)) !== dayKey(now);
  if (!(away >= RECAP_AWAY || (newDay && away >= RECAP_NEW_DAY))) {
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
    if (r) lines.push(fill(pick(r, state.lang), state));
  }
  if (!lines.length) return {};
  const cur = currentOf(content, state);
  return { recap_due: true, recap: { lines: [...new Set(lines)].slice(-RECAP_LINES), ...(cur ? { chapter: pick(cur.title, state.lang), mystery: pick(cur.mystery, state.lang) } : {}) } };
}

/* Look's chapter, with its intro while it has only just begun (no scene of it
   passed yet) — the stage raises its title card then — and the ending once reached. */
export function chapterLook(content, state) {
  const ch = content.chapters[state.chapter];
  const fresh = !inMade(state) && !content.world.made && ch?.intro && !(state.ended ?? []).includes(ch.id)
    && !(state.done_scenes ?? []).some(id => ch.scenes?.[id]);
  const ending = endingOf(content, state);
  return {
    chapter: { id: ch.id, title: pick(ch.title, state.lang), ...(fresh ? { fresh: true, intro: pick(ch.intro, state.lang) } : {}) },
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
  const node = {
    kind, at: now.toISOString(),
    chapter: { id: ch.id, title: pick(ch.title, lang) },
    ...(scene.recap ? { recap: fill(pick(scene.recap, lang), s) } : {}),
    ...(ch.mystery ? { mystery: pick(ch.mystery, lang) } : {}),
    ...(kind === 'cauldron' ? { found } : {}),
    ...(gift ? { gift: { name: pick(gift.name, lang), does: pick(gift.does, lang), cost: costKnown(content, s) } } : {}),
    ...(memory.length ? { memory } : {}),
    ...(ended && ch.ending ? { ending: pick(ch.ending.title, lang) } : {}),
    ...(next ? { next: { id: next.id, title: pick(next.title, lang), mystery: pick(next.mystery, lang) } } : {}),
  };
  return node;
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
   happened, what she recalls, and the authored line as her reference (she
   says it her way, same meaning). Before she is found the line is its
   `alone` narration, Ling's as ever (look.mjs `spoken`). */
export function herBeat(content, s, { id, lines, happened = [], scenes = [] }) {
  const c = companionOf(content);
  if (!c || !hasCompanion(s)) return null;
  const lang = s.lang, sep = lang === 'zh' ? '' : ' ';
  const said = (lines ?? []).filter(l => l.who === c.id).map(l => fill(pick(l.text, lang), s));
  if (!said.length) return null;
  const lore = content.lore?.id === c.id ? content.lore : null;
  const memory = lore?.thread?.find(e => e.memory?.scene && scenes.some(sc => sc?.id === e.memory.scene));
  const what = happened.filter(Boolean).join(sep);
  return { id, facts: { ...(what ? { happened: what } : {}), ...(memory ? { recalls: pick(memory.knows, lang) } : {}), line: said.join(sep) } };
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
  if (!companionOf(content) || !hasCompanion(s)) return null;
  return { id, facts: { ...(happened ? { happened } : {}), ...(fitting ? { fitting } : {}), line } };
}

/* A scene walked into (Move, Go) with a line of hers in it: her beat, kept
   on the save for the page. Null when she has none there. */
export function enteredBeat(content, s, scene, now) {
  const her = scene && herBeat(content, s, { id: scene.id, lines: scene.lines, happened: [fill(pick(scene.setup, s.lang), s)], scenes: [scene] });
  if (her) s.node = withHerBeat(null, her, now);
  return her;
}

/* Look's `story_node`: the last node while it is fresh (the page's; Ling has it in the result). */
const NODE_FRESH = 30 * 60000;
export const nodeLook = (state, now) => (state.node && now - new Date(state.node.at) < NODE_FRESH ? { story_node: state.node } : {});
