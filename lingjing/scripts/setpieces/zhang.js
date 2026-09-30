// setpieces/zhang.js — 卷一's one 大场面 (哇时刻 ②, Hanli 2026-09-30): 漳水立起.
// 第十回, as the book tells it: the river stops, stands up as a wall with a
// thousand fish leaping in it, 冰夷 rises from the black water on his two
// dragons, the dragons try the boy who would not kneel, the wall falls back;
// under the river the 洛书 seal (six and eight swapped, then right) opens, and
// the first 鼎 rises and shrinks into his hand as her second tail lights.
// After it the page plays what already exists — 银月's memory 1 (memory.js)
// and 鼎归 (fx.js / inkmap.js); this piece never draws them again.
//
// Ink only (colour is hers); words are never painted — each beat names the
// book line it goes with, and the dialogue box (or the preview) says it.
// `build` is handed Pixi and GSAP by setpiece.js and returns one paused
// timeline per beat; the runner plays them, holds between, and skips.

/// The beats in the book's order. `ms` is the beat's own length; `line` is the
/// passage it follows — a verbatim piece of 10-第十回.md (the test holds it so).
export const BEATS = [
  { id: 'still', ms: 2800, line: { zh: '不是退，是停：河面上的浪一道一道，全悬在了半空，一滴也不落下来。', en: 'Not ebbing — stopping. Wave after wave hung in the air, and not one drop fell.' } },
  { id: 'rise', ms: 4800, line: { zh: '话音未落，漳水竟站了起来。不是涨，是站——一整条河从河床上立起来，立成了一道墙。', en: 'Before she had finished, the Zhang stood up. Not rising — standing: a whole river lifted off its bed into a wall.' } },
  { id: 'bingyi', ms: 3600, line: { zh: '水墙正中，那片最深的黑水里，慢慢浮上来一个人影：人的脸，披着水做的衣裳，脚底下踩着两条龙', en: 'At the heart of the wall, in the deepest black water, a figure rose: a man’s face, a robe of water, two dragons under his feet.' } },
  { id: 'trial', ms: 5200, line: { zh: '两颗比灶屋还大的龙头，在他面前一尺的地方停住了。', en: 'Two dragon heads, each bigger than the kitchen hut, stopped a foot from his face.' } },
  { id: 'fall', ms: 3400, line: { zh: '他身后那道水墙，慢慢地、慢慢地落了下去。', en: 'Behind him the wall of water came down, slowly, slowly.' } },
  { id: 'seal', ms: 4600, line: { zh: '他拿起最后那块石头，五个点的，按进了正中那一格', en: 'He took the last stone, the one with five dots, and pressed it into the middle square.' } },
  { id: 'ding', ms: 4200, line: { zh: '木牌上那只蜷着的小狐狸，九条尾巴里，第二条亮了。', en: 'On the token, of the curled fox’s nine tails, the second lit.' } },
];

export const TITLE = { zh: '漳水立起', en: 'The Zhang Stands Up' };
export const ART = { bingyi: 'art/people/bingyi.webp' };

/// 洛书 as the stones lie: 戴九履一，左三右七，二四为肩，六八为足，五居中央.
export const LUOSHU = [[4, 9, 2], [3, 5, 7], [8, 1, 6]];

const INK = 0x231f1a, PAPER = 0xf5efe1;

/* ── Textures drawn on the spot ── */

function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return c;
}

/// The wall of water: vertical ink streaks, paler at the heart (the book's black
/// water is its rim; the figure must read against it).
const wallCanvas = () => canvas(256, 512, (g, w, h) => {
  const grad = g.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, 'rgba(35,31,26,0.92)');
  grad.addColorStop(0.3, 'rgba(70,78,80,0.72)');
  grad.addColorStop(0.5, 'rgba(120,128,126,0.55)');
  grad.addColorStop(0.7, 'rgba(70,78,80,0.72)');
  grad.addColorStop(1, 'rgba(35,31,26,0.92)');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.lineCap = 'round';
  for (let i = 0; i < 140; i += 1) {
    const x = Math.random() * w, y = Math.random() * h, l = 30 + Math.random() * 120;
    g.strokeStyle = `rgba(20,18,16,${0.08 + Math.random() * 0.18})`;
    g.lineWidth = 0.6 + Math.random() * 2.4;
    g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + 4, y + l * 0.3, x - 4, y + l * 0.7, x + 2, y + l); g.stroke();
  }
  for (let i = 0; i < 60; i += 1) {
    g.strokeStyle = `rgba(245,239,225,${0.08 + Math.random() * 0.14})`;
    g.lineWidth = 0.5 + Math.random();
    const x = Math.random() * w, y = Math.random() * h;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 6, y + 20 + Math.random() * 60); g.stroke();
  }
});

