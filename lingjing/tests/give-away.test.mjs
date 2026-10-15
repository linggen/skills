// A hand-in whose giver is elsewhere (live, 2026-10-15: 「阿禾的利息」 under 可交 with a 「交给阿禾」
// that was no button, inside the 秘境 with 阿禾 at 坊市): it stays 已接, and its one tap is the walk
// there — or, where he cannot leave yet, a dimmed 「回到坊市再交」.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WORDS, bookPopHtml } from '../scripts/cards.js';

const row = { id: 'xu-ahe-lixi', title: '阿禾的利息', who: '阿禾', tag: 'errand', need: [{ kind: 'carry', have: 2, n: 2 }, { kind: 'visit', have: 1, n: 1 }], ready: true,
  away: { who: '阿禾' }, where: { id: 'fangshi', name: '沉鼎山下 · 坊市' } };
const pop = (look) => bookPopHtml({ look: { book: [row], place: { id: 'shimen' }, ...look }, words: WORDS.zh, lang: 'zh' });

test('done, its giver elsewhere: under 已接, not 可交, and the tap walks there', () => {
  const html = pop({ director: { corridor: false } });
  assert.doesNotMatch(html, /可交 · /);
  assert.match(html, /已接 · 1/);
  assert.match(html, /<button class="act go" data-go="fangshi">去沉鼎山下 · 坊市<\/button>/);
  assert.doesNotMatch(html, /交给阿禾/, 'no chip dressed as a button');
});

test('where he cannot leave yet (the 秘境, a key beat): a dimmed line says where, no tap', () => {
  const html = pop({ director: { corridor: true } });
  assert.match(html, /<span class="chip giveto waits" title="先把眼前的事做完">回到沉鼎山下 · 坊市再交<\/span>/);
  assert.doesNotMatch(html, /data-go="fangshi"/);
});

test('every 去X in the 事 book is dimmed where he cannot leave — no tap that only brings a refusal', () => {
  const far = { id: 'guan-houshan-yezhu', title: '后山的野猪', tag: 'errand', need: [{ kind: 'subdue', have: 0, n: 1 }], ready: false, where: { id: 'houshan', name: '沉鼎山 · 后山崖顶' } };
  const html = bookPopHtml({ look: { book: [far], place: { id: 'shimen' }, director: { corridor: true }, work: { place: { id: 'waimen', name: '沉鼎观 · 外门' }, here: false, titles: ['修屋顶'] } }, words: WORDS.zh, lang: 'zh' });
  assert.doesNotMatch(html, /data-go=/);
  assert.match(html, /<span class="chip go waits" title="先把眼前的事做完">去沉鼎山 · 后山崖顶<\/span>/);
  assert.match(html, /<span class="chip go waits" title="先把眼前的事做完">去沉鼎观 · 外门<\/span>/);
  const open = bookPopHtml({ look: { book: [far], place: { id: 'shimen' }, director: { corridor: false } }, words: WORDS.zh, lang: 'zh' });
  assert.match(open, /data-go="houshan"/);
});
