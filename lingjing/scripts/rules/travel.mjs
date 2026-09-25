// rules/travel.mjs — Story, travel, trade, language — and Ling driving the game.
// Part of the rules engine; rules.mjs is its one door.
import { ARM_SLOTS } from '../content.mjs';
import { dayKey, fill, langOf, pick } from '../state.mjs';
import { tierRank } from './arms.mjs';
import { companionOf, hasCompanion } from './companion.mjs';
import { clone, offerTasks, pay, refuse, spendStamina } from './core.mjs';
import { advance, bookOf, directorBrief, GEAR_SLOTS, itemBrief, itemOf, questOf, settleErrands } from './errands.mjs';
import { arriveOnRoad } from './road.mjs';
import { forSale, sceneBrief, shelfOf, wordsOf } from './look.mjs';
import { atScene, fittingPlace, inCorridor, inMade, pathOf, placeBrief, placeName, placeOf, placeSaid, provinceOpen, sceneOf, settlePlace, STORY_CHARS, STORY_WORDS, tierIndex, tooHard } from './world.mjs';
import { enteredBeat, refusalBeat } from './story.mjs';
import { enter } from './worlds.mjs';
import { bagFull, pouchBrief, roomFor } from './pouch.mjs';

/* ── Story, travel, language ── */

/* A small stable hash: the same day and name land on the same seed. */
function hashOf(text) {
  let h = 0;
  for (const ch of String(text)) h = (h * 31 + ch.codePointAt(0)) % 2147483647;
  return h;
}

export function summarize(state, content, ctx, args) {
  const text = String(args.text ?? '').trim();
  if (!text) return refuse('empty', null);
  const tooLong = state.lang === 'zh' ? [...text].length > STORY_CHARS : text.split(/\s+/).length > STORY_WORDS;
  if (tooLong) return refuse('too-long', null, { max_words: STORY_WORDS, max_zh_chars: STORY_CHARS });
  const s = clone(state);
  s.story = text;
  return { state: s, result: { ok: true, story: text } };
}

/* A province by its character (冀), its name (冀州) or its English (Ji). */
function provinceOf(content, raw) {
  const said = String(raw ?? '').trim().replace(/州$/, '').toLowerCase();
  return Object.keys(content.dictionary.provinces).find(k => k === said || content.dictionary.provinces[k].en.toLowerCase() === said) ?? null;
}

/* Go to a place. The rules check the road and the tier against the player;
   too hard is refused in the mist with a fitting place, so Yinyue's "not
   yet — back to the ford" is the rules' hint, spoken kindly. While the
   corridor runs the scene comes first. A province named instead of a place
   answers as before: here, or a road not yet open. Every refusal says `here`
   — the player went nowhere — and a place with no road from here says
   `toward`, the first road on the way to it. Walking away leaves a made
   scene (`left`); Enter brings it back. */
