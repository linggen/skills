// rules/tell.mjs — The story told on the stage: the source passages a beat owes.
// Part of the rules engine; rules.mjs is its one door.
//
// A scene's `story` and an exit's `story` are the book's own passage for that
// beat (story/jiuding-lu, zh + en). Until 2026-09-29 they were handed to Ling
// to retell in the chat, and the game read like an essay: models paraphrased
// the book, and the stage and the chat drifted apart (his screenshot: the
// whole story in the chat, the stage empty). Now the stage plays them itself,
// deterministically, in a dialogue box (Hanli, 2026-09-29: 「对话框先做，go」):
// the page draws what is owed (`tell`, the page's verb) ONCE, in order — the
// choice's outcome, then the scene it walks into — whoever moved, and plays
// it beat by beat (beatsOf). Ling is handed only what the stage is playing
// (`staged`), never the prose: she never retells it.
//
// Yinyue's words inside a passage are marked ⟪…⟫. They are the BOOK's lines
// (his, 2026-09-29: 「银月的台词按书引用」): the box plays them in place, with
// her face. Her own words off the page are still hers alone.
import { fill, pick } from '../state.mjs';
import { companionOf } from './companion.mjs';
import { portraitOf } from './codex.mjs';
import { atScene, inMade, sceneOf } from './world.mjs';

const SPAN = /⟪([\s\S]*?)⟫/g;

/* A passage as the box plays it: her marked words told as the book's. */
export function passageFor(content, state, pair) {
  const text = fill(pick(pair, state.lang), state, content);
  return text == null ? null : text.replace(SPAN, '$1');
}

/* A move owes the stage its passages: the exit's own (when it has one), and the
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

/* A scene's passage is played where the scene stands (2026-10-01): when the
   story's next scene is roads away (狰 → 柴房, 第六回 → 石门), its passage stays
   owed until the player arrives — told on the way, it played at the wrong
   place, and on arrival the box was empty and the choices already up. The
   choice's own passage still plays where it was made. */
const waitsArrival = (content, state, sid) => sid === state.scene && !atScene(content, state);
const deferredKey = (content, state, key) => key.startsWith('scene/') && waitsArrival(content, state, key.slice(6));

/* What the stage owes now, in order — each choice's outcome, the scene it
   walked into, and the scene the player stands in when it has a passage not
   yet played — and the save with it marked told. More than two owed: the
   older ones fold into one `catchup` item (the recaps of their scenes, in
   order), the last two stay whole. Null when nothing is owed. An owed exit
   key from before `scene/` keys (an old save) owes its next scene too. */
export function tellOf(content, state) {
  if (inMade(state)) return null;
  const scenes = content.chapters[state.chapter]?.scenes ?? {};
  const told = new Set(state.told_scenes ?? []);
  const items = [], seen = new Set(), later = [];
  const addScene = (sid) => {
    if (waitsArrival(content, state, sid)) { if (!later.includes(`scene/${sid}`)) later.push(`scene/${sid}`); return; }
    const sc = findScene(content, sid);
    if (!sc?.story || told.has(sid) || seen.has(`scene/${sid}`)) return;
    seen.add(`scene/${sid}`); told.add(sid);
    const text = passageFor(content, state, sc.story);
    if (text) items.push({ of: 'scene', id: sid, text, ...(sc.hui ? { hui: sc.hui } : {}) });
  };
  for (const key of state.tell_owed ?? []) {
    const [sid, eid] = key.split('/');
    if (sid === 'scene') { addScene(eid); continue; }
    const from = findScene(content, sid), exit = from?.exits?.find(e => e.id === eid);
    const text = exit?.story && !seen.has(key) ? passageFor(content, state, exit.story) : null;
    // Each passage carries its 回: the page plays an ending 回's last passage before its 「完」 card.
    if (text) { seen.add(key); items.push({ of: 'choice', id: key, text, ...(from?.hui ? { hui: from.hui } : {}) }); }
    if (exit?.next) addScene(exit.next);
  }
  const scene = sceneOf(content, state);
  if (scene?.story && scenes[scene.id] && atScene(content, state)) addScene(scene.id);
  if (!items.length && !(state.tell_owed ?? []).length) return null;
  const keep = { ...state, tell_owed: later, told_scenes: [...told] };
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
  const hui = older.find(i => i.hui)?.hui;
  return lines.length ? [{ of: 'catchup', id: 'catchup', ids: older.map(i => i.id), text: lines.join('\n'), ...(hui ? { hui } : {}) }, ...last] : last;
}

/* Is anything owed? The page asks Look (`tell_owed`) before it draws: the
   same walk as tellOf, without the passages. */
export function owesTell(content, state) {
  if (inMade(state)) return false;
  if ((state.tell_owed ?? []).some(k => !deferredKey(content, state, k))) return true;
  const scene = sceneOf(content, state);
  return Boolean(scene?.story && atScene(content, state) && content.chapters[state.chapter]?.scenes?.[scene.id] && !(state.told_scenes ?? []).includes(scene.id));
}

