// The phone's doors to CFO's ledger (SKILL.md PhoneSnapshot … PhoneConfig),
// rendered the way the engine renders a declared tool — `$SKILL_DIR` swapped
// in, every argument one single-quoted shell word — and run with `sh -c`
// against a temporary install with invented data.
//
// The doors are a MOVE of the shell text the phone used to send over
// `/api/bash`. That text is kept below, verbatim as the phone built it, so the
// snapshot and the commit are checked against what it did on the same folder:
// same bytes out, same files written, the same compare-and-swap.
//
//   node --test tests/phone-door.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skill = fs.readFileSync(path.join(root, 'SKILL.md'), 'utf8');
const quote = s => `'${String(s).replaceAll("'", "'\\''")}'`;

const TIERS = {
  PhoneSnapshot: 'read',
  PhoneAlerts: 'edit',
  PhoneStage: 'edit',
  PhoneCommit: 'edit',
  PhoneCommitStaged: 'edit',
  PhoneReport: 'read',
  PhoneConfig: 'read',
};

function door(name) {
  const block = skill.match(new RegExp(`\\n  - name: ${name}\\n([\\s\\S]*?)(?=\\n  - name:|\\n---)`))?.[1];
  assert.ok(block, `${name} must be declared`);
  const cmd = block.match(/\n    cmd: "([^"]+)"/)?.[1];
  assert.ok(cmd, `${name} has a cmd`);
  const args = {};
  const argBlock = block.match(/\n    args:\n([\s\S]*)$/)?.[1] ?? '';
  for (const m of argBlock.matchAll(/^ {6}(\w+):\n((?: {8}.*\n?)*)/gm)) {
    args[m[1]] = m[2].match(/type: (\w+)/)?.[1] ?? 'string';
  }
  return { block, cmd, args };
}

/** The command the engine runs for `name` called with `args`. */
function render(name, args, skillDir) {
  const { cmd, args: declared } = door(name);
  for (const key of Object.keys(args)) assert.ok(declared[key], `${name} declares no argument \`${key}\``);
  return cmd.replaceAll('$SKILL_DIR', skillDir).replace(/\{\{(\w+)\}\}/g, (whole, key) => {
    if (!declared[key]) return whole; // a placeholder nothing declares stays literal
    const v = args[key];
    if (declared[key] === 'argv') return (v ?? []).map(quote).join(' ');
    return quote(v ?? '');
  });
}

function sh(cmd, home) {
  // HOME is the temp folder and SKILL_DIR is unset — as the page door runs
  // it — so nothing here can reach a real install.
  const env = { PATH: process.env.PATH, HOME: home, LANG: 'en_US.UTF-8' };
  const res = spawnSync('sh', ['-c', cmd], { env, encoding: 'utf8' });
  return res;
}

/** A temp HOME with CFO installed at its usual place and invented data. */
function install() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cfo-door-'));
  const dir = path.join(home, '.linggen/skills/cfo');
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  for (const f of ['phone-sync.sh', 'market.pl']) {
    if (fs.existsSync(path.join(root, 'scripts', f))) fs.copyFileSync(path.join(root, 'scripts', f), path.join(dir, 'scripts', f));
  }
  const data = path.join(dir, 'data');
  fs.mkdirSync(path.join(data, 'ledger'), { recursive: true });
  const rows = [
    { id: 'm1', account: 'a', date: '2026-06-03', merchant: "麦当劳 'Mc' \"Donald's\"\nline two", amount: -17.99, category: null },
    { id: 'm2', account: 'a', date: '2026-06-04', merchant: 'NETFLIX.COM', amount: -15.49, category: 'subscriptions' },
  ];
  fs.writeFileSync(path.join(data, 'ledger/2026.jsonl'), rows.map(r => JSON.stringify(r)).join('\n') + '\n');
  fs.writeFileSync(path.join(data, 'ledger/2025.jsonl'), JSON.stringify({ id: 'm0', account: 'a', date: '2025-12-30', merchant: 'Café «é»', amount: 1200 }) + '\n');
  fs.writeFileSync(path.join(data, 'edits.json'), JSON.stringify({ device: 'mac-1', lastTs: 9000, reg: { 'bud:餐饮': { v: 200, ts: 9000, d: 'mac-1' } } }, null, 2) + '\n');
  fs.writeFileSync(path.join(data, 'imports.json'), JSON.stringify([{ id: 'imp1', file: "六月 'june'.csv", added: 2 }], null, 2));
  fs.writeFileSync(path.join(data, 'anomalies-dismissed.json'), '["anom-1"]\n');
  fs.writeFileSync(path.join(data, 'report.json'), JSON.stringify({ totals: { spend: 33.48 }, note: '支出 "quoted"\n' }));
  fs.writeFileSync(path.join(data, 'reports.json'), '{"symbols": {}}');
  fs.writeFileSync(path.join(data, 'watch.json'), '{"briefs": {}}');
  fs.writeFileSync(path.join(dir, 'config.json'), '{"currency":"CAD"}\n');
  return { home, dir, data };
}

