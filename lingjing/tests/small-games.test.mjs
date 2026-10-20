// The small games as standalone pieces (Hanli, 2026-10-16): one contract (games/mount.js), one
// registry (worlds/jiuding/games.json), a 游戏厅 and a try page that open only with ?dev=1 and are
// linked from nowhere in the game, the thin beat wrapper (beat-host.js), and the one hook a won
// story beat calls (beat-won.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { beatWon, onBeatWon } from '../scripts/beat-won.js';
import { beatHost, mountOnly } from '../scripts/beat-host.js';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const reg = JSON.parse(read('../worlds/jiuding/games.json'));

test('every registered game is a module on the contract: a mount of its own, or a pure board mountPure can run', async () => {
  assert.ok(reg.games.length >= 40);
  const groups = new Set(reg.groups.map((g) => g.id));
  for (const g of reg.games) {
    assert.ok(groups.has(g.group), `${g.id}: group ${g.group}`);
    const mod = await import(`../scripts/games/${g.id}.js`);
    assert.ok(mod.meta?.name?.zh, `${g.id}: a name`);
    assert.ok(typeof mod.mount === 'function' || (typeof mod.html === 'function' && typeof mod.act === 'function' && typeof mod.newGame === 'function'), `${g.id}: mount, or html · act · newGame`);
  }
});

