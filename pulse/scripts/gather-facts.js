// gather-facts.js — what a session's last gather found, as counts. The page
// hands these to the agent (the greeting's LAST GATHER block, the Needs you
// view); the agent words them. Pure — node tests it.

const real = (cards) => (Array.isArray(cards) ? cards : []).filter((c) => c && c.type !== 'empty');

/// The source a card belongs to — the page's cardSource rule, kept to the
/// lanes a founder recognizes.
export function sourceOf(c) {
  const s = String(c.source || '').toLowerCase();
  const sub = String(c.sub || '').toLowerCase();
  if (sub === 'bsky' || s === 'bsky' || s.includes('bluesky')) return 'bluesky';
  if (sub || s === 'reddit' || s.startsWith('r/')) return 'reddit';
  if (s === 'x' || s === 'twitter') return 'x';
  if (s === 'hn' || s.includes('hacker')) return 'hn';
  return s || 'other';
}

const bySource = (cards) => {
  const out = {};
  for (const c of cards) out[sourceOf(c)] = (out[sourceOf(c)] || 0) + 1;
  return out;
};

/// { at, replies_to_you, mentions, threads, by_source } — or null when the
/// session never gathered anything.
export function gatherFacts(session) {
  const sec = session?.sections || {};
  const inbox = real(sec.mentions?.cards);
  const replies = inbox.filter((c) => c.type === 'reply_to_me');
  const mentions = inbox.filter((c) => c.type !== 'reply_to_me');
  const dueReplies = real(sec.replies_due?.cards);
  const threads = real(sec.discovery?.cards);
  const at = [sec.mentions?.last_updated, sec.discovery?.last_updated, session?.last_run_at]
    .filter(Boolean).sort().pop() || null;
  if (!at && !inbox.length && !threads.length) return null;
  return {
    at,
    replies_to_you: replies.length + dueReplies.length,
    mentions: mentions.length,
    threads: threads.length,
    threads_by_source: bySource(threads),
    inbox_by_source: bySource([...replies, ...mentions]),
  };
}

/// The hidden block for the greeting turn.
export function lastGatherBlock(facts, sources) {
  const on = `Sources on: ${sources.length ? sources.join(', ') : 'none yet'}.`;
  if (!facts) return `LAST GATHER: none — this is the first scan. ${on}`;
  return `LAST GATHER (facts, hidden from the user): ${JSON.stringify(facts)}. ${on}`;
}