/** Every file under `dir`, path → bytes (base64), for before/after compares. */
function tree(dir) {
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[path.relative(dir, p)] = fs.readFileSync(p).toString('base64');
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}

// ── What the phone sent before the doors (cfo_sync.dart, verbatim) ──────────

const CKSUM = `printf '%s|%s' "$(cksum "$D/edits.json" 2>/dev/null | awk '{print $1"_"$2}')" "$(cksum "$D/imports.json" 2>/dev/null | awk '{print $1"_"$2}')"`;

const OLD_READ = `D="$HOME/.linggen/skills/cfo/data"
printf '\\n%s\\n' '__CFO_CK__'
${CKSUM}
printf '\\n%s\\n' '__CFO_EDITS__'
cat "$D/edits.json" 2>/dev/null
printf '\\n%s\\n' '__CFO_CFG__'
cat "$HOME/.linggen/skills/cfo/config.json" 2>/dev/null
printf '\\n%s\\n' '__CFO_DISMISSED__'
cat "$D/anomalies-dismissed.json" 2>/dev/null
printf '\\n%s\\n' '__CFO_REPORT__'
cat "$D/report.json" 2>/dev/null
printf '\\n%s\\n' '__CFO_IMPORTS__'
cat "$D/imports.json" 2>/dev/null
printf '\\n%s\\n' '__CFO_LEDGER__'
cat "$D"/ledger/*.jsonl 2>/dev/null
printf '\\n%s\\n' '__CFO_COMPANY_REPORTS__'
cat "$D/reports.json" 2>/dev/null
printf '\\n%s\\n' '__CFO_WATCH__'
perl "$HOME/.linggen/skills/cfo/scripts/market.pl" watch-alerts >/dev/null 2>&1
cat "$D/watch.json" 2>/dev/null
printf '\\n%s\\n' '__CFO_END__'`;

const blob = (name, text, target, append = false) => ({ name, b64: Buffer.from(text).toString('base64'), target, append });

function oldCommit(blobs, cksum) {
  const lines = ['D="$HOME/.linggen/skills/cfo/data"', 'mkdir -p "$D/ledger"', `CUR=$(${CKSUM})`,
    `if [ "$CUR" != ${quote(cksum)} ]; then`, "  printf '%s\\n' '__CFO_CONFLICT__'", 'else'];
  for (const b of blobs) {
    const src = `printf '%s' '${b.b64}' | base64 --decode`;
    lines.push(b.append ? `  ${src} >> "$D/${b.target}"` : `  ${src} > "$D/${b.target}.tmp" && mv -f "$D/${b.target}.tmp" "$D/${b.target}"`);
  }
  lines.push("  printf '%s\\n' '__CFO_OK__'", 'fi', 'rm -rf "$D/.sync-stage"');
  return lines.join('\n');
}

