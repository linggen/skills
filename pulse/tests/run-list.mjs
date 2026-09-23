#!/usr/bin/env node
// run-list.mjs — a settings list box's text into entries (scripts/list-text.js).
//
//   node tests/run-list.mjs

import { splitList } from '../scripts/list-text.js';

let pass = 0, fail = 0;
function t(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name} ${detail}`); }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const check = (name, text, want) => { const got = splitList(text); t(name, eq(got, want), JSON.stringify(got)); };

check('a plain list: trimmed, blanks and repeats dropped', ' agent, agent memory,, native AI, agent ,',
      ['agent', 'agent memory', 'native AI']);
check('no spaces after the commas still splits a plain list', 'LocalLLaMA,selfhosted', ['LocalLLaMA', 'selfhosted']);
check('new lines separate too', 'a\nb, c', ['a', 'b', 'c']);
check('a comma inside a feed URL stays in it', 'https://hnrss.org/newest?q=a,b, https://example.com/rss.xml',
      ['https://hnrss.org/newest?q=a,b', 'https://example.com/rss.xml']);
check('two URLs with no space between are two entries', 'https://a.com/feed,https://b.com/feed',
      ['https://a.com/feed', 'https://b.com/feed']);
check('a URL list saved and shown again reads back the same',
      ['https://x.com/q?a=1,2', 'https://y.com/'].join(', '), ['https://x.com/q?a=1,2', 'https://y.com/']);
check('empty text is no entries', '', []);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
