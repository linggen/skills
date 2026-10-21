// hud.js — 守山门's HUD and moments: the top bar (the level's name, the whole 兽潮 still to beat as one big red
// number), the wall's bar and the 豆兵 count at the bottom (big blue), the lead-in line and the countdown that starts
// itself, banners, 银月's bubble, the drag-and-hold hint.
import * as Phaser from 'phaser';
import { W } from './view.js';
import { FONT, canvasTex, rounded } from './fx.js';

export const WORDS = {
  zh: { go: '撒！', won: '守住了！', lost: '山门破了', horde: '兽潮', wall: '山门', hint: '按住撒豆 · 左右瞄准', keys: 'A / D 或 ← / → 瞄准，空格撒豆',
    wave: '又来一拨！', boss: (n) => `${n} 出来了！`, charge: '它要冲了！闪开那条线！', rich: '+99 门值钱，可兽潮挨着它', yinyue: '银月' },
  en: { go: 'Scatter!', won: 'Held!', lost: 'The gate broke', horde: 'Tide', wall: 'Gate', hint: 'Hold to scatter · move to aim', keys: 'A / D or ← / → aim, Space scatters',
    wave: 'Another wave!', boss: (n) => `The ${n} steps out!`, charge: 'It\'s charging! Off that line!', rich: 'The +99 gate is rich — and near the tide', yinyue: 'Yinyue' },
};

export const text = (scene, x, y, s, size, o = {}) => scene.add.text(x, y, s, {
  fontFamily: FONT, fontSize: `${size}px`, color: o.color ?? '#ffffff', stroke: o.stroke ?? '#1b0d05',
  strokeThickness: o.thick ?? Math.max(4, Math.round(size / 5)), align: 'center', wordWrap: o.wrap ? { width: o.wrap, useAdvancedWrap: true } : undefined,
  shadow: { offsetX: 0, offsetY: 3, color: 'rgba(0,0,0,0.45)', blur: 0, fill: true, stroke: true },
}).setOrigin(o.ox ?? 0.5, o.oy ?? 0.5);

function pill(scene, key, top, bottom, line) {
  canvasTex(scene, key, 180, 64, (c, w, h) => {
    rounded(c, 3, 6, w - 6, h - 9, 28); c.fillStyle = 'rgba(0,0,0,0.35)'; c.fill();
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    rounded(c, 3, 2, w - 6, h - 10, 28); c.fillStyle = g; c.fill();
    c.lineWidth = 4; c.strokeStyle = line; c.stroke();
    rounded(c, 14, 7, w - 28, 15, 7); c.fillStyle = 'rgba(255,255,255,0.32)'; c.fill();
  });
}

