// play.js — 守山门's scene: draws what the engine (scripts/games/sadoushou/core.js) holds and turns its events into
// juice. One input: move left/right (the mouse's x, a drag on touch, A/D · ←/→) to pick a column; the squad fires on
// its own (Hanli 10-21: 「一共3列, 要么打野猪, 要么打两边的+攻击的卡」).
//
// The road is pseudo-3D (view.js): painted ONCE into one ground texture at create (the camera never moves), the ink
// mountains above its horizon, the three columns marked on it. The units are pooled images (豆兵: 撒豆成兵's atlas;
// beasts: 守墙关's frames), laid out every frame by the engine's numbers and scaled by depth — no physics, no tween per
// unit, no per-frame depth changes (layers keep a fixed order; a wave's beasts are handed out far to near).
import * as Phaser from 'phaser';
import { newGame, step, aim, waveLeft, waveCount, perRank, hordeAll, tierOf, colMid, castJieyin, bossRows, COLS, TOP } from 'sadoushou-core';
import { W, H, CX, Y0, HY, HALF, CARD, sOf, yOf, xOf, zOfY, uOfX } from './view.js';
import { makeTextures, makeNumberFont, makeEmitters, rng, canvasTex, rounded } from './fx.js';
import { Hud, SealGlow, WORDS, text } from './hud.js';
import { Sfx } from './sfx.js';
import { lookOf, lookArts, loopAt, arcAt, fanAt } from '../../../scripts/games/jieyin/flight.js';

