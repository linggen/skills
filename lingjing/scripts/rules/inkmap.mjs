// rules/inkmap.mjs — 鼎归 · 地图晕开 (哇时刻 ①, his 2026-09-29): the 九州 map
// as the save stands, and 御剑 to a 鼎 come home.
// Part of the rules engine; rules.mjs is its one door.
//
// Each province is in one of three states, all read from the save:
//   mist — not yet walked, or shut by the chapter's map (world.mjs placeOpen):
//          blank 宣纸, a faint dashed outline. A locked province is ALWAYS mist.
//   wash — walked (`state.been`, the place stood in now, the scenes passed),
//          its 鼎 not home: a light ink wash.
//   ink  — its 鼎 home: the chapter that holds it ended (story.mjs holdsCauldron).
// A 鼎 home is a travel point (原神's 七天神像): Fly goes straight to the
// place it was found for 1 体力, never into a shut province.
import { pick, fill } from '../state.mjs';
import { clone, refuse, spendStamina } from './core.mjs';
import { advance, settleErrands } from './errands.mjs';
import * as world from './world.mjs';

const { placeBrief, placeName, placeOf, provinceOpen, settlePlace, inMade, inCorridor } = world;
/* The chapter's map (world.mjs placeOpen), with the older rule — the
   province open by date — where it is not there. */
const openPlace = (content, state, p, now) => (world.placeOpen ? world.placeOpen(content, state, p, now) : provinceOpen(content, p.province, now));

const holdsCauldron = ch => !ch.corridor && ch.cauldron !== false;

/* The scene where a chapter's 鼎 is taken: the one whose exit holds its memory
   or its breakthrough, else the one that ends the chapter. */
function cauldronScene(ch) {
  const scenes = Object.values(ch.scenes ?? {});
  return scenes.find(sc => (sc.exits ?? []).some(e => e.memory || e.breakthrough))
    ?? scenes.find(sc => (sc.exits ?? []).some(e => e.ends === ch.id)) ?? null;
}

/* The 鼎 come home, in the order they came: {province, chapter, place, map, memory, line}. */
export function homedOf(content, state) {
  if (content.world?.made || !content.world?.atlas) return [];
  const lang = state.lang;
  return (state.ended ?? []).map(id => content.chapters[id]).filter(ch => ch && holdsCauldron(ch) && content.places[ch.province])
    .map(ch => {
      const sc = cauldronScene(ch), place = placeOf(content, sc?.at) ?? placeOf(content, content.places[ch.province].start);
      const memory = (sc?.exits ?? []).find(e => e.memory)?.memory ?? null;
      const said = sc?.recap ?? ch.summary;
      const line = said ? fill(pick(said, lang), state, content).split(/(?<=[。！？.!?])/)[0].trim() : null;
      return {
        province: ch.province, chapter: ch.id, title: pick(ch.title, lang),
        place: place ? { id: place.id, name: pick(place.name, lang) } : null,
        map: place?.map ?? content.world.atlas.provinces[ch.province] ?? null,
        ...(memory ? { memory } : {}), ...(line ? { line } : {}),
      };
    });
}

/* The provinces the player has stood in: kept on the save as walked
   (`been`, markBeen), and what the save already says — here, the scenes passed. */
export function beenOf(content, state) {
  const been = new Set(state.been ?? []);
  const add = id => { const p = placeOf(content, id); if (p?.province) been.add(p.province); };
  add(state.place);
  for (const ch of Object.values(content.chapters)) for (const sc of Object.values(ch.scenes ?? {})) if ((state.done_scenes ?? []).includes(sc.id)) add(sc.at);
  return been;
}

/* The save's province, written down when it is a new one: true when it changed. */
export function markBeen(content, state) {
  const p = placeOf(content, state?.place);
  if (!p?.province || (state.been ?? []).includes(p.province)) return false;
  state.been = [...(state.been ?? []), p.province];
  return true;
}

/* Shut: no place of it the player may walk to now (the chapter's map, the date). */
function lockedProvince(content, state, id, now) {
  const places = content.places[id]?.places ?? [];
  return !places.some(p => openPlace(content, state, placeOf(content, p.id) ?? { ...p, province: id }, now));
}

/* One province's state on the map. A locked province is mist whatever else is true. */
export const stateOf = ({ locked, home, been }) => (locked ? 'mist' : home ? 'ink' : been ? 'wash' : 'mist');

/* The whole 九州, for the page's map (the atlas verb) and its moment:
   {provinces: {id: {state, locked, been, home?}}, homed: [id…], of, travel: [id…]}. */
