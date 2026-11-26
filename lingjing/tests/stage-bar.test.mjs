// The 修为 bar of a realm in 段 spans the whole 段 (Hanli 2026-11-25: 「筑基修为满了又从头开始了」 · 「按段吧」):
// state.mjs stageBar is the one place that works it out; the page reads it off Look (stage.mjs barOf).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadContent } from '../scripts/content.mjs';
import { newState, stageBar, tierOf, threshold } from '../scripts/state.mjs';
import { look } from '../scripts/rules.mjs';
import { barOf, capLineOf } from '../scripts/stage.mjs';

const content = loadContent();
const NOW = new Date('2026-11-25T12:00:00');
const ctx = { now: NOW, quests: [] };
const ROOTS = ['wood', 'water', 'fire', 'earth', 'metal'];
const at = (tier, step, progress, extra = {}) => ({ ...newState(content, 'zh', NOW), chapter: '00-waimen', scene: 'wm-ahe', place: 'waimen', ended: ['00-prologue'], traits: ROOTS, tier, step, progress, stamina: 100, stamina_at: NOW.toISOString(), ...extra });
const th = tierOf(content, 'foundation').thresholds;

test('筑基 二层 → 三层: the 段 bar keeps rising, never back to 0', () => {
  const end2 = stageBar(content, at('foundation', 1, th[1] - 1));
  const start3 = stageBar(content, at('foundation', 2, 0));
  assert.ok(start3.now >= end2.now && start3.share > 0.5, `${end2.share} → ${start3.share}`);
  assert.equal(start3.now, th[0] + th[1]);
  assert.equal(start3.total, th[0] + th[1] + th[2]);
  assert.equal(stageBar(content, at('foundation', 2, th[2])).share, 1);
});

test('the bar starts over at 四层 (中成)', () => {
  const b = stageBar(content, at('foundation', 3, 0));
  assert.equal(b.now, 0);
  assert.equal(b.total, th[3] + th[4] + th[5]);
  assert.equal(stageBar(content, at('foundation', 4, 5)).now, th[3] + 5);
});

test('练气 names its 层: no 段 bar, Look unchanged', () => {
  assert.equal(stageBar(content, at('qi', 2, 5)), null);
  const l = look(at('qi', 2, 5), content, ctx);
  assert.equal(l.tier.duan, undefined);
  assert.deepEqual([barOf(l).progress, barOf(l).next], [5, threshold(content, at('qi', 2, 5))]);
});

test('Look and the header carry the 段 figures', () => {
  const s = at('foundation', 1, 7), l = look(s, content, ctx), b = barOf(l);
  assert.deepEqual(l.tier.duan.bar, stageBar(content, s));
  assert.deepEqual([b.progress, b.next], [th[0] + 7, th[0] + th[1] + th[2]]);
});

test('the cap line shows only when the bar is held full at the cap', () => {
  const ch = content.chapters['01-ji'];
  const end = { ...at('foundation', 2, th[2]), chapter: '01-ji', scene: null, place: 'zhangyuan', ended: ['00-prologue', '00-waimen', '00-zhuji', '01-ji'], done_scenes: Object.keys(ch.scenes) };
  const held = look(end, content, ctx);
  const mid = look(at('foundation', 2, 5), content, ctx);
  assert.equal(capLineOf(mid, '卷一至此'), '');
  assert.ok(held.capped, 'the fixture stands at the cap');
  assert.equal(capLineOf(held, '卷一至此'), '卷一至此');
  const fake = { ...mid, capped: { say: 'x' } };
  assert.equal(capLineOf(fake, 'L'), '', 'capped but not full: no line');
  const full = { ...fake, tier: { ...fake.tier, duan: { ...fake.tier.duan, bar: { now: 9, total: 9, share: 1 } } } };
  assert.equal(capLineOf(full, 'L'), 'L');
  assert.ok([...'卷一至此·余修为化灵石'].length <= 12);
});

test('no page works the 段 bar out itself', () => {
  for (const f of ['lingjing.js', 'cards.js', 'fx-hui.js', 'stage.mjs']) {
    const src = fs.readFileSync(new URL(`../scripts/${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /thresholds\.slice|\.marks\.reduce|duan\.marks[^;]*\/ ?bar/, f);
  }
});
