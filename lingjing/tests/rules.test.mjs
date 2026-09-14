// The rules decide. These walk the prologue by exit ids alone — no model —
// and check every refusal leaves the state untouched.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadContent } from '../scripts/content.mjs';
import { langOf, migrate, newState, weekKey } from '../scripts/state.mjs';
import { branch, enter, heed, judge, lang, leave, look, make, move, parseArgs, resolve, summarize, task, win } from '../scripts/rules.mjs';

const content = loadContent();
const NOW = new Date('2026-09-11T12:00:00');
const ctx = (extra = {}) => ({ now: NOW, quests: [], ...extra });
const start = (lang = 'zh') => newState(content, lang, NOW);

/* Apply a verb and insist it was allowed. */
function must(fn, state, args, c = ctx()) {
  const out = fn(state, content, c, args);
  assert.equal(out.result.ok, true, JSON.stringify(out.result));
  return out;
}
function refused(fn, state, args, code, c = ctx()) {
  const out = fn(state, content, c, args);
  assert.equal(out.result.ok, false);
  assert.equal(out.result.refused, code);
  assert.equal(out.state, null, 'a refusal never changes state');
  return out.result;
}

/* The first task offered, its board already won on the page. */
function offerWon(s) {
  s.tasks['alchemy-first'] = { status: 'offered' };
  s.wins['alchemy-first'] = NOW.toISOString();
}

/* Walk to 夫诸 the ordinary way. */
function toFuzhu() {
  let s = start();
  s = must(resolve, s, { exit: 'reach' }).state;
  s = must(resolve, s, { exit: 'name', value: '青玄' }).state;
  s = must(resolve, s, { exit: 'touch' }).state;
  s = must(win, s, { id: 'alchemy-first' }).state;
  s = must(task, s, { action: 'done', id: 'alchemy-first' }).state;
  return must(resolve, s, { exit: 'set-out' }).state;
}

test('a new game starts at the river, 练气一层, nothing in hand', () => {
  const s = start();
  assert.equal(s.scene, '00-river');
  const seen = look(s, content, ctx());
  assert.equal(seen.tier.name, '练气一层');
  assert.equal(seen.scene.buttons.length, 2);
  assert.equal(seen.scene.exits.find(e => e.id === 'leave').button, true);
});

test('the prologue walks from the river to its end by exits alone', () => {
  let s = toFuzhu();
  refused(resolve, s, { exit: 'riddle', answer: '吉' }, 'wrong-answer');
  s = must(resolve, s, { exit: 'riddle', answer: '告' }).state;
  assert.equal(s.scene, '00-north');
  const end = must(resolve, s, { exit: 'rest' });
  s = end.state;
  assert.deepEqual(s.ended, ['00-prologue']);
  assert.equal(s.scene, null);
  assert.equal(s.name, '青玄');
  assert.deepEqual(s.traits, ['wood', 'water', 'fire', 'earth']);
  assert.deepEqual(s.cast, ['fuzhu']);
  assert.equal(s.progress, 70); // alchemy 20 + Fuzhu 50
  assert.equal(s.wealth, 10);
  assert.equal(end.result.ended, '00-prologue');
});

test('the name fills the lines that follow', () => {
  let s = must(resolve, start(), { exit: 'reach' }).state;
  const named = must(resolve, s, { exit: 'name', value: '墨白' });
  assert.equal(named.result.beat[0].text, '墨白。好名字，我记住了。');
  assert.match(named.result.scene.setup, /^墨白，入道之前/);
});

test('a name must be 1 to 8 characters', () => {
  const s = must(resolve, start(), { exit: 'reach' }).state;
  refused(resolve, s, { exit: 'name', value: '   ' }, 'value-invalid');
  refused(resolve, s, { exit: 'name', value: '一二三四五六七八九' }, 'value-invalid');
});

test('the road waits until the practice is done', () => {
  let s = start();
  for (const [exit, extra] of [['reach'], ['name', { value: '青玄' }], ['touch']]) s = must(resolve, s, { exit, ...extra }).state;
  const r = refused(resolve, s, { exit: 'set-out' }, 'needs');
  assert.match(r.say, /丹还没炼成/);
});

