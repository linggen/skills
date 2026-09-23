// The Clearable pile's logic — no DOM, so node's test runner can import it.
//
// The shell (clearables.sh) finds and measures; this file turns its facts into
// the three words every row answers with — SAFE, REVIEW, CAREFUL — and the one
// line that says why. The verdict is the page's, from facts, never the model's:
// Ling may explain a row, she cannot flip it.
//
// Verdicts only ever move DOWN from a rule's base safety: a SAFE build folder
// built last week is REVIEW (clearing it costs a rebuild); nothing a fact says
// can make a REVIEW row SAFE. Ling's finds ("found") are REVIEW at best.

import { fmtBytes, abbrevPath, shellEsc } from './shifu-io.js';

const DAY = 86400;
const RANK = { safe: 0, review: 1, careful: 2 };

// ── parsing what the shell wrote ──

/** `k=v;k=v` → object. Values keep any '=' after the first. */
export function parseExtra(s) {
  const out = {};
  for (const part of String(s || '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0) out[part.slice(0, at)] = part.slice(at + 1);
  }
  return out;
}

/** Split `line` on its first `n` pipes; the rest (a path) stays whole. */
function fields(line, n) {
  const out = [];
  let rest = line;
  for (let i = 0; i < n; i += 1) {
    const at = rest.indexOf('|');
    if (at < 0) return null;
    out.push(rest.slice(0, at));
    rest = rest.slice(at + 1);
  }
  out.push(rest);
  return out;
}

const LINE_KINDS = {
  S: (f, scan) => { scan.started = +f[0] || 0; },
  P: (f, scan) => { scan.total = +f[0] || 0; },
  T: (f, scan) => { scan.tree = +f[0] || 0; },
  D: (f, scan) => { scan.finished = +f[0] || 0; scan.seconds = +f[1] || 0; },
};

/** rows.txt → `{ started, total, tree, finished, seconds, rows, home }`. */
export function parseScan(text) {
  const scan = { started: 0, total: 0, tree: 0, finished: 0, seconds: 0, rows: [], home: [] };
  for (const line of String(text || '').split('\n')) {
    const kind = line.slice(0, 2);
    if (kind === 'R|') {
      const f = fields(line.slice(2), 6);
      if (!f || !f[6]) continue;
      scan.rows.push({
        rule: f[0], size: +f[1] || 0, state: f[2], last: +f[3] || 0,
        running: f[4] === '1', extra: parseExtra(f[5]), path: f[6],
      });
    } else if (kind === 'H|') {
      const f = fields(line.slice(2), 2);
      if (f && f[2]) scan.home.push({ size: +f[0] || 0, state: f[1], path: f[2] });
    } else if (LINE_KINDS[line[0]] && line[1] === '|') {
      LINE_KINDS[line[0]](line.slice(2).split('|'), scan);
    }
  }
  return scan;
}

/** found.txt (`bytes|state|newest|proposed|why|path`) → rows of rule "found". */
export function parseFound(text) {
  const rows = [];
  for (const line of String(text || '').split('\n')) {
    const f = fields(line, 5);
    if (!f || !f[5]) continue;
    rows.push({
      rule: 'found', size: +f[0] || 0, state: f[1], last: +f[2] || 0, proposed: +f[3] || 0,
      why: f[4], path: f[5], running: false, extra: {}, found: true,
    });
  }
  return rows;
}

// ── the catalog ──

/** The rule for "found" rows lives here, not in the catalog: the catalog is
    what the shell may find; Ling's rows are whatever she proposed. */
const FOUND_RULE = {
  id: 'found', group: 'found', label: 'Found by Shifu', safety: 'review',
  remove: { method: 'trash' }, age_label: 'newest file',
  regen: 'not rebuilt — goes to the Trash, recoverable',
};

export function ruleMap(catalog) {
  const map = new Map((catalog?.rules || []).map((r) => [r.id, r]));
  map.set('found', FOUND_RULE);
  return map;
}

// ── the verdict ──

function ageDays(row, now) {
  return row.last ? Math.max(0, Math.floor((now - row.last) / DAY)) : null;
}

/** Each check may only demote. Order does not matter; the worst wins. */
const DEMOTIONS = [
  (rule, row) => (row.found ? 'review' : null),
  (rule, row) => (row.running ? 'review' : null),
  (rule, row, age) => (rule.active_days && age !== null && age < rule.active_days ? 'review' : null),
  (rule, row, age) => (rule.min_age_days && age !== null && age < rule.min_age_days ? 'review' : null),
];

/** 'safe' | 'review' | 'careful' for one row. An unknown rule is CAREFUL. */
export function verdict(rule, row, now = Date.now() / 1000) {
  if (!rule) return 'careful';
  const age = ageDays(row, now);
  let risk = RANK[rule.safety] === undefined ? 'careful' : rule.safety;
  for (const check of DEMOTIONS) {
    const next = check(rule, row, age);
    if (next && RANK[next] > RANK[risk]) risk = next;
  }
  return risk;
}

// ── the why line ──

function daysText(days) {
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

function baseName(path) {
  return String(path).replace(/\/+$/, '').split('/').pop();
}

/** `{label}`, `{name}`, any extra key; `*_bytes` keys come out as sizes. */
function fill(template, rule, row) {
  const vars = {
    label: rule.label, name: baseName(row.path), parent: baseName(row.path.replace(/\/[^/]+$/, '')), ...row.extra,
  };
  return template.replace(/\{(\w+)\}/g, (m, k) => {
    if (vars[k] === undefined || vars[k] === '') return '';
    return k.endsWith('_bytes') ? fmtBytes(+vars[k]) : vars[k];
  });
}

function subject(rule, row) {
  if (row.found) return `Ling: “${row.why || 'worth a look'}”`;
  if (rule.subject) return fill(rule.subject, rule, row);
  if (row.extra.project) return `${rule.label} of ${row.extra.project}`;
  return `${rule.label} · ${baseName(row.path)}`;
}

/** One line from facts: what it is · when it was last used · what brings it
    back. "Rust build output of luffy · last built 71 days ago · `cargo build`
    rebuilds it — minutes". */
export function whyLine(rule, row, now = Date.now() / 1000) {
  if (!rule) return 'Not in the catalog.';
  const parts = [subject(rule, row)];
  const age = ageDays(row, now);
  if (rule.age_label && age !== null) parts.push(`${rule.age_label} ${daysText(age)}`);
  if (row.running) parts.push('a process is running from this project');
  if (row.state && row.state !== 'ok') parts.push(notMeasured(row.state));
  if (rule.regen) parts.push(rule.regen);
  return parts.filter(Boolean).join(' · ');
}

const NOT_MEASURED = {
  timeout: 'not measured — too big to size in time',
  denied: 'not measured — macOS would not let Shifu read it',
  skipped: 'not measured — the scan ran out of time',
};

export function notMeasured(state) {
  return NOT_MEASURED[state] || 'not measured';
}

// ── removal ──

/** How a row goes, in the words the confirm sheet uses. */
export function methodOf(rule) {
  const m = rule?.remove?.method;
  return ['tool', 'purge', 'trash', 'report'].includes(m) ? m : 'report';
}

export function removable(rule) {
  return methodOf(rule) !== 'report';
}

function projectOf(rule, row) {
  if (rule.find?.outputs?.includes('.')) return row.path;
  return row.path.replace(/\/[^/]+$/, '');
}

const shq = (p) => {
  const s = abbrevPath(p);
  return s.startsWith('~/') ? `"$HOME"/${shellEsc(s.slice(2))}` : shellEsc(s);
};

const COMMANDS = {
  tool: (rule, row) => {
    const project = projectOf(rule, row);
    const cmd = rule.remove.cmd
      .replace(/\{project\}/g, shq(project))
      .replace(/\{name\}/g, shellEsc(baseName(row.path)))
      .replace(/\{parent\}/g, shellEsc(baseName(row.path.replace(/\/[^/]+$/, ''))));
    const cwd = rule.remove.cwd === '{project}' ? project : null;
    return cwd ? `cd ${shq(cwd)} && ${cmd}` : cmd;
  },
  purge: (rule, row) => `rm -rf ${shq(row.path)}`,
  trash: (rule, row) => (rule.find?.kind === 'series'
    ? `find ${shq(row.path)} -maxdepth 1 -type f -name '*20[0-9][0-9]-[01][0-9]-[0-3][0-9]*' -mtime +${rule.find.keep_days || 14}d -exec mv {} ~/.Trash/ \\;`
    : `mv -i ${shq(row.path)} ~/.Trash/`),
  report: (rule) => rule.remove?.cmd || '',
};

/** The line this row would be cleared by in a terminal — built from the
    catalog, never from model text. */
export function commandFor(rule, row) {
  if (!rule) return '';
  return COMMANDS[methodOf(rule)](rule, row);
}

// ── grouping and totals ──

/** Rows with their verdict and why, bucketed by catalog group, biggest group
    first and biggest row first inside each. */
export function groupRows(catalog, rows, now = Date.now() / 1000) {
  const rules = ruleMap(catalog);
  const labels = new Map((catalog?.groups || []).map((g) => [g.id, g.label]));
  labels.set('found', labels.get('found') || 'Found by Shifu');
  const groups = new Map();
  for (const row of rows) {
    const rule = rules.get(row.rule);
    const id = rule?.group || 'found';
    if (!groups.has(id)) groups.set(id, { id, label: labels.get(id) || id, rows: [], bytes: 0 });
    const g = groups.get(id);
    g.rows.push({ ...row, risk: verdict(rule, row, now), why: whyLine(rule, row, now), method: methodOf(rule) });
    g.bytes += row.size;
  }
  const out = [...groups.values()];
  for (const g of out) g.rows.sort((a, b) => b.size - a.size);
  return out.sort((a, b) => b.bytes - a.bytes);
}

/** "About X GB can be cleared safely, Y GB more to review." */
export function totals(groups) {
  const t = { safe: 0, review: 0, careful: 0 };
  for (const g of groups) {
    for (const r of g.rows) if (r.method !== 'report') t[r.risk] += r.size;
  }
  return t;
}

export function headline(groups) {
  const t = totals(groups);
  if (!t.safe && !t.review) return 'Nothing clearable found yet.';
  return `About ${fmtBytes(t.safe)} can be cleared safely, ${fmtBytes(t.review)} more to review.`;
}

/** The home folders, each with how much of it the rows already explain. */
export function homeBreakdown(home, rows) {
  return home
    .map((h) => {
      const prefix = `${h.path}/`;
      const explained = rows
        .filter((r) => r.state === 'ok' && (r.path === h.path || r.path.startsWith(prefix)))
        .reduce((s, r) => s + r.size, 0);
      return { ...h, explained, unexplained: h.state === 'ok' ? Math.max(0, h.size - explained) : 0 };
    })
    .sort((a, b) => b.size - a.size);
}

/** "2026-09-23 14:56" in this Mac's own time zone. */
function localStamp(sec) {
  const d = new Date(sec * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Plain facts for Ling's Clearables tool: groups, the top rows with their
    verdicts, and the home folders the rules left unexplained. The page writes
    it; she reads it and never re-derives a verdict. */
export function summaryText(catalog, scan, found, now = Date.now() / 1000) {
  const rows = [...scan.rows, ...found];
  const groups = groupRows(catalog, rows, now);
  const t = totals(groups);
  const when = scan.finished ? localStamp(scan.finished) : 'still running';
  const lines = [
    `Clearable scan · finished ${when}${scan.seconds ? ` in ${scan.seconds}s` : ''}`,
    `safe ${fmtBytes(t.safe)} · review ${fmtBytes(t.review)} · careful ${fmtBytes(t.careful)}`,
    '', 'GROUPS',
    ...groups.map((g) => `${fmtBytes(g.bytes)} · ${g.label} · ${g.rows.length} rows`),
    '', 'TOP ROWS (size · verdict · path · why)',
    ...groups.flatMap((g) => g.rows).sort((a, b) => b.size - a.size).slice(0, 20)
      .map((r) => `${r.state === 'ok' ? fmtBytes(r.size) : 'not measured'} · ${r.risk.toUpperCase()} · ${abbrevPath(r.path)} · ${r.why}`),
  ];
  const home = homeBreakdown(scan.home, rows).slice(0, 15);
  if (home.length) {
    lines.push('', 'HOME FOLDERS (size · explained by rows · unexplained · path)');
    for (const h of home) {
      lines.push(h.state === 'ok'
        ? `${fmtBytes(h.size)} · ${fmtBytes(h.explained)} · ${fmtBytes(h.unexplained)} · ${abbrevPath(h.path)}`
        : `not measured · - · - · ${abbrevPath(h.path)}`);
    }
  }
  return lines;
}