export function move(state, content, ctx, args) {
  const s = clone(state);
  settlePlace(content, s);
  const here = placeOf(content, s.place);
  const raw = args.place ?? args.province;
  const target = placeSaid(content, raw, here);
  const lang = s.lang;
  const stay = (code, say, extra = {}) => refuse(code, say, { here: here ? placeName(content, s, here) : null, ...extra });
  const near = () => here.roads.map(id => placeName(content, s, placeOf(content, id)));
  if (!target) {
    const p = provinceOf(content, raw);
    if (p && here?.province === p) return { state: null, result: { ok: true, here: true, place: placeBrief(content, s) } };
    if (p || !here) {
      const say = { zh: `${p ?? String(raw ?? '').replace(/州$/, '')}州的路还没开。`, en: 'That road has not opened yet.' };
      return stay('road-closed', pick(say, lang));
    }
    return stay('unknown-place', null, { near: near() });
  }
  if (target.id === here?.id) return { state: null, result: { ok: true, here: true, place: placeBrief(content, s) } };
  // A made scene played inside the corridor does not open the road.
  if (inCorridor(content, { ...s, made: null })) {
    return stay('corridor', pick({ zh: '先把眼前的事做完。', en: 'Finish what is before you first.' }, lang), { scene: s.scene });
  }
  if (!provinceOpen(content, target.province, ctx.now)) {
    const say = { zh: `${target.province}州的路还没开。`, en: 'That road has not opened yet.' };
    return stay('road-closed', pick(say, lang), { province: target.province });
  }
  if (tooHard(content, s, target)) {
    const fitting = fittingPlace(content, s, here);
    const say = { zh: '雾更浓了，看不见路。', en: 'The mist thickens; the road is lost.' };
    // Her word turning him back is hers to say (Hanli, 2026-09-24): facts for
    // her moment, never a line for Ling. Before she is found there is none.
    const line = { zh: `还不是时候。先回${pick(fitting.name, 'zh')}吧。`, en: `Not yet. Let's go back to ${pick(fitting.name, 'en')}.` };
    const happened = { zh: `${pick(target.name, 'zh')}超出了玩家的境界，去不了。`, en: `${pick(target.name, 'en')} is beyond the player's realm; the road is lost.` };
    const her = refusalBeat(content, s, { id: `too-hard/${target.id}`, happened: pick(happened, lang), fitting: pick(fitting.name, lang), line: pick(line, lang) });
    return stay('too-hard', pick(say, lang), { tier: target.tier, fitting: placeName(content, s, fitting), ...(her ? { her_beat: her } : {}) });
  }
  // He named where he is going, so he is walked there — the whole road, not
  // one leg and a question at every ford (his, 2026-09-21: 「去泗水」 and the
  // chat asked 何去何从 again). Walking costs nothing. Only a place no open
  // road reaches is refused.
  const way = pathOf(content, s, here, target, ctx.now);
  if (!way) {
    const say = { zh: `从${pick(here.name, 'zh')}没有路通向${pick(target.name, 'zh')}。`, en: `No road runs from ${pick(here.name, 'en')} to ${pick(target.name, 'en')}.` };
    return stay('no-road', pick(say, lang), { near: near() });
  }
  const from = here;
  // The road is paid for before it is walked: 体力 by the road, the whole way
  // (a scene met on the way stops the walk, and the rest is not charged).
  const stopAt = way.findIndex(p => sceneOf(content, s)?.at === p.id && !s.done_scenes.includes(s.scene));
  const roads = stopAt >= 0 ? stopAt + 1 : way.length;
  const tired = spendStamina(content, s, ctx, 'move', roads);
  if (tired) return tired;
  const wasAtScene = atScene(content, s);
  s.handed = []; // walked on, the last place's 所得 is put away
  // The road stops where the story stands: a scene met on the way is not walked past.
  for (const step of way) {
    s.place = step.id;
    advance(content, s, { kind: 'visit', place: step.id });
    if (atScene(content, s) && sceneOf(content, s)?.at === step.id) break;
  }
  const reached = placeOf(content, s.place);
  // What this arrival finished: the errands not ready before and ready now,
  // each with what is SEEN there when its author wrote it — so reaching the
  // place an errand sent him to is an event, not an empty ford.
  const wasReady = new Set(bookOf(content, state, lang, ctx).filter(q => q.ready).map(q => q.id));
  const met = bookOf(content, s, lang, ctx).filter(q => q.ready && !wasReady.has(q.id))
    .map(q => ({ id: q.id, title: q.title, ...(questOf(content, q.id)?.seen ? { seen: fill(pick(questOf(content, q.id).seen, lang), s) } : {}) }));
  const handed = settleErrands(content, s, ctx);
  const via = way.slice(0, way.findIndex(p => p.id === reached.id)).map(p => placeName(content, s, p));
  // 路上 (road.mjs): at most one thing met, where he STOPS — never a place
  // walked through (his pick, 2026-09-21) — and only when the arrival
  // finished nothing: an errand met is the event.
  arriveOnRoad(content, s, ctx, met.length > 0);
  const left = inMade(s) ? s.made.at : null;
  if (left) s.made.at = null;
  const place = placeBrief(content, s, ctx.now);
  const scene = atScene(content, s) ? sceneBrief(content, s, ctx.now) : null;
  // A scene walked into with a line of hers: hers to say (story.mjs).
  const her = scene && !wasAtScene ? enteredBeat(content, s, sceneOf(content, s), ctx.now) : null;
  const cards = [...place.show, ...(scene?.show ?? [])];
  const show = cards.filter((c, i) => cards.findIndex(d => JSON.stringify(d) === JSON.stringify(c)) === i);
  // The story is rewritten when something of it happened: a scene entered,
  // a province crossed, a made scene left — not on every road walked (a
  // Summarize is a whole model call; seen live 2026-09-16, one per step).
  const summarize = Boolean(scene) || reached.province !== from.province || Boolean(left);
  return { state: s, result: { ok: true, place, scene, show, ...(via.length ? { via } : {}), ...(met.length ? { met } : {}), ...(handed.length ? { handed } : {}), ...(reached.id !== target.id ? { stopped: true } : {}), ...(left ? { left } : {}), ...(her ? { her_beat: her } : {}), director: directorBrief(content, s, ctx), summarize } };
}

