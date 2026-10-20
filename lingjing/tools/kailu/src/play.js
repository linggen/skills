// play.js — 喂饭桶 · 开炉 (Hanli 10-20): the 饭桶's lottery as one Phaser scene, in four beats.
//
//   配料  drag up to three things from the tray into the open mouth (or tap them), add 0–3 灵石; the steam over the
//         mouth takes the colour of the pot's lean, brighter the better the pot.
//   压盖  the 饭桶 chews; the lid shakes harder and puffs red and gold. Press (and hold) on a gold puff: the lid is
//         pressed down and the grade goes up a notch. Too early or too late keeps the plain roll.
//   开奖  「咔哒」, the lid pops, the thing spins out in its grade's glow — grey, blue, purple, gold (with a shake).
//   收下  the result goes to the shell; the page carries on.
//
// Nothing here knows the odds: `data.roll(ids, lingshi, press)` is the rules' (the page's `fantong feed`, or the
// 游戏厅's sample). The press is the only thing this scene decides, and it is only an input to the roll.
import * as Phaser from 'phaser';

export const W = 720, H = 1080, ZOOM_MAX = 1.5;
const FONT = 'KLKuaiLe, "PingFang SC", "Microsoft YaHei", sans-serif';
const GRADES = ['junk', 'useful', 'rare', 'best'];
const GRADE_COL = { junk: 0xb7bcc2, useful: 0x4fa3ff, rare: 0xb36cff, best: 0xffc83a };
const GRADE_CSS = { junk: '#c7ccd2', useful: '#6cb4ff', rare: '#c58bff', best: '#ffd35a' };
const POT = { x: W / 2, y: 410, s: 1.38 }; // the 饭桶 (289 × 320 art)
const SPLIT = 122; // where the lid's rim meets the body in pot-shut.webp
const MOUTH = { x: W / 2, y: POT.y - 70, r: 190 };
const SLOT_Y = 664, TRAY_Y = 776, BTN_Y = 1012;
const D = { bg: 0, pot: 10, lid: 12, steam: 14, item: 30, fx: 40, ui: 60, card: 70, drag: 90 };

export const WORDS = {
  zh: {
    feed: '开 炉', press: '按住，压盖！', early: '压早了', late: '压晚了', good: '压住了！', take: '收 下', back: '再配一锅',
    stones: '灵石', have: '（有{n}）', empty: '把东西拖进饭桶嘴里，最多三样', none: '没有能喂的东西。', click: '咔哒！', chew: '咯嘣……咯嘣……',
    spat: '呸！', fresh: '新！',
  },
  en: {
    feed: 'FIRE IT', press: 'Hold — press the lid!', early: 'Too early', late: 'Too late', good: 'Pressed!', take: 'Take it', back: 'Another pot',
    stones: 'Spirit stones', have: '(have {n})', empty: 'Drag things into its mouth — three at most', none: 'Nothing here will go in.', click: 'Click!', chew: 'Crunch… crunch…',
    spat: 'Ptoo!', fresh: 'New!',
  },
};
const fill = (t, v) => String(t).replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));

function canvasTex(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) return;
  const t = scene.textures.createCanvas(key, w, h);
  draw(t.getContext(), w, h);
  t.refresh();
}
const radial = (c, w, h, stops) => {
  const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) / 2);
  for (const [at, col] of stops) g.addColorStop(at, col);
  c.fillStyle = g; c.fillRect(0, 0, w, h);
};

export class KailuScene extends Phaser.Scene {
  constructor() { super('kailu'); }

  init(cfg) {
    this.cfg = cfg;
    this.lang = cfg.lang === 'en' ? 'en' : 'zh';
    this.w = WORDS[this.lang];
    this.brief = cfg.data.brief;
    this.calm = Boolean(cfg.reducedMotion);
  }

  preload() {
    const art = `${this.cfg.base}art/`;
    for (const k of ['pot-open', 'pot-shut', 'woodpile']) this.load.image(k, `${art}${k}.webp`);
    for (const i of this.brief.inputs ?? []) this.iconLoad(i.id);
    this.iconLoad('lingshi');
    this.missing = new Set();
    this.load.on('loaderror', (f) => this.missing.add(f.key));
  }

  iconLoad(id, art = null) {
    const url = this.cfg.data.icon?.(id, art);
    if (url && !this.textures.exists(`i:${id}`)) this.load.image(`i:${id}`, url);
  }
  iconKey(id) { return this.textures.exists(`i:${id}`) && !this.missing.has(`i:${id}`) ? `i:${id}` : 'noicon'; }

