// shared.sha256 is the one truth for the fixtures linggen-mobile copies: it
// must list exactly what is here. See tests/lib/shared-fixtures.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LIST, listText } from './lib/shared-fixtures.mjs';

test('FX shared.sha256 matches the fixtures (regenerate with --write, then copy to linggen-mobile)', () => {
  assert.equal(readFileSync(LIST, 'utf8'), listText());
});
