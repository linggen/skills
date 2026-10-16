// dev-arcade.js — the builder's door to the test arcade (Hanli, 2026-10-16: 「游戏大厅在lingjing里加一个按钮能打开吧」).
// The arcade is a test page that never ships to players, so this chip is the one link to it, and it
// shows only behind the gate: the developer account (the engine's /api/account gate says
// developer: true), or a scratch save (?save=, 测试存档). A normal player never sees it.
// tests/small-games.test.mjs holds that this module is the arcade's only link.

const WORD = { zh: '游戏厅（测试）', en: 'Arcade (test)' };

/// Gate: a scratch save, or the developer account. A scratch save never reads the account.
export async function arcadeAllowed({ scratch, readAccount }) {
  if (scratch) return true;
  try {
    const acct = await readAccount();
    return acct?.gate?.developer === true;
  } catch {
    return false;
  }
}

/// The account as the engine sees it, over the page's data channel.
export async function readAccount() {
  const res = await globalThis.LinggenChannel.fetch('/api/account?app=lingjing');
  if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) return null;
  return res.json();
}

const label = () => WORD[document.documentElement.lang === 'en' ? 'en' : 'zh'];

/// The arcade's address; a scratch save rides along so its 返回游戏 lands back on that save.
export const arcadeUrl = (scratch) => `arcade.html?dev=1&from=game${scratch ? `&save=${encodeURIComponent(scratch)}` : ''}`;

function openArcade(e) {
  e.preventDefault();
  const url = e.currentTarget.href;
  // A new tab where the shell allows popups (its iframe sandbox does); else this frame goes there.
  if (!window.open(url, '_blank', 'noopener')) location.href = url;
}

/* Where the 测试存档 badge sits — the top-left corner, above the hero's name (2026-10-16: at the top right
   the badge and this chip under it covered the 中/En toggle at 1440 with the chat put away, and the
   header's people) — and the chip just right of it on the same thin row, or in that corner alone. On a
   phone the badge is in the bottom-left corner (phone.css) and the chip in the bottom-right corner of
   the chat's 「和灵说话」 bar, where nothing lives; hidden under the open chat sheet. */
const STYLE = `.dev-arcade{position:fixed;top:0;left:8px;z-index:99;padding:0 6px;border:1px solid #8a7a66;border-top:0;
border-radius:0 0 3px 3px;background:#fff8ef;color:#6b5d4d;font:500 10px/1.4 var(--ui,sans-serif);letter-spacing:.04em;opacity:.6;text-decoration:none}
.dev-arcade:hover{opacity:1}
.scratch-badge~.dev-arcade{top:0;left:var(--after-badge,8px)}
@media (max-width:600px),(max-width:860px) and (max-height:700px){.dev-arcade,.scratch-badge~.dev-arcade{top:auto;bottom:8px;right:8px;left:auto;border:1px solid #8a7a66;border-radius:3px;font-size:9.5px}
.shell.chatsheet~.dev-arcade{display:none}}`;

/// The chip, beside the 测试存档 badge's spot.
export async function devArcade({ scratch, read = readAccount } = {}) {
  if (!(await arcadeAllowed({ scratch, readAccount: read }))) return;
  if (!document.getElementById('dev-arcade-style')) document.head.insertAdjacentHTML('beforeend', `<style id="dev-arcade-style">${STYLE}</style>`);
  const a = document.createElement('a');
  a.className = 'dev-arcade';
  a.href = arcadeUrl(scratch);
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = label();
  a.addEventListener('click', openArcade);
  document.body.append(a);
  const badge = document.querySelector('.scratch-badge');
  if (badge) a.style.setProperty('--after-badge', `${Math.ceil(badge.getBoundingClientRect().right) + 6}px`);
  new MutationObserver(() => { a.textContent = label(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
}
