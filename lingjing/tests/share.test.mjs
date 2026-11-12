// 传音 — a daily 人间功课 paid by the act of sharing (Hanli, 2026-11-10: 「分享动作就给奖励」): the game's own menu
// (scripts/quest.mjs), the page-only `quest share` (rules/share.mjs), the kind's own pay (gongke.json `own`, chores.mjs
// ownOf) — once a day, 修为 and 灵石 that land whatever else the day paid, neither taking nor counting a day's share slot.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { lint, loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { VERBS, look } from '../scripts/rules.mjs';
import { WORDS, agendaRowHtml } from '../scripts/cards.js';
import { choreGo, choreGrant, ownOf, ownXiuwei } from '../scripts/rules/chores.mjs';
import { storyPlay } from '../scripts/rules/playpay.mjs';
import { MENU, SHARE, merged, publish, stamp, stampCli, turnOf } from '../scripts/quest.mjs';
import { TO_WAIMEN, walk } from './prologue.mjs';

const content = loadContent();
// Three small games where he stands (Hanli 2026-11-10: 「传音改成真正的3倍」; gongke.json share.own `games` 3): a story step's
// 体力 as small-game play, × R × play_pay.xiuwei.board — 90 at 练气一层 with today's knobs (18 when it was 9 units unfactored).
const X = content.balance.play_pay.xiuwei, OWN = content.gongke.kinds.share.own, GAME = content.balance.play_pay.story.units;
const XW = Math.round(OWN.games * GAME * X.rate.base * X.board);
// …and three small games' 灵石 (batch 2): a small game's play 灵石 (play_pay.wealth.default, minutes of income) × I at 练气一层 —
// 6 with today's earn knob (11 before it; 15, a flat number, until 2026-11-10).
const WS = Math.round(OWN.games * content.balance.play_pay.wealth.default * content.balance.economy.income.first * content.balance.economy.earn);
const ROOT = path.resolve(import.meta.dirname, '..');
const NOW = new Date('2026-11-10T12:00:00');
const T = id => ({ zh: `做${id}`, en: `Do ${id}` });
const chore = (id, kind, extra = {}) => ({ id, app: 'some-app', period: 'day', due: true, reward: 20, stamina: 10, device: 'mac', done_at: '2026-11-10T09:00:00', title: T(id), ...(kind ? { kind } : {}), ...extra });
const row = (done = '2026-11-10T09:30:00') => ({ ...merged(null, {}, MENU, NOW).quests[0], app: 'lingjing', done_at: done });
const ctxOf = (quests, now = NOW) => ({ now, quests });
const joined = () => walk(newState(content, 'zh', NOW), TO_WAIMEN, content, NOW);
const turn = (s, quests, id, now = NOW) => VERBS.quest(s, content, ctxOf(quests, now), { action: 'turn', id });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lingjing-share-'));
const withQuests = (dir, fn) => {
  const was = process.env.LINGJING_QUESTS;
  process.env.LINGJING_QUESTS = dir;
  try { return fn(); } finally { if (was === undefined) delete process.env.LINGJING_QUESTS; else process.env.LINGJING_QUESTS = was; }
};

test('the table lints; the share is a daily kind that pays by its own, with no meaning pay for the day\'s cap to meet', () => {
  assert.deepEqual(lint(content), []);
  const m = content.gongke.kinds.share;
  assert.deepEqual([m.name.zh, m.name.en], ['传音', 'Sending word']);
  assert.match(m.about.zh, /道不孤，必有邻/);
  assert.equal(m.ls ?? m.wealth ?? m.progress ?? m.item ?? m.week, undefined);
  assert.equal(MENU[0].period, 'day');
  assert.equal(MENU[0].kind, 'share');
  assert.equal(ownOf(content, row()), m.own);
  assert.equal(ownOf(content, { ...row(), period: 'once' }), null, '开府 never');
  const bad = structuredClone(content);
  bad.gongke.kinds.share.ls = 2;
  bad.gongke.kinds.share.own.ls = 999;
  assert.match(lint(bad).join('\n'), /gongke share.*own pays over its table/);
  assert.match(lint(bad).join('\n'), /gongke share.*adds no meaning pay/);
});

