// An open board follows a language switch (Hanli 2026-11-04, 周衡's 灯谜 at the 执事堂: En → 中 switched the bar and the
// card's header, and everything inside the board stayed English). The page tells the boards in play (beat-host.js relang);
// each mount that listens (`onLang`) draws itself again in the new tongue, its play kept: a pure board through mountPure,
// the word boards through jinchat (its frame, the book's lines, the game's strip and count; the riddle in the other tongue
// where the chat has it). A pool's riddle is one tongue's only (dengmi.json), so it stays as dealt; so do a model's lines.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { beatHost } from '../scripts/beat-host.js';
import { riddleIn } from '../scripts/games/jinchat-play.js';
import { riddleOf } from '../scripts/games/jinchat-games.js';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const games = JSON.parse(read('../worlds/jiuding/games.json'));
const chats = games.games.find((g) => g.id === 'jinchat' && !g.task).data.chats;

function fakeDoc() {
  const hosts = [];
  const el = () => ({ firstChild: null, replaceChildren(n) { this.firstChild = n; } });
  return { hosts, createElement: () => el(), addHost(id) { const h = { ...el(), dataset: { mount: id } }; hosts.push(h); return h; }, querySelectorAll: () => hosts };
}

test('beat-host: relang reaches every mount in play that listens; a settled one is left alone', async () => {
  const doc = fakeDoc();
  const heard = [];
  let settle;
  const mod = { meta: { id: 'jinchat' }, mount: (node, o) => { o.onLang((to) => heard.push(to)); return new Promise((r) => { settle = r; }); } };
  const g = { taskId: 'zhishi-shen', day: 'd', mod, state: { won: false } };
  const host = beatHost({ boardFor: () => g, lang: () => 'en', onSettled: () => {}, doc });
  doc.addHost('zhishi-shen');
  host.attach();
  host.relang('zh');
  assert.deepEqual(heard, ['zh']);
  settle({ won: true });
  await new Promise((r) => setTimeout(r, 0));
  host.relang('en');
  assert.deepEqual(heard, ['zh'], 'over: nothing to draw again');
});

test('beat-host: a loss dealt again in place is told (onLost) — the rules count it and take its 体力', async () => {
  const doc = fakeDoc();
  const lost = [], mounts = [];
  const mod = { meta: { id: 'x' }, mount: (node, o) => new Promise((r) => { mounts.push(r); }) };
  const g = { taskId: 'b', day: 'd', mod, state: { won: false } };
  beatHost({ boardFor: () => g, lang: () => 'zh', onSettled: () => {}, onLost: (b, r) => lost.push([b.taskId, r.won]), doc, againMs: 0 }).attach(doc.addHost('b'));
  mounts[0]({ won: false });
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(lost, [['b', false]]);
  assert.equal(mounts.length, 2, 'and dealt again, as before');
});

test('the riddle in the other tongue: the chat\'s own riddle switches; a pool\'s, or a game that is no riddle there, stays', () => {
  const own = Object.entries(chats).find(([, c]) => c.game?.kind === 'riddle' && c.game.zh?.q && c.game.en?.q)?.[1].game;
  assert.ok(own, 'a chat with its riddle in both tongues');
  const zh = { ...riddleOf(own, 'zh'), lang: 'zh' };
  const en = riddleIn(own, 'en', zh);
  assert.equal(en.lang, 'en');
  assert.equal(en.q, riddleOf(own, 'en').q);
  assert.notEqual(en.q, zh.q);
  // 周衡's pool: the 中 and English pools are different riddles — the one dealt stays.
  const pool = { ...own, riddle: 'hal-tongs', en: { q: 'Long legs, crooked thighs, / Little head and no eyes.', answers: ['tongs'], hints: [], choices: [] } };
  const dealt = { ...riddleOf(pool, 'en'), lang: 'en' };
  assert.equal(riddleIn(pool, 'zh', dealt), dealt);
  assert.equal(riddleIn({ ...pool, riddle: 'own' }, 'zh', dealt).lang, 'zh', 'the own riddle of a pool chat does switch');
  // A chain in 中 is a riddle in English (kindOf): the chain plays on as it is.
  const chain = Object.values(chats).find((c) => c.game?.kind === 'chain' && c.game.en)?.game;
  const was = { q: 'x', lang: 'zh' };
  if (chain && chain.en?.kind !== 'riddle') assert.equal(riddleIn(chain, 'en', was), was);
});

test('the wiring: the page tells the boards after a switch; mountPure redraws; jinchat lays its lines again from their source', () => {
  const page = read('../scripts/lingjing.js');
  const sw = page.slice(page.indexOf('async function switchLang('), page.indexOf('/// The stage in its FIXED SECTIONS'));
  assert.match(sw, /beats\.relang\(lang\(\)\)/);
  assert.match(page, /onLost: \(g\) => boardLostNow\(g\)/);
  const mount = read('../scripts/games/mount.js');
  assert.match(mount, /onLang\?\.\(\(to\) => \{ lang = to; paint\(\); \}\)/);
  const jc = read('../scripts/games/jinchat.js');
  assert.match(jc, /onLang\?\.\(relang\)/);
  // The book's lines carry their source, so a switch can lay them in the other tongue.
  assert.match(jc, /add\(\{ who: 'note', text: pick\(l, lang\), src: l \}\)/);
  assert.match(jc, /text: pick\(l\.text, lang\), src: l\.text \}/);
  // Every word game listens.
  const play = read('../scripts/games/jinchat-play.js');
  assert.equal((play.match(/onLang\(ctx, \(to\) => \{/g) ?? []).length, 4, 'riddle · guess · couplet · chain');
});

test('the page follows Linggen\'s one language when it comes back into view; a scratch save keeps its own (ling-mem qABzJJYjv5)', async () => {
  const page = read('../scripts/lingjing.js');
  const fn = page.slice(page.indexOf('async function followGlobalLang()'), page.indexOf("window.addEventListener('focus', () => followGlobalLang());"));
  assert.match(fn, /if \(SCRATCH \|\| !look\) return;/);
  assert.match(fn, /fetch\('\/api\/user\/language'/);
  assert.match(fn, /await refresh\(\);\s*beats\.relang\(lang\(\)\);\s*render\(\);/);
  assert.match(page, /document\.addEventListener\('visibilitychange', \(\) => \{ if \(!document\.hidden\) followGlobalLang\(\); \}\);/);
  // The toggle is the rules' Lang, which writes the global on the real save (rules/language.mjs chooseLang).
  const { chooseLang, langNow } = await import('../scripts/rules/language.mjs');
  const posted = [];
  const fetchFn = async (url, init = {}) => { posted.push([init.method ?? 'GET', String(url), init.body ?? null]); return { ok: true, json: async () => ({ language: 'zh-Hans', pet: {} }) }; };
  const env = { LINGGEN_LANGUAGE: 'zh-Hans', LINGGEN_PORT: '1' };
  assert.equal((await chooseLang('en', { env, fetchFn })).ok, true);
  assert.deepEqual(posted.map(([m, u]) => [m, u]), [['GET', 'http://127.0.0.1:1/api/config'], ['POST', 'http://127.0.0.1:1/api/config']]);
  assert.equal(JSON.parse(posted[1][2]).language, 'en');
  assert.equal(langNow(env), 'en');
});