/** What one sync writes, in the order the phone writes it: rows first. */
function blobs() {
  const rows2026 = [{ id: 'p1', account: 'b', date: '2026-07-01', merchant: "寿司 'Sushi' \"Bar\"\n2nd line", amount: -42.5 }];
  return [
    blob('ledger-2026', rows2026.map(r => JSON.stringify(r)).join('\n') + '\n', 'ledger/2026.jsonl', true),
    blob('ledger-undated', JSON.stringify({ id: 'p2', account: 'b', date: '', merchant: '无日期', amount: 1 }) + '\n', 'ledger/undated.jsonl', true),
    blob('edits', JSON.stringify({ device: 'mac-1', lastTs: 9100, reg: { 'bud:餐饮': { v: 250, ts: 9100, d: 'phone' }, "ov:joe's": { v: '餐饮\n"x"', ts: 9050, d: 'phone' } } }, null, 2) + '\n', 'edits.json'),
    blob('imports', JSON.stringify([{ id: 'imp1', file: "六月 'june'.csv", added: 2 }, { id: 'imp2', file: '七月.csv', added: 1 }], null, 2), 'imports.json'),
    blob('report', JSON.stringify({ totals: { spend: 75.98 }, note: '支出 "quoted"\n' }), 'report.json'),
  ];
}

const pairs = bs => bs.flatMap(b => [b.name, b.b64]);
const tokenOf = snapshot => snapshot.split('\n__CFO_CK__\n')[1].split('\n__CFO_EDITS__\n')[0];

test('every phone door is declared page_only, at the tier of what it does', () => {
  for (const [name, tier] of Object.entries(TIERS)) {
    const { block, args } = door(name);
    assert.match(block, /\n    page_only: true\n/, `${name} is the phone's own door, never the model's`);
    assert.match(block, new RegExp(`\\n    tier: ${tier}\\n`), `${name} is tier ${tier}`);
    for (const a of Object.keys(args)) assert.doesNotMatch(a, /path|file|dir/i, `${name} takes no path from its caller`);
  }
  // The sync's own calls run as long as the old ones could (two minutes), and a
  // snapshot of years of ledger is far past the default 64 KB budget.
  for (const name of ['PhoneSnapshot', 'PhoneStage', 'PhoneCommit', 'PhoneCommitStaged']) {
    assert.match(door(name).block, /\n    timeout_ms: 120000\n/, `${name} gets two minutes`);
  }
  assert.ok(+door('PhoneSnapshot').block.match(/max_output_bytes: (\d+)/)[1] >= 32 * 1024 * 1024);
  assert.ok(+door('PhoneReport').block.match(/max_output_bytes: (\d+)/)[1] >= 8 * 1024 * 1024);
});

test('the snapshot is what the old shell read printed, byte for byte', () => {
  const m = install();
  try {
    const before = sh(OLD_READ, m.home);
    const now = sh(render('PhoneSnapshot', {}, m.dir), m.home);
    assert.equal(now.status, 0, now.stderr);
    assert.equal(now.stdout, before.stdout);
    assert.match(now.stdout, /麦当劳 'Mc'/);
    // An install with no data yet reads as empty sections and a `|` token.
    fs.rmSync(m.data, { recursive: true });
    const empty = sh(render('PhoneSnapshot', {}, m.dir), m.home);
    assert.equal(empty.stdout, sh(OLD_READ, m.home).stdout);
    assert.equal(tokenOf(empty.stdout), '|');
  } finally {
    fs.rmSync(m.home, { recursive: true, force: true });
  }
});

test('the alerts door runs watch-alerts on its own, and the read never does', () => {
  const m = install();
  try {
    assert.doesNotMatch(door('PhoneSnapshot').cmd, /market\.pl|alerts/);
    assert.doesNotMatch(fs.readFileSync(path.join(root, 'scripts/phone-sync.sh'), 'utf8'), /market\.pl/);
    const res = sh(render('PhoneAlerts', {}, m.dir), m.home);
    assert.equal(res.status, 0, res.stderr);
    assert.deepEqual(JSON.parse(res.stdout), { off: true }, 'the Watch is off in a temp HOME');
  } finally {
    fs.rmSync(m.home, { recursive: true, force: true });
  }
});

