// hud.js — 守墙关's HUD and its modal moments: the top bar (pause · title · wave), the skill column (round icons with
// level badges), the wall's HP bar, the lead-in and countdown, banners, 银月's bubbles, the 3-card pick, the result.
import * as Phaser from 'phaser';
import { W, H, opening, cardOf as coreCardOf } from 'shouqiang-core';
import { FONT } from './fx.js';

export const WORDS = {
  zh: { wave: '波次', waveN: (n) => `第 ${n} 波`, cleared: '守住了！', pick: '选一张符', open: '先选一门本事', fresh: '新', lv: (n) => `Lv.${n}`,
    boss: '合窳 来袭', bossName: '合窳', wail: '哇——哇——', roar: '吼——！', won: '山门守住了！', lost: '山门破了', kills: (n) => `击退 ${n}`,
    wallLeft: (p) => `城墙 ${p}%`, paused: '暂停', resume: '点一下继续', next: '下一波', focus: '点兽群里一只：集火它',
    place: '点一张符，再点畦里一格', wonLanes: '药园守住了！', lostLanes: '药园失守了' },
  en: { wave: 'Wave', waveN: (n) => `Wave ${n}`, cleared: 'Held!', pick: 'Pick a talisman', open: 'Pick your attack', fresh: 'NEW', lv: (n) => `Lv.${n}`,
    boss: 'The Heyu comes', bossName: 'Heyu', wail: 'Waaah—', roar: 'ROAAAR!', won: 'The gate holds!', lost: 'The gate fell', kills: (n) => `${n} driven off`,
    wallLeft: (p) => `Wall ${p}%`, paused: 'Paused', resume: 'Tap to go on', next: 'Next wave', focus: 'Tap a beast: everyone hits it',
    place: 'Tap a talisman, then a bed cell', wonLanes: 'The garden holds!', lostLanes: 'The garden fell' },
};

const FAMILY = {
  jian: ['#1d4fb8', '#46b8ff', '#0b2a66'], huo: ['#a8200e', '#ff9a2e', '#5a0d00'], han: ['#14558f', '#8fe6ff', '#0a2a4f'],
  lei: ['#4a1f94', '#c08bff', '#22094f'], yy: ['#2f5677', '#cfe8ff', '#122638'],
};

function canvasTex(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) return;
  const t = scene.textures.createCanvas(key, w, h);
  draw(t.getContext(), w, h);
  t.refresh();
}

