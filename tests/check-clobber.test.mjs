// tools/check-clobber.mjs — a commit that puts back old file contents over a
// recent commit it doesn't name fails; rewrites, cuts and named reverts pass.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, analyzeCommit, mentions, parseDiff, generated, isClobber } from '../tools/check-clobber.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const T0 = Date.parse('2026-10-21T12:00:00Z') / 1000;

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'clobber-'));
  const run = (args, env = {}) =>
    execFileSync('git', args, {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', ...env },
    }).trim();
  run(['init', '-q', '-b', 'main']);
  run(['config', 'user.email', 't@example.com']);
  run(['config', 'user.name', 'T']);
  run(['config', 'commit.gpgsign', 'false']);
  let clock = T0;
  const commit = (files, message, { at } = {}) => {
    for (const [p, body] of Object.entries(files)) {
      const full = join(dir, p);
      if (body === null) {
        rmSync(full);
        continue;
      }
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, body);
    }
    run(['add', '-A']);
    clock = at ?? clock + 600;
    const date = `${clock} +0000`;
    run(['commit', '-q', '-m', message], { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date });
    return run(['rev-parse', 'HEAD']);
  };
  return { dir, commit, done: () => rmSync(dir, { recursive: true, force: true }) };
}

const lines = (prefix, n) => Array.from({ length: n }, (_, i) => `const ${prefix}${i} = compute('${prefix}', ${i});`);
const OLD = [...lines('old', 15), ''].join('\n');
const FEATURE = [...lines('elite', 15), ''].join('\n'); // the accepted work
const MINE = 'export const mine = true; // the second agent\'s own change\n';

function scenario(fn) {
  const r = repo();
  try {
    const base = r.commit({ 'game/core.js': OLD, 'game/other.js': 'x\n' }, 'base', { at: T0 });
    const feature = r.commit({ 'game/core.js': FEATURE }, 'lingjing 守炉 × 结印 tuned: elites');
    return fn(r, { base, feature });
  } finally {
    r.done();
  }
}

test('a commit that copies an old file back over recent work fails, naming that work', () => {
  scenario((r, { feature }) => {
    const clobber = r.commit({ 'game/core.js': OLD, 'game/mine.js': MINE }, 'lingjing 第一回 at six boards');
    const found = check({ commits: [clobber], cwd: r.dir });
    assert.equal(found.length, 1);
    assert.equal(found[0].victim.commit.sha, feature);
    assert.equal(found[0].victim.lines, 15);
    assert.ok(found[0].victim.oldCopies.includes('game/core.js'));
  });
});

test('old lines put back inside an edited file still count (not a byte-identical copy)', () => {
  scenario((r, { feature }) => {
    const clobber = r.commit({ 'game/core.js': `${MINE}${OLD}` }, 'lingjing 第一回 at six boards');
    const [f] = check({ commits: [clobber], cwd: r.dir });
    assert.equal(f.victim.commit.sha, feature);
    assert.equal(f.victim.restoredOld, 15);
    assert.deepEqual(f.victim.oldCopies, []);
  });
});

test('a rewrite — the recent lines replaced by new lines — passes', () => {
  scenario((r) => {
    const rewrite = r.commit({ 'game/core.js': [...lines('reworked', 15), ''].join('\n') }, 'lingjing 守炉 reworked');
    assert.deepEqual(check({ commits: [rewrite], cwd: r.dir }), []);
  });
});

test('a plain cut — recent lines deleted, nothing old put back — passes', () => {
  scenario((r) => {
    const cut = r.commit({ 'game/core.js': '// cut\n' }, 'lingjing 守炉 elites cut');
    assert.deepEqual(check({ commits: [cut], cwd: r.dir }), []);
  });
});

test('a revert that names its target (hash or subject) passes', () => {
  scenario((r, { feature }) => {
    const byHash = r.commit({ 'game/core.js': OLD }, `lingjing back to the old core (reverts ${feature.slice(0, 8)})`);
    assert.deepEqual(check({ commits: [byHash], cwd: r.dir }), []);
  });
  scenario((r) => {
    const bySubject = r.commit({ 'game/core.js': OLD }, 'lingjing undo 守炉 × 结印 tuned: elites — Hanli asked');
    assert.deepEqual(check({ commits: [bySubject], cwd: r.dir }), []);
  });
});