/* A key the story still needs: an exit of the current chapter's scenes not
   yet done asks for it in the bag. */
export function keyInUse(content, state, id) {
  if (inMade(state)) return false;
  const chapter = content.chapters[state.chapter];
  if (!chapter || state.ended.includes(chapter.id)) return false;
  return Object.values(chapter.scenes).some(scene => !state.done_scenes.includes(scene.id)
    && scene.exits.some(e => e.needs?.bag === id));
}

/* Buy, sell or use a catalog item. Buying and selling happen at a market
   (a place with a shop) and cost a visit's stamina; the prices are the
   catalog's, never Ling's. Using a pill pays its progress within its table;
   using a wear puts it on Yinyue or the abode; using arms wears them — a
   weapon in hand (and a fight may borrow its root), a 法衣, a 佩. A 天材地宝
   waits for the 炼化; a 妖丹 or an old 回春丹 is only goods now (强化 and
   伤势 were cut, redesign-v2 § 四). */
export function trade(state, content, ctx, args) {
  const item = itemOf(content, String(args.id ?? ''));
  const s = clone(state);
  settlePlace(content, s);
  const here = placeOf(content, s.place);
  const lang = s.lang, w = wordsOf(content, lang);
  if (!item) return refuse('unknown-item', null, { shelf: here?.has?.shop ? shelfOf(content, here.province).map(i => i.id) : [] });
  const held = s.bag[item.id] ?? 0;
  if (args.action === 'buy' || args.action === 'sell') {
    if (!here?.has?.shop) {
      return refuse('no-market', pick({ zh: `这里没有${w.shop}。`, en: `There is no ${w.shop} here.` }, lang));
    }
    if (args.action === 'buy') {
      if (!forSale(content, s, item, here.province)) return refuse('not-for-sale-here', null, { shelf: shelfOf(content, here.province, s).map(i => i.id) });
      if (s.wealth < item.buy) {
        return refuse('no-stones', pick({ zh: `${w.wealth}不够。`, en: `Not enough ${w.wealth}.` }, lang), { price: item.buy, wealth: s.wealth });
      }
      // A bigger 储物袋 already put to use is not bought twice.
      if (item.effect?.pouch && (s.pouch ?? []).includes(item.id)) return refuse('pouch-used', pick({ zh: '这样的储物袋你已经换上了。', en: 'You already carry a pouch like that.' }, lang));
      // A full 储物袋 buys nothing new — a stack he holds still takes one more.
      if (!roomFor(content, s, item.id)) return bagFull(content, s);
      const empty = spendStamina(content, s, ctx, 'shop');
      if (empty) return empty;
      s.wealth -= item.buy;
      s.bag[item.id] = held + 1;
      return { state: s, result: { ok: true, bought: item.id, item: itemBrief(content, s, item), paid: { wealth: -item.buy }, wealth: s.wealth } };
    }
    if (held < 1) return refuse('not-in-bag', null);
    if (item.sell == null) return refuse('not-for-sale', pick({ zh: '这东西没有市价。', en: 'That has no market price.' }, lang));
    if (item.effect?.key && keyInUse(content, s, item.id)) {
      return refuse('key-in-use', pick({ zh: '这东西还有用处，先留着。', en: 'You will need that yet — keep it.' }, lang));
    }
    const empty = spendStamina(content, s, ctx, 'shop');
    if (empty) return empty;
    s.bag[item.id] = held - 1;
    if (s.bag[item.id] <= 0) delete s.bag[item.id];
    if (s.wear) for (const [slot, id] of Object.entries(s.wear)) if (id === item.id && !s.bag[item.id]) delete s.wear[slot];
    s.wealth += item.sell;
    return { state: s, result: { ok: true, sold: item.id, item: itemBrief(content, s, item), paid: { wealth: item.sell }, wealth: s.wealth } };
  }
  if (args.action === 'use') {
    if (held < 1) return refuse('not-in-bag', null);
    const e = item.effect ?? {};
    // 功法卷 — read once, learned for good: 望气术 (§ 意图) by its 卷, in order,
    // at the realm it asks.
    if (e.learn) {
      const known = s.insight ?? 0;
      if (known >= e.level) return refuse('already-known', pick({ zh: '这一卷你已经通了。', en: 'You already know this part.' }, lang));
      if (known < e.level - 1) return refuse('needs-before', pick({ zh: '须先通上卷。', en: 'Learn the first part first.' }, lang));
      if (tierRank(content, e.tier) > tierIndex(content, s)) return refuse('needs-tier', pick({ zh: `此卷须${pick(content.ladder.tiers.find(t => t.id === e.tier)?.name, lang)}方可习。`, en: `This part wants ${pick(content.ladder.tiers.find(t => t.id === e.tier)?.name, lang)}.` }, lang));
      s.bag[item.id] = held - 1;
      if (s.bag[item.id] <= 0) delete s.bag[item.id];
      s.insight = e.level;
      return { state: s, result: { ok: true, used: item.id, item: itemBrief(content, s, item), learned: { id: e.learn, level: e.level } } };
    }
    // A bigger 储物袋: its room joins his for good, once for each kind.
    if (e.pouch) {
      if ((s.pouch ?? []).includes(item.id)) return refuse('pouch-used', pick({ zh: '这样的储物袋你已经换上了。', en: 'You already carry a pouch like that.' }, lang));
      s.bag[item.id] = held - 1;
      if (s.bag[item.id] <= 0) delete s.bag[item.id];
      s.pouch = [...(s.pouch ?? []), item.id];
      return { state: s, result: { ok: true, used: item.id, item: itemBrief(content, s, item), pouch: pouchBrief(content, s) } };
    }
    if (e.progress) {
      s.bag[item.id] = held - 1;
      if (s.bag[item.id] <= 0) delete s.bag[item.id];
      const paid = pay(content, s, ctx, { table: e.table, progress: e.progress });
      return { state: s, result: { ok: true, used: item.id, item: itemBrief(content, s, item), paid } };
    }
    if (e.wear && e.wear === companionOf(content)?.id && !hasCompanion(s)) {
      return refuse('no-companion', pick({ zh: '还没有人可以佩戴它。', en: 'There is no one to wear it yet.' }, lang));
    }
    // Arms go on the player, each kind in its own slot; a `wear` is Yinyue's
    // or the abode's.
    const slot = e.wear ?? ARM_SLOTS.get(item.kind);
    if (slot) {
      s.wear ??= {};
      s.wear[slot] = item.id;
      return { state: s, result: { ok: true, used: item.id, item: itemBrief(content, s, item), wear: s.wear } };
    }
    if (e.charm) return refuse('cast-in-a-bout', pick({ zh: `${pick(item.name, lang)}在${w.contest}时掷出，不在此。`, en: `A ${pick(item.name, lang)} is cast in a bout, not here.` }, lang));
    return refuse('not-usable', null);
  }
  // 卸下 — an arm taken off, back to the bag. Only his three slots: what
  // Yinyue wears is hers, and the 本命法宝 is bound, not worn.
  if (args.action === 'remove') {
    const slot = GEAR_SLOTS.find(k => s.wear?.[k] === item.id);
    if (!slot) return refuse('not-worn', null);
    delete s.wear[slot];
    return { state: s, result: { ok: true, removed: item.id, slot, wear: s.wear } };
  }
  return refuse('unknown-action', null, { actions: ['buy', 'sell', 'use', 'remove'] });
}

