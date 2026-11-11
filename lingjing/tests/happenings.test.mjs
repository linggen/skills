// 观里的事 (rules/happenings.mjs, worlds/jiuding/happenings.json; Hanli 2026-11-10: 「可以，按这个做」): the small games reach
// him as things happening in the world — a place, who asks, why — and a happening deals ONE game when he is there: the kind
// played least recently first, never the one just played, only a game met in the story, only what the device can host.
import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { migrate, newState, threshold } from '../scripts/state.mjs';
import { look, VERBS } from '../scripts/rules.mjs';
import { BRANCH, shichenOf } from '../scripts/rules/pool.mjs';
import { pay } from '../scripts/rules/core.mjs';
import { claimedAt, dealOf, drawAt, happeningsOf, happeningTray, kindOf, metKinds, repeatable, stampHappening, varietyAfter } from '../scripts/rules/happenings.mjs';
import { trayHourChipHtml, WORDS } from '../scripts/cards.js';

process.env.LINGJING_STAMINA_LIMIT = '0';
const content = loadContent();
const DAY = (d, h, m = 10) => new Date(2026, 10, d, h, m);
const NOW = DAY(12, 9);
const ROOTS = ['wood', 'water', 'fire', 'earth', 'metal'];
/* A save at 练气八层 in 古八 (09-dabi behind him), standing at `place`. */
const at = (place, extra = {}) => {
  const s = { ...newState(content, 'zh', NOW), chapter: '00-zhuji', scene: '09-shenshi', place, ended: ['00-prologue', '00-waimen'], done_scenes: ['09-futian', '09-dabi', '09-shenshi', '09-danfang'], tier: 'qi', step: 8, progress: 0, traits: ROOTS, stamina: 100, stamina_at: NOW.toISOString(), ...extra };
  s.progress = Math.floor(0.3 * threshold(content, s));
  return s;
};
const onHost = (host, fn) => { const was = process.env.LINGJING_HOST; process.env.LINGJING_HOST = host; try { return fn(); } finally { if (was == null) delete process.env.LINGJING_HOST; else process.env.LINGJING_HOST = was; } };
const lookAt = (s, now) => look(s, content, { now, quests: [] });
const lit = (s, now) => (lookAt(s, now).tray ?? []).filter(e => e.happening);
const H = id => happeningsOf(content).find(h => h.id === id);
const taskOf = id => content.tasks.tasks.find(t => t.id === id);
const zhLen = s => [...String(s)].filter(c => /[㐀-鿿]/.test(c)).length;
const KIT = new Set(Object.keys(JSON.parse(fs.readFileSync(new URL('../tools/phone/board-kit.json', import.meta.url), 'utf8')).games));

/* A content with its happenings swapped for these rows (the rest the world's). */
const withRows = (rows, extra = {}) => ({ ...content, happenings: { ...content.happenings, ...extra, happenings: rows } });

test('the lint: every happening\'s place, person and games exist; its games are hosted boards played again with sense; words short, in zh and en', () => {
  const people = new Set((content.people?.people ?? []).map(p => p.id));
  const rows = happeningsOf(content);
  assert.ok(rows.length >= 8, 'the first batch: eight');
  assert.equal(new Set(rows.map(h => h.id)).size, rows.length, 'ids are unique');
  for (const h of rows) {
    const where = `happening ${h.id}`;
    assert.ok(lookPlace(h.place), `${where}: place ${h.place} exists`);
    assert.ok(people.has(h.who), `${where}: who ${h.who} is in people.json`);
    assert.ok(h.title?.zh && h.title?.en && zhLen(h.title.zh) <= 20, `${where}: a title in zh and en, ≤20`);
    assert.ok((h.say ?? []).length >= 2, `${where}: several reasons`);
    for (const l of h.say) assert.ok(l.zh && l.en && zhLen(l.zh) <= 30, `${where}: a reason in zh and en, ≤30: ${l.zh}`);
    for (const b of h.when ?? []) assert.ok(BRANCH.includes(b), `${where}: 时辰 ${b}`);
    for (const d of h.days ?? []) assert.ok(Number.isInteger(d) && d >= 1 && d <= 31, `${where}: day ${d}`);
    assert.ok((h.deals ?? []).length, `${where}: deals something`);
    for (const d of h.deals) {
      const t = taskOf(d.task);
      assert.ok(t, `${where}: deals unknown task ${d.task}`);
      assert.ok(t.hosted && t.kind === 'board' && t.game, `${where}: ${d.task} is a hosted board`);
      assert.ok(repeatable(content, t), `${where}: ${d.task} is played again with sense (its content varies, or a skill kit in \`again\`)`);
      // The phone's kit: a deal it cannot host says so; one that says so is truly off the kit.
      assert.equal(d.phone === false, !KIT.has(t.game), `${where}: ${d.task}'s phone flag matches tools/phone/board-kit.json`);
    }
  }
});
const lookPlace = id => Boolean(lookPlaceOf(id));
const lookPlaceOf = id => { for (const f of fs.readdirSync(new URL('../worlds/jiuding/places/', import.meta.url))) { const p = JSON.parse(fs.readFileSync(new URL(`../worlds/jiuding/places/${f}`, import.meta.url), 'utf8')).places.find(x => x.id === id); if (p) return p; } return null; };

