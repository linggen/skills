// rules/ask.mjs — The choice for AskUser on every answer, and what a tap asks next.
// Part of the rules engine; rules.mjs is its one door.
import { stageCards, stageHolds } from '../stage.mjs';
import { normalizeAnswer, pick } from '../state.mjs';
import { companionOf, questBrief, riddleWaiting } from './companion.mjs';
import { directorBrief, filler, FILLERS, meetBrief, offersOf, wayBack } from './errands.mjs';
import { onStage, sceneBrief, shownHere, stageAt } from './look.mjs';
import { taleBrief } from './tale.mjs';
import { atScene, placeBrief } from './world.mjs';

/* The choice, ready for AskUser, on every answer the rules give: the scene's
   buttons while one runs (a riddle waiting is the question, the other
   buttons the options), the director's choice when the world is open. The
   model copies it and composes nothing — a rule in the prompt alone was not
   enough (2026-09-16, gpt-5.6-terra: Look, Show, narration, silence). */
export function askOf(content, state, ctx, result = {}, ungated = false) {
  const zh = state.lang === 'zh';
  const yinyue = filler(content, state, ctx.said);
  // Her riddle, while it waits, is the question — wherever the player stands.
  const her = companionOf(content);
  if (her && riddleWaiting(state, ctx.now)) {
    const key = state.companion.riddle.key, riddle = content.riddles[state.lang].riddles[key];
    const tried = new Set((state.companion.riddle.tried ?? []).map(normalizeAnswer));
    const where = atScene(content, state) ? sceneBrief(content, state, ctx.now)?.place : placeBrief(content, state, ctx.now)?.name;
    return {
      header: String(where ?? ''), question: riddle.q,
      options: [
        ...riddle.choices.filter(a => !tried.has(normalizeAnswer(a))).map(a => ({ label: a, ring: true, answer: a })),
        { label: zh ? '先不答' : 'Not yet', look: true },
      ],
    };
  }
  const road = meetBrief(content, state, ctx.now);
  if (road?.kind === 'riddle' && !road.veiled && !atScene(content, state)) {
    return {
      header: String(placeBrief(content, state, ctx.now)?.name ?? ''), question: road.riddle,
      options: [...road.choices.map(c => ({ label: c, meet: 'answer', answer: c })), { label: zh ? '不答，赶路' : 'Walk on', meet: 'pass' }],
    };
  }
  const header = s => String(s ?? '');
  const question = zh ? '何去何从？' : 'What now?';
  if (result.refused === 'needs-ask') {
    // 所问何事: the cast is a question held in mind — what it does, it does to that.
    const book = content.hexagrams;
    const where = atScene(content, state) ? sceneBrief(content, state, ctx.now)?.place : placeBrief(content, state, ctx.now)?.name;
    return {
      header: header(where), question: zh ? '所问何事？' : 'What do you ask about?',
      options: [...Object.keys(book.effects).map(id => ({ label: pick(book.asks[id], state.lang), divine: id })), { label: zh ? '先不问' : 'Not now', look: true }],
    };
  }
  if (atScene(content, state)) {
    const scene = sceneBrief(content, state, ctx.now);
    // A creature that withdrew today is not offered again until tomorrow — as
    // at its haunt; asked anyway, the same refusal came back each time
    // (2026-09-17: 降妖 · 五行 tapped three times at 蓬莱).
    const gone = new Set(scene.exits.filter(e => (e.withdrawn && !e.won) || e.closed).map(e => e.id));
    // A breath the player cannot take yet is not a button: the way back to
    // the world is (his "way back until ready", 2026-09-17 — 化婴 offered at
    // 结丹初期, tapped, refused).
    const unready = new Set(scene.exits.filter(e => e.breakthrough && !e.breakthrough.ready).map(e => e.id));
    // One clickable place for one thing (his law, 2026-09-17): an exit whose
    // game is played on its own card — a bout, a board — is not asked here
    // too; winning it moves the story by itself.
    const played = new Set(scene.exits.filter(e => e.game && !e.won).map(e => e.id));
    let options = scene.buttons.filter(b => !gone.has(b.id) && !unready.has(b.id) && !played.has(b.id)).map(b => ({ label: b.label, exit: b.id }));
    const back = unready.size ? wayBack(content, state, ctx.now) : null;
    // Named by the place it walks to — the story never spoke of leaving for
    // any other world (his "why now return to 人间", 2026-09-17).
    if (back) options.push({ label: zh ? `先回${pick(back.name, 'zh')}` : `Back to ${pick(back.name, 'en')} for now`, move: back.id });
    let asked = question;
    // A riddle on the table stays the question for every answer after it —
    // a word to Yinyue, a Look — so no screen offers the question the player
    // already answered (2026-09-17: 读封 tapped, Ling stopped on the riddle,
    // the stage offered 读封 again).
    const waiting = !result.refused && scene.exits.find(e => e.waiting);
    if (result.refused === 'needs-answer' || result.refused === 'wrong-answer' || waiting) {
      // The riddle's own answers to pick from — a tap is the answer — and a
      // way back to the scene (his "options are not related to the question").
      const riddle = waiting || scene.exits.find(e => e.riddle && (!result.exit || e.id === result.exit));
      if (riddle && !riddle.closed) {
        asked = riddle.riddle;
        const tried = new Set(riddle.tried.map(normalizeAnswer));
        options = [
          ...riddle.choices.filter(c => !tried.has(normalizeAnswer(c))).map(c => ({ label: c, exit: riddle.id, answer: c })),
          { label: zh ? '先不答' : 'Not yet', look: true },
        ];
      }
    }
    if (options.length < 2) options.push(yinyue);
    return { header: header(scene.place), question: asked, options };
  }
  // 台上有事，聊天不问去处 (his ruling, 2026-09-18). The stage was holding out a
  // 坊市 with 银月铃 on the shelf while the chat asked 何去何从 — two places
  // pulling at once, and the one he had not chosen won. So while something
  // here waits to be taken, the question stays away; the roads are still on
  // the map, in the director's brief for Ling's own line, and in anything he
  // types.
  //
  // Asked ONCE where he stands. The rules write down that they asked here
  // (`asked_at`), so a question he passed on is not put back a turn later —
  // his "I clicked skip in askuser widget in chat, it shows again". Anything
  // that MOVES the world re-arms it: a road walked, a cast thrown, a thing
  // bought. Only a bare Look, at a spot already asked, says nothing — which is
  // the difference between quiet and stuck (he cast the coins, the turn ended
  // with no way on, 2026-09-18: 「起卦完成, 任务卡住了」).
  if (!ungated) {
    if (state.fight) return null; // a fight is running: Ling advances nothing
    if (stageHeld(content, state, ctx)) return null;
    // Something moved the world — a road walked, a cast thrown, a thing
    // bought — so the question is worth putting again. Otherwise it is asked
    // only where it has not been asked yet.
    const moved = Boolean(result.director) || (ctx.verb && ctx.verb !== 'look');
    if (!moved && state.asked_at === stageAt(content, state)) return null;
  }
  const choice = directorBrief(content, state, ctx)?.choice;
  if (choice) return choice;
  return { header: header(placeBrief(content, state, ctx.now)?.name), question, options: FILLERS[zh ? 'zh' : 'en'] };
}

