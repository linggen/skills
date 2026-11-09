// mac-player.mjs — headless playback on the Mac, no page needed. Backs the
// PlayOnMac and MacPlayer tools: a play asked for from the phone (or any
// handoff) when no DJ page is open to carry the sound.
//
//   play <tracks>   replace the queue and start it ({artist,title} | {file} | "file")
//   pause | resume  SIGSTOP / SIGCONT the player process
//   next            end the current track; the runner moves on
//   stop            end the runner and the player
//   status          what is really playing
//   run <token>     (internal) the detached runner: one player process per
//                   track, in order, until the queue ends or a stop
//
// The state lives in data/mac-player.json. Every verb answers with what the
// processes say — is the player alive, is it stopped (paused), which track —
// never with what the state file hopes. A runner that died leaves a stale pid;
// status reads that as stopped.
//
// DJ_PLAYER_BIN swaps /usr/bin/afplay out (tests use a silent stand-in).
// Runs under bun or node (run-js.sh picks). Every verb prints one JSON line.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { normalize, resolveTracks } from './store.js';
import { readJson, writeJson, LIB, DATA } from './io.mjs';

export const STATE = path.join(DATA, 'mac-player.json');
export const BIN = process.env.DJ_PLAYER_BIN || '/usr/bin/afplay';
const SELF = fileURLToPath(import.meta.url);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const placeholder = (s) => /^\{\{.*\}\}$/.test(String(s ?? '').trim());

// ── resolving what to play ───────────────────────────────────────────────────

/// The asked-for songs as library rows that exist on disk, in the order asked,
/// and the asks that name nothing playable. Same names ListLibrary gives and a
/// page `play` takes: {artist, title}, {file}, or a bare file name.
export function resolveQueue(lib, wanted, exists = fs.existsSync) {
  const keys = wanted.map((w) => {
    if (typeof w === 'string') return w;
    if (w && w.file) return String(w.file);
    if (w && (w.artist || w.title)) return `${String(w.artist || '').trim()}|${String(w.title || '').trim()}`.toLowerCase();
    return '';
  });
  const queue = [];
  const missing = [];
  keys.forEach((key, i) => {
    const label = typeof wanted[i] === 'object' && wanted[i]
      ? [wanted[i].artist, wanted[i].title].filter(Boolean).join(' - ') || wanted[i].file || '?'
      : String(wanted[i]);
    const [row] = key ? resolveTracks(lib, [key]).hits : [];
    if (!row) missing.push(`${label}: not in the library`);
    else if (!exists(row.file)) missing.push(`${label}: file is missing on disk`);
    else queue.push({ artist: row.artist || '', title: row.title || '', file: row.file });
  });
  return { queue, missing };
}

export function parseTracks(raw) {
  const s = String(raw ?? '').trim();
  if (!s || placeholder(s)) throw new Error('missing tracks');
  let v;
  try { v = JSON.parse(s); } catch { v = s; } // a bare file name
  if (v && !Array.isArray(v) && typeof v === 'object' && Array.isArray(v.tracks)) v = v.tracks;
  const list = Array.isArray(v) ? v : [v];
  if (!list.length) throw new Error('tracks must name at least one song');
  return list;
}

// ── what the processes say ───────────────────────────────────────────────────

/// One process as ps sees it, or null when there is none.
export function probe(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    const out = execFileSync('/bin/ps', ['-o', 'stat=,ppid=,command=', '-p', String(pid)], { encoding: 'utf8' }).trim();
    const m = out.match(/^(\S+)\s+(\d+)\s+(.*)$/);
    return m ? { stat: m[1], ppid: +m[2], command: m[3] } : null;
  } catch {
    return null; // ps exits 1 for a pid that is gone
  }
}

const isRunner = (p) => !!p && p.command.includes('mac-player.mjs') && /\brun\b/.test(p.command) && !p.stat.startsWith('Z');
const isPlayer = (p, bin) => !!p && p.command.includes(bin) && !p.stat.startsWith('Z');

/// The real status, from the state file and the two processes. Pure given
/// `look` (a pid → probe() function), so it is tested without audio.
export function statusOf(st, look = probe, bin = BIN) {
  const base = { ok: true, playing: false, state: 'stopped' };
  if (!st || !st.token || !Array.isArray(st.queue) || !st.queue.length) {
    return { ...base, ...(st?.last_error ? { last_error: st.last_error } : {}), ...(st?.ended ? { ended: st.ended } : {}) };
  }
  const runner = look(st.runner_pid);
  const player = look(st.player_pid);
  const track = st.queue[st.index] || null;
  const facts = { index: st.index, count: st.queue.length, track, started_at: st.started_at };
  if (st.last_error) facts.last_error = st.last_error;
  if (!isRunner(runner)) {
    // The runner died. A player it left behind still makes sound — say so —
    // but nothing will follow it.
    if (isPlayer(player, bin)) {
      const paused = player.stat.includes('T');
      return { ...base, playing: !paused, state: paused ? 'paused' : 'playing', note: 'the queue will not advance', ...facts };
    }
    return { ...base, stale: true, note: 'the player is not running', ...facts };
  }
  if (!isPlayer(player, bin)) return { ...base, state: 'loading', ...facts };
  if (player.stat.includes('T')) return { ...base, state: 'paused', ...facts };
  return { ...base, playing: true, state: 'playing', ...facts };
}

const readState = () => readJson(STATE, {});
const saveState = (st) => writeJson(STATE, st);
const signal = (pid, sig) => { try { process.kill(pid, sig); return true; } catch { return false; } };