test('work older than the window is not guarded', () => {
  scenario((r) => {
    const late = r.commit({ 'game/core.js': OLD }, 'lingjing old core', { at: T0 + 4 * 86400 });
    assert.deepEqual(check({ commits: [late], cwd: r.dir }), []);
    assert.equal(check({ commits: [late], cwd: r.dir, windowHours: 24 * 7 }).length, 1);
  });
});

test('build outputs are not counted (a rebuild rewrites them whole)', () => {
  const r = repo();
  try {
    r.commit({ 'kit/kit.min.mjs': OLD }, 'base', { at: T0 });
    r.commit({ 'kit/kit.min.mjs': FEATURE }, 'kit rebuilt');
    const back = r.commit({ 'kit/kit.min.mjs': OLD }, 'kit rebuilt again');
    assert.deepEqual(check({ commits: [back], cwd: r.dir }), []);
  } finally {
    r.done();
  }
});

test('an agent dropping lines it added an hour ago is a cut, not a clobber', () => {
  scenario((r) => {
    // An agent's two commits: the second undoes part of the first — still flagged unless named.
    const own = r.commit({ 'game/a.js': [...lines('first', 12), ''].join('\n') }, 'lingjing first try');
    const redo = r.commit({ 'game/a.js': '' }, 'lingjing first try dropped');
    const res = analyzeCommit(redo, { cwd: r.dir });
    assert.equal(res.victims[0].commit.sha, own);
    assert.equal(isClobber(res.victims[0]), false); // a cut: nothing old came back
  });
});

test('helpers: parseDiff, mentions, generated', () => {
  const files = parseDiff(
    'diff --git a/x.js b/x.js\n--- a/x.js\n+++ b/x.js\n@@ -3,2 +3 @@\n-one line\n-two line\n+three line\n',
  );
  assert.equal(files[0].oldPath, 'x.js');
  assert.deepEqual(files[0].hunks[0], { oldStart: 3, oldCount: 2, removed: ['one line', 'two line'], added: ['three line'] });
  const target = { sha: 'b23b2f5900000000000000000000000000000000', subject: 'lingjing 守炉 × 结印 tuned (Hanli 10-21): every level' };
  assert.ok(mentions('restore b23b2f59 (wiped by d36ee70a)', target));
  assert.ok(mentions('redo of 守炉 × 结印 tuned (Hanli 10-21)', target));
  assert.ok(!mentions('lingjing 第一回 at six boards', target));
  assert.ok(!mentions('b23b2f5', { ...target, sha: 'aaaaaaa' + target.sha.slice(7) }));
  assert.ok(generated('lingjing/scripts/games/sadoushou/sadoushou.min.mjs'));
  assert.ok(generated('lingjing/scripts/games/sadoushou/source.json'));
  assert.ok(generated('lingjing/scripts/games/sadoushou/font/chars.txt'));
  assert.ok(!generated('lingjing/tests/fixtures/saves/arcade-twenty.json'));
});

// The real thing, when this clone has the history: d36ee70a (10-21) wiped
// b23b2f59 and seven more; the twenty commits after it are normal work.
const has = (rev) => {
  try {
    execFileSync('git', ['cat-file', '-e', `${rev}^{commit}`], { cwd: ROOT, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};
test('history: fails on d36ee70a, passes on the commits after it', { skip: !(has('d36ee70a') && has('541362b6')) && 'shallow clone' }, () => {
  const sha = (r) => execFileSync('git', ['rev-parse', r], { cwd: ROOT, encoding: 'utf8' }).trim();
  const bad = check({ commits: [sha('d36ee70a')], cwd: ROOT });
  const victims = bad.map((f) => f.victim.commit.sha.slice(0, 8));
  for (const v of ['b23b2f59', '7cb91325', '73aae290', '01bc9103', '4916776e', 'ea5206c1', 'ef409311', '53dfc9c2']) {
    assert.ok(victims.includes(v), `d36ee70a should be caught reverting ${v}`);
  }
  const after = execFileSync('git', ['rev-list', '--reverse', 'd36ee70a..541362b6'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  assert.equal(after.length, 20);
  assert.deepEqual(check({ commits: after, cwd: ROOT }), []);
});
