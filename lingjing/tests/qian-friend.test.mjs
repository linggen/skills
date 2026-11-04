// 替人求签, the birthday on screen to the rules and the rules' 生肖 to 银月 (live, Hanli 2026-11-04: 「替他人求签,
// 1983-03-04 属猪, yinyue说属牛, 算错了」 — the Divine call carried no birthday, the friend was kept with no 生肖, and her
// line said 属牛, the ask's own example). Kept friends: a one-tap chip that reuses the kept 生肖; a birthday typed
// for a kept 称呼 (or with its chip) updates the row; the birthday itself is never kept.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { playTo } from '../scripts/rules.mjs';
import { divine } from '../scripts/rules/fortune.mjs';
import { friendFacts, qianAsk, qianFacts, FACTS_MAX } from '../scripts/qian-facts.js';
import { formNow, formPut, formTake, friendAskArgs } from '../scripts/qian-page.js';

process.env.LINGJING_STAMINA_LIMIT = '0';
const content = loadContent();
const NOW = new Date(2026, 10, 4, 9);
const base = playTo(content, newState(content, 'zh', NOW), '古七', { now: NOW }).state;
const call = (s, args) => divine(s, content, { now: NOW, quests: [] }, args);
const ANIMALS = content.traits.fate.zodiac.flatMap((z) => [z.zh ?? z.name?.zh ?? z.name, z.en ?? z.name?.en].filter((x) => typeof x === 'string'));

test('1983-03-04 through the friend verb is 猪 (立春 is 02-04), and the row keeps 猪 — never the date', () => {
  const r = call(base, { action: 'friend', name: '九芝', birth: '1983-03-04', keep: true });
  assert.equal(r.result.ok, true);
  assert.equal(r.result.friend.signs.zodiac.id, 'pig');
  assert.equal(r.result.friend.signs.zodiac.name, '猪');
  assert.deepEqual(r.state.qian_friends, [{ name: '九芝', zodiac: 'pig', sign: 'pisces' }]);
  assert.doesNotMatch(JSON.stringify(r.state), /1983/);
});

test('a friend kept with no 生肖 (his 九芝) gets one by the birthday once; then the chip alone reuses it', () => {
  const his = { ...base, qian_friends: [{ name: '九芝' }] };
  // The chip, with the birthday typed in the form: the row is updated, not duplicated.
  const args = friendAskArgs({ name: '', birth: '1983-03-04', noKeep: false }, '九芝');
  assert.deepEqual(args, { action: 'friend', name: '九芝', birth: '1983-03-04', keep: true });
  const r = call(his, args);
  assert.deepEqual(r.state.qian_friends, [{ name: '九芝', zodiac: 'pig', sign: 'pisces' }]);
  // Next day's ask by the chip, no birthday: the kept 猪.
  const chip = friendAskArgs({ name: '', birth: '', noKeep: false }, '九芝');
  assert.equal(chip.birth, undefined);
  const again = divine(r.state, content, { now: new Date(2026, 10, 5, 9), quests: [] }, chip);
  assert.equal(again.result.friend.signs.zodiac.name, '猪');
  assert.deepEqual(again.state.qian_friends, [{ name: '九芝', zodiac: 'pig', sign: 'pisces' }]);
  // A new birthday for the kept 称呼, typed in the form: the row takes the new signs.
  const moved = call(again.state, friendAskArgs({ name: '九芝', birth: '1985-03-01', noKeep: false }));
  assert.deepEqual(moved.state.qian_friends, [{ name: '九芝', zodiac: 'ox', sign: 'pisces' }]);
  assert.equal(friendAskArgs({ name: '  ', birth: '1983-03-04' }), null, 'no 称呼, no ask');
});

/* A field of a fake page. */
const field = (id, value, checked) => ({ id, value, checked, replaceWith(n) { this.host.fields[id] = n; n.host = this.host; } });
const host = (fields) => {
  const h = { fields: {}, querySelector: (sel) => h.fields[sel.slice(1)] ?? null, getElementById: (id) => h.fields[id] ?? null };
  for (const f of fields) { h.fields[f.id] = f; f.host = h; }
  return h;
};

