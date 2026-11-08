import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../scripts/story.css', import.meta.url), 'utf8');

test('narrow header reserves portrait room and wraps its location text', () => {
  const narrow = css.slice(css.indexOf('@container scene (max-width: 640px)'));
  assert.match(narrow, /\.topbar \.titlerow\s*\{[^}]*min-width\s*:\s*0/);
  assert.match(narrow, /\.topbar \.headcards\s*\{[^}]*flex\s*:\s*none/);
  const text = narrow.match(/\.topbar \.titlerow \.huiline,\s*\.topbar \.titlerow \.place\s*\{([^}]*)\}/)?.[1];
  assert.ok(text, 'missing narrow header text rule');
  assert.match(text, /min-width\s*:\s*0/);
  assert.match(text, /white-space\s*:\s*normal/);
  assert.match(text, /overflow-wrap\s*:\s*anywhere/);
  assert.match(text, /overflow\s*:\s*visible/);
});
