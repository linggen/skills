// tools/playbot/review-server.mjs — 试玩台, the play bot's review page: every report and gate run the bot left, the
// shots by size and fight with their flags, and the 「待你看」 queue — the unsure items Claude left for Hanli, each
// answered 行 / 不行 with a line. Plain HTML/JS under review-ui/, no build step, no dependencies.
//
//   node tools/playbot/review-server.mjs [--port=7531] [--host=127.0.0.1]
//        [--reports=<dir>,…]     folders whose children are report folders (default: lingjing/report)
//        [--gate-runs=<dir>,…]   folders of gate runs, each holding playbot-* (default: ~/.cache/linggen-gate/runs)
//        [--rulings=<file>]      Hanli's answers, append-only (default: tools/playbot/rulings.jsonl)
//   Usually `tools/playbot/run.sh --ui [--host 0.0.0.0]`. 127.0.0.1 unless --host says otherwise (the phone over the LAN).
//
// It writes exactly two files: a known run's review.json (only `notes[].hanli`) and rulings.jsonl. A run is named by
// an id this server made from its own scan, a shot by a name in that run's own shots/ listing — no path from the page
// ever reaches the disk. The verdicts come from verdict.mjs, the same as the gate's.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { derive, noteState } from './verdict.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const flag = (k, d = null) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d;
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const isDir = (d) => { try { return fs.statSync(d).isDirectory(); } catch { return false; } };
const isFile = (f) => { try { return fs.statSync(f).isFile(); } catch { return false; } };
const kids = (d) => { try { return fs.readdirSync(d, { withFileTypes: true }); } catch { return []; } };

/** A PNG's width and height from its header (no decode). */
function pngSize(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const b = Buffer.alloc(24);
    fs.readSync(fd, b, 0, 24, 0);
    fs.closeSync(fd);
    return b.toString('ascii', 12, 16) === 'IHDR' ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null;
  } catch { return null; }
}

/** The shots of a report, in order, with where they were taken: shots.json, else checklist.md, else shots/. */
export function shotsOf(dir) {
  const onDisk = new Set(kids(path.join(dir, 'shots')).filter((e) => e.isFile() && /\.png$/i.test(e.name)).map((e) => `shots/${e.name}`));
  let list = readJson(path.join(dir, 'shots.json'))?.shots ?? null;
  if (!list) {
    let md = '';
    try { md = fs.readFileSync(path.join(dir, 'checklist.md'), 'utf8'); } catch { /* none */ }
    const lines = md.split('\n');
    list = [];
    for (let i = 0; i < lines.length; i++) {
      const m = /^### (shots\/\S+\.png)\s*$/.exec(lines[i]);
      if (!m) continue;
      const meta = (lines[i + 1] ?? '').replace(/ — flagged:.*$/, '');
      const cut = meta.lastIndexOf(' · ');
      const where = cut > 0 ? meta.slice(0, cut) : meta, tag = cut > 0 ? meta.slice(cut + 3) : '';
      list.push({ file: m[1], size: where.split(' · ')[0] || '', where, tag });
    }
    if (!list.length) list = [...onDisk].sort().map((file) => ({ file, size: (/(\d+x\d+)/.exec(file) ?? [])[1] ?? '', where: '', tag: '' }));
  }
  const seen = new Set();
  return list.filter((s) => onDisk.has(s.file) && !seen.has(s.file) && seen.add(s.file)).map((s) => ({ ...s, px: pngSize(path.join(dir, s.file)) }));
}

/** The seeded bugs' matcher, as run.sh has it: a field "/…/" is a regex, anything else must be equal. */
export function matches(finding, want) {
  return Object.entries(want).every(([k, v]) => (typeof v === 'string' && v.startsWith('/') ? new RegExp(v.slice(1, -1)).test(String(finding[k] ?? '')) : finding[k] === v));
}

