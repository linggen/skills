// 斗法 in the 游戏厅 (Hanli 10-21: 「把模仿炉石传说的战斗系统也放到大厅里吧」 · 「看是否游戏系统可以统一外壳」): the story's
// card fight mounted as a small game (games/kapai.js) in the one shell, against every fight of 卷一 as the road deals
// it (worlds/jiuding/levels/kapai.json, made by tools/arcade-fights.mjs). It lists every fight foe, a mounted fight
// writes nothing, and a bot plays one to its end through the mount.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FIGHTS, keyOf } from '../tools/story-fights.mjs';
import { OUT, text } from '../tools/arcade-fights.mjs';
import { bestMove } from '../scripts/fightline.js';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const TABLE = JSON.parse(fs.readFileSync(OUT, 'utf8'));
const REG = JSON.parse(read('../worlds/jiuding/games.json'));
const WORLD = new URL('../worlds/jiuding/', import.meta.url).href;

/* The page's fetch, off the disk: every request kept, so a test can say what was asked for. */
function stubFetch() {
  const asked = [];
  globalThis.fetch = async (url, init = {}) => {
    asked.push({ url: String(url), method: init.method ?? 'GET' });
    const href = String(url);
    if (!href.startsWith(WORLD)) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(new URL(href), 'utf8')) };
  };
  return asked;
}

test('the table is the road\'s, never edited by hand: tools/arcade-fights.mjs makes it byte for byte', () => {
  assert.equal(fs.readFileSync(OUT, 'utf8'), text(), 'stale: node tools/arcade-fights.mjs');
});

test('the 游戏厅 lists every fight foe of 卷一 — the story\'s and the roaming pools\' — grouped by 回, each with a name, a line and a portrait', async () => {
  const want = [...new Set(FIGHTS.filter((f) => f.reach !== false).map(keyOf))];
  assert.deepEqual(TABLE.fights.map((f) => f.key).sort(), [...want].sort());
  for (const id of ['longzhi', 'gui', 'foe-zou', 'foe-lufang', 'foe-shijie', 'foe-maxiaobao', 'qiuyu', 'foe-shuanglong', 'foe-laojing', 'foe-jiuceng', 'zheng'])
    assert.ok(TABLE.fights.some((f) => f.id === id), id);
  for (const f of TABLE.fights) {
    for (const l of ['zh', 'en']) { assert.ok(f.name[l], `${f.key} name ${l}`); assert.ok(f.hint[l], `${f.key} hint ${l}`); assert.ok(f.brief[l]?.creature?.name, `${f.key} brief ${l}`); }
    assert.ok(f.art && fs.existsSync(new URL(f.art, WORLD)), `${f.key} portrait ${f.art}`);
    assert.ok(TABLE.huis.some((h) => h.id === f.hui), `${f.key} 回`);
    assert.equal(f.setup.seed, undefined, 'each deal its own seed');
  }
  // The party as the story has it there; the 丹囊 the story lets him carry (none before the root test).
  const at = (key) => TABLE.fights.find((f) => f.key === key);
  assert.deepEqual(at('qiuyu@09-lingcao/fight').setup.you.party.map((m) => m.id), ['ahe', 'sun']);
  assert.deepEqual(at('foe-laojing@01-laojing/dodge').setup.you.party.map((m) => m.id), ['ahe']);
  assert.equal(at('longzhi@00-longzhi/subdue').setup.you.pouch, undefined);
  assert.deepEqual(at('foe-lufang@wm-fushi/flip').setup.you.pouch.map((p) => p.id), ['mend-pill', 'huiqi-pill']);
  // The picker's rows: the story's first, then the roaming beasts, every foe once.
  stubFetch();
  const { pickRows } = await import('../scripts/games/kapai.js');
  const rows = await pickRows('en');
  assert.equal(rows.length, TABLE.fights.length);
  assert.deepEqual([...new Set(rows.map((r) => r.section))], ['The story', 'Roaming']);
  assert.ok(rows.every((r) => r.group.startsWith('Chapter')));
});

