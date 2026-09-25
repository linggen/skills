#!/usr/bin/env node
// focus.js — the Focus tool: Ling reads the composed first view and may set
// its lead. Writes one register cell (`lay:focus`) under the same lock and
// checksum guard the page and the phone use (lww.js), so it syncs like any
// other edit.
//
//   node focus.js view                 the first view as composed now
//   node focus.js agent <id|none> why  Ling's lead, refused when their pin or
//                                      hide says otherwise
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Register, saveRegisterFile } from './lww.js';
import { compose, layoutOf, focusCatalog, focusRefusal, attentionItems } from './compose.js';

const dataDir = () => join(process.env.SKILL_DIR || join(dirname(fileURLToPath(import.meta.url)), '..'), 'data');
const readJson = (p, fb) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fb; } };
const runBash = async (cmd) => execFileSync('bash', ['-c', cmd], { encoding: 'utf8' });

function load(dir) {
  const devPath = join(dir, 'device-id');
  const device = existsSync(devPath) ? readFileSync(devPath, 'utf8').trim() : 'mac-focus';
  return { report: readJson(join(dir, 'report.json'), {}), reg: new Register(device || 'mac-focus', readJson(join(dir, 'edits.json'), null)) };
}

function view(report, layout) {
  const v = compose(report, layout);
  return {
    first_view: { brief: v.brief, focus: v.focus, attention: v.attention.map(({ size, ...i }) => i), more: v.more },
    catalog: focusCatalog(report),
    attention_all: attentionItems(report).length,
    pinned: layout.pin,
    hidden: layout.hides,
  };
}

const PLACEHOLDER = /^\{\{\w+\}\}$/; // an omitted tool arg arrives as its literal template

async function main(argv) {
  const [cmd, id = 'none', ...why] = argv.filter((a) => !PLACEHOLDER.test(a));
  const dir = dataDir();
  const { report, reg } = load(dir);
  if (cmd === 'view') return view(report, layoutOf(reg));
  if (cmd === 'agent') {
    const refused = focusRefusal(report, layoutOf(reg), id);
    if (refused) return { ok: false, refused };
    reg.set('lay:focus', id === 'none' ? null : { id, why: why.join(' ').trim() });
    await saveRegisterFile(runBash, join(dir, 'edits.json'), reg);
    return { ok: true, ...view(report, layoutOf(reg)) };
  }
  throw new Error('usage: focus.js view | agent <id|none> <why>');
}

main(process.argv.slice(2))
  .then((out) => console.log(JSON.stringify(out)))
  .catch((e) => { console.log(JSON.stringify({ error: e.message })); process.exit(1); });
