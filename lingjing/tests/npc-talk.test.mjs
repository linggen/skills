// 砍价's panel and the one NPC talk component (Hanli 2026-10-28: 「直接放一个砍价按钮到商店UI里更简单点」 ·
// 「能否改成[货郎]: 客官您好 这么说话, 省掉[ling]的工具调用?」 · 「可以做一个通用的和NPC对话的UI」). What the page owns:
// the strip's widgets from the rules' facts, the keeper's reply parsed as his bubbles, the hidden call going to a
// side session of its own (never the story's chat), the shelf's 砍价 and 「差 X」, the 主页's 「差 X · 可砍价」.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { widgetsHtml, KANJIA_WORDS } from '../scripts/kanjia.js';
import { npcLine, npcReply, NPC_SYSTEM } from '../scripts/npc-line.js';
import { NPC_TITLE, NPC_WITHHELD, npcAsk, sweepNpc } from '../scripts/npc-ask.js';
import { avatarHtml, bubbleHtml, frameHtml } from '../scripts/npc-talk.js';
import { cardHtml, WORDS } from '../scripts/cards.js';
import { wayLine } from '../scripts/wayline.js';
import { MOMENTS, poolOf } from '../scripts/hersay.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const OPEN = {
  item: { id: 'caoren-zha', name: '替身草人' }, list: 60, ask: 57, qty: 1, total: 57, mood: 2, max_mood: 3, wealth: 50,
  args: [{ id: 'regular', say: '我常来', used: true }, { id: 'flaw', say: '有瑕疵', off: 4 }],
  offer: { min: 30, max: 56 },
};

test('砍价 strip: the price, the beads, only the arguments he holds (used ones grey), the slider, 成交 short by what he lacks', () => {
  const h = widgetsHtml(OPEN, 'zh');
  assert.match(h, /<s>标价 60<\/s><strong data-kj-ask>现价 57<\/strong>/);
  assert.equal((h.match(/<b class="is-on">/g) ?? []).length, 2, 'two beads of three');
  assert.match(h, /data-kj-arg="regular" disabled>我常来<\/button>/, 'used: greyed, no amount');
  assert.match(h, /data-kj-arg="flaw">有瑕疵 <small>−4<\/small>/, 'each shows what it takes off');
  assert.match(h, /type="range" data-kj-slider min="30" max="56"/);
  assert.match(h, /data-kj-deal disabled>成交 · 57 灵石 · 差 7/, 'short of the ask: 成交 waits');
  assert.ok(!/再低要翻脸了/.test(h));
  assert.match(widgetsHtml(OPEN, 'zh', { low: true }), /再低要翻脸了/, 'after a too-low offer');
  assert.match(widgetsHtml({ ...OPEN, offer: null, wealth: 100 }, 'zh'), /已还过价[\s\S]*data-kj-deal>成交 · 57 灵石</, 'one counter-offer; enough stones: 成交 open');
  assert.match(widgetsHtml({ ...OPEN, qty: 2, total: 100, wealth: 100 }, 'zh'), /两件 · 共 100/);
  assert.ok(KANJIA_WORDS.en.low && KANJIA_WORDS.zh.low === '再低要翻脸了');
});

test('the keeper\'s line: a hidden line of facts, never the floor; his reply is his bubbles — no name, no narration', () => {
  const l = npcLine({ who: '周衡', voice: '爱记账', where: '外门库房', facts: '现价 57', say: '你让了一点', first: true, lang: 'zh' });
  assert.match(l, /^\[HIDDEN\] \[npc\] /);
  assert.match(l, /不调用任何工具/);
  assert.match(npcLine({ who: '周衡', facts: 'x', first: false }), /^\[HIDDEN\] \[npc\] 周衡·/);
  assert.deepEqual(npcReply('周衡：一分钱一分货。\n（他拨了拨算盘）\n「五十七，不能再少。」\n第三句', '周衡'), ['一分钱一分货。', '五十七，不能再少。']);
  assert.deepEqual(npcReply('<!--x-->好吧。'), ['好吧。']);
  assert.ok(NPC_SYSTEM.zh && NPC_SYSTEM.en);
});

test('the hidden call is a side session of its own — bound to the save, every tool withheld, removed at close; never the story\'s chat', async () => {
  const calls = [], removed = [];
  let rows = [];
  const api = async () => ({
    listSkillSessions: async () => [{ id: 'old', title: NPC_TITLE, created_at: 0 }, { id: 'story', title: 'x', created_at: 0 }],
    removeSkillSession: async (skill, id) => { removed.push(id); },
    fetchSessionMessages: async (skill, sid) => (sid === 'side-1' ? rows : []),
  });
  const post = async (url, body) => {
    calls.push({ url, body });
    if (url === '/api/sessions') return { ok: true, json: async () => ({ id: 'side-1' }) };
    rows = [[{ from: 'ling', to: 'user' }, '客官，五十七。']];
    return { ok: true, json: async () => ({ ok: true }) };
  };
  const talk = npcAsk({ params: { save: 'kanjia' }, deps: { api, post, pollMs: 1 } });
  assert.equal(await talk.say('[HIDDEN] [npc] …'), '客官，五十七。');
  const made = calls.find((c) => c.url === '/api/sessions').body;
  assert.equal(made.title, NPC_TITLE);
  assert.deepEqual(made.params, { save: 'kanjia' });
  assert.deepEqual(made.withheld_tools, NPC_WITHHELD);
  const chat = calls.filter((c) => c.url === '/api/chat');
  assert.equal(chat.length, 1);
  assert.equal(chat[0].body.session_id, 'side-1', 'the side session, never the story\'s');
  await talk.close();
  assert.ok(removed.includes('side-1') && removed.includes('old') && !removed.includes('story'), 'its own removed, an old one swept, the story kept');
  assert.deepEqual(sweepNpc([{ id: 'a', title: NPC_TITLE, created_at: 100 }], () => {}, { nowSec: 200 }), [], 'a fresh one is not swept');
  // Every tool Ling or 银月 has in Lingjing is withheld there.
  const md = fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf8');
  const tools = [...md.matchAll(/^ {2}- name: (\w+)$/gm)].map((m) => m[1]);
  const allowed = /allowed-tools: \[(.*)\]/.exec(md)[1].split(',').map((x) => x.trim());
  for (const t of [...tools, ...allowed, 'AppTool']) assert.ok(NPC_WITHHELD.includes(t), t);
  // …and the story page never resumes it as the day's chat.
  assert.match(fs.readFileSync(path.join(ROOT, 'scripts/lingjing.js'), 'utf8'), /s\.title !== NPC_TITLE/);
});