function rounded(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

// Bars and panels are NineSlices over small white rounded textures (drawn at 2×, shown at ½), never Graphics rounded
// rects: Phaser's WebGL Graphics re-triangulates every rounded path (earcut) on every frame it draws — half the CPU of
// a frame went there, on the static bar backs too (measured 10-20, a 4× CPU throttle).
function barTex(scene, h, r) {
  const key = `bar-${h}-${r}`;
  canvasTex(scene, key, 4 * r + 4, 2 * h, (c, w, hh) => { rounded(c, 0, 0, w, hh, 2 * r); c.fillStyle = '#fff'; c.fill(); });
  return key;
}

/** A rounded bar (top-left at x, y; w × h board px; corner r), tinted; `setBarW` changes its width. */
export function bar(scene, x, y, w, h, r, color, alpha = 1) {
  const n = scene.add.nineslice(x, y, barTex(scene, h, r), undefined, w * 2, 2 * h, 2 * r + 1, 2 * r + 1, 0, 0)
    .setOrigin(0, 0).setScale(0.5).setTint(color).setAlpha(alpha);
  n.minW = 4 * r + 2;
  return n;
}

export function setBarW(n, w) {
  const ww = Math.max(n.minW, Math.round(w * 2));
  if (ww !== n.width) n.setSize(ww, n.height);
  return n;
}

/** A rounded panel of any size (9-slice): `key` a texture from makeHudTextures. */
function panel(scene, key, x, y, w, h, corner) {
  return scene.add.nineslice(x, y, key, undefined, w * 2, h * 2, corner * 2, corner * 2, corner * 2, corner * 2).setScale(0.5);
}

function makeHudTextures(scene) {
  canvasTex(scene, 'panel', 96, 96, (c, w, h) => { rounded(c, 0, 0, w, h, 36); c.fillStyle = '#fff'; c.fill(); });
  canvasTex(scene, 'bubble', 96, 96, (c, w, h) => {
    rounded(c, 4, 4, w - 8, h - 8, 26); c.fillStyle = '#fff'; c.fill();
    c.lineWidth = 8; c.strokeStyle = '#3b2210'; c.stroke();
  });
  canvasTex(scene, 'wallbg', 732, 72, (c, w, h) => {
    rounded(c, 6, 6, w - 12, h - 12, 30); c.fillStyle = 'rgba(27,13,6,0.85)'; c.fill();
    c.lineWidth = 6; c.strokeStyle = '#ffd86b'; c.stroke();
  });
  for (const [fam, [a, b, edge]] of Object.entries(FAMILY)) {
    canvasTex(scene, `card-${fam}`, 470, 150, (c, w, h) => {
      rounded(c, 6, 8, w - 12, h - 12, 26); c.fillStyle = 'rgba(0,0,0,0.45)'; c.fill();
      const g = c.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, a); g.addColorStop(1, b);
      rounded(c, 4, 2, w - 12, h - 12, 26); c.fillStyle = g; c.fill();
      c.lineWidth = 7; c.strokeStyle = '#ffd86b'; c.stroke();
      c.lineWidth = 3; c.strokeStyle = edge; rounded(c, 12, 10, w - 28, h - 28, 20); c.stroke();
      const hi = c.createLinearGradient(0, 0, 0, h * 0.5);
      hi.addColorStop(0, 'rgba(255,255,255,0.35)'); hi.addColorStop(1, 'rgba(255,255,255,0)');
      rounded(c, 10, 6, w - 24, h * 0.45, 20); c.fillStyle = hi; c.fill();
    });
  }
  canvasTex(scene, 'topbar', 540, 120, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(12,10,24,0.85)'); g.addColorStop(0.6, 'rgba(12,10,24,0.45)'); g.addColorStop(1, 'rgba(12,10,24,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
  canvasTex(scene, 'pill', 160, 52, (c, w, h) => {
    rounded(c, 2, 2, w - 4, h - 4, 24); c.fillStyle = 'rgba(20,16,36,0.78)'; c.fill();
    c.lineWidth = 3; c.strokeStyle = 'rgba(255,216,107,0.9)'; c.stroke();
  });
  canvasTex(scene, 'btn', 64, 64, (c, w) => {
    const g = c.createRadialGradient(w / 2, w / 2 - 6, 4, w / 2, w / 2, w / 2);
    g.addColorStop(0, '#5b4a86'); g.addColorStop(1, '#231a3d');
    c.beginPath(); c.arc(w / 2, w / 2, w / 2 - 3, 0, Math.PI * 2); c.fillStyle = g; c.fill();
    c.lineWidth = 3; c.strokeStyle = '#ffd86b'; c.stroke();
    c.fillStyle = '#fff'; c.fillRect(22, 19, 7, 26); c.fillRect(36, 19, 7, 26);
  });
  canvasTex(scene, 'badge', 40, 40, (c, w) => {
    const g = c.createLinearGradient(0, 0, 0, w);
    g.addColorStop(0, '#ff6b4a'); g.addColorStop(1, '#c4161c');
    c.beginPath(); c.arc(w / 2, w / 2, w / 2 - 3, 0, Math.PI * 2); c.fillStyle = g; c.fill();
    c.lineWidth = 3; c.strokeStyle = '#fff3c4'; c.stroke();
  });
  canvasTex(scene, 'ribbon', 420, 96, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#e2482f'); g.addColorStop(1, '#8e1414');
    c.fillStyle = '#5c0b0b';
    c.beginPath(); c.moveTo(0, 26); c.lineTo(60, 26); c.lineTo(60, h - 6); c.lineTo(0, h - 6); c.lineTo(22, h / 2 + 10); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(w, 26); c.lineTo(w - 60, 26); c.lineTo(w - 60, h - 6); c.lineTo(w, h - 6); c.lineTo(w - 22, h / 2 + 10); c.closePath(); c.fill();
    rounded(c, 34, 10, w - 68, h - 26, 14); c.fillStyle = g; c.fill();
    c.lineWidth = 5; c.strokeStyle = '#ffd86b'; c.stroke();
  });
  canvasTex(scene, 'heart', 44, 40, (c) => {
    c.fillStyle = '#3fe060'; c.strokeStyle = '#0d3b14'; c.lineWidth = 3.5;
    c.beginPath(); c.moveTo(22, 36); c.bezierCurveTo(-6, 18, 6, -2, 22, 10); c.bezierCurveTo(38, -2, 50, 18, 22, 36); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.ellipse(13, 13, 4, 3, -0.6, 0, Math.PI * 2); c.fill();
  });
}

// a card as the level shows it (core.js cardOf: a story level's own name, line and icon over the kit's numbers)
const cardOf = (g, id) => coreCardOf(g, id);

/** The HUD's words with a level's own laid over (`words` — 守白菜: 白菜, 撵走); `{n}` takes a number where the word is a function. */
export function wordsFor(base, words, lang) {
  const out = { ...base };
  for (const [k, v] of Object.entries(words ?? {})) {
    const s = v?.[lang] ?? v?.zh ?? '';
    out[k] = typeof base[k] === 'function' ? (n) => s.replace('{n}', String(n)) : s;
  }
  return out;
}

export class Hud {
  constructor(scene, { depth, modal }) {
    this.s = scene;
    this.d = depth;
    this.dm = modal;
    this.w = scene.w;
    this.lang = scene.lang;
    this.res = scene.cfg.zoom ?? 1;
    this.modalOpen = false;
    this.wallFlash = 0;
    this.skillIcons = new Map();
    makeHudTextures(scene);
    this.top();
    this.wallBar();
    this.countdown = this.text(W / 2, 168, '', 64, { color: '#ffffff' }).setDepth(depth + 2).setAlpha(0);
    this.lastCount = null;
  }

  text(x, y, str, size, { color = '#ffffff', stroke = '#2a1206', align = 'center', wrap = 0, origin = 0.5 } = {}) {
    const style = { fontFamily: FONT, fontSize: `${size}px`, color, stroke, strokeThickness: Math.max(3, Math.round(size * 0.16)), align,
      shadow: { offsetX: 0, offsetY: Math.round(size * 0.07), color: 'rgba(0,0,0,0.45)', blur: 0, fill: true, stroke: true } };
    if (wrap) style.wordWrap = { width: wrap, useAdvancedWrap: true };
    return this.s.add.text(x, y, str, style).setOrigin(origin, 0.5).setResolution(this.res).setDepth(this.d);
  }

  top() {
    const s = this.s, g = s.g;
    s.add.image(W / 2, 0, 'topbar').setOrigin(0.5, 0).setDepth(this.d - 1);
    this.pauseBtn = s.add.image(38, 40, 'btn').setDepth(this.d).setScale(0.82).setInteractive({ useHandCursor: true });
    this.pauseBtn.on('pointerdown', (p, x, y, ev) => { ev?.stopPropagation?.(); s.togglePause(); });
    const title = g.level.title?.[this.lang] ?? g.level.title?.zh ?? '';
    // between the pause button and the wave pill: a long title (English 「Carrying the stag down」, 10-26) shrinks to fit
    const head = this.text(W / 2 - 10, 30, title, 26, { color: '#fff6d8' }), room = 2 * Math.min(W / 2 - 10 - 76, 404 - (W / 2 - 10));
    if (head.width > room) head.setScale(room / head.width);
    bar(s, W / 2 - 110, 56, 200, 12, 6, 0x000000, 0.5).setDepth(this.d);
    this.prog = bar(s, W / 2 - 108, 58, 196, 8, 4, 0xff8a3a).setDepth(this.d);
    s.add.image(472, 38, 'pill').setDepth(this.d).setScale(0.82);
    this.waveText = this.text(472, 38, '', 22, { color: '#ffe27a' }).setDepth(this.d + 1);
    this.fps = s.cfg.showFps ? this.text(18, 84, '', 16, { color: '#7dff7a', origin: 0 }) : null;
    this.bossBox = s.add.container(0, 0).setDepth(this.d).setVisible(false);
    const bg = bar(s, W / 2 - 190, 92, 380, 22, 11, 0x1b0d06, 0.85);
    this.bossFill = bar(s, W / 2 - 186, 95, 372, 16, 8, 0xd61f2c);
    this.bossBox.add([bg, this.bossFill, this.text(W / 2, 103, this.w.bossName, 18, { color: '#ffe0e0' })]);
  }

  wallBar() {
    const s = this.s;
    const y = H - 30;
    s.add.image(W / 2, y, 'wallbg').setDisplaySize(366, 36).setDepth(this.d);
    this.wallFill = bar(s, W / 2 - 176, y - 11, 352, 22, 11, 0x3fe060).setDepth(this.d);
    this.wallShine = bar(s, W / 2 - 172, y - 9, 344, 7, 3, 0xffffff, 0.3).setDepth(this.d);
    this.wallCol = 0x3fe060;
    s.add.image(W / 2 - 194, y, 'heart').setDepth(this.d + 1).setScale(0.9);
    this.wallText = this.text(W / 2, y, '', 22, { color: '#ffffff' }).setDepth(this.d + 1);
    this.wallY = y;
  }

  update(g, dt, fps) {
    if (g.wave !== this.shownWave) {
      this.shownWave = g.wave;
      this.waveText.setText(`${this.w.wave} ${Math.max(1, g.wave)}/${g.waves}`);
    }
    const left = g.wall / g.wallMax;
    this.wallFlash = Math.max(0, this.wallFlash - dt);
    const col = this.wallFlash > 0 ? 0xffffff : left < 0.3 ? 0xff4b3a : left < 0.6 ? 0xffc23a : 0x3fe060;
    if (col !== this.wallCol) this.wallFill.setTint((this.wallCol = col));
    setBarW(this.wallFill, 352 * left);
    setBarW(this.wallShine, 344 * left);
    this.wallText.setText(`${Math.ceil(g.wall)}`);
    // The wave bar: beasts still to come or alive, of all the wave holds (spawns appear, and a wail adds some).
    if (g.phase === 'wave') {
      const remaining = g.spawns.length + g.beasts.length;
      this.waveTotal = Math.max(remaining, this.waveTotal ?? 0);
      const done = 1 - remaining / Math.max(1, this.waveTotal);
      this.prog.setVisible(done > 0.02);
      setBarW(this.prog, 196 * done);
    } else if (this.waveTotal) { this.waveTotal = 0; this.prog.setVisible(false); }
    let boss = null;
    for (const b of g.beasts) if (b.boss) boss = b;
    this.bossBox.setVisible(Boolean(boss));
    if (boss) setBarW(this.bossFill, 372 * Math.max(0, boss.hp / boss.max));
    if (this.fps) this.fps.setText(`FPS:${Math.round(fps)}`);
    this.tickCountdown(g);
  }

  tickCountdown(g) {
    // No 3-2-1 into the opening pick: it counts in after the pick (the `count` phase). From 3 down (at ≤ 3.2 the
    // ceiling showed a stray 「4」 for a fifth of a second).
    const on = ((g.phase === 'lead' && !opening(g)) || g.phase === 'count') && g.timer <= 3;
    const n = on ? Math.max(1, Math.ceil(g.timer)) : null;
    if (n === this.lastCount) return;
    this.lastCount = n;
    if (!n) return void this.s.tweens.add({ targets: this.countdown, alpha: 0, duration: 150 });
    this.countdown.setText(String(n)).setAlpha(1).setScale(2.2);
    this.s.tweens.add({ targets: this.countdown, scale: 1, duration: 360, ease: 'Back.out' });
  }

  // ---- banners and bubbles ---------------------------------------------------------------------------------------

  banner(str, { size = 54, color = '#ffe27a', y = 330, hold = 900, ribbon = true } = {}) {
    const s = this.s;
    const parts = [];
    if (ribbon) parts.push(s.add.image(0, 4, 'ribbon').setScale(Math.max(1, (str.length * size * 0.9 + 140) / 420), 1.05));
    parts.push(this.text(0, 0, str, size, { color, stroke: '#3a0606' }));
    const c = s.add.container(W / 2, y, parts).setDepth(this.d + 3).setScale(0.2).setAlpha(0);
    s.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 320, ease: 'Back.out' });
    s.tweens.add({ targets: c, alpha: 0, y: y - 30, delay: hold, duration: 300, onComplete: () => c.destroy() });
    return c;
  }

  /** Lines over `sec` seconds (the big ones as banners); `hint`: the how-to-play line near its end. */
  lead(lines, sec, { hint = true } = {}) {
    const slot = (sec - 0.4) / Math.max(1, lines.length);
    lines.forEach((l, i) => this.s.time.delayedCall(i * slot * 1000, () => {
      const str = l[this.lang] ?? l.zh;
      if (l.big) {
        this.banner(str, { size: 60, color: '#fff2a8', hold: slot * 1000 - 300 });
        this.s.shake(260, 0.008);
      } else this.storyLine(str, slot);
    }));
    if (hint) this.s.time.delayedCall(Math.max(0, (sec - 2.5) * 1000), () => this.hint(this.s.g.grid ? this.w.place : this.w.focus));
  }

  storyLine(str, slot) {
    const s = this.s;
    const t = this.text(W / 2, 360, str, 30, { color: '#ffffff', wrap: 440 }).setDepth(this.d + 3).setAlpha(0);
    const back = panel(s, 'panel', W / 2, 360, W - 60, t.height + 36, 18).setTint(0x000000).setDepth(this.d + 2).setAlpha(0);
    back.alphaTo = 0.5;
    s.tweens.add({ targets: t, alpha: 1, duration: 260 });
    s.tweens.add({ targets: back, alpha: back.alphaTo, duration: 260 });
    s.tweens.add({ targets: [t, back], alpha: 0, delay: slot * 1000 - 260, duration: 240, onComplete: () => { t.destroy(); back.destroy(); } });
  }

  hint(str) {
    const t = this.text(W / 2, 700, str, 20, { color: '#fff6d8' }).setDepth(this.d + 1).setAlpha(0);
    this.s.tweens.add({ targets: t, alpha: 0.95, duration: 300, yoyo: true, hold: 2600, onComplete: () => t.destroy() });
  }

  waveBanner(n, of) { this.banner(n === of ? `${this.w.waveN(n)} · ${of}/${of}` : this.w.waveN(n), { size: 50, hold: 800 }); }
  clearBanner() { this.banner(this.w.cleared, { size: 50, color: '#bdfcff', y: 300, hold: 500, ribbon: false }); }
  bossBanner() { this.banner(this.w.boss, { size: 58, color: '#ffd0d0', y: 260, hold: 1300 }); }

  bubbleAt(x, y, str, ms) {
    const s = this.s;
    const t = this.text(0, 0, str, 20, { color: '#3b2210', stroke: '#ffffff', wrap: 220 });
    t.setShadow(0, 0, 'rgba(0,0,0,0)', 0);
    const w = t.width + 28, h = t.height + 18;
    const bx = Phaser.Math.Clamp(x, w / 2 + 8, W - w / 2 - 8);
    const box = panel(s, 'bubble', 0, 0, w, h, 14);
    // The tail: triangles and lines only (no rounded path to triangulate each frame).
    const g = s.add.graphics();
    const tx = Phaser.Math.Clamp(x - bx, -w / 2 + 18, w / 2 - 18);
    g.fillStyle(0xffffff, 1).lineStyle(4, 0x3b2210, 1);
    g.fillTriangle(tx - 9, h / 2 - 3, tx + 9, h / 2 - 3, tx, h / 2 + 14).lineBetween(tx - 9, h / 2, tx, h / 2 + 14).lineBetween(tx + 9, h / 2, tx, h / 2 + 14);
    const c = s.add.container(bx, y, [box, g, t]).setDepth(this.d + 1).setScale(0.3).setAlpha(0);
    s.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 220, ease: 'Back.out' });
    s.tweens.add({ targets: c, alpha: 0, delay: ms, duration: 250, onComplete: () => c.destroy() });
  }

  wallHit() { this.wallFlash = 0.06; }

  // ---- the pick ------------------------------------------------------------------------------------------------

  /** The 3-card pick; `opening`: the first one, 小满's main attack (titled so, no level marks on the cards). */
  offer(ids, g, onPick, { opening: first = false } = {}) {
    const s = this.s;
    this.modalOpen = true;
    const dim = s.add.rectangle(W / 2, H / 2, W, H, 0x0a0614, 0.62).setDepth(this.dm).setInteractive().setAlpha(0);
    s.tweens.add({ targets: dim, alpha: 1, duration: 200 });
    const title = this.banner(first ? this.w.open : this.w.pick, { size: 44, y: 372, hold: 1e9 });
    title.setDepth(this.dm + 1);
    let chosen = false;
    const cards = ids.map((id, i) => {
      const c = this.card(id, g, W / 2, 486 + i * 150);
      c.setDepth(this.dm + 2).setAlpha(0).setScale(0.6);
      c.y += 300;
      s.tweens.add({ targets: c, y: c.y - 300, alpha: 1, scale: 1, delay: 120 + i * 90, duration: 420, ease: 'Back.out' });
      c.hit.on('pointerover', () => !chosen && s.tweens.add({ targets: c, scale: 1.04, duration: 120 }));
      c.hit.on('pointerout', () => !chosen && s.tweens.add({ targets: c, scale: 1, duration: 120 }));
      c.hit.on('pointerup', () => {
        if (chosen) return;
        chosen = true;
        s.em.burst('stars', 14, c.x, c.y);
        s.tweens.add({ targets: c, scale: 1.12, duration: 140, yoyo: true });
        cards.filter((o) => o !== c).forEach((o, j) => s.tweens.add({ targets: o, x: j ? W + 300 : -300, alpha: 0, duration: 260 }));
        s.time.delayedCall(420, () => {
          s.tweens.add({ targets: [c, dim, title], alpha: 0, duration: 200, onComplete: () => { cards.forEach((o) => o.destroy()); dim.destroy(); title.destroy(); } });
          this.modalOpen = false;
          onPick(id);
        });
      });
      return c;
    });
  }

  card(id, g, x, y) {
    const s = this.s;
    const c = cardOf(g, id);
    const have = g.skills[id] ?? 0;
    const bg = s.add.image(0, 0, `card-${c.family}`);
    const icon = s.add.image(-160, -2, s.tex(c.icon ?? `icon-${id}`, 'icon-jian-more')).setDisplaySize(104, 104);
    const name = this.text(-95, -30, c.name[this.lang] ?? c.name.zh, 28, { color: '#fffbe8', origin: 0 });
    const say = this.text(-95, 18, c.say[this.lang] ?? c.say.zh, 19, { color: '#fff3d0', origin: 0, wrap: 320 });
    const marks = [];
    // An opening line has no level yet to show; a card shows NEW or its next level, and its pips.
    if (!c.line) {
      const lvl = have ? this.w.lv(have + 1) : this.w.fresh;
      marks.push(s.add.image(186, -46, 'badge').setScale(have ? 1.25 : 1.4), this.text(186, -47, lvl, have ? 15 : 17, { color: '#ffffff' }));
      for (let i = 0; i < c.max; i += 1) marks.push(s.add.image(-95 + 22 * i + 290 - c.max * 22, 50, 'star').setScale(0.42).setTint(i < have + 1 ? 0xffd23f : 0x4a3a5a));
    }
    const cont = s.add.container(x, y, [bg, icon, name, say, ...marks]);
    cont.hit = bg.setInteractive({ useHandCursor: true });
    return cont;
  }

  picked(id, g) {
    if (!id) return;
    const s = this.s;
    let entry = this.skillIcons.get(id);
    if (!entry) {
      const c = cardOf(g, id);
      const icon = s.add.image(W / 2, H / 2, s.tex(c.icon ?? `icon-${id}`, 'icon-jian-more')).setDisplaySize(54, 54).setDepth(this.d);
      const badge = s.add.image(0, 0, 'badge').setScale(0.6).setDepth(this.d + 1).setAlpha(0);
      const n = this.text(0, 0, '1', 15, { color: '#ffffff' }).setDepth(this.d + 2).setAlpha(0);
      entry = { icon, badge, n, i: this.skillIcons.size };
      this.skillIcons.set(id, entry);
      const at = this.iconAt(entry.i);
      badge.setPosition(at.x + 16, at.y + 18); n.setPosition(at.x + 16, at.y + 17);
      icon.setScale(icon.scaleX * 2.2);
      s.tweens.add({ targets: icon, x: at.x, y: at.y, scaleX: at.size / icon.width, scaleY: at.size / icon.height, duration: 520, ease: 'Cubic.inOut',
        onComplete: () => { s.tweens.add({ targets: [badge, n], alpha: 1, duration: 150 }); s.em.burst('spark', 10, at.x, at.y); } });
    } else {
      const at = this.iconAt(entry.i);
      s.tweens.add({ targets: entry.icon, scaleX: entry.icon.scaleX * 1.3, scaleY: entry.icon.scaleY * 1.3, duration: 160, yoyo: true });
      s.em.burst('spark', 10, at.x, at.y);
    }
    entry.n.setText(String(g.skills[id] ?? 1));
  }

  // Where the i-th held card's icon sits: the 山门, a column down the right edge; the 药园 in portrait, a row along the
  // bottom right (the right edge is lane 5's beds); in landscape, a grid in the right panel under 银月.
  iconAt(i) {
    if (!this.s.g.grid) return { x: W - 38, y: 150 + i * 62, size: 54 };
    if (this.landscape) return { x: W + 70 + (i % 3) * 60, y: 520 + Math.floor(i / 3) * 64, size: 50 };
    return { x: W - 30 - (i % 4) * 44, y: 880 - Math.floor(i / 4) * 44, size: 38 };
  }

  /** Re-place the held cards' icons for the layout (option A: landscape moves them into the right panel). */
  layout(landscape) {
    this.landscape = landscape;
    for (const e of this.skillIcons.values()) {
      const at = this.iconAt(e.i);
      e.icon.setPosition(at.x, at.y).setDisplaySize(at.size, at.size);
      e.badge.setPosition(at.x + 16, at.y + 18);
      e.n.setPosition(at.x + 16, at.y + 17);
    }
  }

  /** A short word that floats up and fades (a placement refused, …). */
  floatText(x, y, str, color = '#ffffff') {
    if (!str) return;
    const t = this.text(x, y, str, 20, { color }).setDepth(this.d + 4);
    this.s.tweens.add({ targets: t, y: y - 34, alpha: 0, delay: 500, duration: 500, onComplete: () => t.destroy() });
  }

  showPause(on) {
    const s = this.s;
    if (!on) { this.pauseBox?.destroy(); this.pauseBox = null; return; }
    const dim = s.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.55).setInteractive();
    dim.on('pointerup', () => s.togglePause());
    this.pauseBox = s.add.container(0, 0, [dim, this.text(W / 2, H / 2 - 30, this.w.paused, 60), this.text(W / 2, H / 2 + 40, this.w.resume, 24)]).setDepth(this.dm + 5);
  }

  // ---- the end -------------------------------------------------------------------------------------------------

  result(won, stars, g) {
    const s = this.s;
    this.modalOpen = true;
    const dim = s.add.rectangle(W / 2, H / 2, W, H, 0x0a0614, 0.6).setDepth(this.dm).setInteractive().setAlpha(0);
    s.tweens.add({ targets: dim, alpha: 1, duration: 300 });
    const words = g.grid ? [this.w.wonLanes, this.w.lostLanes] : [this.w.won, this.w.lost];
    const title = this.banner(won ? words[0] : words[1], { size: 52, y: 330, hold: 1e9, color: won ? '#fff2a8' : '#d8d8d8' });
    title.setDepth(this.dm + 1);
    [0, 1, 2].forEach((i) => {
      const x = W / 2 + (i - 1) * 110, y = 470 - (i === 1 ? 24 : 0);
      const st = s.add.image(x, y, 'star').setDepth(this.dm + 2).setScale(0).setTint(i < stars ? 0xffd23f : 0x3d3350);
      s.tweens.add({ targets: st, scale: i === 1 ? 3.4 : 2.8, angle: 360, delay: 300 + i * 260, duration: 420, ease: 'Back.out',
        onComplete: () => i < stars && s.em.burst('stars', 12, x, y) });
    });
    const pct = Math.round((100 * g.wall) / g.wallMax);
    this.text(W / 2, 590, `${this.w.kills(g.kills)}   ·   ${this.w.wallLeft(pct)}`, 26, { color: '#ffffff' }).setDepth(this.dm + 2);
  }

  destroy() {}
}