  create() {
    this.cameras.main.setZoom(this.cfg.zoom ?? 1).centerOn(W / 2, H / 2);
    this.textures_();
    this.stage();
    this.pot = [];          // the ids in the pot, in order
    this.lingshi = 0;
    this.left = Object.fromEntries((this.brief.inputs ?? []).map((i) => [i.id, i.around ? Infinity : i.n ?? 1]));
    this.page = 0;
    this.phase = this.brief.ready === false ? 'full' : 'fill';
    this.ui = this.add.container(0, 0).setDepth(D.ui);
    this.drawFill();
    this.input.dragDistanceThreshold = 12; // a press that never moves is a tap, not a drag
    this.input.on('pointerdown', (p) => this.onDown(p));
    this.input.on('pointerup', () => this.onUp());
    this.fpsText = this.cfg.showFps ? this.add.text(12, 12, '', { fontFamily: 'monospace', fontSize: 18, color: '#7dff7a' }).setDepth(99) : null;
    this.frames = 0; this.fpsAt = 0;
    this.events.once('shutdown', () => this.timers?.forEach((t) => t.remove()));
  }

  update(time, delta) {
    if (this.fpsText && time - this.fpsAt > 500) { this.fpsText.setText(`FPS:${Math.round(this.game.loop.actualFps)}`); this.fpsAt = time; }
  }

  /* ── the textures made once on a canvas ── */
  textures_() {
    canvasTex(this, 'glow', 128, 128, (c, w, h) => radial(c, w, h, [[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,0.75)'], [1, 'rgba(255,255,255,0)']]));
    canvasTex(this, 'soft', 64, 64, (c, w, h) => radial(c, w, h, [[0, 'rgba(255,255,255,0.85)'], [0.6, 'rgba(255,255,255,0.3)'], [1, 'rgba(255,255,255,0)']]));
    canvasTex(this, 'puff', 96, 96, (c, w, h) => radial(c, w, h, [[0, 'rgba(255,255,255,0.95)'], [0.5, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]));
    canvasTex(this, 'star', 40, 40, (c, w, h) => {
      c.fillStyle = '#fff'; c.beginPath();
      for (let i = 0; i < 10; i += 1) { const r = i % 2 ? 7 : 18, a = -Math.PI / 2 + (i * Math.PI) / 5; c.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r); }
      c.closePath(); c.fill();
    });
    canvasTex(this, 'rays', 512, 512, (c, w, h) => {
      c.translate(w / 2, h / 2);
      for (let i = 0; i < 16; i += 1) {
        c.rotate((Math.PI * 2) / 16);
        const g = c.createLinearGradient(0, 0, 0, -w / 2);
        g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.beginPath(); c.moveTo(-14, 0); c.lineTo(0, -w / 2); c.lineTo(14, 0); c.closePath(); c.fill();
      }
    });
    canvasTex(this, 'ring', 160, 160, (c, w) => { c.strokeStyle = '#fff'; c.lineWidth = 10; c.shadowColor = '#fff'; c.shadowBlur = 14; c.beginPath(); c.arc(w / 2, w / 2, w / 2 - 16, 0, Math.PI * 2); c.stroke(); });
    canvasTex(this, 'noicon', 96, 96, (c, w) => { c.fillStyle = '#e8d6b0'; c.strokeStyle = '#5a3a1e'; c.lineWidth = 5; c.beginPath(); c.arc(w / 2, w / 2, 30, 0, Math.PI * 2); c.fill(); c.stroke(); });
    canvasTex(this, 'bg', 360, 540, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#3b2516'); g.addColorStop(0.55, '#5a3820'); g.addColorStop(1, '#2a1a10');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 3; // the woodshed's planks
      for (let x = 0; x < w; x += 40) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h * 0.62); c.stroke(); }
      const f = c.createRadialGradient(w / 2, h * 0.4, 20, w / 2, h * 0.4, h * 0.6);
      f.addColorStop(0, 'rgba(255,190,110,0.25)'); f.addColorStop(1, 'rgba(0,0,0,0.45)');
      c.fillStyle = f; c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(30,18,10,0.55)'; c.fillRect(0, h * 0.62, w, h * 0.38); // the floor
    });
    // The lid and the body, cut from the shut pot so the lid can jump on its own.
    const src = this.textures.get('pot-shut').getSourceImage();
    if (!this.textures.exists('lid') && src?.width) {
      const lw = src.width, lh = src.height;
      canvasTex(this, 'lid', lw, SPLIT + 6, (c) => c.drawImage(src, 0, 0, lw, SPLIT + 6, 0, 0, lw, SPLIT + 6));
      canvasTex(this, 'body', lw, lh - SPLIT, (c) => c.drawImage(src, 0, SPLIT, lw, lh - SPLIT, 0, 0, lw, lh - SPLIT));
    }
  }

