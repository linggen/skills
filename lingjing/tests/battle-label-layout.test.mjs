import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../scripts/battle.css', import.meta.url), 'utf8');
const partyCss = fs.readFileSync(new URL('../scripts/battle-party.css', import.meta.url), 'utf8');

test('battle wait, party life and rank rule labels are not ellipsized', () => {
  for (const [source, selector] of [
    [css, '.bact.end.wait .bsealface b'],
    [css, '.bminion small'],
    [partyCss, '.ballyhp b'],
  ]) {
    const rules = [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter(([, selectors]) => selectors.trim().split(/\s*,\s*/).includes(selector));
    assert.ok(rules.length, `missing ${selector}`);
    for (const [, , declarations] of rules) assert.doesNotMatch(declarations, /text-overflow\s*:\s*ellipsis/);
  }
  assert.match(css, /\.battle \.ballyhp\s*\{[^}]*margin-right\s*:/);
});
