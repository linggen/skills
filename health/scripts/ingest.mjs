// ingest.mjs — the ONE writer for the Health mirror on this Mac.
//
// A phone is the sensor: HealthKit exists only on iPhone, so every sample and
// every derived file starts there. This Mac keeps a copy because it is the only
// side with room for years of it, and because the work signals the join needs
// live here. Nothing in this file infers anything — it files what it is given.
//
// Whoever asks runs through here: the phone's sync over `/api/bash`, the page's
// buttons, and the agent's tools. The page renders; this file writes.
//
// Runs under bun or node (run-js.sh picks). Usage:
//
//   ingest.mjs samples  <base64(gzip(json))>   file a batch of rows
//   ingest.mjs pull     <base64(json)>         registers this Mac holds
//   ingest.mjs push     <base64(gzip(json))>   registers the phone won
//   ingest.mjs report                          the whole current picture
//   ingest.mjs ledger                          what the mirror holds
//   ingest.mjs log      <text>                 one line the user said
//
// Every verb prints one JSON line. A payload may also arrive on stdin, which is
// how a batch too long for one shell command gets here.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

import { fold, mergeNotes, monthOf, parseLines, planWrite, summarize, wins } from './store.js';
import { refresh as refreshLife, read as readLife } from './life.mjs';

const HOME = process.env.HOME || '';
const DIR = process.env.HEALTH_DIR || path.join(HOME, '.linggen', 'skills', 'health');
const DATA = path.join(DIR, 'data');
const STATE = path.join(DATA, 'state.json');
const SAMPLES = path.join(DATA, 'samples');

// Thrown, never process.exit(): an exit inside a verb would skip the finally
// that releases the lock, and one bad batch would stall every later one.
const die = (error) => {
  throw new Error(error);
};

// The engine substitutes {{arg}} literally when the model omits an arg — a
// placeholder-shaped value is a missing one, never data.
const placeholder = (s) => /^\{\{.*\}\}$/.test(s);

/// The payload, from argv or stdin, base64 and optionally gzipped.
function payload(raw, { gzipped = true } = {}) {
  let s = String(raw ?? '').trim();
  if (!s || placeholder(s)) {
    try {
      s = fs.readFileSync(0, 'utf8').trim();
    } catch {
      s = '';
    }
  }
  if (!s) die('no payload');
  let buf;
  try {
    buf = Buffer.from(s, 'base64');
  } catch {
    die('payload is not base64');
  }
  if (gzipped) {
    // A phone gzips because a year of samples over a shell argument is bytes
    // the user waits for. Plain JSON is still accepted: the first two bytes say
    // which arrived, so neither side has to be told.
    if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
  }
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch (e) {
    die(`payload is not JSON: ${String(e.message || e).slice(0, 120)}`);
  }
}

const readJson = (file, fallback) => {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return raw.trim() ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

/// A whole file, through a temp sibling.
///
/// `>` truncates the live file before a byte of the new one lands, and this
/// machine can sleep, lose power, or be killed inside that window. A truncated
/// register is not a smaller one — it is an unreadable one, and the phone reads
/// it as "the Mac has nothing" on the next sync.
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, file);
};