  stage() {
    this.add.image(W / 2, H / 2, 'bg').setDisplaySize(W, H).setDepth(D.bg);
    this.add.image(96, 600, 'woodpile').setScale(0.9).setAlpha(0.95).setDepth(D.bg + 1);
    this.add.image(POT.x, POT.y + 205, 'soft').setDisplaySize(420, 70).setTint(0x000000).setAlpha(0.5).setDepth(D.pot - 1);
    this.potOpen = this.add.image(POT.x, POT.y, 'pot-open').setScale(POT.s).setDepth(D.pot);
    const top = POT.y - (320 * POT.s) / 2;
    this.body_ = this.add.image(POT.x, top + SPLIT * POT.s, 'body').setOrigin(0.5, 0).setScale(POT.s).setDepth(D.pot).setVisible(false);
    this.gap = this.add.image(POT.x, top + SPLIT * POT.s - 6, 'glow').setDisplaySize(300, 60).setDepth(D.pot + 1).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    this.lidY = top + (SPLIT + 6) * POT.s;
    this.lid = this.add.image(POT.x, this.lidY, 'lid').setOrigin(0.5, 1).setScale(POT.s).setDepth(D.lid).setVisible(false);
    // The lean's colour over the mouth: a faint steam, never a number.
    this.lean = this.add.image(MOUTH.x, MOUTH.y - 20, 'glow').setDisplaySize(260, 200).setDepth(D.steam).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    this.steam = this.add.particles(0, 0, 'puff', {
      x: { min: MOUTH.x - 60, max: MOUTH.x + 60 }, y: MOUTH.y + 10, speedY: { min: -70, max: -40 }, speedX: { min: -12, max: 12 },
      scale: { start: 0.5, end: 1.6 }, alpha: { start: 0.1, end: 0 }, lifespan: 2200, frequency: this.calm ? 600 : 260, blendMode: 'ADD',
    }).setDepth(D.steam);
    this.puffs = this.add.particles(0, 0, 'puff', { speed: { min: 80, max: 220 }, angle: { min: 230, max: 310 }, scale: { start: 0.6, end: 1.8 }, alpha: { start: 0.9, end: 0 }, lifespan: 700, emitting: false, blendMode: 'ADD' }).setDepth(D.steam + 1);
    this.burst = this.add.particles(0, 0, 'star', { speed: { min: 180, max: 520 }, angle: { min: 0, max: 360 }, scale: { start: 0.9, end: 0 }, rotate: { min: 0, max: 360 }, lifespan: 1000, gravityY: 500, emitting: false }).setDepth(D.fx);
    this.sparks = this.add.particles(0, 0, 'glow', { speed: { min: 60, max: 260 }, scale: { start: 0.35, end: 0 }, lifespan: 900, emitting: false, blendMode: 'ADD' }).setDepth(D.fx);
    this.status = this.text(W / 2, 64, '', 30, { color: '#f6e6c4', wrap: W - 80 });
  }

  /** A text in the game font, outlined. */
  text(x, y, s, size, { color = '#fff8e6', stroke = '#3a1d0a', origin = 0.5, wrap = 0, depth = D.ui } = {}) {
    return this.add.text(x, y, s, {
      fontFamily: FONT, fontSize: `${size}px`, color, stroke, strokeThickness: Math.max(3, Math.round(size / 6)), align: 'center',
      ...(wrap ? { wordWrap: { width: wrap, useAdvancedWrap: true } } : {}),
    }).setOrigin(origin).setDepth(depth);
  }

  /** A chunky comic button: a rounded plank with a label; `on` taps it. */
  button(x, y, w, h, label, on, { color = 0xe0662a, size = 40, disabled = false } = {}) {
    const c = this.add.container(x, y).setDepth(D.ui + 1);
    const g = this.add.graphics();
    const draw = (down) => {
      g.clear();
      g.fillStyle(0x3a1d0a, 1).fillRoundedRect(-w / 2, -h / 2 + 6, w, h, 22);
      g.fillStyle(disabled ? 0x7d6a5a : color, 1).fillRoundedRect(-w / 2, -h / 2 + (down ? 5 : 0), w, h - 2, 22);
      g.fillStyle(0xffffff, disabled ? 0.08 : 0.22).fillRoundedRect(-w / 2 + 10, -h / 2 + 6 + (down ? 5 : 0), w - 20, h * 0.32, 14);
    };
    draw(false);
    const t = this.text(0, -2, label, size, { depth: D.ui + 2 });
    c.add([g, t]);
    if (!disabled) {
      c.setSize(w, h).setInteractive({ useHandCursor: true });
      c.on('pointerdown', (p, lx, ly, e) => { e?.stopPropagation?.(); draw(true); t.y = 3; });
      c.on('pointerout', () => { draw(false); t.y = -2; });
      c.on('pointerup', (p, lx, ly, e) => { e?.stopPropagation?.(); draw(false); t.y = -2; on(); });
    }
    return c;
  }