/* Is the stage holding something out to him? Asked of the very list that is
   drawn (stage.mjs CARD_KINDS) — this was `stageWaiting`, a list of its own,
   and every card it forgot put two things to tap on screen at once. */
function stageHeld(content, state, ctx) {
  if (atScene(content, state)) return false;
  // Only what a holding card reads — the whole Look computes the question
  // itself, and asking it here is a loop.
  const view = { quest: questBrief(content, state, ctx.now), offers: offersOf(content, state, state.lang, ctx.now), place: placeBrief(content, state, ctx.now), tale: taleBrief(content, state, ctx.now), tasks: [] };
  return stageHolds(view, stageCards(view, { focus: shownHere(content, state, view), fight: Boolean(state.fight) }));
}
const THEN = 'Now AskUser exactly `ask` — header, question, options as they are. The reply ends only there.';
/* Something won: Yinyue's own glad line closes the narration. The stage
   speaks the reply's last Yinyue line, and a scene entered on a win brings
   lines of its own — so hers comes last, or the story is what she says
   (2026-09-17: the 青鼎 rose, she spoke "我想起第三件事" and no one was glad). */
const THEN_CHEER = 'Something was won: the last line before the AskUser is Yinyue\'s own, glad for the player in her voice — `**银月：**…` / `**Yinyue:** …` — after any scene lines, never the numbers. ' + THEN;
const won = r => {
  const p = r?.paid;
  if (!r?.ok || r.sold || r.bought) return false;
  return Boolean(r.breakthrough || r.learned?.length || p?.cast || p?.item || p?.levels?.length || (p?.progress ?? 0) > 0 || (p?.wealth ?? 0) > 0);
};
const THEN_CALL = 'The search has just opened: say `quest.line` in the world, in a line of its own, before the question. ';
/* No question this time: the stage has the thing in front of him, or nothing
   has changed since the last one. End on words — never invent a question the
   rules withheld (his law, 2026-09-18). */
