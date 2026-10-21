// hint.js — the hand hint (Hanli 2026-10-21: 「最好不显示摄像头. 可以有一个手部动作的提示, 让用户知道手在摄像头里的位置」).
// No camera picture: a small framed panel stands for what the camera sees, and the hands it tracks are drawn there in
// ink (pose.js inkHand), where they are — mirrored, as in a mirror. A hand near an edge lights that edge; a hand gone
// shows the edge it left by and a cue to bring it back; a hand too far or too near says so. Beside it, the seal to make
// next (its ink icon and name), and a ring round the drawn hand that fills while the shape held is the one wanted.
// One component for every game that uses 结印 — the 游戏厅, 守墙关's helper, 古六's 讲堂:
//
//   const hint = handHint(container, { lang, size: 'compact' | 'large', seals, knobs })   // knobs: jieyin.json `hint`
//   hint.update({ image, aspect, target, progress, right, now? })   // image: the hands, 0…1 of the frame (eye.js)
//   hint.fizzle()     a puff on the panel (走火)
//   hint.destroy()
//
// `cueOf` (pure) is what the panel says; the tests read it.

import { iconSvg, inkFilter, inkHand } from './pose.js';
import { handsOf } from './judge.js';

const W = {
  zh: { none: '把手举到镜头前', edge: { left: '靠左边了', right: '靠右边了', top: '靠上边了', bottom: '靠下边了' }, gone: { left: '手从左边出去了，往右挪回来', right: '手从右边出去了，往左挪回来', top: '手从上边出去了，往下放一点', bottom: '手从下边出去了，往上抬一点', middle: '手不见了，放回框里' }, far: '手离镜头近一点', near: '手离镜头远一点', two: '两只手都放进来', next: '结', ok: '' },
  en: { none: 'Raise your hand to the camera', edge: { left: 'Near the left edge', right: 'Near the right edge', top: 'Near the top', bottom: 'Near the bottom' }, gone: { left: 'Your hand left on the left — move it back right', right: 'Your hand left on the right — move it back left', top: 'Your hand left at the top — lower it a little', bottom: 'Your hand left at the bottom — raise it a little', middle: 'Hand lost — bring it back into the frame' }, far: 'Bring your hand closer', near: 'Move your hand back a little', two: 'Bring both hands in', next: 'Make', ok: '' },
};
const KNOBS = { edge: 0.04, far: 0.07, near: 0.38, lostMs: 450, leave: 0.18 };
const plain = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** A hand's points as the player sees them: mirrored, x stretched to the frame's shape (y 0…1, x 0…aspect). */
export const mirrored = (hand, aspect = 4 / 3) => hand.map((p) => ({ x: (1 - p.x) * aspect, y: p.y }));
const lengthOf = (h) => Math.hypot(h[0].x - h[9].x, h[0].y - h[9].y); // wrist → middle root, in frame heights
const boxOf = (hands) => {
  const all = hands.flat();
  return { x0: Math.min(...all.map((p) => p.x)), x1: Math.max(...all.map((p) => p.x)), y0: Math.min(...all.map((p) => p.y)), y1: Math.max(...all.map((p) => p.y)) };
};

/** Which edge a box is nearest, if it is within `m` of one (the mirrored frame: 0…aspect × 0…1). */
function edgeOf(b, aspect, m) {
  const d = { left: b.x0, right: aspect - b.x1, top: b.y0, bottom: 1 - b.y1 };
  const [side, gap] = Object.entries(d).sort((x, y) => x[1] - y[1])[0];
  return gap < m ? side : null;
}

/** What the panel says. `seen`: the hands now (mirrored, as above); `last`: { at, box } of the last hands seen;
    `want`: hands the target seal needs. → { kind: 'none' | 'gone' | 'edge' | 'far' | 'near' | 'two' | 'ok', side? } */
export function cueOf({ seen = [], last = null, now = 0, aspect = 4 / 3, want = 1 }, knobs = KNOBS) {
  const k = { ...KNOBS, ...knobs };
  if (!seen.length) {
    if (!last) return { kind: 'none' };
    if (now - last.at < k.lostMs) return { kind: 'ok' }; // a frame or two lost is no news
    return { kind: 'gone', side: edgeOf(last.box, aspect, k.leave) ?? 'middle' };
  }
  const size = Math.max(...seen.map(lengthOf));
  if (size < k.far) return { kind: 'far' };
  if (size > k.near) return { kind: 'near' };
  const side = edgeOf(boxOf(seen), aspect, k.edge);
  if (side) return { kind: 'edge', side };
  if (want === 2 && seen.length < 2) return { kind: 'two' };
  return { kind: 'ok' };
}