/// One carp in ink, head up (the wall's fish all leap one way).
const fishCanvas = () => canvas(40, 80, (g) => {
  g.fillStyle = 'rgba(28,25,22,0.9)';
  g.beginPath(); g.ellipse(20, 34, 9, 22, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(20, 52); g.lineTo(8, 76); g.quadraticCurveTo(20, 66, 32, 76); g.closePath(); g.fill();
  g.fillStyle = 'rgba(245,239,225,0.8)';
  g.beginPath(); g.arc(16, 20, 1.8, 0, Math.PI * 2); g.fill();
});

/// A sunk wedding boat, holed, a sodden red-gone-black gown in it.
const boatCanvas = () => canvas(120, 40, (g) => {
  g.fillStyle = 'rgba(35,31,26,0.85)';
  g.beginPath(); g.moveTo(4, 12); g.quadraticCurveTo(60, 44, 116, 12); g.lineTo(104, 10); g.quadraticCurveTo(60, 30, 16, 10); g.closePath(); g.fill();
  g.fillStyle = 'rgba(70,24,20,0.8)';
  g.beginPath(); g.ellipse(58, 16, 16, 5, 0.1, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(245,239,225,0.9)';
  g.beginPath(); g.arc(40, 24, 2.5, 0, Math.PI * 2); g.fill();
});

/// A stone of the seal with its dots, 洛书 fashion (odd white, even black).
const stoneCanvas = (n) => canvas(96, 96, (g, w) => {
  g.fillStyle = '#8f8a80';
  g.beginPath(); g.roundRect(6, 6, w - 12, w - 12, 10); g.fill();
  g.strokeStyle = 'rgba(35,31,26,0.6)'; g.lineWidth = 2; g.stroke();
  const pts = [];
  const r = Math.ceil(Math.sqrt(n));
  for (let i = 0; i < n; i += 1) pts.push([(i % r + 0.5) / r, (Math.floor(i / r) + 0.5) / Math.ceil(n / r)]);
  for (const [x, y] of pts) {
    g.beginPath(); g.arc(18 + x * (w - 36), 18 + y * (w - 36), 5.5, 0, Math.PI * 2);
    if (n % 2) { g.fillStyle = '#f5efe1'; g.fill(); g.strokeStyle = '#231f1a'; g.lineWidth = 1.5; g.stroke(); } else { g.fillStyle = '#231f1a'; g.fill(); }
  }
});

/// The 鼎: three legs, two ears, a round belly — a brush drawing.
const dingCanvas = () => canvas(256, 256, (g) => {
  g.strokeStyle = '#231f1a'; g.fillStyle = 'rgba(35,31,26,0.82)'; g.lineCap = 'round'; g.lineJoin = 'round';
  g.lineWidth = 7;
  g.beginPath(); g.moveTo(70, 70); g.lineTo(70, 40); g.lineTo(96, 40); g.lineTo(96, 70); g.stroke();
  g.beginPath(); g.moveTo(160, 70); g.lineTo(160, 40); g.lineTo(186, 40); g.lineTo(186, 70); g.stroke();
  g.beginPath(); g.moveTo(40, 72); g.lineTo(216, 72); g.quadraticCurveTo(222, 180, 128, 190); g.quadraticCurveTo(34, 180, 40, 72); g.closePath(); g.fill();
  g.lineWidth = 9;
  for (const x of [72, 128, 184]) { g.beginPath(); g.moveTo(x, 180); g.lineTo(x + (x - 128) * 0.12, 236); g.stroke(); }
  g.strokeStyle = 'rgba(245,239,225,0.35)'; g.lineWidth = 2;
  for (let i = 0; i < 5; i += 1) { g.beginPath(); g.moveTo(58, 98 + i * 16); g.bezierCurveTo(100, 92 + i * 16, 156, 104 + i * 16, 198, 98 + i * 16); g.stroke(); }
});

/// The token: a curled fox, nine tails round it; which tails glow is a layer above.
const tokenCanvas = () => canvas(160, 160, (g) => {
  g.fillStyle = '#b9a98a'; g.beginPath(); g.arc(80, 80, 72, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#231f1a'; g.lineWidth = 3; g.stroke();
  g.fillStyle = 'rgba(35,31,26,0.85)';
  g.beginPath(); g.ellipse(80, 86, 22, 15, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(62, 76); g.lineTo(58, 60); g.lineTo(70, 70); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(98, 76); g.lineTo(102, 60); g.lineTo(90, 70); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(35,31,26,0.55)'; g.lineWidth = 3; g.lineCap = 'round';
  for (let i = 0; i < 9; i += 1) { const a = Math.PI * (0.15 + i * 0.1); g.beginPath(); g.moveTo(80, 90); g.quadraticCurveTo(80 + Math.cos(a) * 30, 90 + Math.sin(a) * 30, 80 + Math.cos(a) * 58, 90 + Math.sin(a) * 50); g.stroke(); }
});
export const TAIL_ANGLE = (i) => Math.PI * (0.15 + i * 0.1);


/// A soft oval alpha mask: whole in the middle, gone at the rim — so a painting's paper never shows its box.
const ovalCanvas = (w, h, inner = 0.55) => canvas(w, h, (g) => {
  g.save(); g.translate(w / 2, h / 2); g.scale(1, h / w);
  const r = g.createRadialGradient(0, 0, (w / 2) * inner, 0, 0, w / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.beginPath(); g.arc(0, 0, w / 2, 0, Math.PI * 2); g.fill(); g.restore();
});

/// A painting (or a piece of it) with its edge faded to nothing, baked into one canvas —
/// no mask at draw time (a masked sprite under multiply draws black in Pixi 8, seen live).
function feathered(img, sx, sy, sw, sh, inner = 0.55, maxW = 720) {
  const k = Math.min(1, maxW / sw), w = Math.round(sw * k), h = Math.round(sh * k);
  return canvas(w, h, (g) => {
    g.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(ovalCanvas(w, h, inner), 0, 0);
  });
}

/// Paper fibres for the torn edge of the wall (as fx.js does the soak).
const fibreCanvas = () => canvas(256, 256, (g, s) => {
  g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, s, s);
  g.filter = 'blur(5px)';
  for (let i = 0; i < 80; i += 1) { g.fillStyle = `rgb(${Math.random() * 255 | 0},${Math.random() * 255 | 0},128)`; g.beginPath(); g.arc(Math.random() * s, Math.random() * s, 6 + Math.random() * 22, 0, Math.PI * 2); g.fill(); }
});

const grainCanvas = () => canvas(256, 256, (g, s) => {
  const img = g.createImageData(s, s);
  for (let i = 0; i < img.data.length; i += 4) { const v = 150 + Math.random() * 105 | 0; img.data[i] = v; img.data[i + 1] = v - 6; img.data[i + 2] = v - 18; img.data[i + 3] = 255; }
  g.putImageData(img, 0, 0);
});

/// A little ink figure: `open` spreads the arms (the boy standing between the dragons and her).
function figure(PIXI, h, { open = false, alpha = 1 } = {}) {
  const f = new PIXI.Graphics();
  const s = h / 100;
  f.circle(0, -88 * s, 8 * s).fill({ color: INK, alpha });
  f.moveTo(0, -78 * s).lineTo(0, -38 * s).stroke({ width: 5 * s, color: INK, alpha, cap: 'round' });
  f.moveTo(0, -38 * s).lineTo(-10 * s, 0).moveTo(0, -38 * s).lineTo(10 * s, 0).stroke({ width: 4.5 * s, color: INK, alpha, cap: 'round' });
  if (open) f.moveTo(-30 * s, -70 * s).lineTo(0, -66 * s).lineTo(30 * s, -70 * s).stroke({ width: 4 * s, color: INK, alpha, cap: 'round' });
  else f.moveTo(-12 * s, -42 * s).lineTo(0, -68 * s).lineTo(12 * s, -42 * s).stroke({ width: 4 * s, color: INK, alpha, cap: 'round' });
  return f;
}

/// Build the stage and one paused timeline per beat. `env` is {PIXI, gsap, app,
/// W, H, art: {bingyi: HTMLImageElement}}; everything is in W×H units under `root`.
export function build({ PIXI, gsap, app, root, W, H, art }) {
  const tick = [];
  const every = (fn) => { tick.push(fn); };
  const riverTop = H * 0.56, riverBot = H * 0.74, bankY = H * 0.86;
  // The wall stands on the river's far third; the near bed lies bare in front of it, boats and all.
  const wallFoot = riverTop + (riverBot - riverTop) * 0.3;

  // Paper, sky, the far bank (邺城's wall and willows).
  root.addChild(new PIXI.Graphics().rect(0, 0, W, H).fill(PAPER));
  const far = new PIXI.Graphics();
  far.rect(W * 0.52, riverTop - H * 0.07, W * 0.4, H * 0.07).fill({ color: INK, alpha: 0.28 });
  for (let x = W * 0.54; x < W * 0.9; x += W * 0.04) far.rect(x, riverTop - H * 0.085, W * 0.018, H * 0.016).fill({ color: INK, alpha: 0.28 });
  // Willows: a leaning trunk, a crown of small strokes, long strands hanging straight down.
  for (let i = 0; i < 6; i += 1) {
    const x = W * (0.05 + i * 0.075), y = riverTop - H * 0.005, top = y - H * (0.09 + (i % 2) * 0.02);
    far.moveTo(x, y).quadraticCurveTo(x - 4, (y + top) / 2, x + 6, top).stroke({ width: 3, color: INK, alpha: 0.4 });
    for (let k = 0; k < 14; k += 1) {
      const sx = x + 6 + (k - 7) * W * 0.004, sy = top + Math.abs(k - 7) * 1.5, len = H * (0.035 + ((k * 7) % 5) * 0.008);
      far.moveTo(sx, sy).quadraticCurveTo(sx + 2, sy + len * 0.5, sx - 1, sy + len).stroke({ width: 1, color: INK, alpha: 0.28 });
    }
  }
  root.addChild(far);

  // The river and its waves (they run, then hang).
  const river = new PIXI.Graphics().rect(0, riverTop, W, riverBot - riverTop).fill({ color: 0x6f7a78, alpha: 0.35 });
  root.addChild(river);
  const waves = new PIXI.Graphics();
  root.addChild(waves);
  const wv = { run: 1, phase: 0, alpha: 1 };
  every((dt) => {
    wv.phase += dt * 0.0012 * wv.run;
    waves.clear();
    for (let r = 0; r < 5; r += 1) {
      const y = riverTop + (r + 0.6) * (riverBot - riverTop) / 5.4;
      for (let x = -60; x < W + 60; x += 90) {
        const ox = ((x + wv.phase * 90 * (r % 2 ? 1 : -1)) % (W + 120) + W + 120) % (W + 120) - 60;
        waves.moveTo(ox, y).quadraticCurveTo(ox + 22, y - 9 - r, ox + 44, y).stroke({ width: 1.6, color: INK, alpha: 0.4 * wv.alpha });
      }
    }
  });

  // The riverbed the wall leaves: mud, twenty holed boats, twenty gowns.
  const bed = new PIXI.Container();
  bed.alpha = 0;
  bed.addChild(new PIXI.Graphics().rect(0, riverTop, W, riverBot - riverTop).fill({ color: 0x4a4238, alpha: 0.75 }));
  const boatTex = PIXI.Texture.from(boatCanvas());
  for (let i = 0; i < 20; i += 1) {
    const b = new PIXI.Sprite(boatTex);
    b.anchor.set(0.5);
    b.scale.set(0.55 + (i % 3) * 0.12);
    b.position.set(W * (0.05 + (i * 0.047) % 0.9), riverTop + (riverBot - riverTop) * (0.42 + ((i * 37) % 50) / 100));
    b.rotation = ((i * 53) % 40 - 20) / 100;
    bed.addChild(b);
  }
  root.addChild(bed);

  // The wall: a sheet of ink water grown up from the river, torn at the edge, fish leaping in it.
  const wallBox = { x0: W * 0.04, x1: W * 0.96 };
  const wallP = { top: riverTop + (riverBot - riverTop) * 0.3, fish: 0 }; // no wall until the river stands up
  const wall = new PIXI.Container();
  const wallTex = PIXI.Texture.from(wallCanvas());
  const wallSprite = new PIXI.Sprite(wallTex);
  wallSprite.position.set(wallBox.x0, 0);
  wallSprite.width = wallBox.x1 - wallBox.x0; wallSprite.height = riverBot;
  wall.addChild(wallSprite);
  const fishTex = PIXI.Texture.from(fishCanvas());
  const fish = [];
  for (let i = 0; i < 70; i += 1) {
    const f = new PIXI.Sprite(fishTex);
    f.anchor.set(0.5);
    const sc = 0.35 + Math.random() * 0.5;
    f.scale.set(sc);
    f.position.set(wallBox.x0 + 20 + Math.random() * (wallBox.x1 - wallBox.x0 - 40), riverTop - Math.random() * riverTop);
    f.speed = 0.08 + Math.random() * 0.12;
    f.wig = Math.random() * 6;
    wall.addChild(f);
    fish.push(f);
  }
  const wallMask = new PIXI.Graphics();
  wall.addChild(wallMask);
  wall.mask = wallMask;
  const fibreTex = PIXI.Texture.from(fibreCanvas());
  fibreTex.source.addressMode = 'repeat';
  const fibres = new PIXI.Sprite(fibreTex);
  fibres.scale.set(3); fibres.renderable = false;
  const wallLayer = new PIXI.Container();
  wallLayer.addChild(new PIXI.Graphics().rect(0, 0, W, H).fill({ color: 0, alpha: 0.001 }), wall, fibres);
  wallLayer.filters = [new PIXI.DisplacementFilter({ sprite: fibres, scale: 26 })];
  root.addChild(wallLayer);
  every((dt) => {
    wallMask.clear().rect(wallBox.x0, wallP.top, wallBox.x1 - wallBox.x0, Math.max(0, wallFoot - wallP.top)).fill(0xffffff);
    for (const f of fish) {
      f.alpha = wallP.fish;
      if (wallP.fish <= 0) continue;
      f.y -= f.speed * dt * wallP.fish;
      f.x += Math.sin((f.y + f.wig * 40) / 30) * 0.4;
      f.rotation = Math.sin((f.y + f.wig * 50) / 60) * 0.35;
      if (f.y < wallP.top - 30) f.y = wallFoot + 20;
    }
  });

  // 冰夷 on his two dragons, rising out of the black water.
  const bw = art.bingyi.naturalWidth || 640, bh = art.bingyi.naturalHeight || 960;
  const god = new PIXI.Container();
  // A pale pool opens in the black water for him to rise through (the figure must read against it).
  const halo = new PIXI.Graphics().ellipse(0, 0, H * 0.24, H * 0.34).fill({ color: 0xe9e4d6, alpha: 0.85 });
  halo.filters = [new PIXI.BlurFilter({ strength: 40, quality: 4 })];
  halo.scale.set(0.01);
  const god0 = new PIXI.Sprite(PIXI.Texture.from(feathered(art.bingyi, 0, 0, bw, bh, 0.62)));
  god0.anchor.set(0.5);
  const gh = Math.min(H * 0.58, W * 0.62 * bh / bw);
  god0.height = gh; god0.width = gh * bw / bh;
  god0.blendMode = 'multiply';
  god.addChild(halo, god0);
  god.position.set(W / 2, H * 0.62);
  god.alpha = 0;
  root.addChild(god);

  // The two heads, cropped from the same painting and feathered, for the trial.
  const head = (x, y, w, h, flip) => {
    const c = new PIXI.Container();
    const s = new PIXI.Sprite(PIXI.Texture.from(feathered(art.bingyi, x * bw / 640, y * bh / 960, w * bw / 640, h * bh / 960, 0.45)));
    s.anchor.set(0.5);
    s.width = w; s.height = h;
    s.blendMode = 'multiply';
    c.addChild(s);
    c.scale.set(flip ? -1 : 1, 1);
    c.alpha = 0;
    return c;
  };
  const leftHead = head(30, 70, 240, 280, true), rightHead = head(370, 50, 240, 290, true);

  // The near bank, the boy, and — in the trial — the tofu girl behind him.
  root.addChild(new PIXI.Graphics().rect(0, riverBot, W, H - riverBot).fill({ color: 0xd9cfbb, alpha: 0.9 }));
  const bankLine = new PIXI.Graphics().moveTo(0, riverBot).quadraticCurveTo(W / 2, riverBot + 12, W, riverBot).stroke({ width: 2, color: INK, alpha: 0.5 });
  root.addChild(bankLine);
  const fh = H * 0.075;
  const boy = figure(PIXI, fh), boyOpen = figure(PIXI, fh, { open: true });
  const girl = figure(PIXI, fh * 0.9, { alpha: 0.55 });
  boy.position.set(W / 2, bankY); boyOpen.position.set(W / 2, bankY); boyOpen.alpha = 0;
  girl.position.set(W / 2 + W * 0.05, bankY + 6); girl.alpha = 0;
  root.addChild(girl, boy, boyOpen);
  // The heads come down in front of the bank, eye to eye with him.
  root.addChild(leftHead, rightHead);
  const mud = new PIXI.Container();
  const mudDots = [];
  for (let i = 0; i < 36; i += 1) { const d = new PIXI.Graphics().circle(0, 0, 3 + Math.random() * 6).fill({ color: 0x4a4238, alpha: 0.85 }); d.alpha = 0; mud.addChild(d); mudDots.push(d); }
  root.addChild(mud);
  const sweep = new PIXI.Graphics();
  root.addChild(sweep);
  const sw = { p: 0, a: 0 };
  every(() => {
    sweep.clear();
    if (sw.a <= 0) return;
    const x = W * (1.1 - sw.p * 1.3);
    sweep.moveTo(x, bankY + 10).bezierCurveTo(x + 80, bankY - 60, x + 200, bankY - 30, x + 320, bankY + 4).stroke({ width: 16, color: 0x4a4238, alpha: 0.6 * sw.a, cap: 'round' });
  });
  const touch = new PIXI.Graphics().circle(0, 0, fh * 0.4).stroke({ width: 2, color: 0xffffff, alpha: 1 });
  touch.position.set(W / 2, bankY - fh * 0.88); touch.alpha = 0;
  root.addChild(touch);

  // The cold (breath turns white) and the sun blotted out.
  const cold = new PIXI.Graphics().rect(0, 0, W, H).fill({ color: 0x9fb2b8, alpha: 1 });
  cold.alpha = 0; cold.blendMode = 'multiply';
  root.addChild(cold);
  const breath = new PIXI.Graphics().circle(0, 0, fh * 0.25).fill({ color: 0xffffff, alpha: 0.9 });
  breath.filters = [new PIXI.BlurFilter({ strength: 6 })];
  breath.position.set(W / 2 + fh * 0.18, bankY - fh * 0.9); breath.alpha = 0;
  root.addChild(breath);

  // Under the river: the dark, the seal of nine stones, the beam, the 鼎, the token.
  const under = new PIXI.Container();
  under.alpha = 0;
  under.addChild(new PIXI.Graphics().rect(0, 0, W, H).fill({ color: 0x0f1a1e, alpha: 1 }));
  const glow = new PIXI.Graphics().circle(0, 0, W * 0.2).fill({ color: 0xcfd8d0, alpha: 0.35 });
  glow.filters = [new PIXI.BlurFilter({ strength: 40, quality: 3 })];
  glow.position.set(W / 2, H * 0.9);
  under.addChild(glow);
  const cell = Math.min(W, H) * 0.15, gx = W / 2 - cell * 1.5, gy = H * 0.3;
  const board = new PIXI.Graphics();
  for (let r = 0; r <= 3; r += 1) board.moveTo(gx, gy + r * cell).lineTo(gx + 3 * cell, gy + r * cell).stroke({ width: 2, color: 0xcfd8d0, alpha: 0.5 });
  for (let c = 0; c <= 3; c += 1) board.moveTo(gx + c * cell, gy).lineTo(gx + c * cell, gy + 3 * cell).stroke({ width: 2, color: 0xcfd8d0, alpha: 0.5 });
  under.addChild(board);
  const lights = [], stones = {};
  const at = (r, c) => [gx + (c + 0.5) * cell, gy + (r + 0.5) * cell];
  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) {
    const l = new PIXI.Graphics().rect(gx + c * cell + 3, gy + r * cell + 3, cell - 6, cell - 6).fill({ color: 0xf2e6c4, alpha: 0.85 });
    l.alpha = 0; under.addChild(l); lights.push({ l, r, c });
  }
  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) {
    const n = LUOSHU[r][c];
    const s = new PIXI.Sprite(PIXI.Texture.from(stoneCanvas(n)));
    s.anchor.set(0.5); s.width = s.height = cell * 0.82;
    const [x, y] = at(r, c);
    s.home = { x, y };
    s.position.set(x, y + H * 0.5); s.alpha = 0;
    under.addChild(s); stones[n] = s;
  }
  const beam = new PIXI.Graphics().rect(-cell * 0.5, -H, cell, H).fill({ color: 0xf7efd8, alpha: 0.9 });
  beam.filters = [new PIXI.BlurFilter({ strength: 18 })];
  beam.position.set(W / 2, gy + 1.5 * cell); beam.scale.set(0.1, 0); beam.blendMode = 'screen';
  under.addChild(beam);
  const ding = new PIXI.Sprite(PIXI.Texture.from(dingCanvas()));
  ding.anchor.set(0.5); ding.position.set(W / 2, H * 1.15); ding.scale.set(2.2); ding.alpha = 0;
  under.addChild(ding);
  const dusk = new PIXI.Graphics().rect(0, 0, W, H).fill({ color: 0x3a3130, alpha: 1 });
  dusk.alpha = 0;
  under.addChild(dusk);
  const moon = new PIXI.Graphics().circle(W * 0.8, H * 0.16, W * 0.04).fill({ color: 0xf2e6c4, alpha: 0.95 });
  moon.alpha = 0; under.addChild(moon);
  const token = new PIXI.Container();
  const tokenS = new PIXI.Sprite(PIXI.Texture.from(tokenCanvas()));
  tokenS.anchor.set(0.5);
  token.addChild(tokenS);
  const tailGlow = (i) => {
    const a = TAIL_ANGLE(i), g = new PIXI.Graphics();
    g.moveTo(0, 10).quadraticCurveTo(Math.cos(a) * 30, 10 + Math.sin(a) * 30, Math.cos(a) * 58, 10 + Math.sin(a) * 50).stroke({ width: 5, color: 0xe8eef2, alpha: 1, cap: 'round' });
    g.filters = [new PIXI.BlurFilter({ strength: 2 })];
    return g;
  };
  const tail1 = tailGlow(0), tail2 = tailGlow(1);
  tail2.alpha = 0;
  token.addChild(tail1, tail2);
  token.position.set(W / 2, H * 0.76); token.scale.set(Math.min(W, H) / 700); token.alpha = 0;
  under.addChild(token);
  root.addChild(under);

  const grainTex = PIXI.Texture.from(grainCanvas());
  grainTex.source.addressMode = 'repeat';
  const grain = new PIXI.TilingSprite({ texture: grainTex, width: W, height: H });
  grain.alpha = 0.1; grain.blendMode = 'multiply';
  root.addChild(grain);

  app.ticker.add((t) => { for (const f of tick) f(t.deltaMS); });

  const s = (ms) => ms / 1000;
  const tl = () => gsap.timeline({ paused: true });
  const [lx, ly] = [W / 2 - W * 0.2, H * 0.3], [rx, ry] = [W / 2 + W * 0.2, H * 0.28];
  const beats = {
    still: () => tl()
      .to(wv, { run: 0, duration: s(1400), ease: 'power2.out' }, 0)
      .to(cold, { alpha: 0.55, duration: s(1600) }, s(400))
      .to(breath, { keyframes: [{ alpha: 0.9, duration: 0.5 }, { alpha: 0, y: breath.y - fh * 0.3, duration: 1 }] }, s(1100)),
    rise: () => tl()
      .to(wallP, { top: H * 0.02, duration: s(3600), ease: 'power2.inOut' }, 0)
      .to(wv, { alpha: 0, duration: s(800) }, 0)
      .to(river, { alpha: 0, duration: s(1200) }, s(600))
      .to(bed, { alpha: 1, duration: s(1400) }, s(1200))
      .to(wallP, { fish: 1, duration: s(1400) }, s(900))
      .to(cold, { alpha: 0.75, duration: s(2400) }, s(800))
      .to(root, { keyframes: [{ x: 2, duration: 0.05 }, { x: -2, duration: 0.05 }, { x: 1, duration: 0.05 }, { x: 0, duration: 0.05 }], repeat: 6 }, s(300)),
    bingyi: () => tl()
      .to(halo.scale, { x: 1, y: 1, duration: s(1800), ease: 'power2.out' }, 0)
      .to(god, { alpha: 1, duration: s(2200), ease: 'power1.inOut' }, s(300))
      .to(god, { y: H * 0.36, duration: s(3200), ease: 'power2.out' }, s(200)),
    trial: () => {
      leftHead.position.set(god.x - god0.width * 0.27, god.y - god0.height * 0.3);
      rightHead.position.set(god.x + god0.width * 0.27, god.y - god0.height * 0.31);
      leftHead.scale.set(-0.9 * gh / 960 * 2.2, 0.9 * gh / 960 * 2.2); rightHead.scale.set(-0.9 * gh / 960 * 2.2, 0.9 * gh / 960 * 2.2);
      const big = gh / 960 * 2.2 * 1.15;
      return tl()
        .set([leftHead, rightHead], { alpha: 1 }, 0)
        .to(god0, { alpha: 0.35, duration: s(300) }, 0)
        // Left dives; he sits down hard in the mud.
        .to(leftHead, { x: W / 2 - W * 0.08, y: bankY - fh * 1.4, duration: s(700), ease: 'power3.in' }, s(100))
        .to(boy, { y: bankY + fh * 0.25, rotation: -0.5, duration: s(250) }, s(650))
        .to(mudDots, { alpha: 1, duration: 0.05 }, s(750))
        .add(() => { for (const d of mudDots) { d.position.set(W / 2 - W * 0.06, bankY - 10); gsap.to(d, { x: d.x + (Math.random() - 0.5) * 220, y: d.y - 40 - Math.random() * 90, duration: 0.5, ease: 'power2.out' }); gsap.to(d, { y: bankY + 20, alpha: 0, duration: 0.6, delay: 0.5, ease: 'power2.in' }); } }, s(750))
        .to(leftHead, { x: lx, y: ly, duration: s(700), ease: 'power2.out' }, s(1100))
        // Right sweeps its tail along the bank; he stumbles under it.
        .to(sw, { a: 1, duration: 0.1 }, s(1500))
        .to(sw, { p: 1, duration: s(900), ease: 'power1.inOut' }, s(1500))
        .to(boy, { y: bankY, rotation: 0, x: W / 2 - W * 0.03, duration: s(300) }, s(1700))
        .to(sw, { a: 0, duration: 0.2 }, s(2400))
        .to(boy, { x: W / 2, duration: s(300) }, s(2400))
        // Both at her; he steps back in front of her, arms open. They stop a foot away.
        .to(girl, { alpha: 0.75, duration: s(300) }, s(2600))
        .to(boy, { alpha: 0, duration: 0.1 }, s(2900)).to(boyOpen, { alpha: 1, duration: 0.1 }, s(2900))
        .to(leftHead, { x: W / 2 - W * 0.15, y: bankY - fh * 1.05, duration: s(700), ease: 'power3.in' }, s(2800))
        .to(rightHead, { x: W / 2 + W * 0.15, y: bankY - fh * 1.05, duration: s(700), ease: 'power3.in' }, s(2800))
        .to(leftHead.scale, { x: -big, y: big, duration: s(700), ease: 'power3.in' }, s(2800))
        .to(rightHead.scale, { x: big, y: big, duration: s(700), ease: 'power3.in' }, s(2800))
        // A touch on the brow, cold as a well in the twelfth month; then they go back up.
        .to(touch, { keyframes: [{ alpha: 1, duration: 0.15 }, { alpha: 0, duration: 0.6 }] }, s(4200))
        .to(touch.scale, { x: 2.2, y: 2.2, duration: 0.75 }, s(4200))
        .to([leftHead, rightHead], { alpha: 0, duration: s(700) }, s(4500))
        .to(god0, { alpha: 1, duration: s(700) }, s(4500));
    },
    fall: () => tl()
      .to(wallP, { top: wallFoot, duration: s(2800), ease: 'power2.in' }, 0)
      .to(wallP, { fish: 0, duration: s(1600) }, s(1200))
      .to(god, { alpha: 0, y: H * 0.5, duration: s(2400) }, s(400))
      .to(bed, { alpha: 0, duration: s(1200) }, s(1800))
      .to(river, { alpha: 1, duration: s(1200) }, s(1800))
      .to(wv, { alpha: 1, run: 0.4, duration: s(1400) }, s(2000))
      .to(cold, { alpha: 0, duration: s(1600) }, s(1800))
      .to([girl, boyOpen], { alpha: 0, duration: s(600) }, s(2600)).to(boy, { alpha: 1, duration: s(600) }, s(2600)),
    seal: () => {
      const t = tl().to(under, { alpha: 1, duration: s(700) }, 0);
      const order = [9, 1, 3, 7, 4, 2];
      order.forEach((n, i) => t.to(stones[n], { alpha: 1, x: stones[n].home.x, y: stones[n].home.y, duration: s(260), ease: 'power2.out' }, s(700 + i * 150)));
      // Six and eight, as a cold hand laid them: swapped.
      t.to(stones[6], { alpha: 1, x: stones[8].home.x, y: stones[8].home.y, duration: s(260) }, s(1600))
        .to(stones[8], { alpha: 1, x: stones[6].home.x, y: stones[6].home.y, duration: s(260) }, s(1700))
        .to(stones[5], { alpha: 1, x: W / 2, y: stones[5].home.y - cell * 0.12, scale: stones[5].scale.x * 1.1, duration: s(300) }, s(2000))
        .to(stones[5], { keyframes: [{ x: W / 2 + 4, duration: 0.05 }, { x: W / 2 - 4, duration: 0.05 }, { x: W / 2, duration: 0.05 }] }, s(2300))
        // 三的底下，是八: he trades them.
        .to(stones[6], { x: stones[6].home.x, y: stones[6].home.y, duration: s(400), ease: 'power2.inOut' }, s(2600))
        .to(stones[8], { x: stones[8].home.x, y: stones[8].home.y, duration: s(400), ease: 'power2.inOut' }, s(2600))
        .to(stones[5], { y: stones[5].home.y, scale: stones[5].scale.x, duration: s(160), ease: 'power4.in' }, s(3100))
        .to(under, { keyframes: [{ x: 3, duration: 0.04 }, { x: -3, duration: 0.04 }, { x: 0, duration: 0.04 }] }, s(3260));
      // Lit from the middle outward, a ring.
      const ring = [...lights].sort((a, b) => (Math.abs(a.r - 1) + Math.abs(a.c - 1)) - (Math.abs(b.r - 1) + Math.abs(b.c - 1)) || Math.atan2(a.r - 1, a.c - 1) - Math.atan2(b.r - 1, b.c - 1));
      ring.forEach((x, i) => t.to(x.l, { alpha: 0.55, duration: s(200) }, s(3300 + i * 80)));
      t.to(beam.scale, { x: 1, y: 1, duration: s(700), ease: 'power2.out' }, s(3900));
      return t;
    },
    ding: () => tl()
      .to([...Object.values(stones), board, ...lights.map((x) => x.l)], { alpha: 0, duration: s(800) }, 0)
      .to(ding, { alpha: 1, duration: s(600) }, 0)
      .to(ding, { y: H * 0.46, duration: s(2400), ease: 'power2.out' }, 0)
      .to(ding.scale, { x: 0.45, y: 0.45, duration: s(2400), ease: 'power2.inOut' }, 0)
      .to(beam, { alpha: 0, duration: s(1400) }, s(1200))
      .to(dusk, { alpha: 0.9, duration: s(1600) }, s(1400))
      .to(moon, { alpha: 1, duration: s(1400) }, s(2000))
      .to(token, { alpha: 1, duration: s(700) }, s(2400))
      .to(tail2, { keyframes: [{ alpha: 1, duration: 0.3 }, { alpha: 0.5, duration: 0.3 }, { alpha: 1, duration: 0.4 }] }, s(3100)),
  };
  return {
    beat(id) { return beats[id](); },
    /// One frame of the per-frame drawing (the wall's mask, the fish, the waves) — for a still or a seek.
    step(dt = 16) { for (const f of tick) f(dt); },
    destroy() { tick.length = 0; },
  };
}

/* ── No WebGL: a still frame per beat, in SVG (the tap moves on) ── */

export function stillSvg(id, { W = 1000, H = 1000, art = '' } = {}) {
  const rt = H * 0.56, rb = H * 0.74, by = H * 0.86;
  const bank = `<rect x="0" y="${rb}" width="${W}" height="${H - rb}" fill="#d9cfbb"/>`;
  const boy = (open) => `<g stroke="#231f1a" stroke-width="5" stroke-linecap="round" fill="none"><circle cx="${W / 2}" cy="${by - 66}" r="7" fill="#231f1a"/><path d="M${W / 2} ${by - 58}v30M${W / 2} ${by - 28}l-8 28M${W / 2} ${by - 28}l8 28${open ? `M${W / 2 - 24} ${by - 52}l24 3 24-3` : ''}"/></g>`;
  const wall = `<rect x="${W * 0.04}" y="${H * 0.02}" width="${W * 0.92}" height="${rb - H * 0.02}" fill="#46504f" opacity="0.8"/>${Array.from({ length: 40 }, (_, i) => `<ellipse cx="${W * (0.08 + (i * 0.023) % 0.84)}" cy="${H * 0.05 + ((i * 97) % 100) / 100 * (rb - H * 0.1)}" rx="5" ry="12" fill="#231f1a"/>`).join('')}`;
  const god = art ? `<image href="${art}" x="${W / 2 - H * 0.19}" y="${H * 0.08}" height="${H * 0.56}" width="${H * 0.38}" style="mix-blend-mode:multiply"/>` : '';
  const river = `<rect x="0" y="${rt}" width="${W}" height="${rb - rt}" fill="#6f7a78" opacity="0.35"/>`;
  const cell = Math.min(W, H) * 0.15, gx = W / 2 - cell * 1.5, gy = H * 0.3;
  // Dots, never numerals: words are not painted.
  const dots = (n, x0, y0) => { const k = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / k); return Array.from({ length: n }, (_, i) => `<circle cx="${x0 + 14 + ((i % k) + 0.5) / k * (cell - 28)}" cy="${y0 + 14 + (Math.floor(i / k) + 0.5) / rows * (cell - 28)}" r="4.5" fill="${n % 2 ? '#f5efe1' : '#231f1a'}" stroke="#231f1a"/>`).join(''); };
  const grid = LUOSHU.flatMap((row, r) => row.map((n, c) => `<rect x="${gx + c * cell + 4}" y="${gy + r * cell + 4}" width="${cell - 8}" height="${cell - 8}" rx="8" fill="#8f8a80" stroke="#f2e6c4"/>${dots(n, gx + c * cell, gy + r * cell)}`)).join('');
  const frames = {
    still: `${river}${bank}${boy(false)}`,
    rise: `${wall}${bank}${boy(false)}`,
    bingyi: `${wall}${god}${bank}${boy(false)}`,
    trial: `${wall}${god}${bank}${boy(true)}`,
    fall: `${river}${bank}${boy(false)}`,
    seal: `<rect width="${W}" height="${H}" fill="#0f1a1e"/>${grid}<rect x="${W / 2 - cell / 2}" y="0" width="${cell}" height="${gy + 1.5 * cell}" fill="#f7efd8" opacity="0.6"/>`,
    ding: `<rect width="${W}" height="${H}" fill="#3a3130"/><circle cx="${W * 0.8}" cy="${H * 0.16}" r="${W * 0.04}" fill="#f2e6c4"/><path d="M${W / 2 - 50} ${H * 0.42}h100q4 70-50 76q-54-6-50-76z" fill="#231f1a" stroke="#f2e6c4"/><circle cx="${W / 2}" cy="${H * 0.76}" r="${Math.min(W, H) * 0.09}" fill="#b9a98a"/>`,
  };
  return `<svg class="spstill" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="${W}" height="${H}" fill="#f5efe1"/>${frames[id] ?? ''}</svg>`;
}