const MAXQ = 160;                 // the squad's sprites at the wall at most (the blue number tells the rest)
const MAXS = 60;                  // 豆兵 in flight drawn at most
const MAXB = 380;                 // beast sprites at most (the red number tells the rest)
const SOLDIER_H = 40;             // a 豆兵's height at the wall (px); smaller up the road
const GOLD = Math.PI * (3 - Math.sqrt(5));
const SLOTS = Array.from({ length: MAXQ }, (_, i) => { const r = 5.6 * Math.sqrt(i + 0.5), a = i * GOLD; return [r * Math.cos(a) * 1.3, r * Math.sin(a) * 0.4]; });
const HAND = { u: 0.72, v: 0.3 }; // xiaoman-cast.webp's raised hand (its glowing charm), 0…1 of the picture
// 结印's spell (Hanli 10-28: 「打怪的法术也让用户看到」): its flight (ms), its number's size, the slow beat at impact (s, at 0.3×).
const SPELL = { fly: 300, num: 100, slow: 0.4 };
const D = { ground: 0, beast: 20, boss: 25, belt: 27, shot: 30, squad: 32, rush: 35, wall: 40, man: 41, fx: 3000, num: 3100, hud: 4000 };
const TIER_TINT = [0xffffff, 0xfff0c8, 0xe0a060];
const backOut = (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
const quadOut = (t) => t * (2 - t);
const hash = (j, k = 1) => (((j * 2654435761 + k * 40503) >>> 0) % 10007) / 10007; // a stable 0…1 per beast
/** Where a beast's frames live (its row's `art`): 守墙关's by default, 撒豆成兵's, or this kit's own (第一回's 马家 people). */
const artDir = (b, art) => ({ sadou: `${b}../sadou/art/`, sadoushou: `${b}art/` })[art] ?? `${b}../shouqiang/art/`;
/** A beast row's frames, its hit and its poses (a 大妖's `warn` · `rush` frames). */
const framesOf = (k) => [...new Set([...k.frames, k.hit, ...Object.values(k.pose ?? {})])];
/** The belt's pictures a level names (a card's or a wall's `icon`), each once. */
const beltIcons = (level) => [...new Set((level.belt?.lines ?? []).flatMap((ln) => [ln.wall?.icon, ...(ln.cards ?? []).map((c) => c.icon)]).filter(Boolean))];

export class PlayScene extends Phaser.Scene {
  constructor() { super('play'); }

  init(cfg) {
    this.cfg = cfg;
    this.lang = cfg.lang === 'en' ? 'en' : 'zh';
    // a level's own words over the kit's (守灶台: 灶台 for 山门, 马家 for 兽潮, its won and lost banners)
    this.w = { ...WORDS[this.lang], ...(cfg.level.words?.[this.lang] ?? {}) };
  }

  preload() {
    const b = this.cfg.base, sd = `${b}../sadou/art/`, sq = `${b}../shouqiang/art/`, sl = `${b}../shoulu/art/`;
    this.missing = new Set();
    this.load.on('loaderror', (f) => this.missing.add(f.key));
    this.load.atlas('units', `${sd}units.webp`, `${sd}units.json`);
    // a level's own ground (`art`: 守灶台's hut floor, its 灶台 for the wall, the hut's far end for the sky), else the kit's
    const own = `${b}art/`, la = this.cfg.level.art ?? {};
    this.load.image('tex-road', la.road ? `${own}${la.road}.webp` : `${sd}tex-road.webp`);
    this.load.image('tex-side', la.side ? `${own}${la.side}.webp` : `${sd}tex-side.webp`);
    this.load.image('wall', la.wall ? `${own}${la.wall}.webp` : `${sq}wall.webp`);
    this.load.image('xiaoman', `${sq}xiaoman-cast.webp`);
    for (const a of lookArts()) this.load.image(`jy-${a}`, `${b}../jieyin/art/${a}.webp`); // 结印's spells' pictures (jieyin/flight.js)
    this.load.image('sky', la.sky ? `${own}${la.sky}.webp` : `${b}../../../worlds/jiuding/art/backdrop/${this.cfg.level.sky ?? 'cloudy-day'}.webp`);
    for (const [id, k] of Object.entries(this.cfg.kit.beasts)) {
      if (id.startsWith('_')) continue;
      for (const f of framesOf(k)) this.load.image(`${id}-${f}`, `${artDir(b, k.art)}${id}-${f}.webp`);
    }
    for (const ic of beltIcons(this.cfg.level)) this.load.image(ic, `${own}${ic}.webp`);
    if (this.cfg.level.pieces) this.load.image('piece-break', `${own}bowl-break.webp`);
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
    this.g = newGame(kit, level, { seed, show: true, calm: this.calm }); // show: 结印 flies before it lands (core.js castJieyin)
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
    this.sfx = new Sfx(this.cfg.shell); // its sounds go to the shell's one sound layer
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
    for (const [id, k] of Object.entries(this.cfg.kit.beasts)) if (!id.startsWith('_')) for (const f of framesOf(k)) fill(`${id}-${f}`, 120, 120, '#7a4a2a');
    for (const ic of beltIcons(this.cfg.level)) fill(ic, 96, 96, '#d9b46a');
    if (this.cfg.level.pieces) fill('piece-break', 96, 96, '#d9c8a0');
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
    // 结印's progress at his hand (hud.js SealGlow): the raised fist of xiaoman-cast.webp, as a share of the picture
    const hand = () => ({ x: this.man.x + (HAND.u - 0.5) * this.man.displayWidth, y: this.man.y + (HAND.v - 0.9) * this.man.displayHeight });
    this.sealGlow = new SealGlow(this, { depth: D.man + 1, at: hand, em: this.em, calm: this.calm });
  }

  // ---------------------------------------------------------------- the belt: cards and walls coming down the sides

  cardOf(it) {
    let v = this.cards.get(it.id);
    if (v) return v;
    // the belt keeps its order as it rides, so a card's depth is set once: the nearer over the farther
    const d = D.belt + (1000 - it.z) / 2000;
    // a wall with a picture of its own (沈家的门, 戴九履一's chestnuts) stands as that picture; a card's picture rides on its face
    const wallPic = it.kind === 'block' && it.icon;
    const img = this.add.image(0, 0, wallPic ? it.icon : it.kind === 'block' ? 'block' : 'card-blue').setOrigin(0.5, 1).setDepth(d);
    const icon = it.kind === 'card' && it.icon ? this.add.image(0, 0, it.icon).setOrigin(0.5, 1).setDepth(d + 0.00005) : null;
    const label = this.add.bitmapText(0, 0, 'numGood', '', 60).setOrigin(0.5).setDepth(d + 0.0001);
    v = { img, icon, label, punch: 0, face: null, pic: Boolean(wallPic) };
    this.cards.set(it.id, v);
    return v;
  }

  dropCard(id) {
    const v = this.cards.get(id);
    if (!v) return;
    v.img.destroy(); v.label.destroy(); v.icon?.destroy();
    this.cards.delete(id);
  }

  drawBelt(dt) {
    for (const it of this.g.belt) {
      const on = !it.gone && it.z < TOP + 12;
      if (!on) { if (this.cards.has(it.id)) this.dropCard(it.id); continue; }
      const v = this.cardOf(it), s = sOf(it.z), [a, b] = COLS[it.col];
      const x = xOf((a + b) / 2, it.z), y = yOf(it.z), wpx = (b - a) * HALF * s * CARD;
      v.punch = Math.max(0, v.punch - dt * 6);
      const k = 1 + v.punch * 0.18;
      if (it.kind === 'block') {
        const tall = v.pic ? v.img.height / v.img.width : 0.76;
        v.img.setPosition(x, y + 6 * s).setDisplaySize(wpx * (v.pic ? 0.9 : 1.05) * k, wpx * (v.pic ? 0.9 : 1) * tall * k);
        v.label.setFont('numSmall').setText(String(Math.ceil(it.hp))).setPosition(x, y - wpx * 0.36).setFontSize(Math.round(18 + 30 * s)).setScale(k);
        continue;
      }
      const n = Math.floor(it.n), face = it.gold ? 'card-gold' : n < 0 ? 'card-red' : 'card-blue';
      if (v.face !== face) { v.face = face; v.img.setTexture(face); v.label.setFont(it.gold ? 'numGold' : n < 0 ? 'numBad' : 'numGood'); }
      v.img.setPosition(x, y + 4 * s).setDisplaySize(wpx * k, wpx * 0.72 * k);
      // a card with a picture (桂花糕, 家里的碗, 租): the picture over its upper half, the number under it
      if (v.icon) v.icon.setPosition(x - wpx * 0.2 * k, y - wpx * 0.1).setDisplaySize(wpx * 0.46 * k, wpx * 0.46 * k * (v.icon.height / v.icon.width));
      v.label.setText(n < 0 ? `-${-n}` : `+${n}`).setPosition(v.icon ? x + wpx * 0.2 * k : x, y - wpx * 0.36).setFontSize(Math.round(20 + 36 * s)).setScale(k);
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

  /** One drawing a 大妖 (a level may send several: 马小宝 · 马三): its sprite, shadow, aura, HP bar, name. */
  makeBoss() {
    this.bossViews = bossRows(this.cfg.level).map((b) => {
      const kb = this.cfg.kit.beasts[b.beast], key = `${b.beast}-${kb.frames[0]}`;
      return {
        kb, key, hitKey: `${b.beast}-${kb.hit}`, name: kb.name?.[this.lang] ?? kb.name?.zh ?? b.beast,
        aura: this.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0x9fd8ff).setVisible(false).setDepth(D.boss - 0.5),
        img: this.add.image(0, 0, key).setOrigin(0.5, 0.92).setDepth(D.boss).setVisible(false),
        shadow: this.add.image(0, 0, 'shadow').setAlpha(0.6).setDepth(D.beast - 1).setVisible(false),
        bar: this.add.graphics().setDepth(D.num),
        num: this.add.bitmapText(0, 0, 'numSmall', '', 26).setOrigin(0.5).setDepth(D.num + 1).setVisible(false),
        label: text(this, 0, 0, kb.name?.[this.lang] ?? kb.name?.zh ?? b.beast, 20, { color: '#ffd0c0' }).setDepth(D.num + 1).setVisible(false),
        lag: 0, hitT: 0, jolt: 0, gone: false,
      };
    });
    this.strip = this.add.graphics().setDepth(D.beast - 0.5).setBlendMode(Phaser.BlendModes.ADD);
  }

  /** The frame a 大妖 shows now: hit, else its pose for the mode (马小宝 rolls, 马三 raises the club), else its walk. */
  bossFrame(bs, v) {
    if (v.hitT > 0 || this.ended) return v.hitKey;
    const pose = v.kb.pose?.[bs.mode];
    return pose ? `${bs.beast}-${pose}` : v.key;
  }

  drawBoss(dt) {
    this.strip.clear();
    for (const bs of this.g.bosses) this.drawOneBoss(bs, this.bossViews[bs.i], dt);
  }

  drawOneBoss(bs, v, dt) {
    if (!v || v.gone || !bs.on && !v.falling) return;
    const t = this.time.now / 1000, sc = sOf(bs.z), x = xOf(bs.x, bs.z), y = yOf(bs.z);
    const kb = v.kb, rush = bs.mode === 'rush';
    v.hitT = Math.max(0, v.hitT - dt);
    const key = this.bossFrame(bs, v);
    if (v.img.texture.key !== key) v.img.setTexture(key);
    const breathe = Math.sin(t * 3 + bs.i) * 0.02, squash = bs.mode === 'warn' ? 0.06 * (1 - bs.modeT / bs.charge.warn) : 0;
    const spin = rush && bs.kind === 'roll' ? t * 14 : 0; // 马小宝's 糯米团子 roll
    const h = (kb.size * sc) / this.texH(key);
    if (!v.falling) v.img.setVisible(true).setPosition(x + v.jolt, y).setScale(h * (1 + breathe + squash), h * (1 - breathe - squash * 1.5)).setRotation(spin);
    v.img.setDepth(rush || bs.z < 14 ? D.rush : D.boss);
    v.jolt *= 0.8;
    v.shadow.setVisible(!v.falling).setPosition(x, y).setDisplaySize(kb.size * sc * 0.9, kb.size * sc * 0.22);
    v.aura.setVisible(rush && !this.calm && !v.falling).setPosition(x, y - kb.size * sc * 0.45).setDepth(v.img.depth - 0.1)
      .setScale(kb.size * sc / 18 * (1 + Math.sin(t * 40) * 0.08)).setAlpha(0.55 + Math.sin(t * 33) * 0.2);
    if (rush && !this.calm && this.rand() < 0.6) this.em.burst('spark', 3, x + (this.rand() - 0.5) * kb.size * sc * 0.8, y - this.rand() * kb.size * sc * 0.8);
    // the column it will charge (a roll) or stamp down (a slam), lit while it gathers itself
    if (bs.mode === 'warn' || rush) {
      const [a, b] = COLS[bs.col], z0 = bs.charge.to ?? 4, z1 = bs.z;
      const pulse = 0.25 + Math.abs(Math.sin(t * (rush ? 6 : 14))) * 0.3, mid = colMid(bs.col);
      this.strip.fillStyle(0xff3a2a, pulse).fillPoints([
        { x: xOf(a, z0), y: yOf(z0) }, { x: xOf(b, z0), y: yOf(z0) }, { x: xOf(b, z1), y: yOf(z1) }, { x: xOf(a, z1), y: yOf(z1) }], true);
      for (let z = z0 + 4; z < z1; z += 9) {
        const cz = z - ((t * 30) % 9), s2 = sOf(cz), cx = xOf(mid, cz), cy = yOf(cz);
        this.strip.lineStyle(Math.max(2, 6 * s2), 0xffd0a0, 0.8).beginPath().moveTo(cx - 28 * s2, cy - 14 * s2).lineTo(cx, cy).lineTo(cx + 28 * s2, cy - 14 * s2).strokePath();
      }
    }
    const show = !v.falling;
    const bw = Math.max(120, 220 * sc), top = y - kb.size * sc - 16 - bs.i * 30; // two side by side: their bars a row apart
    v.lag = Math.max(bs.hp, v.lag - Math.max(1, (v.lag - bs.hp) * 0.08));
    v.bar.clear();
    if (show) v.bar.fillStyle(0x0a0814, 0.85).fillRoundedRect(x - bw / 2 - 3, top - 3, bw + 6, 22, 9)
      .fillStyle(0xffffff, 0.85).fillRoundedRect(x - bw / 2, top, bw * (v.lag / bs.hpMax), 16, 7)
      .fillStyle(0xe8262c, 1).fillRoundedRect(x - bw / 2, top, Math.max(0, bw * (bs.hp / bs.hpMax)), 16, 7);
    v.num.setVisible(show).setPosition(x, top + 8).setText(String(Math.ceil(bs.hp)));
    v.label.setVisible(show).setPosition(x, top - 18);
  }

  /** A 大妖 down (one of several): it topples off the road; the last one is the win's (on_end). */
  topple(bs, v, last) {
    if (v.falling) return;
    v.falling = true;
    v.bar.clear(); v.num.setVisible(false); v.label.setVisible(false); v.aura.setVisible(false); v.shadow.setVisible(false);
    const sc = sOf(bs.z), x = xOf(bs.x, bs.z), y = yOf(bs.z);
    v.img.setTexture(v.hitKey);
    for (let i = 0; i < (last ? 6 : 3); i += 1) this.time.delayedCall(i * 110, () => { this.em.burst('fire', 18, x + (this.rand() - 0.5) * 220 * sc, y - this.rand() * 260 * sc); this.em.burst('stars', 8, x, y - 120 * sc); });
    this.tweens.add({ targets: v.img, angle: 12, alpha: 0, y: v.img.y + 20, delay: 500, duration: 700, ease: 'Quad.easeIn', onComplete: () => { v.gone = true; v.img.setVisible(false); } });
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
    if (e.i > 0 && e.crowd == null) { this.hud.banner(this.w.wave, { color: '#ffb0a0', y: 300 }); this.say('wave'); } // a 大妖's crowd comes with its banner
    this.sfx.thud();
    this.fact({ t: 'wave', beasts: e.beasts });
  }

  on_breach(e) {
    this.shake(120, 0.006);
    this.em.burst('dust', 6, xOf(colMid('M'), 0) + (this.rand() - 0.5) * 120, Y0);
    this.em.burst('debris', 3, xOf(colMid('M'), 0) + (this.rand() - 0.5) * 120, Y0);
    this.piecesLost(e.hp);
    this.breachSum = (this.breachSum ?? 0) + e.d;
    if (this.time.now - (this.breachAt ?? 0) > 200) {
      this.breachAt = this.time.now;
      this.num(116, 890, `-${this.breachSum}`, 'numBad', 40, { rise: 40, life: 0.7 });
      this.breachSum = 0;
      this.sfx.thud();
    }
  }

  /** A piece of the wall gone (守灶台: a bowl off the 灶台): it shatters over the wall, the HUD loses one. */
  piecesLost(wall) {
    const p = this.cfg.level.pieces;
    if (!p) return;
    const left = Math.ceil((wall / this.g.wall.max) * p.n - 1e-9);
    if (this.piecesLeft == null) this.piecesLeft = p.n;
    for (; this.piecesLeft > left; this.piecesLeft -= 1) {
      const x = CX + (this.piecesLeft - (p.n + 1) / 2) * 120, y = Y0 + 40;
      const b = this.add.image(x, y, 'piece-break').setDepth(D.fx).setScale(0.3);
      this.tweens.add({ targets: b, scale: 0.9, y: y - 60, alpha: 0, duration: 700, ease: 'Quad.easeOut', onComplete: () => b.destroy() });
      this.em.burst('debris', 16, x, y);
      this.shake(200, 0.012);
      this.sfx.bad();
      this.hud.setPieces(left);
    }
  }

  on_low() { this.say('low', true); this.fact({ t: 'low', wall: this.g.wall.hp }); }

  on_boss(e) {
    const v = this.bossViews[e.boss ?? 0];
    if ((e.boss ?? 0) > 0) { this.time.delayedCall(700 * e.boss, () => this.hud.banner(this.w.boss(v.name), { ribbon: true, y: 330 })); v.lag = e.hp; return; } // the second one, a beat later
    this.hud.banner(this.w.boss(v.name), { ribbon: true, y: 330 });
    this.shake(300, 0.012);
    this.sfx.slam();
    this.say('boss', true);
    v.lag = e.hp;
    this.fact({ t: 'boss', hp: e.hp });
  }

  /** One of several down: it topples, a banner; the last one's is the win (on_end). */
  on_bossdown(e) {
    if (this.g.bosses.every((b) => b.hp <= 0)) return;
    const bs = this.g.bosses[e.boss];
    this.topple(bs, this.bossViews[e.boss], false);
    this.shake(300, 0.014);
    this.sfx.slam();
  }

  /** 马小宝 stops to eat the 桂花糕 the squad took (a card that `feeds` him). */
  on_eat(e) {
    const say = [this.cfg.level.boss].flat()[e.boss]?.eatSay;
    if (say) this.hud.banner(say[this.lang] ?? say.zh, { color: '#ffe36b', y: 600 });
  }

  on_charge_warn(e) {
    const row = [this.cfg.level.boss].flat()[e.boss ?? 0];
    this.hud.banner(row?.warnSay?.[this.lang] ?? this.w.charge, { color: '#ff8a7a', y: 560 });
    this.say('charge', true);
    this.sfx.tick();
  }

  on_charge(e) { this.shake(260, 0.014); this.sfx.slam(); this.fact({ t: 'charge', col: e.col }); }

  on_charge_end(e) {
    const z = e.z ?? this.g.bosses[e.boss ?? 0].charge.to ?? 4, x = xOf(e.kind === 'slam' ? colMid(e.col) : e.x, Math.min(z, 4));
    this.shake(360, 0.02);
    this.flash(120, 190, 225, 255);
    this.em.burst('dust', 30, x, yOf(z));
    this.em.burst('debris', 14, x, yOf(z));
  }

  on_knock(e) {
    const dir = this.squadX < xOf(e.x ?? 0, 0) ? -1 : 1;
    for (let i = 0; i < Math.min(30, e.n); i += 1) {
      const [ox, oy] = SLOTS[i];
      this.ghost('units', 'soldier-1', this.squadX + ox, Y0 - oy * 1.6, this.manScale, { vx: dir * (200 + this.rand() * 300), vy: -340 - this.rand() * 300, spin: dir * 12, life: 0.8 });
    }
    this.num(this.squadX, Y0 - 90, `-${e.n}`, 'numBad', 64, { rise: 60 });
    this.sfx.bad();
  }

  on_bosshit(e) {
    const bs = this.g.bosses[e.boss ?? 0], v = this.bossViews[e.boss ?? 0];
    v.hitT = 0.08;
    v.jolt = (this.rand() - 0.5) * 8;
    this.dmgSum = (this.dmgSum ?? 0) + e.d;
    const sc = sOf(bs.z), x = xOf(bs.x, bs.z), y = yOf(bs.z);
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
      this.sfx.win();
      this.shake(500, 0.02);
      this.flash(200, 255, 240, 200);
      for (const bs of this.g.bosses) this.topple(bs, this.bossViews[bs.i], true);
      this.time.delayedCall(1200, () => { this.won = true; });
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

  // ---------------------------------------------------------------- 结印 (games/jieyin/helper.js makes the seals; the page calls these)

  /** A move made at the camera: it flies up a column (the dock's lane, else the squad's) — true — or not now. */
  jieyin(id, lane) {
    if (!this.running || this.ended || this.sys.isPaused()) return false;
    const ok = castJieyin(this.g, id, lane);
    for (const e of this.g.events) this.handle(e);
    this.g.events.length = 0;
    return ok;
  }

  /** The 结印 dock's progress (games/jieyin/helper.js onProgress): 小满's hand glows with it, a burst as it flies. */
  sealProgress(p) { if (!this.ended) this.sealGlow?.set(p); else this.sealGlow?.set(null); }

  /** 走火: a puff from 小满's hand, a word — no other cost. */
  fizzle() {
    if (this.ended) return;
    this.em.burst('poof', 8, this.man.x + 20, this.man.y - 90);
    const t = text(this, this.man.x, this.man.y - 130, this.lang === 'en' ? 'Misfire' : '走火', 26, { color: '#ffb0a0' }).setDepth(D.num);
    this.tweens.add({ targets: t, y: t.y - 40, alpha: 0, duration: 800, onComplete: () => t.destroy() });
  }

  /** 小满's raised hand (xiaoman-cast.webp's charm), where a spell leaves from. */
  handPos() { return { x: this.man.x + (HAND.u - 0.5) * this.man.displayWidth, y: this.man.y + (HAND.v - 0.9) * this.man.displayHeight }; }

  /** The spell flies from 小满's hand to the beast it hit (the engine's `x` across, `z` up the road) and bursts there:
      fire, a ring, the number. */
  on_spell(e) {
    const z = Math.max(0, e.z ?? 0), x = xOf(e.x ?? colMid(e.col), z), y = yOf(z) - 40 * sOf(z);
    const big = this.cfg.level.jieyin?.firstCast && !this.castBefore; // a level's first cast, played big (守灶台: the game's first 结印)
    this.castBefore = true;
    if (big) {
      this.slowT = 0.9; // the world slows a beat (update), the line over it
      this.hud.banner(this.cfg.level.jieyin.firstCast[this.lang] ?? this.cfg.level.jieyin.firstCast.zh, { color: '#bfe8ff', ribbon: true, y: 420 });
      this.flash(220, 200, 236, 255);
    }
    const look = lookOf(e.move), tint = look?.tint ?? (/^huodan/.test(e.move) ? 0xff8a2a : e.move === 'bingzhui' ? 0x9fe0ff : e.move === 'muteng' ? 0x8fe07a : 0xfff0b0);
    const loop = look?.kind === 'loop', key = look && this.textures.exists(`jy-${look.art}`) && !this.missing.has(`jy-${look.art}`) ? `jy-${look.art}` : null;
    const from = this.handPos(), to = { x, y }, fly = this.calm ? 200 : Math.max(250, (e.fly || 0.3) * 1000);
    const fit = (img, w) => { const f = img.texture.getSourceImage(); return img.setDisplaySize(w, w * (f.height / f.width)); };
    const orb = this.add.image(from.x, from.y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setScale(loop ? 3.4 : 3).setDepth(D.fx);
    const n = look?.kind === 'volley' ? look.n : 1;
    const bodies = key ? Array.from({ length: n }, () => fit(this.add.image(from.x, from.y, key), look.size).setDepth(D.fx + 0.1)) : [];
    // Its streak (Hanli 10-28: 「剑诀可以出来一把飞剑, 飞一圈打中怪物」): a light behind the sword along its loop, the tail fading.
    const streak = this.add.graphics().setDepth(D.fx - 0.1).setBlendMode(Phaser.BlendModes.ADD), pts = [], keep = loop ? 30 : 12, wide = loop ? 1.5 : 1;
    if (this.calm) orb.setAlpha(0);
    this.sfx.go();
    const place = (k) => {
      if (this.calm) { bodies.forEach((o, i) => o.setPosition(to.x + (i - (n - 1) / 2) * 30, to.y).setAlpha(Math.min(1, k * 2)).setRotation(Math.PI * 0.75)); return; }
      const q = !look || look.kind === 'arc' ? { ...arcAt(from, to, k, look ? 150 : 0), rot: 0 } : loop ? loopAt(from, to, k, { w: W, h: H }) : fanAt(from, to, k, 0, n, 90);
      orb.setPosition(q.x, q.y).setScale((loop ? 3.4 : 3) * (1 - 0.4 * k));
      bodies.forEach((o, i) => {
        const r = look.kind === 'volley' ? fanAt(from, to, k, i, n, 90) : q;
        o.setPosition(r.x, r.y);
        if (look.spin) o.setAngle(k * 900); else if (look.kind === 'arc') o.setAngle(k * 500); else o.setRotation(r.rot + Math.PI / 4);
      });
      pts.push({ x: q.x, y: q.y });
      if (pts.length > keep) pts.shift();
      streak.clear();
      for (let i = 1; i < pts.length; i += 1) {
        const u = i / (pts.length - 1);
        streak.lineStyle(22 * wide * u, tint, 0.8 * u).lineBetween(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
        streak.lineStyle(7 * wide * u, 0xffffff, 0.9 * u).lineBetween(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
      }
      if (this.rand() < 0.7) this.em.burst('spark', 1, q.x, q.y);
    };
    place(0);
    const hit = () => {
      orb.destroy();
      this.tweens.add({ targets: streak, alpha: 0, duration: 260, onComplete: () => streak.destroy() });
      // the sword stays in the beast a beat, then fades
      bodies.forEach((o, i) => { if (loop && !look.spin) { o.setPosition(x, y - 8).setRotation(Math.PI * 0.75); this.tweens.add({ targets: o, alpha: 0, y: y + 6, delay: 320, duration: 420, onComplete: () => o.destroy() }); } else o.destroy(); });
      this.shake(300, 0.018);
      this.flash(140, (tint >> 16) & 255, (tint >> 8) & 255, tint & 255);
      this.em.burst('fire', 40, x, y);
      this.em.burst('stars', 14, x, y);
      const glow = this.add.image(x, y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setScale(6).setDepth(D.fx).setAlpha(0.95);
      this.tweens.add({ targets: glow, alpha: 0, scale: 7.5, duration: 520, onComplete: () => glow.destroy() });
      const ring = this.add.image(x, y, 'ring').setDepth(D.fx).setTint(tint).setScale(0.3);
      this.tweens.add({ targets: ring, scale: 3.8, alpha: 0, duration: 520, onComplete: () => ring.destroy() });
      this.num(x, y - 40, `-${e.dmg}`, 'numGold', big ? 120 : SPELL.num, { rise: 90, life: big ? 1.5 : 1.4 }); // the cast's own damage (castJieyin)
      if (!this.calm && !big) this.slowT = Math.max(this.slowT ?? 0, SPELL.slow); // the slow beat at every impact (a first cast keeps its longer one)
      if (big) { this.em.burst('stars', 30, x, y - 30); this.em.burst('spark', 40, x, y); this.shake(420, 0.024); }
      this.sfx.slam();
    };
    this.tweens.addCounter({ from: 0, to: 1, duration: fly, onUpdate: (tw) => place(tw.getValue()), onComplete: hit });
    this.fact({ t: 'spell', move: e.move, on: e.on });
  }

  // ---------------------------------------------------------------- the loop

  update(_, delta) {
    const real = Math.min(0.05, delta / 1000);
    this.slowT = Math.max(0, (this.slowT ?? 0) - real);
    const dt = this.slowT > 0 ? real * 0.3 : real; // a first cast's slow beat (on_spell)
    this.sealGlow?.update(real);
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