const THEN_VEIL = 'Something waits on this road (`place.meet`, still veiled — the stage shows only mist). Set the moment first: two or three short lines in the world that build toward it — the light, the air, a sound — and stop at the edge ("突然——"), never naming what it is. Then call Meet {action: reveal}: its answer puts the card on the stage and carries the question; follow its own `then`.';
const THEN_QUIET = 'No question this time — the stage holds what is before him, or he has already been asked here. End on your words: name a way on in the line if it is worth naming, and do NOT call AskUser.';
export const thenFor = (result, ask = undefined) => (result?.place?.meet?.veiled ? THEN_VEIL : (result?.quest?.say ? THEN_CALL : '')
  + (ask === null ? THEN_QUIET : won(result) ? THEN_CHEER : THEN));
const withAsk = (result, content, state, ctx) => ({ ...onStage(content, state, ctx, result), ...result });

/* The player's words are an option of the question on screen — a tap on a
   card arrives as words, and Look is where Ling takes them. Look names the
   one tool that option is, so the tap is done now, not asked again (seen
   2026-09-17: 蓬莱 tapped, Look, the same choice asked twice). */
const TAPS = {
  move: o => `Move {place: ${o.move}}`,
  exit: o => `Resolve {exit: ${o.exit}${o.answer ? `, answer: ${o.answer}` : ''}}`,
  ring: o => (o.answer ? `Ring {answer: ${o.answer}}` : 'Ring'),
  tame: o => `Tame {creature: ${o.tame}}`,
  tale: () => 'Tale {action: seed}, write today\'s rumor from what it hands you, then Tale {action: make}',
  turn: o => `Quest {action: turn, id: ${o.turn}}`,
  meet: o => `Meet {action: ${o.meet}${o.answer ? `, answer: ${o.answer}` : ''}}`,
  divine: o => (o.divine === true ? 'Divine' : `Divine {ask: ${o.divine}}`),
};
// 去X / Go to X typed — a place asked for in words (a chip on the map is the page's own Move now).
const GO = /^(去|go to\s+)/i;
// The day's cast asked for in words — the coins on the stage say 请银月起一卦
// (cards.js sayCast); typed, 起一卦 / 算一卦 / 问卦. Look alone let the scene's
// question win: 起一卦 tapped twice, 何去何从 asked twice (2026-09-17).
const CAST_WORDS = /起一?卦|算一?卦|问卦|\bcast the coins\b|\bdivine\b/i;
export function tapThen(ask, said) {
  const words = String(said ?? '').trim();
  if (CAST_WORDS.test(words) && !ask?.options?.some(o => o.label === words)) {
    return 'The player asks for the day\'s cast — call Divine now, with no `ask`; this Look changed nothing. Then AskUser exactly the `ask` that tool returns. The reply ends only there.';
  }
  const options = words ? ask?.options ?? [] : [];
  const option = options.find(o => o.label === words) ?? options.find(o => o.move && o.label === words.replace(GO, ''));
  const kind = option && Object.keys(TAPS).find(k => option[k]);
  if (!kind) return null;
  return `The player tapped "${option.label}" — call ${TAPS[kind](option)} now; this Look changed nothing. Then follow that tool's own \`then\`: AskUser its \`ask\` when it carries one, and end on your words when it is null.`;
}

export { withAsk };