/* The player's words set the language. The result carries the scene in it,
   so one call switches and re-reads; asking for the language already in
   use changes nothing. */
export function lang(state, content, ctx, args) {
  if (!['zh', 'en'].includes(args.lang)) return refuse('unknown-lang', null, { langs: ['zh', 'en'] });
  // A language chosen — the page's 中/En, or the player asking Ling — is
  // kept: words never turn it again (his, 2026-09-23: 每次刷新不要重置).
  // A new game's guess from the machine (`auto`) is not a choice.
  const set = args.auto ? Boolean(state.lang_set) : true;
  const s = args.lang === state.lang && Boolean(state.lang_set) === set ? state : { ...clone(state), lang: args.lang, lang_set: set };
  // The scene only where the player stands — Lang once handed Ling chapter
  // 3's opening lines a province early (2026-09-16), and Ling recited them.
  const result = { ok: true, lang: s.lang, changed: args.lang !== state.lang, scene: atScene(content, s) ? sceneBrief(content, s, ctx?.now) : null };
  return { state: s === state ? null : s, result };
}

/* The player's words set the language before any verb reads the state, so
   what Ling reads back is already in the language the player wrote. Ling's
   tools pass them as `said`. */
/* Words that are the engine's, not the player's: an empty reply's nudge
   comes back to the model as a user turn and was passed on as `said`,
   flipping a Chinese game to English mid-sitting (2026-09-16). */
