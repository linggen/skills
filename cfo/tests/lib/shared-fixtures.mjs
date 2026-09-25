// The fixtures linggen-mobile keeps copies of (test/fixtures/cfo/…, same
// relative paths) — this repo is their source. shared.sha256 lists each with
// its checksum; the mobile repo holds the same list and fails its CI when its
// copies or its list differ from this one (test/cfo/fixture_parity_test.dart,
// which checks this repo out). Change a fixture here → `node
// cfo/tests/lib/shared-fixtures.mjs --write`, then copy the files and the list
// into linggen-mobile.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
export const LIST = join(ROOT, 'shared.sha256');

/// Relative paths of every shared fixture, sorted.
export function sharedFiles() {
  const pdf = readdirSync(join(ROOT, 'pdf')).filter((f) => /\.(pdf|truth\.json)$/.test(f)).map((f) => `pdf/${f}`);
  return [...pdf, 'compose/cases.json', 'currency/cases.json'].sort();
}

/// The list as `shasum -a 256` writes it: "<hex>  <path>" per line.
export function listText() {
  return sharedFiles().map((f) => `${createHash('sha256').update(readFileSync(join(ROOT, f))).digest('hex')}  ${f}`).join('\n') + '\n';
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes('--write')) {
  writeFileSync(LIST, listText());
  console.log(`wrote ${LIST}`);
}
