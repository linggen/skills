// rules/confirm.mjs — One AskUser before what lets the journey go: Restart,
// Undo, Load, Forget, and Go (a scene by id, the road skipped). Part of the rules engine; rules.mjs is its one door.
//
// The law was in the prompt only, and a live test (2026-09-25) had Ling Look
// (ask null) and Restart{} straight after — a save wiped, nothing asked; in
// another run the scene's open question won over 重来's. So the rules hold it:
//   · Look with the player's words asking for one (重来, 悔棋) carries the
//     confirmation as its `ask`, over the scene's own, and writes down that it
//     was asked (`confirm: {what, at, ask}`) — never logged, so Undo cannot
//     take the asking back;
//   · Load, Forget and Go name their target only when called, so their first call asks
//     (refused `not-confirmed` with the `ask`, the asking written down);
//   · Ling's Restart / Undo / Load / Forget / Go are refused `not-confirmed` unless
//     that confirmation was asked within CONFIRM_TTL_MS; using it clears it,
//     and 再想想 answered to Look clears it too.
// The page never runs these verbs (its map chips Move); its path (no reader)
// is never gated.
import { fill, pick } from '../state.mjs';
import { sceneBrief } from './look.mjs';
import { saveBrief, saveOf } from './worlds.mjs';
import { atScene, placeBrief } from './world.mjs';

export const CONFIRM_TTL_MS = 10 * 60 * 1000;
/* The verb Ling calls → what it lets go. */
export const GUARDED = { init: 'restart', undo: 'undo', load: 'load', forget: 'forget', go: 'go' };
const TOOL = { restart: 'Restart', undo: 'Undo', load: 'Load', forget: 'Forget', go: 'Go' };
/* The verbs whose call names what they act on, and the arg that names it. */
const NAMED_BY = { load: 'id', forget: 'id', go: 'scene' };
/* The player's words asking for one — Look carries the question for these. */
const ASKED_FOR = {
  restart: /重来|从头|重新开始|\brestart\b|begin again|start over/i,
  undo: /悔棋|悔一步|收回上一步|撤回上一步|\bundo\b|take (it|that) back/i,
};
const NOT_YET = { zh: '再想想', en: 'Not yet' };

const headerOf = (content, state, now) => String((atScene(content, state) ? sceneBrief(content, state, now)?.place : placeBrief(content, state, now)?.name) ?? '');

/* A kept save in the player's words: its title, else when and where. */
function saveName(save, lang) {
  const b = saveBrief(save, lang), zh = lang === 'zh';
  if (b.title) return b.title;
  if (b.kind === 'world') return [b.world, b.where].filter(Boolean).join(' · ');
  const d = new Date(b.at);
  const day = zh ? `${d.getMonth() + 1}月${d.getDate()}日` : d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
  return b.where ? (zh ? `${day}的${b.where}` : `${b.where}, ${day}`) : day;
}

/* A scene Go can take the player to: of a chapter that has opened, or one of
   the player's made scenes. Null otherwise — the verb refuses it itself. */
function sceneTo(content, state, id, now) {
  const chapter = Object.values(content?.chapters ?? {}).find(c => c.scenes[id]);
  if (chapter) return chapter.opens && new Date(chapter.opens) > now ? null : chapter.scenes[id];
  return state.made?.scenes?.[id] ?? null;
}

/* A scene in the player's words: its place (the part before ·), else its title. */
function sceneName(scene, state, lang) {
  const said = (v) => (v && typeof v === 'object' ? pick(v, lang) : v) || null;
  const text = said(scene.place) ?? said(scene.title) ?? String(scene.id ?? '');
  return fill(String(text).split(' · ')[0].trim(), state);
}

/* The one question, worded in the world. */
export function confirmAsk(what, content, state, now, id = null) {
  const lang = state.lang === 'zh' ? 'zh' : 'en', zh = lang === 'zh';
  const name = !id ? null : what === 'go' ? sceneName(sceneTo(content, state, id, now), state, lang) : saveName(saveOf(id), lang);
  const words = {
    restart: [zh ? '从头再来？此番修行尽数散去。' : 'Begin again? Everything of this journey is let go.', zh ? '从头再来' : 'Begin again', { restart: true }],
    undo: [zh ? '悔棋：收回上一步？' : 'Take back the last move?', zh ? '收回' : 'Take it back', { undo: true }],
    load: [zh ? `回到${name}？` : `Go back to ${name}?`, zh ? `回到${name}` : `Go back to ${name}`, { load: id }],
    forget: [zh ? `忘掉「${name}」？此存档就此散去。` : `Let “${name}” go? That save is gone for good.`, zh ? '忘掉' : 'Let it go', { forget: id }],
    go: [zh ? `直接去${name}？路上的事就此略过。` : `Go straight to ${name}? What lies on the road is passed by.`, zh ? '去' : 'Go', { go: id }],
  }[what];
  const [question, yes, act] = words;
  return { header: headerOf(content, state, now), question, options: [{ label: yes, ...act }, { label: NOT_YET[lang], look: true }] };
}

