// 秘境 mode (Hanli, 2026-10-15: 「yes」): a key beat that declares `sealed` is an instance.
// Inside, its rooms are the whole map (a plate drawn in ink), a way out is refused in-world,
// the world outside — errands, the 令, chores, the 货郎, the 机缘, festival, 节气, sky — is
// frozen and kept out of Look, the 事 book's goal is the scene's own, the header reads the
// book's day or night, and the stage shows the rooms' own paintings. It all comes back on the
// way out. Declared in chapter.json; no rule names the 沉鼎秘境.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { migrate, newState } from '../scripts/state.mjs';
import { look, move, resolve, VERBS } from '../scripts/rules.mjs';
import { stagePick, atmosOf } from '../scripts/atmos.js';
import { placeArtOf } from '../scripts/placeart.js';
import { plateHtml } from '../scripts/plate.js';
import { walk, TO_OPEN } from './prologue.mjs';

const content = loadContent();
const CH = content.chapters['00-waimen'];
const SEALED = CH.beats.find(b => b.sealed).sealed;
const DAY1 = new Date('2026-09-29T09:00:00');
const ctx = (now = DAY1) => ({ now, quests: [] });
const fresh = (s, now = DAY1) => ({ ...s, stamina: 100, stamina_at: now.toISOString() });
const opened = () => fresh(walk(newState(content, 'zh', DAY1), TO_OPEN, content, DAY1));
const won = (s, id) => ({ ...s, wins: { ...s.wins, [id]: DAY1.toISOString() } });
function must(fn, s, args, now = DAY1) {
  const out = fn(s, content, ctx(now), args);
  assert.equal(out.result.ok, true, `${fn.name} ${JSON.stringify(args)} at ${s.scene}@${s.place}: ${JSON.stringify(out.result).slice(0, 300)}`);
  return out.state ?? s;
}
/* At the stone door with an errand below the mountain in hand (its 令) and a 机缘 live. */
function atDoor() {
  const s = opened();
  const until = new Date(DAY1.getTime() + 2 * 3600000).toISOString();
  return {
    ...s, chapter: '00-waimen', scene: 'wm-mijing', place: 'shimen', wealth: 10,
    done_scenes: [...s.done_scenes, 'wm-ahe', 'wm-jiangtang', 'wm-zhoutian', 'wm-qingshi', 'wm-chaifang', 'wm-danlu', 'wm-diyilu'],
    quests: { ...s.quests, 'xu-ahe-lixi': { took: '2026-09-29', have: { 1: 1 } } },
    pass: { quest: 'xu-ahe-lixi', to: 'fangshi', places: ['fangshi', 'shanlu', 'dukou'] },
    chance: { day: '2026-09-29', place: 'shanlu', until },
  };
}
const inside = () => must(resolve, atDoor(), { exit: 'pay' });

