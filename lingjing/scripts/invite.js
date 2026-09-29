// invite.js — the chat's input asks the player what they do (his, 2026-09-29:
// fewer taps, invite typing): 「你想怎么做？」 / "What do you do?" in place of
// the chat's own "Message…". Free text already goes through Ling — she
// proposes, the rules decide — so the field is the other half of every scene.
//
// The chat is the engine's (/shared/chat-bridge.js): `mount({placeholder})`
// reaches only its lazy local panel, so the page also sets the embed's field
// itself while that frame is same-origin (the local engine). Over the relay
// the frame is another origin and this quietly does nothing. The engine's own
// grey next-prompt hint (「…   ⇥ Tab」) is never overwritten.

/// What the field should say: the engine's Tab hint when it shows one, else ours.
export const placeholderFor = (current, mine) => (String(current ?? '').includes('⇥') ? current : mine);

/// Keep the embed's input saying `text()` — a function, so a change of language
/// follows. `host` is the element the chat was mounted into.
export function holdPlaceholder(host, text) {
  if (!host || typeof MutationObserver === 'undefined') return;
  const apply = (doc) => doc.querySelectorAll('textarea').forEach((t) => {
    const want = placeholderFor(t.placeholder, text());
    if (want && t.placeholder !== want) t.placeholder = want;
  });
  const watch = (frame) => {
    let doc = null;
    try { doc = frame.contentDocument; } catch { return; } // another origin: the relay's
    if (!doc) return;
    apply(doc);
    new MutationObserver(() => apply(doc)).observe(doc, { subtree: true, childList: true, attributes: true, attributeFilter: ['placeholder'] });
  };
  const hook = (frame) => {
    if (frame.dataset.invite) return;
    frame.dataset.invite = '1';
    frame.addEventListener('load', () => watch(frame));
    watch(frame);
  };
  host.querySelectorAll('iframe').forEach(hook);
  new MutationObserver(() => host.querySelectorAll('iframe').forEach(hook)).observe(host, { subtree: true, childList: true });
}