const ENGINE_WORDS = /^\s*your response was empty/i;

export function heed(state, said) {
  if (state.lang_set || ENGINE_WORDS.test(String(said ?? ''))) return state;
  const lang = langOf(said);
  return lang && lang !== state.lang ? { ...clone(state), lang } : state;
}

/* ── Ling drives: the player's word moves the game ── */

/* Straight to a scene of the spine, in a chapter that has opened — the
   player asked for it, so the road is not walked. A made scene goes through
   Enter. A chapter already ended stays ended: its scenes play again as
   story, pay nothing (core.mjs `replaying`), and a free prologue is not
   free a second time (review, 2026-09-24). */
export function go(state, content, ctx, args) {
  const id = String(args.scene ?? '');
  const chapter = Object.values(content.chapters).find(c => c.scenes[id]);
  if (!chapter) {
    if (state.made?.scenes?.[id]) return enter(state, content, ctx, args);
    const scenes = Object.values(content.chapters).filter(c => !c.opens || new Date(c.opens) <= ctx.now).flatMap(c => Object.keys(c.scenes));
    return refuse('unknown-scene', null, { scenes: [...scenes, ...Object.keys(state.made?.scenes ?? {})] });
  }
  if (chapter.opens && new Date(chapter.opens) > ctx.now) return refuse('not-open', null, { chapter: chapter.id, opens: chapter.opens });
  const s = clone(state);
  s.chapter = chapter.id; s.scene = id;
  if (s.made) s.made.at = null;
  const scene = chapter.scenes[id];
  if (scene.at) s.place = scene.at;
  settlePlace(content, s);
  offerTasks(content, s);
  const her = enteredBeat(content, s, scene, ctx.now);
  return { state: s, result: { ok: true, scene: sceneBrief(content, s, ctx.now), ...(her ? { her_beat: her } : {}), summarize: true } };
}

export { hashOf, provinceOf };
