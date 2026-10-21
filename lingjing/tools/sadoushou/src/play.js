// play.js — 守山门's scene: draws what the engine (scripts/games/sadoushou/core.js) holds and turns its events into
// juice. One input: move left/right (the mouse's x, a drag on touch, A/D · ←/→) to pick a column; the squad fires on
// its own (Hanli 10-21: 「一共3列, 要么打野猪, 要么打两边的+攻击的卡」).
//
// The road is pseudo-3D (view.js): painted ONCE into one ground texture at create (the camera never moves), the ink
// mountains above its horizon, the three columns marked on it. The units are pooled images (豆兵: 撒豆成兵's atlas;
// beasts: 守墙关's frames), laid out every frame by the engine's numbers and scaled by depth — no physics, no tween per
// unit, no per-frame depth changes (layers keep a fixed order; a wave's beasts are handed out far to near).
import * as Phaser from 'phaser';
import { newGame, step, aim, waveLeft, waveCount, perRank, hordeAll, tierOf, colMid, COLS, TOP } from 'sadoushou-core';
import { W, H, CX, Y0, HY, HALF, sOf, yOf, xOf, zOfY, uOfX } from './view.js';
import { makeTextures, makeNumberFont, makeEmitters, rng, canvasTex, rounded } from './fx.js';
import { Hud, WORDS, text } from './hud.js';
import { Sfx } from './sfx.js';