test('every registered game has a type (`mechanic`) from the 游戏厅\'s small vocabulary, with its English', () => {
  // Hanli 10-19: 「能在游戏大厅标一下游戏类型吗, 是割绳子还是投掷等」. A new row picks one of these; a new type
  // is added to arcade.js's KIND_EN (its English) on purpose, not by a typo.
  const vocab = new Set([...read('../scripts/arcade.js').match(/const KIND_EN = \{([\s\S]*?)\};/)[1].matchAll(/([^\s,:'{}]+):\s*'/g)].map((m) => m[1]));
  assert.ok(vocab.size >= 8 && vocab.size <= 14, `a small vocabulary (${vocab.size})`);
  for (const g of reg.games) assert.ok(vocab.has(g.mechanic), `${g.id}: mechanic ${g.mechanic ?? '(none)'} is one of ${[...vocab].join(' ')}`);
});

test('the beats polished on 10-16 export mount() themselves', async () => {
  for (const id of ['rain', 'sneeze']) { // the rest of them deleted 2026-10-19 (「没用在游戏中的, 都删了吧」); the old 射鹿 2026-10-20 (砸寨 plays it)
    const mod = await import(`../scripts/games/${id}.js`);
    assert.equal(typeof mod.mount, 'function', id);
    assert.equal(mountOnly(mod), false, `${id} keeps its html: the story page draws it as ever`);
  }
});

test('the 游戏厅 and the try page are test pages: they draw nothing without ?dev=1, and nothing in the game links to them', () => {
  assert.match(read('../scripts/arcade.js'), /params\.get\('dev'\) === '1'/);
  assert.match(read('../scripts/try-game.html'), /q\.get\('dev'\) !== '1'/);
  for (const page of ['index.html', 'lingjing.js', 'cards.js', 'read.html', 'read.js']) {
    const src = read(`../scripts/${page}`);
    assert.doesNotMatch(src, /arcade\.html|try-game\.html/, `${page} links a test page`);
  }
  for (const doc of ['../SKILL.md', '../guide']) {
    const p = new URL(doc, import.meta.url);
    const files = fs.statSync(p).isDirectory() ? fs.readdirSync(p).map((f) => new URL(`${doc}/${f}`, import.meta.url)) : [p];
    for (const f of files) if (fs.statSync(f).isFile()) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /游戏厅|arcade\.html|try-game/, `${f.pathname} is player-facing`);
  }
});

test('the one door to the 游戏厅 is dev-arcade.js, and it opens only for the developer account or a scratch save', async () => {
  // Every other script stays linking-free (the test above names the player-facing pages; this one sweeps them all).
  const dir = new URL('../scripts/', import.meta.url);
  const linking = fs.readdirSync(dir).filter((f) => /\.(js|mjs|html)$/.test(f) && !/^(arcade|try-)/.test(f))
    .filter((f) => /arcade\.html|try-game\.html/.test(fs.readFileSync(new URL(f, dir), 'utf8')));
  assert.deepEqual(linking, ['dev-arcade.js']);
  // lingjing.js reaches it through the import alone, passing the scratch save in.
  assert.match(read('../scripts/lingjing.js'), /import \{ devArcade \} from '\.\/dev-arcade\.js';/);
  assert.match(read('../scripts/lingjing.js'), /devArcade\(\{ scratch: SCRATCH \}\)/);
  const { arcadeAllowed, arcadeUrl } = await import('../scripts/dev-arcade.js');
  const acct = (developer) => async () => ({ signed_in: true, gate: { app: 'lingjing', developer } });
  assert.equal(await arcadeAllowed({ scratch: null, readAccount: acct(true) }), true, 'the developer account');
  assert.equal(await arcadeAllowed({ scratch: null, readAccount: acct(false) }), false, 'a player');
  assert.equal(await arcadeAllowed({ scratch: null, readAccount: async () => ({ signed_in: false }) }), false, 'signed out');
  assert.equal(await arcadeAllowed({ scratch: null, readAccount: async () => null }), false, 'an engine without the route');
  assert.equal(await arcadeAllowed({ scratch: null, readAccount: async () => { throw new Error('down'); } }), false, 'unreachable');
  let asked = false;
  assert.equal(await arcadeAllowed({ scratch: 'test', readAccount: async () => { asked = true; return null; } }), true, 'a scratch save');
  assert.equal(asked, false, 'a scratch save never reads the account');
  assert.equal(arcadeUrl(null), 'arcade.html?dev=1&from=game');
  assert.equal(arcadeUrl('test'), 'arcade.html?dev=1&from=game&save=test');
  // The arcade, opened from the game, shows the way back.
  assert.match(read('../scripts/arcade.js'), /from'\) === 'game'/);
  assert.match(read('../scripts/arcade.js'), /返回游戏/);
});

test('beat-won: every listener hears a won beat with its grade; a listener that throws stops nothing; one can stop listening', () => {
  const heard = [];
  const off = onBeatWon((id, o) => heard.push([id, o.grade]));
  const offBad = onBeatWon(() => { throw new Error('boom'); });
  const warn = console.warn;
  console.warn = () => {};
  try { beatWon('rain-basins', { grade: 'dry' }); } finally { console.warn = warn; }
  assert.deepEqual(heard, [['rain-basins', 'dry']]);
  off(); offBad();
  beatWon('deer-wind');
  assert.equal(heard.length, 1);
});

test('the page calls beatWon once, for a story board, after the rules took the win and the pay — never on a skip or a refusal', () => {
  const src = read('../scripts/lingjing.js');
  const win = src.slice(src.indexOf('async function onWin(taskId)'), src.indexOf('const isTask ='));
  assert.ok(win.indexOf('if (!r.ok)') < win.indexOf('beatWon(') && win.indexOf('payWin(taskId)') < win.indexOf('beatWon('), 'after the refusal is handled and the pay is done');
  assert.match(win, /if \(story\) beatWon\(taskId, \{ grade \}\)/);
  const skip = src.slice(src.indexOf('async function onSkip(g)'), src.indexOf('function openStuckSlots()'));
  assert.doesNotMatch(skip, /beatWon/);
});

/* A stand-in document: enough for beat-host to find its hosts and lay its node. */
function fakeDoc() {
  const hosts = [];
  const el = (cls = '') => ({ className: cls, firstChild: null, children: [], replaceChildren(n) { this.firstChild = n; this.children = [n]; } });
  return {
    hosts, createElement: () => el(),
    addHost(id) { const h = { ...el(), dataset: { mount: id } }; hosts.push(h); return h; },
    querySelectorAll: () => hosts,
  };
}

test('beat-host: a mount-only game is mounted once and laid into each new host a redraw makes; its result goes to onSettled', async () => {
  const doc = fakeDoc();
  let mounts = 0, settle;
  const mod = { meta: { name: { zh: '割绳子' } }, mount: () => { mounts += 1; return new Promise((r) => { settle = r; }); } };
  const g = { taskId: 'fox-bread', mod, state: { won: false } };
  const got = [];
  const host = beatHost({ boardFor: () => g, lang: () => 'zh', onSettled: (b, r) => got.push([b.taskId, r]), doc });
  const h1 = doc.addHost('fox-bread');
  host.attach();
  const node = h1.firstChild;
  assert.ok(node);
  doc.hosts.length = 0;
  const h2 = doc.addHost('fox-bread'); // the page redrew the card
  host.attach();
  assert.equal(h2.firstChild, node, 'the same game, moved — not restarted');
  assert.equal(mounts, 1);
  settle({ won: true, stars: 3 });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(got, [['fox-bread', { won: true, stars: 3 }]]);
  // A pure module never goes through the host.
  const pure = beatHost({ boardFor: () => ({ mod: { html: () => '', mount: () => {} } }), lang: () => 'zh', onSettled: () => {}, doc });
  doc.hosts.length = 0;
  const h3 = doc.addHost('rain-basins');
  pure.attach();
  assert.equal(h3.firstChild, null);
});
