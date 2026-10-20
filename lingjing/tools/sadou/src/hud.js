// hud.js — 撒豆成兵's HUD and moments: the top bar (title · the road's progress to 合窳), the lead-in lines and the
// countdown that starts itself, banners, 银月's bubble, the boss's HP bar, the drag hint, the star result.
import * as Phaser from 'phaser';
import { W, H } from 'sadou-core';
import { FONT, canvasTex, rounded } from './fx.js';

export const WORDS = {
  zh: { go: '冲！', boss: (n) => `${n} 拦路`, bossName: '合窳', won: '大胜！', lost: '豆兵散了', left: (n) => `剩下 ${n} 个豆兵`,
    hint: '左右拖动 · 带队', keys: 'A / D 或 ← / → 也行', yinyue: '银月', slam: '它要砸了！',
    slams: { edges: '尾巴扫两边！站中间！', middle: '砸中间！闪开！' } },
  en: { go: 'GO!', boss: (n) => `The ${n} blocks the road`, bossName: 'Heyu', won: 'Victory!', lost: 'The beans scattered',
    left: (n) => `${n} soldiers left`, hint: 'Drag left · right to lead', keys: 'A / D or ← / → work too', yinyue: 'Yinyue', slam: 'It\'s slamming!',
    slams: { edges: 'Tails sweep both sides! Stay in the middle!', middle: 'It smashes the middle! Get out!' } },
};

const text = (scene, x, y, s, size, o = {}) => scene.add.text(x, y, s, {
  fontFamily: FONT, fontSize: `${size}px`, color: o.color ?? '#ffffff', stroke: o.stroke ?? '#1b0d05',
  strokeThickness: o.thick ?? Math.max(4, Math.round(size / 5)), align: 'center', wordWrap: o.wrap ? { width: o.wrap, useAdvancedWrap: true } : undefined,
  shadow: { offsetX: 0, offsetY: 3, color: 'rgba(0,0,0,0.45)', blur: 0, fill: true, stroke: true },
}).setOrigin(o.ox ?? 0.5, o.oy ?? 0.5);

