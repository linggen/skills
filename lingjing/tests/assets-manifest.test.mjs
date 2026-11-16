// The declared asset manifest must match the placed art packs and the files on disk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildManifest, manifestText, readPacks } from '../../scripts/build-assets-manifest.mjs';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(SKILL, 'assets.json');
const PACKS = 'node tools/art-packs.mjs --json --placed';
const STALE = 'lingjing/assets.json is stale — rebuild it with: node scripts/build-assets-manifest.mjs lingjing --packs "node tools/art-packs.mjs --json --placed" (then scripts/publish-assets.mjs shows what must be uploaded)';

test('the manifest is exactly what the builder produces from placed art', () => {
  const actual = fs.readFileSync(MANIFEST);
  const expected = Buffer.from(manifestText(buildManifest(SKILL, readPacks(PACKS, SKILL))));
  assert.ok(actual.equals(expected), STALE);
});

test('the manifest lists only placed non-core files that exist in the skill', () => {
  const { files } = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  for (const f of files) {
    assert.notEqual(f.pack, 'core', f.path);
    assert.notEqual(f.pack, 'unplaced', f.path);
    assert.ok(fs.statSync(path.join(SKILL, f.path)).isFile(), f.path);
  }
});

test('the app frontmatter declares the asset manifest', () => {
  const text = fs.readFileSync(path.join(SKILL, 'SKILL.md'), 'utf8');
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(frontmatter, 'SKILL.md has frontmatter');
  assert.match(frontmatter[1], /^app:\r?\n(?:  [^\n]*\r?\n)*  assets: assets\.json\s*$/m);
});
