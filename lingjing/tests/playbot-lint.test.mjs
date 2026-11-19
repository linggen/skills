import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { LINT } from '../tools/playbot/lint.mjs';

// Just the DOM surface used by the lint; no Playwright dependency in check.sh.
const box = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
const defaults = {
  display: 'block', visibility: 'visible', opacity: '1', position: 'static',
  overflowX: 'visible', overflowY: 'visible', pointerEvents: 'auto',
  backgroundColor: 'rgba(0, 0, 0, 0)', backgroundImage: 'none',
  borderTopWidth: '0px', borderTopStyle: 'none', borderTopColor: 'rgb(0, 0, 0)',
};
function lint(paint = [], backdrop = false, extra = []) {
  const html = {};
  const element = (rect, style, textContent = '', children = []) => ({
    rect, style: {}, computed: { ...defaults, ...style }, textContent, children, childNodes: children,
    getClientRects: () => [rect], getBoundingClientRect: () => rect, closest: () => null,
    contains(e) { return e === this; },
  });
  const controls = [element(box(10, 100, 50, 20), {}, 'Above'), element(box(10, 280, 50, 20), {}, 'Below')];
  const marks = paint.map((style, i) => element(box(40 + i * 50, 178, 44, 44), style));
  const rank = element(box(0, 120, 430, 160), {}, '', marks);
  const paper = element(box(0, 0, 430, 932), { backgroundColor: 'rgb(240, 230, 220)' });
  const all = [rank, ...marks, ...controls, ...(backdrop ? [paper] : []), ...extra];
  const body = {
    parentElement: html,
    querySelectorAll: (sel) => sel === '*' || sel === 'body *' ? all : sel.startsWith('button,') ? controls : sel === '[role=tablist]' ? all.filter((e) => e.tablist) : [],
  };
  for (const e of all) e.parentElement = marks.includes(e) ? rank : body;
  for (const e of extra) e.matches = (sel) => e.selectors?.some((x) => sel.split(',').map((y) => y.trim()).includes(x)) ?? false;
  return JSON.parse(runInNewContext(`JSON.stringify((${LINT})())`, {
    innerWidth: 430, innerHeight: 932, NodeFilter: { SHOW_TEXT: 4 },
    getComputedStyle: (e) => e.computed ?? defaults,
    document: {
      body, documentElement: html, querySelectorAll: body.querySelectorAll,
      createTreeWalker: () => ({ nextNode: () => null }),
      elementFromPoint: (_x, y) => controls.find(({ rect }) => y >= rect.top && y < rect.bottom),
    },
  }));
}

const frame = { borderTopWidth: '1px', borderTopStyle: 'solid', borderTopColor: 'rgb(110, 100, 90)' };
const gap = [{ why: 'blank-band', top: 120, height: 160 }];
test('CSS-painted empty rank slots count as drawn without becoming hard-check items', () => {
  const slot = { ...frame, backgroundImage: 'radial-gradient(white, transparent)', pointerEvents: 'none' };
  assert.deepEqual(lint([slot, slot, slot, slot]), { fails: [], warns: [], checked: 2 });
});

test('a textless border, solid fill, or gradient can each break a blank band', () => {
  for (const style of [frame, { backgroundColor: 'rgb(110, 100, 90)' }, { backgroundImage: 'linear-gradient(white, black)' }]) {
    assert.deepEqual(lint([style]).warns, []);
  }
});

test('a truly empty stretch still warns, even on painted paper', () => {
  assert.deepEqual(lint().warns, gap);
  assert.deepEqual(lint([{}, { ...frame, borderTopColor: 'rgba(0, 0, 0, 0)' }, { ...frame, visibility: 'hidden' }], true).warns, gap);
});