test('a share pays three small games\' 修为 where he stands (90 at 练气一层) and three small games\' 灵石, once a day: a second pays nothing, the next day pays again', () => {
  const s = { ...joined(), step: 1, progress: 0 };
  const g = choreGrant(content, row(), s, NOW);
  assert.deepEqual([g.progress, g.wealth, g.stamina], [XW, WS, 0]);
  assert.equal(OWN.games, 3);
  assert.equal(XW, 90, 'three small games at 练气一层 (30 each) with today\'s knobs');
  // …at every layer: three times what one small game pays there (rules/playpay.mjs storyPlay), rising with the layer.
  for (const step of [1, 5, 9]) {
    const at = { tier: 'qi', step };
    assert.ok(Math.abs(Math.round(ownXiuwei(content, at, OWN)) - 3 * storyPlay(content, at)) <= 1, `练气${step}层`);
  }
  assert.ok(ownXiuwei(content, { tier: 'qi', step: 9 }, OWN) > ownXiuwei(content, { tier: 'qi', step: 5 }, OWN));
  const quests = [row()];
  const one = turn(s, quests, SHARE);
  assert.equal(one.result.ok, true);
  assert.deepEqual([one.result.paid.progress, one.result.paid.wealth], [XW, WS]);
  assert.equal(one.state.wealth, s.wealth + WS);
  assert.equal(one.state.progress, s.progress + XW);
  assert.equal(one.result.meaning.name, '传音');
  assert.deepEqual([one.result.meaning.paid.progress, one.result.meaning.paid.wealth], [0, 0], 'the pay is the chore\'s own, not the meaning\'s');
  const again = turn(one.state, quests, SHARE);
  assert.deepEqual([again.result.ok, again.result.refused], [false, 'already-paid']);
  assert.equal(again.state, null);
  const next = new Date('2026-11-11T12:00:00');
  const tomorrow = turn(one.state, [row('2026-11-11T09:00:00')], SHARE, next);
  assert.deepEqual([tomorrow.result.ok, tomorrow.result.paid.progress, tomorrow.result.paid.wealth], [true, XW, WS]);
});

test('it lands whole when the day\'s meaning cap is already spent', () => {
  let s = { ...joined(), step: 1, progress: 0 };
  const cap = content.gongke.per_day;
  // A pre-rotation save may have already filled today's meaning cap.
  s = { ...s, gongke: { day: { key: '2026-11-10', ls: cap.ls, units: cap.units, items: cap.items, wealth: 0, progress: 0 } } };
  const quests = [row()];
  assert.ok(s.gongke.day.units >= cap.units && s.gongke.day.ls >= cap.ls, 'the cap is met');
  const seen = { ...s.gongke.day };
  const out = turn(s, quests, SHARE);
  assert.deepEqual([out.result.paid.progress, out.result.paid.wealth], [XW, WS]);
  assert.deepEqual(out.state.gongke.day, seen, 'it neither used the cap nor was held by it');
  assert.equal(out.state.chores[SHARE].apart, true);
});

test('it takes no 修为 share of the day and counts toward none: a daily paid first or after still pays its share', () => {
  const s = { ...joined(), step: 1, progress: 0 };
  const daily = chore('a-daily', null), other = chore('a-other', null), quests = [row(), daily, other];
  assert.ok(choreGrant(content, daily, s, NOW).progress > 0);
  const afterShare = turn(s, quests, SHARE).state;
  assert.equal(choreGrant(content, daily, afterShare, NOW).progress, choreGrant(content, daily, s, NOW).progress, 'a share first leaves the daily its share');
  const afterDaily = turn(s, quests, 'a-daily').state;
  assert.equal(choreGrant(content, other, afterDaily, NOW).progress, 0, 'a second daily gets none (shares_per_day is 1)');
  assert.equal(turn(afterDaily, quests, SHARE).result.paid.progress, XW, 'but the share is paid whole after one');
});

test('a save without the new field (a chore record with no `apart`) loads and counts as before', () => {
  const s = { ...joined(), step: 1 };
  const old = { ...s, chores: { 'a-daily': { period: '2026-11-10', paid_at: NOW.toISOString() } } };
  assert.equal(turn(old, [row(), chore('a-daily', null)], SHARE).result.paid.progress, XW);
  assert.equal(choreGrant(content, chore('a-other', null), old, NOW).progress, 0, 'an old record is a share taken, as before');
});