export function inkMapOf(content, state, now = new Date()) {
  const atlas = content.world?.atlas;
  if (!atlas || content.world.made) return null;
  const homed = homedOf(content, state), been = beenOf(content, state);
  const home = new Map(homed.map(h => [h.province, h]));
  const provinces = Object.fromEntries(Object.keys(atlas.provinces).map(id => {
    const locked = lockedProvince(content, state, id, now);
    const h = home.get(id);
    const flyable = h && !locked && h.place && openPlace(content, state, placeOf(content, h.place.id), now);
    return [id, { state: stateOf({ locked, home: Boolean(h), been: been.has(id) }), locked, been: been.has(id), ...(h ? { home: h } : {}), ...(flyable ? { fly: true } : {}) }];
  }));
  const of = Object.values(content.chapters).filter(ch => holdsCauldron(ch) && content.places[ch.province]).length;
  return { provinces, homed: homed.map(h => h.province), of, travel: Object.keys(provinces).filter(id => provinces[id].fly) };
}

/* Look's share: which 鼎 are home and how many there are — the page plays the
   moment when the list grows. `unroll`: the chapter asks for the whole map to
   be unrolled (chapter.json `unroll`, 第三章 · 下山) and it has not been yet. */
export function jiudingBrief(content, state) {
  if (content.world?.made || !content.world?.atlas) return null;
  const homed = homedOf(content, state).map(h => h.province);
  const of = Object.values(content.chapters).filter(ch => holdsCauldron(ch) && content.places[ch.province]).length;
  const ch = content.chapters[state.chapter];
  const unroll = ch?.unroll && !(state.unrolled ?? []).includes(ch.id) ? ch.id : null;
  return { homed, of, ...(unroll ? { unroll } : {}) };
}

/* Unrolled — the page played the scroll for this chapter: never again. */
export function unrolled(state, content, ctx, args) {
  const id = String(args.chapter ?? state.chapter);
  if (!content.chapters[id]?.unroll) return refuse('no-unroll', null);
  if ((state.unrolled ?? []).includes(id)) return { state: null, result: { ok: true, unrolled: id, seen: true } };
  const s = clone(state);
  s.unrolled = [...(state.unrolled ?? []), id];
  return { state: s, result: { ok: true, unrolled: id } };
}

const SAY = {
  notHome: { zh: '那里的鼎还没归来，剑认不得路。', en: 'That cauldron has not come home; the sword does not know the way.' },
  locked: { zh: '那条路还没开。', en: 'That road has not opened yet.' },
  held: { zh: '先把眼前的事做完。', en: 'Finish what is before you first.' },
};

/* Fly — 御剑 to a 鼎 come home (`--province=冀`): straight to the place it was
   found, for 1 体力, from anywhere. Refused: a 鼎 not home (`not-home`), a
   province or place the chapter's map keeps shut (`locked`), a key beat or
   the corridor carrying the player (`corridor`), a fight or 闭关 open, no 体力. */
export function fly(state, content, ctx, args) {
  const lang = state.lang, now = ctx.now ?? new Date();
  const s = clone(state);
  settlePlace(content, s);
  const id = String(args.province ?? args.to ?? '').replace(/州$/, '');
  const h = homedOf(content, s).find(x => x.province === id || pick(content.dictionary.provinces[x.province], 'en')?.toLowerCase() === id.toLowerCase());
  if (s.fight) return refuse('in-a-fight', null);
  if (s.seclusion) return refuse('in-seclusion', null);
  if (!h?.place) return refuse('not-home', pick(SAY.notHome, lang), { province: id || null });
  const target = placeOf(content, h.place.id);
  if (inCorridor(content, { ...s, made: null })) {
    const beat = world.beatOf?.(content, s);
    return refuse('corridor', pick(beat?.say ?? SAY.held, lang), { province: h.province });
  }
  if (lockedProvince(content, s, h.province, now) || !openPlace(content, s, target, now)) {
    const shut = world.mapOf?.(content, s, now)?.say;
    return refuse('locked', pick(shut ?? SAY.locked, lang), { province: h.province });
  }
  if (s.place === target.id && !inMade(s)) return { state: null, result: { ok: true, here: true, place: placeBrief(content, s, now) } };
  const tired = spendStamina(content, s, ctx, 'fly', 1, 1);
  if (tired) return tired;
  const from = placeOf(content, s.place);
  s.handed = [];
  s.place = target.id;
  if (inMade(s)) s.made.at = null;
  advance(content, s, { kind: 'visit', place: target.id });
  markBeen(content, s);
  const handed = settleErrands(content, s, ctx);
  return {
    state: s,
    result: {
      ok: true, flew: { province: h.province, from: from ? placeName(content, s, from) : null, to: placeName(content, s, target) },
      place: placeBrief(content, s, now), ...(handed.length ? { handed } : {}),
    },
  };
}