test('feeding Fuzhu the leftover lingzhi tames it and uses the herb up', () => {
  const s = toFuzhu();
  assert.equal(s.bag.lingzhi, 1);
  const fed = must(resolve, s, { exit: 'gift' });
  assert.equal(fed.state.bag.lingzhi, undefined);
  assert.deepEqual(fed.state.cast, ['fuzhu']);
  assert.equal(fed.result.beat[1].who, 'fuzhu');
});

test('without the herb the gift is refused in the world', () => {
  const s = toFuzhu();
  delete s.bag.lingzhi;
  const r = refused(resolve, s, { exit: 'gift' }, 'needs');
  assert.equal(r.say, '你身上没有灵芝。');
});

test('staying exits narrate and keep the scene', () => {
  const out = must(resolve, start(), { exit: 'leave' });
  assert.equal(out.state.scene, '00-river');
  assert.equal(out.result.summarize, false);
  assert.equal(must(resolve, start(), { exit: 'reach' }).result.summarize, true);
  assert.match(out.result.beat[0].text, /银光追着你的影子/);
});

test('an unknown exit, a missing answer and an unwon duel are refused', () => {
  const s = toFuzhu();
  refused(resolve, s, { exit: 'fly' }, 'unknown-exit');
  refused(resolve, s, { exit: 'riddle' }, 'needs-answer');
  refused(resolve, s, { exit: 'duel' }, 'game-not-won');
});

test('only the page witnesses a win, and a win pays once', () => {
  const s = toFuzhu();
  refused(resolve, s, { exit: 'duel', won: true }, 'game-not-won');
  refused(win, s, { id: 'chess-anywhere' }, 'not-here');
  const won = must(win, s, { id: 'xiangqi-endgame' }).state;
  assert.equal(look(won, content, ctx()).scene.exits.find(e => e.id === 'duel').won, true);
  const out = must(resolve, won, { exit: 'duel' });
  assert.equal(out.state.scene, '00-north');
  assert.deepEqual(out.state.wins, {});
});

test('an in-world task pays only after the page recorded its win', () => {
  let s = start();
  for (const [exit, extra] of [['reach'], ['name', { value: '青玄' }], ['touch']]) s = must(resolve, s, { exit, ...extra }).state;
  refused(task, s, { action: 'done', id: 'alchemy-first' }, 'not-won');
  s = must(win, s, { id: 'alchemy-first' }).state;
  assert.equal(look(s, content, ctx()).tasks[0].won, true);
  const done = must(task, s, { action: 'done', id: 'alchemy-first' });
  assert.equal(done.state.bag.lingzhi, 1);
  refused(win, done.state, { id: 'alchemy-first' }, 'not-here');
});

test('every line carries its speaker’s name; Ling narrates unnamed', () => {
  const s = toFuzhu();
  const scene = look(s, content, ctx()).scene;
  assert.deepEqual(scene.cast, [{ id: 'yinyue', name: '银月' }, { id: 'fuzhu', name: '夫诸' }]);
  assert.equal(scene.lines[0].name, '银月');
  const out = must(resolve, s, { exit: 'riddle', answer: '告' });
  assert.equal(out.result.beat[0].name, '夫诸');
  assert.equal(must(resolve, start('en'), { exit: 'leave' }).result.beat[0].name, null);
});

test('answers are judged in either language, punctuation and articles aside', () => {
  const s = start('en');
  assert.equal(must(judge, s, { key: 'fuzhu-1', answer: 'An egg!' }).result.right, true);
  assert.equal(must(judge, s, { key: 'fuzhu-1', answer: '告' }).result.right, true);
  assert.equal(must(judge, s, { key: 'fuzhu-1', answer: 'a promise' }).result.right, false);
});

test('a layer fills and the next begins, the rest carried over', () => {
  const s = start();
  s.progress = 90;
  offerWon(s);
  const out = must(task, s, { action: 'done', id: 'alchemy-first' });
  assert.equal(out.state.step, 1);
  assert.equal(out.state.progress, 10);
  assert.deepEqual(out.result.paid.levels, [{ from: '练气一层', to: '练气二层' }]);
});

