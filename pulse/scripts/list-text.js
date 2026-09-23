// list-text.js — a settings list typed as one line of text.
//
// Commas (or new lines) separate: "agent, agent memory, native AI". A URL
// may carry its own comma ("…/search.rss?q=a,b"), so inside a URL entry a
// comma with no space after it stays the URL's — unless what follows starts
// a new URL. Entries are trimmed; blanks and repeats drop.

const URL_START = /^[a-z][\w+.-]*:\/\//i;

export function splitList(text) {
  const bits = String(text ?? '').split(/(\n|,)/);
  const entries = [bits[0]];
  for (let i = 1; i < bits.length; i += 2) {
    const [sep, next] = [bits[i], bits[i + 1]];
    const last = entries[entries.length - 1];
    const inUrl = sep === ',' && URL_START.test(last.trim()) && next !== '' && !/^\s/.test(next) && !URL_START.test(next);
    if (inUrl) entries[entries.length - 1] = `${last},${next}`;
    else entries.push(next);
  }
  const seen = [];
  for (const part of entries) {
    const v = part.trim();
    if (v && !seen.includes(v)) seen.push(v);
  }
  return seen;
}
