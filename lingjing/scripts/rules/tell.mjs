// rules/tell.mjs — The story told in the chat: the source passages a beat owes Ling.
// Part of the rules engine; rules.mjs is its one door.
//
// His ruling, 2026-09-28: 「右边不要放小说内容, 右边尽量放图片, 战斗, 小游戏……
// 像小人书。左边chat里放剧情。」 The stage draws a scene as a panel (a picture and
// two to four lines of caption); the prose is the chat's. A scene's `story` and
// an exit's `story` are the book's own passage for that beat (story/huxian-bing/
// 01-第一回 and 02-第二回, once 序章上 and 序章下, zh + en). The rules hand each one to Ling ONCE, in order —
// the choice's outcome, then the scene it walks into — whoever moved: her own
// Resolve carries it, and a tap on the panel leaves it owed for her next Look.
//
// Yinyue's words inside a passage are marked ⟪…⟫. They are the BOOK's lines,
// and Ling tells them as written, awake or asleep — telling the book is not
// speaking for her (his, 2026-09-29: 「银月的台词按书引用」). Handed to her
// instead, they left holes in the dialogue: 「我娘说编得不好」 answered a line
// the chat never showed. Her own words off the page are still hers alone.
import { fill, pick } from '../state.mjs';
import { inMade, sceneOf } from './world.mjs';

const SPAN = /⟪([\s\S]*?)⟫/g;

/* A passage as Ling reads it: her marked words told as the book's. */
export function passageFor(content, state, pair) {
  const text = fill(pick(pair, state.lang), state, content);
  return text == null ? null : text.replace(SPAN, '$1');
}

/* A move owes Ling its passages: the exit's own (when it has one), and the
   scene it walks into (`scene/<id>`), recorded the moment the player ENTERS
   it — a scene tapped through before anyone Looked is still told (seen
   2026-09-29: eight choices tapped while a fallback model never Looked, and
   five scenes' passages were lost). A spine scene played again owes nothing. */
export function oweExit(s, scene, exit, replay) {
  if (replay || inMade(s)) return;
  const owed = [...(s.tell_owed ?? [])];
  if (exit.story) owed.push(`${scene.id}/${exit.id}`);
  if (exit.next) owed.push(`scene/${exit.next}`);
  if (owed.length !== (s.tell_owed ?? []).length) s.tell_owed = owed;
}

/* More than this many passages owed at once, and the older ones are told as
   a catch-up (their scenes' `recap` lines): a stale run skips cleanly. */
export const CATCHUP_OVER = 2;

const findScene = (content, sid) => Object.values(content.chapters).map(c => c.scenes?.[sid]).find(Boolean);

/* What Ling is owed now, in order — each choice's outcome, the scene it
   walked into, and the scene she stands in when it has a passage she has not
   been handed — and the save with it marked told. More than two owed: the
   older ones fold into one `catchup` item (the recaps of their scenes, in
   order), the last two stay whole. Null when nothing is owed. An owed exit
   key from before `scene/` keys (an old save) owes its next scene too. */
export function tellOf(content, state) {
  if (inMade(state)) return null;
  const scenes = content.chapters[state.chapter]?.scenes ?? {};
  const told = new Set(state.told_scenes ?? []);
  const items = [], seen = new Set();
  const addScene = (sid) => {
    const sc = findScene(content, sid);
    if (!sc?.story || told.has(sid) || seen.has(`scene/${sid}`)) return;
    seen.add(`scene/${sid}`); told.add(sid);
    const text = passageFor(content, state, sc.story);
    if (text) items.push({ of: 'scene', id: sid, text });
  };
  for (const key of state.tell_owed ?? []) {
    const [sid, eid] = key.split('/');
    if (sid === 'scene') { addScene(eid); continue; }
    const exit = findScene(content, sid)?.exits?.find(e => e.id === eid);
    const text = exit?.story && !seen.has(key) ? passageFor(content, state, exit.story) : null;
    if (text) { seen.add(key); items.push({ of: 'choice', id: key, text }); }
    if (exit?.next) addScene(exit.next);
  }
  const scene = sceneOf(content, state);
  if (scene?.story && scenes[scene.id]) addScene(scene.id);
  if (!items.length && !(state.tell_owed ?? []).length) return null;
  const keep = { ...state, tell_owed: [], told_scenes: [...told] };
  return { tell: caughtUp(content, state, items), keep };
}

/* The older passages folded into their scenes' recaps (one line each, in
   order); the last two kept whole. */
function caughtUp(content, state, items) {
  if (items.length <= CATCHUP_OVER) return items;
  const older = items.slice(0, -CATCHUP_OVER), last = items.slice(-CATCHUP_OVER);
  const whole = new Set(last.map(i => i.of === 'scene' ? i.id : i.id.split('/')[0]));
  const sids = [...new Set(older.map(i => (i.of === 'scene' ? i.id : i.id.split('/')[0])))].filter(sid => !whole.has(sid));
  const lines = sids.map(sid => {
    const sc = findScene(content, sid);
    return fill(pick(sc?.recap, state.lang) ?? pick(sc?.setup, state.lang), state, content);
  }).filter(Boolean);
  return lines.length ? [{ of: 'catchup', id: 'catchup', ids: older.map(i => i.id), text: lines.join('\n') }, ...last] : last;
}

const HEAD = {
  zh: '[tell] 灵，这是玩家刚走过的书中原文，照着讲——贴着原文、保留对白、按玩家的名字与选择改写；不列选项（guide `tell`）。',
  en: '[tell] Ling: the book\'s own passages the player just walked through — tell them closely, every line of dialogue kept, fitted to the player; never list the choices (guide `tell`).',
};
const PART = {
  zh: { catchup: '【前情·几句带过】', choice: '【选择之后】', scene: '【此景】' },
  en: { catchup: '[Catch-up — a few lines]', choice: '[After the choice]', scene: '[This scene]' },
};

/* The passages as the page's report carries them to Ling (lingjing.js):
   one block after `[scene] took …`, read by any model without a tool call. */
export function tellReport(tell, lang = 'zh') {
  if (!tell?.length) return '';
  const part = PART[lang] ?? PART.zh;
  const body = tell.map(t => `${part[t.of] ?? ''}\n${t.text}`).join('\n\n');
  return `${HEAD[lang] ?? HEAD.zh}\n\n${body}\n[/tell]`;
}