export function makeReviewServer({ reports, gateRuns, rulings, seeded = path.join(HERE, 'seeded-bugs.json'), log = () => {} }) {
  const UI = path.join(HERE, 'review-ui');
  let cache = null, cachedAt = 0;

  /** id → run: {id, kind: play|gate|selftest|part, dir, name, expectedId, ref}. Rescanned every few seconds. */
  function scan() {
    if (cache && Date.now() - cachedAt < 4000) return cache;
    const runs = new Map();
    for (const root of reports) {
      for (const e of kids(root)) {
        if (!e.isDirectory()) continue;
        const dir = path.join(root, e.name);
        const parts = kids(dir).filter((k) => k.isDirectory() && k.name.startsWith('selftest-') && isFile(path.join(dir, k.name, 'findings.json')));
        if (parts.length) {
          runs.set(`s:${e.name}`, { id: `s:${e.name}`, kind: 'selftest', dir, name: e.name, parts: parts.map((p) => p.name) });
          for (const p of parts) {
            const pd = path.join(dir, p.name);
            runs.set(`s:${e.name}/${p.name}`, { id: `s:${e.name}/${p.name}`, kind: 'part', dir: pd, name: `${e.name}/${p.name}`, expectedId: readJson(path.join(pd, 'findings.json'))?.run_id ?? null });
          }
        } else if (isFile(path.join(dir, 'findings.json'))) {
          runs.set(`r:${e.name}`, { id: `r:${e.name}`, kind: 'play', dir, name: e.name, expectedId: readJson(path.join(dir, 'findings.json'))?.run_id ?? null });
        }
      }
    }
    for (const root of gateRuns) {
      for (const g of kids(root)) {
        if (!g.isDirectory()) continue;
        const run = path.join(root, g.name);
        const bots = kids(run).filter((k) => k.isDirectory() && k.name.startsWith('playbot-') && isFile(path.join(run, k.name, 'findings.json')));
        if (!bots.length) continue;
        let tsv = '', results = '';
        try { tsv = fs.readFileSync(path.join(run, 'reviews.tsv'), 'utf8'); } catch { /* none */ }
        try { results = fs.readFileSync(path.join(run, 'results.tsv'), 'utf8'); } catch { /* none */ }
        for (const b of bots) {
          const label = b.name.slice('playbot-'.length), dir = path.join(run, b.name);
          const row = tsv.split('\n').map((l) => l.split('\t')).find((c) => c[0] === label || c[1] === dir);
          const ref = (results.split('\n').find((l) => l.includes(`host: play bot (${label})`)) ?? '').match(/skills ([0-9a-f]{7,40})/)?.[1] ?? null;
          runs.set(`g:${g.name}/${label}`, { id: `g:${g.name}/${label}`, kind: 'gate', dir, name: `${g.name} · ${label}`, gateRun: run, expectedId: row?.[2] ?? `gate-${g.name}-${label}`, ref });
        }
      }
    }
    cache = runs; cachedAt = Date.now();
    return runs;
  }

  function summary(r) {
    const findings = readJson(path.join(r.dir, 'findings.json'));
    const review = readJson(path.join(r.dir, 'review.json'));
    const played = readJson(path.join(r.dir, 'played.json'));
    const d = derive({ review, findings, expectedId: r.expectedId });
    const at = findings?.at ?? null;
    return {
      id: r.id, kind: r.kind, name: r.name, run_id: r.expectedId, ref: r.ref ?? null, at,
      verdict: d.verdict, why: d.why, waiting: d.waiting.length, unsure: d.counts.unsure, hanli: d.counts.answered_by_hanli,
      fails: d.fails.length, hard: d.hard, warn: (findings?.findings ?? []).filter((f) => !f.hard).length,
      played: played?.played?.length ?? null, unplayable: played?.unplayable?.length ?? null,
      reviewer: review?.reviewer ?? null, shots_total: review?.shots_total ?? null, shots_answered: review?.shots_answered ?? null,
      review_run_id: review?.run_id ?? null, legacy: d.legacy,
    };
  }

  const flagsOf = (findings, shot) => (findings?.findings ?? []).filter((f) => f.shot === shot);
  const rulingsAll = () => {
    try { return fs.readFileSync(rulings, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; }
  };

  function queue(runs) {
    const past = rulingsAll();
    const items = [];
    for (const r of runs.values()) {
      if (r.kind !== 'play' && r.kind !== 'gate') continue;
      const review = readJson(path.join(r.dir, 'review.json'));
      const findings = readJson(path.join(r.dir, 'findings.json'));
      const d = derive({ review, findings, expectedId: r.expectedId });
      if (!d.waiting.length) continue;
      const shots = shotsOf(r.dir);
      for (const w of d.waiting) {
        const s = shots.find((x) => x.file === w.shot);
        if (!s) continue;
        const note = review.notes.find((n) => n.shot === w.shot);
        items.push({ run: r.id, run_name: r.name, at: findings?.at ?? null, shot: s, idx: shots.indexOf(s), ask: w.ask, box: w.box, answer: note?.answer ?? null,
          flags: flagsOf(findings, w.shot), before: past.filter((p) => p.ask && p.ask === w.ask).slice(-3) });
      }
    }
    return items.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }

  function runDetail(r) {
    const findings = readJson(path.join(r.dir, 'findings.json'));
    const review = readJson(path.join(r.dir, 'review.json'));
    const shots = shotsOf(r.dir);
    const notes = new Map((review?.notes ?? []).filter((n) => n?.shot).map((n) => [n.shot, n]));
    return {
      summary: summary(r),
      review_summary: review?.summary ?? null,
      shots: shots.map((s) => { const n = notes.get(s.file) ?? null; return { ...s, note: n, state: n ? noteState(n) : null, flags: flagsOf(findings, s.file) }; }),
      loose: (findings?.findings ?? []).filter((f) => !f.shot || !shots.some((s) => s.file === f.shot)),
      played: readJson(path.join(r.dir, 'played.json')),
      refusals: readJson(path.join(r.dir, 'refusals.json')),
    };
  }

  function selftest(r) {
    const bugs = readJson(seeded)?.bugs ?? [];
    const rows = bugs.map((b) => {
      const part = `selftest-${b.id}`;
      if (!r.parts.includes(part)) return { id: b.id, ref: b.ref, patch: b.patch ?? null, expect: b.expect, absent: !!b.absent, note: b.note ?? '', status: 'not-run' };
      const f = readJson(path.join(r.dir, part, 'findings.json'))?.findings ?? [];
      const hit = f.find((x) => matches(x, b.expect));
      const status = b.absent ? (hit ? 'false' : 'clean') : (hit ? 'caught' : 'missed');
      const shots = shotsOf(path.join(r.dir, part));
      return { id: b.id, ref: b.ref, patch: b.patch ?? null, expect: b.expect, absent: !!b.absent, note: b.note ?? '', status, part: `${r.id}/${part}`,
        shot: hit?.shot ?? null, idx: hit?.shot ? shots.findIndex((s) => s.file === hit.shot) : -1, finding: hit ?? null };
    });
    return { id: r.id, name: r.name, rows };
  }

  /** Hanli's answer into the run's review.json (re-read just before, only notes[].hanli touched) and rulings.jsonl. */
  function answer(r, shotName, ok, said) {
    const shots = shotsOf(r.dir);
    const shot = shots.find((s) => s.file === shotName);
    if (!shot) return { status: 404, body: { error: 'no such shot in this run' } };
    const file = path.join(r.dir, 'review.json');
    const review = readJson(file);
    if (!review || typeof review !== 'object') return { status: 409, body: { error: 'this run has no review.json' } };
    review.notes = Array.isArray(review.notes) ? review.notes : [];
    let note = review.notes.find((n) => n?.shot === shotName);
    if (!note) { note = { shot: shotName }; review.notes.push(note); }
    const at = new Date().toISOString();
    note.hanli = { ok, ...(said ? { said } : {}), at };
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(review, null, 1)}\n`);
    fs.renameSync(tmp, file);
    const findings = readJson(path.join(r.dir, 'findings.json'));
    const line = {
      at, run: r.id, run_id: review.run_id ?? null, shot: shotName, ask: note.ask ?? null, box: note.box ?? null,
      ok, said: said || null, size: shot.size, fight: shot.where, tag: shot.tag,
      flags: flagsOf(findings, shotName).map((f) => `${f.kind}${f.why ? `/${f.why}` : ''}`),
      claude: { certainty: note.certainty ?? 'sure', fail: note.fail === true, answer: note.answer ?? null },
    };
    fs.appendFileSync(rulings, `${JSON.stringify(line)}\n`);
    log(`answer ${r.id} ${shotName} ${ok ? '行' : '不行'}`);
    cache = null;
    return { status: 200, body: { ok: true, hanli: note.hanli, verdict: derive({ review, findings, expectedId: r.expectedId }).verdict } };
  }

  const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
  const send = (res, file) => {
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'content-length': st.size, 'cache-control': 'no-cache' });
      fs.createReadStream(file).pipe(res);
    });
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    try {
      if (req.method === 'GET' && (p === '/' || p === '/index.html')) return send(res, path.join(UI, 'index.html'));
      if (req.method === 'GET' && (p === '/app.js' || p === '/style.css')) return send(res, path.join(UI, p.slice(1)));
      const runs = scan();
      const run = (id) => runs.get(String(id ?? '')) ?? null;
      if (req.method === 'GET' && p === '/api/home') {
        const list = [...runs.values()].filter((r) => r.kind !== 'part');
        const sums = list.map((r) => (r.kind === 'selftest' ? { id: r.id, kind: 'selftest', name: r.name, at: readJson(path.join(r.dir, r.parts[0], 'findings.json'))?.at ?? null, ...(() => { const t = selftest(r); return { caught: t.rows.filter((x) => x.status === 'caught' || x.status === 'clean').length, ran: t.rows.filter((x) => x.status !== 'not-run').length, total: t.rows.length, verdict: t.rows.some((x) => x.status === 'missed' || x.status === 'false') ? 'fail' : 'pass' }; })() } : summary(r)));
        sums.sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')));
        return json(res, 200, { runs: sums, queue: queue(runs), rulings: rulingsAll().length });
      }
      if (req.method === 'GET' && p === '/api/run') {
        const r = run(url.searchParams.get('id'));
        if (!r || r.kind === 'selftest') return json(res, 404, { error: 'no such run' });
        return json(res, 200, runDetail(r));
      }
      if (req.method === 'GET' && p === '/api/selftest') {
        const all = [...runs.values()].filter((r) => r.kind === 'selftest');
        const r = url.searchParams.get('id') ? run(url.searchParams.get('id')) : all.sort((a, b) => String(readJson(path.join(b.dir, b.parts[0], 'findings.json'))?.at ?? '').localeCompare(String(readJson(path.join(a.dir, a.parts[0], 'findings.json'))?.at ?? '')))[0];
        if (!r || r.kind !== 'selftest') return json(res, 404, { error: 'no selftest' });
        return json(res, 200, selftest(r));
      }
      if (req.method === 'GET' && p === '/shot') {
        const r = run(url.searchParams.get('id'));
        const f = url.searchParams.get('f') ?? '';
        if (!r || r.kind === 'selftest' || !shotsOf(r.dir).some((s) => s.file === f)) { res.writeHead(404); return res.end(); }
        return send(res, path.join(r.dir, f));
      }
      if (req.method === 'POST' && p === '/api/answer') {
        const origin = req.headers.origin;
        if (origin && new URL(origin).host !== req.headers.host) return json(res, 403, { error: 'another origin' });
        let body = '';
        for await (const c of req) { body += c; if (body.length > 8192) return json(res, 413, { error: 'too big' }); }
        let q;
        try { q = JSON.parse(body); } catch { return json(res, 400, { error: 'bad json' }); }
        const r = run(q.run);
        if (!r || (r.kind !== 'play' && r.kind !== 'gate')) return json(res, 404, { error: 'no such run' });
        if (typeof q.ok !== 'boolean') return json(res, 400, { error: 'ok must be true or false' });
        const said = typeof q.said === 'string' ? q.said.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 200) : '';
        const out = answer(r, String(q.shot ?? ''), q.ok, said);
        return json(res, out.status, out.body);
      }
      res.writeHead(404); res.end();
    } catch (e) {
      log(`error ${p}: ${e.stack ?? e}`);
      json(res, 500, { error: String(e.message ?? e) });
    }
  });
  return { server, scan };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const list = (v) => v.split(',').map((s) => path.resolve(s.replace(/^~(?=\/|$)/, os.homedir()))).filter(Boolean);
  const reports = list(flag('reports', path.resolve(HERE, '../../report')));
  const gateRuns = list(flag('gate-runs', path.join(os.homedir(), '.cache/linggen-gate/runs')));
  const rulings = path.resolve(flag('rulings', path.join(HERE, 'rulings.jsonl')));
  const host = flag('host', '127.0.0.1'), port = Number(flag('port', '7531'));
  const { server } = makeReviewServer({ reports, gateRuns, rulings, log: (l) => console.error(`[试玩台] ${l}`) });
  server.listen(port, host, () => {
    const a = server.address();
    console.log(`试玩台 http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${a.port}/`);
    if (host !== '127.0.0.1' && host !== 'localhost') {
      for (const ifs of Object.values(os.networkInterfaces())) for (const i of ifs ?? []) if (i.family === 'IPv4' && !i.internal) console.log(`  LAN  http://${i.address}:${a.port}/`);
    }
    console.log(`  reports ${reports.join(', ')} · gate runs ${gateRuns.join(', ')} · rulings ${rulings}`);
  });
}
