// life.mjs — what the Mac knows about the working day, one file per day.
//
// The body half of this app comes off a watch. This is the other half: when
// the day started, when it stopped, and what was still happening at 23:40 —
// read from what this Mac already has on disk, so it costs no permission and
// no service. Without it the agent can only ask "did you sleep badly?"; with
// it, it can say why.
//
//   life.mjs build [YYYY-MM-DD]   assemble the day and write it
//   life.mjs show  [YYYY-MM-DD]   print what is on disk, or null
//
// Three sources, all local, all already there:
//
//   * git commits across the folders `config.json` names in `workspaces` —
//     the one that carries a late night better than anything else, because a
//     commit is stamped with the minute it was made.
//   * Linggen's own sessions — when this person was working WITH the machine.
//   * the activity log the perception lane writes — the coarse shape of when
//     the Mac was awake and being used.
//
// Absent is never zero, here as everywhere: no workspaces configured is
// `commits: null` with the reason, never `0`, because "he committed nothing"
// and "nobody told us where to look" are different facts and only one of them
// is about him.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const HOME = process.env.HOME || '';

// Read at call time, not at import. A constant captured when the module loads
// is a constant a test cannot move, and the first version of this file passed
// its own first check against the real store on this machine because of it.
const dir = () =>
  process.env.HEALTH_DIR || path.join(HOME, '.linggen', 'skills', 'health');
const lifeDir = () => path.join(dir(), 'data', 'life');
const linggenDir = () => process.env.LINGGEN_DIR || path.join(HOME, '.linggen');

/// The local day of a Date, as the rest of the store keys days.
export const dayOf = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;

const hm = (d) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

function config() {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir(), 'config.json'), 'utf8'));
  } catch {
    return {};
  }
}

/// Every git repository under the configured roots, down two levels.
///
/// Two, because that is how people actually keep code: `~/workspace/thing`
/// and `~/workspace/org/thing` are both ordinary, and a scan that only went
/// one deep would find the first and silently miss the second. A directory
/// that is itself a repository is taken whole and not descended into — the
/// repositories inside a repository are its business, not ours.
const SKIP = new Set(['node_modules', 'target', 'build', 'vendor', 'Pods']);

function repos(roots, depth = 2) {
  const out = [];
  const walk = (at, left) => {
    if (fs.existsSync(path.join(at, '.git'))) {
      out.push(at);
      return;
    }
    if (left <= 0) return;
    let kids = [];
    try {
      kids = fs.readdirSync(at, { withFileTypes: true });
    } catch {
      return;
    }
    for (const k of kids) {
      if (!k.isDirectory() || k.name.startsWith('.') || SKIP.has(k.name)) continue;
      walk(path.join(at, k.name), left - 1);
    }
  };
  for (const raw of roots) {
    walk(raw.startsWith('~') ? path.join(HOME, raw.slice(1)) : raw, depth);
  }
  return out;
}

/// This person's own commits on one day, across the repos, newest last.
///
/// `--author` is the git identity of whoever runs this, which is the only
/// author this file is about: a colleague's commits in the same repo are not
/// this person's evening.
function commits(roots, date) {
  const found = repos(roots);
  if (!found.length) {
    return {
      commits: null,
      commits_absent: roots.length
        ? 'no git repositories under the folders Health was given'
        : 'no workspaces configured, so nothing was looked at',
    };
  }
  const rows = [];
  for (const repo of found) {
    let email = '';
    try {
      email = execFileSync('git', ['-C', repo, 'config', 'user.email'], {
        encoding: 'utf8',
      }).trim();
    } catch {
      continue;
    }
    let log = '';
    try {
      log = execFileSync(
        'git',
        [
          '-C', repo, 'log', '--all', '--no-merges',
          `--author=${email}`,
          `--since=${date} 00:00:00`, `--until=${date} 23:59:59`,
          '--date=format:%H:%M', '--pretty=%ad',
        ],
        { encoding: 'utf8', timeout: 10000 },
      );
    } catch {
      continue;
    }
    for (const line of log.split('\n')) {
      const t = line.trim();
      if (/^\d{2}:\d{2}$/.test(t)) rows.push({ at: t, repo: path.basename(repo) });
    }
  }
  if (!rows.length) return { commits: { count: 0, repos: [] } };
  rows.sort((a, b) => a.at.localeCompare(b.at));
  const byRepo = {};
  for (const r of rows) byRepo[r.repo] = (byRepo[r.repo] || 0) + 1;
  return {
    commits: {
      count: rows.length,
      first: rows[0].at,
      last: rows[rows.length - 1].at,
      // The ones that say the evening went long. 23:00 rather than midnight,
      // because the hour before midnight is already the late one.
      after_23: rows.filter((r) => r.at >= '23:00').length,
      repos: Object.entries(byRepo)
        .sort((a, b) => b[1] - a[1])
        .map(([name, n]) => `${name} ${n}`),
    },
  };
}

