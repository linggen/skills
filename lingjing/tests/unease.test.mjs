// Her price, showing (redesign-v2 § 六 item 3; Hanli, 2026-09-25: 小异样太难看出来,
// 给大异样). From the fourth cauldron to the eighth, each chapter ended shows it
// on her, big: the stage plays an animation on her, she hears the facts and
// says them in her own words, aloud; Ling gets one sentence of what she DOES.
// Once, only once she walks with the player, and never a word written for her.
import test from 'node:test';
import assert from 'node:assert/strict';
import { UNEASE_SHOWS, lint, loadContent } from '../scripts/content.mjs';
import { newState } from '../scripts/state.mjs';
import { forLing, look, resolve } from '../scripts/rules.mjs';
import { uneaseAt } from '../scripts/rules/story.mjs';
import { flagsOf, nodeMoment } from '../scripts/voice.js';
import { SHOWS, raiseUnease, uneasePlan } from '../scripts/unease.js';

const content = loadContent();
const NOW = new Date('2026-09-11T12:00:00');
const ctx = (now = NOW) => ({ now, quests: [] });
const CH = ['01-ji', '02-yan', '03-qing', '04-xu', '05-yang', '06-jing', '07-liang', '08-yong', '09-yu'];
const UNEASY = ['04-xu', '05-yang', '06-jing', '07-liang', '08-yong'];
const HER = { companion: { joined: '2026-09-01' } };
const scenesOf = id => Object.keys(content.chapters[id].scenes);
const nextOf = (chapter, id) => content.chapters[chapter].scenes[id].exits.find(e => e.next)?.next;
const roadOf = chapter => {
  const out = [];
  for (let id = content.chapters[chapter].first_scene; id && !out.includes(id); id = nextOf(chapter, id)) out.push(id);
  return out;
};
/* A save at the last scene of `chapter`, every chapter before it ended. */
function atEnd(chapter, extra = {}) {
  const i = CH.indexOf(chapter), road = roadOf(chapter);
  const before = ['00-prologue', ...CH.slice(0, i)];
  const scene = content.chapters[chapter].scenes[road.at(-1)];
  return { ...newState(content, 'zh', NOW), tier: 'nascent', stamina: 100, chapter, scene: scene.id, place: scene.at, ended: before, done_scenes: [...before.flatMap(scenesOf), ...road.slice(0, -1)], ...extra };
}
const endChapter = s => {
  const end = content.chapters[s.chapter].scenes[s.scene];
  const out = resolve(s, content, ctx(), { exit: end.exits.find(e => e.ends).id });
  assert.equal(out.result.ok, true, JSON.stringify(out.result));
  return out;
};

/* ── The data: facts per chapter, an animation the stage knows ── */

test('lint: chapters 4 to 8 each carry unease facts in zh and en and a show the stage plays', () => {
  assert.deepEqual(lint(content).filter(p => p.startsWith('lore')), []);
  const withIt = content.lore.thread.filter(e => e.unease).map(e => e.chapter);
  assert.deepEqual(withIt, UNEASY);
  for (const e of content.lore.thread.filter(x => x.unease)) {
    for (const k of ['fact', 'ling']) for (const l of ['zh', 'en']) assert.ok(e.unease[k][l]?.length > 10, `${e.chapter} ${k}.${l}`);
    assert.ok(UNEASE_SHOWS.includes(e.unease.show), e.chapter);
  }
  // Each chapter its own picture, escalating — never the same twice.
  assert.equal(new Set(withIt.map(c => content.lore.thread.find(e => e.chapter === c).unease.show)).size, UNEASY.length);
  // The page plays exactly the shows the lint allows.
  assert.deepEqual(Object.keys(SHOWS).sort(), [...UNEASE_SHOWS].sort());
});

test('lint: a missing unease between realized and told, or a show the stage lacks, is refused', () => {
  const thread = content.lore.thread.map(e => (e.chapter === '05-yang' ? { ...e, unease: undefined } : e.chapter === '06-jing' ? { ...e, unease: { ...e.unease, show: 'sparkle' } } : e));
  const bad = lint({ ...content, lore: { ...content.lore, thread } }).filter(p => p.includes('unease'));
  assert.ok(bad.some(p => p.includes('05-yang') && p.includes('missing')), bad.join('\n'));
  assert.ok(bad.some(p => p.includes('06-jing') && p.includes('sparkle')), bad.join('\n'));
});

