// 银月 is found, not given (Hanli, 2026-09-25): before the player reaches 结丹
// and finds her, she is not in Lingjing at all — no call to her, no ask bar,
// and `@银月` gets 「查无此人。」 from the page with no turn. And only Ling's
// stream is the game's turn; the stage loads her body the relay's way.
//
// The page (lingjing.js) is a DOM module; its small functions are read from
// the source and run against stubs, so the test runs the page's own code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createVoice, MOMENTS } from '../scripts/voice.js';
import { WORDS } from '../scripts/cards.js';

const SRC = fs.readFileSync(new URL('../scripts/lingjing.js', import.meta.url), 'utf8');

/// The source of `function name(…) {…}` in the page, braces matched.
function fnSource(name) {
  const at = SRC.indexOf(`function ${name}(`);
  assert.ok(at >= 0, `lingjing.js has function ${name}`);
  return SRC.slice(at, closeOf(SRC.indexOf('{', SRC.indexOf(')', at)), SRC) + 1);
}
function closeOf(open, s) {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}' && --depth === 0) return i;
  }
  throw new Error('unbalanced');
}
/// Runs page code with `scope` standing in for the page's module scope.
function inPage(code, scope) {
  return new Function('scope', `with (scope) { ${code} }`)(scope);
}
const HER_HERE = /const herHere = \(\) => [^;]+;/.exec(SRC)?.[0];

test('herHere is true only once the save says she joined', () => {
  assert.ok(HER_HERE, 'one herHere() helper');
  const here = (look) => inPage(`${HER_HERE} return herHere();`, { look });
  assert.equal(here(null), false);
  assert.equal(here({ companion: null }), false);
  assert.equal(here({ companion: {} }), false, 'a companion without joined is not her');
  assert.equal(here({ companion: { name: '银月', joined: '2026-09-18' } }), true);
});

test('before she joins, nothing reaches her — rise, chapter, spent and every other moment', () => {
  const calls = [];
  const fetches = [];
  const scope = {
    look: { companion: null, name: '清玄' },
    voice: { moment: (id) => { calls.push(id); return { said: Promise.resolve(true) }; } },
    fetch: (...a) => { fetches.push(a); return Promise.resolve({ ok: true }); },
    chat: { getSessionId: () => 's1' }, lang: () => 'zh', SKILL: 'lingjing', JSON, console, Promise,
  };
  const page = `${HER_HERE} ${fnSource('askHer')} ${fnSource('tellYinyue')} ${fnSource('postMoment')}
    return { askHer, tellYinyue, postMoment };`;
  const f = inPage(page, scope);
  for (const id of ['rise', 'chapter', 'spent', 'fate', 'reading', 'greet', 'emerge', 'seclude']) f.askHer(id, 'zh', 'en', 'happy');
  for (const id of Object.keys(MOMENTS)) f.tellYinyue(id, 'zh', 'en');
  f.postMoment({ zh: 'x', en: 'x' }, {});
  assert.deepEqual(calls, [], 'no moment to her voice');
  assert.deepEqual(fetches, [], 'no POST to /api/yinyue/event');
  // Once she walks with the player: she hears it, and the POST names this chat.
  scope.look = { companion: { name: '银月', joined: '2026-09-18' } };
  f.askHer('rise', 'zh', 'en', 'happy');
  f.tellYinyue('won', 'zh', 'en');
  assert.deepEqual(calls, ['rise', 'won']);
  f.postMoment({ zh: 'x', en: 'x' }, { converse: true });
  assert.equal(fetches.length, 1);
  const body = JSON.parse(fetches[0][1].body);
  assert.equal(body.session, 's1');
  assert.equal(body.converse, true);
});