/** 小满 working a seal (Hanli 10-22: 「结印的过程中, 可否让小满手指发光. 或者有个什么特效」): the 结印 dock's progress
    (games/jieyin/helper.js onProgress — { move, step, of, k, cast } or null) shown at his hand — a gold glow that grows
    with each step done, a charge-up ring closing in on the hand, a pulse at each step, a burst as the seal flies. Light
    and particles only (no drawn art). Any level, any host: it reads only the events. (A copy of 守山门's,
    tools/sadoushou/src/hud.js, so each bundle hashes only its own source.)
      new SealGlow(scene, { depth, at, em, calm })   at() → { x, y } the hand point now · em: the scene's emitters
      glow.set(p) · glow.update(dt) */
export class SealGlow {
  constructor(scene, { depth, at, em, calm = false }) {
    this.s = scene; this.at = at; this.em = em; this.calm = calm;
    this.k = 0; this.want = 0; this.step = -1; this.t = 0; this.puff = 0;
    const add = (tex, tint) => scene.add.image(0, 0, tex).setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setDepth(depth).setAlpha(0);
    this.halo = add('glow', 0xffb02e); // the warm light round the hand
    this.core = add('glow', 0xfff6c2); // the white-gold heart at the fingers
    this.ring = add('ring', 0xffd23f); // the charge, closing in as the seal comes together
  }

