// pictures.js — a board's picture that is not there, on the phone's board page: the same guard and the same stand-in the Mac
// page installs (picture-asks.js, missing-picture.js), imported, not copied. The pictures and lines are the page's own:
// Yinyue's two drawings come from worlds/jiuding/art/fallback/ (the kit ships them: tools/phone/board-kit.json `shared`),
// her words from PIC_WORDS in the board's language. There is no engine behind this page (no /api/assets), so the ledger
// alone decides which of the two she is.
import { pictures, watchPictures, whenPicture } from '../../picture-asks.js';
import { PIC_WORDS, missingPictures } from '../../missing-picture.js';

/** Install on `doc` once. `root` the skill folder's URL; `lang()` the board's language now ('zh' | 'en'); `extra` more of
    missingPictures' environment (a test's timers and probe). */
export function installPictures({ doc = globalThis.document, root = new URL('../../../', import.meta.url), lang = () => 'zh', ...extra } = {}) {
  const standIns = missingPictures({
    ledger: pictures, probe: whenPicture, doc, base: () => doc.baseURI,
    urlOf: (file) => new URL(`worlds/jiuding/${file}`, root).href,
    words: () => PIC_WORDS[lang()] ?? PIC_WORDS.zh, ...extra,
  });
  watchPictures(doc, standIns);
  return standIns;
}