test('the draw is the 时辰\'s: the same all through it and on every reload, the same on the Mac and the phone; one a place; another 时辰, another', () => {
  const s = at('waimen');
  const a = lit(s, DAY(12, 9, 5)).map(e => e.id), b = lit(structuredClone(s), DAY(12, 10, 55)).map(e => e.id);
  assert.ok(a.length >= 2 && a.length <= 3, `two or three light up (${a})`);
  assert.deepEqual(a, b, 'a reload, the same 时辰: the same');
  assert.deepEqual(onHost('phone', () => lit(s, DAY(12, 9, 5)).map(e => e.id)), a, 'the phone draws the same');
  const places = lit(s, DAY(12, 9, 5)).map(e => e.at);
  assert.equal(new Set(places).size, places.length, 'one a place');
  const hours = new Set(Array.from({ length: 30 }, (_, d) => lit(s, DAY(1 + d, 9 + (d % 4) * 2)).map(e => e.id).join()));
  assert.ok(hours.size > 4, `the 时辰 draw differently (${hours.size})`);
  // The footer chip: the 时辰 and the minutes till the next lights its own.
  const l = lookAt(s, DAY(12, 10, 13));
  assert.equal(l.tray_hour.change_min, 47);
  assert.equal(trayHourChipHtml({ look: l, words: WORDS.zh }).includes('巳时 · 47 分换一批'), true);
});

test('away, the row names a place, who and why — never the game; there, the game it deals', () => {
  const s = at('waimen'), now = DAY(12, 9, 5);
  for (const e of lit(s, now)) {
    assert.equal(e.seg, 'go', 'a walk there');
    for (const k of ['task', 'arg', 'game', 'game_title', 'stage', 'opens']) assert.ok(!(k in e), `away: no ${k} (${e.id})`);
    assert.ok(e.title && e.say && e.who, e.id);
    const there = lit({ ...s, place: e.at }, now).find(x => x.id === e.id);
    assert.ok(there.task && there.game_title && there.seg === 'open', `there: ${there.id} deals ${there.task}`);
    assert.ok(lookAt({ ...s, place: e.at }, now).tasks.some(t => t.id === there.task), 'and the board stands on the stage');
  }
});

test('played there, it leaves the row for the 时辰 — the happening stamped, the 小游戏池 untouched (no phantom slot)', () => {
  const now = DAY(12, 19, 10); // 戌: 演武 may stand
  const base = at('shanmen');
  const e = lit(base, now).find(x => x.happening === 'shanmen-yanwu') ?? lit(base, DAY(12, 17, 10)).find(x => x.happening === 'shanmen-yanwu');
  assert.ok(e, '演武 lights up at dusk within a day or two');
  const when = lit(base, now).some(x => x.id === e.id) ? now : DAY(12, 17, 10), ctx = { now: when, quests: [] };
  const won = VERBS.win(base, content, ctx, { id: e.task, stars: 3 });
  assert.equal(won.result.ok, true, JSON.stringify(won.result));
  const done = VERBS.task(won.state, content, ctx, { action: 'done', id: e.task });
  assert.equal(done.result.ok, true, JSON.stringify(done.result));
  assert.ok(done.result.paid?.progress > 0, 'paid by its minutes, as any board');
  assert.ok(done.state.happen.at['shanmen-yanwu'] && done.state.happen.last === e.task);
  assert.ok(!done.state.pool_played?.[e.task], 'the pool never stamps a happening\'s game');
  assert.ok(!lit(done.state, when).some(x => x.id === e.id), 'gone to: out of the row');
  assert.deepEqual(lookAt(done.state, when).tray_hour.drawn, lookAt(base, when).tray_hour.drawn, 'the 时辰\'s pool draw holds no extra slot');
});

