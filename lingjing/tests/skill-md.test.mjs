// The engine's own reading of SKILL.md, in a test. A tool declared in a shape
// serde refuses (`args` as a list, 2026-09-18) makes the WHOLE skill fail to
// load — it vanishes from the skills list with only a WARN in the daemon log,
// and every other test here still passes, because none of them read the
// frontmatter. This one does: `args` is a map of name → param, and a shell
// tool's `{{placeholders}}` and its declared args are the same set.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_MD = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../SKILL.md');

/* The tools block of the frontmatter, read line by line: a tool opens with
   `  - name:`, its keys sit at four spaces, an arg's name at six, and
   anything deeper belongs to the line above (a folded description). */
export function readTools(md) {
  const lines = md.split('\n');
  assert.equal(lines[0], '---', 'SKILL.md must open with frontmatter');
  const fm = lines.slice(1, lines.indexOf('---', 1));
  const tools = [];
  const problems = [];
  let tool = null;
  let key = null;
  for (const line of fm) {
    const opens = /^ {2}- name: (.+)$/.exec(line);
    if (opens) {
      tool = { name: opens[1].trim(), args: [], cmd: '', endpoint: '', line };
      tools.push(tool);
      key = null;
      continue;
    }
    if (!tool) continue;
    const at4 = /^ {4}([A-Za-z_][\w-]*):(.*)$/.exec(line);
    if (at4) {
      key = at4[1];
      if (key === 'cmd') tool.cmd = at4[2].trim();
      if (key === 'endpoint') tool.endpoint = at4[2].trim();
      continue;
    }
    if (key !== 'args') continue;
    if (/^ {6}- /.test(line)) {
      problems.push(`${tool.name}: args is a list — the engine takes a map of name → param`);
      continue;
    }
    const arg = /^ {6}([A-Za-z_][\w-]*):/.exec(line);
    if (arg) tool.args.push(arg[1]);
    else if (line.trim() && !/^ {8}/.test(line)) problems.push(`${tool.name}: cannot read \`${line.trim()}\` under args`);
  }
  return { tools, problems };
}

test('every tool in SKILL.md is declared in the shape the engine loads', () => {
  const { tools, problems } = readTools(fs.readFileSync(SKILL_MD, 'utf8'));
  assert.ok(tools.length > 20, `expected the skill's tools, found ${tools.length}`);
  assert.deepEqual(problems, []);
});

test("a shell tool's placeholders and its declared args are the same set", () => {
  const { tools } = readTools(fs.readFileSync(SKILL_MD, 'utf8'));
  const problems = [];
  for (const tool of tools) {
    if (!tool.cmd) continue; // a data tool carries args for the page, no cmd to fill
    const placed = [...tool.cmd.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]);
    for (const p of placed) if (!tool.args.includes(p)) problems.push(`${tool.name}: cmd fills {{${p}}}, which no arg declares`);
    for (const a of tool.args) if (!placed.includes(a)) problems.push(`${tool.name}: arg \`${a}\` is declared and never reaches the command`);
  }
  assert.deepEqual(problems, []);
});

test('the list shape that broke the skill is caught', () => {
  const md = ['---', 'tools:', '  - name: Refine', '    cmd: "rules.mjs refine --material={{material}}"', '    args:', '      - name: material', '        description: a thing', '---'].join('\n');
  const { problems } = readTools(md);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /args is a list/);
});
