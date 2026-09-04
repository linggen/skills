// run-life.mjs — the working day: what it reads, what it refuses to invent,
// and the one sentence it hands the agent.
// Run: node tests/run-life.mjs

import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { build, read, refresh, settled, say, write, dayOf } from '../scripts/life.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

let pass = 0;
const ok = (name, fn) => {
  fn();
  pass += 1;
  console.log(`  ok  ${name}`);
};

/// A health dir with its own config, and a Linggen dir with its own sessions
/// and activity — so nothing here reads the machine it is running on.
function stage(workspaces = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'life-'));
  const health = path.join(root, 'health');
  const linggen = path.join(root, 'linggen');
  fs.mkdirSync(health, { recursive: true });
  fs.mkdirSync(path.join(linggen, 'sessions'), { recursive: true });
  fs.mkdirSync(path.join(linggen, 'activity'), { recursive: true });
  fs.writeFileSync(
    path.join(health, 'config.json'),
    JSON.stringify({ units: 'metric', workspaces }),
  );
  process.env.HEALTH_DIR = health;
  process.env.LINGGEN_DIR = linggen;
  return { root, health, linggen };
}

/// A repository with commits at the times given, authored by whoever this
/// machine's git says — which is what the assembler filters on.
function repoWith(dir, times, date) {
  fs.mkdirSync(dir, { recursive: true });
  const git = (...args) =>
    execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: 'pipe' });
  git('init', '-q');
  git('config', 'user.email', 'tester@example.com');
  git('config', 'user.name', 'Tester');
  for (const [i, t] of times.entries()) {
    fs.writeFileSync(path.join(dir, `f${i}.txt`), String(i));
    git('add', '.');
    const when = `${date}T${t}:00`;
    execFileSync('git', ['-C', dir, 'commit', '-q', '-m', `c${i}`], {
      env: { ...process.env, GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when },
      stdio: 'pipe',
    });
  }
}

const DAY = '2026-09-03';

ok('no workspaces is an absence with a reason, never a day with no commits', () => {
  stage([]);
  const day = build(DAY);
  assert.equal(day.commits, null);
  assert.match(day.commits_absent, /no workspaces configured/);
});

ok('commits are counted, timed, and the late ones named', () => {
  const { root } = stage();
  const ws = path.join(root, 'ws');
  repoWith(path.join(ws, 'thing'), ['09:12', '14:30', '23:41', '23:58'], DAY);
  fs.writeFileSync(
    path.join(process.env.HEALTH_DIR, 'config.json'),
    JSON.stringify({ workspaces: [ws] }),
  );
  const day = build(DAY);
  assert.equal(day.commits.count, 4);
  assert.equal(day.commits.first, '09:12');
  assert.equal(day.commits.last, '23:41' > '23:58' ? '23:41' : '23:58');
  assert.equal(day.commits.after_23, 2);
  assert.deepEqual(day.commits.repos, ['thing 4']);
  assert.match(day.said, /4 commits between 09:12 and 23:58/);
  assert.match(day.said, /2 of them after 23:00/);
});

ok('a repository two folders down is found — org/repo is ordinary', () => {
  const { root } = stage();
  const ws = path.join(root, 'ws');
  repoWith(path.join(ws, 'org', 'thing'), ['11:00'], DAY);
  fs.writeFileSync(
    path.join(process.env.HEALTH_DIR, 'config.json'),
    JSON.stringify({ workspaces: [ws] }),
  );
  assert.equal(build(DAY).commits.count, 1);
});

ok('a root that is itself a repository counts', () => {
  const { root } = stage();
  const solo = path.join(root, 'solo');
  repoWith(solo, ['10:00'], DAY);
  fs.writeFileSync(
    path.join(process.env.HEALTH_DIR, 'config.json'),
    JSON.stringify({ workspaces: [solo] }),
  );
  assert.equal(build(DAY).commits.count, 1);
});

ok('a day with no commits in a configured repo is a real zero', () => {
  const { root } = stage();
  const ws = path.join(root, 'ws');
  repoWith(path.join(ws, 'thing'), ['09:00'], '2026-08-01');
  fs.writeFileSync(
    path.join(process.env.HEALTH_DIR, 'config.json'),
    JSON.stringify({ workspaces: [ws] }),
  );
  const day = build(DAY);
  assert.equal(day.commits.count, 0, 'we looked, and there were none');
  assert.equal(day.commits_absent, undefined);
});

ok('sessions and the activity log give the shape of the day', () => {
  const { linggen } = stage();
  const sess = path.join(linggen, 'sessions', 'sess-1');
  fs.mkdirSync(sess, { recursive: true });
  const at = (h, m) => Math.floor(new Date(`${DAY}T${h}:${m}:00`).getTime() / 1000);
  fs.writeFileSync(
    path.join(sess, 'messages.jsonl'),
    [
      JSON.stringify({ from_id: 'user', timestamp: at('09', '05') }),
      JSON.stringify({ from_id: 'ling', timestamp: at('09', '06') }),
      JSON.stringify({ from_id: 'user', timestamp: at('22', '40') }),
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(linggen, 'activity', `${DAY}.jsonl`),
    [
      JSON.stringify({ at: `${DAY}T08:50:00Z`, verb: 'connect' }),
      JSON.stringify({ at: `${DAY}T23:52:00Z`, verb: 'disconnect' }),
    ].join('\n'),
  );
  const day = build(DAY);
  assert.equal(day.sessions.count, 1);
  assert.equal(day.sessions.messages, 2, 'only what the user said');
  assert.equal(day.sessions.first, '09:05');
  assert.equal(day.sessions.last, '22:40');
  assert.ok(day.awake.entries === 2);
});

ok('a day nothing was seen on says nothing rather than something empty', () => {
  stage([]);
  const day = build('2019-01-01');
  assert.equal(day.said, null);
  assert.equal(day.sessions.count, 0);
  assert.equal(day.awake, null);
  assert.match(day.awake_absent, /activity log/);
});

ok('a fresh file is kept and a stale one is built again', () => {
  stage([]);
  const first = refresh(DAY);
  const file = path.join(process.env.HEALTH_DIR, 'data', 'life', `${DAY}.json`);
  assert.ok(fs.existsSync(file));
  const again = refresh(DAY);
  assert.equal(again.written_at, first.written_at, 'still fresh');

  const stale = { ...first, written_at: '2020-01-01T00:00:00.000Z' };
  write(stale);
  const rebuilt = refresh(DAY);
  assert.notEqual(rebuilt.written_at, stale.written_at);
  assert.equal(read(DAY).date, DAY);
});

ok('a finished day is assembled once and then left alone', () => {
  stage([]);
  const first = settled('2026-08-30');
  const again = settled('2026-08-30');
  assert.equal(again.written_at, first.written_at, 'a finished day cannot change');
});

ok('the report carries the working day, and today is refreshed on the way', () => {
  const { health } = stage([]);
  const out = execFileSync(
    process.execPath,
    [path.join(HERE, '..', 'scripts', 'ingest.mjs'), 'report'],
    { encoding: 'utf8', env: { ...process.env, HEALTH_DIR: health } },
  );
  const r = JSON.parse(out.trim().split('\n').pop());
  assert.ok(r.work, 'report says what this Mac saw of the day');
  assert.equal(r.work.today.date, dayOf(new Date()));
  assert.ok(r.work.yesterday, 'yesterday is assembled on the way — it is the '
    + 'day a morning conversation is about');
});

console.log(`\n${pass} checks passed`);
