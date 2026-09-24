// Every skill's SKILL.md, read the way the engine reads it
// (linggen src/extensions/skills/mod.rs `SkillFrontmatter`). serde refuses a
// shape it cannot take and the whole skill vanishes from the list with only
// a WARN in the daemon log — and a key it does not know is dropped in
// silence. This catches both before a skill ships.
//
//   node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS = fs.readdirSync(ROOT).filter(d => fs.existsSync(path.join(ROOT, d, 'SKILL.md'))).sort();

/* The keys the engine reads, and the Agent Skills standard's own
   (license, homepage, metadata, compatibility) which other hosts read. */
const ENGINE_KEYS = [
  'name', 'description', 'tools', 'argument-hint', 'disable-model-invocation', 'user-invocable',
  'allowed-tools', 'allow-skills', 'renamed-from', 'model', 'context', 'memory-context',
  'memory-recall-min-score', 'memory-recall-count', 'agent', 'trigger', 'app', 'permission', 'cwd',
  'install', 'sync', 'cloud', 'product', 'suggestions', 'closing-ask', 'queue', 'quests',
];
const STANDARD_KEYS = ['license', 'homepage', 'metadata', 'compatibility'];
const KNOWN = new Set([...ENGINE_KEYS, ...STANDARD_KEYS]);
const BOOLEANS = ['disable-model-invocation', 'user-invocable', 'closing-ask'];
const LAUNCHERS = new Set(['web', 'bash', 'url']);
const QUEUES = new Set(['steer', 'after-turn']);

/* The frontmatter as top-level key → { value, block }: `value` is what sits
   on the key's own line, `block` the indented lines under it. */
export function readFrontmatter(md) {
  const lines = md.split('\n');
  if (lines[0] !== '---') return null;
  const end = lines.indexOf('---', 1);
  if (end < 0) return null;
  const keys = new Map();
  let at = null;
  for (const line of lines.slice(1, end)) {
    const top = /^([A-Za-z][\w-]*):(.*)$/.exec(line);
    if (top) {
      at = { value: top[2].trim(), block: [] };
      keys.set(top[1], at);
    } else if (at && (/^\s/.test(line) || line === '')) {
      at.block.push(line);
    }
  }
  return keys;
}

const unquote = v => v.replace(/^(['"])(.*)\1$/, '$2');
const scalar = entry => unquote(entry?.value ?? '');
const blockKey = (entry, key) => {
  const hit = entry.block.map(l => new RegExp(`^ {2}${key}:(.*)$`).exec(l)).find(Boolean);
  return hit ? unquote(hit[1].trim()) : null;
};

/* The tools block: a tool opens with `  - name:`, its keys sit at four
   spaces, an arg's name at six. `args` is a map — a list makes serde refuse
   the whole skill (2026-09-18). */
function toolProblems(entry) {
  const problems = [];
  let tool = null, key = null;
  const close = () => {
    if (tool && !tool.keys.has('description')) problems.push(`${tool.name}: no description (the engine requires one)`);
  };
  for (const line of entry.block) {
    const opens = /^ {2}- name: (.+)$/.exec(line);
    if (opens) {
      close();
      tool = { name: unquote(opens[1].trim()), keys: new Set() };
      key = null;
      continue;
    }
    if (!tool) continue;
    const at4 = /^ {4}([A-Za-z_][\w-]*):/.exec(line);
    if (at4) {
      key = at4[1];
      tool.keys.add(key);
      continue;
    }
    if (key === 'args' && /^ {6}- /.test(line)) problems.push(`${tool.name}: args is a list — the engine takes a map of name → param`);
  }
  close();
  return problems;
}

export function problemsOf(dir, md) {
  const fm = readFrontmatter(md);
  if (!fm) return ['SKILL.md must open with a --- frontmatter block'];
  const problems = [];
  for (const key of fm.keys()) if (!KNOWN.has(key)) problems.push(`unknown key \`${key}\` (the engine drops it in silence)`);
  if (scalar(fm.get('name')) !== dir) problems.push(`name \`${scalar(fm.get('name'))}\` is not the folder \`${dir}\``);
  const desc = fm.get('description');
  if (!desc || !(scalar(desc) || desc.block.some(l => l.trim()))) problems.push('description is missing or empty');
  for (const key of BOOLEANS) {
    if (fm.has(key) && !['true', 'false'].includes(scalar(fm.get(key)))) problems.push(`${key} must be true or false`);
  }
  if (fm.has('memory-recall-count') && !/^\d+$/.test(scalar(fm.get('memory-recall-count')))) problems.push('memory-recall-count must be a whole number');
  if (fm.has('memory-recall-min-score') && Number.isNaN(Number(scalar(fm.get('memory-recall-min-score'))))) problems.push('memory-recall-min-score must be a number');
  if (fm.has('queue') && !QUEUES.has(scalar(fm.get('queue')))) problems.push(`queue must be one of ${[...QUEUES].join(', ')}`);
  if (fm.has('trigger') && !scalar(fm.get('trigger'))) problems.push('trigger is empty');
  if (fm.has('app')) {
    const app = fm.get('app');
    const launcher = blockKey(app, 'launcher'), entry = blockKey(app, 'entry');
    if (!LAUNCHERS.has(launcher)) problems.push(`app.launcher must be one of ${[...LAUNCHERS].join(', ')}`);
    if (!entry) problems.push('app.entry is required');
    else if (launcher === 'web' && !fs.existsSync(path.join(ROOT, dir, entry))) problems.push(`app.entry \`${entry}\` does not exist`);
  }
  if (fm.has('tools')) problems.push(...toolProblems(fm.get('tools')));
  if (fm.has('quests')) problems.push(...questProblems(fm.get('quests')));
  return problems;
}

/* `quests:` — the skill's writer with both holes the engine fills, and each
   phone fact kind (`<app>-<verb>`) mapped to a quest id. A kind or id the
   engine's pattern refuses is never stamped. */
function questProblems(entry) {
  const problems = [];
  const stamp = blockKey(entry, 'stamp');
  if (!stamp || !stamp.includes('{id}') || !stamp.includes('{at}')) problems.push('quests.stamp needs {id} and {at}');
  const facts = entry.block.map(l => /^ {4}([^:]+):\s*(.*)$/.exec(l)).filter(Boolean);
  for (const [, kind, id] of facts) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)+$/.test(kind) || kind.length > 48) problems.push(`quests.facts kind \`${kind}\` is not <app>-<verb>`);
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(unquote(id.trim()))) problems.push(`quests.facts ${kind}: quest id \`${id}\` is not an id`);
  }
  return problems;
}