test('a commit with the right token lands exactly as the old one did', () => {
  const a = install(), b = install();
  try {
    const token = tokenOf(sh(render('PhoneSnapshot', {}, a.dir), a.home).stdout);
    assert.match(token, /^\d+_\d+\|\d+_\d+$/);
    const res = sh(render('PhoneCommit', { token, blobs: pairs(blobs()) }, a.dir), a.home);
    assert.equal(res.status, 0, res.stderr);
    assert.equal(res.stdout, '__CFO_OK__\n');
    const old = sh(oldCommit(blobs(), token), b.home);
    assert.equal(old.stdout, '__CFO_OK__\n');
    assert.deepEqual(tree(a.data), tree(b.data), 'same files, same bytes');
    const ledger = fs.readFileSync(path.join(a.data, 'ledger/2026.jsonl'), 'utf8').trim().split('\n');
    assert.equal(ledger.length, 3, 'appended, never replaced');
    assert.equal(JSON.parse(ledger[2]).merchant, "寿司 'Sushi' \"Bar\"\n2nd line");
    assert.equal(JSON.parse(fs.readFileSync(path.join(a.data, 'edits.json'), 'utf8')).reg["ov:joe's"].v, '餐饮\n"x"');
    assert.equal(fs.existsSync(path.join(a.data, 'edits.json.tmp')), false);
  } finally {
    fs.rmSync(a.home, { recursive: true, force: true });
    fs.rmSync(b.home, { recursive: true, force: true });
  }
});

test('a stale token is refused and changes nothing', () => {
  const m = install();
  try {
    const token = tokenOf(sh(render('PhoneSnapshot', {}, m.dir), m.home).stdout);
    // CFO on the Mac saves between the phone's read and its write.
    fs.appendFileSync(path.join(m.data, 'edits.json'), ' ');
    const before = tree(m.data);
    const res = sh(render('PhoneCommit', { token, blobs: pairs(blobs()) }, m.dir), m.home);
    assert.equal(res.stdout, '__CFO_CONFLICT__\n');
    assert.deepEqual(tree(m.data), before);
    // An import landing on the Mac counts too: imports.json is in the token.
    const fresh = tokenOf(sh(render('PhoneSnapshot', {}, m.dir), m.home).stdout);
    fs.writeFileSync(path.join(m.data, 'imports.json'), '[]');
    const after = tree(m.data);
    assert.equal(sh(render('PhoneCommit', { token: fresh, blobs: pairs(blobs()) }, m.dir), m.home).stdout, '__CFO_CONFLICT__\n');
    assert.deepEqual(tree(m.data), after);
  } finally {
    fs.rmSync(m.home, { recursive: true, force: true });
  }
});

/** Stage `bs` in chunks of `size` base64 characters over several calls. */
function stage(m, bs, size) {
  const calls = [];
  let words = [];
  for (const b of bs) {
    for (let i = 0; i < b.b64.length; i += size) {
      words.push(b.name, b.b64.slice(i, i + size));
      if (words.length >= 4) { calls.push(words); words = []; }
    }
  }
  if (words.length) calls.push(words);
  calls.forEach((chunks, i) => {
    const res = sh(render('PhoneStage', { fresh: i === 0, chunks }, m.dir), m.home);
    assert.equal(res.status, 0, res.stderr);
  });
  return calls.length;
}

test('a staged commit equals the inline one byte for byte', () => {
  const inline = install(), staged = install();
  try {
    const token = tokenOf(sh(render('PhoneSnapshot', {}, inline.dir), inline.home).stdout);
    assert.equal(sh(render('PhoneCommit', { token, blobs: pairs(blobs()) }, inline.dir), inline.home).stdout, '__CFO_OK__\n');

    // A lost attempt left its bytes in the stage; a fresh stage clears them.
    fs.mkdirSync(path.join(staged.data, '.sync-stage'));
    fs.writeFileSync(path.join(staged.data, '.sync-stage/edits.b64'), 'bGVmdG92ZXI=');
    assert.ok(stage(staged, blobs(), 7) > 2, 'several calls');
    const names = blobs().map(b => b.name);
    const res = sh(render('PhoneCommitStaged', { token, names }, staged.dir), staged.home);
    assert.equal(res.stdout, '__CFO_OK__\n', res.stderr);
    assert.deepEqual(tree(staged.data), tree(inline.data));
    assert.equal(fs.existsSync(path.join(staged.data, '.sync-stage')), false, 'the stage is not left behind');
  } finally {
    fs.rmSync(inline.home, { recursive: true, force: true });
    fs.rmSync(staged.home, { recursive: true, force: true });
  }
});

