// tests/sync-further.test.mjs — the 2026-11-12 save loss, replayed on the declared rule (SKILL.md `cloud.further`).
//
// The phone's save (v18: 116 scenes, 筑基 · 383) lost to the Mac's (105 scenes, 筑基 · 56) because the Mac's had been
// migrated to v19 seconds before the phone read it, and the rule put the version first. Now scenes done come first
// (a migration carries them whole), the version second, and `newest` (STATE_VERSION) lets a save from a newer build
// win outright. `verdict` below reads the rule exactly as the engine (src/account/cloud_save/further.rs) and the phone
// (lingjing_further.dart) do — each repo replays the same cases against its own reader. Fixtures hold only the keys the
// rule reads, never the player's save.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { newest, problems, readIgnore, readFurtherText, resolved } from '../tools/further.mjs';
import { STATE_VERSION, migrate } from '../scripts/state.mjs';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MD = fs.readFileSync(path.join(SKILL, 'SKILL.md'), 'utf8');

/* The rule as the engine reads it: a side past `newest` wins outright; else the first entry that differs decides. */
function verdict(rule, a, b) {
  const ceil = rule.by.find((e) => e.newest !== undefined);
  if (ceil) {
    const past = (s) => typeof s[ceil.number] === 'number' && s[ceil.number] > ceil.newest;
    if (past(a) !== past(b)) return past(a) ? 1 : -1;
  }
  for (const e of rule.by) {
    if ((e.within ?? []).some((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))) continue;
    let c = null;
    if ('count' in e) c = (Array.isArray(a[e.count]) ? a[e.count].length : 0) - (Array.isArray(b[e.count]) ? b[e.count].length : 0);
    if ('number' in e) c = (typeof a[e.number] === 'number' ? a[e.number] : -1) - (typeof b[e.number] === 'number' ? b[e.number] : -1);
    if ('rank' in e) {
      const ia = e.order.indexOf(String(a[e.rank])), ib = e.order.indexOf(String(b[e.rank]));
      c = ia < 0 || ib < 0 ? null : ia - ib;
    }
    if ('time' in e) {
      const ta = Date.parse(a[e.time]), tb = Date.parse(b[e.time]);
      c = Number.isNaN(ta) || Number.isNaN(tb) ? null : ta - tb;
    }
    if (c) return Math.sign(c);
  }
  return 0;
}

const scenes = (n) => Array.from({ length: n }, (_, i) => `s${i}`);
// The incident's two saves, by the keys the rule reads (the evidence: phone conflict copy 00:01Z, Mac v19 00:01:31Z).
const PHONE = { version: 18, done_scenes: scenes(116), tier: 'foundation', step: 0, progress: 383, story_at: '2026-11-12T23:19:48.652Z', updated: '2026-11-12T23:38:00.965Z' };
const MAC = { version: 19, done_scenes: scenes(105), tier: 'foundation', step: 0, progress: 56, story_at: '2026-11-12T20:57:49.734Z', updated: '2026-11-12T21:42:39.230Z' };

test('scenes done decide before the version; the version still decides before the ladder', () => {
  const rule = resolved();
  assert.deepEqual(problems(JSON.parse(readFurtherText(MD))), []);
  assert.deepEqual(rule.by[0], { count: 'done_scenes' });
  assert.equal(rule.by[1].number, 'version');
  assert.equal(rule.by[1].newest, STATE_VERSION);
  assert.ok(rule.by.findIndex((e) => e.rank === 'tier') > 1, 'the realm after the version: its ladder may change with it');
});

test('11-12 replayed: the v18 save 116 scenes on beats the v19 save at 105, whichever side holds which', () => {
  const rule = resolved();
  assert.equal(verdict(rule, PHONE, MAC), 1, 'the phone\'s further save wins');
  assert.equal(verdict(rule, MAC, PHONE), -1, 'and the Mac\'s, migrated first, loses');
  // Brought to one version (the phone's sync does, with these rules' migrate), the same answer.
  assert.equal(verdict(rule, migrate(PHONE), MAC), 1);
});

test('the opposite: the migrated side really further on still wins', () => {
  const rule = resolved();
  const mac = { ...MAC, done_scenes: scenes(120) };
  assert.equal(verdict(rule, mac, PHONE), 1);
  // Even scenes: the newer version wins (the engine cannot compare 层 across ladders), then the realm, the layer…
  const even = { ...MAC, done_scenes: scenes(116), progress: 1 };
  assert.equal(verdict(rule, even, PHONE), 1);
  assert.equal(verdict(rule, { ...PHONE, version: 19, progress: 400 }, { ...PHONE, version: 19, progress: 383 }), 1);
});

test('a save from a newer build wins outright: an older build never writes over it', () => {
  const rule = resolved();
  const newer = { ...MAC, version: STATE_VERSION + 1, done_scenes: scenes(3) };
  assert.equal(verdict(rule, newer, PHONE), 1);
  assert.equal(verdict(rule, PHONE, newer), -1);
  assert.deepEqual(newest(rule), { file: 'data/state.json', number: 'version', max: STATE_VERSION });
  assert.throws(() => newest(rule, STATE_VERSION + 1), /newest/, 'a rules bump that forgets SKILL.md is refused');
  assert.equal(newest({ file: 'x', by: [{ count: 'done_scenes' }, { number: 'version' }] }), null);
});

test('a migration carries every scene done forward: the count is comparable across versions', () => {
  const dir = path.join(SKILL, 'tests/fixtures/saves');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const doc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const s = doc.state ?? doc;
    if (!Array.isArray(s.done_scenes)) continue;
    for (const v of [1, 12, 17, 18]) {
      const m = migrate({ ...structuredClone(s), version: v });
      assert.equal(m.done_scenes.length, s.done_scenes.length, `${f} from v${v}`);
    }
  }
});

test('the page\'s passage hold is a stamp, not a move', () => {
  assert.ok(JSON.parse(readIgnore(MD)).includes('reading'));
});

test('the phone bundle brings a save to its version without writing it, and refuses a newer one', async (t) => {
  const { buildPhoneBundle, esbuildOf } = await import('../tools/phone-bundle.mjs');
  if (!(await esbuildOf())) {
    try { execFileSync('npm', ['ci', '--silent', '--prefix', path.join(SKILL, 'tools/phone')], { stdio: 'pipe', timeout: 180_000 }); } catch { /* offline */ }
  }
  if (!(await esbuildOf())) return t.skip('esbuild is not installed (npm ci in lingjing/tools/phone)');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-further-'));
  const out = await buildPhoneBundle({ out: path.join(tmp, 'bundle') });
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(out.rules, 'utf8'), ctx);
  const phone = ctx.Lingjing;
  phone.load(fs.readFileSync(out.world, 'utf8'));
  const before = phone.dump();
  const m = JSON.parse(phone.migrate(JSON.stringify(PHONE)));
  assert.equal(m.version, STATE_VERSION);
  assert.equal(m.done_scenes.length, 116);
  assert.equal(phone.dump(), before, 'nothing written');
  assert.equal(phone.migrate(JSON.stringify({ ...PHONE, version: STATE_VERSION + 1 })), null);
  assert.equal(phone.migrate('not json'), null);
  fs.rmSync(tmp, { recursive: true, force: true });
});
