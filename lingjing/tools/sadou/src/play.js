// play.js — 撒豆成兵's scene: draws what the engine (scripts/games/sadou/core.js) holds and turns its events into
// juice. One input: drag left/right (A/D, ←/→ on a desk) steers the crowd.
//
// Speed: the crowd is up to MAXV sprites from ONE atlas texture (units.webp), so they batch into a draw call or a few;
// their positions ease toward packed slots (a sunflower spiral) — no physics. Deaths, charges and pops are pooled
// ghosts and pooled bitmap numbers, updated by hand (no tween per soldier).
import * as Phaser from 'phaser';
import { newGame, step, steer, crowdHalf, hazardSpan, hordeLeft, hordeCount, gatesAt, W, H, ROAD, CROWD_Y, SPACING } from 'sadou-core';
import { makeTextures, makeNumberFont, makeEmitters, rng, FONT } from './fx.js';
import { Hud, WORDS } from './hud.js';
import { Sfx } from './sfx.js';

const MAXV = 300;                 // soldiers drawn at most (the count goes higher; the number tells it)
const FRONT = 34;                 // a track item sits this far ahead of the crowd's centre when the crowd meets it
const GOLD = Math.PI * (3 - Math.sqrt(5));
const SOLDIER_H = 34;             // a bean soldier's drawn height (px on the 540×960 board)
const D = { ground: 0, road: 1, edge: 2, decal: 4, world: 10, light: 2900, fx: 3000, num: 3100, hud: 4000 };
const depthOf = (y) => D.world + y * 0.01;
const backOut = (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
const quadOut = (t) => t * (2 - t);

const roadX = (x) => ROAD.cx + x * ROAD.half;
// the packed crowd's places (a sunflower spiral, squashed for the 3/4 view), worked out once — no per-frame arrays
const SLOTS = Array.from({ length: MAXV }, (_, i) => {
  const r = SPACING * Math.sqrt(i + 0.5), a = i * GOLD;
  return [r * Math.cos(a), r * Math.sin(a) * 0.72];
});
const slot = (i) => SLOTS[Math.min(i, MAXV - 1)];

export class PlayScene extends Phaser.Scene {
  constructor() { super('play'); }

  init(cfg) {
    this.cfg = cfg;
    this.lang = cfg.lang === 'en' ? 'en' : 'zh';
    this.w = WORDS[this.lang];
  }

  preload() {
    const art = `${this.cfg.base}art/`, sq = `${this.cfg.base}../shouqiang/art/`, sl = `${this.cfg.base}../shoulu/art/`;
    this.missing = new Set();
    this.load.on('loaderror', (f) => this.missing.add(f.key));
    this.load.atlas('units', `${art}units.webp`, `${art}units.json`);
    for (const k of ['gate-good', 'gate-bad', 'tex-road', 'tex-side', 'edge']) this.load.image(k, `${art}${k}.webp`);
    // the beasts, the boss and 小满 are 守墙关's frames, shared (doc/game-kit.md: one 野猪 for every kit)
    // (a beast with `art: "sadou"` is this game's own: the 黑松岭 boss)
    for (const [b, k] of Object.entries(this.cfg.kit.beasts)) {
      if (b.startsWith('_')) continue;
      for (const f of [...k.frames, k.hit]) this.load.image(`${b}-${f}`, `${k.art === 'sadou' ? art : sq}${b}-${f}.webp`);
    }
    this.load.image('xiaoman', `${sq}xiaoman-cast.webp`);
    this.load.image('yy', `${sl}yinyue.webp`);
    this.load.json('yy-meta', `${sl}yinyue.json`);
    const bar = this.add.graphics();
    this.load.on('progress', (p) => {
      bar.clear().fillStyle(0x000000, 0.4).fillRoundedRect(120, 470, 300, 20, 10).fillStyle(0xffd34d, 1).fillRoundedRect(122, 472, 296 * p, 16, 8);
    });
    this.load.on('complete', () => bar.destroy());
  }

  create() {
    const { kit, level, seed, reducedMotion } = this.cfg;
    this.calm = Boolean(reducedMotion);
    this.cameras.main.setZoom(this.cfg.zoom ?? 1).centerOn(W / 2, H / 2);
    this.g = newGame(kit, level, { seed });
    this.rand = rng(seed);
    makeTextures(this);
    this.standIns();
    this.frames();
    makeNumberFont(this, 'numBig', { fill: ['#fffbe0', '#ffd23f', '#ff8a00'], stroke: '#4a1500', size: 64, line: 13 });
    makeNumberFont(this, 'numGood', { fill: ['#ffffff', '#d6f6ff', '#7fd8ff'], stroke: '#0b2556', size: 60, line: 12 });
    makeNumberFont(this, 'numBad', { fill: ['#ffffff', '#ffd0c8', '#ff6a5a'], stroke: '#4a0610', size: 60, line: 12 });
    makeNumberFont(this, 'numSmall', { fill: ['#ffffff', '#ffffff'], stroke: '#1b0d05', size: 36, line: 8 });
    this.em = makeEmitters(this, D.fx, this.calm ? 0.45 : 1);
    this.sfx = new Sfx();
    this.hud = new Hud(this, { depth: D.hud });   // first: it makes the pill textures the crowd's count wears
    this.world();
    this.makeCrowd();
    this.ghosts = [];
    this.nums = [];
    this.vis = new Map();         // track item index → what draws it
    this.hold = 0;                // hit-stop
    this.running = false;
    this.ended = false;
    this.shown = 0;               // soldiers on the ground (0 until the beans land)
    this.saidAt = -99;
    this.target = 0;
    this.keys = this.input.keyboard?.addKeys('A,D,LEFT,RIGHT');
    this.input.on('pointerdown', (p) => { this.sfx.wake(); this.drag = { x: p.worldX, t: this.target }; });
    this.input.on('pointerup', () => { this.drag = null; });
    this.input.on('pointerupoutside', () => { this.drag = null; });
    this.input.on('pointermove', (p) => {
      if (!this.drag || !p.isDown) return;
      this.target = Phaser.Math.Clamp(this.drag.t + ((p.worldX - this.drag.x) / ROAD.half) * 1.3, -1, 1);
    });
    this.input.keyboard?.on('keydown', () => this.sfx.wake());
    this.events.once('shutdown', () => { this.sfx.close(); this.offShell?.(); this.offShell = null; });
    // In the one shell (games/shell.js): the shell's bar pauses it and its foot shows the result — nothing twice.
    if (this.cfg.shell) {
      this.offShell = this.cfg.shell.onPause?.((on) => this.setPaused(on));
      // paused before the scene stood up: pause once it runs (Phaser sets RUNNING after create, over a pause inside it)
      if (this.cfg.shell.paused?.()) this.events.once('create', () => this.setPaused(Boolean(this.cfg.shell.paused?.())));
    }
    // `held` (the shell's lead card is up): the road is drawn and stands still behind it; `release()` starts the lead-in.
    this.held = Boolean(this.cfg.hold?.on);
    if (!this.held) this.leadIn();
    this.fact({ t: 'start', level: level.id });
  }

  leadIn() {
    const { level } = this.cfg;
    this.hud.lead(level.lead, level.leadSec ?? 4.5, level.countdown ?? 3, {
      onBig: () => this.scatter(),
      onTick: () => this.sfx.tick(),
      go: () => this.go(),
    });
  }

  release() {
    if (!this.held) return;
    this.held = false;
    this.leadIn();
  }

  /** A shared or painted picture that failed to load gets a plain stand-in, so the game still plays. */
  standIns() {
    const fill = (key, w, h, col) => {
      if (this.textures.exists(key) && !this.missing.has(key)) return;
      if (this.textures.exists(key)) this.textures.remove(key);
      const t = this.textures.createCanvas(key, w, h), c = t.getContext();
      c.fillStyle = col; c.strokeStyle = '#222'; c.lineWidth = 4;
      c.beginPath(); c.ellipse(w / 2, h / 2, w / 2 - 3, h / 2 - 3, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      t.refresh();
    };
    for (const [b, k] of Object.entries(this.cfg.kit.beasts)) {
      if (b.startsWith('_')) continue;
      for (const f of [...k.frames, k.hit]) fill(`${b}-${f}`, 120, 120, '#7a4a2a');
    }
    for (const k of ['gate-good', 'gate-bad']) fill(k, 400, 200, k === 'gate-good' ? '#3aa0ff' : '#d02030');
    for (const k of ['tex-road', 'tex-side', 'edge']) fill(k, 64, 64, k === 'tex-side' ? '#3f7a2c' : '#9c8a70');
    fill('xiaoman', 200, 260, '#eee');
    if (this.missing.has('units') || !this.textures.exists('units')) {
      if (this.textures.exists('units')) this.textures.remove('units');
      const t = this.textures.createCanvas('units', 512, 128), c = t.getContext();
      const draw = (x, col) => { c.fillStyle = col; c.strokeStyle = '#222'; c.lineWidth = 4; c.beginPath(); c.arc(x + 32, 40, 26, 0, 7); c.fill(); c.stroke(); };
      ['#ffd23f', '#ffc12f', '#ffe066', '#2f7a3a', '#888', '#c96', '#7a5', '#543'].forEach((col, i) => draw(i * 64, col));
      ['soldier-1', 'soldier-2', 'bean', 'pine', 'rock', 'lantern', 'log', 'spikes'].forEach((n, i) => t.add(n, 0, i * 64, 0, 64, 90));
      t.refresh();
    }
  }

  /** Named frames cut from whole pictures: the boss's face for the road bar, 银月's portrait for her bubble. */
  frames() {
    // (a frame added to a texture would become its default frame, so the face is a texture of its own)
    const { beast } = this.cfg.level.boss, kb = this.cfg.kit.beasts[beast];
    const src = this.textures.get(`${beast}-${kb.frames[0]}`).getSourceImage();
    const big = src.width > 300;
    const [cx, cy, cw, ch] = kb.face ?? [0.45, 0.38, 0.4, 0.36]; // the face's box in the frame (fractions)
    const [fx, fy, fw, fh] = big ? [src.width * cx, src.height * cy, src.width * cw, src.height * ch] : [0, 0, src.width, src.height];
    const face = this.textures.createCanvas('boss-face', Math.round(fw), Math.round(fh));
    face.getContext().drawImage(src, fx, fy, fw, fh, 0, 0, fw, fh);
    face.refresh();
    const meta = this.cache.json.get('yy-meta');
    if (meta && this.textures.exists('yy') && !this.missing.has('yy')) {
      const [cw, ch] = meta.cell, [x, y] = meta.sheets.yinyue['idle-1'];
      this.textures.get('yy').add('idle-1', 0, x, y, cw, ch);
    }
  }

  // ---------------------------------------------------------------- the world: ground, road, scenery

  world() {
    // the forest floor only where the road isn't (two strips, not a full-screen layer under it: fill-rate)
    const sw = W / 2 - ROAD.half + 10, sideK = (W / 2 / this.textures.get('tex-side').getSourceImage().width) * 1.15;
    const side = this.add.tileSprite(sw / 2, H / 2, sw, H, 'tex-side').setDepth(D.ground).setTileScale(sideK);
    const sideR = this.add.tileSprite(W - sw / 2, H / 2, sw, H, 'tex-side').setDepth(D.ground).setTileScale(sideK).setFlipX(true);
    const rw = ROAD.half * 2 + 24;
    const road = this.add.tileSprite(ROAD.cx, H / 2, rw, H, 'tex-road').setDepth(D.road);
    road.setTileScale((rw / road.texture.getSourceImage().width) * 0.62);
    const ew = 64, edgeImg = this.textures.get('edge').getSourceImage();
    const es = ew / edgeImg.width;
    const edgeL = this.add.tileSprite(ROAD.cx - ROAD.half - 8, H / 2, ew, H, 'edge').setDepth(D.edge).setTileScale(es);
    const edgeR = this.add.tileSprite(ROAD.cx + ROAD.half + 8, H / 2, ew, H, 'edge').setDepth(D.edge).setTileScale(es).setFlipX(true);
    this.ground = [[side, 0.95], [sideR, 0.95], [road, 1], [edgeL, 1], [edgeR, 1]];
    // the road's own shade: darker at its rims, a warm light down its middle
    const shade = this.add.graphics().setDepth(D.edge - 0.5);
    for (let i = 0; i < 10; i += 1) {
      shade.fillStyle(0x1a1208, 0.05).fillRect(ROAD.cx - ROAD.half + i * 4, 0, 6, H).fillRect(ROAD.cx + ROAD.half - i * 4 - 6, 0, 6, H);
    }
    // the vignette that frames the play (one normal-blend quad; no additive light shafts — fill-rate)
    this.add.image(W / 2, H / 2, 'vignette').setDisplaySize(W, H).setDepth(D.light + 1);
    // the level's light (night, mist, dusk): one tinted quad over the world, under the vignette and the HUD
    const tone = this.cfg.level.tone;
    if (tone) this.add.rectangle(W / 2, H / 2, W, H, Phaser.Display.Color.HexStringToColor(tone.color).color, tone.alpha).setDepth(D.light);
    // scenery along both sides: seeded, so the road is the same every play
    this.props = [];
    const r = rng(`sadou-props|${this.cfg.level.id}`);
    const end = this.cfg.level.boss.at + 1400;
    const mix = this.cfg.level.props ?? { pine: 0.62, rock: 0.24, lantern: 0.14 };
    for (let at = -400; at < end; at += 70 + r() * 70) {
      for (const sideSign of [-1, 1]) {
        if (r() < 0.35) continue;
        const roll = r();
        const kind = roll < mix.pine ? 'pine' : roll < mix.pine + mix.rock ? 'rock' : 'lantern';
        const near = kind === 'lantern' ? 16 + r() * 10 : kind === 'rock' ? 10 + r() * 40 : 20 + r() * 60;
        const x = sideSign < 0 ? ROAD.cx - ROAD.half - near : ROAD.cx + ROAD.half + near;
        const h = kind === 'pine' ? 90 + r() * 60 : kind === 'rock' ? 34 + r() * 24 : 52;
        this.props.push({ at: at + r() * 40, x, kind, h, flip: r() < 0.5 });
      }
    }
    this.propPool = [];
    this.propLive = new Map();
    // 小满, who scattered the beans: he stands behind the crowd and the road leaves him behind
    this.xiaoman = this.add.image(W / 2, CROWD_Y + 150, 'xiaoman').setOrigin(0.5, 0.85);
    this.xiaoman.setScale(120 / this.xiaoman.height).setDepth(depthOf(CROWD_Y + 150));
  }

  ySc(at) { return CROWD_Y - FRONT - (at - this.g.dist); }

  drawWorld(dt) {
    const d = this.g.dist;
    for (const [ts, k] of this.ground) ts.tilePositionY = -(d * k) / ts.tileScaleY;
    // props: live while on screen, pooled
    for (const [i, p] of this.props.entries()) {
      const y = this.ySc(p.at);
      const on = y > -160 && y < H + 160;
      let s = this.propLive.get(i);
      if (on && !s) {
        s = this.propPool.pop() ?? this.add.image(0, 0, 'units', 'pine').setOrigin(0.5, 0.92);
        s.setFrame(p.kind).setVisible(true).setFlipX(p.flip);
        s.setScale(p.h / s.frame.height);
        this.propLive.set(i, s);
      } else if (!on && s) {
        s.setVisible(false);
        this.propPool.push(s);
        this.propLive.delete(i);
        continue;
      }
      if (s) s.setPosition(p.x, y).setDepth(depthOf(y));
    }
    if (this.xiaoman.visible) {
      this.xiaoman.y += this.running ? this.g.speed * dt * (this.g.phase === 'run' ? 1 : 0) : 0;
      this.xiaoman.setDepth(depthOf(this.xiaoman.y));
      if (this.xiaoman.y > H + 200) this.xiaoman.setVisible(false);
    }
  }

  // ---------------------------------------------------------------- the crowd

  makeCrowd() {
    this.shadow = this.add.image(ROAD.cx, CROWD_Y + 6, 'shadow').setDepth(D.decal).setAlpha(0.7);
    this.men = [];
    const f = this.textures.getFrame('units', 'soldier-1');
    this.manScale = SOLDIER_H / f.height;
    this.run2 = this.textures.get('units').has('soldier-2') ? 'soldier-2' : 'soldier-1';
    for (let i = 0; i < MAXV; i += 1) {
      const s = this.add.image(ROAD.cx, CROWD_Y, 'units', 'soldier-1').setOrigin(0.5, 0.92).setScale(this.manScale).setVisible(false);
      s.phase = this.rand() * 2;
      s.pop = 0;
      this.men.push(s);
    }
    this.vis0 = 0;
    this.pill = this.add.image(ROAD.cx, CROWD_Y - 70, 'pill-blue').setDepth(D.num).setVisible(false);
    this.pillNum = this.add.bitmapText(ROAD.cx, CROWD_Y - 72, 'numSmall', '0', 34).setOrigin(0.5).setDepth(D.num + 1).setVisible(false);
    this.pillPunch = 0;
  }

  /** The crowd's centre on screen. */
  cx() { return roadX(this.g.x); }

  drawCrowd(dt) {
    const g = this.g, n = Math.min(MAXV, this.shown), cx = this.cx();
    const k = 1 - Math.exp(-dt * 12);
    const t = this.time.now / 1000;
    const charging = g.phase === 'clash';
    for (let i = 0; i < MAXV; i += 1) {
      const s = this.men[i];
      if (i >= n) { if (s.visible) s.setVisible(false); continue; }
      if (!s.visible) {
        s.setVisible(true);
        s.x = this.spawnAt?.x ?? cx;
        s.y = this.spawnAt?.y ?? CROWD_Y;
        s.pop = 1;
      }
      const [ox, oy] = slot(i);
      const lean = charging ? -6 : 0;
      const tx = cx + ox, ty = CROWD_Y + oy + lean;
      s.x += (tx - s.x) * k;
      s.y += (ty - s.y) * k;
      const run = this.running && (g.phase === 'run' || charging);
      const ph = t * 9 + s.phase;
      s.setFrame((Math.floor(ph) & 1) ? this.run2 : 'soldier-1');
      const bob = run ? Math.abs(Math.sin(ph * Math.PI)) * 3 : 0;
      s.y -= bob * k;
      if (s.pop > 0) s.pop = Math.max(0, s.pop - dt * 4);
      const sc = this.manScale * (1 + s.pop * 0.6) * (s.pop > 0.75 ? (1 - s.pop) * 4 : 1);
      s.setScale(sc);
      s.setDepth(depthOf(s.y));
    }
    const r = SPACING * Math.sqrt(Math.max(1, n));
    this.shadow.setPosition(cx, CROWD_Y + 8).setDisplaySize(r * 2.4 + 30, r * 1.3 + 14).setVisible(n > 0);
    // the count over the crowd
    const show = this.shown > 0;
    this.pill.setVisible(show);
    this.pillNum.setVisible(show);
    if (show) {
      // under the crowd, so the horde and the boss above stay clear
      const py = CROWD_Y + r * 0.72 + 30;
      this.pillPunch = Math.max(0, this.pillPunch - dt * 3);
      const ps = 1 + this.pillPunch * 0.5;
      this.pill.setPosition(cx, py).setScale(ps * Math.max(1, 0.6 + String(g.count).length * 0.2), ps);
      this.pillNum.setPosition(cx, py - 3).setText(String(this.shown)).setScale(ps);
    }
  }

  /** A soldier's place on screen right now (for effects); `front` picks one from the leading edge. */
  manAt(front = false) {
    const n = Math.min(MAXV, Math.max(1, this.shown));
    let i = Math.floor(this.rand() * n);
    if (front) {
      let best = i;
      for (let k = 0; k < 4; k += 1) { const j = Math.floor(this.rand() * n); if (this.men[j].y < this.men[best].y) best = j; }
      i = best;
    }
    const s = this.men[i];
    return { x: s.x, y: s.y - 14 };
  }

  /** The shell's pause: the whole scene stands still — the loop, the clock (the lead-in's lines and 3-2-1), tweens. */
  setPaused(on) {
    if (!this.sys.isActive() && !this.sys.isPaused()) return; // gone already
    if (on && !this.sys.isPaused()) { this.drag = null; this.scene.pause(); }
    else if (!on && this.sys.isPaused()) this.scene.resume();
  }

  // ---------------------------------------------------------------- the lead-in

  scatter() {
    // beans arc from 小満's hand onto the road and pop up as soldiers
    const n = this.cfg.level.start, hx = this.xiaoman.x + 30, hy = this.xiaoman.y - 110;
    for (let i = 0; i < n; i += 1) {
      const [ox, oy] = slot(i);
      const b = this.add.image(hx, hy, 'units', 'bean').setDepth(D.fx).setScale(0.5);
      this.tweens.add({ targets: b, x: this.cx() + ox, duration: 420 + i * 25, ease: 'Linear' });
      this.tweens.add({ targets: b, y: { from: hy, to: CROWD_Y + oy }, duration: 420 + i * 25, ease: 'Back.easeIn',
        onComplete: () => {
          b.destroy();
          this.shown = Math.max(this.shown, i + 1);
          this.spawnAt = null;
          this.men[i].x = this.cx() + ox;
          this.men[i].y = CROWD_Y + oy;
          this.em.burst('gold', 6, this.cx() + ox, CROWD_Y + oy - 10);
          this.em.burst('poof', 2, this.cx() + ox, CROWD_Y + oy - 6);
          this.sfx.pop();
        } });
    }
    this.tweens.add({ targets: this.xiaoman, scaleX: this.xiaoman.scaleX * 1.08, scaleY: this.xiaoman.scaleY * 0.94, yoyo: true, duration: 140 });
  }

  go() {
    this.running = true;
    this.shown = this.g.count;
    this.sfx.go();
    this.hud.hint();
    this.say('start');
    this.fact({ t: 'go' });
  }

  // ---------------------------------------------------------------- track items

  spawnItem(it) {
    const v = { it, parts: [] };
    if (it.type === 'gates') {
      v.faces = gatesAt(it, this.g.dist);
      v.gates = v.faces.map((gate, side) => {
        if (!gate) return null;
        const x = roadX(side ? 0.5 : -0.5);
        const img = this.add.image(x, 0, 'gate-good').setOrigin(0.5, 0.8);
        img.setScale((ROAD.half * 1.02) / img.width);
        const glow = this.add.image(x, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.35).setScale(4.2, 1.6);
        const label = this.add.bitmapText(x, 0, 'numGood', '', 58).setOrigin(0.5);
        const gt = { img, glow, label, side, sx: img.scaleX, turn: 0 };
        this.face(gt, gate);
        return gt;
      });
      // a flipping pair wears a spinning ring of light on each pillar pair, so it reads as "this one moves"
      if (it.flip) v.rings = v.gates.filter(Boolean).map((gt) => this.add.image(gt.img.x, 0, 'ring').setTint(0xd6a8ff).setAlpha(0.5).setScale(1.1, 0.45));
      if (it.flip && !this.saidFlip) { this.saidFlip = true; this.say('flip', true); }
    } else if (it.type === 'rocks') {
      // each fall: a shadow on the road that darkens as the rock comes, then the rock dropping onto it
      const r = it.r ?? 0.3;
      v.falls = it.falls.map((x) => ({
        x, sh: this.add.image(roadX(x), 0, 'shadow').setDisplaySize(r * 2 * ROAD.half, r * ROAD.half * 0.7).setAlpha(0).setDepth(D.decal + 0.4),
        mark: this.add.image(roadX(x), 0, 'ring').setTint(0xff5a3a).setAlpha(0).setDepth(D.decal + 0.5),
        rock: this.add.image(roadX(x), 0, 'units', 'rock').setOrigin(0.5, 0.8).setVisible(false),
        down: false,
      }));
      v.falls.forEach((f) => {
        f.rock.setScale((r * 2.2 * ROAD.half) / f.rock.frame.width);
        f.mark.setDisplaySize(r * 2 * ROAD.half, r * ROAD.half * 0.8);
      });
      if (!this.saidRock) { this.saidRock = true; this.say('rock', true); }
    } else if (it.type === 'beans') {
      v.beans = Array.from({ length: Math.min(it.n, 24) }, (_, i) => {
        const [ox, oy] = slot(i);
        return { s: this.add.image(0, 0, 'units', 'bean').setScale(0.42), ox: ox * 1.25, oy: oy * 1.1, ph: this.rand() * 6 };
      });
      v.label = this.add.bitmapText(0, 0, 'numSmall', `+${it.n}`, 30).setOrigin(0.5);
    } else if (it.type === 'hazard') {
      const span = (it.x[1] - it.x[0]) * ROAD.half;
      v.img = this.add.image(0, 0, 'units', it.kind === 'log' ? 'log' : 'spikes').setOrigin(0.5, 0.5);
      v.img.setScale(span / v.img.frame.width);
      if (it.kind === 'log') v.shadow = this.add.image(0, 0, 'shadow').setAlpha(0.6).setDisplaySize(span, 40);
    } else if (it.type === 'horde') {
      v.beasts = [];
      const left = hordeLeft(it.left);
      const all = left.flatMap((u) => Array.from({ length: u.n }, () => u.b));
      // ranks across the road, the front rank nearest the crowd; the first kind listed stands at the back
      const [a, b2] = it.span ?? [-1, 1], lane = (b2 - a) * 0.9;
      const per = Math.max(3, Math.round(7 * (lane / 1.8)));
      all.forEach((b, i) => {
        const row = Math.floor(i / per), col = i % per;
        const rowN = Math.min(per, all.length - row * per);
        const x = roadX(((col + 0.5) / rowN) * lane + (a + b2) / 2 - lane / 2 + (this.rand() - 0.5) * 0.08);
        const kb = this.cfg.kit.beasts[b];
        const s = this.add.image(x, 0, `${b}-${kb.frames[0]}`).setOrigin(0.5, 0.9);
        s.setScale(kb.size / s.height);
        s.base = s.scaleX;
        v.beasts.push({ s, b, kb, oy: -row * 46 - (this.rand() * 10), ph: this.rand() * 4, alive: true });
      });
      // the back line is listed first: flip so index 0 is the FRONT (dies first)
      v.beasts.reverse();
      v.beasts.forEach((bs, i) => { bs.oy = -Math.floor(i / per) * 46 - this.rand() * 12; });
      v.pill = this.add.image(0, 0, 'pill-red');
      v.num = this.add.bitmapText(0, 0, 'numSmall', String(all.length), 32).setOrigin(0.5);
      v.cx = roadX(((it.span ?? [-1, 1])[0] + (it.span ?? [-1, 1])[1]) / 2);
      if (it.span && !this.saidLane) { this.saidLane = true; this.say('lane', true); }
    }
    this.vis.set(it.i, v);
    return v;
  }

  dropItem(i) {
    const v = this.vis.get(i);
    if (!v) return;
    const kill = (o) => o?.destroy();
    v.gates?.forEach((gt) => gt && [gt.img, gt.glow, gt.label].forEach(kill));
    v.rings?.forEach(kill);
    v.falls?.forEach((f) => { kill(f.sh); kill(f.rock); kill(f.mark); });
    v.beans?.forEach((b) => kill(b.s));
    v.beasts?.forEach((b) => kill(b.s));
    [v.label, v.img, v.shadow, v.pill, v.num].forEach(kill);
    this.vis.delete(i);
  }

  /** Dresses a gate in its face: good (blue, + ×) or cursed (red, − ÷), its number. */
  face(gt, gate) {
    const good = gate.op === '+' || gate.op === 'x';
    gt.good = good;
    gt.img.setTexture(good ? 'gate-good' : 'gate-bad');
    gt.glow.setTint(good ? 0x7fd8ff : 0xff4a3a);
    gt.label.setFont(good ? 'numGood' : 'numBad').setText(`${gate.op}${gate.n}`);
  }

  drawItems(dt) {
    const g = this.g, t = this.time.now / 1000;
    for (const it of g.items) {
      const y = this.ySc(it.at);
      // (a patch of falling rocks reaches `gap` px further up the road per rock)
      const top = it.type === 'rocks' ? this.ySc(it.at + (it.falls.length - 1) * it.gap) : y;
      const near = top < H + 220 && y > -220;
      let v = this.vis.get(it.i);
      if (near && !v && !(it.done && top > CROWD_Y + 60)) v = this.spawnItem(it);
      if (!v) continue;
      if (!near) { this.dropItem(it.i); continue; }
      if (it.type === 'gates') {
        const faces = it.done ? v.faces : gatesAt(it, g.dist);
        if (faces !== v.faces) { // a flipping pair turned: each side shows the other face, with a quick turn
          v.faces = faces;
          v.gates.forEach((gt, side) => { if (gt && !gt.gone) { gt.turn = 1; gt.next = faces[side]; } });
          this.sfx.tick();
        }
        v.rings?.forEach((rg, k) => rg.setPosition(v.gates.filter(Boolean)[k].img.x, y - 30).setDepth(depthOf(y + 8) - 0.002)
          .setAlpha(it.done ? 0 : 0.35 + Math.sin(t * 8) * 0.15).setRotation(t * 2));
        for (const gt of v.gates) {
          if (!gt || gt.gone) continue;
          if (gt.turn > 0) { // squash to a sliver, swap the face at the middle, open again
            const was = gt.turn;
            gt.turn = Math.max(0, gt.turn - dt * 6);
            if (was > 0.5 && gt.turn <= 0.5) this.face(gt, gt.next);
            const k = Math.abs(gt.turn - 0.5) * 2;
            gt.img.scaleX = gt.sx * Math.max(0.05, k);
            gt.label.scaleX = Math.max(0.05, k);
          }
          gt.img.setY(y + 8).setDepth(depthOf(y + 8));
          gt.glow.setY(y - 26).setDepth(depthOf(y + 8) - 0.001).setAlpha(0.28 + Math.sin(t * 5 + gt.side) * 0.08);
          gt.label.setY(y - 32).setDepth(depthOf(y + 8) + 0.002);
          if (!gt.turn) gt.label.setScale(1 + Math.sin(t * 6 + gt.side * 2) * 0.04);
        }
      } else if (it.type === 'beans') {
        for (const b of v.beans) {
          if (b.taken) continue;
          b.s.setPosition(roadX(it.x) + b.ox, y + b.oy - Math.abs(Math.sin(t * 4 + b.ph)) * 4).setDepth(depthOf(y + b.oy));
        }
        if (!v.taken) v.label.setPosition(roadX(it.x), y - 52).setDepth(D.num);
      } else if (it.type === 'rocks') {
        const warn = it.warn ?? 380;
        v.falls.forEach((f, j) => {
          const land = it.at + j * it.gap, d = land - g.dist, yy = this.ySc(land);
          if (f.down) { f.sh.setY(yy).setAlpha(Math.max(0, f.sh.alpha - dt * 2)); f.mark.setAlpha(0); return; }
          const near = Phaser.Math.Clamp(1 - d / warn, 0, 1);
          f.sh.setY(yy).setAlpha(Math.min(1, near * 1.4));
          // the spot it lands on, a red ring pulsing faster as the rock comes
          f.mark.setY(yy).setAlpha(near > 0 ? 0.35 + near * 0.5 + Math.sin(t * (8 + near * 14)) * 0.15 : 0);
          if (d < 240) { // the rock in the air over its shadow, falling the last stretch
            f.rock.setVisible(true).setPosition(roadX(f.x), yy - Math.max(0, d) * 2.2).setDepth(D.fx - 2).setRotation(t * 3 + j);
          }
        });
      } else if (it.type === 'hazard') {
        const [a, b] = hazardSpan(it, g.t);
        const x = roadX((a + b) / 2);
        const yy = y - (it.len ?? 60) / 2;
        v.img.setPosition(x, yy).setDepth(it.kind === 'log' ? depthOf(yy + 18) : D.decal + 0.5);
        if (it.kind === 'log') {
          v.img.rotation = Math.sin(g.t * 3) * 0.05;
          v.shadow.setPosition(x, yy + 22).setDepth(D.decal);
        }
      } else if (it.type === 'horde') {
        let top = y;
        for (const bs of v.beasts) {
          if (!bs.alive) continue;
          const yy = y - 26 + bs.oy;
          top = Math.min(top, yy);
          const frames = bs.kb.frames;
          const f = frames[Math.floor(t * 6 + bs.ph) % frames.length];
          if (!bs.hitT) bs.s.setTexture(`${bs.b}-${f}`);
          else { bs.hitT -= dt; if (bs.hitT <= 0) bs.hitT = 0; }
          const lunge = g.clash === it ? Math.sin(t * 14 + bs.ph) * 4 : 0;
          bs.s.setY(yy + lunge - Math.abs(Math.sin(t * 7 + bs.ph)) * (bs.kb.fly ? 8 : 3)).setDepth(depthOf(yy));
        }
        const n = hordeCount(it.left);
        v.pill.setPosition(v.cx, top - 64).setDepth(D.num).setVisible(n > 0);
        v.num.setPosition(v.cx, top - 67).setDepth(D.num + 1).setText(String(n)).setVisible(n > 0);
      }
    }
  }

  // ---------------------------------------------------------------- the boss

  bossSprite() {
    if (this.boss) return this.boss;
    const kb = this.cfg.kit.beasts[this.cfg.level.boss.beast];
    const s = this.add.image(ROAD.cx, 0, `${this.cfg.level.boss.beast}-${kb.frames[0]}`).setOrigin(0.5, 0.88);
    s.setScale(kb.size / s.height);
    this.bossBase = s.scaleX;
    this.bossShadow = this.add.image(ROAD.cx, 0, 'shadow').setDisplaySize(300, 70).setAlpha(0.7).setDepth(D.decal);
    this.boss = s;
    return s;
  }

  drawBoss(dt) {
    const g = this.g;
    const y = this.ySc(g.boss.at) - 150;
    if (y < -300 || !this.cfg.level.boss) return;
    const s = this.bossSprite();
    if (!s.active) return;
    const t = this.time.now / 1000;
    const breathe = Math.sin(t * 3) * 0.02;
    this.bossSquash = Math.max(0, (this.bossSquash ?? 0) - dt * 3);
    s.setPosition(ROAD.cx + (this.bossJolt ?? 0), y + 40).setDepth(depthOf(y + 40));
    s.setScale(this.bossBase * (1 + breathe + this.bossSquash * 0.18), this.bossBase * (1 - breathe - this.bossSquash * 0.22));
    this.bossShadow.setPosition(ROAD.cx, y + 44);
    this.bossJolt = (this.bossJolt ?? 0) * 0.8;
    if (this.bossHitT > 0) { this.bossHitT -= dt; if (this.bossHitT <= 0) { s.setTexture(`${this.cfg.level.boss.beast}-${this.cfg.kit.beasts[this.cfg.level.boss.beast].frames[0]}`); s.clearTint(); } }
    if (this.hud.bossFill) this.hud.drawBoss(g.boss.hp);
    this.zone?.forEach((z) => z.setAlpha(0.75 + Math.sin(t * 18) * 0.25));
  }

  // ---------------------------------------------------------------- ghosts (the dying, the charging) and numbers

  ghost(x, y, { tx, ty, vx = 0, vy = 0, life = 0.5, onHit, spin = 0, fade = true } = {}) {
    let gh = this.ghosts.find((o) => !o.live);
    if (!gh) {
      if (this.ghosts.length > 160) return;
      gh = { s: this.add.image(0, 0, 'units', 'soldier-1').setOrigin(0.5, 0.8) };
      this.ghosts.push(gh);
    }
    Object.assign(gh, { live: true, x, y, tx, ty, vx, vy, t: 0, life, onHit, spin, fade });
    gh.s.setVisible(true).setPosition(x, y).setScale(this.manScale).setAlpha(1).setRotation(0).setFrame('soldier-1');
  }

  drawGhosts(dt) {
    for (const gh of this.ghosts) {
      if (!gh.live) continue;
      gh.t += dt;
      if (gh.tx != null) {
        // charging: a hop toward the target, struck on arrival
        const f = Math.min(1, gh.t / gh.life);
        const x = gh.x + (gh.tx - gh.x) * f, y = gh.y + (gh.ty - gh.y) * f - Math.sin(f * Math.PI) * 40;
        gh.s.setPosition(x, y).setDepth(depthOf(y) + 1).setFrame((Math.floor(gh.t * 12) & 1) ? this.run2 : 'soldier-1');
        if (f >= 1) { gh.live = false; gh.s.setVisible(false); gh.onHit?.(x, y); }
      } else {
        // dying: thrown up and spinning, fading
        gh.vy += 900 * dt;
        gh.s.x += gh.vx * dt; gh.s.y += gh.vy * dt;
        gh.s.rotation += gh.spin * dt;
        gh.s.setAlpha(Math.max(0, 1 - gh.t / gh.life)).setDepth(D.fx - 1);
        if (gh.t >= gh.life) { gh.live = false; gh.s.setVisible(false); }
      }
    }
  }

  /** A soldier knocked out of the crowd at (x, y): a paper burst, flung and fading. */
  die(x, y, dir = -1) {
    this.ghost(x, y, { vx: (this.rand() - 0.5) * 220, vy: dir * (200 + this.rand() * 200), life: 0.55, spin: (this.rand() - 0.5) * 18 });
    this.em.burst('paper', 2, x, y);
    this.em.burst('poof', 1, x, y);
  }

  num(x, y, s, font = 'numBig', size = 60, { rise = 70, life = 0.9 } = {}) {
    let n = this.nums.find((o) => !o.live);
    if (!n) {
      if (this.nums.length > 40) return;
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
      const pop = f < 0.15 ? backOut(f / 0.15) * 1.25 : 1.25 - Math.min(0.25, (f - 0.15) * 1.2);
      n.b.setScale(pop).setY(n.y0 - n.rise * quadOut(Math.min(1, f * 1.4))).setAlpha(f > 0.7 ? 1 - (f - 0.7) / 0.3 : 1);
      if (f >= 1) { n.live = false; n.b.setVisible(false); }
    }
  }

  // ---------------------------------------------------------------- events → juice

  shake(ms, k) { if (!this.calm) this.cameras.main.shake(ms, k); }
  flash(ms, r, g, b) { if (!this.calm) this.cameras.main.flash(ms, r, g, b, true); }

  /** 银月's line for a moment: the host's prefetched one (台词预取), else the level's own; never two within 5 s. */
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

  /** The boss's name, from the kit (合窳, 蠪侄 …). */
  bossName() {
    const kb = this.cfg.kit.beasts[this.cfg.level.boss.beast];
    return kb.name?.[this.lang] ?? kb.name?.zh ?? this.w.bossName;
  }

  /** Facts out (doc/game-kit.md § Game and chat): start · go · gate · clash · boss · low · end. */
  fact(e) { try { this.cfg.onEvent?.(e); } catch { /* the host's trouble, not the game's */ } }

  handle(e) {
    const g = this.g, h = this[`on_${e.t}`];
    if (h) h.call(this, e, g);
  }

  on_gate(e) {
    const v = this.vis.get(e.i);
    const gt = v?.gates?.[e.side];
    const x = roadX(e.side ? 0.5 : -0.5), y = gt ? gt.img.y - 30 : CROWD_Y - 60;
    if (gt) {
      gt.gone = true;
      this.tweens.add({ targets: [gt.img, gt.glow], scaleX: '*=1.25', scaleY: '*=1.25', alpha: 0, duration: 300 });
      this.tweens.add({ targets: gt.label, y: gt.label.y - 40, scale: 2, alpha: 0, duration: 380 });
    }
    const other = v?.gates?.[1 - e.side];
    if (other) this.tweens.add({ targets: [other.img, other.glow, other.label], alpha: 0.25, duration: 250 });
    const diff = e.to - e.from;
    if (e.good) {
      this.em.burst('gold', 28, x, y);
      this.em.burst('stars', 8, x, y);
      this.sfx.good();
      this.flash(90, 160, 220, 255);
      this.num(x, y - 20, `+${diff}`, 'numBig', 72, { rise: 90 });
      this.spawnAt = { x, y: y + 30 };
      this.shown = e.to;
      this.pillPunch = 1;
      this.say('good');
    } else {
      this.em.burst('bad', 22, this.cx(), CROWD_Y - 20);
      this.sfx.bad();
      this.shake(160, 0.008);
      this.num(x, y - 20, `-${-diff}`, 'numBad', 66, { rise: 70 });
      const k = Math.min(30, -diff);
      for (let i = 0; i < k; i += 1) { const p = this.manAt(); this.die(p.x, p.y); }
      this.shown = e.to;
      this.pillPunch = 0.6;
      this.say('bad');
    }
    this.fact({ t: 'gate', good: e.good, from: e.from, to: e.to });
  }

  on_beans(e) {
    const v = this.vis.get(e.i);
    if (!v || !e.got) return;
    v.taken = true;
    for (const b of v.beans) {
      b.taken = true;
      this.tweens.add({ targets: b.s, x: this.cx(), y: CROWD_Y - 10, scale: 0.2, duration: 220 + this.rand() * 120, onComplete: () => b.s.setVisible(false) });
    }
    this.tweens.add({ targets: v.label, y: v.label.y - 50, alpha: 0, scale: 1.6, duration: 450 });
    this.em.burst('beans', 16, roadX(v.it.x), this.ySc(v.it.at));
    this.num(this.cx(), CROWD_Y - 110, `+${e.n}`, 'numGood', 50, { rise: 60 });
    this.spawnAt = { x: roadX(v.it.x), y: this.ySc(v.it.at) };
    this.shown = this.g.count;
    this.pillPunch = 0.7;
    for (let i = 0; i < 4; i += 1) this.time.delayedCall(i * 50, () => this.sfx.pop());
  }

  on_hazard(e) {
    const it = this.g.items[e.i];
    const [a, b] = hazardSpan(it, this.g.t);
    for (let i = 0; i < Math.min(12, e.killed); i += 1) {
      const p = this.manAt(true);
      const x = Phaser.Math.Clamp(p.x, roadX(a), roadX(b));
      this.die(x, p.y, -1);
      this.em.burst('blood', 3, x, p.y);
    }
    this.shown = this.g.count;
    this.sfx.hit();
    if (it.kind === 'log') this.em.burst('debris', 3, this.cx(), CROWD_Y - 30);
    this.hazardLost = (this.hazardLost ?? 0) + e.killed;
    if (this.time.now - (this.hazardNumAt ?? 0) > 250) {
      this.hazardNumAt = this.time.now;
      this.num(this.cx() + (this.rand() - 0.5) * 60, CROWD_Y - 90, `-${this.hazardLost}`, 'numBad', 44, { rise: 50, life: 0.7 });
      this.hazardLost = 0;
    }
  }

  on_rock(e) {
    const v = this.vis.get(e.i), f = v?.falls?.[e.j];
    const x = roadX(e.x), y = f ? f.sh.y : CROWD_Y - 40;
    if (f) { f.down = true; f.rock.setVisible(false); }
    this.sfx.thud();
    this.shake(200, 0.012);
    this.em.burst('debris', 10, x, y - 10);
    this.em.burst('dust', 12, x, y);
    for (let i = 0; i < Math.min(14, e.killed); i += 1) { const p = this.manAt(); this.die(p.x, p.y, -1.2); }
    if (e.killed) {
      this.num(this.cx(), CROWD_Y - 100, `-${e.killed}`, 'numBad', 56, { rise: 60 });
      this.shown = this.g.count;
    }
  }

  on_clash(e) {
    this.sfx.thud();
    this.shake(180, 0.01);
    this.hold = this.calm ? 0 : 0.07;
    this.em.burst('dust', 14, this.cx(), CROWD_Y - 50);
    this.say('clash');
    this.fact({ t: 'clash', beasts: e.beasts, count: e.count });
  }

  on_clash_tick(e) {
    const v = this.vis.get(e.i);
    const frontY = CROWD_Y - SPACING * Math.sqrt(Math.max(1, Math.min(MAXV, this.shown))) * 0.72 - 6;
    for (let i = 0; i < Math.min(6, e.lost); i += 1) {
      const p = this.manAt(true);
      this.die(p.x, Math.min(p.y, frontY + 10), -1);
      this.em.burst('spark', 3, p.x, frontY - 10);
    }
    if (e.lost) { this.sfx.hit(); this.shown = this.g.count; }
    // the contact line: sparks and dust all along the crowd's front
    const half = SPACING * Math.sqrt(Math.max(1, Math.min(MAXV, this.shown)));
    this.em.burst('spark', 4, this.cx() + (this.rand() - 0.5) * half * 2, frontY - 16);
    if (this.rand() < 0.3) this.em.burst('dust', 2, this.cx() + (this.rand() - 0.5) * half * 2, frontY - 10);
    if (v && e.killed) {
      let k = e.killed;
      for (const bs of v.beasts) {
        if (!k) break;
        if (!bs.alive) continue;
        bs.alive = false;
        k -= 1;
        bs.s.setTexture(`${bs.b}-${bs.kb.hit}`).setTintFill(0xffffff);
        this.time.delayedCall(60, () => bs.s.clearTint());
        this.em.burst('poof', 3, bs.s.x, bs.s.y - 20);
        this.em.burst('blood', 6, bs.s.x, bs.s.y - 20);
        this.tweens.add({ targets: bs.s, y: bs.s.y - 40 - this.rand() * 30, x: bs.s.x + (this.rand() - 0.5) * 60, angle: (this.rand() - 0.5) * 80,
          alpha: 0, scale: bs.s.scaleX * 0.7, duration: 420, ease: 'Quad.easeOut', onComplete: () => bs.s.setVisible(false) });
      }
      this.sfx.thud();
    }
  }

  on_clash_end(e) {
    const v = this.vis.get(e.i);
    v?.beasts?.forEach((bs) => { if (bs.alive) { bs.alive = false; bs.s.setVisible(false); } });
    this.em.burst('stars', 6, this.cx(), CROWD_Y - 80);
    this.shown = this.g.count;
    this.pillPunch = 0.8;
  }

  on_boss(e) {
    this.hud.banner(this.w.boss(this.bossName()), { ribbon: true, y: 330 });
    this.hud.showBoss(e.hp, this.bossName());
    this.shake(300, 0.012);
    this.sfx.slam();
    this.say('boss', true);
    this.fact({ t: 'boss', count: e.count });
  }

  on_hit(e) {
    const s = this.boss;
    if (!s) return;
    for (let i = 0; i < Math.min(5, e.n); i += 1) {
      const p = this.manAt(true);
      const tx = s.x + (this.rand() - 0.5) * 160, ty = s.y - 60 - this.rand() * 80;
      this.ghost(p.x, p.y, { tx, ty, life: 0.32 + this.rand() * 0.12, onHit: (x, y) => {
        this.em.burst('spark', 5, x, y);
        this.em.burst('paper', 2, x, y);
        this.sfx.hit();
      } });
    }
    this.shown = this.g.count;
    this.time.delayedCall(330, () => {
      if (!s.active) return;
      s.setTexture(`${this.cfg.level.boss.beast}-${this.cfg.kit.beasts[this.cfg.level.boss.beast].hit}`).setTint(0xffd0d0);
      this.bossHitT = 0.12;
      this.bossJolt = (this.rand() - 0.5) * 12;
      // one number per ~0.15 s, summing the strikes in it (a strike a frame would be a wall of −1s)
      this.dmgSum = (this.dmgSum ?? 0) + e.dmg;
      if (this.time.now - (this.dmgAt ?? 0) > 150) {
        this.dmgAt = this.time.now;
        this.num(s.x + (this.rand() - 0.5) * 160, s.y - 170 - this.rand() * 70, `-${this.dmgSum}`, 'numBig', 44 + Math.min(30, this.dmgSum * 2), { rise: 80, life: 0.8 });
        this.dmgSum = 0;
      }
    });
  }

  on_slam_warn(e) {
    this.zone?.forEach((z) => z.destroy());
    // the warned spans lit red from the boss's feet down past the crowd, so they show around the soldiers
    this.zone = e.zones.map(([a, b]) => this.add.image(roadX((a + b) / 2), CROWD_Y - 60, 'zone')
      .setDisplaySize((b - a) * ROAD.half * 1.04, 460).setDepth(D.decal + 1).setBlendMode(Phaser.BlendModes.ADD));
    this.hud.banner(this.w.slams[e.move] ?? this.w.slam, { color: '#ff8a7a', y: 560 });
    this.say('slam', true);
    this.sfx.tick();
    this.tweens.add({ targets: this, bossSquash: 1, duration: e.sec * 900, ease: 'Quad.easeIn' });
  }

  on_slam(e) {
    this.zone?.forEach((z) => z.destroy());
    this.zone = null;
    this.bossSquash = 0;
    this.sfx.slam();
    this.shake(320, 0.02);
    for (const [a, b] of e.zones) {
      const x = roadX((a + b) / 2), k = (b - a) / 1;
      this.em.burst('dust', Math.round(26 * k), x, CROWD_Y);
      this.em.burst('debris', Math.round(12 * k), x, CROWD_Y);
      const ring = this.add.image(x, CROWD_Y, 'ring').setDepth(D.fx).setScale(0.3, 0.15).setTint(0xffd0a0);
      this.tweens.add({ targets: ring, scaleX: 3.2 * k, scaleY: 1.4, alpha: 0, duration: 450, onComplete: () => ring.destroy() });
    }
    for (let i = 0; i < Math.min(24, e.killed); i += 1) { const p = this.manAt(); this.die(p.x, p.y, -1.4); }
    if (e.killed) this.num(this.cx(), CROWD_Y - 100, `-${e.killed}`, 'numBad', 62, { rise: 60 });
    this.shown = this.g.count;
  }

  on_low() { this.say('low', true); this.fact({ t: 'low', count: this.g.count }); }

  on_end(e) {
    if (this.ended) return;
    this.ended = true;
    this.zone?.forEach((z) => z.destroy());
    this.fact({ t: 'end', won: e.won, stars: e.stars });
    if (e.won && this.boss) {
      const s = this.boss;
      this.hold = this.calm ? 0 : 0.15;
      this.sfx.win();
      this.shake(500, 0.02);
      this.flash(200, 255, 240, 200);
      for (let i = 0; i < 6; i += 1) {
        this.time.delayedCall(i * 110, () => {
          this.em.burst('fire', 18, s.x + (this.rand() - 0.5) * 200, s.y - 60 - this.rand() * 160);
          this.em.burst('stars', 8, s.x, s.y - 120);
        });
      }
      s.setTexture(`${this.cfg.level.boss.beast}-${this.cfg.kit.beasts[this.cfg.level.boss.beast].hit}`);
      this.tweens.add({ targets: s, angle: 12, alpha: 0, y: s.y + 30, scaleY: s.scaleY * 0.6, delay: 500, duration: 700, ease: 'Quad.easeIn' });
      this.hud.banner(this.w.won, { color: '#ffe36b', ribbon: true, y: 330 });
      this.say('won', true);
    } else if (!e.won) {
      this.sfx.lose();
      this.say('lost', true);
    }
    this.time.delayedCall(e.won ? 1500 : 900, () => {
      const end = () => this.cfg.onEnd?.({ won: e.won, stars: e.stars, stats: { left: e.left, peak: this.g.peak, ...this.g.stats } });
      if (this.cfg.shell) end(); else this.hud.result(e.won, e.stars, e.left, end);
    });
  }

  // ---------------------------------------------------------------- the loop

  update(_, delta) {
    const dt = Math.min(0.05, delta / 1000);
    const g = this.g;
    if (this.keys) {
      const k = this.keys;
      const dir = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
      if (dir) this.target = Phaser.Math.Clamp(this.target + dir * 2.6 * dt, -1, 1);
    }
    if (this.hold > 0) this.hold -= dt;
    else if (this.running && !this.ended) {
      steer(g, this.target);
      step(g, dt);
      for (const e of g.events) this.handle(e);
      g.events.length = 0;
    }
    this.drawWorld(dt);
    this.drawItems(dt);
    this.drawBoss(dt);
    this.drawCrowd(dt);
    this.drawGhosts(dt);
    this.drawNums(dt);
    this.hud.progress(g.dist / g.boss.at);
    if (this.hud.fps && (this.fpsT = (this.fpsT ?? 0) + dt) > 0.25 && !(this.fpsT = 0)) this.hud.fps.setText(`FPS ${this.game.loop.actualFps.toFixed(0)} · ${Math.min(MAXV, this.shown)}/${g.count}`);
  }

  /** The host's command (doc/game-kit.md § commands in): a line over the field. */
  sayLine(who, text) { if (text) this.hud.say(text); }
}
