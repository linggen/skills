// hint.js — the hand hint (Hanli 2026-10-21: 「最好不显示摄像头. 可以有一个手部动作的提示, 让用户知道手在摄像头里的位置」).
// No camera picture: a small framed panel stands for what the camera sees, and the hands it tracks are drawn there in
// ink (pose.js inkHand), where they are — mirrored, as in a mirror. A hand near an edge lights that edge; a hand gone
// shows the edge it left by and a cue to bring it back; a hand too far or too near says so. Beside it, the seal to make
// next (its ink icon and name), and a ring round the drawn hand that fills while the shape held is the one wanted.
// One component for every game that uses 结印 — the 游戏厅, 守墙关's helper, 古六's 讲堂:
//
//   const hint = handHint(container, { lang, size: 'compact' | 'large', seals, knobs })   // knobs: jieyin.json `hint`
//   hint.update({ image, aspect, target, progress, right, now?, world?, handed?, held? })   // image: the hands, 0…1 of the frame (eye.js)
//     world · handed (eye.js) turn on the turn cue; held: [{ at, glow, left }] (spell.js heldAt) — a fist holding a spell
//     glows its colour in the drawn palm (拳心透红 …), dimmer as it leaks
//   hint.fizzle()     a puff on the panel (走火)
//   hint.destroy()
//
// `cueOf` (pure) is what the panel says; the tests read it.

import { iconSvg, inkFilter, inkHand } from './pose.js';
import { facesRight, facingOf, handsOf } from './judge.js';

