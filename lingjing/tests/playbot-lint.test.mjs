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
function lint(paint = [], backdrop = false) {
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
  const all = [rank, ...marks, ...controls, ...(backdrop ? [paper] : [])];
  const body = {
    parentElement: html,
    querySelectorAll: (sel) => sel === '*' || sel === 'body *' ? all : sel.startsWith('button,') ? controls : [],
  };
  for (const e of all) e.parentElement = marks.includes(e) ? rank : body;
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