test('the ask reads the form as it stands on screen, the page\'s copy only where a field is not there', () => {
  const view = { qianFriendName: '九芝', qianFriendBirth: '', qianFriendNoKeep: false };
  const doc = host([field('qian-friend-name', '九芝'), field('qian-friend-birth', '1983-03-04'), field('qian-friend-nokeep', '', false)]);
  assert.deepEqual(formNow(view, doc), { name: '九芝', birth: '1983-03-04', noKeep: false });
  assert.deepEqual(friendAskArgs(formNow(view, doc)), { action: 'friend', name: '九芝', birth: '1983-03-04', keep: true });
  assert.deepEqual(formNow({ qianFriendName: 'A', qianFriendBirth: '1990-01-01', qianFriendNoKeep: true }, null), { name: 'A', birth: '1990-01-01', noKeep: true });
});

test('a birthday survives a repaint mid-entry: taken into the page\'s copy, and the field itself carried over', () => {
  const view = { qianFriendName: '', qianFriendBirth: '', qianFriendNoKeep: false };
  const keep = (p) => Object.assign(view, p);
  // A full date the page never heard (no `input`): taken before the HTML is made.
  const before = host([field('qian-friend-name', '九芝'), field('qian-friend-birth', '1983-03-04'), field('qian-friend-nokeep', '', true)]);
  const live = formTake(before, keep);
  assert.equal(view.qianFriendBirth, '1983-03-04');
  assert.equal(view.qianFriendName, '九芝');
  assert.equal(view.qianFriendNoKeep, true);
  // The repaint: a fresh field from the HTML is swapped for the live one (a half-typed date reads '' and holds its parts).
  const after = host([field('qian-friend-name', '九芝'), field('qian-friend-birth', ''), field('qian-friend-nokeep', '', true)]);
  formPut(after, live);
  assert.equal(after.getElementById('qian-friend-birth'), live);
  assert.equal(formNow(view, after).birth, '1983-03-04');
  // Half typed: '' is never written over the page's copy.
  view.qianFriendBirth = '1983-03-04';
  formTake(host([field('qian-friend-birth', '')]), keep);
  assert.equal(view.qianFriendBirth, '1983-03-04');
  assert.equal(formTake(host([]), keep), null, 'no form, nothing taken');
});

test('银月\'s facts carry the rules\' 生肖, or say it is unknown and that she must not guess — never an animal of their own', () => {
  const known = call(base, { action: 'friend', name: '九芝', birth: '1983-03-04' }).result.friend;
  for (const zh of [true, false]) {
    const f = friendFacts(known, zh);
    assert.match(f, zh ? /朋友属猪/ : /friend is a 猪/);
    assert.ok([...f].length <= FACTS_MAX);
    assert.ok(f.startsWith(qianAsk(known, zh, { friend: true })), 'the ask first, whole');
  }
  const blind = call(base, { action: 'friend', name: '九芝' }).result.friend;
  assert.equal(blind.signs, undefined);
  for (const zh of [true, false]) {
    const ask = qianAsk(blind, zh, { friend: true }), f = friendFacts(blind, zh);
    assert.match(ask, zh ? /生肖不知道，不许说或猜/ : /unknown: name no animal or sign, never guess/);
    assert.match(f, zh ? /生肖不知道/ : /animal is unknown/);
    // No animal in the ask or in the friend's signs line (the 黄历's own 冲 is the day's, and stays).
    for (const a of ANIMALS) assert.ok(!ask.includes(a), `${a} in the ask`);
    assert.doesNotMatch(f, /属牛|an Ox/);
    assert.ok(f.startsWith(ask) && [...f].length <= FACTS_MAX);
  }
  // His own draw with no 命格: the same.
  const mine = call(base, {}).result.divination;
  assert.equal(mine.signs, undefined);
  assert.match(qianFacts(mine, true), /他的生肖不知道，不许说或猜/);
});
