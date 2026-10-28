// 刷副本 retired 2026-10-28 (Hanli: 「按你说的来」 — three cooldown events instead: 兽潮 · 比武切磋 · 妖兽出没): the 秘境's
// outer rooms no longer open again. No module, no verb, no data, no offer anywhere (Look, the 主页, the aside, the tray's
// waits, the 游戏厅); a save that stood inside a run leaves it cleanly on load; the story's own 秘境 is untouched
// (tests/sealed.test.mjs walks it). The 奇遇 boards and frames stay (worlds/jiuding/qiyu.json) for the roguelite to come.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { migrate } from '../scripts/state.mjs';
import { look, move } from '../scripts/rules.mjs';
import { ASIDE_KINDS } from '../scripts/rules/aside.mjs';

process.env.LINGJING_STAMINA_LIMIT ??= '0';
const content = loadContent();
const FIX = JSON.parse(fs.readFileSync(new URL('./fixtures/saves/rerun-open.json', import.meta.url), 'utf8'));
const NOW = new Date(FIX.now);
const at = now => ({ now, quests: [] });

test('the rerun is gone: no module, no verb, no data, no cooldown, no 游戏厅 row, no aside kind', async () => {
  assert.ok(!fs.existsSync(new URL('../scripts/rules/rerun.mjs', import.meta.url)));
  const { VERBS } = await import('../scripts/rules.mjs');
  assert.equal(VERBS.rerun, undefined);
  assert.ok(!Object.values(content.chapters).some(ch => (ch.beats ?? []).some(b => b.sealed?.rerun)), 'no beat declares a rerun');
  assert.equal('rerun_h' in (content.balance.cooldowns ?? {}), false);
  const reg = JSON.parse(fs.readFileSync(new URL('../worlds/jiuding/games.json', import.meta.url), 'utf8'));
  assert.ok(!reg.games.some(g => g.id === 'mijing' || g.stage?.rerun));
  assert.ok(!ASIDE_KINDS.some(k => k.kind === 'rerun'));
  // The 奇遇 frames stay for the roguelite (design.md § Backlog).
  assert.ok(fs.existsSync(new URL('../worlds/jiuding/qiyu.json', import.meta.url)));
});

test('a save inside a run, its fight open: let go on load — home, the fight gone, nothing sealed, free to walk', () => {
  const old = FIX.state;
  assert.ok(old.rerun && old.sealed?.run && old.fight, 'the fixture stands inside a run, mid-fight');
  const s = migrate(old, content);
  for (const k of ['rerun', 'reruns', 'fight']) assert.ok(!(k in s), k);
  assert.ok(!Object.keys(s.duels ?? {}).some(k => Object.keys(old.rerun.rooms).includes(k.slice(5))), 'the rooms\' fight records cleared');
  const lk = look(s, content, at(NOW));
  assert.equal(lk.rerun, undefined);
  assert.equal(lk.sealed, undefined, 'not sealed');
  assert.ok(!(lk.waits ?? []).some(w => String(w.id).startsWith('rerun')));
  assert.ok(!(lk.tasks ?? []).some(t => t.id.startsWith('qiyu-') || t.id === 'mijing-rerun-gather'), 'no run board offered');
  assert.ok(!(lk.home?.todo ?? []).some(r => r.kind === 'rerun'));
  assert.ok(!(lk.aside?.offers ?? []).some(o => o.kind === 'rerun'));
  // Standing on his map again (the 秘境 room is no place of it), and Move works.
  const map = content.chapters[s.chapter].map;
  const out = move(s, content, at(NOW), { place: map.home === lk.place?.id ? 'shanmen' : map.home });
  assert.equal(out.result.ok, true, JSON.stringify(out.result).slice(0, 300));
  assert.ok(map.places.includes(out.state.place));
  assert.ok(!out.state.sealed && !out.state.rerun);
});

test('an old save with only the rerun\'s clock (`reruns`) or its way-back line: dropped, nothing else moves', () => {
  const base = migrate({ ...FIX.state, rerun: undefined, fight: undefined }, content);
  const s = migrate({ ...base, reruns: { mijing: { n: 3, ended_at: NOW.toISOString() } }, returned: { place: 'waimen', from: 'shimen', rerun: 'mijing' } }, content);
  assert.ok(!('reruns' in s) && !('returned' in s));
  assert.equal(s.place, base.place);
});
