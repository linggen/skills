// The phone reader's declared doors, rendered as the engine renders shell args.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skill = fs.readFileSync(path.join(root, 'SKILL.md'), 'utf8');
const quote = s => `'${s.replaceAll("'", "'\\''")}'`;
function door(name, args, home) {
  const block = skill.match(new RegExp(`  - name: ${name}\\n([\\s\\S]*?)(?=\\n  - name:|\\n---)`))?.[1];
  assert.ok(block, `${name} must be declared`);
  assert.match(block, /page_only: true/);
  assert.match(block, /tier: read/);
  const cmd = block.match(/    cmd: "([^"]+)"/)[1].replace(/\{\{(\w+)\}\}/g, (_, key) =>
    Array.isArray(args[key]) ? args[key].map(quote).join(' ') : quote(args[key]));
  return spawnSync('sh', ['-c', cmd], { env: { ...process.env, HOME: home, SKILL_DIR: root }, encoding: 'utf8' });
}

test('book doors preserve bytes and flags, and refuse paths outside the book', () => {
  const home = fs.mkdtempSync(path.join(root, '.book-door-test-'));
  try {
    const base = path.join(home, 'workspace/linggen/skills/lingjing');
    const book = path.join(base, 'story/jiuding-lu');
    fs.mkdirSync(book, { recursive: true });
    fs.mkdirSync(path.join(base, 'scripts'), { recursive: true });
    const text = '中文 with space\n尾';
    fs.writeFileSync(path.join(book, '一 回.md'), text);
    fs.writeFileSync(path.join(base, 'scripts/run-js.sh'), 'printf "%s\\n" "$@"\n');
    const file = door('BookFile', { file: '一 回.md' }, home);
    assert.equal(file.status, 0);
    assert.equal(file.stdout, `${text}\n__JIUDING_END__`);
    for (const bad of ['../secret', '/etc/passwd']) {
      assert.notEqual(door('BookFile', { file: bad }, home).status, 0);
    }
    const changes = door('BookChanges', { flags: ['--id=一 回', "--match=a'b"] }, home);
    assert.equal(changes.status, 0);
    assert.equal(changes.stdout, `${base}/scripts/rules.mjs\nchanges\n--book=jiuding-lu\n--id=一 回\n--match=a'b\n\n__JIUDING_END__`);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