test('a staged commit with a stale token changes nothing and clears the stage', () => {
  const m = install();
  try {
    const before = tree(m.data);
    stage(m, blobs(), 50);
    const res = sh(render('PhoneCommitStaged', { token: '1_2|3_4', names: blobs().map(b => b.name) }, m.dir), m.home);
    assert.equal(res.stdout, '__CFO_CONFLICT__\n');
    assert.deepEqual(tree(m.data), before);
  } finally {
    fs.rmSync(m.home, { recursive: true, force: true });
  }
});

test('a name that is not one of the sync\'s files is refused before anything is written', () => {
  const m = install();
  try {
    const token = tokenOf(sh(render('PhoneSnapshot', {}, m.dir), m.home).stdout);
    const before = tree(m.home);
    for (const bad of ['../../evil', 'config', 'ledger', '.sync-stage']) {
      const words = [...pairs(blobs()), bad, Buffer.from('x').toString('base64')];
      const res = sh(render('PhoneCommit', { token, blobs: words }, m.dir), m.home);
      assert.notEqual(res.status, 0, bad);
      assert.doesNotMatch(res.stdout, /__CFO_OK__/);
      assert.deepEqual(tree(m.home), before, `${bad}: nothing written`);
      assert.notEqual(sh(render('PhoneStage', { fresh: true, chunks: [bad, 'eA=='] }, m.dir), m.home).status, 0);
      assert.notEqual(sh(render('PhoneCommitStaged', { token, names: [bad] }, m.dir), m.home).status, 0);
      assert.deepEqual(tree(m.home), before);
    }
    // A blob word without its bytes is no commit either.
    assert.notEqual(sh(render('PhoneCommit', { token, blobs: ['edits'] }, m.dir), m.home).status, 0);
    assert.deepEqual(tree(m.home), before);
  } finally {
    fs.rmSync(m.home, { recursive: true, force: true });
  }
});

test('the report and config doors return those files as cat did, empty when absent', () => {
  const m = install();
  try {
    const cat = p => sh(`cat "${p}" 2>/dev/null || true`, m.home).stdout;
    assert.equal(sh(render('PhoneReport', {}, m.dir), m.home).stdout, cat(path.join(m.data, 'report.json')));
    assert.equal(sh(render('PhoneConfig', {}, m.dir), m.home).stdout, cat(path.join(m.dir, 'config.json')));
    fs.rmSync(path.join(m.data, 'report.json'));
    fs.rmSync(path.join(m.dir, 'config.json'));
    for (const name of ['PhoneReport', 'PhoneConfig']) {
      const res = sh(render(name, {}, m.dir), m.home);
      assert.equal(res.status, 0);
      assert.equal(res.stdout, '');
    }
  } finally {
    fs.rmSync(m.home, { recursive: true, force: true });
  }
});

test('a ledger year with a slash never leaves ledger/: skipped, as the old append failed on it', () => {
  // The old `>> "$D/ledger/<a/b>.jsonl"` failed on the missing folder and the
  // rest of the commit went on; the door skips it the same way, and so the
  // name can never point the append anywhere else.
  const inline = install(), staged = install();
  try {
    const evil = blob('ledger-../../evil', '{"id":"x"}\n', '', true);
    const bs = [evil, ...blobs()];
    const token = tokenOf(sh(render('PhoneSnapshot', {}, inline.dir), inline.home).stdout);
    const res = sh(render('PhoneCommit', { token, blobs: pairs(bs) }, inline.dir), inline.home);
    assert.equal(res.stdout, '__CFO_OK__\n');
    stage(staged, bs, 9);
    assert.equal(sh(render('PhoneCommitStaged', { token, names: bs.map(b => b.name) }, staged.dir), staged.home).stdout, '__CFO_OK__\n');
    for (const m of [inline, staged]) {
      const files = Object.keys(tree(m.home));
      assert.ok(files.every(f => !/evil/.test(f)), `nothing named evil anywhere: ${files.filter(f => /evil/.test(f))}`);
      assert.ok(fs.readFileSync(path.join(m.data, 'edits.json'), 'utf8').includes('"lastTs": 9100'), 'the rest landed');
    }
    assert.deepEqual(tree(staged.data), tree(inline.data));
  } finally {
    fs.rmSync(inline.home, { recursive: true, force: true });
    fs.rmSync(staged.home, { recursive: true, force: true });
  }
});