test('every skill folder has a SKILL.md', () => {
  assert.ok(SKILLS.length >= 10, `found ${SKILLS.length}`);
});

for (const dir of SKILLS) {
  test(`${dir}: SKILL.md frontmatter is in the shape the engine loads`, () => {
    assert.deepEqual(problemsOf(dir, fs.readFileSync(path.join(ROOT, dir, 'SKILL.md'), 'utf8')), []);
  });
}

test('the checks catch what they are for', () => {
  const bad = [
    '---', 'name: other', 'description: ""', 'user-invocable: yes', 'queue: later', 'bogus: 1',
    'app:', '  launcher: web', '  entry: nope.html',
    'tools:', '  - name: t', '    args:', '      - a',
    'quests:', '  stamp: node w.js {id}', '  facts:', '    Photos_Clean: x', '---', '',
  ].join('\n');
  const got = problemsOf('lingjing', bad);
  for (const want of ['unknown key `bogus`', 'is not the folder', 'description is missing', 'user-invocable',
    'queue must be', 'does not exist', 'args is a list', 'no description', 'needs {id} and {at}', 'is not <app>-<verb>']) {
    assert.ok(got.some(p => p.includes(want)), `expected a problem mentioning "${want}" in ${JSON.stringify(got)}`);
  }
});

/* Duplicate keys in one mapping. serde refuses them and the whole skill
   vanishes from the engine (dj, 2026-09-24: `required: true` and
   `required: [file, title]` under one arg). A YAML reader that keeps the last
   one would pass it, so check the lines themselves. */
export function duplicateKeys(md) {
  const lines = md.split('\n');
  if (lines[0] !== '---') return [];
  const end = lines.indexOf('---', 1);
  const found = [];
  const stack = [];
  let scalarAt = null; // indent of a key whose value is a block scalar (>-, |)
  lines.slice(1, end).forEach((raw, i) => {
    if (!raw.trim() || raw.trim().startsWith('#')) return;
    let indent = raw.length - raw.trimStart().length;
    if (scalarAt !== null) {
      if (indent > scalarAt) return;
      scalarAt = null;
    }
    let content = raw.trim();
    while (stack.length && stack[stack.length - 1].indent > indent) stack.pop();
    if (content.startsWith('- ')) {
      indent += 2;
      content = content.slice(2);
      while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
      stack.push({ indent, keys: new Set() });
    }
    const m = /^([A-Za-z_][\w-]*)\s*:(.*)$/.exec(content);
    if (!m) return;
    if (!stack.length || stack[stack.length - 1].indent < indent) stack.push({ indent, keys: new Set() });
    const scope = stack[stack.length - 1];
    if (scope.keys.has(m[1])) found.push(`line ${i + 2}: duplicate key "${m[1]}"`);
    scope.keys.add(m[1]);
    if (/^\s*[>|][-+]?\s*$/.test(m[2])) scalarAt = indent;
  });
  return found;
}

test('no mapping in any SKILL.md repeats a key', () => {
  for (const skill of SKILLS) {
    const md = fs.readFileSync(path.join(ROOT, skill, 'SKILL.md'), 'utf8');
    assert.deepEqual(duplicateKeys(md), [], `${skill}/SKILL.md`);
  }
});

test('the duplicate-key check catches the dj case', () => {
  const md = ['---', 'name: x', 'tools:', '  - name: T', '    args:', '      track:',
    '        type: object', '        required: true', '        properties:',
    '          file: { type: string }', '        required: [file]', '---'].join('\n');
  assert.equal(duplicateKeys(md).length, 1);
  const ok = ['---', 'tools:', '  - name: A', '    description: >-', '      a: b', '      a: b',
    '  - name: B', '    description: x', '---'].join('\n');
  assert.deepEqual(duplicateKeys(ok), []);
});