test('quest share (the page): stamps the game\'s menu and hands the row in at once; a second the same day stamps, pays nothing', () => {
  const dir = tmp();
  withQuests(dir, () => {
    const s = { ...joined(), step: 1, progress: 0 };
    const first = VERBS.quest(s, content, ctxOf([]), { action: 'share' });
    assert.equal(first.result.ok, true);
    assert.deepEqual([first.result.shared, first.result.turned, first.result.paid.progress, first.result.paid.wealth], [true, SHARE, XW, WS]);
    const file = JSON.parse(fs.readFileSync(path.join(dir, 'lingjing.json'), 'utf8'));
    assert.equal(file.app, 'lingjing');
    assert.equal(file.quests[0].id, SHARE);
    assert.equal(new Date(file.quests[0].done_at).getTime(), NOW.getTime());
    const second = VERBS.quest(first.state, content, ctxOf([], new Date('2026-11-10T18:00:00')), { action: 'share' });
    assert.deepEqual([second.result.ok, second.result.refused], [false, 'already-paid']);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'lingjing.json'), 'utf8')).quests[0].done_at, new Date('2026-11-10T18:00:00').toISOString(), 'the later share is stamped');
  });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('quest share is shut before 入门, and Ling and 银月 can never report one', () => {
  const dir = tmp();
  withQuests(dir, () => {
    const raw = newState(content, 'zh', NOW);
    const early = VERBS.quest(raw, content, ctxOf([]), { action: 'share' });
    assert.deepEqual([early.result.ok, early.result.refused, early.result.system], [false, 'not-yet', 'chores']);
    assert.equal(early.state, null);
    assert.equal(fs.existsSync(path.join(dir, 'lingjing.json')), false, 'nothing stamped either');
    const menu = VERBS.quest(raw, content, ctxOf([]), { action: 'menu' });
    assert.deepEqual([menu.result.ok, menu.result.kept], [true, true], 'but the menu is put out, shut to none');
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'lingjing.json'), 'utf8')).quests[0].id, SHARE);
    for (const reader of ['ling', 'yinyue']) {
      const out = VERBS.quest({ ...joined(), step: 1 }, content, { ...ctxOf([]), reader }, { action: 'share' });
      assert.deepEqual([out.result.ok, out.result.refused], [false, 'page-only'], reader);
    }
  });
  fs.rmSync(dir, { recursive: true, force: true });
  const run = spawnSync(process.execPath, ['-e', "import('./scripts/rules.mjs').then(m => console.log(m.pageOnly('quest', { action: 'share' }), m.pageOnly('quest', { action: 'menu' }), m.pageOnly('quest', { action: 'turn' })))"], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(run.stdout.trim(), 'true true false');
});

test('share words alternate by local day and a menu refresh preserves the stamp', () => {
  const first = new Date(2026, 10, 10, 9), next = new Date(2026, 10, 11, 9);
  const body = merged(null, { [SHARE]: first.toISOString() }, MENU, first);
  const refreshed = merged(body, {}, MENU, next);
  const a = body.quests[0], b = refreshed.quests[0];
  assert.notEqual(turnOf(first), turnOf(next));
  assert.equal(turnOf(first), turnOf(new Date(2026, 10, 10, 23)));
  assert.deepEqual(a.title, MENU[0].turns[turnOf(first)].title);
  assert.deepEqual(b.title, MENU[0].turns[turnOf(next)].title);
  assert.notDeepEqual(a.title, b.title);
  assert.equal(b.done_at, first.toISOString());
  assert.equal(b.go, 'qian');
  assert.equal('turns' in b, false);
  assert.deepEqual(b.how, MENU[0].turns[turnOf(next)].how);
});