test('at the realm peak the player holds until the chapter opens', () => {
  const s = start();
  s.step = 8; s.progress = 250;
  offerWon(s);
  const out = must(task, s, { action: 'done', id: 'alchemy-first' });
  assert.equal(out.state.progress, 260);
  assert.deepEqual(out.result.paid.hold, { gate: 1 });
});

test('the day caps what can be earned', () => {
  const s = start();
  s.day.progress = 230; // cap 240
  offerWon(s);
  const out = must(task, s, { action: 'done', id: 'alchemy-first' });
  assert.equal(out.result.paid.progress, 10);
  assert.equal(out.result.paid.capped, true);
});

test('a later realm pays more for the same task; the day cap counts base', () => {
  const s = start();
  s.tier = 'deity'; s.step = 0; s.progress = 0; // 化神, pay ×3
  offerWon(s);
  const out = must(task, s, { action: 'done', id: 'alchemy-first' });
  assert.equal(out.result.paid.progress, 60); // 20 base × 3
  assert.equal(out.state.progress, 60);
  assert.equal(out.state.day.progress, 20);
  assert.equal(out.result.paid.capped, false);
});

test('a story step costs 灵气; an empty 丹田 refuses with the hour and changes nothing', () => {
  let s = start();
  assert.equal(s.stamina, 100);
  s = must(resolve, s, { exit: 'reach' }).state;
  assert.equal(s.stamina, 90);
  s.stamina = 5; s.stamina_at = NOW.toISOString();
  const r = refused(resolve, s, { exit: 'name', value: '青玄' }, 'no-stamina');
  assert.equal(r.cost, 10);
  // 5 points short at 20 an hour = 15 minutes
  assert.equal(new Date(r.returns_at).getTime(), NOW.getTime() + 15 * 60_000);
  assert.match(r.say, /丹田已空/);
  const seen = look(s, content, ctx());
  assert.equal(seen.stamina.empty, true);
  assert.equal(seen.stamina.returns_at, r.returns_at);
});

test('灵气 refills by the clock, whole points, never over the top', () => {
  const s = start();
  s.stamina = 40; s.stamina_at = NOW.toISOString();
  const later = look(s, content, ctx({ now: new Date(NOW.getTime() + 90 * 60_000) }));
  assert.equal(later.stamina.now, 70); // 1.5 h × 20
  const full = look(s, content, ctx({ now: new Date(NOW.getTime() + 24 * 3600_000) }));
  assert.equal(full.stamina.now, 100);
  // an old save with no 灵气 wakes full
  delete s.stamina; delete s.stamina_at;
  assert.equal(look(s, content, ctx()).stamina.now, 100);
});

test('a checked quest refills 灵气 — the app\'s own amount, capped', () => {
  const s = start();
  s.stamina = 80; s.stamina_at = NOW.toISOString();
  const quests = [{ id: 'health-workout', app: 'health', period: 'day', due: true, done_at: NOW.toISOString(), reward: 20, stamina: 30 }];
  const out = must(task, s, { action: 'check', id: 'health-workout' }, ctx({ quests }));
  assert.equal(out.result.stamina, 20); // 80 + 30, capped at 100
  assert.equal(out.state.stamina, 100);
});

test('a 奇遇 grows from a seed of the province — by the day, unused first', () => {
  let s = start();
  s.name = '青玄';
  const one = must(branch, s, { action: 'open', kind: 'province-tale' });
  const seed = one.result.seed;
  assert.match(seed.id, /^xu-/);
  assert.ok(seed.line && seed.source);
  assert.deepEqual(one.state.seeds_used, [seed.id]);
  assert.equal(one.state.branch.seed, seed.id);
  // the same day, the same player: the same seed
  const again = must(branch, s, { action: 'open', kind: 'province-tale' });
  assert.equal(again.result.seed.id, seed.id);
  // once used, the day moves to another
  s = must(branch, one.state, { action: 'close', progress: 5, wealth: 0 }).state;
  const next = must(branch, s, { action: 'open', kind: 'province-tale' });
  assert.notEqual(next.result.seed.id, seed.id);
  // a seed with a creature shows its card
  const withCard = content.seeds['徐'].seeds.find(x => x.creature);
  assert.equal(withCard.creature, 'fuzhu');
});