const appendLines = (file, lines) => {
  if (!lines.length) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${lines.map((r) => JSON.stringify(r)).join('\n')}\n`);
};

// One mutation at a time: a phone draining its backlog beside a page button
// must not interleave a read-modify-write. mkdir is the portable atomic lock.
const LOCK = path.join(DATA, '.ingest-lock');
function lock() {
  fs.mkdirSync(DATA, { recursive: true });
  const deadline = Date.now() + 10000;
  for (;;) {
    try {
      fs.mkdirSync(LOCK);
      return;
    } catch {
      if (Date.now() > deadline) {
        // A crashed run leaves the dir behind; past the deadline, claim it.
        try {
          fs.rmdirSync(LOCK);
        } catch {
          /* raced */
        }
        continue;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
}
const unlock = () => {
  try {
    fs.rmdirSync(LOCK);
  } catch {
    /* already gone */
  }
};

/// This mirror's identity, minted once.
///
/// A phone remembers how far it has sent against this id. If the mirror is
/// deleted and made again the id changes, the phone sees a stranger and sends
/// its history from the start — which is the only way a wiped Mac ever fills
/// back up.
function state() {
  const s = readJson(STATE, {});
  s.version ||= 1;
  s.ledger ||= {};
  s.devices ||= {};
  if (!s.mirror_id) {
    // Minted once and written before it is spoken. A read verb that returned
    // a fresh id without keeping it would hand every caller a different
    // identity, and a phone comparing them would reset its positions and
    // re-send its whole history on every single sync.
    s.mirror_id = crypto.randomUUID();
    saveState(s);
  }
  return s;
}

const saveState = (s) => {
  s.written_at = new Date().toISOString();
  writeJson(STATE, s);
};

const sampleFile = (type, month) => path.join(SAMPLES, type, `${month}.jsonl`);

const pad = (n, w = 2) => String(n).padStart(w, '0');

/// The local calendar day, in the same shape the phone writes.
const dayKey = (d) => `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/// The Monday of the week [d] falls in — a plan is named by its first day.
const weekKey = (d) => {
  const m = new Date(d);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return dayKey(m);
};

/// The uuids already filed in the months a batch touches.
///
/// Only those months are opened: a batch of last night's sleep must not read
/// five years of step counts to know it is new.
function seenIn(rows) {
  const months = new Set();
  for (const r of rows) {
    if (typeof r.type !== 'string' || !r.type) continue;
    months.add(`${r.type}/${monthOf(r.del ? r.at : r.start)}`);
  }
  const seen = new Set();
  for (const key of months) {
    const i = key.lastIndexOf('/');
    const type = key.slice(0, i);
    const month = key.slice(i + 1);
    let text = '';
    try {
      text = fs.readFileSync(sampleFile(type, month), 'utf8');
    } catch {
      continue;
    }
    for (const r of parseLines(text)) {
      if (r.del) seen.add(`${type}:del:${r.del}`);
      else if (r.uuid) seen.add(`${type}:${r.uuid}`);
    }
  }
  return seen;
}

// ── registers ────────────────────────────────────────────────────────────────

// What a register may be called. The phone names these, so the name is checked
// rather than trusted: a mirror is a folder on the user's Mac, and a name is
// not a path.
const REGISTER = /^[a-z][a-z_]*(\/[0-9A-Za-z_-]+)?\.(json|jsonl)$/;

const registerPath = (name) => {
  if (typeof name !== 'string' || !REGISTER.test(name) || name.includes('..')) {
    die(`not a register name: ${String(name).slice(0, 60)}`);
  }
  return path.join(DATA, name);
};

/// Read the registers asked for, skipping the ones this Mac does not hold.
function pull(names) {
  const out = {};
  for (const name of names) {
    const file = registerPath(name);
    if (name.endsWith('.jsonl')) {
      let text = '';
      try {
        text = fs.readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      out[name] = parseLines(text);
      continue;
    }
    const v = readJson(file, null);
    if (v) out[name] = v;
  }
  return out;
}

/// The newest day-stamped register in [dir], as a name `pull` will take.
///
/// A Mac's advantage over a phone is reach: it keeps what the phone has
/// already moved on from. Asking only for today's file would hide last
/// night's examination all of today, and answer "not examined yet" with a
/// verdict sitting on the disk beside it.
function newestDayed(dir) {
  let names;
  try {
    names = fs.readdirSync(path.join(DATA, dir));
  } catch {
    return null;
  }
  const days = names.filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort();
  return days.length ? `${dir}/${days[days.length - 1]}` : null;
}

/// Write the registers the phone's copy won, and say which were refused.
///
/// A register is only replaced when the incoming `written_at` is newer than
/// what is here — the same comparison the phone makes, so a race resolves the
/// same way on both sides and neither has to ask.
function push(registers) {
  const wrote = [];
  const kept = [];
  for (const [name, value] of Object.entries(registers || {})) {
    const file = registerPath(name);
    if (name.endsWith('.jsonl')) {
      const mine = parseLines(readFileOr(file, ''));
      const merged = mergeNotes(mine, Array.isArray(value) ? value : []);
      if (merged.length !== mine.length) {
        writeLines(file, merged);
        wrote.push(name);
      } else {
        kept.push(name);
      }
      continue;
    }
    const current = readJson(file, null);
    if (wins(value, current)) {
      writeJson(file, value);
      wrote.push(name);
    } else {
      kept.push(name);
    }
  }
  return { wrote, kept };
}

const readFileOr = (file, fallback) => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return fallback;
  }
};

