// rules/newer.mjs — A save from newer rules: its `version` above these rules' own (state.mjs STATE_VERSION).
// Part of the rules engine; rules.mjs is its one door.
//
// Older rules given a newer save used to take it as their own: `migrate` saw nothing to carry, and every verb went on
// writing the save with the old numbers while it still said the newer version (2026-11-11, reproduced: v17 rules on a
// v18 save paid 闭关 24 修为 where v18 pays 10, banked 27 where v18 banks 11, stepped a 层 at v17's mark — and the save
// still said 18, so nothing after could tell). Such a save is never written and never migrated: every verb is refused
// before the save's lock is taken, and again under it, and the file is left byte for byte as it came.
import fs from 'node:fs';
import { STATE_VERSION } from '../state.mjs';
export { NewerSave } from '../state.mjs';
import { langNow } from './language.mjs';

/* What the player is told — the page says both (cards.js WORDS `newerSave`), Ling and the phone say this. */
export const NEWER_SAY = {
  zh: '存档来自新版 Linggen，更新后继续。',
  en: 'This save is from a newer Linggen. Update to continue.',
};

/* The save's version when it is newer than these rules, else null (no save, an older one, this one). */
export function newerVersion(state) {
  const v = Number(state?.version);
  return Number.isFinite(v) && v > STATE_VERSION ? v : null;
}

/* The version of the save in `file` when it is newer than these rules; null for no file or one that does not read. */
function newerIn(file) {
  if (!file || !fs.existsSync(file)) return null;
  try {
    return newerVersion(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    return null;
  }
}

/* The one refusal every verb answers on a newer save: nothing played, nothing written. */
export function newerRefusal(version, lang = langNow()) {
  return { ok: false, refused: 'newer-save', save_version: version, rules_version: STATE_VERSION, say: NEWER_SAY[lang === 'en' ? 'en' : 'zh'] };
}

/* The refusal when any of `files` holds a newer save, else null. */
export function newerHeld(...files) {
  for (const f of files) {
    const v = newerIn(f);
    if (v != null) return newerRefusal(v);
  }
  return null;
}