/* The confirmation on the save, while it holds: asked for this, within the span. */
export function liveConfirm(state, now, what = null, id = null) {
  const c = state?.confirm;
  if (!c?.at || now.getTime() - Date.parse(c.at) > CONFIRM_TTL_MS) return null;
  if (what && c.what !== what) return null;
  if (id != null && String(c.id ?? '') !== String(id)) return null;
  return c;
}

/* A save without the asking on it — what is logged, restored or taken up. */
export const unconfirmed = (s) => {
  if (!s || typeof s !== 'object' || !('confirm' in s)) return s;
  const { confirm, ...rest } = s;
  return rest;
};

const confirmThen = (what, ask) => `The player asks for this: AskUser exactly \`ask\` — header, question, options as they are; nothing else, and never the options in your own words. Call ${TOOL[what]} only if "${ask.options[0].label}" comes back; on "${ask.options[1].label}" Look {said: ${ask.options[1].label}}, end on a line and change nothing.`;
const strictThen = (what) => `Not confirmed — nothing changed. Only if the player asked for this in their own words: Look {said: their words} — it carries the one question; AskUser it, and call ${TOOL[what]} only if its first option comes back. If they did not ask, never call ${TOOL[what]}.`;
const REFUSED_SAY = {
  restart: { zh: '此番修行，不问一声，不可散去。', en: 'A journey is not let go without asking.' },
  undo: { zh: '落子无悔——除非先问一声。', en: 'A move stands unless it is asked about first.' },
};

/* Ling's Restart / Undo / Load / Forget / Go: null when the confirmation
   holds, else the refusal. Load, Forget and Go ask here — the target is named
   only now — and hand back the state to keep with the asking on it. */
export function guard(verb, args, state, content, now) {
  const what = GUARDED[verb];
  if (!what || !state) return null;
  const id = NAMED_BY[what] ? String(args[NAMED_BY[what]] ?? '') : null;
  if (liveConfirm(state, now, what, id)) {
    // Go carries the save on (a clone of it), so its asking is used up here.
    if (what === 'go') delete state.confirm;
    return null;
  }
  if (id != null) {
    if (what === 'go') {
      if (!sceneTo(content, state, id, now)) return null; // the verb refuses an unknown or unopened scene itself
    } else if (!saveOf(id)) return null; // the verb refuses an unknown save itself
    if (what === 'forget' && saveOf(id).kind !== 'named') return null; // and a save that is not the player's
    const ask = confirmAsk(what, content, state, now, id);
    return { keep: { ...state, confirm: { what, id, at: now.toISOString(), ask } }, result: { ok: false, refused: 'not-confirmed', say: null, ask, then: confirmThen(what, ask) } };
  }
  const lang = state.lang === 'zh' ? 'zh' : 'en';
  return { keep: null, result: { ok: false, refused: 'not-confirmed', say: pick(REFUSED_SAY[what], lang), ask: null, then: strictThen(what) } };
}

/* Look with the player's words. The answer to a confirmation still open —
   its first option: the tool it names, now; 再想想: let it be (the asking
   cleared). Words asking to begin again or take a move back: the question,
   over whatever the scene would ask. Null: nothing of this. */
export function onLook(said, state, content, now) {
  const words = String(said ?? '').trim();
  if (!words || words.startsWith('[')) return null;
  const open = liveConfirm(state, now);
  if (open?.ask) {
    const [yes, no] = open.ask.options;
    if (words === yes.label) return { tap: open.ask };
    if (words === no.label) return { keep: unconfirmed(state) };
  }
  const what = Object.keys(ASKED_FOR).find(k => ASKED_FOR[k].test(words));
  if (!what) return null;
  const ask = confirmAsk(what, content, state, now);
  return { keep: { ...state, confirm: { what, at: now.toISOString(), ask } }, ask, then: confirmThen(what, ask) };
}
