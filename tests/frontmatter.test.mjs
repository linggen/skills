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
  'install', 'sync', 'cloud', 'product', 'suggestions', 'closing-ask', 'queue', 'quests', 'notices', 'place', 'members', 'senses', 'session-params',
  'world-line', 'activity-verbs', 'private-talk', 'offers', 'keep',
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
  if (fm.has('keep')) problems.push(...keepProblems(scalar(fm.get('keep'))));
  if (fm.has('tools')) problems.push(...toolProblems(fm.get('tools')));
  if (fm.has('quests')) problems.push(...questProblems(fm.get('quests')));
  if (fm.has('world-line')) problems.push(...worldLineProblems(fm.get('world-line')));
  if (fm.has('activity-verbs')) problems.push(...verbProblems(fm.get('activity-verbs')));
  if (fm.has('offers')) problems.push(...offerProblems(fm.get('offers'), fm.get('tools'), fm.has('app')));
  return problems;
}

/* `keep:` — the skill's own files the person edits, kept on update. The engine reads any YAML list;
   scripts/install-skill.mjs, pulse/install.sh and the app shell read one line, so a skill writes
   it as an inline list (a block list would be kept by the engine and replaced by the others). */
function keepProblems(value) {
  const paths = /^\[(.*)\]$/.exec(value.trim());
  if (!paths) return ['keep must be an inline list on one line, like `keep: [references/brief.md]`'];
  return paths[1].split(',').map(x => unquote(x.trim())).filter(Boolean)
    .filter(p => p.startsWith('/') || p.split('/').includes('..'))
    .map(p => `keep: \`${p}\` is outside the skill folder`);
}

/* `offers:` — problem key → up to three `{ tool: <one of its tools> }` or
   `{ open: <a view of its page> }` (linggen doc/skill-spec.md "Offers"). The
   engine logs a bad one and leaves it out, so the button is simply missing. */
function offerProblems(entry, tools, hasApp) {
  const problems = [];
  const names = new Set((tools?.block ?? []).map(l => /^\s*- name:\s*(\S+)/.exec(l)?.[1]).filter(Boolean));
  let problem = null, count = 0;
  for (const line of entry.block) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const key = /^ {2}([a-z0-9._-]{1,32}):\s*$/.exec(line);
    if (key) { problem = key[1]; count = 0; continue; }
    const item = /^ {4}- \{\s*(tool|open):\s*([^,}]*)\s*\}\s*$/.exec(line);
    if (!item || !problem) { problems.push(`offers: \`${line.trim()}\` is not \`- { tool: X }\` or \`- { open: view }\` under a problem key`); continue; }
    if (++count > 3) problems.push(`offers.${problem}: at most three`);
    if (item[1] === 'tool' && !names.has(item[2].trim())) problems.push(`offers.${problem}: \`${item[2].trim()}\` is not one of its tools`);
    if (item[1] === 'open' && !hasApp) problems.push(`offers.${problem}: it has no page to open`);
  }
  return problems;
}

/* The words of an inline list, `[a, b]`, or null when it is not one. */
const inlineList = text => {
  const m = /^\[(.*)\]$/.exec((text ?? '').trim());
  return m ? m[1].split(',').map(x => unquote(x.trim())).filter(Boolean) : null;
};

/* `world-line:` — one small JSON file inside the skill and 1 to 6 of its keys
   (linggen doc/skill-spec.md "World line"). The engine logs a bad one and shows
   no line; this catches it before it ships. */
function worldLineProblems(entry) {
  const problems = [];
  const file = blockKey(entry, 'file');
  const fields = inlineList(blockKey(entry, 'fields'));
  if (!file || !/^[\w.-]+(\/[\w.-]+)*\.json$/.test(file) || file.includes('..')) problems.push('world-line.file must be a plain relative .json path');
  if (!fields || !fields.length || fields.length > 6) problems.push('world-line.fields must be a list of 1 to 6 keys');
  else {
    for (const f of fields) if (!/^[a-z0-9_]{1,32}$/.test(f)) problems.push(`world-line field \`${f}\` is not a key of [a-z0-9_]`);
    if (new Set(fields).size !== fields.length) problems.push('world-line names a field twice');
  }
  return problems;
}

/* `activity-verbs:` — short slugs, none of the engine's own. The engine drops
   a bad verb with a log line, so the skill's post is then refused. */
const ENGINE_VERBS = ['pair', 'connect', 'disconnect', 'restart', 'used', 'hold'];
function verbProblems(entry) {
  const verbs = inlineList(entry.value);
  if (!verbs || !verbs.length) return ['activity-verbs must be an inline list of verbs'];
  return verbs.flatMap(v => [
    ...(/^[a-z0-9_-]{1,32}$/.test(v) ? [] : [`activity verb \`${v}\` is not a slug of [a-z0-9_-]`]),
    ...(ENGINE_VERBS.includes(v) ? [`activity verb \`${v}\` is the engine's own`] : []),
  ]);
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
  assert.ok(SKILLS.length >= 6, `found ${SKILLS.length}`);
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
    'quests:', '  stamp: node w.js {id}', '  facts:', '    Photos_Clean: x',
    'world-line:', '  file: ../data/world.json', '  fields: [Ok, b]',
    'activity-verbs: [used, Bad Verb]',
    'offers:', '  storage-filling:', '    - { tool: Nope }', '    - run: x', '---', '',
  ].join('\n');
  const got = problemsOf('lingjing', bad);
  for (const want of ['unknown key `bogus`', 'is not the folder', 'description is missing', 'user-invocable',
    'queue must be', 'does not exist', 'args is a list', 'no description', 'needs {id} and {at}', 'is not <app>-<verb>',
    'world-line.file must be', 'is not a key of [a-z0-9_]', "is the engine's own", 'is not a slug',
    '`Nope` is not one of its tools', 'is not `- { tool: X }`']) {
    assert.ok(got.some(p => p.includes(want)), `expected a problem mentioning "${want}" in ${JSON.stringify(got)}`);
  }
});

test('keep is an inline list inside the skill folder', () => {
  const md = keep => `---\nname: demo\ndescription: d\n${keep}\n---\n`;
  assert.deepEqual(problemsOf('demo', md('keep: [references/brief.md, notes]')), []);
  assert.ok(problemsOf('demo', md('keep:\n  - references/brief.md')).some(p => p.includes('inline list')));
  assert.ok(problemsOf('demo', md('keep: [../x, /abs]')).filter(p => p.includes('outside the skill folder')).length === 2);
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
