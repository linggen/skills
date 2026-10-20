// hud.js — 守墙关's HUD and its modal moments: the top bar (pause · title · wave), the skill column (round icons with
// level badges), the wall's HP bar, the lead-in and countdown, banners, 银月's bubbles, the 3-card pick, the result.
import * as Phaser from 'phaser';
import { W, H } from 'shouqiang-core';
import { FONT } from './fx.js';

export const WORDS = {
  zh: { wave: '波次', waveN: (n) => `第 ${n} 波`, cleared: '守住了！', pick: '选一张符', fresh: '新', lv: (n) => `Lv.${n}`,
    boss: '合窳 来袭', bossName: '合窳', wail: '哇——哇——', won: '山门守住了！', lost: '山门破了', kills: (n) => `击退 ${n}`,
    wallLeft: (p) => `城墙 ${p}%`, paused: '暂停', resume: '点一下继续', next: '下一波', focus: '点兽群里一只：集火它' },
  en: { wave: 'Wave', waveN: (n) => `Wave ${n}`, cleared: 'Held!', pick: 'Pick a talisman', fresh: 'NEW', lv: (n) => `Lv.${n}`,
    boss: 'The Heyu comes', bossName: 'Heyu', wail: 'Waaah—', won: 'The gate holds!', lost: 'The gate fell', kills: (n) => `${n} driven off`,
    wallLeft: (p) => `Wall ${p}%`, paused: 'Paused', resume: 'Tap to go on', next: 'Next wave', focus: 'Tap a beast: everyone hits it' },
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

function makeHudTextures(scene) {
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
    this.text(W / 2 - 10, 30, title, 26, { color: '#fff6d8' });
    this.progBg = s.add.graphics().setDepth(this.d);
    this.prog = s.add.graphics().setDepth(this.d);
    this.progBg.fillStyle(0x000000, 0.5).fillRoundedRect(W / 2 - 110, 56, 200, 12, 6);
    s.add.image(472, 38, 'pill').setDepth(this.d).setScale(0.82);
    this.waveText = this.text(472, 38, '', 22, { color: '#ffe27a' }).setDepth(this.d + 1);
    this.fps = s.cfg.showFps ? this.text(18, 84, '', 16, { color: '#7dff7a', origin: 0 }) : null;
    this.bossBox = s.add.container(0, 0).setDepth(this.d).setVisible(false);
    const bg = s.add.graphics();
    bg.fillStyle(0x1b0d06, 0.85).fillRoundedRect(W / 2 - 190, 92, 380, 22, 11);
    this.bossFill = s.add.graphics();
    this.bossBox.add([bg, this.bossFill, this.text(W / 2, 103, this.w.bossName, 18, { color: '#ffe0e0' })]);
  }

  wallBar() {
    const s = this.s;
    const y = H - 30;
    this.wallBg = s.add.graphics().setDepth(this.d);
    this.wallBg.fillStyle(0x1b0d06, 0.85).fillRoundedRect(W / 2 - 180, y - 15, 360, 30, 15).lineStyle(3, 0xffd86b, 1).strokeRoundedRect(W / 2 - 180, y - 15, 360, 30, 15);
    this.wallFill = s.add.graphics().setDepth(this.d);
    s.add.image(W / 2 - 194, y, 'heart').setDepth(this.d + 1).setScale(0.9);
    this.wallText = this.text(W / 2, y, '', 22, { color: '#ffffff' }).setDepth(this.d + 1);
    this.wallY = y;
  }

  update(g, dt, fps) {
    this.waveText.setText(`${this.w.wave} ${Math.max(1, g.wave)}/${g.waves}`);
    const left = g.wall / g.wallMax;
    this.wallFlash = Math.max(0, this.wallFlash - dt);
    const col = left < 0.3 ? 0xff4b3a : left < 0.6 ? 0xffc23a : 0x3fe060;
    this.wallFill.clear().fillStyle(this.wallFlash > 0 ? 0xffffff : col, 1).fillRoundedRect(W / 2 - 176, this.wallY - 11, Math.max(10, 352 * left), 22, 11);
    this.wallFill.fillStyle(0xffffff, 0.3).fillRoundedRect(W / 2 - 172, this.wallY - 9, Math.max(6, 344 * left), 7, 4);
    this.wallText.setText(`${Math.ceil(g.wall)}`);
    const total = g.phase === 'wave' ? g.level.waves[g.wave - 1].reduce((n, [, c]) => n + c, 0) : 1;
    const remaining = g.phase === 'wave' ? g.spawns.length + g.beasts.length : 0;
    this.prog.clear().fillStyle(0xff8a3a, 1).fillRoundedRect(W / 2 - 108, 58, Math.max(0, 196 * (1 - remaining / Math.max(total, remaining))), 8, 4);
    const boss = g.beasts.find((b) => b.boss);
    this.bossBox.setVisible(Boolean(boss));
    if (boss) this.bossFill.clear().fillStyle(0xd61f2c, 1).fillRoundedRect(W / 2 - 186, 95, 372 * Math.max(0, boss.hp / boss.max), 16, 8);
    if (this.fps) this.fps.setText(`FPS:${Math.round(fps)}`);
    this.tickCountdown(g);
  }

  tickCountdown(g) {
    const on = (g.phase === 'lead' || g.phase === 'count') && g.timer <= 3.2;
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

  lead(lines, sec) {
    const slot = (sec - 0.4) / Math.max(1, lines.length);
    lines.forEach((l, i) => this.s.time.delayedCall(i * slot * 1000, () => {
      const str = l[this.lang] ?? l.zh;
      if (l.big) {
        this.banner(str, { size: 60, color: '#fff2a8', hold: slot * 1000 - 300 });
        this.s.shake(260, 0.008);
      } else this.storyLine(str, slot);
    }));
    this.s.time.delayedCall(Math.max(0, (sec - 2.5) * 1000), () => this.hint(this.w.focus));
  }

  storyLine(str, slot) {
    const s = this.s;
    const t = this.text(W / 2, 360, str, 30, { color: '#ffffff', wrap: 440 }).setDepth(this.d + 3).setAlpha(0);
    const back = s.add.graphics().setDepth(this.d + 2).fillStyle(0x000000, 0.5).fillRoundedRect(30, 360 - t.height / 2 - 18, W - 60, t.height + 36, 18).setAlpha(0);
    s.tweens.add({ targets: [t, back], alpha: 1, duration: 260 });
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
    const g = s.add.graphics();
    g.fillStyle(0xffffff, 1).lineStyle(4, 0x3b2210, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 14).strokeRoundedRect(-w / 2, -h / 2, w, h, 14);
    const tx = Phaser.Math.Clamp(x - bx, -w / 2 + 18, w / 2 - 18);
    g.fillTriangle(tx - 9, h / 2 - 2, tx + 9, h / 2 - 2, tx, h / 2 + 14).lineBetween(tx - 9, h / 2, tx, h / 2 + 14).lineBetween(tx + 9, h / 2, tx, h / 2 + 14);
    const c = s.add.container(bx, y, [g, t]).setDepth(this.d + 1).setScale(0.3).setAlpha(0);
    s.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 220, ease: 'Back.out' });
    s.tweens.add({ targets: c, alpha: 0, delay: ms, duration: 250, onComplete: () => c.destroy() });
  }

  wallHit() { this.wallFlash = 0.06; }

  // ---- the pick ------------------------------------------------------------------------------------------------

  offer(ids, g, onPick) {
    const s = this.s;
    this.modalOpen = true;
    const dim = s.add.rectangle(W / 2, H / 2, W, H, 0x0a0614, 0.62).setDepth(this.dm).setInteractive().setAlpha(0);
    s.tweens.add({ targets: dim, alpha: 1, duration: 200 });
    const title = this.banner(this.w.pick, { size: 44, y: 372, hold: 1e9 });
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
    const c = g.kit.cards.find((k) => k.id === id);
    const have = g.skills[id] ?? 0;
    const bg = s.add.image(0, 0, `card-${c.family}`);
    const icon = s.add.image(-160, -2, `icon-${id}`).setDisplaySize(104, 104);
    const name = this.text(-95, -30, c.name[this.lang] ?? c.name.zh, 28, { color: '#fffbe8', origin: 0 });
    const say = this.text(-95, 18, c.say[this.lang] ?? c.say.zh, 19, { color: '#fff3d0', origin: 0, wrap: 320 });
    const lvl = have ? this.w.lv(have + 1) : this.w.fresh;
    const tag = s.add.image(186, -46, 'badge').setScale(have ? 1.25 : 1.4);
    const tagText = this.text(186, -47, lvl, have ? 15 : 17, { color: '#ffffff' });
    const pips = [];
    for (let i = 0; i < c.max; i += 1) pips.push(s.add.image(-95 + 22 * i + 290 - c.max * 22, 50, 'star').setScale(0.42).setTint(i < have + 1 ? 0xffd23f : 0x4a3a5a));
    const cont = s.add.container(x, y, [bg, icon, name, say, tag, tagText, ...pips]);
    cont.hit = bg.setInteractive({ useHandCursor: true });
    return cont;
  }

  picked(id, g) {
    if (!id) return;
    const s = this.s;
    let entry = this.skillIcons.get(id);
    if (!entry) {
      const i = this.skillIcons.size;
      const y = 150 + i * 62;
      const icon = s.add.image(W / 2, H / 2, `icon-${id}`).setDisplaySize(54, 54).setDepth(this.d);
      const badge = s.add.image(W - 22, y + 18, 'badge').setScale(0.6).setDepth(this.d + 1).setAlpha(0);
      const n = this.text(W - 22, y + 17, '1', 15, { color: '#ffffff' }).setDepth(this.d + 2).setAlpha(0);
      entry = { icon, badge, n, y };
      this.skillIcons.set(id, entry);
      icon.setScale(icon.scaleX * 2.2);
      s.tweens.add({ targets: icon, x: W - 38, y, scaleX: 54 / icon.width, scaleY: 54 / icon.height, duration: 520, ease: 'Cubic.inOut',
        onComplete: () => { s.tweens.add({ targets: [badge, n], alpha: 1, duration: 150 }); s.em.burst('spark', 10, W - 38, y); } });
    } else {
      s.tweens.add({ targets: entry.icon, scaleX: entry.icon.scaleX * 1.3, scaleY: entry.icon.scaleY * 1.3, duration: 160, yoyo: true });
      s.em.burst('spark', 10, W - 38, entry.y);
    }
    entry.n.setText(String(g.skills[id]));
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
    const title = this.banner(won ? this.w.won : this.w.lost, { size: 52, y: 330, hold: 1e9, color: won ? '#fff2a8' : '#d8d8d8' });
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