test('no words for her: the facts never quote a line of hers, and nothing is said before it is told', () => {
  const secretSaid = content.lore.secret.text.zh;
  for (const e of content.lore.thread.filter(x => x.unease)) {
    assert.equal(/[「“]/.test(e.unease.fact.zh.replace('「{name}」', '')), false, `${e.chapter}: a quoted line in her facts`);
    assert.equal(e.unease.ling.zh.includes('：「'), false, `${e.chapter}: Ling's sentence gives her words`);
    assert.equal(e.unease.fact.zh.includes(secretSaid), false, `${e.chapter}: her own line`);
    // Before 雍, the reason stays hers: no "every cauldron takes a reflection".
    if (e.chapter < content.lore.secret.told) assert.equal(/影子就被收回|九鼎聚齐/.test(e.unease.fact.zh), false, e.chapter);
  }
});

/* ── The rules: once, at the right chapter end, only once she walks along ── */

test('each chapter from 4 to 8 ends with its unease on the node, marked on the save', () => {
  for (const chapter of UNEASY) {
    const out = endChapter(atEnd(chapter, HER));
    const u = out.result.node.unease, want = content.lore.thread.find(e => e.chapter === chapter).unease;
    assert.equal(u.chapter, chapter);
    assert.equal(u.show, want.show);
    assert.equal(u.ling, want.ling.zh);
    assert.ok(u.fact.startsWith('刚才'), u.fact);
    assert.deepEqual(out.result.unease, u, 'the answer carries it for Ling');
    assert.ok(out.state.unease.includes(chapter), 'marked seen');
    assert.equal(look(out.state, content, ctx()).story_node.unease.show, want.show, 'the page sees it on Look');
  }
});

test('the 道号 she loses in 荆 is the player\'s own; with none yet, a plain word stands in', () => {
  assert.ok(endChapter(atEnd('06-jing', { ...HER, name: '青玄' })).result.unease.fact.includes('「青玄」'));
  const none = endChapter(atEnd('06-jing', { ...HER, name: '' })).result.unease.fact;
  assert.equal(none.includes('{name}'), false);
  assert.equal(none.includes('「」'), false);
});

test('before 徐, after 雍, and before she joins: nothing', () => {
  for (const chapter of ['01-ji', '02-yan', '03-qing', '09-yu']) assert.equal(endChapter(atEnd(chapter, HER)).result.node.unease, undefined, chapter);
  for (const chapter of UNEASY) {
    const out = endChapter(atEnd(chapter));
    assert.equal(out.result.node.unease, undefined, `${chapter}: not joined`);
    assert.equal(out.result.unease, undefined);
    assert.equal(out.state.unease, undefined);
  }
});

test('never sent twice: a chapter already shown gives nothing more', () => {
  const s = atEnd('04-xu', { ...HER, unease: ['04-xu'] });
  const out = endChapter(s);
  assert.equal(out.result.node.unease, undefined);
  assert.deepEqual(out.state.unease, ['04-xu']);
  const fresh = { ...atEnd('05-yang', HER) };
  assert.ok(uneaseAt(content, fresh, '05-yang'));
  assert.equal(uneaseAt(content, fresh, '05-yang'), null, 'marked: the second ask is empty');
});

test('Ling gets only what she does — never the facts that are hers to say', () => {
  const out = endChapter(atEnd('07-liang', HER));
  const ling = forLing(out.result);
  assert.deepEqual(ling.unease, { ling: out.result.unease.ling });
  assert.deepEqual(ling.node.unease, { ling: out.result.unease.ling });
  assert.equal(JSON.stringify(ling).includes(out.result.unease.fact), false);
});

/* ── The page: the moment she hears, the picture, motion reduced ── */

