// book-words.mjs — a passage's words as the book's reader finds them (读原著 at the box): its marks
// gone, zh as one run of characters, en as lower-case words. The box names a beat by its opening
// words (dialogue.js bookPlace); the reader finds the book's paragraph that opens on them
// (read.js openAt). Every beat the box plays is a paragraph of the book (2026-10-26: the game
// plays the book's full text), so its own words are the place. Pure: no DOM, no fs.

const MARKS = (t) => String(t ?? '')
  .replace(/\[([^\]\n]*)\]\{[^}\n]*\}/g, '$1')
  .replace(/\{[^}\n]*\}/g, '')
  .replace(/\*\*|⟪|⟫/g, '');
const PUNCT_ZH = /[\s，。！？、：；「」『』“”‘’—…（）()《》〈〉·,.!?;:'"*_-]/g;

export const unitsOf = (text, lang) => (lang === 'en'
  ? MARKS(text).toLowerCase().replace(/[’‘]/g, "'").split(/[^a-z0-9']+/).filter(Boolean)
  : [...MARKS(text).replace(PUNCT_ZH, '')]);

/* A paragraph's opening words: zh its first characters, en its first words. */
export const headOf = (para, lang = 'zh', n = lang === 'en' ? 6 : 12) => {
  const u = unitsOf(para, lang).slice(0, n);
  return lang === 'en' ? u.join(' ') : u.join('');
};
