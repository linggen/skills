// The play bot's picture checks (tools/playbot/art.mjs): what counts as a picture, what a miss is (and what is the
// page's own cancel), one finding per picture, and the core-only block driven by a pack listing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FIRST_STORY, isPicture, isCancel, missOf, missLedger, pictureKey, coreBlock, packOfPath } from '../tools/playbot/art.mjs';

const U = 'http://127.0.0.1:5000/apps/lingjing/';

test('a picture: by resource type, or by extension (a texture fetched by a game engine)', () => {
  assert.equal(isPicture({ url: `${U}worlds/jiuding/art/cards/a.webp`, resourceType: 'image' }), true);
  assert.equal(isPicture({ url: `${U}scripts/games/x/art/sheet.PNG?v=2`, resourceType: 'fetch' }), true);
  for (const ext of ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif']) assert.equal(isPicture({ url: `${U}a.${ext}`, resourceType: 'xhr' }), true, ext);
  assert.equal(isPicture({ url: `${U}scripts/lingjing.js`, resourceType: 'script' }), false);
  assert.equal(isPicture({ url: `${U}worlds/jiuding/art/x.json`, resourceType: 'fetch' }), false);
  assert.equal(isPicture({ url: `${U}a.m4a`, resourceType: 'media' }), false);
  assert.equal(isPicture({ url: 'data:image/png;base64,AAAA', resourceType: 'image' }), false);
  assert.equal(isPicture({ url: 'blob:http://x/1', resourceType: 'image' }), false);
});

test('the key is the decoded path, query and hash dropped', () => {
  assert.equal(pictureKey(`${U}worlds/jiuding/art/people/%E7%A7%A6.webp?x=1#y`), '/apps/lingjing/worlds/jiuding/art/people/秦.webp');
});

test('a miss: an HTTP error or a failure; the page\'s own cancel is not one', () => {
  assert.deepEqual(missOf({ url: `${U}a.webp`, resourceType: 'image', status: 404 }), { path: '/apps/lingjing/a.webp', why: 'HTTP 404' });
  assert.equal(missOf({ url: `${U}a.webp`, resourceType: 'image', status: 200 }), null);
  assert.equal(missOf({ url: `${U}a.webp`, resourceType: 'image', status: 304 }), null);
  assert.deepEqual(missOf({ url: `${U}a.png`, resourceType: 'image', failure: 'net::ERR_CONNECTION_REFUSED' }), { path: '/apps/lingjing/a.png', why: 'net::ERR_CONNECTION_REFUSED' });
  assert.equal(missOf({ url: `${U}a.png`, resourceType: 'image', failure: 'net::ERR_ABORTED' }), null);
  assert.equal(isCancel('net::ERR_ABORTED'), true);
  assert.equal(isCancel('net::ERR_FAILED'), false);
  assert.equal(missOf({ url: `${U}a.js`, resourceType: 'script', status: 404 }), null);
});

test('one finding per picture: the first miss is new, later ones count up and gather sizes', () => {
  const l = missLedger();
  assert.equal(l.note({ path: '/a.webp', why: 'HTTP 404' }, '430x932'), true);
  assert.equal(l.note({ path: '/a.webp', why: 'HTTP 404' }, '430x932'), false);
  assert.equal(l.note({ path: '/a.webp', why: 'HTTP 404' }, '1280x820'), false);
  assert.equal(l.note({ path: '/b.webp', why: 'HTTP 404' }, '430x932'), true);
  assert.deepEqual(l.seen.get('/a.webp'), { path: '/a.webp', why: 'HTTP 404', count: 3, sizes: ['430x932', '1280x820'] });
  assert.equal(l.seen.size, 2);
});

test('the core-only block: art outside core is blocked, core art and everything else served', () => {
  const files = [
    { path: 'worlds/jiuding/art/cards/a.webp', pack: 'core' },
    { path: 'worlds/jiuding/art/places/b.webp', pack: 'ch-00-zhuji' },
    { path: 'worlds/jiuding/art/plates/c.png', pack: 'unplaced' },
  ];
  const block = coreBlock(files);
  assert.equal(block('worlds/jiuding/art/cards/a.webp'), false);
  assert.equal(block('worlds/jiuding/art/places/b.webp'), true);
  assert.equal(block('/worlds/jiuding/art/plates/c.png'), true);
  assert.equal(block('worlds/jiuding/art/new/never-listed.webp'), true);
  assert.equal(block('worlds/jiuding/art/cards/../places/b.webp'), true);
  assert.equal(block('scripts/games/fighter/art/x.png'), false);
  assert.equal(block('scripts/lingjing.js'), false);
  assert.equal(block('worlds/jiuding/places.json'), false);
  assert.equal(block.blocked, 2);
});

test('a missed picture\'s pack, from its served path', () => {
  const files = [{ path: 'worlds/jiuding/art/places/b.webp', pack: 'ch-00-zhuji' }];
  assert.equal(packOfPath(files, '/apps/lingjing/worlds/jiuding/art/places/b.webp'), 'ch-00-zhuji');
  assert.equal(packOfPath(files, '/apps/lingjing/worlds/jiuding/art/places/zz.webp'), 'not listed');
  assert.equal(packOfPath(files, '/apps/lingjing/scripts/games/x/a.png'), 'not art');
});

test('the scratch server under the core-only block: art outside core is a 404 and is listed, the rest is served', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { makeServer } = await import('../tools/playbot/serve.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-art-'));
  const skill = path.join(root, 'skill');
  fs.mkdirSync(path.join(skill, 'worlds/w/art/places'), { recursive: true });
  for (const f of ['worlds/w/art/a.webp', 'worlds/w/art/places/b.webp']) fs.writeFileSync(path.join(skill, f), 'x');
  const block = coreBlock([{ path: 'worlds/w/art/a.webp', pack: 'core' }, { path: 'worlds/w/art/places/b.webp', pack: 'ch-00-zhuji' }]);
  const { server, blocked } = makeServer({ skill, data: path.join(root, 'data'), block });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const at = (p) => fetch(`http://127.0.0.1:${server.address().port}/apps/lingjing/${p}`).then((r) => r.status);
  try {
    assert.equal(await at('worlds/w/art/a.webp'), 200);
    assert.equal(await at('worlds/w/art/places/b.webp'), 404);
    assert.equal(await at('worlds/w/art/places/b.webp?v=1'), 404);
    assert.deepEqual([...blocked], [['worlds/w/art/places/b.webp', 2]]);
  } finally {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('--art=core plays every story fight of the first chapter, and only those', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const chapters = path.resolve(import.meta.dirname, '../worlds/jiuding/chapters');
  const withDuel = [];
  for (const ch of ['00-prologue', '00-waimen']) {
    const dir = path.join(chapters, ch, 'scenes');
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
      const scene = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (JSON.stringify(scene.exits ?? []).includes('"duel"')) withDuel.push(scene.id);
    }
  }
  assert.deepEqual([...FIRST_STORY].sort(), withDuel.sort());
});