// Words cut by an ellipsis or a line clamp (the gate, 2026-11-19: 「还有：…」 at 375): hard, except a clamp on the declared
// summary list, which is a soft `summary-clamp` — the owner's to rule on, never silenced, never hard.
const cut = (style, selectors, scroll = { scrollWidth: 100, clientWidth: 100, scrollHeight: 40, clientHeight: 20 }) => {
  const e = {
    rect: box(10, 400, 100, 20), style: {}, computed: { ...defaults, overflowX: 'hidden', overflowY: 'hidden', ...style }, textContent: '那里灵机正盛，赶到便可收下，过时不候。',
    children: [], childNodes: [], selectors, ...scroll, tagName: 'DIV', dataset: {}, getAttribute: () => 'small tpay', innerText: '那里灵机正盛，赶到便可收下，过时不候。',
    getClientRects() { return [this.rect]; }, getBoundingClientRect() { return this.rect; }, closest: () => null, contains(x) { return x === this; },
  };
  return e;
};
test('words cut by text-overflow ellipsis are a hard ellipsis-cut', () => {
  const r = lint([], false, [cut({ textOverflow: 'ellipsis' }, [], { scrollWidth: 140, clientWidth: 100, scrollHeight: 20, clientHeight: 20 })]);
  assert.equal(r.fails.filter((f) => f.why === 'ellipsis-cut').length, 1);
  assert.equal(r.fails.find((f) => f.why === 'ellipsis-cut').by, 'text-overflow');
});
test('words an ellipsis box holds whole are no finding', () => {
  const r = lint([], false, [cut({ textOverflow: 'ellipsis' }, [], { scrollWidth: 100, clientWidth: 100, scrollHeight: 20, clientHeight: 20 })]);
  assert.deepEqual(r.fails, []);
});
test('a line clamp that hides lines is hard unless it is on the declared summary list', () => {
  const clamp = { webkitLineClamp: '2' };
  const hard = lint([], false, [cut(clamp, [])]);
  assert.equal(hard.fails.filter((f) => f.why === 'ellipsis-cut').length, 1);
  assert.deepEqual(hard.warns.filter((w) => w.why === 'summary-clamp'), []);
  const soft = lint([], false, [cut(clamp, ['#tray .card.task.agenda .tpay'])]);
  assert.deepEqual(soft.fails, []);
  const w = soft.warns.find((x) => x.why === 'summary-clamp');
  assert.ok(w && /事 list/.test(w.reason) && /灵机正盛/.test(w.text), 'a soft summary-clamp with its reason and the text');
});
test('a declared summary clamp that cuts by text-overflow is still hard', () => {
  const r = lint([], false, [cut({ textOverflow: 'ellipsis' }, ['#tray .card.task.agenda .tpay'], { scrollWidth: 140, clientWidth: 100, scrollHeight: 20, clientHeight: 20 })]);
  assert.equal(r.fails.filter((f) => f.why === 'ellipsis-cut').length, 1);
});

// A tab row is read whole (the gate, 2026-11-19 at 375: the bag's 「剧情 13」 read 「剧情 1」): a `role=tablist` that clips and has
// a tab past its edge is a hard tab-cut; a swiped row (no tablist role) and a tab row that wraps are not.
const tabRow = (overflowX, tabs) => {
  const row = { rect: box(14, 650, 347, 36), computed: { ...defaults, overflowX }, textContent: '', tablist: true, tagName: 'DIV', dataset: {}, getAttribute: () => 'ptabs', innerText: '',
    getClientRects() { return [this.rect]; }, getBoundingClientRect() { return this.rect; }, closest: () => null, contains: () => false, childNodes: [] };
  row.children = tabs.map(([left, width]) => ({ rect: box(left, 652, width, 30), computed: { ...defaults }, textContent: '剧情 13', tagName: 'BUTTON', dataset: {}, getAttribute: () => 'ptab', innerText: '剧情 13',
    getClientRects() { return [this.rect]; }, getBoundingClientRect() { return this.rect; }, closest: () => null, contains: () => false, childNodes: [], parentElement: row }));
  row.parentElement = null;
  return row;
};
test('a tab row that clips with a tab past its edge is a hard tab-cut', () => {
  const r = lint([], false, [tabRow('auto', [[16, 60], [320, 63]])]);
  const cut = r.fails.filter((f) => f.why === 'tab-cut');
  assert.equal(cut.length, 1);
  assert.equal(cut[0].shown, 0.65);
});
test('a tab row whose tabs all lie inside it is quiet', () => {
  assert.deepEqual(lint([], false, [tabRow('auto', [[16, 60], [80, 63]])]).fails.filter((f) => f.why === 'tab-cut'), []);
  assert.deepEqual(lint([], false, [tabRow('visible', [[16, 60], [320, 63]])]).fails.filter((f) => f.why === 'tab-cut'), []);
});