const W = {
  zh: { none: '把手举到摄像头前', edge: { left: '靠左边了', right: '靠右边了', top: '靠上边了', bottom: '靠下边了' }, gone: { left: '手从左边出去了，往右挪回来', right: '手从右边出去了，往左挪回来', top: '手从上边出去了，往下放一点', bottom: '手从下边出去了，往上抬一点', middle: '手不见了，放回框里' }, far: '手离摄像头近一点', near: '手离摄像头远一点', two: '两只手都放进来', next: '结', ok: '',
    turn: { palm: '掌心转向摄像头', side: '手侧过来，小指朝摄像头', back: '掌心转向自己（手背朝摄像头）', up: '手指转向上', flat: '手放平：指尖朝旁边' },
    face: { palm: '掌心朝摄像头', side: '手侧过来，小指朝摄像头', back: '掌心朝自己（手背朝摄像头）' }, up: { up: '手指朝上', side: '指尖朝旁边' }, left: '左手', right: '右手', either: '左右手都可以',
    use: { right: '用右手', left: '用左手' }, other: { right: '（左手也行）', left: '（右手也行）' }, swap: { right: '换右手', left: '换左手' } },
  en: { none: 'Raise your hand to the camera', edge: { left: 'Near the left edge', right: 'Near the right edge', top: 'Near the top', bottom: 'Near the bottom' }, gone: { left: 'Your hand left on the left — move it back right', right: 'Your hand left on the right — move it back left', top: 'Your hand left at the top — lower it a little', bottom: 'Your hand left at the bottom — raise it a little', middle: 'Hand lost — bring it back into the frame' }, far: 'Bring your hand closer', near: 'Move your hand back a little', two: 'Bring both hands in', next: 'Make', ok: '',
    turn: { palm: 'Turn your palm to the camera', side: 'Turn your hand edge-on, little finger to the camera', back: 'Turn your palm to yourself (back of the hand to the camera)', up: 'Point your fingers up', flat: 'Lay your hand flat: fingers sideways' },
    face: { palm: 'palm to the camera', side: 'edge-on, little finger to the camera', back: 'palm to yourself (back of the hand to the camera)' }, up: { up: 'fingers up', side: 'fingers sideways' }, left: 'Left hand', right: 'Right hand', either: 'either hand either side',
    use: { right: 'Right hand', left: 'Left hand' }, other: { right: ' (the left works too)', left: ' (the right works too)' }, swap: { right: 'Switch to your right hand', left: 'Switch to your left hand' } },
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

/** The shapes a target seal asks of each hand: one for a one-hand seal; a two-hand seal's `a` and `b` (or `each`). */
const shapesOf = (seal) => (!seal ? [] : handsOf(seal) === 2 ? [seal.a ?? seal.each, seal.b ?? seal.each].filter(Boolean) : [seal]);

/** Is a hand in view turned a way the target reads poorly? → { to: 'palm' | 'side' | 'back' | 'up' | 'flat' } | null.
    `world` · `handed`: eye.js's (handed: the player's own 'Left' | 'Right'); `orient`: jieyin.json `orient`. A hand
    fits if it faces as ANY of the target's shapes asks; else the first shape says the way to turn. */
export function turnOf({ world = [], handed = [], seal, orient = {} }) {
  const shapes = shapesOf(seal);
  if (!shapes.length) return null;
  // A one-hand seal that takes only its own hand (`hand` + `handOnly`): the other hand is told to switch.
  if (handsOf(seal) !== 2 && seal.hand && seal.handOnly && handed[0] && handed[0].toLowerCase() !== seal.hand) return { to: 'hand', hand: seal.hand };
  for (let i = 0; i < world.length; i++) {
    const f = facingOf(world[i], handed[i], orient);
    if (!f || shapes.some((sh) => facesRight(sh, f))) continue;
    const sh = shapes[0], faceOk = f.face === 'unknown' || !sh.face || sh.face.includes(f.face);
    return { to: faceOk ? (sh.up?.[0] === 'side' ? 'flat' : 'up') : sh.face[0] };
  }
  return null;
}

/** How the target seal wants the hands to face, in words: one line (two-hand: 左手… · 右手…, and whether they may swap). */
export function facingLine(seal, lang = 'zh') {
  const w = W[lang === 'en' ? 'en' : 'zh'], one = (sh) => [w.face[sh?.face?.[0]], w.up[sh?.up?.[0]]].filter(Boolean).join(lang === 'en' ? ', ' : '，');
  if (!seal) return '';
  if (handsOf(seal) !== 2) {
    // Which hand, fixed (Hanli 10-21: 「告诉玩家, 用左手还是右手, 手掌朝自己还是摄像头」): `hand`, and the other too unless `handOnly`.
    const hand = seal.hand ? `${w.use[seal.hand]}${seal.handOnly ? '' : w.other[seal.hand]}` : '';
    return [hand, one(seal)].filter(Boolean).join(lang === 'en' ? ', ' : '，');
  }
  const sides = seal.sides ?? {}, a = seal.a ?? seal.each, b = seal.b ?? seal.each;
  const same = one(a) === one(b);
  const parts = sides.left ? (same ? [one(a)] : [`${w.left}${lang === 'en' ? ': ' : ''}${one(sides.left === 'a' ? a : b)}`, `${w.right}${lang === 'en' ? ': ' : ''}${one(sides.left === 'a' ? b : a)}`]) : [one(a)];
  return [...parts, sides.either === false ? '' : w.either].filter(Boolean).join(lang === 'en' ? ' · ' : '；');
}

const sayOf = (cue, w) => (cue.kind === 'edge' ? w.edge[cue.side] : cue.kind === 'gone' ? w.gone[cue.side] : cue.kind === 'turn' ? (cue.to === 'hand' ? w.swap[cue.hand] : w.turn[cue.to]) : w[cue.kind] ?? '');

/** A three-quarter arc round the drawn hand, from upper left over the top to lower right — 'turn it' (its arrowhead
    is the path's marker). */
function arcPath(cx, cy, r) {
  const pt = (deg) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)].map((n) => n.toFixed(1));
  const [x0, y0] = pt(-160), [x1, y1] = pt(50);
  return `M${x0},${y0} A${r.toFixed(1)},${r.toFixed(1)} 0 1 1 ${x1},${y1}`;
}