const writeLines = (file, rows) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, rows.length ? `${rows.map((r) => JSON.stringify(r)).join('\n')}\n` : '');
  fs.renameSync(tmp, file);
};

// ── verbs ────────────────────────────────────────────────────────────────────

const VERBS = {
  /// File a batch of rows. Replayed batches are free: dedup is by uuid.
  samples(rest) {
    const body = payload(rest[0]);
    const rows = Array.isArray(body.rows) ? body.rows : die('no rows');
    const s = state();
    if (body.mirror_id && body.mirror_id !== s.mirror_id) {
      // The phone is talking to a mirror that no longer exists. Say so rather
      // than file the batch: it is sending from a position this store never
      // reached, and the gap before it would never be asked for again.
      return {
        ok: false,
        error: 'this mirror was made again — start from the beginning',
        mirror_id: s.mirror_id,
      };
    }
    const seen = seenIn(rows);
    const { files, counts } = planWrite(rows, seen);
    for (const [key, batch] of files) {
      const i = key.lastIndexOf('/');
      const type = key.slice(0, i);
      appendLines(sampleFile(type, key.slice(i + 1)), batch);
      s.ledger[type] = fold(s.ledger[type], batch);
    }
    const device = typeof body.device === 'string' ? body.device : 'unknown';
    s.devices[device] = {
      at: new Date().toISOString(),
      rows: (s.devices[device]?.rows || 0) + counts.added,
      ...(body.cursor ? { cursor: body.cursor } : {}),
    };
    saveState(s);
    return { ok: true, mirror_id: s.mirror_id, ...counts, held: summarize(s.ledger) };
  },

  /// Hand back the registers a phone asked for, and this mirror's identity.
  pull(rest) {
    const body = payload(rest[0], { gzipped: false });
    const names = Array.isArray(body.names) ? body.names : [];
    const s = state();
    return {
      ok: true,
      mirror_id: s.mirror_id,
      registers: pull(names),
      held: summarize(s.ledger),
      cursor: s.devices?.[body.device]?.cursor ?? null,
    };
  },

  /// Take the registers the phone's copy won.
  push(rest) {
    const body = payload(rest[0]);
    const s = state();
    if (body.mirror_id && body.mirror_id !== s.mirror_id) {
      return { ok: false, error: 'this mirror was made again', mirror_id: s.mirror_id };
    }
    const { wrote, kept } = push(body.registers);
    if (body.device && body.cursor) {
      s.devices[body.device] = { ...(s.devices[body.device] || {}), cursor: body.cursor };
      saveState(s);
    }
    return { ok: true, mirror_id: s.mirror_id, wrote, kept };
  },

  /// Everything the agent needs to answer without guessing: who the user is,
  /// what today asks of them, and what this mirror actually holds.
  ///
  /// A key is absent rather than empty when the mirror has not been given that
  /// file — no phone paired, or the pass that writes it has not run. Absent is
  /// the honest answer and the agent is told to read it as one.
  report() {
    const s = state();
    const now = new Date();
    const day = dayKey(now);
    const week = weekKey(now);
    const names = [
      'profile.json',
      'targets.json',
      'layout.json',
      'patterns.json',
      `plans/${week}.json`,
      `checklist/${day}.json`,
      `briefs/${day}.json`,
    ];
    // The night's examination: a verdict per type against that type's own
    // baseline. The NEWEST one this Mac holds, not today's — it carries its own
    // date and the reader is told to check it. Null until the phone has run
    // one, which is read as "no pass yet", never as "nothing was wrong".
    const review = newestDayed('review');
    if (review) names.push(review);
    const registers = pull(names);

    // The other half of the join, and the only half this Mac produces itself:
    // when the day started, when it stopped, and what was still going on at
    // 23:40. Today is rebuilt if it has gone stale — the day moves while it is
    // being lived — and yesterday is read as written, because a night the user
    // is being asked about is a night that has finished.
    const yesterday = dayKey(new Date(now.getTime() - 86400000));
    let life = null;
    try {
      life = { today: refreshLife(day), yesterday: readLife(yesterday) };
    } catch {
      life = null; // a work signal that cannot be read is absent, never zero
    }
    const paired = Object.keys(s.devices || {}).length > 0;
    return {
      ok: true,
      mirror_id: s.mirror_id,
      today: day,
      week,
      phone_paired: paired,
      // HealthKit lives on an iPhone. Without one this Mac has no body data at
      // all, and every card that would need some must stay off the page.
      healthkit: paired ? 'mirrored from your iPhone' : 'not connected — no iPhone paired',
      held: summarize(s.ledger),
      profile: registers['profile.json'] ?? null,
      targets: registers['targets.json'] ?? null,
      layout: registers['layout.json'] ?? null,
      patterns: registers['patterns.json'] ?? null,
      plan: registers[`plans/${week}.json`] ?? null,
      checklist: registers[`checklist/${day}.json`] ?? null,
      brief: registers[`briefs/${day}.json`] ?? null,
      review: (review ? registers[review] : null) ?? null,
      // Absent where this Mac has nothing to say about the working day —
      // never an empty day, which would read as a day off.
      work: life,
    };
  },

  /// Keep one line the user said. It reaches their phone on the next sync,
  /// where the checklist may recognise it.
  ///
  /// Notes are a union on both sides, so the same line said twice in the same
  /// second is one note and a line said on each device is two.
  log(rest) {
    let text = String(rest[0] ?? '').trim();
    if (!text || placeholder(text)) {
      try {
        text = fs.readFileSync(0, 'utf8').trim();
      } catch {
        text = '';
      }
    }
    if (!text) die('nothing to log');
    const file = path.join(DATA, 'notes.jsonl');
    const note = { at: new Date().toISOString(), text, by_device: 'mac' };
    const merged = mergeNotes(parseLines(readFileOr(file, '')), [note]);
    writeLines(file, merged);
    return { ok: true, logged: text, notes: merged.length };
  },

  /// What the mirror holds. Backs the page's ledger.
  ledger() {
    const s = state();
    return {
      ok: true,
      mirror_id: s.mirror_id,
      held: summarize(s.ledger),
      types: s.ledger,
      devices: s.devices,
    };
  },
};

const [verb, ...rest] = process.argv.slice(2);
try {
  const run = VERBS[verb];
  if (!run) die(`unknown verb “${verb || ''}” — one of: ${Object.keys(VERBS).join(', ')}`);
  lock();
  let result;
  try {
    result = run(rest);
  } finally {
    unlock();
  }
  console.log(JSON.stringify(result));
} catch (e) {
  const msg = String(e?.message || e);
  console.log(JSON.stringify({ ok: false, error: msg }));
  console.error(msg); // /api/bash callers surface stderr on a non-zero exit
  process.exitCode = 1;
}
