#!/usr/bin/env node
// tools/further.mjs — SKILL.md's `cloud.further` (which of two saves is further on: skill-spec § Cloud `further`),
// read as the engine reads it, with each `rank`'s `order` resolved to its list of ids. The phone ships the result
// (linggen-mobile tool/lingjing_assets.sh → assets/lingjing/lingjing-sync.json) and decides by it exactly as the
// Mac's engine does — the rule is declared once, here, never retyped in Dart or Rust.
//
// Usage: node tools/further.mjs [--out <file>]   (prints the JSON without --out)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KINDS = ['count', 'rank', 'number', 'time'];

/** The `further:` value under `cloud:` — a JSON flow node (valid YAML), from the line after the key to the next key. */
export function readFurtherText(md) {
  const lines = md.split('\n');
  const end = lines.indexOf('---', 1);
  const fm = lines.slice(1, end);
  const cloud = fm.findIndex((l) => /^cloud:\s*$/.test(l));
  if (cloud < 0) return null;
  const at = fm.findIndex((l, i) => i > cloud && /^ {2}further:\s*$/.test(l));
  if (at < 0) return null;
  const body = [];
  for (const l of fm.slice(at + 1)) {
    if (/^ {0,2}\S/.test(l)) break; // the next key of cloud:, or of the frontmatter
    body.push(l);
  }
  return body.join('\n');
}

/** The `ignore:` value under `cloud:` — a JSON list (valid YAML flow), on one line or over several indented ones. */
export function readIgnore(md) {
  const lines = md.split('\n');
  const end = lines.indexOf('---', 1);
  const fm = lines.slice(1, end);
  const cloud = fm.findIndex((l) => /^cloud:\s*$/.test(l));
  if (cloud < 0) return null;
  const at = fm.findIndex((l, i) => i > cloud && /^ {2}ignore:/.test(l));
  if (at < 0) return null;
  const body = [fm[at].replace(/^ {2}ignore:\s*/, '')];
  for (const l of fm.slice(at + 1)) {
    if (/^ {0,2}\S/.test(l)) break; // the next key of cloud:, a comment, or of the frontmatter
    body.push(l);
  }
  return body.join('\n').trim();
}

/** What is wrong with a `cloud.ignore` list (empty when the engine reads it whole): the keys are strings, each once. */
export function ignoreProblems(ignore, rule) {
  if (ignore === undefined || ignore === null) return [];
  if (!rule) return ['cloud.ignore needs a cloud.further: its keys belong to the rule\'s file'];
  if (!Array.isArray(ignore) || !ignore.length) return ['cloud.ignore must be a non-empty list of keys'];
  const out = [];
  const seen = new Set();
  for (const k of ignore) {
    if (typeof k !== 'string' || !k || k.includes('.')) out.push(`cloud.ignore: \`${k}\` must be a top-level key`);
    else if (seen.has(k)) out.push(`cloud.ignore: \`${k}\` is listed twice`);
    seen.add(k);
  }
  // A key the rule decides by (the last tie-break `time` aside) is progress, never a stamp.
  const decides = new Set();
  rule.by.forEach((e, i) => {
    if (i === rule.by.length - 1 && 'time' in e) return;
    decides.add(e[KINDS.find((x) => x in e)]);
    for (const w of e.within ?? []) decides.add(w);
  });
  for (const k of ignore) if (decides.has(k)) out.push(`cloud.ignore: \`${k}\` is read by cloud.further — that is progress`);
  return out;
}

/** What is wrong with a rule's shape (empty when the engine reads it whole). */
export function problems(rule, skillDir = SKILL) {
  const out = [];
  const plain = (p) => typeof p === 'string' && p !== '' && !p.startsWith('/') && !p.split('/').includes('..');
  if (!rule || typeof rule !== 'object') return ['further is not an object'];
  if (!plain(rule.file)) out.push('further.file must be a path inside the skill');
  if (!Array.isArray(rule.by) || !rule.by.length) return [...out, 'further.by must be a non-empty list'];
  rule.by.forEach((e, i) => {
    const kinds = KINDS.filter((k) => k in e);
    if (kinds.length !== 1) return out.push(`by[${i}]: exactly one of ${KINDS.join('|')}`);
    const k = kinds[0];
    if (typeof e[k] !== 'string' || !e[k]) out.push(`by[${i}].${k}: a key of the file`);
    const known = new Set([k, 'within', 'rise', ...(k === 'rank' ? ['order'] : [])]);
    for (const x of Object.keys(e)) if (!known.has(x)) out.push(`by[${i}]: unknown \`${x}\``);
    if (e.within !== undefined && !(Array.isArray(e.within) && e.within.every((w) => typeof w === 'string'))) {
      out.push(`by[${i}].within: a list of keys`);
    }
    if (e.rise !== undefined && typeof e.rise !== 'boolean') out.push(`by[${i}].rise: true or false`);
    if (k === 'rank') {
      const o = e.order;
      if (!o || !plain(o.file) || typeof o.list !== 'string') return out.push(`by[${i}].order: {file, list, key?}`);
      try {
        const ids = orderOf(o, skillDir);
        if (!ids.length) out.push(`by[${i}].order: ${o.file} \`${o.list}\` is empty`);
      } catch (err) {
        out.push(`by[${i}].order: ${err.message}`);
      }
    }
  });
  return out;
}

/** A `rank`'s order: the list at `list` in the file, each item's `key` (or the item itself). */
export function orderOf(order, skillDir = SKILL) {
  const doc = JSON.parse(fs.readFileSync(path.join(skillDir, order.file), 'utf8'));
  const list = order.list.split('.').reduce((v, k) => v?.[k], doc);
  if (!Array.isArray(list)) throw new Error(`${order.file}: \`${order.list}\` is not a list`);
  return list.map((x) => String(order.key ? x?.[order.key] : x));
}

/** The rule with each `rank`'s order as its ids — what the phone ships. */
export function resolved(skillDir = SKILL) {
  const md = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
  const text = readFurtherText(md);
  if (text == null) return null;
  const rule = JSON.parse(text);
  const bad = problems(rule, skillDir);
  if (bad.length) throw new Error(`SKILL.md cloud.further: ${bad.join('; ')}`);
  const ignoreText = readIgnore(md);
  const ignore = ignoreText == null ? undefined : JSON.parse(ignoreText);
  const badIgnore = ignoreProblems(ignore, rule);
  if (badIgnore.length) throw new Error(`SKILL.md ${badIgnore.join('; ')}`);
  return {
    file: rule.file,
    by: rule.by.map((e) => ('rank' in e ? { ...e, order: orderOf(e.order, skillDir) } : e)),
    ...(ignore ? { ignore } : {}),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  const json = JSON.stringify({ further: resolved() });
  if (i > 0) fs.writeFileSync(process.argv[i + 1], json);
  else console.log(json);
}
