// lanes.js — 守墙关's 药园 levels (2–5): what the lane engine holds, drawn — the talismans on their cells, the 灵气
// orbs, the bolts up the lanes, the cell marks while a seed is in hand — and the seed bar the player places from. The
// engine knows lanes and distance only; this lays the same field out two ways (option A, Hanli 10-20 「按A可以」):
// portrait, the seed bar under the top bar; landscape, the same portrait field centred with side panels — the seed bar
// and 灵气 on the left, 银月 and the cards held on the right. One art set.
//
// Frame cost: nothing here allocates per frame or draws a Graphics path per frame — panels are NineSlices over small
// canvas textures, the recharge shade is a scaled image, every sprite is made once per thing and pooled orbs reused.
import * as Phaser from 'phaser';
import { place, canPlace, collect, cellAt, cellY, laneX, unitStat, firstLane, W, H } from 'shouqiang-core';
import { FONT } from './fx.js';

export const SIDE = 250; // a side panel's width in landscape (board px)
const UNIT_H = { juling: 64, jian: 92, tu: 76, han: 92, lei: 84 };
const BOLT_TINT = { 'bolt-jian': 0x7fd0ff, 'bolt-han': 0xbff4ff };
const KEYS = ['1', '2', '3', '4', '5'];
const WORDS = {
  zh: { ling: '灵气', hint: '点一张符，再点畦里一格', huge: '一大波兽潮！', no: { ling: '灵气不够', recharge: '还没回好', taken: '这格有了' } },
  en: { ling: 'Qi', hint: 'Tap a talisman, then a bed cell', huge: 'A huge wave!', no: { ling: 'Not enough qi', recharge: 'Recharging', taken: 'Taken' } },
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

function laneTextures(scene) {
  canvasTex(scene, 'slot', 96, 96, (c, w, h) => {
    rounded(c, 3, 3, w - 6, h - 6, 22);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#5a3d22'); g.addColorStop(1, '#2c1a0c');
    c.fillStyle = g; c.fill();
    c.lineWidth = 5; c.strokeStyle = '#e7c06a'; c.stroke();
  });
  canvasTex(scene, 'slotSel', 96, 96, (c, w, h) => {
    rounded(c, 4, 4, w - 8, h - 8, 22);
    c.lineWidth = 8; c.strokeStyle = '#fff6b0'; c.shadowColor = '#ffd23f'; c.shadowBlur = 10; c.stroke();
  });
  canvasTex(scene, 'side', 96, 96, (c, w, h) => {
    rounded(c, 3, 3, w - 6, h - 6, 30);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(22,30,58,0.94)'); g.addColorStop(1, 'rgba(10,14,30,0.94)');
    c.fillStyle = g; c.fill();
    c.lineWidth = 5; c.strokeStyle = '#c9a75a'; c.stroke();
  });
  canvasTex(scene, 'cell', 108, 92, (c, w, h) => {
    rounded(c, 6, 6, w - 12, h - 12, 16);
    c.fillStyle = 'rgba(255,255,255,0.18)'; c.fill();
    c.lineWidth = 4; c.setLineDash([10, 7]); c.strokeStyle = 'rgba(255,248,200,0.95)'; c.stroke();
  });
  canvasTex(scene, 'px', 4, 4, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 4, 4); });
  // The first wave's one bed: a soft column of light, brightest up top where the beasts come in, and a chevron.
  canvasTex(scene, 'laneGlow', 64, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,226,140,1)'); g.addColorStop(0.5, 'rgba(255,226,140,0.55)'); g.addColorStop(1, 'rgba(255,226,140,0.12)');
    const x = c.createLinearGradient(0, 0, w, 0);
    x.addColorStop(0, 'rgba(0,0,0,1)'); x.addColorStop(0.5, 'rgba(0,0,0,0)'); x.addColorStop(1, 'rgba(0,0,0,1)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'destination-out'; c.fillStyle = x; c.fillRect(0, 0, w, h);
  });
  canvasTex(scene, 'chevron', 64, 40, (c, w, h) => {
    c.lineWidth = 9; c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = '#fff1b0'; c.shadowColor = '#ffb627'; c.shadowBlur = 8;
    c.beginPath(); c.moveTo(10, 8); c.lineTo(w / 2, h - 8); c.lineTo(w - 10, 8); c.stroke();
  });
}

