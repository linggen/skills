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

/* The `place:` block (skill-spec § Place; engine `record::Places`): keyed by
   agent id, each a plain string or `{text, absent_until: {file, path}}`. The
   gate's path must be the one the rules write when she joins. */
const flowMap = (inner) => Object.fromEntries(inner.split(/,\s*(?=[\w-]+:)/).map((kv) => {
  const at = kv.indexOf(':');
  return [kv.slice(0, at).trim(), kv.slice(at + 1).trim().replace(/^"(.*)"$/, '$1')];
}));
export function readPlace(md) {
  const lines = md.split('\n');
  const fm = lines.slice(1, lines.indexOf('---', 1));
  const at = fm.indexOf('place:');
  if (at < 0) return null;
  const place = {};
  let agent = null, key = null;
  for (const line of fm.slice(at + 1)) {
    if (/^\S/.test(line)) break; // the next top-level key
    const who = /^ {2}([\w-]+):\s*(.*)$/.exec(line);
    if (who) { agent = who[1]; place[agent] = who[2] ? who[2].trim() : {}; key = null; continue; }
    const kv = /^ {4}([\w-]+):\s*(.*)$/.exec(line);
    if (kv && agent) {
      key = kv[1];
      const v = kv[2].trim();
      // A flow map (`{file: …, session_file: "…", path: …}`): its keys, a quoted value unquoted.
      const flow = /^\{(.*)\}$/.exec(v);
      place[agent][key] = flow ? flowMap(flow[1]) : v === '>-' || v === '>' || v === '|' ? '' : v;
      continue;
    }
    if (agent && key && /^ {6}/.test(line)) place[agent][key] = `${place[agent][key]} ${line.trim()}`.trim();
  }
  return place;
}

test("place: 银月 is a guest with her own text, absent until the save says she joined", async () => {
  const place = readPlace(fs.readFileSync(SKILL_MD, 'utf8'));
  assert.deepEqual(Object.keys(place), ['yinyue'], 'only guests (Ling\'s place is the SKILL.md body)');
  const her = place.yinyue;
  assert.ok(her.text.length > 40 && her.text.length < 400, 'one or two short lines');
  // A chat bound to a test save reads that save's state (skill-spec § Session parameters): the file
  // the rules write for `--save=<name>`, the same `companion.here` the rules fit there.
  assert.deepEqual(her.absent_until, { file: 'data/state.json', session_file: 'data/saves/{{session.save}}/state.json', path: 'companion.here' });
  // The rules keep the save at data/state.json in the skill folder …
  const { dataDir } = await import('../scripts/rules/files.mjs');
  const skillDir = path.resolve(path.dirname(SKILL_MD));
  if (!process.env.LINGJING_DATA) assert.equal(path.relative(skillDir, path.join(dataDir(), 'state.json')), her.absent_until.file);
  const { scratchDir } = await import('../scripts/rules/files.mjs');
  if (!process.env.LINGJING_DATA) assert.equal(path.relative(skillDir, path.join(scratchDir('cc-x'), 'state.json')), her.absent_until.session_file.replace('{{session.save}}', 'cc-x'));
  // … and `companion.here` is what the rules write as a save is fitted (companion.mjs fitPresence): found and not
  // away — asleep in the fox token too, where she speaks half asleep (Hanli 2026-10-27: 「yinyue睡着也可以说话」) —
  // read the engine's way (set = present and not null/false/0/""/[]/{}).
  const { fitPresence } = await import('../scripts/rules/companion.mjs');
  const { loadContent } = await import('../scripts/content.mjs');
  const content = loadContent();
  const valueAt = (json, p) => p.split('.').reduce((v, k) => (v == null ? undefined : v[k]), json);
  const isSet = (v) => v != null && v !== false && v !== 0 && v !== '' && !(Array.isArray(v) && !v.length) && !(typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);
  for (const [s, here] of [[{}, false], [{ companion: {} }, false], [{ companion: { riddle: { day: 'x' } } }, false], [{ companion: { joined: '2026-09-18', awake: true } }, true], [{ companion: { joined: '2026-09-28', asleep: true } }, true]]) {
    assert.equal(isSet(valueAt(fitPresence(content, s), her.absent_until.path)), here, JSON.stringify(s));
  }
});
