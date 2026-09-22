#!/usr/bin/env node
// run-store.mjs — the locked, atomic read-merge-write both CFO pages use for
// edits.json and config.json (lww.js lockedUpdate / saveRegisterFile). Runs the
// real shell commands against a temp dir.
//
//   node tests/run-store.mjs

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Register, saveRegisterFile, updateJsonFile, lockedUpdate } from '../scripts/lww.js';

let pass = 0, fail = 0;
const t = (name, ok, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// Same contract as the page's runBash: stdout, throw on non-zero exit. Async,
// so two writers really interleave at every shell call.
const runBash = (cmd) => new Promise((resolve, reject) => {
  try { resolve(execFileSync('bash', ['-c', cmd], { encoding: 'utf8' })); } catch (e) { reject(e); }
});

const dir = mkdtempSync(join(tmpdir(), 'cfo-store-'));
const edits = join(dir, 'data', 'edits.json');
const clean = () => readdirSync(join(dir, 'data')).filter((f) => f !== 'edits.json' && f !== 'config.json');

// 1. First write: file appears whole, no temp or lock left behind.
const mac = new Register('mac');
mac.set('bud:dining', 300);
await saveRegisterFile(runBash, edits, mac);
t('S1 first save writes the register', JSON.parse(readFileSync(edits, 'utf8')).reg['bud:dining'].v === 300);
t('S2 no temp file or lock left behind', clean().length === 0, clean().join(', '));

// 2. A phone commit landed after this page loaded: the save keeps it.
const phone = new Register('phone', JSON.parse(readFileSync(edits, 'utf8')));
phone.set('ov:hydro', 'utilities');
writeFileSync(edits, `${JSON.stringify(phone.toState(), null, 2)}\n`);
mac.set('bud:travel', 500);
const took = await saveRegisterFile(runBash, edits, mac);
const disk = JSON.parse(readFileSync(edits, 'utf8')).reg;
t('S3 a concurrent phone cell survives the Mac save', disk['ov:hydro']?.v === 'utilities' && disk['bud:travel']?.v === 500, `took ${took}`);

// 3. Two writers on one page at once (report page + Settings share this
//    module only per page, so this is the in-page chain; the file lock covers
//    the cross-page case below).
const a = new Register('mac', JSON.parse(readFileSync(edits, 'utf8')));
const b = new Register('settings', JSON.parse(readFileSync(edits, 'utf8')));
a.set('bud:groceries', 600);
b.set('ov:netflix', 'subscriptions');
await Promise.all([saveRegisterFile(runBash, edits, a), saveRegisterFile(runBash, edits, b)]);
const both = JSON.parse(readFileSync(edits, 'utf8')).reg;
t('S4 two simultaneous saves both land', both['bud:groceries']?.v === 600 && both['ov:netflix']?.v === 'subscriptions');

// 4. The file changes between our read and our write (the phone doesn't take
//    the lock): the checksum guard re-reads and merges again.
let raced = false;
await lockedUpdate(runBash, edits, (text) => {
  const state = JSON.parse(text);
  if (!raced) {
    raced = true;
    const p = new Register('phone', state);
    p.set('bud:fees', 20);
    writeFileSync(edits, `${JSON.stringify(p.toState(), null, 2)}\n`); // lands mid-save
  }
  const r = new Register('mac', state);
  r.set('bud:health', 80);
  return `${JSON.stringify(r.toState(), null, 2)}\n`;
});
const cas = JSON.parse(readFileSync(edits, 'utf8')).reg;
t('S5 a write that lands mid-save is merged, not overwritten', cas['bud:fees']?.v === 20 && cas['bud:health']?.v === 80);
t('S6 lock released after a conflict retry', clean().length === 0, clean().join(', '));

// 5. A crashed page's lock doesn't wedge the file forever.
mkdirSync(`${edits}.lock`);
const start = Date.now();
await updateJsonFile(runBash, join(dir, 'data', 'config.json'), (c) => { c.currency = 'CAD'; }); // other file: no wait
mac.set('bud:shopping', 90);
await saveRegisterFile(runBash, edits, mac);
t('S7 a stale lock is taken after a bounded wait', JSON.parse(readFileSync(edits, 'utf8')).reg['bud:shopping']?.v === 90,
  `${Date.now() - start} ms`);

// 6. config.json: read-modify-write keeps other fields.
await updateJsonFile(runBash, join(dir, 'data', 'config.json'), (c) => { c.watch_enabled = true; });
const cfg = JSON.parse(readFileSync(join(dir, 'data', 'config.json'), 'utf8'));
t('S8 config update keeps the other fields', cfg.currency === 'CAD' && cfg.watch_enabled === true);
t('S9 nothing left behind', clean().length === 0 && !existsSync(`${edits}.lock`), clean().join(', '));

rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