  /* ── 配料 ── */
  drawFill() {
    this.ui.removeAll(true);
    this.potOpen.setVisible(this.phase !== 'full').setTexture('pot-open');
    this.body_.setVisible(this.phase === 'full');
    this.lid.setVisible(this.phase === 'full').setPosition(POT.x, this.lidY).setAngle(0);
    this.steam.emitting = this.phase !== 'full';
    const inputs = this.brief.inputs ?? [];
    if (this.phase === 'full') {
      this.status.setText(this.brief.wait ?? '');
      if (!this.calm) this.zzz();
    } else this.status.setText(inputs.length ? this.w.empty : this.w.none);
    // The pot's three places.
    for (let k = 0; k < (this.brief.max_in ?? 3); k++) {
      const x = W / 2 + (k - 1) * 130, id = this.pot[k];
      const ring = this.add.graphics().fillStyle(0x1a0e06, 0.55).fillCircle(x, SLOT_Y, 46).lineStyle(4, 0xe8c27a, id ? 1 : 0.35).strokeCircle(x, SLOT_Y, 46);
      this.ui.add(ring);
      if (!id) continue;
      const ic = this.add.image(x, SLOT_Y, this.iconKey(id)).setDepth(D.ui + 1);
      ic.setScale(76 / Math.max(ic.width, ic.height));
      ic.setInteractive({ useHandCursor: true }).on('pointerup', () => this.takeOut(k));
      this.ui.add(ic);
    }
    // 灵石: − n ＋, what he has.
    const ls = this.brief.lingshi;
    if (ls && ls.max > 0) {
      const y = SLOT_Y + 70;
      const st = this.add.image(W / 2 - 150, y, this.iconKey('lingshi')).setDepth(D.ui);
      st.setScale(46 / Math.max(st.width, st.height));
      this.ui.add([st, this.text(W / 2 - 60, y, `${this.w.stones} ×${this.lingshi}`, 28), this.text(W / 2 + 196, y, fill(this.w.have, { n: ls.have }), 22, { color: '#d9c39a' })]);
      const can = this.phase === 'fill';
      this.ui.add(this.button(W / 2 + 50, y, 56, 50, '−', () => { this.lingshi = Math.max(0, this.lingshi - 1); this.drawFill(); }, { size: 34, color: 0x8a6a3a, disabled: !can || !this.lingshi }));
      this.ui.add(this.button(W / 2 + 116, y, 56, 50, '+', () => { this.lingshi = Math.min(ls.max, ls.have, this.lingshi + 1); this.drawFill(); }, { size: 34, color: 0x8a6a3a, disabled: !can || this.lingshi >= Math.min(ls.max, ls.have) }));
    }
    this.drawTray();
    const ready = this.phase === 'fill' && this.pot.length > 0;
    this.ui.add(this.button(W / 2, BTN_Y, 300, 84, this.w.feed, () => this.chew(), { disabled: !ready, color: 0xe0662a, size: 44 }));
    this.leanShow();
  }

  drawTray() {
    const inputs = this.brief.inputs ?? [], per = 10, pages = Math.max(1, Math.ceil(inputs.length / per));
    this.page = Math.min(this.page, pages - 1);
    const g = this.add.graphics().fillStyle(0x1a0e06, 0.6).fillRoundedRect(20, TRAY_Y - 4, W - 40, 184, 20);
    this.ui.add(g);
    const shown = inputs.slice(this.page * per, this.page * per + per);
    shown.forEach((it, k) => {
      const x = 104 + (k % 5) * 128, y = TRAY_Y + 40 + Math.floor(k / 5) * 88;
      const n = this.left[it.id] ?? 0, off = this.phase !== 'fill' || n <= 0;
      const ic = this.add.image(x, y - 6, this.iconKey(it.id)).setDepth(D.ui + 1).setAlpha(off ? 0.35 : 1);
      ic.setScale(60 / Math.max(ic.width, ic.height));
      const name = this.text(x, y + 36, it.name, 18, { color: off ? '#8d7a62' : '#f6e6c4' });
      this.ui.add([ic, name]);
      if (Number.isFinite(n) && n > 1) this.ui.add(this.text(x + 34, y - 30, `×${n}`, 18, { color: '#ffe9a8' }));
      if (off) return;
      ic.setInteractive({ useHandCursor: true, draggable: true });
      ic.on('dragstart', () => this.dragStart(it, ic));
      ic.on('drag', (p) => this.dragMove(p));
      ic.on('dragend', (p) => this.dragEnd(p));
      ic.on('pointerup', () => { if (!this.dragging) this.addToPot(it.id); });
    });
    if (pages > 1) {
      this.ui.add(this.button(38, TRAY_Y + 88, 36, 70, '‹', () => { this.page = (this.page + pages - 1) % pages; this.drawFill(); }, { size: 34, color: 0x8a6a3a }));
      this.ui.add(this.button(W - 38, TRAY_Y + 88, 36, 70, '›', () => { this.page = (this.page + 1) % pages; this.drawFill(); }, { size: 34, color: 0x8a6a3a }));
    }
  }