test('Make with nothing is the template; a scene in its shape is kept and played; a bad one is refused with its problems', () => {
  let s = start('en');
  const t = make(s, content, ctx(), {}).result;
  assert.equal(t.ok, true);
  assert.equal(t.template.id, 'made-ferry');
  assert.ok(Array.isArray(t.rules) && t.rules.length);
  assert.equal(JSON.stringify(t.template).includes('"_'), false, 'notes are stripped');
  // the template itself is playable — its `gift` exit needs a second scene, so make that first
  const second = { id: 'made-ferry-2', chapter: 'made', place: { en: 'Midstream' }, setup: { en: 'The boat is midstream.' },
    exits: [{ id: 'land', label: { en: 'Land' }, means: 'lands, steps off', ends: 'made' }] };
  s = must(make, s, { scene: JSON.stringify(second) }).state;
  s = must(make, s, { scene: JSON.stringify(t.template) }).state;
  assert.equal(s.stamina, 90); // 5 each
  assert.deepEqual(Object.keys(s.made.scenes).sort(), ['made-ferry', 'made-ferry-2']);
  // enter it; the spine keeps its place
  s = must(enter, s, { scene: 'made-ferry' }).state;
  assert.equal(look(s, content, ctx()).scene.id, 'made-ferry');
  assert.equal(s.scene, '00-river');
  // an exit that stays, then one that ends: home again, paid within the branch table
  s = must(resolve, s, { exit: 'ask' }).state;
  const out = must(resolve, s, { exit: 'cross' });
  assert.equal(out.result.paid.progress, 10);
  assert.equal(out.state.made.at, null);
  assert.equal(look(out.state, content, ctx()).scene.id, '00-river');
  // refusals: a forbidden field, a grant off the branch table, a next that does not exist
  const bad = { ...second, id: 'made-bad', exits: [{ id: 'x', means: 'x', key: 'riddle', grant: { table: 'scene', progress: 50 }, next: 'made-nowhere' }] };
  const r = refused(make, s, { scene: JSON.stringify(bad) }, 'not-playable');
  assert.ok(r.problems.some(p => /may not use key/.test(p)));
  assert.ok(r.problems.some(p => /grant only from branch/.test(p)));
  refused(make, s, { scene: '{not json' }, 'not-json');
  refused(enter, s, { scene: 'made-nowhere' }, 'unknown-scene');
  refused(leave, out.state, {}, 'not-in-made'); // home already
  assert.equal(must(leave, s, {}).state.made.at, null); // from inside, straight home
});

test('a task pays once; one never offered cannot be claimed', () => {
  refused(task, start(), { action: 'done', id: 'alchemy-first' }, 'not-offered');
  const s = toFuzhu();
  refused(task, s, { action: 'done', id: 'alchemy-first' }, 'already-done');
});

test('a quest pays when its app says it was done this period, once', () => {
  const quest = { id: 'shifu-scan', app: 'apple-shifu', period: 'week', due: true, reward: 30, title: { zh: '扫描', en: 'Scan' } };
  const done = ctx({ quests: [{ ...quest, done_at: '2026-09-10T09:00:00' }] });
  const s = start();
  const seen = look(s, content, done).quests[0];
  assert.deepEqual([seen.done, seen.paid], [true, false], 'Look shows the app\'s record before anyone asks');
  const paid = must(task, s, { action: 'check', id: 'shifu-scan' }, done);
  assert.equal(paid.result.paid.progress, 30);
  assert.equal(paid.state.quests['shifu-scan'].period, weekKey(NOW));
  assert.equal(look(paid.state, content, done).quests[0].paid, true);
  refused(task, paid.state, { action: 'check', id: 'shifu-scan' }, 'already-paid', done);
  const lastWeek = ctx({ quests: [{ ...quest, done_at: '2026-09-02T09:00:00' }] });
  refused(task, s, { action: 'check', id: 'shifu-scan' }, 'not-done', lastWeek);
});