function makeHudTextures(scene) {
  canvasTex(scene, 'topbar', 540, 150, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(14,10,24,0.8)'); g.addColorStop(0.55, 'rgba(14,10,24,0.35)'); g.addColorStop(1, 'rgba(14,10,24,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
  pill(scene, 'pill-blue', '#5fd0ff', '#1a5fd6', '#0b2556');
  pill(scene, 'pill-red', '#ff7a5c', '#b3121f', '#4a0610');
  canvasTex(scene, 'bar-back', 300, 30, (c, w, h) => {
    rounded(c, 2, 2, w - 4, h - 4, 13); c.fillStyle = 'rgba(10,8,20,0.8)'; c.fill();
    c.lineWidth = 3; c.strokeStyle = '#ffd86b'; c.stroke();
  });
  canvasTex(scene, 'bubble', 360, 84, (c, w, h) => {
    rounded(c, 3, 3, w - 6, h - 14, 20); c.fillStyle = 'rgba(255,255,255,0.96)'; c.fill();
    c.lineWidth = 4; c.strokeStyle = '#2a3a66'; c.stroke();
    c.beginPath(); c.moveTo(40, h - 12); c.lineTo(30, h - 1); c.lineTo(58, h - 12); c.closePath(); c.fillStyle = '#fff'; c.fill();
  });
  canvasTex(scene, 'ribbon', 440, 90, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#ff6b4a'); g.addColorStop(1, '#c01d22');
    c.fillStyle = g; c.strokeStyle = '#5a0a10'; c.lineWidth = 6; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(10, 14); c.lineTo(w - 10, 14); c.lineTo(w - 40, h / 2 + 4); c.lineTo(w - 10, h - 10); c.lineTo(10, h - 10);
    c.lineTo(40, h / 2 + 4); c.closePath(); c.fill(); c.stroke();
  });
}

export class Hud {
  constructor(scene, { depth }) {
    this.s = scene;
    this.d = depth;
    this.w = scene.w;
    makeHudTextures(scene);
    const s = scene;
    s.add.image(W / 2, 0, 'topbar').setOrigin(0.5, 0).setDepth(depth);
    this.title = text(s, W / 2, 26, scene.cfg.level.title[scene.lang], 24).setDepth(depth + 1);
    if (this.title.width > W - 40) this.title.setScale((W - 40) / this.title.width); // a long English title fits
    // the whole tide still to beat: big and red, from the start
    this.hordeLabel = text(s, W / 2 - 150, 74, this.w.horde, 24, { color: '#ffd0c0' }).setDepth(depth + 1);
    this.hordePill = s.add.image(W / 2 + 34, 74, 'pill-red').setDepth(depth + 1).setScale(1.05, 0.95);
    this.hordeNum = s.add.bitmapText(W / 2 + 34, 71, 'numBig', '0', 50).setOrigin(0.5).setDepth(depth + 2);
    this.hordeShown = null;
    // the wall at the bottom: its bar, and the 豆兵 on the road as one big blue number
    this.wallBack = s.add.image(116, 930, 'bar-back').setDepth(depth).setScale(0.62, 0.9);
    this.wallFill = s.add.graphics().setDepth(depth + 1);
    this.wallName = text(s, 34, 930, this.w.wall, 18, { color: '#ffe9b0' }).setDepth(depth + 2);
    this.countPill = s.add.image(W - 120, 920, 'pill-blue').setDepth(depth + 1);
    this.countNum = s.add.bitmapText(W - 120, 917, 'numGood', '0', 52).setOrigin(0.5).setDepth(depth + 2);
    this.countPunch = 0;
    this.fps = scene.cfg.showFps ? text(s, 10, 112, '', 16, { ox: 0, color: '#9dff9d' }).setDepth(depth + 1) : null;
  }

  /** Every frame: the two big numbers tick toward the truth (a fast count-up reads as a reward), the wall's bar. */
  tick(dt, { horde, count, wall, wallMax }) {
    this.hordeShown = this.hordeShown == null ? horde : this.hordeShown + (horde - this.hordeShown) * Math.min(1, dt * 10);
    const hs = Math.round(this.hordeShown);
    this.hordeNum.setText(String(hs));
    this.hordePill.setScale(Math.max(1.05, 0.55 + String(hs).length * 0.2), 0.95);
    this.countPunch = Math.max(0, this.countPunch - dt * 3);
    this.countNum.setText(String(count)).setScale(1 + this.countPunch * 0.35);
    this.countPill.setScale(Math.max(0.9, 0.4 + String(count).length * 0.2) * (1 + this.countPunch * 0.2), 1 + this.countPunch * 0.2);
    const f = Phaser.Math.Clamp(wall / wallMax, 0, 1);
    this.wallFill.clear().fillStyle(f > 0.5 ? 0x8fe36b : f > 0.25 ? 0xffc23f : 0xff4a3a, 1).fillRoundedRect(116 - 88, 922, Math.max(6, 176 * f), 16, 7);
  }

  punch() { this.countPunch = 1; }

  /** The lead-in: the level's lines one after another, then the countdown, then `go()` — never a tap to start. */
  lead(lines, sec, countdown, { onBig, onTick, go }) {
    const s = this.s, per = (sec * 1000) / Math.max(1, lines.length);
    lines.forEach((l, i) => s.time.delayedCall(i * per, () => {
      const big = Boolean(l.big);
      const t = text(s, W / 2, big ? 420 : 260 + i * 54, l[s.lang], big ? 64 : 28, { wrap: 460, color: big ? '#ffe36b' : '#ffffff', thick: big ? 12 : 6 })
        .setDepth(this.d + 5).setAlpha(0).setScale(big ? 2.2 : 1);
      s.tweens.add({ targets: t, alpha: 1, scale: 1, duration: big ? 380 : 260, ease: big ? 'Back.easeOut' : 'Quad.easeOut' });
      s.tweens.add({ targets: t, alpha: 0, y: t.y - 30, delay: sec * 1000 - i * per + (big ? 200 : 0), duration: 300, onComplete: () => t.destroy() });
      if (big) onBig?.();
    }));
    const n = countdown ?? 3;
    for (let k = 0; k <= n; k += 1) {
      s.time.delayedCall(sec * 1000 + 450 + k * 650, () => {
        const last = k === n;
        const t = last ? text(s, W / 2, 460, this.w.go, 100, { color: '#ffe36b', thick: 14 }) : s.add.bitmapText(W / 2, 460, 'numBig', String(n - k), 120).setOrigin(0.5);
        t.setDepth(this.d + 6).setScale(2.4).setAlpha(0);
        s.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
        s.tweens.add({ targets: t, scale: 0.6, alpha: 0, delay: 430, duration: 200, onComplete: () => t.destroy() });
        if (last) go(); else onTick?.();
      });
    }
  }

  hint() {
    const s = this.s;
    const hand = text(s, W / 2, 700, `◀  ${this.w.hint}  ▶`, 26).setDepth(this.d + 2);
    const sub = text(s, W / 2, 736, this.w.keys, 17, { color: '#d8e8ff' }).setDepth(this.d + 2);
    s.tweens.add({ targets: hand, x: { from: W / 2 - 24, to: W / 2 + 24 }, yoyo: true, repeat: 3, duration: 420, ease: 'Sine.easeInOut' });
    s.tweens.add({ targets: [hand, sub], alpha: 0, delay: 3800, duration: 500, onComplete: () => { hand.destroy(); sub.destroy(); } });
  }

  banner(msg, { color = '#ffffff', y = 300, ribbon = false } = {}) {
    const s = this.s;
    const parts = [];
    if (ribbon) parts.push(s.add.image(W / 2, y, 'ribbon').setDepth(this.d + 4));
    parts.push(text(s, W / 2, y, msg, ribbon ? 38 : 32, { color, thick: 9, wrap: 480 }).setDepth(this.d + 5));
    for (const p of parts) {
      p.setScale(0.2, 1.6).setAlpha(0);
      s.tweens.add({ targets: p, scaleX: 1, scaleY: 1, alpha: 1, duration: 300, ease: 'Back.easeOut' });
      s.tweens.add({ targets: p, alpha: 0, y: y - 30, delay: 1400, duration: 350, onComplete: () => p.destroy() });
    }
  }

  /** 银月's line in a bubble under the top bar, her face beside it. */
  say(line) {
    if (!line) return;
    const s = this.s;
    this.bubble?.forEach((o) => o.destroy());
    const y = 160;
    const b = s.add.image(300, y, 'bubble').setDepth(this.d + 3);
    const t = text(s, 136, y - 6, line, 21, { ox: 0, color: '#1d2a50', stroke: '#ffffff', thick: 2, wrap: 320 }).setDepth(this.d + 4);
    const face = s.textures.exists('yy') && s.textures.get('yy').has('idle-1') ? s.add.image(70, y + 2, 'yy', 'idle-1').setDepth(this.d + 4).setDisplaySize(110, 79) : null;
    this.bubble = [b, t, face].filter(Boolean);
    for (const o of this.bubble) {
      const sx = o.scaleX, sy = o.scaleY;
      o.setAlpha(0).setScale(sx * 0.6, sy * 0.6);
      s.tweens.add({ targets: o, alpha: 1, scaleX: sx, scaleY: sy, duration: 220, ease: 'Back.easeOut' });
    }
    const mine = this.bubble;
    s.time.delayedCall(2600, () => {
      if (this.bubble !== mine) return;
      s.tweens.add({ targets: mine, alpha: 0, duration: 260, onComplete: () => mine.forEach((o) => o.destroy()) });
      this.bubble = null;
    });
  }
}

