// reach.mjs — can DJ download here? DJ's songs come from YouTube; where the
// engine reports youtube unreachable (mainland China, no VPN), a Get is
// refused with a fact, never attempted. The fact comes from the engine
// (src/reach.rs): LINGGEN_RESTRICTED in a tool's env, else GET /api/reach
// for the page's doors. Unknown (an older engine, no answer) = try.
//
// The refusal is a fact, not a sentence: DJ (SKILL.md) and the page decide
// how to say it.

export const REFUSAL = Object.freeze({
  ok: false,
  unavailable: 'download',
  reason: 'youtube_unreachable',
});

/// "youtube,google" → ['youtube', 'google'].
export const parseRestricted = (s) =>
  String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

/// The services the engine says are unreachable, or [] when it cannot say.
export async function restricted({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (env.LINGGEN_RESTRICTED !== undefined) return parseRestricted(env.LINGGEN_RESTRICTED);
  if (typeof fetchImpl !== 'function') return [];
  const port = env.LINGGEN_PORT || '9527';
  try {
    const res = await fetchImpl(`http://127.0.0.1:${port}/api/reach`, {
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    const body = await res.json();
    return Array.isArray(body?.restricted) ? body.restricted.map(String) : [];
  } catch {
    return [];
  }
}

/// The refusal when downloading cannot work here, else null.
export const downloadRefusal = (list) => (list.includes('youtube') ? { ...REFUSAL } : null);