const MAXQ = 160;                 // the squad's sprites at the wall at most (the blue number tells the rest)
const MAXS = 60;                  // 豆兵 in flight drawn at most
const MAXB = 380;                 // beast sprites at most (the red number tells the rest)
const SOLDIER_H = 40;             // a 豆兵's height at the wall (px); smaller up the road
const GOLD = Math.PI * (3 - Math.sqrt(5));
const SLOTS = Array.from({ length: MAXQ }, (_, i) => { const r = 5.6 * Math.sqrt(i + 0.5), a = i * GOLD; return [r * Math.cos(a) * 1.3, r * Math.sin(a) * 0.4]; });
const D = { ground: 0, beast: 20, boss: 25, belt: 27, shot: 30, squad: 32, rush: 35, wall: 40, man: 41, fx: 3000, num: 3100, hud: 4000 };
const TIER_TINT = [0xffffff, 0xfff0c8, 0xe0a060];
const backOut = (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
const quadOut = (t) => t * (2 - t);
const hash = (j, k = 1) => (((j * 2654435761 + k * 40503) >>> 0) % 10007) / 10007; // a stable 0…1 per beast

export class PlayScene extends Phaser.Scene {
  constructor() { super('play'); }

  init(cfg) {
    this.cfg = cfg;
    this.lang = cfg.lang === 'en' ? 'en' : 'zh';
    this.w = WORDS[this.lang];
  }

  preload() {
    const b = this.cfg.base, sd = `${b}../sadou/art/`, sq = `${b}../shouqiang/art/`, sl = `${b}../shoulu/art/`;
    this.missing = new Set();
    this.load.on('loaderror', (f) => this.missing.add(f.key));
    this.load.atlas('units', `${sd}units.webp`, `${sd}units.json`);
    for (const k of ['tex-road', 'tex-side']) this.load.image(k, `${sd}${k}.webp`);
    this.load.image('wall', `${sq}wall.webp`);
    this.load.image('xiaoman', `${sq}xiaoman-cast.webp`);
    this.load.image('sky', `${b}../../../worlds/jiuding/art/backdrop/${this.cfg.level.sky ?? 'cloudy-day'}.webp`);
    for (const [id, k] of Object.entries(this.cfg.kit.beasts)) {
      if (id.startsWith('_')) continue;
      for (const f of [...k.frames, k.hit]) this.load.image(`${id}-${f}`, `${k.art === 'sadou' ? sd : sq}${id}-${f}.webp`);
    }
    this.load.image('yy', `${sl}yinyue.webp`);
    this.load.json('yy-meta', `${sl}yinyue.json`);
    const bar = this.add.graphics();
    this.load.on('progress', (p) => bar.clear().fillStyle(0x000000, 0.4).fillRoundedRect(120, 470, 300, 20, 10).fillStyle(0xffd34d, 1).fillRoundedRect(122, 472, 296 * p, 16, 8));
    this.load.on('complete', () => bar.destroy());
  }

  create() {
    const { kit, level, seed, reducedMotion } = this.cfg;
    this.calm = Boolean(reducedMotion);
    this.cameras.main.setZoom(this.cfg.zoom ?? 1).centerOn(W / 2, H / 2);
    this.g = newGame(kit, level, { seed });
    this.rand = rng(seed);
    makeTextures(this);
    this.cardTextures();
    this.standIns();
    this.yinyueFrame();
    makeNumberFont(this, 'numBig', { fill: ['#fffbe0', '#ffd23f', '#ff8a00'], stroke: '#4a1500', size: 64, line: 13 });
    makeNumberFont(this, 'numGood', { fill: ['#ffffff', '#d6f6ff', '#7fd8ff'], stroke: '#0b2556', size: 60, line: 12 });
    makeNumberFont(this, 'numGold', { fill: ['#fffde8', '#ffe36b', '#ffb000'], stroke: '#5a2a00', size: 60, line: 12 });
    makeNumberFont(this, 'numBad', { fill: ['#ffffff', '#ffd0c8', '#ff6a5a'], stroke: '#4a0610', size: 60, line: 12 });
    makeNumberFont(this, 'numSmall', { fill: ['#ffffff', '#ffffff'], stroke: '#1b0d05', size: 36, line: 8 });
    this.em = makeEmitters(this, D.fx, this.calm ? 0.45 : 1);
    this.sfx = new Sfx();
    this.ground();
    this.hud = new Hud(this, { depth: D.hud });
    this.hud.setTier(tierOf(this.g).name[this.lang]);
    this.makePools();
    this.makeWall();
    this.makeBoss();
    this.cards = new Map();       // belt item id → what draws it
    this.running = false;
    this.ended = false;
    this.saidAt = -99;
    this.said = new Set();
    this.aimX = 0;
    this.input.on('pointerdown', (p) => { this.sfx.wake(); this.aimX = uOfX(p.worldX); });
    // a mouse aims as it moves; a finger as it drags
    this.input.on('pointermove', (p) => { if (p.isDown || !p.wasTouch) this.aimX = uOfX(p.worldX); });
    this.keys = this.input.keyboard?.addKeys('A,D,LEFT,RIGHT');
    this.input.keyboard?.on('keydown', () => this.sfx.wake());
    this.events.once('shutdown', () => { this.sfx.close(); this.offShell?.(); this.offShell = null; });
    if (this.cfg.shell) {
      this.offShell = this.cfg.shell.onPause?.((on) => this.setPaused(on));
      if (this.cfg.shell.paused?.()) this.events.once('create', () => this.setPaused(Boolean(this.cfg.shell.paused?.())));
    }
    this.held = Boolean(this.cfg.hold?.on);
    if (!this.held) this.leadIn();
    this.fact({ t: 'start', level: level.id });
  }

  leadIn() {
    const { level } = this.cfg;
    this.hud.lead(level.lead, level.leadSec ?? 4.5, level.countdown ?? 3, {
      onBig: () => { this.em.burst('beans', 30, this.man.x, this.man.y - 80); this.sfx.pop(); },
      onTick: () => this.sfx.tick(),
      go: () => this.go(),
    });
  }

  release() {
    if (!this.held) return;
    this.held = false;
    this.leadIn();
  }

  go() {
    this.running = true;
    this.sfx.go();
    this.hud.hint();
    this.say('start');
    this.fact({ t: 'go' });
  }

  setPaused(on) {
    if (!this.sys.isActive() && !this.sys.isPaused()) return;
    if (on && !this.sys.isPaused()) this.scene.pause();
    else if (!on && this.sys.isPaused()) this.scene.resume();
  }

  // ---------------------------------------------------------------- textures

  /** The cards and the stone wall, drawn once: a framed card with a glowing face; a grey block with rubble. */
  cardTextures() {
    const card = (key, glass, rim) => canvasTex(this, key, 160, 120, (c, w, h) => {
      rounded(c, 4, 8, w - 8, h - 12, 16); c.fillStyle = 'rgba(0,0,0,0.3)'; c.fill();
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, glass[0]); g.addColorStop(1, glass[1]);
      rounded(c, 4, 4, w - 8, h - 12, 16); c.fillStyle = g; c.fill();
      c.lineWidth = 6; c.strokeStyle = rim; c.stroke();
      rounded(c, 14, 10, w - 28, 14, 7); c.fillStyle = 'rgba(255,255,255,0.4)'; c.fill();
    });
    card('card-blue', ['rgba(120,214,255,0.92)', 'rgba(36,110,230,0.85)'], '#0b2556');
    card('card-gold', ['rgba(255,240,140,0.95)', 'rgba(255,160,10,0.9)'], '#5a2a00');
    card('card-red', ['rgba(255,120,110,0.92)', 'rgba(170,16,34,0.88)'], '#4a0610');
    canvasTex(this, 'block', 180, 130, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#b9b4a8'); g.addColorStop(1, '#6f6a60');
      c.fillStyle = g; c.strokeStyle = '#2e2a24'; c.lineWidth = 5;
      rounded(c, 18, 6, w - 36, h - 30, 8); c.fill(); c.stroke();
      c.lineWidth = 3; c.strokeStyle = 'rgba(40,36,30,0.7)';
      for (const [x0, y0, x1, y1] of [[40, 40, 80, 60], [80, 60, 70, 90], [110, 30, 130, 70], [130, 70, 118, 96]]) { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); }
      c.fillStyle = '#8a8478';
      for (const [x, y, r] of [[10, h - 18, 10], [26, h - 10, 8], [w - 14, h - 16, 11], [w - 32, h - 8, 7], [w / 2, h - 8, 6]]) { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); c.stroke(); }
    });
  }

  standIns() {
    const fill = (key, w, h, col) => {
      if (this.textures.exists(key) && !this.missing.has(key)) return;
      if (this.textures.exists(key)) this.textures.remove(key);
      canvasTex(this, key, w, h, (c) => { c.fillStyle = col; c.beginPath(); c.ellipse(w / 2, h / 2, w / 2 - 3, h / 2 - 3, 0, 0, 7); c.fill(); });
    };
    for (const [id, k] of Object.entries(this.cfg.kit.beasts)) if (!id.startsWith('_')) for (const f of [...k.frames, k.hit]) fill(`${id}-${f}`, 120, 120, '#7a4a2a');
    for (const [k, col] of [['tex-road', '#9c8a70'], ['tex-side', '#5d7a4c'], ['sky', '#c9cdbf'], ['wall', '#8a8478'], ['xiaoman', '#eeeeee']]) fill(k, 64, 64, col);
    if (this.missing.has('units') || !this.textures.exists('units')) {
      if (this.textures.exists('units')) this.textures.remove('units');
      const t = this.textures.createCanvas('units', 192, 90), c = t.getContext();
      ['#ffd23f', '#ffc12f', '#ffe066'].forEach((col, i) => { c.fillStyle = col; c.beginPath(); c.arc(i * 64 + 32, 45, 26, 0, 7); c.fill(); });
      ['soldier-1', 'soldier-2', 'bean'].forEach((n, i) => t.add(n, 0, i * 64, 0, 64, 90));
      t.refresh();
    }
  }

  yinyueFrame() {
    const meta = this.cache.json.get('yy-meta');
    if (meta && this.textures.exists('yy') && !this.missing.has('yy')) {
      const [cw, ch] = meta.cell, [x, y] = meta.sheets.yinyue['idle-1'];
      this.textures.get('yy').add('idle-1', 0, x, y, cw, ch);
    }
  }

  // ---------------------------------------------------------------- the world, painted once

  /** The ink mountains over the horizon, the road and its banks in perspective and its three columns, into ONE texture. */
  ground() {
    const can = this.textures.createCanvas('ground', W, H), c = can.getContext();
    const sky = this.textures.get('sky').getSourceImage();
    const sh = sky.height * (W / sky.width);
    c.drawImage(sky, 0, 0, sky.width, sky.height, 0, HY + 150 - sh * 0.82, W, sh);
    const road = this.textures.get('tex-road').getSourceImage(), side = this.textures.get('tex-side').getSourceImage();
    const top = Math.ceil(yOf(TOP + 30));
    for (let y = top; y < H; y += 1) {
      const z = zOfY(y + 0.5), s = sOf(z);
      const sv = Math.floor(((z * 6) % side.height + side.height) % side.height);
      c.drawImage(side, 0, sv, side.width, 1, CX - W * 1.6 * s - 200, y, W * 3.2 * s + 400, 1);
      c.fillStyle = 'rgba(222,216,192,0.5)'; c.fillRect(0, y, W, 1); // the banks washed toward the paper, so the road leads
      const rv = Math.floor(((z * 9) % road.height + road.height) % road.height);
      const half = HALF * s * 1.06;
      c.drawImage(road, 0, rv, road.width, 1, CX - half, y, half * 2, 1);
    }
    // the three columns: the side ones a shade cooler (the cards' belts), the middle warmer (the tide's), split by ink
    const band = (a, b, col) => {
      c.fillStyle = col; c.beginPath();
      c.moveTo(xOf(a, -6), yOf(-6)); c.lineTo(xOf(b, -6), yOf(-6)); c.lineTo(xOf(b, TOP + 30), yOf(TOP + 30)); c.lineTo(xOf(a, TOP + 30), yOf(TOP + 30));
      c.closePath(); c.fill();
    };
    band(...COLS.L, 'rgba(70,130,200,0.13)'); band(...COLS.R, 'rgba(70,130,200,0.13)'); band(...COLS.M, 'rgba(160,60,30,0.08)');
    c.strokeStyle = 'rgba(40,28,14,0.55)'; c.lineWidth = 3;
    for (const u of [-1.06, 1.06]) { c.beginPath(); c.moveTo(xOf(u, -6), yOf(-6)); c.lineTo(xOf(u, TOP + 30), yOf(TOP + 30)); c.stroke(); }
    c.setLineDash([14, 10]); c.strokeStyle = 'rgba(40,28,14,0.35)'; c.lineWidth = 2;
    for (const u of [COLS.M[0], COLS.M[1]]) { c.beginPath(); c.moveTo(xOf(u, -6), yOf(-6)); c.lineTo(xOf(u, TOP + 30), yOf(TOP + 30)); c.stroke(); }
    c.setLineDash([]);
    const mist = c.createLinearGradient(0, top - 40, 0, yOf(TOP - 20));
    mist.addColorStop(0, 'rgba(214,218,206,0.95)'); mist.addColorStop(1, 'rgba(214,218,206,0)');
    c.fillStyle = mist; c.fillRect(0, top - 40, W, yOf(TOP - 20) - top + 40);
    c.fillStyle = 'rgba(232,226,208,0.16)'; c.fillRect(0, 0, W, H);
    can.refresh();
    this.add.image(0, 0, 'ground').setOrigin(0, 0).setDepth(D.ground);
    const tone = this.cfg.level.tone;
    if (tone) this.add.rectangle(W / 2, H / 2, W, H, Phaser.Display.Color.HexStringToColor(tone.color).color, tone.alpha).setDepth(D.fx - 10);
    this.add.image(W / 2, H / 2, 'vignette').setDisplaySize(W, H).setDepth(D.fx - 9);
  }

  makeWall() {
    const wall = this.add.image(CX, Y0 + 10, 'wall').setOrigin(0.5, 0).setDepth(D.wall);
    wall.setScale((W + 60) / wall.width);
    this.wall = wall;
    this.man = this.add.image(CX, Y0 + 92, 'xiaoman').setOrigin(0.5, 0.9).setDepth(D.man);
    this.man.setScale(104 / this.man.height);
    this.manBase = this.man.scaleX;
  }

  // ---------------------------------------------------------------- the belt: cards and walls coming down the sides

  cardOf(it) {
    let v = this.cards.get(it.id);
    if (v) return v;
    // the belt keeps its order as it rides, so a card's depth is set once: the nearer over the farther
    const d = D.belt + (1000 - it.z) / 2000;
    const img = this.add.image(0, 0, it.kind === 'block' ? 'block' : 'card-blue').setOrigin(0.5, 1).setDepth(d);
    const label = this.add.bitmapText(0, 0, 'numGood', '', 60).setOrigin(0.5).setDepth(d + 0.0001);
    v = { img, label, punch: 0, face: null };
    this.cards.set(it.id, v);
    return v;
  }

  dropCard(id) {
    const v = this.cards.get(id);
    if (!v) return;
    v.img.destroy(); v.label.destroy();
    this.cards.delete(id);
  }

  drawBelt(dt) {
    for (const it of this.g.belt) {
      const on = !it.gone && it.z < TOP + 12;
      if (!on) { if (this.cards.has(it.id)) this.dropCard(it.id); continue; }
      const v = this.cardOf(it), s = sOf(it.z), [a, b] = COLS[it.col];
      const x = xOf((a + b) / 2, it.z), y = yOf(it.z), wpx = (b - a) * HALF * s * 0.86;
      v.punch = Math.max(0, v.punch - dt * 6);
      const k = 1 + v.punch * 0.18;
      if (it.kind === 'block') {
        v.img.setPosition(x, y + 6 * s).setDisplaySize(wpx * 1.05 * k, wpx * 0.76 * k);
        v.label.setFont('numSmall').setText(String(Math.ceil(it.hp))).setPosition(x, y - wpx * 0.36).setFontSize(Math.round(18 + 30 * s)).setScale(k);
        continue;
      }
      const n = Math.floor(it.n), face = it.gold ? 'card-gold' : n < 0 ? 'card-red' : 'card-blue';
      if (v.face !== face) { v.face = face; v.img.setTexture(face); v.label.setFont(it.gold ? 'numGold' : n < 0 ? 'numBad' : 'numGood'); }
      v.img.setPosition(x, y + 4 * s).setDisplaySize(wpx * k, wpx * 0.72 * k);
      v.label.setText(n < 0 ? `-${-n}` : `+${n}`).setPosition(x, y - wpx * 0.36).setFontSize(Math.round(20 + 36 * s)).setScale(k);
    }
  }

  // ---------------------------------------------------------------- pools: the squad, the stream, beasts, ghosts, numbers

  makePools() {
    const f = this.textures.getFrame('units', 'soldier-1');
    this.manScale = SOLDIER_H / f.height;
    this.run2 = this.textures.get('units').has('soldier-2') ? 'soldier-2' : 'soldier-1';
    this.squad = Array.from({ length: MAXQ }, () => this.add.image(0, 0, 'units', 'soldier-1').setOrigin(0.5, 0.92).setDepth(D.squad).setVisible(false));
    this.shots = Array.from({ length: MAXS }, () => this.add.image(0, 0, 'units', 'soldier-1').setOrigin(0.5, 0.92).setDepth(D.shot).setVisible(false));
    this.beasts = Array.from({ length: MAXB }, () => { const s = this.add.image(0, 0, 'units', 'bean').setOrigin(0.5, 0.9).setDepth(D.beast).setVisible(false); s.key = null; return s; });
    this.srcH = new Map();
    this.wavePills = Array.from({ length: 5 }, () => ({
      pill: this.add.image(0, 0, 'pill-red').setDepth(D.num).setVisible(false),
      num: this.add.bitmapText(0, 0, 'numBig', '', 44).setOrigin(0.5).setDepth(D.num + 1).setVisible(false),
    }));
    this.ghosts = [];
    this.nums = [];
    this.squadX = CX;
  }

  texH(key) {
    if (!this.srcH.has(key)) this.srcH.set(key, this.textures.get(key).getSourceImage().height || 100);
    return this.srcH.get(key);
  }

  /** The squad: as many as it has (to MAXQ), packed at the wall under the aim, a firing bob; tinted by its tier. */
  drawSquad(dt) {
    const g = this.g, t = this.time.now / 1000, n = Math.min(MAXQ, g.squad);
    const tx = xOf(g.aimX, 0);
    this.squadX += (tx - this.squadX) * Math.min(1, dt * 16);
    const tint = TIER_TINT[Math.min(g.tier, TIER_TINT.length - 1)];
    const sc = this.manScale * (1 + g.tier * 0.12);
    for (let i = 0; i < MAXQ; i += 1) {
      const m = this.squad[i];
      if (i >= n) { if (m.visible) m.setVisible(false); else break; continue; }
      const [ox, oy] = SLOTS[i];
      const fire = this.running && !this.ended ? Math.abs(Math.sin(t * 12 + i)) * 3 : 0;
      m.setVisible(true).setFrame(((t * 8 + i) | 0) & 1 ? this.run2 : 'soldier-1').setPosition(this.squadX + ox, Y0 - 4 - oy * 1.6 - fire).setScale(sc);
      if (m.tintTopLeft !== tint) m.setTint(tint);
    }
    this.shownSquad = n;
  }

  drawShots() {
    const g = this.g, t = this.time.now / 1000, tint = TIER_TINT[Math.min(g.tier, TIER_TINT.length - 1)];
    let k = 0;
    for (const s of g.shots) {
      if (k >= MAXS) break;
      const sc = sOf(s.z), m = this.shots[k++];
      m.setVisible(true).setFrame(((t * 12 + k) | 0) & 1 ? this.run2 : 'soldier-1').setPosition(xOf(s.x, s.z), yOf(s.z)).setScale(this.manScale * sc * 0.9);
      if (m.tintTopLeft !== tint) m.setTint(tint);
    }
    for (; k < MAXS && this.shots[k].visible; k += 1) this.shots[k].setVisible(false);
  }

  /** The waves: a loose, jostling crowd down the middle — each beast its own stable offset, size and facing, the
      edges ragged — as many as the budget shows, handed out far to near; its number over its back. */
  drawBeasts() {
    const g = this.g, t = this.time.now / 1000, kit = this.cfg.kit;
    const waves = [...g.live].sort((a, b) => b.front - a.front);
    const total = waves.reduce((s, w) => s + waveCount(w), 0) || 1;
    let k = 0, pi = 0;
    for (const wv of waves) {
      const left = waveLeft(wv), n = left.reduce((s, u) => s + u.n, 0);
      const v = Math.min(n, Math.max(8, Math.floor((MAXB * n) / total)), MAXB - k);
      const per = perRank(wv.span, this.cfg.level), gap = this.cfg.level.rank ?? 2.2, wid = wv.span[1] - wv.span[0];
      const kinds = [...left].reverse(); // the front rank first
      const kindAt = (j) => { let c = 0; for (const u of kinds) { c += u.n; if (j < c) return u.b; } return kinds.at(-1).b; };
      let back = wv.front;
      for (let j = v - 1; j >= 0; j -= 1, k += 1) { // far ranks first, so the near ones draw over them
        const r = Math.floor(j / per), col = j % per;
        const jz = (hash(j, 1) - 0.5) * gap * 1.6, ju = (hash(j, 2) - 0.5) * 1.3;
        const jost = Math.sin(t * 3 + j) * 0.012;
        const z = wv.front + r * gap + jz + (r === 0 ? Math.abs(jz) : 0);
        const u = Phaser.Math.Clamp(wv.span[0] + ((col + 0.5 + ju) / per) * wid + jost, wv.span[0] - 0.04, wv.span[1] + 0.04);
        back = Math.max(back, z);
        const b = kindAt(j), kb = kit.beasts[b];
        const key = `${b}-${kb.frames[Math.floor(t * 6 + hash(j, 3) * 4) % kb.frames.length]}`;
        const sp = this.beasts[k];
        if (sp.key !== key) { sp.setTexture(key); sp.key = key; }
        const sc = sOf(z), size = kb.size * (0.85 + hash(j, 4) * 0.3);
        const bob = kb.fly ? Math.sin(t * 7 + j) * 10 * sc + 16 * sc : Math.abs(Math.sin(t * 8 + j)) * 3 * sc;
        sp.setVisible(true).setPosition(xOf(u, z), yOf(z) - bob).setScale((size * sc) / this.texH(key)).setFlipX(hash(j, 5) < 0.35);
      }
      const p = this.wavePills[pi++];
      if (p) { // over its back rank, in the middle column — never over the side columns' cards
        const zb = back + 3, sc = sOf(zb), x = xOf(colMid('M'), zb), y = yOf(zb) - 90 * sc - 22;
        const sx = Math.min((0.55 + String(n).length * 0.2) * (0.5 + sc * 0.4), ((COLS.M[1] - COLS.M[0]) * HALF * sc) / 180);
        p.pill.setVisible(true).setPosition(x, y).setScale(sx, 0.5 + sc * 0.4);
        p.num.setVisible(true).setPosition(x, y - 3).setText(String(n)).setScale(0.5 + sc * 0.4);
      }
    }
    for (; k < MAXB && this.beasts[k].visible; k += 1) this.beasts[k].setVisible(false);
    for (; pi < this.wavePills.length; pi += 1) { this.wavePills[pi].pill.setVisible(false); this.wavePills[pi].num.setVisible(false); }
    this.shownBeasts = k;
  }

  ghost(key, frame, x, y, sc, { vx = 0, vy = -300, spin = 0, life = 0.55, tint = 0xffffff } = {}) {
    let gh = this.ghosts.find((o) => !o.live);
    if (!gh) {
      if (this.ghosts.length > 90) return;
      gh = { s: this.add.image(0, 0, 'units', 'soldier-1').setOrigin(0.5, 0.8).setDepth(D.fx - 1) };
      this.ghosts.push(gh);
    }
    if (frame) gh.s.setTexture(key, frame); else gh.s.setTexture(key);
    Object.assign(gh, { live: true, vx, vy, spin, life, t: 0 });
    gh.s.setVisible(true).setPosition(x, y).setScale(sc).setAlpha(1).setRotation(0).setTint(tint);
  }

  drawGhosts(dt) {
    for (const gh of this.ghosts) {
      if (!gh.live) continue;
      gh.t += dt;
      gh.vy += 1100 * dt;
      gh.s.x += gh.vx * dt; gh.s.y += gh.vy * dt;
      gh.s.rotation += gh.spin * dt;
      gh.s.setAlpha(Math.max(0, 1 - gh.t / gh.life));
      if (gh.t >= gh.life) { gh.live = false; gh.s.setVisible(false); }
    }
  }

  num(x, y, s, font = 'numBig', size = 60, { rise = 70, life = 0.9 } = {}) {
    let n = this.nums.find((o) => !o.live);
    if (!n) {
      if (this.nums.length > 48) return;
      n = { b: this.add.bitmapText(0, 0, font, '', size).setOrigin(0.5).setDepth(D.num + 2) };
      this.nums.push(n);
    }
    n.b.setFont(font).setFontSize(size).setText(s).setPosition(x, y).setVisible(true).setAlpha(1).setScale(0.2);
    Object.assign(n, { live: true, t: 0, y0: y, rise, life });
  }

  drawNums(dt) {
    for (const n of this.nums) {
      if (!n.live) continue;
      n.t += dt;
      const f = n.t / n.life;
      const pop = f < 0.15 ? backOut(f / 0.15) * 1.2 : 1.2 - Math.min(0.2, (f - 0.15));
      n.b.setScale(pop).setY(n.y0 - n.rise * quadOut(Math.min(1, f * 1.4))).setAlpha(f > 0.7 ? 1 - (f - 0.7) / 0.3 : 1);
      if (f >= 1) { n.live = false; n.b.setVisible(false); }
    }
  }

  // ---------------------------------------------------------------- the 大妖

  makeBoss() {
    const b = this.cfg.level.boss, kb = this.cfg.kit.beasts[b.beast];
    this.bossKey = `${b.beast}-${kb.frames[0]}`;
    this.bossHitKey = `${b.beast}-${kb.hit}`;
    this.bossName = kb.name?.[this.lang] ?? kb.name?.zh ?? b.beast;
    this.aura = this.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0x9fd8ff).setVisible(false).setDepth(D.boss - 0.5);
    this.boss = this.add.image(0, 0, this.bossKey).setOrigin(0.5, 0.92).setDepth(D.boss).setVisible(false);
    this.bossShadow = this.add.image(0, 0, 'shadow').setAlpha(0.6).setDepth(D.beast - 1).setVisible(false);
    this.bossBar = this.add.graphics().setDepth(D.num);
    this.bossNum = this.add.bitmapText(0, 0, 'numSmall', '', 26).setOrigin(0.5).setDepth(D.num + 1).setVisible(false);
    this.bossLabel = text(this, 0, 0, this.bossName, 20, { color: '#ffd0c0' }).setDepth(D.num + 1).setVisible(false);
    this.strip = this.add.graphics().setDepth(D.beast - 0.5).setBlendMode(Phaser.BlendModes.ADD);
    this.bossLag = 0;
  }

  drawBoss(dt) {
    const bs = this.g.boss;
    this.strip.clear();
    if (!bs?.on) return;
    const t = this.time.now / 1000, sc = sOf(bs.z), x = xOf(bs.x, bs.z), y = yOf(bs.z);
    const kb = this.cfg.kit.beasts[bs.beast], rush = bs.mode === 'rush';
    this.bossHitT = Math.max(0, (this.bossHitT ?? 0) - dt);
    const key = this.bossHitT > 0 || this.ended ? this.bossHitKey : this.bossKey;
    if (this.boss.texture.key !== key) this.boss.setTexture(key);
    const breathe = Math.sin(t * 3) * 0.02, squash = bs.mode === 'warn' ? 0.06 * (1 - bs.modeT / bs.charge.warn) : 0;
    const h = (kb.size * sc) / this.texH(key);
    this.boss.setVisible(!this.won).setPosition(x + (this.jolt ?? 0), y).setScale(h * (1 + breathe + squash), h * (1 - breathe - squash * 1.5));
    this.boss.setDepth(rush || bs.z < 14 ? D.rush : D.boss);
    this.jolt = (this.jolt ?? 0) * 0.8;
    this.bossShadow.setVisible(!this.won).setPosition(x, y).setDisplaySize(kb.size * sc * 0.9, kb.size * sc * 0.22);
    this.aura.setVisible(rush && !this.calm).setPosition(x, y - kb.size * sc * 0.45).setDepth(this.boss.depth - 0.1)
      .setScale(kb.size * sc / 18 * (1 + Math.sin(t * 40) * 0.08)).setAlpha(0.55 + Math.sin(t * 33) * 0.2);
    if (rush && !this.calm && this.rand() < 0.6) this.em.burst('spark', 3, x + (this.rand() - 0.5) * kb.size * sc * 0.8, y - this.rand() * kb.size * sc * 0.8);
    // the column it will charge down, lit while it gathers itself
    if (bs.mode === 'warn' || rush) {
      const [a, b] = COLS[bs.col], z0 = bs.charge.to ?? 4, z1 = bs.z;
      const pulse = 0.25 + Math.abs(Math.sin(t * (rush ? 6 : 14))) * 0.3;
      this.strip.fillStyle(0xff3a2a, pulse).fillPoints([
        { x: xOf(a, z0), y: yOf(z0) }, { x: xOf(b, z0), y: yOf(z0) }, { x: xOf(b, z1), y: yOf(z1) }, { x: xOf(a, z1), y: yOf(z1) }], true);
      for (let z = z0 + 4; z < z1; z += 9) {
        const cz = z - ((t * 30) % 9), s2 = sOf(cz), cx = xOf(bs.line, cz), cy = yOf(cz);
        this.strip.lineStyle(Math.max(2, 6 * s2), 0xffd0a0, 0.8).beginPath().moveTo(cx - 28 * s2, cy - 14 * s2).lineTo(cx, cy).lineTo(cx + 28 * s2, cy - 14 * s2).strokePath();
      }
    }
    const bw = Math.max(150, 260 * sc), top = y - kb.size * sc - 16;
    this.bossLag = Math.max(bs.hp, this.bossLag - Math.max(1, (this.bossLag - bs.hp) * 0.08));
    this.bossBar.clear().fillStyle(0x0a0814, 0.85).fillRoundedRect(x - bw / 2 - 3, top - 3, bw + 6, 22, 9)
      .fillStyle(0xffffff, 0.85).fillRoundedRect(x - bw / 2, top, bw * (this.bossLag / bs.hpMax), 16, 7)
      .fillStyle(0xe8262c, 1).fillRoundedRect(x - bw / 2, top, Math.max(0, bw * (bs.hp / bs.hpMax)), 16, 7);
    this.bossBar.setVisible(!this.won);
    this.bossNum.setVisible(!this.won).setPosition(x, top + 8).setText(String(Math.ceil(bs.hp)));
    this.bossLabel.setVisible(!this.won).setPosition(x, top - 18);
  }

  // ---------------------------------------------------------------- events → juice

  shake(ms, k) { if (!this.calm) this.cameras.main.shake(ms, k); }
  flash(ms, r, g, b) { if (!this.calm) this.cameras.main.flash(ms, r, g, b, true); }

  /** 银月's line for a moment: the host's (台词预取), else the level's own; never two within 5 s unless forced. */
  say(moment, force = false) {
    const now = this.time.now / 1000;
    if (!force && now - this.saidAt < 5) return;
    const pre = this.cfg.lines?.[moment];
    const own = this.cfg.level.moments?.[moment];
    const line = typeof pre === 'string' ? pre : Array.isArray(own) && own.length ? own[Math.floor(this.rand() * own.length)][this.lang] : null;
    if (!line) return;
    this.saidAt = now;
    this.hud.say(line);
  }
  /** …once a run: a teaching line the first time its thing shows. */
  sayOnce(moment) { if (!this.said.has(moment)) { this.said.add(moment); this.say(moment, true); } }

  fact(e) { try { this.cfg.onEvent?.(e); } catch { /* the host's trouble, not the game's */ } }

  handle(e) { this[`on_${e.t}`]?.(e); }

  on_card_hit(e) {
    const v = this.cards.get(e.id);
    if (v) v.punch = 1;
    if (this.rand() < 0.35) this.em.burst('spark', 2, xOf(e.x, e.z), yOf(e.z) - 20 * sOf(e.z));
    this.sfx.pop();
  }

  on_block_hit(e) {
    const v = this.cards.get(e.id);
    if (v) v.punch = 0.6;
    if (this.rand() < 0.4) this.em.burst('debris', 2, xOf(e.x, e.z), yOf(e.z) - 30 * sOf(e.z));
    if (this.rand() < 0.3) this.sfx.hit();
  }

  on_block(e) {
    const x = xOf(colMid(e.col), e.z), y = yOf(e.z), s = sOf(e.z);
    this.dropCard(e.id);
    this.shake(220, 0.012);
    this.em.burst('debris', 26, x, y - 30 * s);
    this.em.burst('dust', 18, x, y);
    this.sfx.slam();
    this.hud.banner(this.w.broke, { color: '#ffe36b', y: 520 });
    if (e.gives === 'tier') {
      this.flash(160, 255, 236, 180);
      this.hud.banner(tierOf(this.g).name[this.lang], { color: '#ffe36b', ribbon: true, y: 400 });
      this.hud.setTier(tierOf(this.g).name[this.lang]);
      this.say('tier', true);
    }
  }

  on_card(e) {
    const x = xOf(colMid(e.col), Math.max(0, e.z)), y = yOf(Math.max(0, e.z));
    this.dropCard(e.id);
    const good = e.n >= 0, big = e.n >= 20;
    this.em.burst(good ? 'gold' : 'bad', big ? 40 : 16, x, y - 30);
    if (big) { this.em.burst('stars', 12, x, y - 40); this.flash(90, 255, 230, 140); }
    this.num(x, y - 60, good ? `+${e.n}` : `-${-e.n}`, good ? (big ? 'numGold' : 'numGood') : 'numBad', big ? 76 : 54, { rise: 80 });
    if (good) { this.sfx.good(); this.hud.punch(); } else { this.sfx.bad(); this.shake(140, 0.008); }
    if (good && e.how === 'line') this.sayOnce('card');
  }

  on_strike(e) {
    this.strikes = (this.strikes ?? 0) + 1;
    if (this.strikes > 6) return;
    const sc = sOf(e.z), x = xOf(e.x, e.z), y = yOf(e.z) - 20 * sc;
    this.em.burst('spark', 3, x, y);
    if (e.killed) {
      const wv = this.g.live.find((w) => w.i === e.wave);
      const b = wv ? [...waveLeft(wv)].reverse().find((u) => u.n > 0)?.b ?? wv.units.at(-1).b : null;
      if (b && this.rand() < 0.7) {
        const kb = this.cfg.kit.beasts[b], key = `${b}-${kb.hit}`;
        this.ghost(key, null, x, y + 10 * sc, (kb.size * sc) / this.texH(key), { vx: (this.rand() - 0.5) * 220, vy: -260 - this.rand() * 220, spin: (this.rand() - 0.5) * 10, life: 0.5 });
        this.em.burst('poof', 2, x, y);
      }
      this.sfx.hit();
    }
  }

  on_wave(e) {
    if (e.i > 0) { this.hud.banner(this.w.wave, { color: '#ffb0a0', y: 300 }); this.say('wave'); }
    this.sfx.thud();
    this.fact({ t: 'wave', beasts: e.beasts });
  }

  on_breach(e) {
    this.shake(120, 0.006);
    this.em.burst('dust', 6, xOf(colMid('M'), 0) + (this.rand() - 0.5) * 120, Y0);
    this.em.burst('debris', 3, xOf(colMid('M'), 0) + (this.rand() - 0.5) * 120, Y0);
    this.breachSum = (this.breachSum ?? 0) + e.d;
    if (this.time.now - (this.breachAt ?? 0) > 200) {
      this.breachAt = this.time.now;
      this.num(116, 890, `-${this.breachSum}`, 'numBad', 40, { rise: 40, life: 0.7 });
      this.breachSum = 0;
      this.sfx.thud();
    }
  }

  on_low() { this.say('low', true); this.fact({ t: 'low', wall: this.g.wall.hp }); }

  on_boss(e) {
    this.hud.banner(this.w.boss(this.bossName), { ribbon: true, y: 330 });
    this.shake(300, 0.012);
    this.sfx.slam();
    this.say('boss', true);
    this.bossLag = e.hp;
    this.fact({ t: 'boss', hp: e.hp });
  }

  on_charge_warn() {
    this.hud.banner(this.w.charge, { color: '#ff8a7a', y: 560 });
    this.say('charge', true);
    this.sfx.tick();
  }

  on_charge(e) { this.shake(260, 0.014); this.sfx.slam(); this.fact({ t: 'charge', col: e.col }); }

  on_charge_end(e) {
    const z = this.g.boss.charge.to ?? 4, x = xOf(e.x, z);
    this.shake(360, 0.02);
    this.flash(120, 190, 225, 255);
    this.em.burst('dust', 30, x, yOf(z));
    this.em.burst('debris', 14, x, yOf(z));
  }

  on_knock(e) {
    const dir = this.squadX < xOf(this.g.boss.line, 0) ? -1 : 1;
    for (let i = 0; i < Math.min(30, e.n); i += 1) {
      const [ox, oy] = SLOTS[i];
      this.ghost('units', 'soldier-1', this.squadX + ox, Y0 - oy * 1.6, this.manScale, { vx: dir * (200 + this.rand() * 300), vy: -340 - this.rand() * 300, spin: dir * 12, life: 0.8 });
    }
    this.num(this.squadX, Y0 - 90, `-${e.n}`, 'numBad', 64, { rise: 60 });
    this.sfx.bad();
  }

  on_bosshit(e) {
    this.bossHitT = 0.08;
    this.jolt = (this.rand() - 0.5) * 8;
    this.dmgSum = (this.dmgSum ?? 0) + e.d;
    const bs = this.g.boss, sc = sOf(bs.z), x = xOf(bs.x, bs.z), y = yOf(bs.z);
    if (this.rand() < 0.4) this.em.burst('spark', 4, x + (this.rand() - 0.5) * 200 * sc, y - this.rand() * 200 * sc);
    if (this.time.now - (this.dmgAt ?? 0) > 150) {
      this.dmgAt = this.time.now;
      this.num(x + (this.rand() - 0.5) * 160 * sc, y - 220 * sc - this.rand() * 40, `-${Math.round(this.dmgSum)}`, 'numBig', 34 + Math.min(30, this.dmgSum / 2), { rise: 70, life: 0.8 });
      this.dmgSum = 0;
      this.sfx.hit();
    }
  }

  on_end(e) {
    if (this.ended) return;
    this.ended = true;
    this.fact({ t: 'end', won: e.won, stars: e.stars });
    if (e.won) {
      const bs = this.g.boss, sc = sOf(bs.z), x = xOf(bs.x, bs.z), y = yOf(bs.z);
      this.sfx.win();
      this.shake(500, 0.02);
      this.flash(200, 255, 240, 200);
      for (let i = 0; i < 6; i += 1) this.time.delayedCall(i * 110, () => { this.em.burst('fire', 18, x + (this.rand() - 0.5) * 220 * sc, y - this.rand() * 260 * sc); this.em.burst('stars', 8, x, y - 120 * sc); });
      this.tweens.add({ targets: this.boss, angle: 12, alpha: 0, y: this.boss.y + 20, delay: 500, duration: 700, ease: 'Quad.easeIn', onComplete: () => { this.won = true; } });
      this.hud.banner(this.w.won, { color: '#ffe36b', ribbon: true, y: 330 });
      this.say('won', true);
    } else {
      this.sfx.lose();
      this.shake(600, 0.02);
      this.tweens.add({ targets: this.wall, y: this.wall.y + 18, angle: 1.5, duration: 600, ease: 'Bounce.easeOut' });
      this.hud.banner(this.w.lost, { color: '#ffffff', ribbon: true, y: 330 });
      this.say('lost', true);
    }
    this.time.delayedCall(e.won ? 1700 : 1200, () => this.cfg.onEnd?.({ won: e.won, stars: e.stars, stats: { wall: e.wall, sec: Math.round(e.sec), peak: this.g.peak, ...this.g.stats } }));
  }

  /** The teaching lines, each once, the first time its thing comes into sight. */
  teach() {
    for (const it of this.g.belt) {
      if (it.gone || it.z > TOP - 10) continue;
      if (it.kind === 'block') this.sayOnce('wall');
      else if (it.n < 0) this.sayOnce('red');
    }
  }

  // ---------------------------------------------------------------- the loop

  update(_, delta) {
    const dt = Math.min(0.05, delta / 1000);
    const g = this.g;
    const k = this.keys;
    if (k) {
      const dir = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
      if (dir) this.aimX = Phaser.Math.Clamp(this.aimX + dir * 2.2 * dt, -1, 1);
    }
    this.strikes = 0;
    if (this.running && !this.ended) {
      aim(g, this.aimX, true);
      step(g, dt);
      for (const e of g.events) this.handle(e);
      g.events.length = 0;
      if ((this.teachT = (this.teachT ?? 0) + dt) > 0.5) { this.teachT = 0; this.teach(); }
    }
    this.man.x += (xOf(Phaser.Math.Clamp(this.aimX, -0.92, 0.92), 0) - this.man.x) * Math.min(1, dt * 14);
    this.drawBelt(dt);
    this.drawBeasts();
    this.drawShots();
    this.drawSquad(dt);
    this.drawBoss(dt);
    this.drawGhosts(dt);
    this.drawNums(dt);
    this.hud.tick(dt, { horde: hordeAll(g), count: g.squad, wall: g.wall.hp, wallMax: g.wall.max });
    if (this.hud.fps && (this.fpsT = (this.fpsT ?? 0) + dt) > 0.25 && !(this.fpsT = 0)) {
      this.hud.fps.setText(`FPS ${this.game.loop.actualFps.toFixed(0)} · 豆${this.shownSquad ?? 0}/${g.squad} · 飞${g.shots.length} · 兽${this.shownBeasts ?? 0}`);
    }
  }

  /** The host's command (doc/game-kit.md § commands in): a line over the field. */
  sayLine(who, line) { if (line) this.hud.say(line); }
}
