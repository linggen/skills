// The page's pure helpers: the mention policy it hands the drafting model,
// and the product digest it reads off disk. Both shape what the model is
// told, so a quiet regression here changes every draft.
//
//   node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { MENTION_DEFAULTS, buildMentionBlock, effectiveRegister, normalizeMention, plainDomain } from '../scripts/mention-policy.js';
import { buildDigestCommand, cleanMarkdown, normalizeRepoPaths, parseDigestOutput, renderDigestBlock, trimToChars } from '../scripts/product-digest.js';

test('a domain is kept as plain text, never a link', () => {
  assert.equal(plainDomain(' https://www.example.com/ '), 'example.com');
  assert.equal(plainDomain(undefined), '');
});

test('a saved policy is read back clean: unknown lanes and registers are dropped', () => {
  const p = normalizeMention({ product: ' Acme ', domain: 'http://acme.dev/', default: 'shout', sites: { x: 'implicit', myspace: 'disclosed', reddit: 'loud' } });
  assert.deepEqual(p, { product: 'Acme', domain: 'acme.dev', default: MENTION_DEFAULTS.default, sites: { x: 'implicit' } });
  assert.equal(effectiveRegister('x', p), 'implicit');
  assert.equal(effectiveRegister('reddit', p), MENTION_DEFAULTS.default);
  assert.deepEqual(normalizeMention(null).sites, {});
});

test('no product configured: every draft is implicit', () => {
  const block = buildMentionBlock(normalizeMention({}));
  assert.match(block, /no product is configured/);
  assert.match(block, /never name a product/);
});

test('a product configured: the block names it and its site as plain text', () => {
  const block = buildMentionBlock(normalizeMention({ product: 'Acme', domain: 'acme.dev' }));
  assert.match(block, /Product: Acme\./);
  assert.match(block, /"acme\.dev"/);
});

test('the workspace is the one root repos are read from', () => {
  assert.deepEqual(normalizeRepoPaths({ workspace_path: ' ~/code/ ' }), ['~/code']);
  assert.deepEqual(normalizeRepoPaths({}), []);
  assert.equal(buildDigestCommand([]), '');
});

test('the digest command reads a real repo, and its output parses back', () => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-digest-'));
  try {
    const repo = path.join(ws, 'acme');
    fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'README.md'), '# Acme\n\nAcme does one thing well.\n');
    fs.writeFileSync(path.join(repo, 'CHANGELOG.md'), '# Changelog\n\n## 1.1\n- faster\n\n## 1.0\n- first\n');
    const cmd = buildDigestCommand([ws]);
    assert.ok(!cmd.endsWith('\n'), '/api/bash refuses a command ending in a newline');
    const r = spawnSync('bash', ['-c', cmd], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const [only, ...rest] = parseDigestOutput(r.stdout);
    assert.equal(rest.length, 0);
    assert.equal(only.repo, 'acme');
    assert.match(only.readme, /one thing well/);
    assert.match(only.changelog, /## 1\.1/);
    assert.doesNotMatch(only.changelog, /1\.0/, 'only the latest entry');
    const block = renderDigestBlock([only]);
    assert.match(block, /^PRODUCT DIGEST/);
    assert.match(block, /### acme/);
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
});

test('README chrome is stripped and long text is cut on a line', () => {
  const md = '<p align="center"><img src="x.png"></p>\n[![ci](b.svg)](c)\n---\nReal prose.\n<!-- note -->';
  assert.equal(cleanMarkdown(md), 'Real prose.');
  assert.equal(trimToChars('short', 10), 'short');
  const cut = trimToChars('line one here\nline two here', 20);
  assert.equal(cut, 'line one here…');
  assert.equal([...trimToChars('汉'.repeat(30), 10)].length, 11, 'counted in characters, not bytes');
  assert.equal(renderDigestBlock([{ repo: 'empty', readme: '', changelog: '' }]), '');
});