test('every call to her in the page goes through askHer/tellYinyue/postMoment, each gated', () => {
  // No direct POST elsewhere, and each of the three opens on herHere().
  assert.equal(SRC.match(/\/api\/yinyue\/event'/g).length, 1, 'one POST site');
  for (const name of ['askHer', 'tellYinyue', 'postMoment']) assert.match(fnSource(name), /if \(!herHere\(\)\) return/, `${name} is gated`);
  assert.doesNotMatch(SRC, /look\??\.companion\)/, 'no Boolean(look.companion) presence checks left');
});

test('the voice sends nothing while she is absent, big or asked alike', () => {
  const posts = [];
  const seen = { fighting: false, present: false };
  let t = 1_000_000;
  const v = createVoice({ now: () => t, post: (id) => { posts.push(id); return true; }, sees: () => seen });
  for (const id of Object.keys(MOMENTS)) assert.equal(v.moment(id, { zh: 'x', en: 'x' }).verdict, 'absent', id);
  t += 3_600_000;
  assert.equal(v.tick({ idleFact: 'q' }), null);
  assert.deepEqual(posts, []);
  seen.present = true;
  assert.equal(v.moment('rise', { zh: 'x', en: 'x' }).verdict, 'sent');
  assert.deepEqual(posts, ['rise']);
});

test('agent_absent: one plain line in the page note, nothing sent', () => {
  assert.equal(WORDS.zh.noOne, '查无此人。');
  assert.equal(WORDS.en.noOne, 'No one answers.');
  const shown = [];
  const sent = [];
  const scope = { show: (p) => shown.push(p), words: () => WORDS.zh, deliver: (...a) => sent.push(a), say: (...a) => sent.push(a), chat: { send: (...a) => sent.push(a), sendHidden: (...a) => sent.push(a) } };
  inPage(`${fnSource('noOne')} noOne();`, scope);
  assert.deepEqual(shown, [{ doNote: '查无此人。' }]);
  assert.deepEqual(sent, []);
  assert.match(SRC, /if \(event === 'agent_absent'\) noOne\(\);/, 'the chat event reaches it');
});

/// The mount's onStreamEnd, run with stubs.
function streamEnd() {
  const at = SRC.indexOf('onStreamEnd: (');
  const src = SRC.slice(at + 'onStreamEnd: '.length, closeOf(SRC.indexOf('{', at), SRC) + 1);
  const did = [];
  const scope = {
    did, streaming: true, recapSent: 'x', veil: { turns: 0 }, look: {},
    turnEnded: () => did.push('turnEnded'), recapTold: () => did.push('recapTold'), tellingLanded: () => did.push('tellingLanded'),
    voice: { heard: () => did.push('heard') }, refresh: () => { did.push('refresh'); return Promise.resolve(); },
    cheer() {}, nudgeTrial() {},
  };
  return { fn: inPage(`return (${src});`, scope), scope };
}

test("onStreamEnd: only Ling's stream ends the turn; hers is only a line heard", () => {
  const her = streamEnd();
  her.fn('她的话', { agent: 'yinyue', own: false });
  assert.deepEqual(her.scope.did, ['heard']);
  assert.equal(her.scope.veil.turns, 0, 'the veil does not count her');
  assert.equal(her.scope.streaming, true, 'the turn is still on');
  const ling = streamEnd();
  ling.fn('...', { agent: 'ling', own: true });
  assert.deepEqual(ling.scope.did, ['tellingLanded', 'turnEnded', 'heard', 'recapTold', 'refresh']);
  assert.equal(ling.scope.veil.turns, 1);
  // A bridge that names no agent (before linggen f764ef9) streams Ling alone.
  const old = streamEnd();
  old.fn('...');
  assert.ok(old.scope.did.includes('turnEnded'));
  assert.match(SRC, /onStreamToken: \(_text, info\) => \{ if \(info\?\.own !== false\) \{ streaming = true; if \(view\.telling\) view\.telling\.heard = true; \} \}/);
});

/// The mount's onContentBlock over the page's own, run with stubs.
function contentBlock() {
  const at = SRC.indexOf('onContentBlock: (');
  const src = SRC.slice(at + 'onContentBlock: '.length, closeOf(SRC.indexOf('{', at), SRC) + 1);
  const did = [];
  const scope = {
    did, streaming: false, contentStale: false, WRITERS: new Set(), JSON, console,
    view: { casting: true },
    keep: (p) => did.push(['keep', p]), show: (p) => did.push(['show', p]),
    waitingOnPlayer: () => did.push('waiting'), render: () => did.push('render'),
    refreshSoon: () => did.push('refresh'),
  };
  const page = inPage(`${fnSource('askedOptions')} ${fnSource('onContentBlock')} return onContentBlock;`, scope);
  const fn = inPage(`return (${src});`, { ...scope, onContentBlock: page, get streaming() { return scope.streaming; }, set streaming(v) { scope.streaming = v; } });
  return { fn, scope };
}

test("onContentBlock: only Ling's blocks move the page; hers open nothing", () => {
  const ask = { phase: 'start', tool: 'AskUser', args: JSON.stringify({ questions: [{ options: [{ label: '去' }] }] }) };
  const showMap = { phase: 'start', tool: 'Show', args: JSON.stringify({ cards: [{ card: 'map' }] }) };
  const her = contentBlock();
  her.fn(ask, { agent: 'yinyue', own: false });
  her.fn(showMap, { agent: 'yinyue', own: false });
  assert.deepEqual(her.scope.did, [], 'no card, no marked options, the coins untouched');
  assert.equal(her.scope.streaming, false, 'her block is no turn');
  const ling = contentBlock();
  ling.fn(ask, { agent: 'ling', own: true });
  ling.fn(showMap, { agent: 'ling', own: true });
  assert.equal(ling.scope.streaming, true);
  assert.deepEqual(ling.scope.did[0], ['keep', { casting: false }], 'a question lands the coins');
  assert.deepEqual([...ling.scope.did[1][1].asked], ['去'], 'his choices marked');
  assert.ok(ling.scope.did.some((d) => d[0] === 'show' && d[1].mapView === 'province'), 'the map opens');
  // A bridge that names no agent (before linggen 4951f50) hands Ling's alone.
  const old = contentBlock();
  old.fn(showMap);
  assert.equal(old.scope.streaming, true);
  assert.ok(old.scope.did.some((d) => d[0] === 'show'));
});

test("the game page never loads her 3D body — she is the story's fox (his, 2026-09-29)", () => {
  assert.doesNotMatch(SRC, /pet\.src|petStageUrl|pet=1&stage=1/);
});