test('a branch opens alone, counts its turns and pays within its cap', () => {
  let s = must(branch, start(), { action: 'open', kind: 'night-tale' }).state;
  refused(branch, s, { action: 'open', kind: 'province-tale' }, 'branch-open');
  s = must(branch, s, { action: 'turn' }).state;
  const closed = must(branch, s, { action: 'close', progress: '500', wealth: '99' });
  assert.equal(closed.result.paid.progress, 20);
  assert.equal(closed.result.paid.wealth, 5);
  assert.equal(closed.state.branch, null);
});

test('the story summary has a length limit', () => {
  refused(summarize, start(), { text: '字'.repeat(601) }, 'too-long');
  assert.equal(must(summarize, start(), { text: '青玄在泗水边醒来。' }).state.story, '青玄在泗水边醒来。');
});

test('switching language returns the scene in it; the same language writes nothing', () => {
  const out = must(lang, start('zh'), { lang: 'en' });
  assert.equal(out.state.lang, 'en');
  assert.equal(out.result.changed, true);
  assert.equal(out.result.scene.place, 'The bank of the Si River');
  const same = must(lang, start('zh'), { lang: 'zh' });
  assert.equal(same.state, null);
  assert.equal(same.result.changed, false);
  assert.equal(same.result.scene.place, '泗水之畔');
});

test('the player’s words set the language; a tap, an emoji or the page’s report do not', () => {
  assert.equal(langOf('我伸手去摸那道光'), 'zh');
  assert.equal(langOf('call me Mobai'), 'en');
  assert.equal(langOf('hi'), 'en');
  assert.equal(langOf('ok 好'), 'zh');
  for (const quiet of ['', '👍', '42', '[scene] won alchemy-first', null]) assert.equal(langOf(quiet), null);
  const zh = start('zh');
  assert.equal(heed(zh, '伸手入水'), zh, 'a tapped Chinese label leaves a Chinese game alone');
  assert.equal(heed(zh, 'where am I?').lang, 'en');
  assert.equal(zh.lang, 'zh', 'heed never mutates');
});

test('Look carries the world’s words for the harness’s ids, in the player’s language', () => {
  const en = look(start('en'), content, ctx());
  assert.equal(en.words.progress, 'cultivation');
  assert.equal(en.words.wealth, 'spirit stones');
  assert.equal(en.words.pool, 'dantian');
  assert.deepEqual(en.words.tiers.slice(0, 3), ['Qi Condensation', 'Foundation Establishment', 'Core Formation']);
  const zh = look(start('zh'), content, ctx());
  assert.equal(zh.words.progress, '修为');
  assert.equal(zh.words.stamina, '灵气');
});

test('a save from before the dictionary migrates to the ids', () => {
  const old = { version: 1, lang: 'zh', daohao: '青玄', root: ['wood'], realm: 'qi', stage: 2, xw: 30, ls: 5, beasts: ['fuzhu'], qi: 40, qi_at: NOW.toISOString(),
    bag: {}, chapter: '00-prologue', scene: '00-practice', done_scenes: [], ended: [], tasks: {}, quests: {}, wins: {}, branch: null, story: '', day: { key: '2026-09-11', xw: 30, ls: 5, branches: 0 } };
  const m = migrate(old);
  assert.equal(m.version, 3);
  assert.equal(m.world, 'jiuding', 'a save from before worlds was playing 《九鼎》');
  assert.equal(m.name, '青玄'); assert.deepEqual(m.traits, ['wood']); assert.equal(m.tier, 'qi'); assert.equal(m.step, 2);
  assert.equal(m.progress, 30); assert.equal(m.wealth, 5); assert.deepEqual(m.cast, ['fuzhu']); assert.equal(m.stamina, 40);
  assert.deepEqual(m.day, { key: '2026-09-11', progress: 30, wealth: 5, branches: 0 });
  assert.equal(m.xw, undefined);
  assert.equal(look(m, content, ctx()).tier.name, '练气三层');
});

test('a new save says its world, and Look carries the world card', () => {
  const s = start();
  assert.equal(s.world, 'jiuding');
  assert.deepEqual(look(s, content, ctx()).world, { id: 'jiuding', title: '九鼎', style: '修仙 · 凡人流' });
  assert.equal(look(start('en'), content, ctx()).world.title, 'The Nine Cauldrons');
});