  set(p) {
    if (!p) { this.want = 0; this.step = -1; return; }
    const { x, y } = this.at();
    if (p.cast) { // the seal flies: the light bursts out from the hand
      this.want = 0; this.k = 1.25; this.step = -1;
      this.em.burst('gold', 34, x, y); this.em.burst('stars', 10, x, y);
      this.pulse(x, y, 3.6, 0xfff1a8, 460);
      return;
    }
    this.want = Math.max(0.1, Math.min(1, p.k));
    if (p.step > this.step && p.step > 0) { // a step done: a pulse and a few sparks
      this.em.burst('spark', 8 + 6 * p.step, x, y);
      this.pulse(x, y, 1.4 + 0.5 * p.step, 0xffd23f, 320);
    }
    this.step = p.step;
  }

  pulse(x, y, to, tint, ms) {
    const r = this.s.add.image(x, y, 'ring').setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setDepth(this.core.depth).setScale(0.25).setAlpha(0.95);
    this.s.tweens.add({ targets: r, scale: to, alpha: 0, duration: ms, ease: 'Cubic.easeOut', onComplete: () => r.destroy() });
  }

  update(dt) {
    this.t += dt;
    this.k += (this.want - this.k) * Math.min(1, dt * (this.want > this.k ? 6 : 3)); // grows quick, fades slower
    const k = Math.max(0, this.k), { x, y } = this.at();
    const beat = this.calm ? 1 : 1 + 0.12 * Math.sin(this.t * (6 + 8 * k)); // quicker as it charges
    this.halo.setPosition(x, y).setScale((0.8 + 3.2 * k) * beat).setAlpha(Math.min(0.85, 0.15 + 0.7 * k));
    this.core.setPosition(x, y).setScale((0.35 + 1.1 * k) * beat).setAlpha(Math.min(1, 0.2 + 0.9 * k));
    const charge = Math.min(1, k) > 0.3 && this.want > 0; // a step done: the ring closes in, turning
    this.ring.setPosition(x, y).setScale(1.5 - 0.85 * Math.min(1, k)).setRotation(this.t * 3).setAlpha(charge ? 0.35 + 0.5 * k : Math.max(0, this.ring.alpha - dt * 3));
    if (k > 0.3 && this.want > 0 && !this.calm && (this.puff -= dt) <= 0) { this.puff = 0.16 - 0.08 * k; this.em.burst('spark', 1, x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 40); }
  }
}