test('her moment: the unease leads the chapter\'s facts, big and at once, hers alone', () => {
  const n = endChapter(atEnd('04-xu', HER)).result.node;
  const m = nodeMoment(n);
  assert.equal(m.id, 'unease');
  assert.deepEqual(flagsOf('unease'), { big: true, now: true }, 'no converse: Ling does not answer her price');
  assert.ok(m.zh.startsWith(n.unease.fact), m.zh);
  assert.ok(m.zh.includes('用你自己的话'), 'she says it her own way');
  assert.ok(m.zh.includes('第4口鼎'), 'the chapter\'s own facts follow');
  assert.equal(m.mood, 'sad');
  // A node without unease is told as before.
  assert.equal(nodeMoment({ ...n, unease: undefined }).id, 'cauldron');
});

test('the picture: each show its class and layers, 2–4 s; motion reduced is the glow', () => {
  for (const show of UNEASE_SHOWS) {
    const p = uneasePlan({ show });
    assert.deepEqual(p.cls, ['unease', `unease-${show}`]);
    assert.ok(p.ms >= 2000 && p.ms <= 4000, `${show}: ${p.ms}`);
    assert.ok(p.layers.length >= 1);
  }
  assert.deepEqual(uneasePlan({ show: 'dissolve' }, true), { cls: ['unease', 'unease-still'], layers: ['glow'], ms: 3000, still: true });
  assert.equal(uneasePlan({ show: 'nope' }).still, true, 'an unknown show is never lost — the glow');
});

/* A document just big enough for the stage. */
function fakeDoc() {
  const mk = (id, cls = '') => {
    const el = {
      id, className: cls, hidden: false, children: [], style: { props: {}, setProperty(k, v) { this.props[k] = v; }, removeProperty(k) { delete this.props[k]; } },
      dataset: {}, attrs: {}, innerHTML: '',
      classList: { set: new Set(), add(...c) { c.forEach(x => this.set.add(x)); }, remove(...c) { c.forEach(x => this.set.delete(x)); }, has(c) { return this.set.has(c); } },
      setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); c.parent = this; return c; },
      remove() { if (this.parent) this.parent.children = this.parent.children.filter(x => x !== this); },
      querySelector(sel) { return sel === '.body' ? body : null; },
    };
    return el;
  };
  const view = mk('view'), stage = mk('stage'), body = mk(null, 'body');
  stage.children.push(body);
  const head = mk('head');
  const doc = {
    head, view, stage, body,
    getElementById: id => ({ view, stage })[id] ?? null,
    querySelector: sel => (sel === 'link[data-unease]' ? head.children.find(c => c.dataset.unease) ?? null : null),
    createElement: () => mk(null),
  };
  return doc;
}

test('raised on the page: her figure takes the class, the layers are drawn, she is woken as it starts, then it clears', async () => {
  const doc = fakeDoc();
  const said = [];
  const going = raiseUnease({ show: 'mist' }, () => said.push(doc.stage.classList.has('unease-mist')), { doc });
  await new Promise(r => setTimeout(r, 20));
  assert.deepEqual(said, [true], 'woken with the picture on the stage');
  assert.ok(doc.view.children.some(c => c.className.includes('unease-dim-layer')), 'the stage darkens');
  assert.ok(doc.body.children.some(c => c.className.includes('unease-mist-layer')), 'the mist is on her');
  assert.equal(doc.stage.style.props['--unease-ms'], '3800ms');
  assert.equal(doc.head.children.length, 1, 'the stylesheet loaded once');
  assert.equal(await going, true);
  assert.equal(doc.stage.classList.has('unease'), false, 'cleared');
  assert.equal(doc.view.children.length, 0);
});

test('motion reduced: only the glow; the stage hidden: she still hears it', async () => {
  const doc = fakeDoc();
  const going = raiseUnease({ show: 'fade' }, () => {}, { doc, still: true });
  await new Promise(r => setTimeout(r, 20));
  assert.ok(doc.stage.classList.has('unease-still'));
  assert.deepEqual(doc.body.children.filter(c => c.className.includes('unease-')).map(c => c.className), ['unease-layer unease-glow-layer']);
  assert.equal(doc.view.children.length, 0, 'nothing darkens, nothing moves');
  await going;
  const hid = fakeDoc();
  hid.stage.hidden = true;
  let heard = 0;
  assert.equal(await raiseUnease({ show: 'dissolve' }, () => heard++, { doc: hid }), false);
  assert.equal(heard, 1);
});