  dragStart(it, ic) {
    this.dragging = { id: it.id };
    this.ghost = this.add.image(ic.x, ic.y, ic.texture.key).setScale(ic.scale * 1.3).setDepth(D.drag).setAlpha(0.95);
  }
  dragMove(p) {
    if (!this.ghost) return;
    const { x, y } = this.cameras.main.getWorldPoint(p.x, p.y);
    this.ghost.setPosition(x, y);
    const over = Phaser.Math.Distance.Between(x, y, MOUTH.x, MOUTH.y) < MOUTH.r;
    this.potOpen.setScale(POT.s * (over ? 1.04 : 1));
  }
  dragEnd(p) {
    const id = this.dragging?.id;
    const { x, y } = this.cameras.main.getWorldPoint(p.x, p.y);
    const over = Phaser.Math.Distance.Between(x, y, MOUTH.x, MOUTH.y) < MOUTH.r;
    this.potOpen.setScale(POT.s);
    const g = this.ghost; this.ghost = null;
    if (over && id) {
      this.tweens.add({ targets: g, x: MOUTH.x, y: MOUTH.y + 20, scale: 0.1, duration: 220, ease: 'Quad.in', onComplete: () => g.destroy() });
      this.addToPot(id, true);
    } else g?.destroy();
    this.time.delayedCall(0, () => { this.dragging = null; });
  }

  addToPot(id, dropped = false) {
    if (this.phase !== 'fill' || this.pot.length >= (this.brief.max_in ?? 3) || !(this.left[id] > 0)) return;
    this.pot.push(id);
    this.left[id] -= 1;
    if (!dropped) {
      const it = this.add.image(W / 2, TRAY_Y, this.iconKey(id)).setDepth(D.drag);
      it.setScale(60 / Math.max(it.width, it.height));
      this.tweens.add({ targets: it, x: MOUTH.x, y: MOUTH.y + 20, scale: 0.1, duration: 320, ease: 'Quad.in', onComplete: () => it.destroy() });
    }
    this.tweens.add({ targets: this.potOpen, scaleY: POT.s * 0.94, scaleX: POT.s * 1.05, duration: 90, yoyo: true, delay: 200 });
    this.time.delayedCall(220, () => this.puffs.explode(6, MOUTH.x, MOUTH.y));
    this.drawFill();
  }
  takeOut(k) {
    if (this.phase !== 'fill') return;
    const [id] = this.pot.splice(k, 1);
    this.left[id] += 1;
    this.drawFill();
  }

  /* The lean: the colour of the kinds in the pot, brighter with its 品阶 and the 灵石. */
  leanShow() {
    const by = {};
    for (const id of this.pot) { const k = this.brief.inputs.find((i) => i.id === id)?.kind ?? 'junk'; by[k] = (by[k] ?? 0) + 1; }
    const top = Object.entries(by).sort((a, b) => b[1] - a[1])[0]?.[0];
    const tint = top ? Phaser.Display.Color.HexStringToColor(this.brief.tints?.[top] ?? '#9aa0a6').color : 0xffffff;
    const tier = Math.max(0, ...this.pot.map((id) => this.brief.inputs.find((i) => i.id === id)?.tier ?? 0));
    const a = this.pot.length ? Math.min(0.75, 0.22 + 0.12 * tier + 0.07 * this.lingshi) : 0;
    this.lean.setTint(tint);
    this.tweens.killTweensOf(this.lean);
    this.tweens.add({ targets: this.lean, alpha: a, duration: 400 });
    if (a && !this.calm) this.tweens.add({ targets: this.lean, alpha: a * 0.6, duration: 900, yoyo: true, repeat: -1, delay: 400, ease: 'Sine.inOut' });
    this.steam.setParticleTint(tint);
    this.steam.setParticleAlpha({ start: 0.1 + a * 0.5, end: 0 });
  }