/* What Ling is handed while the stage plays (`staged`): each owed beat by
   its label and its scene's recap line — enough to know the story so far,
   never the prose to retell. Nothing is marked told: the page draws it. */
export function stagedOf(content, state) {
  if (!owesTell(content, state)) return null;
  const say = pair => fill(pick(pair, state.lang), state, content);
  const keys = (state.tell_owed ?? []).filter(k => !deferredKey(content, state, k));
  const here = sceneOf(content, state);
  if (here?.story && !(state.told_scenes ?? []).includes(here.id) && !keys.includes(`scene/${here.id}`)) keys.push(`scene/${here.id}`);
  return keys.map(key => {
    const [sid, eid] = key.split('/');
    if (sid === 'scene') { const sc = findScene(content, eid); return { scene: eid, recap: say(sc?.recap ?? sc?.setup) ?? null }; }
    const exit = findScene(content, sid)?.exits?.find(e => e.id === eid);
    return { chose: say(exit?.label) ?? eid };
  });
}

/* ── The dialogue box's beats ──
   A passage is played a paragraph at a time. `**名**：话` (`**Name:** words`,
   and `**名**：（动作）话`) is a line spoken: the speaker's name and 图鉴
   portrait — the hero's lines (`**你**`) under the player's 名字 and never a
   face (the hero is never drawn); 银月's in the form her scene names (the
   fox, the girl). Any other paragraph is narration. A catch-up is its recap
   lines, narration all. */
const SPOKEN = [/^\*\*([^*\n]+?)\*\*\s*[：:]\s*([\s\S]+)$/, /^\*\*([^*\n]+?)[：:]\*\*\s*([\s\S]+)$/];
const HERO = new Set(['你', 'You', 'you']);
const ACTION = /^[（(]([^）)]*)[）)]\s*/;
const plain = t => t.replace(/\*/g, '').trim();

export function beatsOf(content, state, item) {
  const sid = item.of === 'scene' ? item.id : item.id.split('/')[0];
  const paras = String(item.text ?? '').split(/\n+/).map(p => p.trim()).filter(p => p && !/^〔(银月|Yinyue)〕$/.test(p) && !/^([-*_])\1{2,}$/.test(p));
  if (item.of === 'catchup') return paras.map(p => ({ text: plain(p), recap: true }));
  return paras.map(p => spokenOf(content, state, p, sid) ?? { text: plain(p) });
}

function spokenOf(content, state, para, sid) {
  const m = SPOKEN.map(re => para.match(re)).find(Boolean);
  if (!m) return null;
  const said = plain(m[2]), act = said.match(ACTION);
  const words = act ? { act: act[1], text: said.slice(act[0].length) } : { text: said };
  return { ...speakerOf(content, state, m[1].trim(), sid), ...words };
}

function speakerOf(content, state, name, sid) {
  // The hero is the world's (people.json `hero`: 沈小满 · Shen Xiaoman), else the save's name.
  if (HERO.has(name)) return { hero: true, name: pick(content.people?.hero?.name, state.lang) || state.name || name };
  const her = companionOf(content);
  const herNames = new Set([her?.name, ...Object.values(her?.forms ?? {}).map(f => f.name)].flatMap(n => (n ? [n.zh, n.en] : [])));
  if (her && herNames.has(name)) {
    // The 图鉴 decides the face: the form's own entry (yinyue-fox) where it has one, else hers.
    // A scene that names no form has her as the little fox she mostly is (the token, his shoulder);
    // her own entry is the girl of the dawn (00-yinyue, `her: human`).
    const key = findScene(content, sid)?.her ?? 'fox', form = her.forms?.[key] ?? her.forms?.human;
    return { who: her.id, name, art: portraitOf(content, state, `${her.id}-${key}`, portraitOf(content, state, her.id, form?.art ?? null)) };
  }
  const p = (content.people?.people ?? []).find(x => [x.name?.zh, x.name?.en, fill(pick(x.name, state.lang), state, content)].includes(name));
  return p ? { who: p.id, name, art: portraitOf(content, state, p.id, p.art ?? null) } : { name };
}

/* The passages as the page plays them: each owed item with its beats in
   both languages (the same walk read in each — the same items, in order), so
   a switch of language mid-passage plays on in the other. */
export function playOf(content, state, tell) {
  const other = state.lang === 'en' ? 'zh' : 'en';
  const there = tellOf(content, { ...state, lang: other })?.tell ?? [];
  return tell.map(t => {
    const twin = there.find(x => x.id === t.id);
    const beats = { [state.lang]: beatsOf(content, state, t), [other]: twin ? beatsOf(content, { ...state, lang: other }, twin) : [] };
    return { ...t, beats };
  });
}