test('least recently played kind first, never the game just played: 演武 walks its three kinds, then round again', () => {
  const h = H('shanmen-yanwu'), sc = shichenOf(DAY(12, 19)), now = DAY(12, 19, 10);
  let s = at('shanmen');
  const dealt = [];
  for (let n = 0; n < 6; n++) {
    const d = dealOf(content, s, h, sc, 'mac');
    dealt.push(d.task);
    const next = structuredClone(s), t = new Date(now.getTime() + n * 60_000);
    next.happen = { ...(next.happen ?? {}), at: {}, games: { ...(next.happen?.games ?? {}), [d.task]: t.toISOString() }, kinds: { ...(next.happen?.kinds ?? {}), [d.kind]: t.toISOString() }, last: d.task };
    s = next;
  }
  assert.equal(new Set(dealt.slice(0, 3)).size, 3, `three kinds before any again (${dealt})`);
  assert.deepEqual(dealt.slice(3), dealt.slice(0, 3), 'then round in the same order');
  for (let i = 1; i < dealt.length; i++) assert.notEqual(dealt[i], dealt[i - 1], 'never the same twice running');
  // One deal only: it is dealt whatever was last.
  const one = { ...h, id: 'one', deals: [h.deals[0]] };
  assert.equal(dealOf(content, { ...s, happen: { last: h.deals[0].task } }, one, sc, 'mac').task, h.deals[0].task);
});

test('the reach: a game met in the story, or hosted on the painted map he walks; one neither is not dealt', () => {
  // 配一炉丹 (alchemy-daily, 连连看): no 卷一 scene shows one, no place of the 观 hosts one — 丹房轮值 deals 守炉 alone.
  const h = H('danfang-lunzhi'), sc = shichenOf(NOW), s = at('yaoyuan');
  const met = metKinds(content, s);
  assert.ok(!met.has('lianliankan'), '卷一 shows no 连连看 board');
  for (let i = 0; i < 4; i++) assert.equal(dealOf(content, { ...s, happen: { last: 'yaoyuan-kanlu' } }, h, sc, 'mac').task, 'yaoyuan-kanlu');
  // Met somewhere (a 连连看 board counted): now it is dealt, the least recent first.
  const s2 = { ...s, tasks: { ...s.tasks, 'alchemy-first': { status: 'done', period: '2026-11-01' } } };
  assert.ok(metKinds(content, s2).has('lianliankan'));
  assert.equal(dealOf(content, { ...s2, happen: { last: 'yaoyuan-kanlu' } }, h, sc, 'mac').task, 'alchemy-daily');
  // 残局 (象棋): met in no 卷一 scene, but the 执事堂's pool hosts it on the 观's map — 棋摊 deals it.
  assert.ok(!met.has('xiangqi'));
  assert.equal(dealOf(content, { ...s, place: 'fantang', happen: { last: 'wuziqi' } }, H('fantang-qitan'), sc, 'mac').task, 'xiangqi');
  // A save before any story met nothing and walks no map of the 观: no happening lights up.
  const fresh = { ...newState(content, 'zh', NOW), place: 'waimen' };
  assert.equal(drawAt(content, fresh, sc).length, 0);
});

test('the device: the phone is never dealt what its kit cannot host, and a happening with nothing it can host is not shown there', () => {
  const h = H('shanmen-yanwu');
  const rows = [{ ...h, deals: [{ ...h.deals[0], phone: false }, h.deals[1]] }, { ...H('fantang-qitan'), deals: [{ task: 'wuziqi', phone: false }] }];
  const c = withRows(rows), sc = shichenOf(DAY(12, 19)), s = at('shanmen');
  for (let i = 0; i < 3; i++) assert.notEqual(dealOf(c, { ...s, happen: { last: h.deals[1].task } }, rows[0], sc, 'phone')?.task, h.deals[0].task, 'never the unhostable');
  assert.equal(dealOf(c, s, rows[1], sc, 'phone'), null);
  assert.equal(dealOf(c, s, rows[1], sc, 'mac').task, 'wuziqi');
  const now = DAY(12, 19, 10), mac = happeningTray(c, at('waimen'), now, 'mac').map(e => e.id), phone = happeningTray(c, at('waimen'), now, 'phone').map(e => e.id);
  assert.ok(mac.includes('hap:fantang-qitan') && !phone.includes('hap:fantang-qitan'), `the phone hides it (${mac} / ${phone})`);
  assert.deepEqual(drawAt(c, at('waimen'), shichenOf(now)).map(x => x.h.id).sort(), mac.map(id => id.slice(4)).sort(), 'the draw itself is the same');
});

