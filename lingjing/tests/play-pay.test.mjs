// Every board pays by its minutes (rules/playpay.mjs; Hanli 2026-10-27: 「12分钟的一个小游戏占2个小时的10%, 所以要奖励10%的修为」
// · 「先改第一层的进度相关的, 让我能玩过去」): a 古四 save at 146/470 at 沉鼎观 plays the place games (practice), each
// paying its kind's minutes at 练气一层's rate, ★ scaling it, the same board again the same day 50% then 10% — and
// reaches the gate in about an hour of play, as the layer's two hours (reading inside) have it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { playTo } from '../scripts/rules/progress.mjs';
import { look, move, task, win } from '../scripts/rules.mjs';
import { playGrant } from '../scripts/rules/playpay.mjs';
import { gamesToday } from '../scripts/rules/rotation.mjs';
import { placeOf } from '../scripts/rules/world.mjs';

const content = loadContent();
const NOW = new Date('2026-10-27T09:00:00-03:00');
const ctx = { now: NOW };
const PP = content.balance.play_pay;
// A minute of a board at 练气一层: 60% of 470 over 35% of its 2 hours (play_pay.games, hours) — 6.71 修为, 1.43% of the layer.
const PER_MIN = (PP.games.share * 470) / (PP.games.time * PP.hours.qi[1] * 60);

test('the kinds at 练气一层: minutes × the layer\'s share a minute, ★ and the replay scaling it; 三层 the same minutes of a bigger layer', () => {
  const s = { tier: 'qi', step: 1, plays: null };
  const grant = (kind, stars) => playGrant({ ...content, games: { games: [{ id: 'x', task: 'x', mechanic: kind }] } }, s, 'x', { game: 'x' }, NOW, stars);
  assert.equal(grant('棋牌').progress, Math.round(PER_MIN * 6));
  assert.equal(grant('打地鼠').progress, Math.round(PER_MIN * 1));
  assert.equal(grant('解谜', 1).progress, Math.round(PER_MIN * 4 * 0.6), '★1 is 0.6');
  const again = { ...s, plays: { day: '2026-10-27', ids: { x: 1 } } };
  assert.equal(playGrant({ ...content, games: { games: [{ id: 'x', task: 'x', mechanic: '解谜' }] } }, again, 'x', { game: 'x' }, NOW).progress, Math.round(PER_MIN * 4 * 0.5), 'the same board again today: 50%');
  assert.equal(playGrant(content, { tier: 'qi', step: 0 }, 'pintu', { game: 'pintu' }, NOW)?.progress ?? 0, 0, '零层 pays no 修为');
  assert.deepEqual(['打地鼠', '割绳子', '格斗', '解谜', '你画我猜', '棋牌'].map((k) => grant(k).progress), [7, 13, 20, 27, 34, 40], 'Hanli\'s 7–40 at 一层');
  const three = (kind) => playGrant({ ...content, games: { games: [{ id: 'x', task: 'x', mechanic: kind }] } }, { tier: 'qi', step: 3, plays: null }, 'x', { game: 'x' }, NOW).progress;
  // 三层: its 层 (balance.json layers) over its hours (play_pay.hours, the master table's curve fitted to 古六's band).
  const pp = content.balance.play_pay, perMin3 = (pp.games.share * content.balance.layers.qi[3]) / (pp.games.time * 60 * pp.hours.qi[3]);
  assert.deepEqual(['打地鼠', '棋牌'].map(three), [1, 6].map(m => Math.round(perMin3 * m)), '三层: the same minutes of its own layer');
});

test('古四 at 146/470: the place games at 沉鼎观 reach the gate in three short sittings — the place games alone, errands and fights on top', () => {
  let s = playTo(content, newState(content, 'zh', NOW), 'wm-chaifang', { now: NOW, policy: 'skip' }).state;
  s = { ...s, tier: 'qi', step: 1, progress: 146, stamina: 100 };
  let plays = 0, minutes = 0, days = 0;
  // a day: each board standing at the 观's places that day (their pools turn with the day, rules/rotation.mjs), once
  const PLACES = ['chaifang', 'zhishi', 'cangjing', 'waimen', 'fantang', 'jiangtang'];
  for (let pass = 0; pass < 6 && s.progress < 470 && s.step === 1; pass += 1) {
    // two plays of each a day (100% · 50%), then the next day: the replay's share is the only limit
    const day = { now: new Date(NOW.getTime() + pass * 86400000) };
    days = pass + 1;
    for (const place of PLACES) {
      const m = move(s, content, day, { place });
      if (!m.result.ok) continue;
      s = m.state;
      const ids = gamesToday(content, placeOf(content, place), day.now).filter((id) => content.tasks.tasks.find((t) => t.id === id)?.kind === 'board');
      for (const id of ids) {
        const w = win(s, content, day, { id, stars: 3 });
        if (!w.result.ok) continue;
        const d = task({ ...w.state, stamina: 100 }, content, day, { action: 'done', id });
        if (!d.result.ok) continue;
        s = d.state; plays += 1; minutes += PP.minutes[content.games.games.find((g) => g.task === id || g.id === id)?.mechanic] ?? 3;
        if (s.progress >= 470 || s.step > 1) break;
      }
    }
  }
  assert.ok(s.progress >= 470 || s.step > 1, `reached ${s.progress} after ${plays} plays`);
  assert.ok(days <= 3, `${days} days`);
  assert.ok(plays <= 18, `${plays} plays`);
  assert.ok(minutes <= 90, `${minutes} minutes of board play`);
  console.log(`# 146 → ${s.progress}: ${plays} plays, ${minutes} min of board play, ${days} day(s)`);
  const l = look(s, content, ctx);
  assert.ok(l.tasks.some((t) => t.practice), 'the place games stay open as practice, in the tray');
});