test('the talk component: a face, a bubble, the frame with the shell\'s ✕', () => {
  assert.match(avatarHtml({ name: '周衡', art: 'a.webp' }), /<img class="g-jc-av" src="a.webp"/);
  assert.match(avatarHtml({ name: '钱掌柜' }), /is-letter">钱</);
  assert.match(bubbleHtml({ who: 'keeper', text: '<b>' }, [{ id: 'keeper', name: '周衡' }]), /g-jc-bub">&lt;b&gt;</);
  assert.match(bubbleHtml({ who: 'me', text: '我常来' }), /is-me/);
  const f = frameHtml({ look: 'face', title: '周衡', when: '替身草人', npc: { name: '周衡' }, tools: [{ kind: 'close', label: '关闭' }] });
  assert.match(f, /data-talk-tool="close"[^>]*>✕</);
  assert.match(f, /g-jc-list[\s\S]*g-jc-typing[\s\S]*g-jc-game/);
});

test('the shelf: ONE 砍价 by the shelf name where a keeper stands, its tap lists what may be haggled; a 买 he cannot pay says 差 X', () => {
  const look = {
    wealth: 50, world: { dir: 'worlds/jiuding' }, words: {},
    place: { shop: { name: '外门库房', keeper: '周衡' }, shelf: [{ id: 'caoren-zha', name: '替身草人', kind: 'treasure', buy: 60 }, { id: 'mend-pill', name: '回春丹', kind: 'pill', buy: 15 }] },
    haggle: { keeper: { name: '周衡' }, marks: { 'caoren-zha': { short: 10, can: true, reach: 'can' }, 'mend-pill': { done: true } } },
  };
  const h = cardHtml({ card: 'item', ids: ['caoren-zha', 'mend-pill'] }, { look, words: WORDS.zh, lang: 'zh', content: {} });
  assert.match(h, /data-do="buy" data-id="caoren-zha" disabled>买 60 · 差 10</);
  assert.equal((h.match(/data-kanjia-pick/g) ?? []).length, 1, 'one 砍价 for the shelf');
  assert.ok(!/data-kanjia="/.test(h), 'no 砍价 by each 买');
  const picking = cardHtml({ card: 'item', ids: ['caoren-zha', 'mend-pill'] }, { look, words: WORDS.zh, lang: 'zh', content: {}, kanjiaPick: true });
  assert.match(picking, /砍哪一件？[\s\S]*data-kanjia="caoren-zha">替身草人 · 60</);
  assert.ok(!/data-kanjia="mend-pill"/.test(picking), 'haggled today: not offered');
  const allDone = { ...look, haggle: { ...look.haggle, marks: { 'mend-pill': { done: true } } } };
  assert.match(cardHtml({ card: 'item', ids: ['caoren-zha', 'mend-pill'] }, { look: allDone, words: WORDS.zh, lang: 'zh', content: {} }), /data-kanjia-pick disabled title="今天只照价">砍价</);
  assert.ok(!/data-kanjia/.test(cardHtml({ card: 'item', ids: ['mend-pill'] }, { look: { ...look, haggle: undefined }, words: WORDS.zh, lang: 'zh', content: {} })), 'no keeper: no 砍价');
});

test('the 主页: a buy he is short of reads 「差 X · 可砍价」; 银月\'s first nudge has words in every register', () => {
  const o = { kind: 'buy', name: '替身草人', does: { cost: 1, card_kind: 'minion', atk: 0, hp: 3, keywords: ['taunt'] }, short: 10, haggle: true };
  assert.match(wayLine(o, 'zh'), /差 10 · 可砍价$/);
  assert.match(wayLine(o, 'en'), /10 short · haggle it down$/);
  assert.ok(!/差/.test(wayLine({ ...o, short: undefined, haggle: undefined }, 'zh')));
  assert.equal(MOMENTS.short.once, 'key', 'once — the first time');
  for (const mode of ['awake', 'asleep']) for (const lang of ['zh', 'en']) {
    assert.ok(poolOf('short', { mode, lang }).length >= 2, `${mode} ${lang}`);
    assert.notDeepEqual(poolOf('short', { mode, lang, variant: 'far' }), poolOf('short', { mode, lang }), `${mode} ${lang} far`);
  }
});