test('reading chores shows today’s words without changing yesterday’s file', async () => {
  const { readQuests } = await import('../scripts/rules/files.mjs');
  const dir = tmp(), today = new Date(), yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1, 12);
  const file = path.join(dir, 'lingjing.json');
  const original = JSON.stringify(merged(null, { [SHARE]: yesterday.toISOString() }, MENU, yesterday));
  fs.writeFileSync(file, original);
  withQuests(dir, () => {
    const seen = readQuests().find(q => q.id === SHARE);
    assert.notDeepEqual(JSON.parse(original).quests[0].title, MENU[0].turns[turnOf(today)].title);
    assert.deepEqual(seen.title, MENU[0].turns[turnOf(today)].title);
    assert.deepEqual(seen.how, MENU[0].turns[turnOf(today)].how);
    assert.equal(seen.done_at, yesterday.toISOString());
    assert.equal(fs.readFileSync(file, 'utf8'), original);
  });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the menu: written once, a stamp never moves a time back, a bad stamp is refused, an unknown entry stays', () => {
  const dir = tmp();
  publish({ dir });
  const first = fs.readFileSync(path.join(dir, 'lingjing.json'), 'utf8');
  publish({ dir });
  assert.equal(fs.readFileSync(path.join(dir, 'lingjing.json'), 'utf8'), first, 'nothing moved, nothing written');
  assert.equal(JSON.parse(first).quests[0].done_at, null);
  assert.equal(stampCli(SHARE, '2026-11-10T10:00:00Z', { dir }), 0);
  assert.equal(stampCli(SHARE, '2026-11-10T08:00:00Z', { dir }), 0, 'held already: exit 0');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'lingjing.json'), 'utf8')).quests[0].done_at, '2026-11-10T10:00:00.000Z');
  assert.equal(stampCli('lingjing-nope', '2026-11-10T10:00:00Z', { dir }), 1);
  assert.equal(stampCli(SHARE, 'yesterday', { dir }), 1);
  assert.throws(() => stamp('lingjing-nope', { dir }));
  const keep = merged({ quests: [{ id: 'other-x', done_at: null }] }, {}).quests.map(q => q.id);
  assert.deepEqual(keep, [SHARE, 'other-x']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a scratch save without a menu folder of its own never writes the real quests folder', () => {
  const data = tmp();
  const code = "import('./scripts/rules/files.mjs').then(m => console.log(JSON.stringify(m.questsWriteDir())))";
  const run = env => JSON.parse(spawnSync(process.execPath, ['-e', code], { cwd: ROOT, env: { ...process.env, LINGJING_QUESTS: '', LINGJING_DATA: data, ...env }, encoding: 'utf8' }).stdout);
  assert.equal(run({ LINGJING_SAVE: 'cc-share' }), null);
  fs.mkdirSync(path.join(data, 'saves', 'cc-share', 'quests'), { recursive: true });
  assert.equal(run({ LINGJING_SAVE: 'cc-share' }), path.join(data, 'saves', 'cc-share', 'quests'));
  assert.equal(run({ LINGJING_SAVE: '' }), path.join(os.homedir(), '.linggen', 'quests'));
  assert.equal(run({ LINGJING_SAVE: 'cc-share', LINGJING_QUESTS: '/x/q' }), '/x/q');
  fs.rmSync(data, { recursive: true, force: true });
});

test('the board row: 传音, the app\'s words, and what it pays shown before it is handed in', async () => {
  const { gongkeBoard } = await import('../scripts/rules/gongke.mjs');
  const { questDone } = await import('../scripts/rules/chores.mjs');
  const s = { ...joined(), step: 1 };
  const board = gongkeBoard(content, s, [row()], NOW, 'zh', questDone);
  const r = board.rows[0];
  assert.deepEqual([r.name, r.done, r.paid], ['传音', true, false]);
  assert.deepEqual(r.pays, { progress: XW, wealth: WS });
  assert.deepEqual(r.adds, { progress: 0, wealth: 0 });
});

test('the page: 分享, 拷贝图片 and 保存图片 each report the share once when they finish — and not when they do not', async () => {
  const { shareRun } = await import('../scripts/qian-page.js');
  const p = { blob: 'png', d: { day: '2026-11-10', n: 7 } };
  const tick = () => new Promise(ok => setTimeout(ok, 0));
  const run = async (kind, act, extra = {}) => {
    const said = [], shown = [], failed = [];
    shareRun(kind, p, 'mine', { act, shared: w => said.push(w), done: w => shown.push(w), fail: e => failed.push(e?.name ?? String(e)), ...extra });
    await tick();
    return { said, shown, failed };
  };
  const ok = { sharePng: async () => 'shared', copyPng: async () => 'copied', savePng: () => 'saved' };
  for (const [kind, what] of [['share', 'shared'], ['copy', 'copied'], ['save', 'saved']]) {
    const r = await run(kind, ok);
    assert.deepEqual([r.said, r.shown, r.failed], [[what], [what], []], kind);
  }
  // a sheet closed unshared (AbortError), a clipboard refused, a save that throws: no share
  const abort = Object.assign(new Error('closed'), { name: 'AbortError' });
  assert.deepEqual((await run('share', { ...ok, sharePng: async () => { throw abort; } })).said, []);
  assert.deepEqual((await run('copy', { ...ok, copyPng: async () => { throw new Error('denied'); } })).said, []);
  assert.deepEqual((await run('save', { ...ok, savePng: () => { throw new Error('no'); } })).said, []);
  // a sandboxed frame that saves nothing: shown, not a share
  const blocked = await run('save', ok, { canSave: false });
  assert.deepEqual([blocked.said, blocked.shown], [[], ['saveBlocked']]);
  // a report that throws never hides the picture
  const loud = await run('copy', ok, { shared: () => { throw new Error('x'); } });
  assert.deepEqual(loud.shown, ['copied']);
});