async function waitFor(test, ms = 1500, step = 50) {
  for (let t = 0; t < ms; t += step) {
    if (test()) return true;
    await sleep(step);
  }
  return test();
}

// ── the verbs ────────────────────────────────────────────────────────────────

/// End whatever runs: the runner first, so it cannot start the next track, then
/// the player (continued first — a stopped process ignores TERM until CONT).
async function halt(st) {
  const runner = probe(st.runner_pid);
  if (isRunner(runner)) {
    signal(st.runner_pid, 'SIGTERM');
    await waitFor(() => !isRunner(probe(st.runner_pid)), 1500);
    if (isRunner(probe(st.runner_pid))) signal(st.runner_pid, 'SIGKILL');
  }
  if (isPlayer(probe(st.player_pid), BIN)) {
    signal(st.player_pid, 'SIGCONT');
    signal(st.player_pid, 'SIGTERM');
    await waitFor(() => !isPlayer(probe(st.player_pid), BIN), 1000);
    if (isPlayer(probe(st.player_pid), BIN)) signal(st.player_pid, 'SIGKILL');
  }
}

async function stop() {
  const st = readState();
  await halt(st);
  const was = st.queue?.[st.index] || null;
  saveState({ last_error: st.last_error || undefined, stopped_at: new Date().toISOString() });
  return { ...statusOf(readState()), ...(was ? { stopped: was } : {}) };
}

/// A fresh runner process in its own session, cut loose from this call's pipes
/// so the tool returns at once and the music outlives it.
function launchRunner(token) {
  const child = spawn(process.execPath, [SELF, 'run', token], {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  });
  child.unref();
  return child.pid;
}

async function play(raw) {
  const wanted = parseTracks(raw);
  const lib = normalize(readJson(LIB, {}));
  const { queue, missing } = resolveQueue(lib, wanted);
  if (!queue.length) return { ok: false, playing: false, state: 'stopped', error: 'nothing to play', missing };
  await halt(readState());
  const token = crypto.randomUUID();
  saveState({ token, queue, index: 0, started_at: new Date().toISOString(), runner_pid: null, player_pid: null });
  const pid = launchRunner(token);
  // The runner records itself; wait until the first track's player is up, then
  // a beat more so a player that dies at once (an unreadable file) shows.
  await waitFor(() => isPlayer(probe(readState().player_pid), BIN) || !probe(pid), 2500);
  await sleep(400);
  const s = statusOf(readState());
  if (!s.playing) s.error = s.last_error || 'the player did not start';
  return missing.length ? { ...s, missing } : s;
}

async function pauseResume(sig, want) {
  const st = readState();
  const s = statusOf(st);
  if (s.state === 'stopped') return { ...s, error: 'nothing is playing' };
  signal(st.player_pid, sig);
  await waitFor(() => statusOf(readState()).state === want, 1000);
  return statusOf(readState());
}

async function next() {
  const st = readState();
  const s = statusOf(st);
  if (s.state === 'stopped') return { ...s, error: 'nothing is playing' };
  const was = st.player_pid;
  signal(was, 'SIGCONT');
  signal(was, 'SIGTERM');
  await waitFor(() => {
    const now = readState();
    return statusOf(now).state === 'stopped' || (now.player_pid && now.player_pid !== was && isPlayer(probe(now.player_pid), BIN));
  }, 2500);
  return statusOf(readState());
}

// ── the runner ───────────────────────────────────────────────────────────────

async function run(token) {
  let child = null;
  const quit = () => { if (child) { signal(child.pid, 'SIGCONT'); signal(child.pid, 'SIGTERM'); } process.exit(0); };
  process.on('SIGTERM', quit);
  process.on('SIGINT', quit);
  process.on('SIGHUP', () => {}); // the caller's terminal going away is not a stop
  for (;;) {
    const st = readState();
    if (st.token !== token) return;
    if (st.index >= st.queue.length) {
      saveState({ ended: new Date().toISOString(), last_error: st.last_error || undefined });
      return;
    }
    const t = st.queue[st.index];
    const began = Date.now();
    child = spawn(BIN, [t.file], { stdio: 'ignore' });
    saveState({ ...st, runner_pid: process.pid, player_pid: child.pid, track_started_at: new Date(began).toISOString() });
    const code = await new Promise((r) => {
      child.on('exit', (c, sig) => r(sig ? 0 : c));
      child.on('error', (e) => r(e.code || 1));
    });
    child = null;
    const after = readState();
    if (after.token !== token) return;
    const failed = code !== 0 && Date.now() - began < 3000;
    saveState({
      ...after,
      index: after.index + 1,
      player_pid: null,
      ...(failed ? { last_error: `could not play ${path.basename(t.file)} (${code})` } : {}),
    });
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────────

const VERBS = {
  play: (a) => play(a),
  pause: () => pauseResume('SIGSTOP', 'paused'),
  resume: () => pauseResume('SIGCONT', 'playing'),
  next: () => next(),
  stop: () => stop(),
  status: async () => statusOf(readState()),
};

async function main(argv) {
  const [verb, ...args] = argv;
  if (verb === 'run') return run(args[0]);
  const fn = VERBS[String(verb || '').trim()];
  let out;
  try {
    out = fn ? await fn(...args) : { ok: false, error: `unknown action “${verb}” — use play, pause, resume, next, stop or status` };
  } catch (e) {
    out = { ok: false, playing: false, error: String(e.message || e) };
  }
  process.stdout.write(`${JSON.stringify(out)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SELF) {
  await main(process.argv.slice(2));
}
