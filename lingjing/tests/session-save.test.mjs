// A chat bound to a test save (Hanli, 2026-10-19; skill-spec § Session parameters): SKILL.md declares
// `session-params: {save}`, every tool Ling or 银月 call carries `--save={{session.save}}`, and the
// engine renders it as one quoted word — the session's save, or '' when the chat is bound to none.
// The law this file locks: a chat bound to a test save NEVER writes the main data/state.json; and an
// unbound chat's empty `--save=` is the main save, never `bad-save`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTools } from './skill-md.test.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MD = fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf8');
const { tools } = readTools(MD);
const RULES = /scripts\/rules\.mjs /;

test('SKILL.md declares the save a session may be bound to, the pattern the rules take', () => {
  const fm = MD.slice(0, MD.indexOf('\n---\n', 4));
  const block = /\nsession-params:\n {2}save:\n {4}pattern: "([^"]+)"/.exec(fm);
  assert.ok(block, 'session-params.save with a pattern');
  const engine = new RegExp(`^(?:${block[1]})$`); // the engine anchors it
  for (const ok of ['cc-x', 'arcade-drawguess', 'lx-gu3', 'a']) assert.ok(engine.test(ok), ok);
  for (const no of ['', '-x', '../x', 'a/b', 'x'.repeat(33)]) assert.ok(!engine.test(no), no);
});

test('every tool Ling or 银月 call that runs the rules carries the session\'s save; the page\'s Verb carries its own flag', () => {
  const ruled = tools.filter((t) => RULES.test(t.cmd));
  assert.ok(ruled.length > 30, `found ${ruled.length}`);
  for (const t of ruled) {
    const n = (t.cmd.match(/--save=/g) ?? []).length;
    if (t.name === 'Verb') assert.equal(n, 0, 'Verb: the page sends --save itself (rules.js flagsOf), never twice');
    else assert.equal((t.cmd.match(/ --save=\{\{session\.save\}\} /g) ?? []).length, 1, `${t.name}: ${t.cmd}`);
  }
});

/* A tool's cmd as the engine runs it: $SKILL_DIR, then each placeholder as one single-quoted word —
   an arg not given and an unbound `{{session.save}}` as ''. */
function render(cmd, { save = null, args = {} } = {}) {
  const q = (v) => `'${String(v ?? '').replace(/'/g, `'\\''`)}'`;
  return cmd.replace(/^"|"$/g, '').replace(/\$SKILL_DIR/g, ROOT)
    .replace(/\{\{session\.save\}\}/g, q(save ?? ''))
    .replace(/\{\{(\w+)\}\}/g, (_, k) => q(args[k]));
}
const toolCmd = (name) => tools.find((t) => t.name === name).cmd;
function runTool(name, data, opts) {
  const out = execFileSync('bash', ['-c', render(toolCmd(name), opts)], { env: { ...process.env, LINGJING_DATA: data, LINGJING_SAVE: '' }, encoding: 'utf8', timeout: 30000, maxBuffer: 64 << 20 });
  return JSON.parse(out.trim().split('\n').pop());
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lj-session-'));
const bytes = (f) => (fs.existsSync(f) ? fs.readFileSync(f) : null);

test('a chat bound to a test save NEVER writes the main data/state.json — Restart, Look, Resolve and her Progress all play data/saves/<save>/', () => {
  const data = tmp();
  try {
    // The main save, begun by an unbound chat's Restart (`--save=''` → the main save).
    const main = path.join(data, 'state.json');
    assert.equal(runTool('Restart', data, {}).ok, true);
    const before = bytes(main);
    assert.ok(before, 'the unbound chat wrote the main save');
    const mtime = fs.statSync(main).mtimeMs;
    // The bound chat's moves: every one writes or reads the test save only.
    const bound = { save: 'cc-bound' };
    assert.equal(runTool('Restart', data, bound).ok, true);
    const look = runTool('Look', data, { ...bound, args: { said: '看看' } });
    assert.ok(look && look.ok !== false, JSON.stringify(look).slice(0, 200));
    const exit = (look.scene?.exits ?? [])[0]?.id;
    if (exit) runTool('Resolve', data, { ...bound, args: { exit, said: '走' } });
    runTool('Progress', data, bound);
    assert.ok(fs.existsSync(path.join(data, 'saves', 'cc-bound', 'state.json')), 'the test save was written');
    assert.deepEqual(bytes(main), before, 'the main save is byte for byte what it was');
    assert.equal(fs.statSync(main).mtimeMs, mtime, 'and never rewritten');
  } finally {
    fs.rmSync(data, { recursive: true, force: true });
  }
});

test('an unbound chat\'s empty --save= is the main save, never `bad-save` (and an unrendered placeholder too)', () => {
  const data = tmp();
  try {
    const cmd = (save) => `bash ${ROOT}/scripts/run-js.sh ${ROOT}/scripts/rules.mjs progress ${save} --for=yinyue`;
    for (const flag of ["--save=''", '--save=', "--save ''", "'--save={{session.save}}'"]) {
      const out = JSON.parse(execFileSync('bash', ['-c', cmd(flag)], { env: { ...process.env, LINGJING_DATA: data, LINGJING_SAVE: '' }, encoding: 'utf8' }).trim().split('\n').pop());
      assert.notEqual(out.refused, 'bad-save', flag);
    }
    assert.ok(!fs.existsSync(path.join(data, 'saves')), 'no test save was made of an empty name');
    // A name the rules would not take is still refused.
    const bad = JSON.parse(execFileSync('bash', ['-c', cmd("--save='../x'")], { env: { ...process.env, LINGJING_DATA: data }, encoding: 'utf8' }).trim());
    assert.equal(bad.refused, 'bad-save');
  } finally {
    fs.rmSync(data, { recursive: true, force: true });
  }
});

test('the page resumes only a chat bound as it is: the main page never a test save\'s, a test save never the main one', () => {
  const page = fs.readFileSync(path.join(ROOT, 'scripts', 'lingjing.js'), 'utf8');
  assert.match(page, /const CHAT_PARAMS = SCRATCH \? \{ save: SCRATCH \} : undefined;/);
  // boundTo(list, {}) keeps the unbound sessions; boundTo(list, {save}) only that save's (/shared/api.js).
  assert.match(page, /sharedApi\.boundTo\(list, CHAT_PARAMS \?\? \{\}\)/);
  assert.match(page, /return pickResumable\(boundAsPage\(await listSkillSessions\(SKILL\)\)\);/);
  // A new chat is bound the same way: the mount's, and the one a new game opens.
  assert.match(page, /sessionId: resume \|\| undefined,\n\s*params: CHAT_PARAMS,/);
  assert.match(page, /createSession\('Lingjing', SKILL, CHAT_PARAMS\)/);
  // A test save has its chat: no gate before the mount but the crawlers' `&chat=off`.
  assert.doesNotMatch(page, /if \(SCRATCH\) \{ \$\('chat-panel'\)/);
  assert.match(page, /const CHATLESS = Boolean\(SCRATCH\) && new URLSearchParams\(location\.search\)\.get\('chat'\) === 'off';/);
  // …and it never syncs the account's cloud.
  assert.match(page, /if \(!SCRATCH\) await syncCloud\(SKILL\);/);
  for (const tool of ['playtest.mjs', 'page-crawl.mjs', 'play-human.mjs']) {
    const src = fs.readFileSync(path.join(ROOT, 'tools', tool), 'utf8');
    for (const m of src.matchAll(/index\.html\?save=\$\{save\}[^`]*/g)) assert.match(m[0], /&chat=off/, `${tool}: a crawler asks no model`);
  }
});
