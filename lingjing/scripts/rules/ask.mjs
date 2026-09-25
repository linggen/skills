// rules/ask.mjs — The choice for AskUser on every answer, and what a tap asks next.
// Part of the rules engine; rules.mjs is its one door.
import { stageCards, stageHolds } from '../stage.mjs';
import { normalizeAnswer, pick } from '../state.mjs';
import { companionOf, questBrief, riddleWaiting } from './companion.mjs';
import { directorBrief, filler, FILLERS, offersOf, waypointOf, wayBack, workOf } from './errands.mjs';
import { onStage, sceneBrief, shownHere, stageAt } from './look.mjs';
import { meetBrief } from './road.mjs';
import { taleBrief } from './tale.mjs';
import { atScene, placeBrief } from './world.mjs';

/* The choice, ready for AskUser, on every answer the rules give: the scene's
   buttons while one runs (a riddle waiting is the question, the other
   buttons the options), the director's choice when the world is open. The
   model copies it and composes nothing — a rule in the prompt alone was not
   enough (2026-09-16, gpt-5.6-terra: Look, Show, narration, silence). */
export function askOf(content, state, ctx, result = {}, ungated = false) {
  const zh = state.lang === 'zh';
  // In 闭关 the world holds still: the one way on is 出关, on the stage's card.
  if (state.seclusion) return null;
  const second = filler(content, state, ctx.said);
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
    if (options.length < 2) options.push(second);
    return { header: header(scene.place), question: asked, options };
  }
  // 去处在台上 (his ruling, 2026-09-25): the page holds the roads, the
  // errands and what waits, so the open world asks nothing in the chat —
  // a 何去何从 asked there went stale the moment he walked from the map
  // (去濮阳 still waiting in the chat at 濮阳). It is asked only when he
  // asks in words, or when the page has no way on to show (stuck).
  if (!ungated && !typed(ctx.said) && !stuck(content, state, ctx)) return null;
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
    if (road?.veiled) return null; // the page's mist, then its reveal: nothing asked in between
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

/* He asks in words where to go or what now — not any line he types (起一卦
   refused brought 何去何从 back, 2026-09-25), and never a page report. */
const WAY_ON = /去哪|往哪|何去何从|下一步|接下来|怎么走|干点啥|做什么|做点什么|有什么路|where (to|now|next)|what now|what next|which way/i;
const typed = said => { const w = String(said ?? '').trim(); return Boolean(w) && !w.startsWith('[') && WAY_ON.test(w); };
/* Stuck: nothing on the page leads on — no story road, no work, nothing
   held out here. Then, and only then, the chat puts the question. */
const stuck = (content, state, ctx) => !waypointOf(content, state, ctx)?.place && !workOf(content, state, ctx) && !stageHeld(content, state, ctx);

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
/* Something won: told in the world, in a line. Her gladness is hers — it
   arrives by itself as [Yinyue]; this text once had Ling write it as
   `**银月：**…`, against SKILL.md's law that Ling never speaks for her
   (live test, 2026-09-25). */
const CHEER = 'Something was won: tell it in the world in a line, never the numbers. Yinyue\'s words are hers and arrive by themselves — never write a line for her. ';
const THEN_CHEER = CHEER + THEN;
/* A scene just entered: Ling asked AskUser before narrating it and typed its
   options into the reply (live test, 2026-09-25). The scene first, then the question. */
const THEN_SCENE = 'A scene was entered: Show its `scene.show` cards, narrate `scene.setup` in one to three sentences and speak its `scene.lines`, then AskUser exactly `ask` — never the options in your own words. The reply ends only there.';
const entered = r => Boolean(r?.ok && r.scene && r.summarize);
const won = r => {
  const p = r?.paid;
  if (!r?.ok || r.sold || r.bought) return false;
  return Boolean(r.breakthrough || r.learned?.length || p?.cast || p?.item || p?.levels?.length || (p?.progress ?? 0) > 0 || (p?.wealth ?? 0) > 0);
};
const THEN_CALL = 'The search has just opened: say `quest.line` in the world, in a line of its own, before the question. ';
/* No question this time: the stage has the thing in front of him, or nothing
   has changed since the last one. End on words — never invent a question the
   rules withheld (his law, 2026-09-18). */
const THEN_VEIL = 'Something waits on this road (`place.meet`, still veiled): the page plays a mist and reveals it itself in a moment, then tells you `[scene] arrived` — Look then, and tell what was revealed in a line or two, following its `then`. Now never call Meet reveal, never build toward it and never name it: end on the place, and do NOT call AskUser.';
/* A 抉择 is Ling's to write — the page never reveals it (road.mjs: revealed
   bare it closes as nothing); her Meet offer lifts the mist. */
const THEN_TRIAL = 'A 抉择 waits on this road (`place.meet` kind trial, veiled): you write it now — guide `trial`: set the moment in two or three lines, then Meet {action: offer} with the ways (it reveals), and stop.';
const THEN_QUIET = 'No question this time — the stage holds what is before him, or he has already been asked here. End on your words: name a way on in the line if it is worth naming, and do NOT call AskUser.';
export const thenFor = (result, ask = undefined) => (result?.place?.meet?.veiled ? (result.place.meet.kind === 'trial' ? THEN_TRIAL : THEN_VEIL) : (result?.quest?.say ? THEN_CALL : '')
  + (ask === null ? THEN_QUIET : entered(result) ? (won(result) ? CHEER : '') + THEN_SCENE : won(result) ? THEN_CHEER : THEN));
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
  divine: () => 'Divine',
  // The one question before what lets the journey go (rules/confirm.mjs).
  restart: () => 'Restart',
  undo: () => 'Undo',
  load: o => `Load {id: ${o.load}}`,
  forget: o => `Forget {id: ${o.forget}}`,
};
// 去X / Go to X typed — a place asked for in words (a chip on the map is the page's own Move now).
const GO = /^(去|go to\s+)/i;
// The day's reading asked for in words — typed, 起一卦 / 算一卦 / 问卦. Look
// alone let the scene's question win: 起一卦 tapped twice, 何去何从 asked twice
// (2026-09-17).
const CAST_WORDS = /起一?卦|算一?卦|问卦|\bcast the coins\b|\bdivine\b/i;
export function tapThen(ask, said) {
  const words = String(said ?? '').trim();
  if (CAST_WORDS.test(words) && !ask?.options?.some(o => o.label === words)) {
    return 'The player asks for the day\'s reading (问卦) — call Divine now; this Look changed nothing. The card shows the cast and Yinyue reads it: end on a line of your own, and ask nothing.';
  }
  const options = words ? ask?.options ?? [] : [];
  const option = options.find(o => o.label === words) ?? options.find(o => o.move && o.label === words.replace(GO, ''));
  const kind = option && Object.keys(TAPS).find(k => option[k]);
  if (!kind) return null;
  return `The player tapped "${option.label}" — call ${TAPS[kind](option)} now; this Look changed nothing. Then follow that tool's own \`then\`: AskUser its \`ask\` when it carries one, and end on your words when it is null.`;
}

export { withAsk };