let uid = 0;
export function handHint(container, { lang = 'zh', size = 'compact', seals = {}, knobs = {} } = {}) {
  const w = W[lang === 'en' ? 'en' : 'zh'], doc = container.ownerDocument, id = `jyink${++uid}`;
  const el = doc.createElement('div');
  el.className = `jy-hint-panel is-${size === 'large' ? 'large' : 'compact'}`;
  el.innerHTML = `<div class="jy-frame" data-edge=""><svg class="jy-view" preserveAspectRatio="xMidYMid meet"><defs>${inkFilter(id)}<marker id="${id}a" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#c23b22"/></marker></defs><g class="jy-glow"></g><g class="jy-hands" filter="url(#${id})"></g>`
    + `<circle class="jy-hold-bg" r="0"/><circle class="jy-hold" r="0" pathLength="100"/><path class="jy-turn" d="" marker-end="url(#${id}a)"/></svg><i class="jy-arrow" aria-hidden="true"></i></div>`
    + `<div class="jy-target"><div class="jy-target-icon"></div><b class="jy-target-name"></b><small class="jy-target-face"></small></div><p class="jy-cue" role="status"></p>`;
  container.append(el);
  const $ = (s) => el.querySelector(s);
  let last = null, target, puff = 0, drawn = null, turnSince = null;

  const drawTarget = (t) => {
    if (t === target) return;
    target = t;
    const s = seals[t];
    $('.jy-target-icon').innerHTML = s ? iconSvg(s, size === 'large' ? 76 : 44, { lang, hand: s.hand }) : '';
    $('.jy-target-face').textContent = facingLine(s, lang);
    $('.jy-target-name').textContent = s ? `${w.next} ${s.name[lang] ?? s.name.zh}` : '';
    el.classList.toggle('is-two', handsOf(s) === 2);
  };

  return {
    update({ image = [], aspect = 4 / 3, target: t = null, progress = 0, right = false, now = globalThis.performance?.now() ?? 0, world = null, handed = [], held = [] } = {}) {
      drawTarget(t);
      const H = 100, Wd = H * aspect, seen = image.filter((h) => h?.length >= 21).map((h) => mirrored(h, aspect));
      const svg = $('.jy-view');
      svg.setAttribute('viewBox', `0 0 ${Wd.toFixed(1)} ${H}`);
      const px = (h) => h.map((p) => ({ x: p.x * H, y: p.y * H }));
      if (image !== drawn) { drawn = image; $('.jy-hands').innerHTML = seen.map((h) => inkHand(px(h), lengthOf(h) * H)).join(''); } // new hands only
      if (seen.length) last = { at: now, box: boxOf(seen) };
      // A held spell (扣): its colour glowing in the fist's palm, dimmer as it leaks.
      $('.jy-glow').innerHTML = held.filter((x) => seen[x.at]).map((x) => {
        const h = seen[x.at], c = [0, 5, 9, 13, 17].reduce((a, i) => ({ x: a.x + h[i].x / 5, y: a.y + h[i].y / 5 }), { x: 0, y: 0 });
        return `<circle class="jy-held" cx="${(c.x * H).toFixed(1)}" cy="${(c.y * H).toFixed(1)}" r="${(lengthOf(h) * H * 0.75).toFixed(1)}" fill="${plain(x.glow)}" fill-opacity="${(0.25 + 0.55 * Math.max(0, Math.min(1, x.left))).toFixed(2)}"/>`;
      }).join('');
      let cue = cueOf({ seen, last, now, aspect, want: handsOf(seals[t]) }, knobs);
      // Turned the wrong way for this seal (world points + which hand; a game that passes none gets no turn cue), and
      // not making it: after `orient.turnMs`, ask the hand to turn (Hanli 10-21: 「要旋转一下手」).
      const turn = world && !right && (cue.kind === 'ok' || cue.kind === 'two') ? turnOf({ world, handed, seal: seals[t], orient: knobs.orient }) : null;
      turnSince = turn ? turnSince ?? now : null;
      if (turn && now - turnSince >= (knobs.orient?.turnMs ?? 700)) cue = { kind: 'turn', to: turn.to, hand: turn.hand };
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
        // The turn cue: a curved brush arrow round the drawn hand.
        $('.jy-turn').setAttribute('d', cue.kind === 'turn' ? arcPath(cx, cy, r + 4) : '');
      } else { ring.setAttribute('r', '0'); bg.setAttribute('r', '0'); $('.jy-turn').setAttribute('d', ''); }
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
