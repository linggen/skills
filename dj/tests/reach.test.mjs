// Where YouTube is unreachable, a Get is refused with a fact, before anything
// is queued — and an engine that cannot say never blocks a Get.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { downloadRefusal, parseRestricted, restricted } from '../scripts/reach.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ACTIONS = path.join(HERE, '..', 'scripts', 'actions.mjs');

test('the env fact wins and parses', async () => {
  assert.deepEqual(parseRestricted(' youtube, google ,'), ['youtube', 'google']);
  const never = () => { throw new Error('no fetch when env says'); };
  assert.deepEqual(await restricted({ env: { LINGGEN_RESTRICTED: 'youtube' }, fetchImpl: never }), ['youtube']);
  assert.deepEqual(await restricted({ env: { LINGGEN_RESTRICTED: '' }, fetchImpl: never }), []);
});

test('without env it asks the engine; no answer means try', async () => {
  const ok = async () => ({ ok: true, json: async () => ({ restricted: ['youtube', 'google'] }) });
  assert.deepEqual(await restricted({ env: {}, fetchImpl: ok }), ['youtube', 'google']);
  const down = async () => { throw new Error('refused'); };
  assert.deepEqual(await restricted({ env: {}, fetchImpl: down }), []);
  assert.deepEqual(await restricted({ env: {}, fetchImpl: async () => ({ ok: false }) }), []);
});

test('only an unreachable youtube refuses', () => {
  assert.deepEqual(downloadRefusal(['youtube']), { ok: false, unavailable: 'download', reason: 'youtube_unreachable' });
  assert.equal(downloadRefusal(['google']), null);
  assert.equal(downloadRefusal([]), null);
});

test('queue-add refuses and queues nothing where youtube is unreachable', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dj-reach-'));
  const run = (restrictedList) => spawnSync(process.execPath, [ACTIONS, 'queue-add', JSON.stringify([{ artist: 'A', title: 'B' }])], {
    env: { ...process.env, DJ_DIR: dir, LINGGEN_RESTRICTED: restrictedList },
    encoding: 'utf8',
  });
  const refused = run('youtube,google');
  assert.equal(refused.status, 0, refused.stderr);
  assert.deepEqual(JSON.parse(refused.stdout.trim().split('\n').pop()), { ok: false, unavailable: 'download', reason: 'youtube_unreachable' });
  assert.ok(!fs.existsSync(path.join(dir, 'data', 'queue.json')), 'nothing queued');
  const allowed = JSON.parse(run('').stdout.trim().split('\n').pop());
  assert.equal(allowed.ok, true);
  assert.equal(allowed.added, 1);
});