  zzz() {
    const z = this.text(POT.x + 120, POT.y - 160, 'z z z', 34, { color: '#cfe0ff' });
    this.ui.add(z);
    this.tweens.add({ targets: z, y: z.y - 30, alpha: 0.3, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }

  /* ── 压盖 ── */
  chew() {
    if (this.phase !== 'fill' || !this.pot.length) return;
    this.phase = 'chew';
    this.pressed = null;
    this.drawFill();
    this.ui.removeAll(true);
    this.steam.emitting = false;
    this.tweens.killTweensOf(this.lean);
    this.tweens.add({ targets: this.lean, alpha: 0, duration: 300 });
    // Shut: the lid drops on with a clang.
    this.potOpen.setVisible(false);
    this.body_.setVisible(true);
    this.lid.setVisible(true).setY(this.lidY - 120);
    this.tweens.add({ targets: this.lid, y: this.lidY, duration: 260, ease: 'Bounce.out' });
    this.cameras.main.shake(120, 0.004);
    this.status.setText(this.w.chew);
    this.hint = this.text(W / 2, 880, this.w.press, 40, { color: '#ffe08a' });
    this.ui.add(this.hint);
    this.tweens.add({ targets: this.hint, scale: 1.08, duration: 420, yoyo: true, repeat: -1 });
    // The chew: puffs on a schedule, red decoys and gold windows (two; one wide one when motion is reduced).
    const total = this.calm ? 4200 : 3800;
    const plan = this.calm ? [['red', 900, 600], ['gold', 2200, 1000], ['red', 3400, 500]]
      : [['red', 650, 380], ['gold', 1250, 420], ['red', 1850, 360], ['red', 2300, 300], ['gold', 2850, 380], ['red', 3350, 300]];
    this.windows = plan.filter(([c]) => c === 'gold').map(([, at, ms]) => [at, at + ms]);
    this.t0 = this.time.now;
    this.timers = plan.map(([c, at, ms]) => this.time.delayedCall(at, () => this.puff(c, ms)));
    this.timers.push(this.time.delayedCall(total, () => this.chewEnd()));
    // The lid shakes harder as it goes.
    this.shake = this.tweens.addCounter({ from: 0, to: 1, duration: total, onUpdate: (tw) => {
      if (this.pressed?.good) return;
      const k = tw.getValue(), j = this.calm ? 0.3 : 1;
      this.lid.setAngle(Math.sin(this.time.now / 45) * (1 + 5 * k) * j);
      this.lid.y = this.lidY - Math.abs(Math.sin(this.time.now / 70)) * (2 + 8 * k) * j - (this.puffing ? 14 : 0);
      this.body_.setScale(POT.s * (1 + Math.sin(this.time.now / 60) * 0.006 * k), POT.s);
    } });
    this.fact('chew');
  }

  puff(color, ms) {
    if (this.phase !== 'chew') return;
    const col = color === 'gold' ? 0xffd34d : 0xff5a3c;
    this.puffing = color;
    this.gap.setTint(col).setAlpha(0.95);
    this.puffs.setParticleTint(col);
    this.puffs.explode(color === 'gold' ? 18 : 10, POT.x, this.lidY - 10);
    if (color === 'gold') this.sparks.setParticleTint(col).explode(10, POT.x, this.lidY - 10);
    this.time.delayedCall(ms, () => { if (this.puffing === color) { this.puffing = null; this.tweens.add({ targets: this.gap, alpha: 0, duration: 120 }); } });
  }

  onDown() {
    if (this.phase !== 'chew' || this.pressed) return;
    const at = this.time.now - this.t0;
    const good = this.windows.some(([a, b]) => at >= a && at <= b);
    this.pressed = { good, early: !good && at < this.windows[0][0], at };
    this.tweens.killTweensOf(this.hint);
    this.hint.setText(good ? this.w.good : this.pressed.early ? this.w.early : this.w.late).setColor(good ? '#ffd34d' : '#d9c39a').setScale(1);
    this.lid.setAngle(0);
    this.tweens.add({ targets: this.lid, y: this.lidY + 6, duration: 90, ease: 'Quad.out' });
    if (good) {
      this.cameras.main.shake(160, 0.008);
      this.sparks.setParticleTint(0xffd34d).explode(this.calm ? 12 : 30, POT.x, this.lidY);
      this.cameras.main.flash(120, 255, 220, 120);
      // A good press ends the chew at once: the pot is held, the rest of the puffs come to nothing.
      this.timers.forEach((t) => t.remove());
      this.timers = [this.time.delayedCall(650, () => this.chewEnd())];
    }
  }
  onUp() {}

  async chewEnd() {
    if (this.phase !== 'chew') return;
    this.phase = 'wait';
    this.shake?.stop();
    const press = Boolean(this.pressed?.good);
    let r = null;
    try { r = await this.cfg.data.roll(this.pot.slice(), this.lingshi, press); } catch (e) { r = { ok: false, say: String(e?.message ?? e) }; }
    if (!this.scene.isActive()) return;
    if (!r?.ok) { this.refused(r); return; }
    if (r.spat_back) { this.spat(r); return; }
    for (const o of r.outs ?? []) this.iconLoad(o.id, o.art);
    this.load.once('complete', () => this.reveal(r));
    this.load.start();
    if (!this.load.isLoading()) this.reveal(r);
  }

  refused(r) {
    this.phase = 'fill';
    this.lid.setVisible(false); this.body_.setVisible(false);
    for (const id of this.pot) this.left[id] += 1;
    this.pot = [];
    this.drawFill();
    this.status.setText(r?.say ?? '…');
  }

  /* It chews twice and spits the pot back whole. */
  spat(r) {
    this.lid.setY(this.lidY - 60);
    this.tweens.add({ targets: this.lid, y: this.lidY, duration: 300, ease: 'Bounce.out' });
    const t = this.text(POT.x, POT.y - 210, this.w.spat, 72, { color: '#ffffff' });
    this.tweens.add({ targets: t, scale: { from: 0.3, to: 1.1 }, duration: 260, ease: 'Back.out' });
    this.pot.forEach((id, k) => {
      const it = this.add.image(POT.x, this.lidY, this.iconKey(id)).setDepth(D.item);
      it.setScale(70 / Math.max(it.width, it.height));
      this.tweens.add({ targets: it, x: 160 + k * 200, y: TRAY_Y + 40, angle: 540, duration: 700, ease: 'Quad.out', onComplete: () => it.destroy() });
    });
    this.say('spat');
    this.time.delayedCall(1300, () => { t.destroy(); this.phase = 'fill'; this.lid.setVisible(false); this.body_.setVisible(false); this.drawFill(); this.status.setText(r.say ?? ''); });
  }

  /* ── 开奖 ── */
  reveal(r) {
    if (this.phase !== 'wait') return;
    this.phase = 'reveal';
    this.result = r;
    const outs = r.outs?.length ? r.outs : [r.out];
    const grade = r.grade ?? outs[0].grade ?? 'junk', big = grade === 'best' || r.story;
    this.ui.removeAll(true);
    this.status.setText('');
    // 「咔哒」: the lid pops off and spins.
    const click = this.text(POT.x, POT.y - 250, this.w.click, big ? 84 : 64, { color: GRADE_CSS[grade] });
    click.setScale(0.2);
    this.tweens.add({ targets: click, scale: 1, duration: 240, ease: 'Back.out' });
    this.tweens.add({ targets: click, alpha: 0, delay: 900, duration: 400 });
    this.gap.setTint(GRADE_COL[grade]).setAlpha(1);
    this.tweens.add({ targets: this.lid, y: this.lidY - 260, angle: -200, duration: 520, ease: 'Quad.out' });
    this.tweens.add({ targets: this.lid, y: this.lidY, angle: -360, delay: 900, duration: 380, ease: 'Bounce.out' });
    if (big && !this.calm) this.cameras.main.shake(520, 0.014);
    else if (grade === 'rare' && !this.calm) this.cameras.main.shake(220, 0.006);
    if (big) this.cameras.main.flash(260, 255, 220, 120);
    const n = outs.length, cy = 268; // up out of the lid, over the pot
    outs.forEach((o, k) => this.time.delayedCall(260 + k * 520, () => this.spin(o, n === 1 ? W / 2 : W / 2 + (k ? 160 : -160), cy, o.grade ?? grade, n)));
    this.time.delayedCall(260 + n * 520 + 300, () => this.card(r, outs, grade));
    this.say(r.story ? 'story' : r.twin ? 'twin' : grade);
    this.fact('reveal', { grade });
  }

  spin(o, x, y, grade, n) {
    const col = GRADE_COL[grade] ?? 0xffffff, big = grade === 'best';
    const rays = big || grade === 'rare' ? this.add.image(x, y, 'rays').setTint(col).setAlpha(0).setDepth(D.item - 2).setBlendMode(Phaser.BlendModes.ADD).setScale(big ? 1.3 : 0.9) : null;
    if (rays) { this.tweens.add({ targets: rays, alpha: big ? 0.85 : 0.5, duration: 300 }); if (!this.calm) this.tweens.add({ targets: rays, angle: 360, duration: 9000, repeat: -1 }); }
    const halo = this.add.image(x, y, 'glow').setTint(col).setDepth(D.item - 1).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(10, 10);
    this.tweens.add({ targets: halo, displayWidth: big ? 380 : 300, displayHeight: big ? 380 : 300, alpha: { from: 1, to: 0.85 }, duration: 500, ease: 'Back.out' });
    const ring = this.add.image(x, y, 'ring').setTint(col).setDepth(D.item - 1).setScale(0.2).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: ring, scale: big ? 2.6 : 1.8, alpha: 0, duration: 700, ease: 'Quad.out' });
    const it = this.add.image(POT.x, this.lidY, this.iconKey(o.id)).setDepth(D.item);
    const s = (n > 1 ? 150 : 190) / Math.max(it.width, it.height);
    it.setScale(s * 0.15);
    this.tweens.add({ targets: it, x, y, scale: s, angle: this.calm ? 0 : 720, duration: this.calm ? 300 : 620, ease: 'Cubic.out' });
    if (!this.calm) this.tweens.add({ targets: it, y: y - 10, duration: 1100, yoyo: true, repeat: -1, delay: 700, ease: 'Sine.inOut' });
    this.burst.setParticleTint(col).explode(this.calm ? 8 : big ? 60 : grade === 'rare' ? 30 : 14, x, y);
    if (big && !this.calm) this.time.delayedCall(300, () => this.burst.setParticleTint(0xffffff).explode(30, x, y));
    this.revealed = [...(this.revealed ?? []), rays, halo, ring, it];
  }

