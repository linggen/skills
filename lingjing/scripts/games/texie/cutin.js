// cutin.js — 施法特写's close-up: a comic panel in a corner of a 结印 field with 小满 in side profile, and for each seal the
// judge reads, that seal's PRE-PAINTED animation (Hanli 10-21: 「那就水墨, 识别到手势, 放一个预制的动画就好了」) — no hand
// is ever drawn from the landmarks. Frames: local FLUX paintings (tools/paint-texie-flux.py), one sprite sheet a seal
// (art/seal-<key>.webp: rise · seal · thrust), `ready` between seals. Data: worlds/jiuding/levels/texie.json `anims`.
// One component for any game with a camera hand: the 游戏厅's 施法特写 now; 结印's dock in 守墙关 · 守炉 · 守山门 next.
//
//   const kit = await loadCutinKit()                  texie.json, its frames preloaded
//   const up = closeUp(container, { kit, lang })      the panel, in `container` (its top-right corner)
//   up.update({ now, seen, seal, fist, cast })        each frame: seen — a hand in view; seal — the jieyin.json seal id
//                                                     read (judge.js sealOf / handSeal), or null; fist — a fist
//                                                     (jieyin.json spells.kou); cast — a cast this frame (true, or the
//                                                     seal id it was cast with)  → { phase, frame, key }
//   up.destroy()
//
// Pure, for the tests: animOf(kit, { seal, fist, cast }), startShow(), showStep(state, { now, key, cast }, kit).

import { panelStep, startPanel } from './panel.js';

const KIT = new URL('../../../worlds/jiuding/levels/texie.json', import.meta.url);
const art = (name) => new URL(`./art/${name}.webp`, import.meta.url).href;
export const sheetOf = (key) => art(`seal-${key}`);
export const READY = art('ready');

/** Which animation a reading plays: the row naming the seal, else the fist's row for a fist; a `castOnly` row (the open
    palm) only on a cast. → key | null (ready) */
export function animOf(kit, { seal = null, fist = false, cast = false } = {}) {
  const rows = Object.entries(kit.anims ?? {});
  const bySeal = seal ? rows.find(([, a]) => a.seals?.includes(seal)) : null;
  const row = bySeal ?? (fist ? rows.find(([, a]) => a.fist) : null);
  if (!row) return null;
  return row[1].castOnly && !cast ? null : row[0];
}

/** What the panel shows: `ready`, or a key's `rise` (for `ms.rise` after it is read) then `seal`; a cast its `thrust`
    for `ms.thrust`. → { key, frame, since, until } */
export const startShow = () => ({ key: null, frame: 'ready', since: 0, until: 0 });
export function showStep(s, { now, key = null, cast = null }, kit) {
  const ms = kit.ms;
  if (cast) return { key: cast, frame: 'thrust', since: now, until: now + ms.thrust };
  if (s.frame === 'thrust' && now < s.until) return s;
  if (!key) return s.frame === 'ready' ? s : { key: null, frame: 'ready', since: now, until: 0 };
  if (key !== s.key || s.frame === 'ready' || s.frame === 'thrust') return { key, frame: 'rise', since: now, until: now + ms.rise };
  if (s.frame === 'rise' && now >= s.until) return { ...s, frame: 'seal', since: now };
  return s;
}

export async function loadCutinKit(f = globalThis.fetch) {
  const kit = await f(KIT).then((r) => r.json());
  if (globalThis.Image) for (const src of [READY, ...Object.keys(kit.anims).map(sheetOf)]) { const i = new Image(); i.src = src; }
  return kit;
}

export function closeUp(container, { kit, lang = 'zh' } = {}) {
  const doc = container.ownerDocument;
  const el = doc.createElement('div');
  el.className = 'tx-panel';
  el.dataset.phase = 'hidden';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<i class="tx-frame"></i><i class="tx-frame"></i><b class="tx-name"></b>';
  container.append(el);
  const layers = [...el.querySelectorAll('.tx-frame')], name = el.querySelector('.tx-name');
  const n = kit.frames.length;
  let ps = startPanel(), ss = startShow(), top = 0, shown = '';
  const paint = (s) => {
    const id = s.frame === 'ready' ? 'ready' : `${s.key}:${s.frame}`;
    if (id === shown) return;
    shown = id;
    top = 1 - top; // cross-fade: the hidden layer takes the new frame and comes up
    const L = layers[top];
    if (s.frame === 'ready') { L.style.backgroundImage = `url("${READY}")`; L.style.backgroundSize = '100% 100%'; L.style.backgroundPosition = '0 0'; }
    else {
      const i = Math.max(0, kit.frames.indexOf(s.frame));
      L.style.backgroundImage = `url("${sheetOf(s.key)}")`;
      L.style.backgroundSize = `${n * 100}% 100%`;
      L.style.backgroundPosition = `${n > 1 ? (i / (n - 1)) * 100 : 0}% 0`;
    }
    layers.forEach((x, k) => x.classList.toggle('is-on', k === top));
    const row = kit.anims[s.key];
    el.dataset.frame = s.frame;
    el.dataset.key = s.key ?? '';
    el.style.setProperty('--glow', row?.glow ?? 'transparent');
    name.textContent = s.frame === 'ready' ? '' : row?.name?.[lang] ?? row?.name?.zh ?? '';
  };
  el.style.setProperty('--fade', `${kit.ms.fade}ms`);
  return {
    el,
    update({ now, seen = false, seal = null, fist = false, cast = null } = {}) {
      const castKey = cast ? animOf(kit, { seal: typeof cast === 'string' ? cast : seal, fist, cast: true }) ?? (fist ? animOf(kit, { fist: true }) : null) ?? animOf(kit, { seal: 'zhang', cast: true }) : null;
      const p = panelStep(ps, { now, seen, cast: Boolean(cast) }, kit.panel);
      ps = p.state;
      el.dataset.phase = ps.phase;
      ss = showStep(ss, { now, key: animOf(kit, { seal, fist }), cast: castKey }, kit);
      paint(ss);
      return { phase: ps.phase, frame: ss.frame, key: ss.key };
    },
    destroy() { el.remove(); },
  };
}