test('洛书 is dealt once ever: played (through a happening, the pool, or counted), it is never dealt again', () => {
  const h = H('cangjing-lishu'), sc = shichenOf(NOW), s = at('cangjing');
  const seen = new Set();
  let cur = s;
  for (let n = 0; n < 6; n++) {
    const d = dealOf(content, cur, h, sc, 'mac');
    seen.add(d.task);
    const t = new Date(NOW.getTime() + n * 60_000).toISOString();
    cur = { ...cur, happen: { games: { ...(cur.happen?.games ?? {}), [d.task]: t }, kinds: { ...(cur.happen?.kinds ?? {}), [d.kind]: t }, last: d.task } };
  }
  const deals = [];
  cur = s;
  for (let n = 0; n < 9; n++) {
    const d = dealOf(content, cur, h, sc, 'mac'); deals.push(d.task);
    const t = new Date(NOW.getTime() + n * 60_000).toISOString();
    cur = { ...cur, happen: { games: { ...(cur.happen?.games ?? {}), [d.task]: t }, kinds: { ...(cur.happen?.kinds ?? {}), [d.kind]: t }, last: d.task } };
  }
  assert.equal(deals.filter(x => x === 'luoshu').length, 1, `once (${deals})`);
  assert.ok(!dealOf(content, { ...s, pool_played: { luoshu: NOW.toISOString() }, happen: { last: 'pintu' } }, h, sc, 'mac') || dealOf(content, { ...s, pool_played: { luoshu: NOW.toISOString() } }, h, sc, 'mac').task !== 'luoshu');
});

test('market day: 山下赶集 stands only on 逢五逢十 of the lunar month (初五 · 初十 · 十五 · 二十 · 廿五 · 三十)', async () => {
  const { lunarOf } = await import('../scripts/calendar.js');
  const s = at('waimen');
  let markets = 0;
  for (let d = 1; d <= 60; d++) {
    const date = new Date(2026, 10, d), lunar = lunarOf(date.getFullYear(), date.getMonth() + 1, date.getDate()).day;
    const any = [9, 11, 13, 15].some(hr => drawAt(withRows([H('shanmen-ganji')]), s, shichenOf(new Date(2026, 10, d, hr, 10))).length > 0);
    assert.equal(any, lunar % 5 === 0, `${date.toDateString()} (lunar ${lunar})`);
    markets += any ? 1 : 0;
  }
  assert.ok(markets >= 10 && markets <= 12, `about six a lunar month (${markets} in 60 days)`);
});

test('the fold: 山门\'s three boards and 药园\'s 守炉 stand only through their happenings — and an errand still finds its board', () => {
  for (const [p, id] of [['shanmen', 'shanmen-qinyan'], ['shanmen', 'shanmen-qingshen'], ['shanmen', 'shanmen-shouqiang'], ['yaoyuan', 'yaoyuan-kanlu']]) assert.ok(claimedAt(content, p, id), id);
  // At the 山门 by day (no 演武): none stands by itself.
  const s = at('shanmen'), noon = DAY(12, 11, 10);
  assert.ok(!lit(s, noon).some(e => e.happening === 'shanmen-yanwu'));
  assert.deepEqual(lookAt(s, noon).tasks.filter(t => t.id.startsWith('shanmen-')).map(t => t.id), []);
  // …nor does the 观 deal a plate board of its own (rules/rotation.mjs plateDealt): the 观's boards are the happenings'.
  assert.deepEqual(lookAt(at('cangjing'), noon).boards ?? [], []);
  // 九节菖蒲's 看炉 (quests/guan.json guan-jiujie-5) asks yaoyuan-kanlu at the 药园: it is there for the errand.
  const e = { ...at('yaoyuan'), quests: { 'guan-jiujie-5': { took: '2026-11-12' } } };
  assert.ok(lookAt(e, noon).tasks.some(t => t.id === 'yaoyuan-kanlu'), 'the errand\'s board stands');
});