function makeHudTextures(scene) {
  canvasTex(scene, 'topbar', 540, 130, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(14,10,24,0.85)'); g.addColorStop(0.6, 'rgba(14,10,24,0.4)'); g.addColorStop(1, 'rgba(14,10,24,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
  canvasTex(scene, 'pill-blue', 150, 56, (c, w, h) => {
    rounded(c, 3, 5, w - 6, h - 8, 24); c.fillStyle = 'rgba(0,0,0,0.35)'; c.fill();
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#5fd0ff'); g.addColorStop(1, '#1a5fd6');
    rounded(c, 3, 2, w - 6, h - 9, 24); c.fillStyle = g; c.fill();
    c.lineWidth = 4; c.strokeStyle = '#0b2556'; c.stroke();
    rounded(c, 12, 6, w - 24, 14, 7); c.fillStyle = 'rgba(255,255,255,0.35)'; c.fill();
  });
  canvasTex(scene, 'pill-red', 150, 56, (c, w, h) => {
    rounded(c, 3, 5, w - 6, h - 8, 24); c.fillStyle = 'rgba(0,0,0,0.35)'; c.fill();
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#ff7a5c'); g.addColorStop(1, '#b3121f');
    rounded(c, 3, 2, w - 6, h - 9, 24); c.fillStyle = g; c.fill();
    c.lineWidth = 4; c.strokeStyle = '#4a0610'; c.stroke();
    rounded(c, 12, 6, w - 24, 14, 7); c.fillStyle = 'rgba(255,255,255,0.3)'; c.fill();
  });
  canvasTex(scene, 'bar-back', 300, 30, (c, w, h) => {
    rounded(c, 2, 2, w - 4, h - 4, 13); c.fillStyle = 'rgba(10,8,20,0.8)'; c.fill();
    c.lineWidth = 3; c.strokeStyle = '#ffd86b'; c.stroke();
  });
  canvasTex(scene, 'panel', 420, 330, (c, w, h) => {
    rounded(c, 8, 14, w - 16, h - 20, 34); c.fillStyle = 'rgba(0,0,0,0.45)'; c.fill();
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#fff4d6'); g.addColorStop(1, '#f2c98a');
    rounded(c, 8, 6, w - 16, h - 20, 34); c.fillStyle = g; c.fill();
    c.lineWidth = 8; c.strokeStyle = '#7a3d12'; c.stroke();
    c.lineWidth = 3; c.strokeStyle = 'rgba(122,61,18,0.5)'; rounded(c, 22, 20, w - 44, h - 48, 24); c.stroke();
  });
  canvasTex(scene, 'ribbon', 440, 90, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#ff6b4a'); g.addColorStop(1, '#c01d22');
    c.fillStyle = g; c.strokeStyle = '#5a0a10'; c.lineWidth = 6; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(10, 14); c.lineTo(w - 10, 14); c.lineTo(w - 40, h / 2 + 4); c.lineTo(w - 10, h - 10); c.lineTo(10, h - 10);
    c.lineTo(40, h / 2 + 4); c.closePath(); c.fill(); c.stroke();
  });
  canvasTex(scene, 'bubble', 360, 84, (c, w, h) => {
    rounded(c, 3, 3, w - 6, h - 14, 20); c.fillStyle = 'rgba(255,255,255,0.96)'; c.fill();
    c.lineWidth = 4; c.strokeStyle = '#2a3a66'; c.stroke();
    c.beginPath(); c.moveTo(40, h - 12); c.lineTo(30, h - 1); c.lineTo(58, h - 12); c.closePath(); c.fillStyle = '#fff'; c.fill();
  });
}

export class Hud {
  constructor(scene, { depth }) {
    this.s = scene;
    this.d = depth;
    this.w = scene.w;
    makeHudTextures(scene);
    const s = scene;
    this.top = s.add.image(W / 2, 0, 'topbar').setOrigin(0.5, 0).setDepth(depth);
    this.title = text(s, W / 2, 30, scene.cfg.level.title[scene.lang], 26).setDepth(depth + 1);
    // the road to the boss: a bar, a bean at the crowd's place, the boss's face at its end
    this.barBack = s.add.image(W / 2, 72, 'bar-back').setDepth(depth);
    this.barFill = s.add.graphics().setDepth(depth + 1);
    this.barIcon = s.add.image(W / 2 + 160, 70, 'boss-face').setDepth(depth + 2).setDisplaySize(44, 44);
    this.bean = s.add.image(W / 2 - 140, 72, 'units', 'bean').setDepth(depth + 3).setScale(0.55);
    this.fps = scene.cfg.showFps ? text(s, 10, 104, '', 16, { ox: 0, color: '#9dff9d' }).setDepth(depth + 1) : null;
    this.bossBar = null;
    this.bubbleT = 0;
  }

  progress(f) {
    const x0 = W / 2 - 146, wpx = 292 * Phaser.Math.Clamp(f, 0, 1);
    this.barFill.clear().fillStyle(0x7fd8ff, 1).fillRoundedRect(x0, 61, Math.max(10, wpx), 22, 10)
      .fillStyle(0xffffff, 0.35).fillRoundedRect(x0 + 4, 63, Math.max(4, wpx - 8), 7, 3);
    this.bean.x = x0 + wpx;
  }

  /** The lead-in: the level's lines one after another, then the countdown, then `go()` — never a tap to start. */
  lead(lines, sec, countdown, { onBig, onTick, go }) {
    const s = this.s, per = (sec * 1000) / lines.length;
    lines.forEach((l, i) => s.time.delayedCall(i * per, () => {
      const big = Boolean(l.big);
      const t = text(s, W / 2, big ? 400 : 250 + i * 54, l[s.lang], big ? 64 : 28, { wrap: 460, color: big ? '#ffe36b' : '#ffffff', thick: big ? 12 : 6 })
        .setDepth(this.d + 5).setAlpha(0).setScale(big ? 2.2 : 1);
      s.tweens.add({ targets: t, alpha: 1, scale: 1, duration: big ? 380 : 260, ease: big ? 'Back.easeOut' : 'Quad.easeOut' });
      s.tweens.add({ targets: t, alpha: 0, y: t.y - 30, delay: sec * 1000 - i * per + (big ? 200 : 0), duration: 300, onComplete: () => t.destroy() });
      if (big) onBig?.();
    }));
    const n = countdown ?? 3;
    for (let k = 0; k <= n; k += 1) {
      s.time.delayedCall(sec * 1000 + 450 + k * 650, () => {
        const last = k === n;
        const t = last ? text(s, W / 2, 440, this.w.go, 110, { color: '#ffe36b', thick: 14 }) : s.add.bitmapText(W / 2, 440, 'numBig', String(n - k), 120).setOrigin(0.5);
        t.setDepth(this.d + 6).setScale(2.4).setAlpha(0);
        s.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
        s.tweens.add({ targets: t, scale: 0.6, alpha: 0, delay: 430, duration: 200, onComplete: () => t.destroy() });
        if (last) go(); else onTick?.();
      });
    }
    this.hintAt = sec * 1000 + 450 + n * 650;
  }

  hint() {
    const s = this.s;
    const hand = text(s, W / 2, 860, `◀  ${this.w.hint}  ▶`, 26, { color: '#ffffff' }).setDepth(this.d + 2);
    const sub = text(s, W / 2, 896, this.w.keys, 18, { color: '#d8e8ff' }).setDepth(this.d + 2);
    s.tweens.add({ targets: hand, x: { from: W / 2 - 24, to: W / 2 + 24 }, yoyo: true, repeat: 3, duration: 420, ease: 'Sine.easeInOut' });
    s.tweens.add({ targets: [hand, sub], alpha: 0, delay: 3600, duration: 500, onComplete: () => { hand.destroy(); sub.destroy(); } });
  }

  banner(msg, { color = '#ffffff', y = 300, ribbon = false } = {}) {
    const s = this.s;
    const parts = [];
    if (ribbon) parts.push(s.add.image(W / 2, y, 'ribbon').setDepth(this.d + 4));
    parts.push(text(s, W / 2, y, msg, 40, { color, thick: 9 }).setDepth(this.d + 5));
    for (const p of parts) {
      p.setScale(0.2, 1.6).setAlpha(0);
      s.tweens.add({ targets: p, scaleX: 1, scaleY: 1, alpha: 1, duration: 300, ease: 'Back.easeOut' });
      s.tweens.add({ targets: p, alpha: 0, y: y - 30, delay: 1500, duration: 350, onComplete: () => p.destroy() });
    }
  }

  /** 银月's line in a bubble at the top, her face beside it. */
  say(line) {
    if (!line) return;
    const s = this.s;
    this.bubble?.forEach((o) => o.destroy());
    const y = 182;
    const b = s.add.image(300, y, 'bubble').setDepth(this.d + 3);
    const t = text(s, 136, y - 6, line, 22, { ox: 0, color: '#1d2a50', stroke: '#ffffff', thick: 2, wrap: 320 }).setDepth(this.d + 4);
    const face = s.textures.get('yy').has('idle-1') ? s.add.image(70, y + 2, 'yy', 'idle-1').setDepth(this.d + 4).setDisplaySize(110, 79) : null;
    this.bubble = [b, t, face].filter(Boolean);
    for (const o of this.bubble) {
      const sx = o.scaleX, sy = o.scaleY;
      o.setAlpha(0).setScale(sx * 0.6, sy * 0.6);
      s.tweens.add({ targets: o, alpha: 1, scaleX: sx, scaleY: sy, duration: 220, ease: 'Back.easeOut' });
    }
    const mine = this.bubble;
    s.time.delayedCall(2400, () => {
      if (this.bubble !== mine) return;
      s.tweens.add({ targets: mine, alpha: 0, duration: 260, onComplete: () => mine.forEach((o) => o.destroy()) });
      this.bubble = null;
    });
  }

  showBoss(hp, name = this.w.bossName) {
    const s = this.s;
    this.bossHp = hp;
    this.bossBack = s.add.image(W / 2, 112, 'bar-back').setDepth(this.d).setScale(1.3, 1.1);
    this.bossFill = s.add.graphics().setDepth(this.d + 1);
    this.bossName = text(s, W / 2 - 200, 112, name, 22, { color: '#ffd0c0' }).setDepth(this.d + 2);
    this.bossNum = s.add.bitmapText(W / 2 + 10, 112, 'numSmall', String(hp), 26).setOrigin(0.5).setDepth(this.d + 2);
    this.bossShown = hp;
    this.bossLag = hp;
    this.drawBoss(hp);
  }

  drawBoss(hp) {
    if (!this.bossFill) return;
    const wFull = 380, x0 = W / 2 - 190;
    this.bossLag = Math.max(hp, this.bossLag - Math.max(1, (this.bossLag - hp) * 0.08));
    const f = hp / this.bossHp, lag = this.bossLag / this.bossHp;
    this.bossFill.clear().fillStyle(0xffffff, 0.9).fillRoundedRect(x0, 101, wFull * lag, 22, 9)
      .fillStyle(0xe8262c, 1).fillRoundedRect(x0, 101, Math.max(0, wFull * f), 22, 9)
      .fillStyle(0xffffff, 0.3).fillRoundedRect(x0 + 4, 103, Math.max(0, wFull * f - 8), 7, 3);
    this.bossNum.setText(String(Math.ceil(hp)));
  }

  result(won, stars, left, onDone) {
    const s = this.s, d = this.d + 10;
    const dim = s.add.rectangle(W / 2, H / 2, W, H, 0x0a0614, 0).setDepth(d);
    s.tweens.add({ targets: dim, fillAlpha: 0.55, duration: 400 });
    const panel = s.add.image(W / 2, 470, 'panel').setDepth(d + 1);
    const title = text(s, W / 2, 330, won ? this.w.won : this.w.lost, 58, { color: won ? '#ffe36b' : '#ffffff', thick: 12 }).setDepth(d + 3);
    const sub = text(s, W / 2, 560, this.w.left(left), 30, { color: '#6b3410', stroke: '#fff4d6', thick: 4 }).setDepth(d + 3);
    const all = [dim, panel, title, sub];
    for (const o of [panel, title, sub]) {
      o.setScale(0.3).setAlpha(0);
      s.tweens.add({ targets: o, scale: 1, alpha: 1, duration: 380, ease: 'Back.easeOut', delay: o === panel ? 100 : 220 });
    }
    for (let i = 0; i < 3; i += 1) {
      const x = W / 2 + (i - 1) * 110, y = 460 - (i === 1 ? 18 : 0);
      const back = s.add.image(x, y, 'star').setDepth(d + 2).setScale(2.4).setTint(0x6b4a2a).setAlpha(0.5);
      all.push(back);
      if (i < stars) {
        const st = s.add.image(x, y, 'star').setDepth(d + 3).setScale(0).setTint(0xffd23f);
        all.push(st);
        s.tweens.add({ targets: st, scale: 2.6, delay: 600 + i * 300, duration: 360, ease: 'Back.easeOut',
          onStart: () => { s.em?.burst('stars', 10, x, y); s.sfx?.pop(); } });
      }
    }
    s.time.delayedCall(1700 + stars * 300, onDone);
    return all;
  }
}
