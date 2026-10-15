// The game's language is Linggen's own (Hanli, 2026-10-15): the engine hands
// every skill command the effective setting as LINGGEN_LANGUAGE ("en",
// "zh-Hans", any BCP-47 tag). Lingjing has two languages, so zh* is zh and
// everything else English. A save's old `lang` field is never read for it,
// and never written again (files.mjs writeState).
//
// A scratch save (`--save=<name>`, the page's `?save=`) never touches the
// global setting: its Lang is kept in data/saves/<name>/lang.json, and that
// save plays in it (2026-10-15 — play-testers' 中/En flipped the real page).

import fs from 'node:fs';
import path from 'node:path';
import { homeDir, SAVE_NAME, writeAtomic } from './files.mjs';

/* A BCP-47 tag as one of the game's two languages. */
export const langOfTag = (tag) => (/^zh/i.test(String(tag ?? '').trim()) ? 'zh' : 'en');

/* A scratch save's own language file, or null on the real save. */
export function scratchLangFile(env = process.env) {
  const name = env.LINGJING_SAVE;
  if (!SAVE_NAME.test(name ?? '')) return null;
  return path.join(env.LINGJING_DATA || homeDir(), 'saves', name, 'lang.json');
}
const scratchLang = (env) => {
  const file = scratchLangFile(env);
  if (!file) return null;
  try {
    const got = JSON.parse(fs.readFileSync(file, 'utf8'))?.lang;
    return got === 'zh' || got === 'en' ? got : null;
  } catch {
    return null;
  }
};

/* The language in play: a scratch save's own Lang if it set one, else the
   engine's setting; with no engine (a test, the command line by hand),
   Chinese, the game's first language. */
export const langNow = (env = process.env) => scratchLang(env) ?? (env.LINGGEN_LANGUAGE ? langOfTag(env.LINGGEN_LANGUAGE) : 'zh');

/* The tag Linggen's setting is written as. */
export const TAG_OF = { zh: 'zh-Hans', en: 'en' };

/* Lang, asked outright: Linggen's global setting is written — the whole of
   Linggen speaks it after, not only the game. Config is one document, so it
   is read, its `language` set, and posted back whole (the Settings page does
   the same). `{ok:false, why}` when the engine is not there or refuses. */
/* Under `node --test` (and the rules it spawns) the live engine is never
   reached: a test hands its own fetch, or the write is refused. */
const underTest = (env) => Boolean(env.NODE_TEST_CONTEXT || process.env.NODE_TEST_CONTEXT || process.execArgv.some(a => a.startsWith('--test')));
export async function writeGlobalLang(lang, { env = process.env, fetchFn = globalThis.fetch } = {}) {
  if (fetchFn === globalThis.fetch && underTest(env)) return { ok: false, why: 'a test never writes the live setting' };
  const base = `http://127.0.0.1:${env.LINGGEN_PORT || 9527}`;
  try {
    const got = await fetchFn(`${base}/api/config`);
    if (!got.ok) return { ok: false, why: `GET /api/config ${got.status}` };
    const config = await got.json();
    const put = await fetchFn(`${base}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...config, language: TAG_OF[lang] }),
    });
    if (!put.ok) return { ok: false, why: `POST /api/config ${put.status}` };
    return { ok: true, tag: TAG_OF[lang] };
  } catch (e) {
    return { ok: false, why: String(e?.message ?? e) };
  }
}

/* The command line's half of Lang, before the verb runs under the save's
   lock: under the engine (LINGGEN_LANGUAGE set) the setting is written, and
   either way this process speaks the new language at once — the verb's
   answer is already in it, never the stale env's. Returns the language it
   replaced (kept for the verb's `changed`, langWas), or a refusal. */
let was = null;
export const langWas = () => was;
export async function chooseLang(lang, { env = process.env, fetchFn } = {}) {
  if (!TAG_OF[lang]) return { ok: true }; // the verb refuses it
  const before = langNow(env);
  // A scratch save keeps its Lang to itself — the global setting is never written.
  const local = scratchLangFile(env);
  if (local) {
    writeAtomic(local, JSON.stringify({ lang }));
    was = before;
    return { ok: true, was: before };
  }
  // A sandboxed save (LINGJING_DATA, the tests') never writes the real setting.
  if (env.LINGGEN_LANGUAGE && !env.LINGJING_DATA && langOfTag(env.LINGGEN_LANGUAGE) !== lang) {
    const wrote = await writeGlobalLang(lang, { env, fetchFn });
    if (!wrote.ok) return { ok: false, refused: 'lang-not-saved', why: wrote.why, say: null };
  }
  env.LINGGEN_LANGUAGE = TAG_OF[lang];
  was = before;
  return { ok: true, was: before };
}

/* A save as it plays: in the language of the moment, whatever its old
   `lang` said (and an old `lang_set` pin let go). Never written back. */
export function inPlay(state) {
  if (!state) return state;
  const { lang_set, ...rest } = state;
  return { ...rest, lang: langNow() };
}

/* A save as it is written: no language — that is Linggen's, not the save's. */
export function stateText(state) {
  const { lang, lang_set, ...rest } = state;
  return JSON.stringify(rest);
}
