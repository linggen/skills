// play.js — 守山门's scene: draws what the engine (scripts/games/sadoushou/core.js) holds and turns its events into
// juice. One input: aim left/right (the mouse's x, a drag on touch, A/D · ←/→) and HOLD to scatter (press, Space).
//
// The road is pseudo-3D (view.js): painted ONCE into one ground texture at create (the camera never moves), the ink
// mountains above its horizon. The units are pooled images from one atlas each (豆兵: 撒豆成兵's units.webp; beasts:
// 守墙关's frames), laid out every frame by the engine's numbers and scaled by depth — no physics, no tween per unit,
// and no per-frame depth changes (layers keep a fixed order; a wave's sprites are handed out far to near).
import * as Phaser from 'phaser';
import { newGame, step, aim, faceOf, isGood, opLabel, waveLeft, waveCount, perRank, hordeAll, TOP } from 'sadoushou-core';
import { W, H, CX, Y0, HY, HALF, sOf, yOf, xOf, zOfY, uOfX } from './view.js';
import { makeTextures, makeNumberFont, makeEmitters, rng, canvasTex, rounded } from './fx.js';
import { Hud, WORDS, text } from './hud.js';
import { Sfx } from './sfx.js';

const MAXS = 520;                 // 豆兵 sprites at most (an entity of weight w draws min(w, 4) of them)
const MAXB = 380;                 // beast sprites at most (the red number tells the rest)
const SOLDIER_H = 46;             // a 豆兵's height at the wall (px); smaller up the road
const CLUSTER = [[0, 0], [-9, 4], [9, 4], [0, 9]];
const D = { ground: 0, gate: 10, beast: 20, boss: 25, soldier: 30, rush: 35, wall: 40, man: 41, fx: 3000, num: 3100, hud: 4000 };
const backOut = (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
const quadOut = (t) => t * (2 - t);

export class PlayScene extends Phaser.Scene {
  constructor() { super('play'); }

  init(cfg) {
    this.cfg = cfg;
    this.lang = cfg.lang === 'en' ? 'en' : 'zh';
    this.w = WORDS[this.lang];
  }

  preload() {
    const b = this.cfg.base, sd = `${b}../sadou/art/`, sq = `${b}../shouqiang/art/`, sl = `${b}../shoulu/art/`;
    const sky = this.cfg.level.sky ?? 'cloudy-day';
    this.missing = new Set();
    this.load.on('loaderror', (f) => this.missing.add(f.key));
    this.load.atlas('units', `${sd}units.webp`, `${sd}units.json`);
    for (const k of ['tex-road', 'tex-side']) this.load.image(k, `${sd}${k}.webp`);
    this.load.image('wall', `${sq}wall.webp`);
    this.load.image('xiaoman', `${sq}xiaoman-cast.webp`);
    this.load.image('sky', `${b}../../../worlds/jiuding/art/backdrop/${sky}.webp`);
    // the beasts are 守墙关's frames, shared (doc/game-kit.md: one 野猪 for every kit); `art: "sadou"` = 撒豆成兵's own
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
    this.gateTextures();
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
    this.makeGates();
    this.makePools();
    this.makeWall();
    this.makeBoss();
    this.running = false;
    this.ended = false;
    this.saidAt = -99;
    this.aimX = 0;
    this.holding = false;
    this.hold = 0;
    this.input.on('pointerdown', (p) => { this.sfx.wake(); this.aimX = uOfX(p.worldX); this.down = true; });
    this.input.on('pointerup', () => { this.down = false; });
    this.input.on('pointerupoutside', () => { this.down = false; });
    // a mouse aims as it moves; a finger aims as it drags
    this.input.on('pointermove', (p) => { if (p.isDown || p.pointerType === 'mouse' || !p.wasTouch) this.aimX = uOfX(p.worldX); });
    this.keys = this.input.keyboard?.addKeys('A,D,LEFT,RIGHT,SPACE');
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
    if (on && !this.sys.isPaused()) { this.down = false; this.scene.pause(); }
    else if (!on && this.sys.isPaused()) this.scene.resume();
  }

  // ---------------------------------------------------------------- textures

  /** The gates, drawn once: two posts and a beam around a glowing glass panel the 豆兵 run through. */
  gateTextures() {
    const make = (key, glass, post, beam) => canvasTex(this, key, 160, 150, (c, w, h) => {
      const g = c.createLinearGradient(0, 30, 0, h);
      g.addColorStop(0, glass[0]); g.addColorStop(1, glass[1]);
      c.fillStyle = g; c.fillRect(16, 30, w - 32, h - 34);
      c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 3; c.strokeRect(18, 32, w - 36, h - 38);
      c.fillStyle = post; c.strokeStyle = '#2a1608'; c.lineWidth = 3;
      for (const x of [4, w - 20]) { rounded(c, x, 18, 16, h - 18, 5); c.fill(); c.stroke(); }
      c.fillStyle = beam; rounded(c, 0, 8, w, 22, 8); c.fill(); c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(8, 12, w - 16, 5);
    });
    make('gate-blue', ['rgba(110,210,255,0.62)', 'rgba(40,120,240,0.28)'], '#c0392b', '#2f8a3a');
    make('gate-gold', ['rgba(255,236,120,0.72)', 'rgba(255,170,20,0.32)'], '#c0392b', '#d4a017');
    make('gate-red', ['rgba(255,90,80,0.62)', 'rgba(160,10,30,0.3)'], '#3a2a2a', '#22181a');
    make('gate-fu', ['rgba(200,150,255,0.62)', 'rgba(110,40,200,0.3)'], '#5a2a8a', '#2a1650');
  }

  /** A shared picture that failed to load gets a plain stand-in, so the game still plays. */
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

  /** The ink mountains over the horizon, and the road and its banks in perspective, into ONE texture. */
  ground() {
    const can = this.textures.createCanvas('ground', W, H), c = can.getContext();
    const sky = this.textures.get('sky').getSourceImage();
    // the mountains: the picture's upper part, cover-fitted over the board's top down past the horizon
    const k = W / sky.width, sh = sky.height * k;
    c.drawImage(sky, 0, 0, sky.width, sky.height, 0, HY + 150 - sh * 0.82, W, sh);
    const road = this.textures.get('tex-road').getSourceImage(), side = this.textures.get('tex-side').getSourceImage();
    const top = Math.ceil(yOf(TOP + 30));
    for (let y = top; y < H; y += 1) {
      const z = zOfY(y + 0.5), s = sOf(z);
      // the banks: the forest floor's texture, scrolled by depth, squashed by the same perspective
      const sv = Math.floor(((z * 6) % side.height + side.height) % side.height);
      c.drawImage(side, 0, sv, side.width, 1, CX - W * 1.6 * s - 200, y, W * 3.2 * s + 400, 1);
      c.fillStyle = 'rgba(222,216,192,0.5)'; c.fillRect(0, y, W, 1); // the banks washed toward the paper, so the road leads
      const rv = Math.floor(((z * 9) % road.height + road.height) % road.height);
      const half = HALF * s * 1.06;
      c.drawImage(road, 0, rv, road.width, 1, CX - half, y, half * 2, 1);
    }
    // the road's rims, and a mist that melts the far road into the mountains
    c.strokeStyle = 'rgba(40,28,14,0.55)'; c.lineWidth = 3;
    for (const u of [-1.06, 1.06]) { c.beginPath(); c.moveTo(xOf(u, -6), yOf(-6)); c.lineTo(xOf(u, TOP + 30), yOf(TOP + 30)); c.stroke(); }
    const mist = c.createLinearGradient(0, top - 40, 0, yOf(TOP - 20));
    mist.addColorStop(0, 'rgba(214,218,206,0.95)'); mist.addColorStop(1, 'rgba(214,218,206,0)');
    c.fillStyle = mist; c.fillRect(0, top - 40, W, yOf(TOP - 20) - top + 40);
    // the ink wash over all of it: a pale paper tone, so the cartoon ground sits in the painting
    c.fillStyle = 'rgba(232,226,208,0.16)'; c.fillRect(0, 0, W, H);
    can.refresh();
    this.add.image(0, 0, 'ground').setOrigin(0, 0).setDepth(D.ground);
    const tone = this.cfg.level.tone;
    if (tone) this.add.rectangle(W / 2, H / 2, W, H, Phaser.Display.Color.HexStringToColor(tone.color).color, tone.alpha).setDepth(D.fx - 10);
    this.add.image(W / 2, H / 2, 'vignette').setDisplaySize(W, H).setDepth(D.fx - 9);
  }

  makeWall() {
    const wall = this.add.image(CX, Y0 - 14, 'wall').setOrigin(0.5, 0).setDepth(D.wall);
    wall.setScale((W + 60) / wall.width);
    this.wall = wall;
    this.man = this.add.image(CX, Y0 + 68, 'xiaoman').setOrigin(0.5, 0.9).setDepth(D.man);
    this.man.setScale(118 / this.man.height);
    this.manBase = this.man.scaleX;
    this.aimMark = this.add.image(CX, Y0 - 6, 'ring').setDepth(D.wall - 1).setTint(0xffe36b).setAlpha(0.6).setDisplaySize(64, 22);
  }

  // ---------------------------------------------------------------- the gates

  makeGates() {
    this.gates = [];
    for (const row of this.g.rows) {
      for (const cell of row.cells) {
        const z = row.z, s = sOf(z), x = xOf((cell.x[0] + cell.x[1]) / 2, z), y = yOf(z);
        const wpx = (cell.x[1] - cell.x[0]) * HALF * s * 0.94;
        const img = this.add.image(x, y + 4 * s, 'gate-blue').setOrigin(0.5, 1).setDepth(D.gate).setDisplaySize(wpx, wpx * 1.05);
        const label = this.add.bitmapText(x, y - img.displayHeight * 0.5, 'numGood', '', Math.round(Math.max(20, Math.min(wpx * 0.62, 24 + 34 * s)) * (cell.n >= 10 ? 1.25 : 1))).setOrigin(0.5).setDepth(D.gate + 0.5);
        const ring = cell.cool ? this.add.graphics().setDepth(D.gate + 0.6) : null;
        const gt = { row, cell, img, label, ring, x, y, s, punch: 0, add: 0, numAt: 0, face: null };
        this.dress(gt, faceOf(cell, 0));
        this.gates.push(gt);
        if (cell.alt && !this.saidFlip) this.saidFlip = true;
        if (cell.cool && !this.saidRich) this.saidRich = true;
      }
    }
  }

  /** A gate's look by its face: blue for a few more, gold for a big one, violet for a 符门, red for a trap. */
  dress(gt, f) {
    const key = `${f.op}${f.n}`;
    if (gt.face === key) return;
    gt.face = key;
    const good = isGood(f), big = good && f.op === '+' && f.n >= 10;
    gt.img.setTexture(!good ? 'gate-red' : gt.cell.alt ? 'gate-fu' : big ? 'gate-gold' : 'gate-blue');
    gt.label.setFont(!good ? 'numBad' : big ? 'numGold' : 'numGood').setText(opLabel(f).replace('−', '-').replace('×', 'x').replace('÷', '/'));
  }

  drawGates(dt) {
    const t = this.g.t;
    for (const gt of this.gates) {
      this.dress(gt, faceOf(gt.cell, t));
      gt.punch = Math.max(0, gt.punch - dt * 5);
      const wob = 1 + Math.sin(this.time.now / 160 + gt.x) * 0.03;
      gt.label.setScale((1 + gt.punch * 0.45) * wob);
      const cool = gt.cell.coolT > 0;
      gt.img.setAlpha(cool ? 0.6 : 1);
      gt.label.setAlpha(cool ? 0.7 : 1);
      if (gt.ring) {
        gt.ring.clear();
        if (cool) {
          const f = 1 - gt.cell.coolT / gt.cell.cool, r = 18 + 14 * gt.s;
          gt.ring.lineStyle(5, 0xffe36b, 0.9).beginPath().arc(gt.x, gt.label.y, r, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2).strokePath();
        }
      }
      // the small rewards: one rising number a gate at most every 120 ms, summing what passed it
      if (gt.add && this.time.now - gt.numAt > 120) {
        gt.numAt = this.time.now;
        const big = gt.add >= 10;
        this.num(gt.x + (this.rand() - 0.5) * 20, gt.label.y - 20, `+${gt.add}`, big ? 'numGold' : 'numGood', Math.round((big ? 46 : 30) + 26 * gt.s), { rise: 40 + 40 * gt.s, life: 0.6 });
        if (big) { this.em.burst('gold', 24, gt.x, gt.label.y); this.sfx.good(); } else this.sfx.pop();
        gt.add = 0;
      }
    }
  }

  // ---------------------------------------------------------------- pools: 豆兵, beasts, ghosts, numbers

  makePools() {
    const f = this.textures.getFrame('units', 'soldier-1');
    this.manScale = SOLDIER_H / f.height;
    this.run2 = this.textures.get('units').has('soldier-2') ? 'soldier-2' : 'soldier-1';
    this.men = Array.from({ length: MAXS }, () => this.add.image(0, 0, 'units', 'soldier-1').setOrigin(0.5, 0.92).setDepth(D.soldier).setVisible(false));
    this.beasts = Array.from({ length: MAXB }, () => { const s = this.add.image(0, 0, 'units', 'bean').setOrigin(0.5, 0.9).setDepth(D.beast).setVisible(false); s.key = null; return s; });
    this.srcH = new Map();
    this.wavePills = Array.from({ length: 5 }, () => ({
      pill: this.add.image(0, 0, 'pill-red').setDepth(D.num).setVisible(false),
      num: this.add.bitmapText(0, 0, 'numBig', '', 44).setOrigin(0.5).setDepth(D.num + 1).setVisible(false),
    }));
    this.ghosts = [];
    this.nums = [];
  }

  texH(key) {
    if (!this.srcH.has(key)) this.srcH.set(key, this.textures.get(key).getSourceImage().height || 100);
    return this.srcH.get(key);
  }

  drawSoldiers() {
    const s = this.g.s, t = this.time.now / 1000;
    let k = 0;
    for (let i = 0; i < s.n && k < MAXS; i += 1) {
      const z = s.z[i], sc = sOf(z), x = xOf(s.x[i], z), y = yOf(z);
      const fr = ((Math.floor(t * 10 + s.id[i] * 0.37)) & 1) ? this.run2 : 'soldier-1';
      const c = Math.min(4, s.w[i]);
      for (let j = 0; j < c && k < MAXS; j += 1, k += 1) {
        const m = this.men[k], [ox, oy] = CLUSTER[j];
        m.setVisible(true).setFrame(fr).setPosition(x + ox * sc, y - oy * sc).setScale(this.manScale * sc);
      }
    }
    for (; k < MAXS && this.men[k].visible; k += 1) this.men[k].setVisible(false);
    this.shownMen = k;
  }

  /** The waves: ranks across their span from the front back, as many as the budget shows, handed out far to near. */
  drawBeasts() {
    const g = this.g, t = this.time.now / 1000, kit = this.cfg.kit;
    const waves = [...g.live].sort((a, b) => b.front - a.front);
    const total = waves.reduce((s, w) => s + waveCount(w), 0) || 1;
    let k = 0, pi = 0;
    for (const wv of waves) {
      const left = waveLeft(wv), n = left.reduce((s, u) => s + u.n, 0);
      const v = Math.min(n, Math.max(8, Math.floor((MAXB * n) / total)), MAXB - k);
      const per = perRank(wv.span, this.cfg.level), gap = this.cfg.level.rank ?? 2.2;
      const kinds = [...left].reverse(); // the front rank first
      const kindAt = (j) => { let c = 0; for (const u of kinds) { c += u.n; if (j < c) return u.b; } return kinds.at(-1).b; };
      for (let j = v - 1; j >= 0; j -= 1, k += 1) { // far ranks first, so the near ones draw over them
        const r = Math.floor(j / per), col = j % per;
        const jit = ((j * 2654435761) % 1000) / 1000 - 0.5;
        const z = wv.front + r * gap + jit * 0.8;
        const u = wv.span[0] + ((col + 0.5 + jit * 0.3) / per) * (wv.span[1] - wv.span[0]);
        const b = kindAt(j), kb = kit.beasts[b];
        const key = `${b}-${kb.frames[Math.floor(t * 6 + j * 0.37) % kb.frames.length]}`;
        const sp = this.beasts[k];
        if (sp.key !== key) { sp.setTexture(key); sp.key = key; }
        const sc = sOf(z), bob = kb.fly ? Math.sin(t * 7 + j) * 10 * sc + 16 * sc : Math.abs(Math.sin(t * 8 + j)) * 3 * sc;
        sp.setVisible(true).setPosition(xOf(u, z), yOf(z) - bob).setScale((kb.size * sc) / this.texH(key));
      }
      // its number over its back rank
      const p = this.wavePills[pi++];
      if (p) {
        const zb = wv.front + Math.ceil(v / per) * gap + 3, sc = sOf(zb), x = xOf((wv.span[0] + wv.span[1]) / 2, zb), y = yOf(zb) - 70 * sc - 26;
        p.pill.setVisible(true).setPosition(x, y).setScale((0.55 + String(n).length * 0.2) * (0.6 + sc * 0.5), 0.6 + sc * 0.5);
        p.num.setVisible(true).setPosition(x, y - 3).setText(String(n)).setScale(0.6 + sc * 0.5);
      }
    }
    for (; k < MAXB && this.beasts[k].visible; k += 1) this.beasts[k].setVisible(false);
    for (; pi < this.wavePills.length; pi += 1) { this.wavePills[pi].pill.setVisible(false); this.wavePills[pi].num.setVisible(false); }
    this.shownBeasts = k;
  }

  /** A short-lived picture flung and fading: a 豆兵 knocked aside, a beast struck down. */
  ghost(key, frame, x, y, sc, { vx = 0, vy = -300, spin = 0, life = 0.55 } = {}) {
    let gh = this.ghosts.find((o) => !o.live);
    if (!gh) {
      if (this.ghosts.length > 90) return;
      gh = { s: this.add.image(0, 0, 'units', 'soldier-1').setOrigin(0.5, 0.8).setDepth(D.fx - 1) };
      this.ghosts.push(gh);
    }
    if (frame) gh.s.setTexture(key, frame); else gh.s.setTexture(key);
    Object.assign(gh, { live: true, vx, vy, spin, life, t: 0 });
    gh.s.setVisible(true).setPosition(x, y).setScale(sc).setAlpha(1).setRotation(0);
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
    this.bossShadow = this.add.image(0, 0, 'shadow').setAlpha(0.6).setDepth(D.gate - 1).setVisible(false);
    this.bossBar = this.add.graphics().setDepth(D.num);
    this.bossNum = this.add.bitmapText(0, 0, 'numSmall', '', 26).setOrigin(0.5).setDepth(D.num + 1).setVisible(false);
    this.bossLabel = text(this, 0, 0, this.bossName, 20, { color: '#ffd0c0' }).setDepth(D.num + 1).setVisible(false);
    this.strip = this.add.graphics().setDepth(D.gate - 0.5).setBlendMode(Phaser.BlendModes.ADD);
    this.bossLag = 0;
  }

  drawBoss(dt) {
    const bs = this.g.boss;
    this.strip.clear();
    if (!bs?.on) return;
    const t = this.time.now / 1000, sc = sOf(bs.z), x = xOf(bs.x, bs.z), y = yOf(bs.z);
    const kb = this.cfg.kit.beasts[bs.beast];
    const rush = bs.mode === 'rush';
    this.bossHitT = Math.max(0, (this.bossHitT ?? 0) - dt);
    const key = this.bossHitT > 0 || this.ended ? this.bossHitKey : this.bossKey;
    if (this.boss.texture.key !== key) this.boss.setTexture(key);
    const breathe = Math.sin(t * 3) * 0.02, squash = bs.mode === 'warn' ? 0.06 * (1 - bs.modeT / bs.charge.warn) : 0;
    const h = (kb.size * sc) / this.texH(key);
    this.boss.setVisible(!this.won).setPosition(x + (this.jolt ?? 0), y).setScale(h * (1 + breathe + squash), h * (1 - breathe - squash * 1.5));
    this.boss.setDepth(rush || bs.z < 14 ? D.rush : D.boss);
    this.jolt = (this.jolt ?? 0) * 0.8;
    this.bossShadow.setVisible(!this.won).setPosition(x, y).setDisplaySize(kb.size * sc * 0.9, kb.size * sc * 0.22);
    // the charge's aura: lightning-blue light around it while it rushes
    this.aura.setVisible(rush && !this.calm).setPosition(x, y - kb.size * sc * 0.45).setDepth(this.boss.depth - 0.1)
      .setScale(kb.size * sc / 18 * (1 + Math.sin(t * 40) * 0.08)).setAlpha(0.55 + Math.sin(t * 33) * 0.2);
    if (rush && !this.calm && this.rand() < 0.6) this.em.burst('spark', 3, x + (this.rand() - 0.5) * kb.size * sc * 0.8, y - this.rand() * kb.size * sc * 0.8);
    // the line it will rush down, shown on the road while it gathers itself
    if (bs.mode === 'warn' || rush) {
      const a = bs.line - bs.charge.half, b = bs.line + bs.charge.half, z0 = bs.charge.to ?? 6, z1 = bs.z;
      const pulse = 0.28 + Math.abs(Math.sin(t * (rush ? 6 : 14))) * 0.3;
      this.strip.fillStyle(0xff3a2a, pulse).fillPoints([
        { x: xOf(a, z0), y: yOf(z0) }, { x: xOf(b, z0), y: yOf(z0) }, { x: xOf(b, z1), y: yOf(z1) }, { x: xOf(a, z1), y: yOf(z1) }], true);
      for (let z = z0 + 4; z < z1; z += 9) { // chevrons pointing down the line, at the wall
        const cz = z - ((t * 30) % 9), s2 = sOf(cz), cx = xOf(bs.line, cz), cy = yOf(cz);
        this.strip.lineStyle(Math.max(2, 6 * s2), 0xffd0a0, 0.8).beginPath().moveTo(cx - 28 * s2, cy - 14 * s2).lineTo(cx, cy).lineTo(cx + 28 * s2, cy - 14 * s2).strokePath();
      }
    }
    // the HP bar over its head
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

  fact(e) { try { this.cfg.onEvent?.(e); } catch { /* the host's trouble, not the game's */ } }

  handle(e) { this[`on_${e.t}`]?.(e); }

  on_gate(e) {
    const gt = this.gates.find((o) => o.row.i === e.row && o.cell.k === e.cell);
    if (!gt) return;
    gt.punch = 1;
    if (e.dies) {
      if (this.rand() < 0.4) { this.em.burst('bad', 3, xOf(e.x, e.z), yOf(e.z) - 10); this.sfx.bad(); }
      return;
    }
    gt.add += e.add;
    if (e.add) this.hud.punch();
  }

  on_strike(e) {
    this.strikes = (this.strikes ?? 0) + 1;
    if (this.strikes > 6) return; // the rest of this frame's blows are in the numbers
    const sc = sOf(e.z), x = xOf(e.x, e.z), y = yOf(e.z) - 20 * sc;
    this.em.burst('spark', 3, x, y);
    if (this.rand() < 0.5) this.ghost('units', 'soldier-1', x, y, this.manScale * sc, { vx: (this.rand() - 0.5) * 160, vy: -180 - this.rand() * 160, spin: (this.rand() - 0.5) * 14, life: 0.4 });
    if (e.killed) {
      const wv = this.g.live.find((w) => w.i === e.wave);
      const b = wv ? [...waveLeft(wv)].reverse().find((u) => u.n > 0)?.b ?? wv.units.at(-1).b : null;
      if (b) {
        const kb = this.cfg.kit.beasts[b], key = `${b}-${kb.hit}`;
        this.ghost(key, null, x, y + 10 * sc, (kb.size * sc) / this.texH(key), { vx: (this.rand() - 0.5) * 200, vy: -260 - this.rand() * 200, spin: (this.rand() - 0.5) * 10, life: 0.5 });
        this.em.burst('poof', 2, x, y);
      }
      this.sfx.hit();
    }
  }

  on_wave(e) {
    if (e.i > 0) { this.hud.banner(this.w.wave, { color: '#ffb0a0', y: 300 }); this.say('wave'); }
    this.sfx.thud();
    this.fact({ t: 'wave', beasts: e.beasts });
    if (e.i === 0 && this.saidRich) this.time.delayedCall(4200, () => this.say(this.saidFlip ? 'flip' : 'rich', true));
  }

  on_breach(e) {
    this.shake(120, 0.006);
    this.em.burst('dust', 6, CX + (this.rand() - 0.5) * 380, Y0);
    this.em.burst('debris', 3, CX + (this.rand() - 0.5) * 380, Y0);
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

  on_charge(e) {
    this.shake(260, 0.014);
    this.sfx.slam();
    this.fact({ t: 'charge', x: e.x });
  }

  on_charge_end(e) {
    const z = this.g.boss.charge.to ?? 6;
    this.shake(360, 0.02);
    this.flash(120, 190, 225, 255);
    this.em.burst('dust', 30, xOf(e.x, z), yOf(z));
    this.em.burst('debris', 14, xOf(e.x, z), yOf(z));
    if (this.knocked) { this.num(xOf(e.x, z), yOf(z) - 120, `-${this.knocked}`, 'numBad', 60, { rise: 60 }); this.knocked = 0; }
  }

  on_knock(e) {
    this.knocked = (this.knocked ?? 0) + e.w;
    const sc = sOf(e.z), x = xOf(e.x, e.z), y = yOf(e.z);
    const dir = e.x < this.g.boss.line ? -1 : 1;
    for (let i = 0; i < Math.min(3, e.w); i += 1) this.ghost('units', 'soldier-1', x, y, this.manScale * sc, { vx: dir * (220 + this.rand() * 260), vy: -320 - this.rand() * 260, spin: dir * 12, life: 0.7 });
    this.sfx.hit();
  }

  on_bosshit(e) {
    this.bossHitT = 0.08;
    this.jolt = (this.rand() - 0.5) * 8;
    this.dmgSum = (this.dmgSum ?? 0) + e.d;
    const bs = this.g.boss, sc = sOf(bs.z), x = xOf(bs.x, bs.z), y = yOf(bs.z);
    if (this.rand() < 0.4) this.em.burst('spark', 4, x + (this.rand() - 0.5) * 200 * sc, y - this.rand() * 200 * sc);
    if (this.time.now - (this.dmgAt ?? 0) > 150) {
      this.dmgAt = this.time.now;
      this.num(x + (this.rand() - 0.5) * 160 * sc, y - 220 * sc - this.rand() * 40, `-${this.dmgSum}`, 'numBig', 34 + Math.min(30, this.dmgSum), { rise: 70, life: 0.8 });
      this.dmgSum = 0;
      this.sfx.hit();
    }
  }

  on_end(e) {
    if (this.ended) return;
    this.ended = true;
    this.down = false;
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

  // ---------------------------------------------------------------- the loop

  input_(dt) {
    const k = this.keys;
    if (k) {
      const dir = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
      if (dir) this.aimX = Phaser.Math.Clamp(this.aimX + dir * 1.8 * dt, -1, 1);
    }
    this.holding = Boolean(this.down || k?.SPACE.isDown);
  }

  drawMan(dt) {
    const tx = xOf(Phaser.Math.Clamp(this.aimX, -0.96, 0.96), 0);
    this.man.x += (tx - this.man.x) * Math.min(1, dt * 14);
    this.aimMark.setPosition(tx, Y0 - 4).setAlpha(this.holding ? 0.85 : 0.4);
    // the scatter: his arm pumps and beans spray from his hand while he holds
    const on = this.holding && this.running && !this.ended;
    const pump = on ? Math.abs(Math.sin(this.time.now / 70)) * 0.06 : 0;
    this.man.setScale(this.manBase * (1 + pump), this.manBase * (1 - pump * 0.6));
    if (on && (this.beanT = (this.beanT ?? 0) + dt) > 0.08) { this.beanT = 0; this.em.burst('beans', 2, this.man.x + 26, this.man.y - 100); }
  }

  update(_, delta) {
    const dt = Math.min(0.05, delta / 1000);
    const g = this.g;
    this.input_(dt);
    this.strikes = 0;
    if (this.running && !this.ended) {
      aim(g, this.aimX, this.holding);
      step(g, dt);
      for (const e of g.events) this.handle(e);
      g.events.length = 0;
    }
    this.drawMan(dt);
    this.drawGates(dt);
    this.drawBeasts();
    this.drawSoldiers();
    this.drawBoss(dt);
    this.drawGhosts(dt);
    this.drawNums(dt);
    this.hud.tick(dt, { horde: hordeAll(g), count: g.count, wall: g.wall.hp, wallMax: g.wall.max });
    if (this.hud.fps && (this.fpsT = (this.fpsT ?? 0) + dt) > 0.25 && !(this.fpsT = 0)) {
      this.hud.fps.setText(`FPS ${this.game.loop.actualFps.toFixed(0)} · 豆${this.shownMen ?? 0}/${g.count} · 兽${this.shownBeasts ?? 0}`);
    }
  }

  /** The host's command (doc/game-kit.md § commands in): a line over the field. */
  sayLine(who, line) { if (line) this.hud.say(line); }
}
