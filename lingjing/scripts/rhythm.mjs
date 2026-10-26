// rhythm.mjs — 「每看一会儿剧情就要有游戏可以玩」 (Hanli, 2026-10-14): along a
// chapter's main line, the book read between two things the hands do must not
// run long. A warning, not an error, while the 卷 is being filled in: the lint
// (content.mjs `warnings`) lists every stretch over the cap, and the test logs it.
//
// The main line: the chapter's first scene, then each scene's first exit that
// goes on (`next` or `ends` — the book's own; a `stay` or a branch listed after
// it is not the line). The characters counted are the zh passages the dialogue
// box plays there — a scene's `story`, the exit's `story` — with the book's
// marks and every space taken out — the book's full text (2026-10-26: no cut).
//
// A play beat: a game on the stage at a scene. A fight (`show`n duel) stands
// over the box as the scene's passage begins (queue.js EARLY), so it comes
// before that passage; a board waits for the passage that leads into it
// (2026-10-14, ae7fa2ff) — after the scene's `story`, and the rest of a split
// passage (`story_after`) is read after it; a scene's second board
// (00-halfyear: the boards play in `show` order) comes after `story_after`. On
// the exit taken, a fight or board (`game`), a riddle (`key`), a look that must
// find something first (`needs.seen`), or the 突破 card — before the exit's
// passage; and a set piece (`setpiece`), which plays after it. A set piece laid
// under a paragraph of a passage (`{景=id}`, rules/tell.mjs) is a beat too: the
// box stops on that paragraph while it plays, so the count resets after it.

export const RHYTHM_CAP = 2200; // zh characters between two play beats — about five minutes at 450 字/min (2026-10-26, was 1500)

const strip = t => String(t ?? '')
  .replace(/\[([^\]]*)\]\{[^}]*\}/g, '$1')
  .replace(/\{[^}\n]*\}/g, '')
  .replace(/\*\*|⟪|⟫/g, '')
  .replace(/\s+/g, '');
export const storyChars = pair => [...strip(pair?.zh)].length;
/* A passage cut at its `{景=id}` paragraphs: the characters read before each
   piece (that paragraph included), then the rest. One part = no piece in it. */
const PIECE = /\{景=([a-z]+)\}/;
export function storyParts(pair) {
  const parts = [{ chars: 0 }];
  for (const para of String(pair?.zh ?? '').split(/\n+/)) {
    parts[parts.length - 1].chars += [...strip(para)].length;
    const m = para.match(PIECE);
    if (m) { parts[parts.length - 1].piece = m[1]; parts.push({ chars: 0 }); }
  }
  return parts;
}

const showsGame = card => card?.card === 'board' || card?.card === 'duel';
/* A game stands on the stage at this scene. */
export const sceneBeat = scene => (scene.show ?? []).some(showsGame) || (scene.exits ?? []).some(e => e.needs?.task);
/* The scene's boards, in the order they are played (`show`, then any an exit waits on). */
export const boardsOf = scene => [...new Set([...(scene.show ?? []).filter(c => c?.card === 'board').map(c => c.id), ...(scene.exits ?? []).map(e => e.needs?.task).filter(Boolean)])];
const duelAt = scene => (scene.show ?? []).some(c => c?.card === 'duel');
/* The exit taken is itself play, before its passage. */
export const exitBeat = exit => Boolean(exit.game || exit.key || exit.needs?.seen || exit.breakthrough);
/* A set piece plays after the exit's passage. */
export const pieceBeat = exit => Boolean(exit.setpiece);

/* The exit the main line takes out of a scene. */
export const mainExit = scene => (scene.exits ?? []).find(e => !e.stay && (e.next || e.ends)) ?? null;

/* The exit taken, as one play beat before its passage: the first of these it carries (one beat, however many). */
const EXIT_KINDS = [
  ['fight', e => e.game?.kind === 'duel', e => e.game.creature ?? e.game.id],
  ['board', e => e.game, e => e.game.id],
  ['riddle', e => e.key, e => [e.key].flat()[0]],
  ['seen', e => e.needs?.seen, e => [e.needs.seen].flat()[0]],
  ['breakthrough', e => e.breakthrough, () => 'breakthrough'],
];
const exitKind = exit => EXIT_KINDS.find(([, has]) => has(exit));
const pieceId = sp => (typeof sp === 'string' ? sp : sp?.id ?? null);
const duelId = scene => { const d = (scene.show ?? []).find(c => c?.card === 'duel'); return d?.creature ?? d?.id ?? null; };

/* A chapter's main line as the player meets it, in order (Hanli 10-22: 「让我在游戏大厅里可以看到玩家游戏的节奏」):
   `{read, scene}` — the zh characters of one passage (or of one part of it, cut at a `{景=id}` paragraph) — and the
   beats between, `{kind, id, scene, exit?, at}`: kind board · fight · riddle · seen · breakthrough · piece; `at`
   names the beat as the rhythm lint does. stretchesOf folds it; the 游戏厅's 节奏 view (tools/arcade-rhythm.mjs) draws it. */
export function timelineOf(chapter) {
  const scenes = chapter.scenes ?? {}, out = [], seen = new Set();
  const beat = (kind, id, scene, at, exit) => out.push({ kind, id, scene, ...(exit ? { exit } : {}), at });
  const read = (pair, scene, at) => {
    for (const p of storyParts(pair)) {
      if (p.chars) out.push({ read: p.chars, scene });
      if (p.piece) beat('piece', p.piece, scene, `${at}{景=${p.piece}}`);
    }
  };
  let id = chapter.first_scene;
  while (id && scenes[id] && !seen.has(id)) {
    seen.add(id);
    const scene = scenes[id], boards = boardsOf(scene);
    if (duelAt(scene) && !boards.length) beat('fight', duelId(scene), id, id);
    read(scene.story, id, id);
    if (boards.length) beat('board', boards[0], id, id);
    read(scene.story_after, id, id);
    for (const b of boards.slice(1)) beat('board', b, id, `${id}:${b}`);
    const exit = mainExit(scene);
    if (!exit) break;
    const at = `${id}/${exit.id}`, kind = exitKind(exit);
    if (kind) beat(kind[0], kind[2](exit), id, at, exit.id);
    read(exit.story, id, at);
    if (pieceBeat(exit)) beat('piece', pieceId(exit.setpiece), id, at, exit.id);
    id = exit.next;
  }
  return out;
}

/* A timeline folded into stretches: the characters read between two beats, each beat named by its `at`. */
export function foldStretches(timeline) {
  const out = [];
  let from = 'start', chars = 0;
  for (const it of timeline) {
    if (it.read) { chars += it.read; continue; }
    out.push({ from, to: it.at, chars });
    from = it.at; chars = 0;
  }
  out.push({ from, to: 'end', chars });
  return out;
}

/* A chapter's main line as stretches: each the characters read between two beats. */
export const stretchesOf = chapter => foldStretches(timelineOf(chapter));

/* Every stretch over the cap, as warning lines, chapter by chapter. */
export function rhythm(content, { cap = RHYTHM_CAP, chapters = null } = {}) {
  const warn = [];
  for (const ch of Object.values(content.chapters ?? {})) {
    if (chapters && !chapters.includes(ch.id)) continue;
    for (const s of stretchesOf(ch)) if (s.chars > cap) warn.push(`${ch.id}: ${s.from} → ${s.to}: ${s.chars} characters without play (cap ${cap})`);
  }
  return warn;
}