test('the page hands every report to the rules once and tells her the facts of what landed; the menu is put out at load', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/lingjing.js'), 'utf8');
  assert.match(src, /onShared: \(\) => run\('shared', sharedOut\)/);
  assert.match(src, /write\('quest', \{ action: 'share' \}\)/);
  assert.match(src, /verb\('quest', \{ action: 'menu' \}\)/);
  assert.match(src, /if \(r\.meaning\) tellGongke\(r\);/);
  assert.match(src, /\(r\.paid\?\.wealth \?\? 0\)/, 'what landed counts the chore\'s own pay');
});

/* 去分享: the row names a page action (`go`), set from the game's own menu; the page and the phone map the word. */
test('the share row carries its page action in Look while it is not paid, and not once paid; the menu sets it, the rules name no app', () => {
  assert.equal(MENU[0].go, 'qian');
  assert.equal(MENU[0].open, false, 'no link out');
  assert.deepEqual(choreGo({ go: 'qian' }), { go: 'qian' });
  for (const bad of [undefined, '', 'Qian', 'qian page', '/x', 'a'.repeat(40), 7]) assert.deepEqual(choreGo({ go: bad }), {}, String(bad));
  const s = { ...joined(), step: 1, progress: 0 };
  const at = (state, quests) => look(state, content, ctxOf(quests)).book.find(q => q.id === SHARE);
  const undone = at(s, [row(null)]);
  assert.equal(undone.ready, false);
  assert.equal(undone.chore.go, 'qian');
  assert.equal(undone.chore.open, null);
  const done = at(s, [row()]);
  assert.deepEqual([done.ready, done.chore.go], [true, 'qian'], 'done and waiting: the page shows 交差 over it');
  const paid = turn(s, [row()], SHARE).state;
  assert.equal(at(paid, [row()]), undefined, 'paid: the row is gone, and with it the action');
  assert.equal(at(s, [{ ...row(null), go: undefined }]).chore.go, undefined, 'a row without the word has none');
});

test('the page: the 传音 row shows 去分享 (opening the 签 card) only while undone and a 问签 is in the save; 交差 once done', () => {
  const s = { ...joined(), step: 1, progress: 0 };
  const page = (quests, lang = 'zh', mod = l => l) => {
    const l = mod(look(s, content, ctxOf(quests)));
    return agendaRowHtml({ kind: 'chore', id: SHARE }, { look: l, lang, words: WORDS[lang], qi: { st: 'full' } });
  };
  const withQian = l => ({ ...l, qian: { drawn: false } });
  const zh = page([row(null)], 'zh', withQian);
  assert.match(zh, /<button class="act" data-divine>去分享<\/button>/);
  assert.doesNotMatch(zh, /data-do="turn"/);
  assert.match(page([row(null)], 'en', withQian), /<button class="act" data-divine>Share<\/button>/);
  assert.doesNotMatch(page([row(null)], 'zh', l => ({ ...l, qian: undefined })), /data-divine/, 'no 问签 in this save: no button');
  assert.doesNotMatch(page([row(null)], 'zh', l => ({ ...withQian(l), locked: [...(l.locked ?? []), 'divine'] })), /data-divine/, 'locked: no button');
  const ready = page([row()], 'zh', withQian);
  assert.match(ready, /data-do="turn"/);
  assert.doesNotMatch(ready, /data-divine/, '交差, not 去分享');
  // A chore row that names no word has no such button.
  const plain = page([{ ...row(null), go: undefined }], 'zh', withQian);
  assert.doesNotMatch(plain, /data-divine/);
});

test('a stamp from the future is no share: dropped from the file, and a real one replaces it', () => {
  const now = new Date('2026-11-12T00:53:33Z');
  const ahead = { quests: [{ id: SHARE, done_at: '2026-11-12T13:10:00.000Z' }] };
  assert.equal(merged(ahead, {}, MENU, now).quests.find(q => q.id === SHARE).done_at, null);
  assert.equal(merged(ahead, { [SHARE]: now.toISOString() }, MENU, now).quests.find(q => q.id === SHARE).done_at, now.toISOString());
  const past = { quests: [{ id: SHARE, done_at: '2026-11-11T01:36:07.000Z' }] };
  assert.equal(merged(past, {}, MENU, now).quests.find(q => q.id === SHARE).done_at, '2026-11-11T01:36:07.000Z');
});