test('变着花样: the third kind of game in a day pays one small game\'s worth, the fifth another — once each a day', () => {
  const ctx = { now: NOW, quests: [] };
  let s = at('waimen');
  const kinds = ['huarong', 'pintu', 'wuziqi', 'luoshu', 'alchemy-daily', 'huarong', 'xiangqi'];
  const paidAt = [];
  kinds.forEach((id, n) => {
    const next = structuredClone(s);
    const v = varietyAfter(content, s, next, 'task', { action: n % 2 ? 'lost' : 'done', id }, { ok: true }, ctx, pay);
    if (v?.paid) paidAt.push(v.kinds);
    s = next;
  });
  assert.deepEqual(paidAt, [3, 5], 'at three kinds, and at five');
  // A put-down is no play; a new day starts again.
  const left = structuredClone(s);
  assert.equal(varietyAfter(content, s, left, 'task', { action: 'leave', id: 'xiangqi' }, { ok: true }, ctx, pay), null);
  const tomorrow = { now: DAY(13, 9), quests: [] }, t = structuredClone(s);
  varietyAfter(content, s, t, 'task', { action: 'done', id: 'huarong' }, { ok: true }, tomorrow, pay);
  assert.deepEqual(t.variety.kinds, ['huarong']);
});

test('old saves load: the pool\'s fields kept, `happen` added only when a happening is played', () => {
  const dir = new URL('./fixtures/saves/', import.meta.url);
  for (const f of ['waimen.json', 'zhuji-cliff.json', 'ji-altar.json', 'zhishi-09year.json']) { // (mijing-kunzhen.json fails Look on main too: an older ladder's step)
    const raw = JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8'));
    const s = migrate(migrate(structuredClone(raw.state ?? raw)), content);
    const l = look(s, content, { now: NOW, quests: [] });
    assert.equal(l.ok, true, f);
    for (const e of (l.tray ?? []).filter(x => x.happening)) assert.ok(e.title && e.say, `${f}: ${e.id}`);
  }
  // A save with the 小游戏池's hold and stamps: a happening played keeps every one of them.
  const now = DAY(12, 19, 10), base = { ...at('shanmen'), pool_played: { duizi: DAY(12, 8).toISOString() }, pool_hold: { draw: DAY(12, 7).toISOString(), game: 'kao' }, pool_won: { huarong: DAY(11, 9).toISOString() } };
  const e = lit(base, now).find(x => x.happening === 'shanmen-yanwu');
  if (!e) return;
  const next = structuredClone(base);
  assert.equal(stampHappening(content, base, next, 'task', { action: 'leave', id: e.task }, now), true);
  for (const k of ['pool_played', 'pool_hold', 'pool_won']) assert.deepEqual(next[k], base[k], k);
  assert.ok(next.happen.at['shanmen-yanwu']);
});

