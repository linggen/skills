// host.js — a board on the phone (Hanli 10-20, doc/game-kit.md § Mac and phone). The phone app (linggen-mobile) loads
// this page in a local webview and speaks the mount contract (games/mount.js) over its JS channel; everything around
// the play — the lead card, the pause, the result, the speech bubbles — is native Flutter. The game file is the same
// one the Mac plays: nothing here knows a game's rules, and the shell's web parts (games/shell.js frameHtml) are not used.
//
//   Flutter → page   LingjingHost.mount('{"game":"shouqiang","data":{"lv":"baicai"},"lang":"zh","seed":"…"}')
//                    LingjingHost.go()          the lead card's 开始 was tapped
//                    LingjingHost.pause(true)   the native pause button
//                    LingjingHost.leave()       the player walked away (settles { left: true })
//   page → Flutter   Linggen.postMessage(JSON) with { t: 'ready' | 'mounted' | 'lead' | 'say' | 'event' | 'end' | 'error', … }
//                    lead  { text }            the story lines the lead card reads; the game starts when go() answers it
//                    say   { who, text, ms }   a bubble over the field (台词预取's lines)
//                    event { f }               the game's facts (start · wave · wave_cleared · boss · low · end …)
//                    end   { won, stars, left, next, stats }
//
// The shell's sound controller IS used (games/kit/sound.js through shellFor): a game names what happened, data says
// what it sounds like, and the result chimes at the end. iOS wakes the AudioContext on the first touch in the page.
import { forget, setPaused, settle, shellFor } from '../shell.js';
import { unlockOn } from '../kit/sound.js';

const GAMES = { shouqiang: () => import('../shouqiang.js') };
const ID = 'board';

const post = (m) => {
  const bridge = globalThis.Linggen ?? globalThis.webkit?.messageHandlers?.Linggen;
  try { bridge?.postMessage(JSON.stringify(m)); } catch (e) { console.warn('[host] post', e); }
};

let go = null, abort = null;

async function mountBoard(spec) {
  const { game, data = {}, lang = 'zh', seed, reducedMotion = false, lines } = spec;
  if (!GAMES[game]) { post({ t: 'error', error: `no board ${game}` }); return; }
  abort?.abort();
  abort = new AbortController();
  forget(ID);
  const mod = await GAMES[game]();
  const shell = {
    ...shellFor(ID, game),
    say: (who, text, ms) => post({ t: 'say', who, text, ms }),
    // The lead card is Flutter's: the page asks for it and the game waits for `go()`.
    lead: (text, o) => new Promise((resolve) => { go = resolve; post({ t: 'lead', text, auto: o?.auto ?? null }); }),
  };
  post({ t: 'mounted', game });
  const r = await mod.mount(document.getElementById('stage'), {
    lang, data, seed, reducedMotion, lines, signal: abort.signal, shell, onEvent: (f) => post({ t: 'event', f }),
  });
  settle(ID, r);
  post({ t: 'end', won: Boolean(r?.won), stars: r?.stars ?? null, left: Boolean(r?.left), next: r?.next ?? null, stats: r?.stats ?? null });
}

globalThis.LingjingHost = {
  mount: (specJson) => mountBoard(typeof specJson === 'string' ? JSON.parse(specJson) : specJson).catch((e) => post({ t: 'error', error: String(e?.stack ?? e) })),
  go: () => { go?.(); go = null; },
  pause: (on) => setPaused(ID, Boolean(on)),
  leave: () => abort?.abort(),
};
unlockOn(document);
window.addEventListener('error', (e) => post({ t: 'error', error: String(e.message ?? e) }));
post({ t: 'ready' });