const sayOf = (cue, w) => (cue.kind === 'edge' ? w.edge[cue.side] : cue.kind === 'gone' ? w.gone[cue.side] : w[cue.kind] ?? '');

let uid = 0;
export function handHint(container, { lang = 'zh', size = 'compact', seals = {}, knobs = {} } = {}) {
  const w = W[lang === 'en' ? 'en' : 'zh'], doc = container.ownerDocument, id = `jyink${++uid}`;
  const el = doc.createElement('div');
  el.className = `jy-hint-panel is-${size === 'large' ? 'large' : 'compact'}`;
  el.innerHTML = `<div class="jy-frame" data-edge=""><svg class="jy-view" preserveAspectRatio="xMidYMid meet"><defs>${inkFilter(id)}</defs><g class="jy-hands" filter="url(#${id})"></g>`
    + `<circle class="jy-hold-bg" r="0"/><circle class="jy-hold" r="0" pathLength="100"/></svg><i class="jy-arrow" aria-hidden="true"></i></div>`
    + `<div class="jy-target"><div class="jy-target-icon"></div><b class="jy-target-name"></b></div><p class="jy-cue" role="status"></p>`;
  container.append(el);
  const $ = (s) => el.querySelector(s);
  let last = null, target, puff = 0, drawn = null;

  const drawTarget = (t) => {
    if (t === target) return;
    target = t;
    const s = seals[t];
    $('.jy-target-icon').innerHTML = s ? iconSvg(s, size === 'large' ? 76 : 44) : '';
    $('.jy-target-name').textContent = s ? `${w.next} ${s.name[lang] ?? s.name.zh}` : '';
    el.classList.toggle('is-two', handsOf(s) === 2);
  };

  return {
    update({ image = [], aspect = 4 / 3, target: t = null, progress = 0, right = false, now = globalThis.performance?.now() ?? 0 } = {}) {
      drawTarget(t);
      const H = 100, Wd = H * aspect, seen = image.filter((h) => h?.length >= 21).map((h) => mirrored(h, aspect));
      const svg = $('.jy-view');
      svg.setAttribute('viewBox', `0 0 ${Wd.toFixed(1)} ${H}`);
      const px = (h) => h.map((p) => ({ x: p.x * H, y: p.y * H }));
      if (image !== drawn) { drawn = image; $('.jy-hands').innerHTML = seen.map((h) => inkHand(px(h), lengthOf(h) * H)).join(''); } // new hands only
      if (seen.length) last = { at: now, box: boxOf(seen) };
      const cue = cueOf({ seen, last, now, aspect, want: handsOf(seals[t]) }, knobs);
      $('.jy-frame').dataset.edge = cue.kind === 'edge' || cue.kind === 'gone' ? cue.side : '';
      $('.jy-frame').dataset.cue = cue.kind;
      $('.jy-cue').textContent = sayOf(cue, w);
      // The hold ring round the drawn hands (their box), filling while the shape held is the one wanted.
      const ring = $('.jy-hold'), bg = $('.jy-hold-bg');
      if (seen.length) {
        const b = boxOf(seen), cx = ((b.x0 + b.x1) / 2) * H, cy = ((b.y0 + b.y1) / 2) * H, r = (Math.hypot(b.x1 - b.x0, b.y1 - b.y0) / 2) * H * 1.08 + 3;
        for (const c of [ring, bg]) { c.setAttribute('cx', cx.toFixed(1)); c.setAttribute('cy', cy.toFixed(1)); c.setAttribute('r', r.toFixed(1)); }
        ring.style.strokeDasharray = `${Math.round(Math.max(0, Math.min(1, progress)) * 100)} 100`;
        ring.classList.toggle('is-right', Boolean(right));
      } else { ring.setAttribute('r', '0'); bg.setAttribute('r', '0'); }
      return cue;
    },
    fizzle() {
      el.classList.remove('is-fizzle');
      void el.offsetWidth;
      el.classList.add('is-fizzle');
      clearTimeout(puff);
      puff = setTimeout(() => el.classList.remove('is-fizzle'), 900);
    },
    destroy() { clearTimeout(puff); el.remove(); },
    el,
  };
}
