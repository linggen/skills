// A chat session bound to a scratch save (rules/bind.mjs): the scratch page
// mounts a chat of its own (`?save=x&chat=1`) and binds its session, so the
// tool calls Ling and 银月 make there play the scratch save. These check the
// promise that matters: a bound session's calls never touch data/state.json
// (nor its log), an unbound one plays the real save as ever (default deny),
// and only the page binds.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const RULES = path.resolve(import.meta.dirname, '../scripts/rules.mjs');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'lingjing-bind-'));
const REAL = path.join(DATA, 'state.json'), LOG = path.join(DATA, 'log.jsonl');
const SCRATCH = path.join(DATA, 'saves', 'bt', 'state.json');

/* One verb, as the engine runs a tool: `sid` is the session it runs in (LINGGEN_SESSION_ID). */
function rules(args, sid = null) {
  const env = { ...process.env, LINGJING_DATA: DATA, LINGJING_STAMINA_LIMIT: '0', LINGGEN_LANGUAGE: 'zh' };
  delete env.LINGGEN_SESSION_ID;
  delete env.LINGJING_SAVE;
  if (sid) env.LINGGEN_SESSION_ID = sid;
  const out = spawnSync(process.execPath, [RULES, ...args], { encoding: 'utf8', env });
  return JSON.parse(out.stdout.trim().split('\n').pop());
}
const fingerprint = file => (fs.existsSync(file) ? `${fs.statSync(file).mtimeMs}|${fs.readFileSync(file, 'utf8')}` : null);

test.after(() => fs.rmSync(DATA, { recursive: true, force: true }));

test('a bound session plays the scratch save — Ling\'s and 银月\'s calls never touch data/state.json', () => {
  assert.equal(rules(['look']).ok !== false, true, 'the real save begun');
  assert.equal(rules(['seed', '--save=bt', '--at=古七']).ok, true, 'the scratch save at 古七, 银月 asleep in the token');
  const scratch0 = JSON.parse(fs.readFileSync(SCRATCH, 'utf8'));
  assert.ok(scratch0.companion?.joined && scratch0.companion.asleep);
  assert.equal(rules(['bind', '--save=bt', '--session=sess-bound']).ok, true);
  const real = fingerprint(REAL), log = fingerprint(LOG);

  // Ling's tools in the bound session: a Look, the book, a guide read.
  const seen = rules(['look', '--for=ling'], 'sess-bound');
  assert.equal(seen.scene?.id ?? seen.scene, JSON.parse(fs.readFileSync(SCRATCH, 'utf8')).scene, 'Ling reads the scratch save');
  rules(['story', '--short=true', '--for=ling'], 'sess-bound');
  // 银月's tools at the table: her read, and 二十问 hosted from the token — opened, asked, guessed.
  assert.equal(rules(['progress', '--for=yinyue'], 'sess-bound').her?.asleep, true);
  const opened = rules(['twenty', '--action=open', '--for=yinyue'], 'sess-bound');
  assert.equal(opened.ok, true, JSON.stringify(opened).slice(0, 200));
  assert.match(opened.host, /^You are ASLEEP/);
  assert.equal(rules(['twenty', '--action=ask', '--question=会飞吗', '--answer=no', '--for=yinyue'], 'sess-bound').count, 1);
  rules(['twenty', '--action=guess', '--guess=麒麟', '--for=yinyue'], 'sess-bound');

  assert.equal(fingerprint(REAL), real, 'data/state.json untouched');
  assert.equal(fingerprint(LOG), log, 'its log untouched');
  const after = JSON.parse(fs.readFileSync(SCRATCH, 'utf8'));
  assert.equal(after.twenty.game.asked.length, 1, 'the count is on the scratch save');
});

test('default deny: an unbound session plays the real save, and only the page binds', () => {
  // The real save is a fresh game: no 银月 — her game is refused there, read from there.
  assert.equal(rules(['twenty', '--action=host', '--for=yinyue'], 'sess-other').refused, 'no-host');
  assert.equal(rules(['twenty', '--action=host', '--for=yinyue']).refused, 'no-host', 'no session at all: the real save');
  assert.equal(rules(['bind', '--save=bt', '--session=sess-x', '--for=ling']).refused, 'page-only', 'never Ling\'s');
  assert.equal(rules(['bind', '--session=sess-x']).refused, 'not-scratch', 'only on a scratch save');
  assert.equal(rules(['bind', '--save=bt', '--session=../../x']).refused, 'bad-session');
  const listed = rules(['bound']).sessions.map(b => b.session);
  assert.deepEqual(listed, ['sess-bound'], 'the real page skips these when it picks its chat');
  // A binding names a save by its plain name only: a bad one in the file binds nothing.
  const file = path.join(DATA, 'scratch-sessions.json');
  fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), evil: { save: '../..', at: new Date().toISOString() } }));
  assert.equal(rules(['twenty', '--action=host', '--for=yinyue'], 'evil').refused, 'no-host', 'a bad name: the real save, not a path');
});