test('the fight is a registered game: its own group, the shell\'s mount contract, the picker in the 游戏厅', async () => {
  const row = REG.games.find((g) => g.id === 'kapai');
  assert.equal(row?.group, 'doufa');
  assert.equal(row.mechanic, '斗法');
  assert.ok(REG.groups.some((g) => g.id === 'doufa'));
  const mod = await import('../scripts/games/kapai.js');
  assert.equal(typeof mod.mount, 'function');
  assert.equal(mod.meta.pause, true, 'the shell can pause it');
  assert.equal(mod.meta.pick, true);
  const arcade = read('../scripts/arcade.js');
  assert.match(arcade, /mod\?\.meta\?\.pick && !/);
  assert.match(arcade, /pickPage\(id, n, row, mod\)/);
  for (const css of ['battle.css', 'battle-party.css', 'danang.css', 'story.css']) assert.match(read('../scripts/arcade.html'), new RegExp(`href="${css}"`));
});

test('a mounted fight writes nothing: no verb, no save, only the world\'s files read', () => {
  const src = read('../scripts/games/kapai.js');
  assert.doesNotMatch(src, /from '\.\.\/rules\.js'|verb\(|\/api\/|method: 'POST'|localStorage/);
  assert.doesNotMatch(read('../scripts/arcade.js'), /verb\(|\/api\/skills/);
});

/* The least of a page the mount draws into: the room's HTML lands in innerHTML; nothing is hit-tested. */
function fakeRoom() {
  const el = () => ({ className: '', innerHTML: '', listeners: {}, addEventListener(t, f) { this.listeners[t] = f; }, removeEventListener(t) { delete this.listeners[t]; }, querySelector: () => null, contains: () => true });
  globalThis.document ??= { addEventListener() {}, removeEventListener() {} };
  const container = { ownerDocument: { createElement: el }, kids: [], replaceChildren(h) { this.kids = [h]; } };
  return container;
}

async function botPlays(key, lang = 'zh') {
  const asked = stubFetch();
  const { mount } = await import('../scripts/games/kapai.js');
  const container = fakeRoom(), said = [];
  const shell = { paused: () => false, say: (who, t) => said.push([who, t]), onPause: () => () => {} };
  const done = mount(container, { data: { foe: key }, lang, seed: 'bot', shell });
  let host = null;
  for (let i = 0; i < 50 && !host?.kapai; i++) { await new Promise((r) => setTimeout(r, 10)); host = container.kids[0]; }
  assert.ok(host?.kapai, 'the room is up');
  assert.match(host.innerHTML, /class="battle/);
  let r = null;
  done.then((x) => { r = x; });
  for (let guard = 0; guard < 600 && !r; guard++) {
    const st = host.kapai.state();
    if (st.outcome === 'open' && st.whose === 'you' && !host.kapai.busy()) await host.kapai.move(bestMove(st) ?? { kind: 'end' });
    else await new Promise((res) => setTimeout(res, 20));
  }
  await done;
  return { r: await done, asked, said, st: host.kapai.state() };
}

test('a bot finishes a fight through the mount, and the arcade\'s fight reads only the world', async () => {
  const { r, asked, st } = await botPlays('longzhi@00-longzhi/subdue');
  assert.notEqual(st.outcome, 'open');
  assert.equal(r.won, st.outcome === 'won');
  if (r.won) assert.ok(r.stars >= 1 && r.stars <= 3);
  assert.equal(r.next, TABLE.fights[1].key, '下一关: the next foe in the book\'s order');
  assert.ok(asked.length && asked.every((a) => a.method === 'GET' && a.url.startsWith(WORLD)), JSON.stringify(asked));
});

test('a story bout with the party, in English, to its end', async () => {
  const { r, st, said } = await botPlays('qiuyu@09-lingcao/fight', 'en');
  assert.notEqual(st.outcome, 'open');
  assert.equal(typeof r.won, 'boolean');
  assert.ok(said.length >= 1, 'its lines over the stage, through the shell');
});
