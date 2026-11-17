// The phone's declared doors, rendered with the engine's argument quoting.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skill = fs.readFileSync(path.join(root, 'SKILL.md'), 'utf8');
const quote = s => `'${s.replaceAll("'", "'\\''")}'`;
const doors = { PhonePull: 'pull', PhonePush: 'push', PhoneSamples: 'samples' };

test('phone doors run the same verbs with their quoted payloads', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'health-door-'));
  try {
    // Pull initializes the mirror identity on a new store: it is a write too.
    for (const [name, verb] of Object.entries(doors)) {
      const block = skill.match(new RegExp(`  - name: ${name}\\n([\\s\\S]*?)(?=\\n  - name:|\\n---)`))?.[1];
      assert.ok(block, `${name} must be declared`);
      assert.match(block, /page_only: true/);
      assert.match(block, /tier: edit\n/);
      const body = verb === 'pull' ? { device: "手机 '一'", names: ['profile.json'] } :
        verb === 'push' ? { device: "手机 '一'", registers: { 'profile.json': { goal: "中文 'quoted'", written_at: '2026-01-01' } } } :
          { device: "手机 '一'", rows: [{ type: 'steps', uuid: '一', start: '2026-01-01T00:00:00Z', source: "表 '一'" }] };
      const json = Buffer.from(JSON.stringify(body));
      const payload = (verb === 'pull' ? json : zlib.gzipSync(json)).toString('base64');
      const cmd = block.match(/    cmd: "([^"]+)"/)[1].replace(/\{\{(\w+)\}\}/g, (_, key) => quote(({ payload })[key]));
      const env = { ...process.env, HEALTH_DIR: path.join(temp, name), SKILL_DIR: root };
      // Fix the identity so the direct and rendered calls see the same state.
      fs.mkdirSync(path.join(env.HEALTH_DIR, 'data'), { recursive: true });
      fs.writeFileSync(path.join(env.HEALTH_DIR, 'data/state.json'), JSON.stringify({ mirror_id: 'test' }));
      const directDir = `${env.HEALTH_DIR}-direct`;
      fs.cpSync(env.HEALTH_DIR, directDir, { recursive: true });
      const direct = spawnSync('bash', [path.join(root, 'scripts/run-js.sh'), path.join(root, 'scripts/ingest.mjs'), verb, payload], { env: { ...env, HEALTH_DIR: directDir }, encoding: 'utf8' });
      const actual = spawnSync('sh', ['-c', cmd], { env, encoding: 'utf8' });
      assert.equal(actual.status, direct.status, actual.stderr);
      assert.deepEqual(JSON.parse(actual.stdout), JSON.parse(direct.stdout));
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