/// When this person was working WITH Linggen: the first and last message of
/// the day across every session, and how many sessions carried one.
function sessions(date) {
  const sessionsDir = path.join(linggenDir(), 'sessions');
  let kids = [];
  try {
    kids = fs.readdirSync(sessionsDir);
  } catch {
    return { sessions: null, sessions_absent: 'no Linggen sessions on this Mac' };
  }
  const times = [];
  let live = 0;
  for (const id of kids) {
    const file = path.join(sessionsDir, id, 'messages.jsonl');
    let text = '';
    try {
      const st = fs.statSync(file);
      // A session last touched before the day started cannot hold a message
      // in it; skipping those keeps this a few reads rather than a hundred.
      if (dayOf(st.mtime) < date) continue;
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    let any = false;
    for (const line of text.split('\n')) {
      if (!line) continue;
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        continue;
      }
      if (row.from_id !== 'user' || typeof row.timestamp !== 'number') continue;
      const t = new Date(row.timestamp * 1000);
      if (dayOf(t) !== date) continue;
      times.push(t);
      any = true;
    }
    if (any) live++;
  }
  if (!times.length) return { sessions: { count: 0 } };
  times.sort((a, b) => a - b);
  return {
    sessions: {
      count: live,
      messages: times.length,
      first: hm(times[0]),
      last: hm(times[times.length - 1]),
    },
  };
}

/// The coarse shape of the day off the perception log: the first and last
/// thing this Mac saw happen.
function awake(date) {
  const file = path.join(linggenDir(), 'activity', `${date}.jsonl`);
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return { awake: null, awake_absent: 'the activity log holds nothing for that day' };
  }
  const times = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    try {
      const row = JSON.parse(line);
      const t = new Date(row.at);
      if (!Number.isNaN(t.getTime())) times.push(t);
    } catch {
      /* a torn line is skipped */
    }
  }
  if (!times.length) return { awake: null, awake_absent: 'nothing was logged that day' };
  times.sort((a, b) => a - b);
  const first = times[0];
  const last = times[times.length - 1];
  return {
    awake: {
      first: hm(first),
      last: hm(last),
      hours: Math.round(((last - first) / 3600000) * 10) / 10,
      entries: times.length,
    },
  };
}

/// The day, assembled. Every part says what it is made of, and a part with no
/// source says so in words rather than arriving as a zero.
export function build(date) {
  const cfg = config();
  const roots = Array.isArray(cfg.workspaces) ? cfg.workspaces : [];
  const day = {
    date,
    written_at: new Date().toISOString(),
    by_device: 'mac',
    ...commits(roots, date),
    ...sessions(date),
    ...awake(date),
  };
  // The one sentence the agent is here for. Built from the parts rather than
  // by the model, so it says the same thing every time and never invents an
  // evening that did not happen.
  day.said = say(day);
  return day;
}

/// What the day looked like, in one line, or null when nothing was seen.
export function say(day) {
  const bits = [];
  const c = day.commits;
  if (c && c.count > 0) {
    bits.push(
      c.count === 1
        ? `one commit, at ${c.last}`
        : `${c.count} commits between ${c.first} and ${c.last}`,
    );
    if (c.after_23 > 0) {
      bits.push(
        c.after_23 === 1
          ? 'one of them after 23:00'
          : `${c.after_23} of them after 23:00`,
      );
    }
  }
  const s = day.sessions;
  if (s && s.count > 0) {
    bits.push(`${s.messages} things asked of Linggen, last at ${s.last}`);
  }
  const a = day.awake;
  if (a) bits.push(`this Mac was in use from ${a.first} to ${a.last}`);
  if (!bits.length) return null;
  const line = bits.join('; ');
  return line.charAt(0).toUpperCase() + line.slice(1) + '.';
}

export function write(day) {
  fs.mkdirSync(lifeDir(), { recursive: true });
  const file = path.join(lifeDir(), `${day.date}.json`);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(day, null, 2));
  fs.renameSync(tmp, file);
  return file;
}

export function read(date) {
  try {
    return JSON.parse(fs.readFileSync(path.join(lifeDir(), `${date}.json`), 'utf8'));
  } catch {
    return null;
  }
}

/// Rebuild today's file when it is older than this. The day moves while it is
/// being lived, and a file written this morning does not know about tonight.
export const STALE_MS = 20 * 60 * 1000;

export function refresh(date) {
  const held = read(date);
  if (held) {
    const at = Date.parse(held.written_at || '');
    if (Number.isFinite(at) && Date.now() - at < STALE_MS) return held;
  }
  const day = build(date);
  write(day);
  return day;
}

/// A day that has finished, assembled once and then left alone.
///
/// Yesterday is the day a morning conversation is actually about — "you were
/// still committing at 23:41" is about last night — and nothing would ever
/// have built it: `refresh` is for the day being lived. A finished day cannot
/// change, so it is written once and read forever after.
export function settled(date) {
  return read(date) ?? (() => {
    const day = build(date);
    write(day);
    return day;
  })();
}

// Run directly, or import: the tool calls the functions, the shell calls this.
if (import.meta.url === `file://${process.argv[1]}`) {
  const verb = process.argv[2] || 'build';
  const date = process.argv[3] || dayOf(new Date());
  if (verb === 'show') {
    console.log(JSON.stringify(read(date)));
  } else {
    const day = build(date);
    write(day);
    console.log(JSON.stringify(day));
  }
}
