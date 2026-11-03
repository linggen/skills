// A board pays by the row it was played as (live 2026-11-02, the deployer's smoke run: the story dash board `cliff-shangya`
// paid as 打地鼠, not 几何冲刺 — games.json keeps the rows its game was replaced from, and the pay took the first row naming
// the task). rules/playpay.mjs playedRow: the row the page played (`row`, a games.json row or level id — an `alt` on a
// device with a camera), else the task's own `game`, else its live row; content.mjs lints rows of different mechanics that
// share a task (but for the replaced, the cut and the task's `alt`).
import test from 'node:test';
import assert from 'node:assert/strict';
import { lint, loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { VERBS } from '../scripts/rules.mjs';
import { namedRow, playGrant, playedRow } from '../scripts/rules/playpay.mjs';

const content = loadContent();
const NOW = new Date('2026-11-02T12:00:00');
const task = id => content.tasks.tasks.find(t => t.id === id);
const s = { ...newState(content, 'zh', NOW), tier: 'qi', step: 8, progress: 0 };

test('cliff-shangya pays as the 几何冲刺 it is played as — never the 打地鼠 or 塔防 it was replaced from', () => {
  const rows = content.games.games.filter(g => g.task === 'cliff-shangya');
  assert.ok(rows.length > 1 && rows[0].mechanic !== '几何冲刺', 'the trap: an older row names the task first');
  assert.equal(playedRow(content, 'cliff-shangya', task('cliff-shangya')).mechanic, '几何冲刺');
  const g = playGrant(content, s, 'cliff-shangya', task('cliff-shangya'), NOW);
  assert.equal(g.kind, '几何冲刺');
  const pp = content.balance.play_pay;
  assert.equal(g.minutes, pp.minutes?.['几何冲刺'] ?? pp.minutes?.default ?? 0);
  // Every live board pays by its task's own game's row.
  for (const t of content.tasks.tasks.filter(x => x.game && content.games.games.some(r => r.task === x.id && !r.replaced && !r.cut))) {
    assert.equal(playedRow(content, t.id, t).id, t.game, t.id);
  }
});

test('an alt played on a device with a camera pays by its own row; the win writes the row down, a name no row holds is not kept', () => {
  const t = task('qianye-qiajue');
  assert.equal(playGrant(content, s, t.id, t, NOW).kind, '投掷', 'its own board: 讲堂试法');
  assert.equal(playGrant(content, s, t.id, t, NOW, null, { row: 'jieyin' }).kind, '结印', 'played as the 结印 alt');
  assert.equal(playGrant(content, { ...s, play_rows: { [t.id]: 'jieyin' } }, t.id, t, NOW).kind, '结印', 'as the win wrote it');
  assert.equal(namedRow(content, t.id, 'nope'), null);
  // The win verb keeps the row (page-only; at the beat's scene).
  const sc = content.chapters['00-waimen'].scenes['wm-qianye'];
  const at = { ...s, chapter: '00-waimen', scene: 'wm-qianye', place: sc.at, ended: ['00-prologue'], tasks: { [t.id]: { status: 'offered' } } };
  const won = VERBS.win(at, content, { now: NOW, quests: [] }, { id: t.id, row: 'jieyin' });
  assert.equal(won.result.ok, true, JSON.stringify(won.result));
  assert.deepEqual(won.state.play_rows, { [t.id]: 'jieyin' });
  assert.equal(VERBS.win(at, content, { now: NOW, quests: [] }, { id: t.id, row: 'nope' }).state.play_rows, undefined);
});

test('the lint: rows of different mechanics sharing a task are refused — but the replaced, the cut and the task\'s alt', () => {
  assert.deepEqual(lint(content).filter(p => p.startsWith('games ')), []);
  const games = content.games.games.map(g => (g.task === 'cliff-shangya' && g.id === 'rain' ? (({ replaced, cut, ...r }) => r)(g) : g));
  const bad = lint({ ...content, games: { ...content.games, games } }).filter(p => p.startsWith('games cliff-shangya'));
  assert.equal(bad.length, 1, JSON.stringify(bad));
  assert.match(bad[0], /rain \(打地鼠\).*dash \(几何冲刺\)|dash \(几何冲刺\).*rain \(打地鼠\)/);
});