test('the instance is declared in data: rooms, a home, a way-out line, the book\'s days and a goal per scene', () => {
  assert.deepEqual(SEALED.places, ['mijing-kou', 'mijing-xiongya', 'mijing-duanya', 'mijing-yabi', 'mijing-shishi', 'mijing-anhe']);
  assert.equal(SEALED.say.zh, '秘境未开，出不去。');
  const beat = CH.beats.find(b => b.sealed);
  for (const id of beat.scenes.slice(1)) {
    assert.ok(SEALED.places.includes(CH.scenes[id].at), `${id} stands in a room`);
    assert.ok(SEALED.days[id] && SEALED.goals[id]?.zh && SEALED.goals[id]?.en, `${id} has its day and goal`);
  }
  assert.equal(CH.scenes['wm-mijing'].at, 'shimen', 'the entry stands outside, at the door');
  assert.ok(!/秘境|mijing/.test(fs.readFileSync(new URL('../scripts/rules/sealed.mjs', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')), 'no rule names the 秘境');
});

test('entry: through the door he stands in the forking hall, sealed, the 令 and the 机缘 kept', () => {
  const s = inside();
  assert.equal(s.scene, 'wm-wangzuo');
  assert.equal(s.place, SEALED.home);
  assert.equal(s.sealed.id, 'mijing');
  assert.deepEqual(s.pass, atDoor().pass, 'the 令 is frozen, not lost');
  assert.deepEqual(s.chance, atDoor().chance);
});

test('the gate: only the rooms open to him; a way out is refused in the instance\'s own words', () => {
  let s = inside();
  for (const place of ['shimen', 'dukou', 'waimen', 'fangshi']) {
    const r = move(s, content, ctx(), { place });
    assert.equal(r.result.ok, false, place);
    assert.equal(r.result.say, '秘境未开，出不去。', place);
  }
  // The stone chamber is behind the wall: not reachable, and not named, until the wall is open.
  assert.equal(move(s, content, ctx(), { place: 'mijing-shishi' }).result.ok, false);
  const l = look(s, content, ctx());
  assert.deepEqual(l.place.plate.spots.map(p => p.id), ['mijing-kou', 'mijing-xiongya', 'mijing-duanya', 'mijing-yabi']);
  assert.ok(!l.place.plate.file, 'no painting: the 去往 list draws it in ink');
  assert.ok(!JSON.stringify(l.place).includes('mijing-shishi'), 'the chamber is not named before the wall opens');
  assert.deepEqual(l.director.near.map(p => p.id), ['mijing-xiongya']);
  s = must(move, s, { place: 'mijing-duanya' });
  assert.equal(look(s, content, ctx()).scene?.id, 'wm-wangzuo', 'the scene runs in its room');
  s = must(resolve, won(s, 'mijing-gui'), { exit: 'open' });
  assert.equal(s.place, 'mijing-yabi', 'the story carries him to its next room');
  assert.ok(look(s, content, ctx()).place.plate.spots.some(p => p.id === 'mijing-shishi'), 'the wall open, the chamber is on the map');
  // The ink plate: seals on paper, the room he stands in marked.
  const html = plateHtml(look(s, content, ctx()).place.plate, { here: '就在此处' });
  assert.match(html, /class="plate ink"/);
  assert.match(html, /spot here/);
});

test('frozen: Look carries nothing of the world outside, and its verbs are refused', () => {
  const s = inside();
  const l = look(s, content, ctx());
  for (const key of ['offers', 'work', 'visitors', 'chance', 'quests', 'kaifu', 'tale', 'lundao', 'weather', 'season', 'wind']) assert.equal(l[key], undefined, key);
  assert.deepEqual(l.book, []);
  assert.equal(l.place.pass, undefined);
  assert.equal(l.today.festival, null);
  assert.equal(l.today.jieqi, null);
  assert.equal(l.director.choice?.options.some(o => /有差事|交差/.test(o.label)) ?? false, false, 'no errand offered in the chat either');
  const q = VERBS.quest(s, content, ctx(), { action: 'take', id: 'xu-sun-charm' });
  assert.equal(q.result.refused, 'sealed');
  assert.equal(VERBS.seclude(s, content, ctx(), {}).result.refused, 'sealed');
});

test('objectives and header: the scene\'s own goal on the goal line, 「沉鼎秘境 · 第一日 · 岔口」', () => {
  let s = inside();
  let l = look(s, content, ctx());
  assert.equal(l.waypoint.text, '打开那面有风的墙');
  assert.equal(l.waypoint.place?.id, 'mijing-duanya', '下一步 points to the room inside');
  assert.equal(l.sealed.header, '沉鼎秘境 · 第一日');
  assert.equal(l.sealed.where, '岔口');
  s = { ...s, scene: 'wm-kaikai', place: 'mijing-shishi', done_scenes: [...s.done_scenes, 'wm-wangzuo', 'wm-kunzhen', 'wm-xirang'] };
  l = look(s, content, ctx());
  assert.equal(l.sealed.header, '沉鼎秘境 · 第二夜');
  assert.equal(l.sealed.day.unit, 'night');
  assert.equal(l.waypoint.text, '守在土里，等息壤长成');
  const en = look({ ...s, lang: 'en' }, content, ctx());
  assert.equal(en.sealed.header, 'The Sunken Cauldron realm · Night 2');
});

test('backdrop: the room\'s own painting outranks the festival and the 节气; no weather, season or wind over it', () => {
  const table = content.backdrops ?? JSON.parse(fs.readFileSync(new URL('../worlds/jiuding/backdrops.json', import.meta.url), 'utf8'));
  const art = placeArtOf(table, { at: 'mijing-shishi', name: '沉鼎秘境 · 石室' });
  assert.equal(art.src, 'art/places/mijing-shishi.webp');
  const ctxPick = { place: { backdrop: art.src }, festival: { backdrop: 'art/fest/chongyang.webp' }, term: 'hanlu', table: { terms: { hanlu: 'art/terms/hanlu.webp' } }, weather: { kind: 'rain' } };
  assert.equal(stagePick(ctxPick).tier, 'festival', 'outside, the festival wins');
  assert.deepEqual(stagePick({ ...ctxPick, sealed: true }), { tier: 'sealed', art: art.src });
  assert.equal(stagePick({ ...ctxPick, sealed: true, place: null }).art, null, 'no room painting: paper, never the festival');
  for (const id of SEALED.places) assert.ok(placeArtOf(table, { at: id, name: '' }), `${id} has a painting`);
  assert.deepEqual(atmosOf(null, null, { indoor: true }).particles, []);
});

test('exit: the last scene done, he walks back with the others — errands, the 令 and the 机缘 back, its time kept', () => {
  let s = inside();
  const later = new Date(DAY1.getTime() + 30 * 3600000); // a day and more inside
  s = { ...s, scene: 'wm-chu', place: 'mijing-yabi', done_scenes: [...s.done_scenes, 'wm-wangzuo', 'wm-kunzhen', 'wm-xirang', 'wm-kaikai'] };
  assert.equal(look(s, content, ctx(later)).sealed.header, '沉鼎秘境 · 第三日');
  const out = must(resolve, fresh(s, later), { exit: 'rest' }, later);
  assert.equal(out.sealed, undefined, 'the seal let go');
  assert.equal(out.place, CH.map.home, 'back inside the 观');
  assert.deepEqual(out.pass, atDoor().pass, 'the 令 is back');
  assert.equal(out.chance.day, '2026-09-30', 'the 机缘 moved to the day he came out');
  assert.equal(new Date(out.chance.until) - later, 2 * 3600000, 'with the two hours it had left at the door');
  const l = look(out, content, ctx(later));
  assert.equal(l.sealed, undefined);
  assert.ok(l.book.some(q => q.id === 'xu-ahe-lixi'), 'the errand is in the book again');
  assert.equal(l.place.pass?.quest, 'xu-ahe-lixi');
});

test('an old save mid-秘境 (Hanli\'s, 2026-10-15: wm-kunzhen, standing at the door, a 令 held) loads straight into sealed mode', () => {
  const raw = JSON.parse(fs.readFileSync(new URL('./fixtures/saves/mijing-kunzhen.json', import.meta.url), 'utf8'));
  const s = migrate({ lang: 'zh', ...raw }, content);
  const woke = VERBS.look(s, content, ctx(new Date('2026-10-15T15:00:00')), {});
  const saved = woke.state;
  assert.ok(saved, 'the first Look writes the seal on the save');
  assert.equal(saved.place, 'mijing-yabi', 'set in its scene\'s room');
  assert.equal(saved.sealed.id, 'mijing');
  assert.deepEqual(saved.pass, raw.pass, 'the 令 is frozen, not lost');
  const l = woke.result;
  assert.equal(l.scene?.id, 'wm-kunzhen');
  assert.equal(l.place.pass, undefined);
  assert.deepEqual(l.book, []);
  assert.equal(l.sealed.header, '沉鼎秘境 · 第一日');
  assert.equal(l.waypoint.text, '活着从崖口边脱身');
});