export class LaneView {
  constructor(scene, depth) {
    this.s = scene;
    this.g = scene.g;
    this.D = depth;
    this.lang = scene.lang;
    this.w = WORDS[this.lang];
    this.units = new Map();
    this.orbs = new Map();
    this.orbPool = [];
    this.sel = null;
    this.landscape = false;
    laneTextures(scene);
    this.guide();
    this.cells();
    this.seedBar();
    this.sidePanels();
    this.keys();
  }

  static preload(scene, level, art) {
    const img = (k) => scene.load.image(k, `${art}${k}.webp`);
    for (const k of [level.art?.bg, level.art?.wall, 'orb'].filter(Boolean)) img(k);
    for (const u of level.units) for (const k of [`unit-${u}`, `unit-${u}-2`, `seed-${u}`]) img(k);
  }

  tex(k, fb) { return this.s.tex(k, fb); }

  // ---- the first wave's one bed (Hanli 10-20: 「守药园, 所有开场野猪都走中路呢?」 — option A: keep the one lane, say so) --
  // Shown from the lead-in until the first beast is down; the level's `moments.lane` line names it.

  guide() {
    const col = firstLane(this.g.level);
    if (col == null) return;
    const s = this.s, x = laneX(this.g, col), top = this.g.level.spawnY ?? 80, bottom = this.g.grid.bottom;
    const glow = s.add.image(x, top, 'laneGlow').setOrigin(0.5, 0).setDisplaySize(this.g.grid.cw * 0.95, bottom - top)
      .setDepth(this.D.decal).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.8);
    // The chevrons point down the bed from its head, under the seed bar (portrait) and the range line.
    const head = this.g.grid.top;
    const arrows = [0, 1].map((i) => s.add.image(x, head + 4 + i * 30, 'chevron').setDepth(this.D.decal + 1).setScale(0.9).setAlpha(1 - i * 0.35));
    if (!s.calm) {
      s.tweens.add({ targets: glow, alpha: 0.5, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      s.tweens.add({ targets: arrows, y: '+=14', duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }
    this.guideParts = [glow, ...arrows];
    s.time.delayedCall(300, () => this.guideSay());
  }

  guideSay() {
    if (this.guideParts && !this.s.held) return void this.s.moment('lane');
    if (this.guideParts) this.s.time.delayedCall(300, () => this.guideSay()); // behind the shell's lead card: wait for it
  }

  guideOff() {
    if (!this.guideParts) return;
    const parts = this.guideParts;
    this.guideParts = null;
    this.s.tweens.killTweensOf(parts);
    this.s.tweens.add({ targets: parts, alpha: 0, duration: 500, onComplete: () => parts.forEach((p) => p.destroy()) });
  }

  // ---- the grid marks: one image a cell, made once, shown while a seed is in hand -----------------------------------

  cells() {
    const { grid } = this.g;
    this.marks = [];
    for (let c = 0; c < grid.cols; c += 1) {
      for (let r = 0; r < grid.rows; r += 1) {
        const m = this.s.add.image(laneX(this.g, c), cellY(this.g, r), 'cell').setDisplaySize(grid.cw - 4, grid.ch - 4)
          .setDepth(this.D.decal + 1).setVisible(false);
        m.col = c; m.row = r;
        this.marks.push(m);
      }
    }
  }

  showMarks() {
    for (const m of this.marks) m.setVisible(Boolean(this.sel) && !canPlace(this.g, this.sel, m.col, m.row));
  }

  // ---- the seed bar --------------------------------------------------------------------------------------------------

  seedBar() {
    const s = this.s, d = this.D.hud;
    this.lingBox = s.add.container(0, 0).setDepth(d + 1);
    const back = s.add.nineslice(0, 0, 'slot', undefined, 200, 176, 40, 40, 40, 40).setScale(0.5);
    const orb = s.add.image(0, -12, this.tex('orb', 'glow')).setDisplaySize(46, 46);
    this.lingText = s.add.text(0, 26, '', { fontFamily: FONT, fontSize: '24px', color: '#eafcff', stroke: '#0b2238', strokeThickness: 5 })
      .setOrigin(0.5).setResolution(s.cfg.zoom ?? 1);
    this.lingBox.add([back, orb, this.lingText]);
    this.lingOrb = orb;
    this.slots = this.g.level.units.map((kind, i) => {
      const c = s.add.container(0, 0).setDepth(d + 1);
      const bg = s.add.nineslice(0, 0, 'slot', undefined, 152, 176, 40, 40, 40, 40).setScale(0.5);
      const icon = s.add.image(0, -12, this.tex(`seed-${kind}`, `icon-jian-more`)).setDisplaySize(58, 58);
      const cost = s.add.text(0, 28, String(unitStat(this.g, kind, 'cost')), { fontFamily: FONT, fontSize: '20px', color: '#fff3c4', stroke: '#2a1206', strokeThickness: 4 })
        .setOrigin(0.5).setResolution(s.cfg.zoom ?? 1);
      const shade = s.add.image(0, 44, 'px').setOrigin(0.5, 1).setTint(0x000000).setAlpha(0.55).setDisplaySize(72, 0);
      const ring = s.add.nineslice(0, 0, 'slotSel', undefined, 160, 184, 40, 40, 40, 40).setScale(0.5).setVisible(false);
      const key = s.add.text(-28, -36, KEYS[i], { fontFamily: FONT, fontSize: '14px', color: '#ffe9a8', stroke: '#2a1206', strokeThickness: 3 })
        .setOrigin(0.5).setResolution(s.cfg.zoom ?? 1).setVisible(!s.sys.game.device.input.touch);
      c.add([bg, icon, cost, shade, ring, key]);
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', (p, x, y, ev) => { ev?.stopPropagation?.(); this.choose(kind, p); });
      const slot = { kind, c, icon, cost, shade, ring, state: '' };
      // The level's new talisman wears a 新 tag (the seed the lead-in and 银月 talk about).
      if (this.g.level.fresh === kind) {
        c.add(s.add.image(26, -38, 'badge').setScale(0.7));
        c.add(s.add.text(26, -39, this.lang === 'en' ? 'NEW' : '新', { fontFamily: FONT, fontSize: this.lang === 'en' ? '10px' : '15px', color: '#ffffff' })
          .setOrigin(0.5).setResolution(s.cfg.zoom ?? 1));
      }
      return slot;
    });
  }

  sidePanels() {
    const s = this.s;
    this.sideL = s.add.nineslice(-SIDE / 2, H / 2, 'side', undefined, (SIDE - 20) * 2, (H - 40) * 2, 40, 40, 40, 40).setScale(0.5).setDepth(this.D.hud - 2);
    this.sideR = s.add.nineslice(W + SIDE / 2, H / 2, 'side', undefined, (SIDE - 20) * 2, (H - 40) * 2, 40, 40, 40, 40).setScale(0.5).setDepth(this.D.hud - 2);
    const yy = s.textures.get('yy-sheet').has('idle-1');
    this.portrait = yy ? s.add.image(W + SIDE / 2, 330, 'yy-sheet', 'idle-1').setScale(1.25).setDepth(this.D.hud - 1) : null;
    this.title = s.add.text(-SIDE / 2, 70, this.g.level.title?.[this.lang] ?? '', { fontFamily: FONT, fontSize: '22px', color: '#fff6d8', stroke: '#2a1206',
      strokeThickness: 4, align: 'center', wordWrap: { width: SIDE - 50, useAdvancedWrap: true } }).setOrigin(0.5).setDepth(this.D.hud).setResolution(s.cfg.zoom ?? 1);
    this.layout(false);
  }

  /** Lay the bar out: portrait, a row under the top bar; landscape, a column in the left panel. */
  layout(landscape) {
    this.landscape = landscape;
    for (const o of [this.sideL, this.sideR, this.portrait, this.title]) o?.setVisible(landscape);
    if (landscape) {
      this.lingBox.setPosition(-SIDE / 2, 160).setScale(1.15);
      this.slots.forEach((sl, i) => sl.c.setPosition(-SIDE / 2 + (i % 2 ? 50 : -50), 300 + Math.floor(i / 2) * 110).setScale(1.12));
    } else {
      const n = this.slots.length, gap = 8, sw = 76, lw = 100;
      const x0 = W / 2 - (lw + n * (sw + gap)) / 2 + lw / 2;
      this.lingBox.setPosition(x0, 118).setScale(1);
      this.slots.forEach((sl, i) => sl.c.setPosition(x0 + lw / 2 + gap + sw / 2 + i * (sw + gap), 118).setScale(1));
    }
  }

  /** Where the 灵气 counter is (orbs fly there). */
  lingAt() { return { x: this.lingBox.x, y: this.lingBox.y - 12 * this.lingBox.scaleX }; }

  /** Where 银月's bubbles go in landscape (her portrait); null in portrait. */
  yyAt() { return this.landscape && this.portrait ? { x: this.portrait.x, y: this.portrait.y - 150 } : null; }

  keys() {
    const kb = this.s.input.keyboard;
    if (!kb) return;
    kb.on('keydown', (e) => {
      const i = KEYS.indexOf(e.key);
      if (i >= 0 && this.slots[i]) this.choose(this.slots[i].kind);
      if (e.key === 'Escape') this.choose(null);
    });
  }

  choose(kind, p) {
    if (this.s.hud.modalOpen || this.s.paused) return;
    const why = !kind ? '' : this.g.seedCool[kind] > 0 ? 'recharge' : this.g.ling < unitStat(this.g, kind, 'cost') ? 'ling' : '';
    if (why) { this.nope(this.slots.find((s) => s.kind === kind), why); kind = null; }
    this.sel = this.sel === kind ? null : kind;
    this.dragFrom = this.sel && p ? { x: p.x, y: p.y } : null;
    for (const sl of this.slots) sl.ring.setVisible(sl.kind === this.sel);
    this.showMarks();
  }

  nope(slot, why) {
    if (!slot) return;
    this.s.tweens.add({ targets: slot.c, x: slot.c.x + 6, duration: 50, yoyo: true, repeat: 2 });
    const at = slot.c;
    this.s.hud.floatText(at.x, at.y - 56, this.w.no[why] ?? '', '#ffd0c0');
  }

  // ---- input: an orb first, then a cell for the seed in hand -----------------------------------------------------

  /** A tap at board point `wp`: true when the lanes took it. */
  tap(wp) {
    for (const [id, o] of this.orbs) {
      if (Math.hypot(o.img.x - wp.x, o.img.y - wp.y) < 46) { collect(this.g, id); return true; }
    }
    if (!this.sel) return false;
    const cell = cellAt(this.g, wp.x, wp.y);
    if (!cell) { this.choose(null); return true; }
    const why = canPlace(this.g, this.sel, cell.col, cell.row);
    if (why) { this.s.hud.floatText(wp.x, wp.y - 30, this.w.no[why] ?? '', '#ffd0c0'); return true; }
    place(this.g, this.sel, cell.col, cell.row);
    this.choose(null);
    return true;
  }

  /** A drag from a seed let go over the field: place there. */
  release(p) {
    if (!this.sel || !this.dragFrom || Math.hypot(p.x - this.dragFrom.x, p.y - this.dragFrom.y) < 24) return;
    const wp = this.s.cameras.main.getWorldPoint(p.x, p.y);
    this.tap(wp);
  }

  // ---- the frame -------------------------------------------------------------------------------------------------

  update(dt) {
    this.slotStates();
    if (this.shownLing !== this.g.ling) { this.shownLing = this.g.ling; this.lingText.setText(String(this.g.ling)); }
    for (const u of this.g.units) {
      const v = this.units.get(u.id);
      if (!v) continue;
      if (v.actT > 0 && (v.actT -= dt) <= 0) v.img.setTexture(v.idle);
      if (u.kind === 'tu' && !v.battered && u.hp < u.max * 0.5) { v.battered = true; v.idle = v.act; v.img.setTexture(v.act); }
      if (v.shakeT > 0) { v.shakeT -= dt; v.img.x = u.x + Math.sin(v.shakeT * 70) * 2.5; } else v.img.x = u.x;
    }
    for (const [id, o] of this.orbs) {
      o.t += dt;
      const lo = this.g.orbs.find((x) => x.id === id);
      if (!lo) continue;
      const fall = Math.min(1, o.t / o.fall);
      o.img.y = o.y0 + (o.y - o.y0) * (1 - (1 - fall) ** 2) + Math.sin(o.t * 3) * 3;
      o.glow.setPosition(o.img.x, o.img.y).setAlpha(0.45 + Math.sin(o.t * 5) * 0.15);
    }
    if (this.sel && this.marksAt !== this.g.units.length + this.g.phase) { this.marksAt = this.g.units.length + this.g.phase; this.showMarks(); }
  }

  slotStates() {
    for (const sl of this.slots) {
      const cool = this.g.seedCool[sl.kind], max = unitStat(this.g, sl.kind, 'recharge') || 1;
      const cost = unitStat(this.g, sl.kind, 'cost');
      const state = `${this.g.ling >= cost ? 1 : 0}${Math.ceil((cool / max) * 40)}`;
      if (state === sl.state) continue;
      sl.state = state;
      const ok = this.g.ling >= cost && cool <= 0;
      sl.icon.setAlpha(ok ? 1 : 0.5);
      sl.cost.setColor(this.g.ling >= cost ? '#fff3c4' : '#ff8f7a');
      sl.shade.setDisplaySize(72, 84 * Math.min(1, cool / max));
      if (!ok && this.sel === sl.kind) this.choose(null);
    }
  }

  // ---- events --------------------------------------------------------------------------------------------------

  on(e) { this.ON[e.t]?.call(this, e); }

  ON = {
    kill() { this.guideOff(); },
    place(e) {
      const s = this.s;
      const idle = this.tex(`unit-${e.kind}`, 'fu-huo'), act = this.tex(`unit-${e.kind}-2`, idle);
      const img = s.add.image(e.x, e.y + 34, idle).setOrigin(0.5, 1).setDepth(this.D.beast + e.y / 1000 - 0.0005);
      const h = UNIT_H[e.kind] ?? 80;
      img.setScale(h / img.height);
      const sc = img.scaleX;
      const shadow = s.add.image(e.x, e.y + 30, 'shadow').setDepth(this.D.shadow).setScale(1.3, 0.9);
      img.setScale(sc * 0.3);
      s.tweens.add({ targets: img, scaleX: sc, scaleY: sc, duration: 260, ease: 'Back.out' });
      s.em.burst('dust', 6, e.x, e.y + 28);
      s.em.burst('spark', 8, e.x, e.y);
      if (e.kind === 'lei') s.tweens.add({ targets: img, alpha: 0.6, duration: 90, yoyo: true, repeat: -1 });
      this.units.set(e.id, { img, shadow, idle, act, sc, actT: 0, shakeT: 0, kind: e.kind });
    },
    shot(e) {
      const v = this.units.get(e.id);
      if (!v) return;
      v.img.setTexture(v.act);
      v.actT = 0.14;
      this.s.tweens.add({ targets: v.img, scaleY: v.sc * 0.92, duration: 60, yoyo: true });
    },
    chew(e) {
      const v = this.units.get(e.unit);
      if (!v) return;
      v.shakeT = 0.25;
      this.s.em.burst(v.kind === 'tu' ? 'debris' : 'dust', 2, e.x, e.y - 10);
    },
    unitDie(e) {
      const v = this.units.get(e.id);
      if (!v) return;
      this.units.delete(e.id);
      v.shadow.destroy();
      this.s.tweens.killTweensOf(v.img);
      if (e.spent) return void v.img.destroy();
      this.s.em.burst('poof', 8, e.x, e.y);
      this.s.em.burst('debris', 6, e.x, e.y);
      this.s.tweens.add({ targets: v.img, alpha: 0, scaleY: 0.1, duration: 220, onComplete: () => v.img.destroy() });
    },
    bomb(e) {
      const s = this.s, v = this.units.get(e.id);
      v?.img.setTexture(v.act);
      const w = (2 * e.cols + 1) * this.g.grid.cw, h = 2 * e.rows * this.g.grid.ch;
      s.flare(e.x, e.y, Math.max(w, h) * 1.1, 0xe8d0ff);
      s.ring(e.x, e.y, w * 0.6, 0xd7a8ff, 420);
      s.em.burst('bolt', 40, e.x, e.y);
      s.em.burst('debris', 16, e.x, e.y);
      s.cameras.main.flash(120, 220, 200, 255);
      s.shake(260, 0.012);
      s.hitStop = 0.06;
    },
    orb(e) {
      const s = this.s;
      const o = this.orbPool.pop() ?? { img: s.add.image(0, 0, this.tex('orb', 'glow')).setDepth(this.D.num - 4),
        glow: s.add.image(0, 0, 'glow').setDepth(this.D.num - 5).setBlendMode(Phaser.BlendModes.ADD).setTint(0x9fe8ff) };
      const sky = e.from === 'sky';
      o.t = 0; o.y = e.y; o.y0 = sky ? e.y - 160 : e.y + 10; o.fall = sky ? 1.6 : 0.35;
      o.img.setTexture(this.tex('orb', 'glow')).setPosition(e.x, o.y0).setDisplaySize(40, 40).setVisible(true).setAlpha(1);
      o.glow.setPosition(e.x, o.y0).setDisplaySize(80, 80).setVisible(true);
      this.orbs.set(e.id, o);
      if (!sky) { const v = this.units.get(e.from); if (v) { v.img.setTexture(v.act); v.actT = 0.5; } }
    },
    collect(e) {
      const o = this.orbs.get(e.id);
      if (!o) return;
      this.orbs.delete(e.id);
      const to = this.lingAt();
      o.glow.setVisible(false);
      this.s.em.burst('spark', 5, o.img.x, o.img.y);
      this.s.tweens.add({ targets: o.img, x: to.x, y: to.y, scaleX: o.img.scaleX * 0.5, scaleY: o.img.scaleY * 0.5, duration: 420, ease: 'Cubic.in',
        onComplete: () => {
          o.img.setVisible(false);
          this.orbPool.push(o);
          this.s.tweens.add({ targets: this.lingOrb, scaleX: this.lingOrb.scaleX * 1.25, scaleY: this.lingOrb.scaleY * 1.25, duration: 90, yoyo: true });
        } });
    },
    leap(e) {
      this.s.em.burst('dust', 8, e.x, e.y);
    },
    crack(e) {
      this.s.em.burst('debris', 12, e.x, e.y - 30);
      this.s.ring(e.x, e.y - 30, 70, 0xd8c8a0, 300);
    },
    boltHit(e) {
      this.s.em.burst(e.kind === 'bolt-han' ? 'frost' : 'hitStreak', 3, e.x, e.y);
    },
    huge() {
      this.s.hud.banner(this.w.huge, { size: 58, color: '#ffd0d0', y: 300, hold: 1300 });
      this.s.shake(400, 0.006);
    },
  };

  /** A bolt's look (the play's shot sprites call this for `bolt-*`). */
  boltParts(sh) {
    const s = this.s;
    const glow = s.add.image(sh.x, sh.y, 'glow').setTint(BOLT_TINT[sh.kind] ?? 0xffffff).setBlendMode(Phaser.BlendModes.ADD).setScale(0.6).setDepth(this.D.shot - 1);
    const body = sh.kind === 'bolt-han'
      ? s.add.image(sh.x, sh.y, 'shard').setTint(0xcff6ff).setScale(1.1).setDepth(this.D.shot)
      : s.add.image(sh.x, sh.y, 'sword').setDisplaySize(40, 40).setRotation(-Math.PI / 4).setDepth(this.D.shot);
    return [glow, body];
  }
}