  card(r, outs, grade) {
    const y0 = 760, names = this.brief.grades ?? {};
    const one = (o, x, wide) => {
      const g = o.grade ?? grade, css = GRADE_CSS[g];
      const tag = this.add.graphics().fillStyle(GRADE_COL[g], 1).fillRoundedRect(x - 70, y0 - 24, 140, 46, 23);
      const tagT = this.text(x, y0 - 2, names[g] ?? g, 28, { color: '#2a1406', stroke: '#ffffff' });
      const name = this.text(x, y0 + 52, `${o.name}${o.wealth ? ` ×${o.n}` : ''}`, wide ? 44 : 34, { color: css, wrap: wide ? W - 80 : 300 });
      const hint = o.hint ? this.text(x, y0 + 104, `「${o.hint}」`, 24, { color: '#e9d8b4', wrap: wide ? W - 100 : 300 }) : null;
      const fresh = r.first?.includes(o.id) ? this.text(x + 96, y0 - 40, this.w.fresh, 26, { color: '#ff6a3c' }).setAngle(12) : null;
      this.ui.add([tag, tagT, name, ...(hint ? [hint] : []), ...(fresh ? [fresh] : [])]);
    };
    if (outs.length === 1) one(outs[0], W / 2, true);
    else outs.forEach((o, k) => one(o, W / 2 + (k ? 170 : -170), false));
    // Under the cards, never under the shell's bubble at the top: her gag's whole line, a 方子 worked out.
    if (r.her) this.ui.add(this.text(W / 2, 920, r.say ?? '', 20, { color: '#f6e6c4', wrap: W - 80 }));
    if (r.discovered) this.ui.add(this.text(W / 2, 930, `${r.discovered.in}${r.discovered.lingshi ? ` + ${r.discovered.lingshi} ${this.w.stones}` : ''} → ${r.discovered.out}`, 26, { color: '#9fe39a' }));
    const btn = this.button(W / 2, BTN_Y, 300, 84, this.w.take, () => this.done(), { color: 0x3f9b4a, size: 44 });
    btn.setAlpha(0);
    this.tweens.add({ targets: btn, alpha: 1, duration: 300 });
    this.ui.add(btn);
  }

  say(k) {
    const q = this.brief.quips?.[k] ?? this.brief.quips?.junk ?? [];
    if (!q.length) return;
    const line = q[Math.floor(Math.random() * q.length)];
    this.cfg.shell?.say?.(this.lang === 'en' ? 'Yinyue' : '银月', line);
  }

  fact(t, o = {}) { this.cfg.onEvent?.({ t, ...o }); }

  done() {
    const r = this.result;
    if (this.phase !== 'reveal' || !r) return;
    this.phase = 'done';
    this.cfg.onEnd?.({ won: true, stars: Math.max(0, GRADES.indexOf(r.grade ?? 'junk')), grade: r.grade_name ?? r.grade, result: r });
  }
}
