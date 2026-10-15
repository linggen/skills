// 进度 (Hanli, 2026-10-15: 「每回一个agent并行测试」): `seed --save=<name> --at=<target>`
// plays a fresh save forward by the rules alone (rules/progress.mjs) to any 回 of 卷一 or the
// 秘境's door, so a test agent starts there. One forward run, snapshotted at every target, and
// the stage looked at there; the command itself once, through the CLI, into a sandbox.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { look, playTo, targetOf } from '../scripts/rules.mjs';
import { stageCards, stageSlots } from '../scripts/stage.mjs';

process.env.LINGJING_STAMINA_LIMIT = '0';
const ROOT = path.resolve(import.meta.dirname, '..');
const content = loadContent();
const NOW = new Date('2026-10-15T09:00:00+08:00');

/* Every 回 of 卷一 and the 秘境's door, with the scene each opens on as played. */
const TARGETS = {
  古一: '00-shiao', 古二: '00-cliff', 今一: 'j01-track', 古三: '00-gate', 古四: 'wm-ahe', 今二: 'j04-gym',
  古五: 'wm-mijing', 古六: 'wm-qianye', 今三: 'j07-ankle', 古七: '09-snow', 古八: '09-dabi', 今四: 'j09-noise',
  古九: '01-arrive', 秘境: 'wm-mijing',
};

function forward(policy) {
  const at = new Map();
  const targets = Object.keys(TARGETS).map((label) => [label, targetOf(content, label)]);
  const out = playTo(content, newState(content, 'zh', NOW), null, { now: NOW, policy, targets, onAt: (label, s, r) => at.set(label, { s, now: r.now }) });
  return { at, out };
}

/* The stage there is not blank: the scene stands, with its card, a card in main or the roads. */
function stageHolds(s, now) {
  const lk = look(s, content, { now, quests: [] });
  const slots = stageSlots(lk, lk.stage ?? stageCards(lk));
  const taps = lk.scene?.panel?.taps ?? [];
  const roads = !lk.seclusion && !lk.director?.corridor && (lk.director?.near ?? []).length > 0;
  return { lk, ok: slots.main.length > 0 || taps.length > 0 || roads };
}

for (const policy of ['win', 'skip']) {
  test(`every 回 of 卷一 and the 秘境 reached by one forward run (boards ${policy}): the save there, the stage not blank`, () => {
    // The work's own CPU time, not the wall clock: with many agents testing at once (load ~200) the same
    // run took 7–10 s of wall time and the check went red for the machine, not the code.
    const c0 = process.cpuUsage();
    const { at } = forward(policy);
    const { user, system } = process.cpuUsage(c0), ms = Math.round((user + system) / 1000);
    assert.ok(ms < 5000, `fast: ${ms} ms of CPU`);
    for (const [label, scene] of Object.entries(TARGETS)) {
      const hit = at.get(label);
      assert.ok(hit, `${label} reached`);
      assert.equal(hit.s.scene, scene, `${label} opens on ${scene}`);
      const { lk, ok } = stageHolds(hit.s, hit.now);
      assert.equal(lk.scene?.id, scene, `${label}: Look shows ${scene}`);
      assert.ok(ok, `${label}: a blank stage at ${scene}`);
    }
    // Realistic: the save holds what the road gave — not a fresh save moved.
    const late = at.get('古九').s;
    assert.ok(late.traits?.length, 'roots read');
    assert.ok((late.cards ?? []).length > (at.get('古三').s.cards ?? []).length, 'cards won on the way');
    for (const id of ['longzhi', 'zheng', 'gui', 'foe-zou', 'foe-lufang', 'foe-shijie', 'foe-maxiaobao']) assert.equal(late.duels?.[id]?.outcome, 'won', `${id} won by the settle`);
    assert.ok(late.hunted?.['mijing-xiongya'] >= 1, 'the 凶崖\'s guard fought down');
    assert.notEqual(late.tier, at.get('古一').s.tier, 'a realm climbed');
  });
}

test('targets: a scene id, a 回 id (an absorbed one too), 古N / 今N / 第N回, the 秘境; an unknown one refused', () => {
  assert.deepEqual(targetOf(content, 'wm-mijing'), { kind: 'scene', id: 'wm-mijing', label: 'wm-mijing' });
  assert.deepEqual(targetOf(content, 'h03').ids, targetOf(content, '古二').ids);
  assert.deepEqual(targetOf(content, 'h07').ids, targetOf(content, '第五回').ids);
  assert.deepEqual(targetOf(content, 'j04').ids, targetOf(content, '今二').ids);
  assert.equal(targetOf(content, '秘境').id, 'wm-mijing');
  assert.equal(targetOf(content, 'nowhere'), null);
});

test('the command: seed --at writes only the scratch save, says where it stands, and Look there shows it; a stuck route fails loudly', () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lj-seedat-'));
  const env = { ...process.env, LINGJING_DATA: data, LINGJING_QUESTS: path.join(data, 'q'), LINGJING_NOW: NOW.toISOString() };
  delete env.LINGJING_SAVE;
  const cli = (...args) => {
    const p = spawnSync(process.execPath, ['scripts/rules.mjs', ...args], { cwd: ROOT, env, encoding: 'utf8' });
    return { code: p.status, out: JSON.parse(p.stdout.trim().split('\n').pop()) };
  };
  try {
    const { out } = cli('seed', '--save=sd-a', '--at=今四');
    assert.equal(out.ok, true, JSON.stringify(out));
    assert.equal(out.scene, 'j09-noise');
    for (const k of ['place', 'realm', 'xiuwei', 'lingshi']) assert.ok(out[k] != null, k);
    assert.ok(out.days >= 1, 'a real day waited on the way: the scratch clock shifted');
    assert.ok(fs.existsSync(path.join(data, 'saves', 'sd-a', 'clock.json')));
    assert.equal(fs.existsSync(path.join(data, 'state.json')), false, 'the player\'s own save untouched');
    const lk = cli('look', '--save=sd-a').out;
    assert.equal(lk.scene?.id, 'j09-noise');
    // The stage owes the target scene's own passage, and only it — not the run's 40-odd folded into a 前情 (今一, 2026-10-15).
    const told = cli('tell', '--save=sd-a').out.tell ?? [];
    assert.deepEqual(told.map((t) => `${t.of}:${t.id}`), ['scene:j09-noise'], JSON.stringify(told.map((t) => t.id)));
    // Not a scratch save: refused.
    assert.equal(cli('seed', '--at=古五').out.refused, 'not-scratch');
    // A route taken where offered: 古一's fork the other way.
    const other = cli('seed', '--save=sd-c', '--at=00-dawn', '--route=strike').out;
    assert.equal(other.scene, '00-dawn', JSON.stringify(other));
    // A route that names a way never offered: refused with the scene and why, exit code 1.
    const stuck = cli('seed', '--save=sd-b', '--at=古二', '--route=nope');
    assert.equal(stuck.out.refused, 'cannot-advance');
    assert.match(stuck.out.why, /nope/);
    assert.ok(stuck.out.scene);
    assert.equal(stuck.code, 1);
  } finally {
    fs.rmSync(data, { recursive: true, force: true });
  }
});