test('a made scene with a novel\'s name is not playable', () => {
  let s = toFuzhu();
  const scene = { id: 'made-sect', chapter: 'made', place: { zh: '黄枫谷山门' }, setup: { zh: '一座山门。' },
    exits: [{ id: 'home', means: 'go home', ends: 'made' }], buttons: [] };
  const r = refused(make, s, { scene: JSON.stringify(scene) }, 'not-playable');
  assert.ok(r.problems.some(p => p.includes('names 黄枫谷 (凡人修仙传)')), JSON.stringify(r.problems));
});

test('a province is known by its character, its name or its English', () => {
  for (const province of ['徐', '徐州', 'Xu', 'xu']) assert.equal(must(move, start(), { province }).result.here, true);
  assert.equal(refused(move, start('en'), { province: 'Ji' }, 'road-closed').say, 'That road has not opened yet.');
});

test('a closed road is refused in the world', () => {
  const r = refused(move, start(), { province: '冀州' }, 'road-closed');
  assert.equal(r.say, '冀州的路还没开。');
});

test('look carries the day’s omen and the offered tasks', () => {
  let s = start();
  for (const [exit, extra] of [['reach'], ['name', { value: '青玄' }], ['touch']]) s = must(resolve, s, { exit, ...extra }).state;
  const seen = look(s, content, ctx());
  assert.ok(seen.omen.name && seen.omen.lines.length === 6);
  assert.deepEqual(seen.tasks.map(t => [t.id, t.status]), [['alchemy-first', 'offered']]);
});

test('placeholder arguments the agent left unfilled are dropped', () => {
  assert.deepEqual(parseArgs(['--exit', 'riddle', '--answer', '{{answer}}', '--won', 'true']), { exit: 'riddle', won: true });
});

test('--key=value is read whole, and an omitted arg (empty) is dropped', () => {
  assert.deepEqual(parseArgs(['--exit=riddle', '--value=', '--answer=一口 = 告', '--text=a\nb']), { exit: 'riddle', answer: '一口 = 告', text: 'a\nb' });
});

test('the command line keeps state on disk, logs it and undoes it', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lingjing-'));
  const env = { ...process.env, LINGJING_DATA: data, LINGJING_QUESTS: path.join(data, 'none'), LINGJING_NOW: NOW.toISOString() };
  const cli = (...args) => JSON.parse(spawnSync(process.execPath, ['scripts/rules.mjs', ...args], { cwd: path.resolve(import.meta.dirname, '..'), env, encoding: 'utf8' }).stdout);
  assert.deepEqual(cli('init', '--world=nowhere'), { ok: false, refused: 'unknown-world', world: 'nowhere', worlds: ['jiuding'] });
  assert.equal(cli('init', '--lang', 'en').world.id, 'jiuding');
  assert.equal(cli('look').scene.id, '00-river');
  assert.equal(JSON.parse(fs.readFileSync(path.join(data, 'state.json'), 'utf8')).world, 'jiuding');
  assert.equal(cli('resolve', '--exit', 'reach', '--answer', '{{answer}}').scene.id, '00-waking');
  assert.equal(cli('look').scene.id, '00-waking');
  assert.equal(cli('resolve', '--exit', 'nowhere').refused, 'unknown-exit');
  assert.equal(cli('undo').undid, 'resolve');
  assert.equal(cli('look').scene.id, '00-river');
  // What the engine renders for an omitted optional arg: an empty --key=.
  const sh = spawnSync('sh', ['-c', `"${process.execPath}" scripts/rules.mjs resolve --exit='reach' --value= --answer=`], { cwd: path.resolve(import.meta.dirname, '..'), env, encoding: 'utf8' });
  assert.equal(JSON.parse(sh.stdout).scene.id, '00-waking');
  // Words in the other language switch the game before the verb reads it.
  const heard = cli('look', '--said=我在哪里？');
  assert.equal(heard.lang, 'zh');
  assert.equal(heard.lang_set, 'zh');
  assert.equal(cli('look', '--said=伸手').lang_set, undefined);
  fs.rmSync(data, { recursive: true, force: true });
});