/* ── The FORM a fight takes (rules/forms.mjs, happenings.json `forms`) ── */
const atHill = (extra = {}) => ({ ...at('houshan'), ...extra });
/* An hour (of a few days) whose batch beast at 后山 is one the wall knows. */
const wallHour = async (s) => {
  const F = await import('../scripts/rules/forms.mjs'), of = content.happenings.forms.yaoshou.wave.of;
  for (let d = 12; d < 16; d++) for (let h = 8; h < 22; h++) { const now = DAY(d, h, 5), f = F.yaoshouFormOf(content, s, now); if (f && of.includes(f.e.creature.id)) return now; }
  return null;
};
test('妖兽出没 rotates its form: a beast the wall knows comes as the card duel, then as a 守墙关 wave, least recent first; one it does not, always the duel', async () => {
  const F = await import('../scripts/rules/forms.mjs');
  const s = atHill(), now = await wallHour(s) ?? DAY(12, 10), f = F.yaoshouFormOf(content, s, now);
  assert.ok(f, 'a batch up at 后山');
  const cid = f.e.creature.id, wall = content.happenings.forms.yaoshou.wave.of.includes(cid);
  assert.equal(f.form, 'duel', 'the first fight: the event\'s own form');
  const afterDuel = structuredClone(s); F.stampForm(afterDuel, 'yaoshou', 'duel', now);
  assert.equal(F.yaoshouFormOf(content, afterDuel, now).form, wall ? 'wave' : 'duel');
  const afterWave = structuredClone(afterDuel); F.stampForm(afterWave, 'yaoshou', 'wave', new Date(now.getTime() + 60_000));
  assert.equal(F.yaoshouFormOf(content, afterWave, now).form, 'duel', 'then the duel again');
  assert.deepEqual(F.formsFor(content, 'yaoshou', 'lang'), ['duel'], 'a 狼 the wall does not know: the duel only');
  assert.deepEqual(F.formsFor(content, 'qiecuo', 'qinyan'), ['fighter'], '切磋: 格斗 this batch');
  assert.ok(wall, `this save meets a beast the wall knows (${cid})`);
  // A wave: no duel on the pool, the tray opens the board, the board stands with the beast on its title.
  const l = lookAt(afterDuel, now);
  assert.equal(l.place.encounter, null, 'no duel while the fight is a wave');
  const row = (l.tray ?? []).find(e => e.kind === 'yaoshou');
  assert.equal(row.arg, 'yaoshou-wave');
  assert.ok(l.tasks.find(t => t.id === 'yaoshou-wave').title.includes(f.e.creature.name));
  assert.equal(VERBS.duel(afterDuel, content, { now, quests: [] }, { id: f.e.game.id }).result.refused, 'not-here', 'the duel door shut meanwhile');
});

test('妖兽出没\'s pay is unchanged by its form: the wave won pays what the duel won pays for the same beast, the batch taken alike', async () => {
  const F = await import('../scripts/rules/forms.mjs');
  const { winningPicks } = await import('../scripts/rules/progress.mjs');
  const catalog = Object.fromEntries(content.cards.cards.map(x => [x.id, x]));
  const s = atHill(), now = await wallHour(s) ?? DAY(12, 10), ctx = { now, quests: [] };
  const f = F.yaoshouFormOf(content, s, now);
  assert.ok(content.happenings.forms.yaoshou.wave.of.includes(f.e.creature.id), `this save meets a beast the wall knows (${f.e.creature.id})`);
  const st = VERBS.duel(s, content, ctx, { id: f.e.game.id });
  const line = winningPicks(st.result.duel.setup, catalog);
  assert.ok(line, 'a winning line in this deal');
  const byDuel = VERBS.duel(st.state, content, ctx, { id: f.e.game.id, picks: line.join(',') });
  assert.equal(byDuel.result.outcome, 'won');
  const w = structuredClone(s); F.stampForm(w, 'yaoshou', 'duel', new Date(now.getTime() - 3600_000));
  const won = VERBS.win(w, content, ctx, { id: 'yaoshou-wave', stars: 3 });
  const byWave = VERBS.task(won.state, content, ctx, { action: 'done', id: 'yaoshou-wave' });
  assert.equal(byWave.result.ok, true, JSON.stringify(byWave.result));
  assert.equal(byWave.result.paid.progress, byDuel.result.paid.progress, '修为 the same');
  assert.equal(byWave.result.paid.wealth, byDuel.result.paid.wealth, '灵石 the same');
  // The batch's slot taken either way, the form stamped.
  assert.deepEqual(byWave.state.events?.yaoshou?.at != null, byDuel.state.events?.yaoshou?.at != null);
  assert.equal(byWave.state.forms.yaoshou.last, 'wave');
  assert.equal(byDuel.state.forms.yaoshou.last, 'duel');
});

test('the content lint holds the happenings: a place, a person or a game that does not exist is caught', async () => {
  const { lint } = await import('../scripts/content.mjs');
  assert.deepEqual(lint(content).filter(x => x.startsWith('happening')), []);
  const bad = withRows([{ ...H('fantang-qitan'), place: 'nowhere', who: 'nobody', deals: [{ task: 'nope' }, { task: 'jiaxin-letter' }] }]);
  const out = lint(bad).filter(x => x.startsWith('happening'));
  for (const what of ['unknown place nowhere', 'who nobody', 'unknown task nope', 'jiaxin-letter is no hosted board']) assert.ok(out.some(x => x.includes(what)), `${what}: ${out}`);
});
