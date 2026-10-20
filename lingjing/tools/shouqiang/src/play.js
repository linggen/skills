// play.js — 守墙关's scene: draws what the engine (scripts/games/shouqiang/core.js) holds, turns its events into
// juice, and takes the two inputs the game has: a card pick, and (optional) a tap on a beast to focus it.
import * as Phaser from 'phaser';
import { newGame, step, pick, setFocus, HERO, FOX, W, H } from 'shouqiang-core';
import { FONT, makeTextures, makeNumberFont, makeEmitters, jag } from './fx.js';
import { Hud, WORDS } from './hud.js';

const ICONS = ['jian-more', 'jian-pierce', 'jian-return', 'huo-blast', 'huo-ground', 'han-slow', 'han-freeze', 'lei-chain', 'lei-strike', 'yy-foxfire', 'yy-howl'];
const HIT_TINT = { sword: 0xffffff, fire: 0xffb347, frost: 0x9fe8ff, thunder: 0xfff27a, fox: 0xcfe0ff, howl: 0xd9c2ff, ground: 0xff9a52 };
const D = { bg: 0, decal: 2, ground: 3, shadow: 4, beast: 10, wall: 20, hero: 30, shot: 40, fx: 50, num: 60, light: 70, hud: 80, modal: 90 };

export class PlayScene extends Phaser.Scene {
  constructor() { super('play'); }

  init(cfg) {
    this.cfg = cfg;
    this.lang = cfg.lang === 'en' ? 'en' : 'zh';
    this.w = WORDS[this.lang];
  }

  preload() {
    const art = `${this.cfg.base}art/`;
    const img = (k, file = k) => this.load.image(k, `${art}${file}.webp`);
    for (const k of ['bg', 'wall', 'xiaoman-idle', 'xiaoman-cast', 'fu-huo', 'fu-han', 'fu-lei', 'sword']) img(k);
    for (const [b, k] of Object.entries(this.cfg.kit.beasts)) for (const f of k.frames ?? []) img(`${b}-${f}`);
    for (const k of ICONS) img(`icon-${k}`);
    const yy = `${this.cfg.base}../shoulu/art/`;
    this.load.image('yy-sheet', `${yy}yinyue.webp`);
    this.load.image('yy-skills', `${yy}yinyue-skills.webp`);
    this.load.json('yy-meta', `${yy}yinyue.json`);
    this.missing = new Set();
    this.load.on('loaderror', (f) => this.missing.add(f.key));
    const bar = this.add.graphics();
    this.load.on('progress', (p) => {
      bar.clear().fillStyle(0x000000, 0.4).fillRoundedRect(120, 470, 300, 20, 10).fillStyle(0xffd34d, 1).fillRoundedRect(122, 472, 296 * p, 16, 8);
    });
    this.load.on('complete', () => bar.destroy());
  }

  /** A texture that loaded, else its stand-in (a beast's second walk frame → its first). */
  tex(k, fallback) { return this.missing.has(k) || !this.textures.exists(k) ? fallback : k; }

  create() {
    const { kit, level, seed, reducedMotion } = this.cfg;
    this.calm = Boolean(reducedMotion);
    const R = this.cfg.zoom ?? 1;
    this.cameras.main.setZoom(R).centerOn(W / 2, H / 2);
    this.g = newGame(kit, level, { seed });
    this.rnd = Math.random;
    this.yinyueFrames();
    makeTextures(this);
    makeNumberFont(this, 'num', { fill: '#ffffff' });
    makeNumberFont(this, 'numBig', { fill: ['#fff7c2', '#ffd23f', '#ff8a00'], stroke: '#5a0d00', size: 60 });
    this.em = makeEmitters(this, D.fx, this.calm ? 0.45 : 1);
    this.world();
    this.beasts = new Map();
    this.shotSprites = new Map();
    this.groundDecals = new Map();
    this.nums = [];
    this.zap = this.add.graphics().setDepth(D.fx + 1).setBlendMode(Phaser.BlendModes.ADD);
    this.zapT = 0;
    this.bars = this.add.graphics().setDepth(D.num - 1);
    this.reticle = this.add.image(0, 0, 'reticle').setDepth(D.num - 2).setVisible(false).setScale(0.8);
    this.hud = new Hud(this, { depth: D.hud, modal: D.modal });
    this.paused = false;
    this.input.on('pointerdown', (p) => this.tapField(p));
    this.events.once('shutdown', () => this.hud.destroy());
    this.hud.lead(level.lead, level.leadSec ?? 5);
    this.fact({ t: 'start', level: level.id });
  }

  yinyueFrames() {
    const meta = this.cache.json.get('yy-meta');
    if (!meta) return;
    const [cw, ch] = meta.cell;
    for (const [sheet, key] of [['yinyue', 'yy-sheet'], ['yinyue-skills', 'yy-skills']]) {
      const t = this.textures.get(key);
      for (const [name, [x, y]] of Object.entries(meta.sheets[sheet] ?? {})) t.add(name, 0, x, y, cw, ch);
    }
    this.yyFoot = meta.foot / ch;
  }

  // ---- the stage ---------------------------------------------------------------------------------------------

  world() {
    const bg = this.add.image(W / 2, H / 2, 'bg').setDepth(D.bg);
    bg.setScale(Math.max(W / bg.width, H / bg.height) * 1.02);
    // The light band (a slow diagonal shaft over the road) and the vignette: the reference's lighting.
    this.band = this.add.image(W * 0.55, H * 0.36, 'band').setDepth(D.light).setBlendMode(Phaser.BlendModes.ADD)
      .setAngle(-28).setDisplaySize(W * 2.2, 230).setAlpha(0.42);
    if (!this.calm) this.tweens.add({ targets: this.band, alpha: 0.26, x: W * 0.47, duration: 5200, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.add.image(W / 2, H / 2, 'vignette').setDisplaySize(W, H).setDepth(D.light + 1);
    const wy = this.g.level.wallY;
    this.wall = this.add.image(W / 2, wy - 22, 'wall').setOrigin(0.5, 0).setDepth(D.wall);
    this.wall.setScale((W + 30) / this.wall.width);
    this.wallX = this.wall.x;
    this.add.image(HERO.x, HERO.y + 26, 'shadow').setDepth(D.hero - 1).setScale(1.3, 1.2);
    this.xm = this.add.image(HERO.x, HERO.y + 30, 'xiaoman-idle').setOrigin(0.5, 1).setDepth(D.hero);
    this.xmScale = 150 / this.xm.height;
    this.xm.setScale(this.xmScale);
    this.tweens.add({ targets: this.xm, scaleY: this.xmScale * 1.03, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.xmAura = this.add.image(HERO.x, HERO.y - 20, 'glow').setDepth(D.hero - 1).setBlendMode(Phaser.BlendModes.ADD).setScale(2.4).setTint(0x7fd0ff).setAlpha(0.25);
    this.add.image(FOX.x, FOX.y + 24, 'shadow').setDepth(D.hero - 1).setScale(1.2, 1);
    const yyKey = this.textures.get('yy-sheet').has('idle-1') ? 'yy-sheet' : null;
    this.yy = yyKey ? this.add.image(FOX.x, FOX.y + 26, 'yy-sheet', 'idle-1').setOrigin(0.5, this.yyFoot ?? 0.97).setDepth(D.hero) : null;
    if (this.yy) {
      this.yyScale = 92 / 150;
      this.yy.setScale(this.yyScale);
      this.yyIdle = 0;
    }
  }

  // ---- input ---------------------------------------------------------------------------------------------------

  tapField(p) {
    if (this.hud.modalOpen || this.paused) return;
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    if (wp.y > this.g.level.wallY + 30) return;
    let best = null, bd = 80;
    for (const b of this.g.beasts) {
      const d = Math.hypot(b.x - wp.x, b.y - (b.r * 0.6) - wp.y);
      if (b.hp > 0 && d < bd) { best = b; bd = d; }
    }
    setFocus(this.g, best?.id ?? null);
    if (best) this.em.burst('spark', 6, best.x, best.y - 20);
  }

  togglePause() {
    this.paused = !this.paused;
    this.hud.showPause(this.paused);
    if (this.paused) this.tweens.pauseAll(); else this.tweens.resumeAll();
  }

  choose(id) {
    pick(this.g, id);
  }

  // ---- the frame -----------------------------------------------------------------------------------------------

  update(time, delta) {
    const dt = Math.min(delta, 50) / 1000;
    if (!this.paused && !this.hitStop) step(this.g, dt);
    if (this.hitStop) this.hitStop = Math.max(0, this.hitStop - dt);
    for (const e of this.g.events) this.on(e);
    this.g.events.length = 0;
    if (this.paused) return;
    this.syncBeasts(time, dt);
    this.syncShots(dt);
    this.syncGrounds();
    this.drawBars();
    this.moveNums(dt);
    this.heroes(dt);
    if (this.zapT > 0 && (this.zapT -= dt) <= 0) this.zap.clear();
    this.hud.update(this.g, dt, this.game.loop.actualFps);
  }

  heroes(dt) {
    if (this.xmCast > 0 && (this.xmCast -= dt) <= 0) this.xm.setTexture('xiaoman-idle');
    this.xmAura.setAlpha(0.18 + Math.sin(this.time.now / 300) * 0.06);
    if (!this.yy) return;
    if (this.yyAct > 0) { this.yyAct -= dt; return; }
    this.yyIdle += dt;
    this.yy.setTexture('yy-sheet', Math.floor(this.yyIdle / 0.6) % 2 ? 'idle-2' : 'idle-1');
  }

  yyPose(frames, each = 0.12) {
    if (!this.yy) return;
    this.yyAct = frames.length * each + 0.1;
    const sheetOf = (f) => (this.textures.get('yy-sheet').has(f) ? 'yy-sheet' : 'yy-skills');
    frames.forEach((f, i) => this.time.delayedCall(i * each * 1000, () => this.yy?.setTexture(sheetOf(f), f)));
  }

  syncBeasts(time, dt) {
    const seen = new Set();
    for (const b of this.g.beasts) {
      seen.add(b.id);
      let s = this.beasts.get(b.id);
      if (!s) s = this.makeBeast(b);
      this.poseBeast(s, b, time, dt);
    }
    for (const [id, s] of this.beasts) if (!seen.has(id)) this.dropBeast(id, s, false);
    const f = this.g.beasts.find((b) => b.id === this.g.focus);
    this.reticle.setVisible(Boolean(f));
    if (f) this.reticle.setPosition(f.x, f.y - this.kit(f).size * 0.42).setAngle(time / 8);
  }

  kit(b) { return this.g.kit.beasts[b.kind]; }

  makeBeast(b) {
    const k = this.kit(b);
    const walk1 = `${b.kind}-walk-1`;
    const spr = this.add.image(b.x, b.y, walk1).setOrigin(0.5, 0.86);
    const scale = k.size / spr.height;
    spr.setScale(scale);
    const shadow = this.add.image(b.x, b.y, 'shadow').setDepth(D.shadow).setScale(k.size / 64 * (b.fly ? 0.7 : 1.05), k.size / 64);
    const s = { spr, shadow, scale, kind: b.kind, hitT: 0, flashT: 0, phase: Math.random() * 6, frames: [walk1, this.tex(`${b.kind}-walk-2`, walk1)],
      hit: this.tex(`${b.kind}-hit`, walk1), stars: null };
    spr.setAlpha(0);
    this.tweens.add({ targets: spr, alpha: 1, duration: 260 });
    this.beasts.set(b.id, s);
    return s;
  }

  poseBeast(s, b, time, dt) {
    const k = this.kit(b);
    s.hitT = Math.max(0, s.hitT - dt);
    s.flashT = Math.max(0, s.flashT - dt);
    const held = b.freezeT > 0 || b.stunT > 0;
    const moving = !held && !b.atWall;
    const rate = moving ? Math.max(4, b.speed / 7) : b.atWall ? 9 : 0;
    s.phase += dt * rate;
    const step = Math.sin(s.phase);
    const lift = b.fly ? 34 + Math.sin(time / 180 + s.phase) * 6 : Math.abs(step) * 4;
    const lunge = b.atWall && !held ? Math.max(0, Math.sin(s.phase * 0.7)) * 10 : 0;
    s.spr.setPosition(b.x, b.y - lift + lunge).setDepth(D.beast + b.y / 1000);
    s.shadow.setPosition(b.x, b.y + 2).setAlpha(b.fly ? 0.45 : 0.8);
    const key = s.hitT > 0 ? s.hit : s.frames[(Math.floor(s.phase / Math.PI) & 1)];
    if (s.spr.texture.key !== key) s.spr.setTexture(key);
    const squash = s.hitT > 0 ? 1 + s.hitT * 1.2 : 1;
    s.spr.setScale(s.scale * squash * (b.boss ? 1 : 1), s.scale / squash).setAngle(moving ? step * 4 : 0);
    this.tintBeast(s, b);
    this.starsOver(s, b, k, time);
    if (b.burnT > 0 && Math.random() < 0.3) this.em.burst('burn', 1, b.x + (Math.random() - 0.5) * k.size * 0.5, b.y - k.size * 0.3);
  }

  tintBeast(s, b) {
    if (s.flashT > 0) return void s.spr.setTintFill(0xffffff);
    const TINTS = [[b.freezeT > 0, 0x8fe3ff], [b.wailT > 0, 0xff9a9a], [b.slowT > 0, 0xbfe2ff], [b.id === this.g.focus, 0xffe0e0]];
    const t = TINTS.find(([on]) => on);
    if (t) s.spr.setTint(t[1]); else s.spr.clearTint();
  }

  starsOver(s, b, k, time) {
    const on = b.stunT > 0 || b.freezeT > 0;
    if (on && !s.stars) {
      s.stars = [0, 1, 2].map(() => this.add.image(b.x, b.y, b.freezeT > 0 ? 'shard' : 'star').setDepth(D.num - 3).setScale(0.45)
        .setTint(b.freezeT > 0 ? 0xbff2ff : 0xffe14d));
    }
    if (!on && s.stars) { s.stars.forEach((x) => x.destroy()); s.stars = null; }
    if (!s.stars) return;
    s.stars.forEach((x, i) => {
      const a = time / 200 + (i * Math.PI * 2) / 3;
      x.setPosition(b.x + Math.cos(a) * k.size * 0.32, s.spr.y - k.size * 0.86 + Math.sin(a) * 6).setAngle(time / 4);
    });
  }

  dropBeast(id, s, dead, at) {
    this.beasts.delete(id);
    s.stars?.forEach((x) => x.destroy());
    s.shadow.destroy();
    if (!dead) return void s.spr.destroy();
    s.spr.setTexture(s.hit).setTintFill(0xffffff);
    const dir = (at?.x ?? s.spr.x) < W / 2 ? -1 : 1;
    this.tweens.add({ targets: s.spr, y: s.spr.y - 60, x: s.spr.x + dir * 50, angle: dir * 200, scaleX: s.scale * 0.4, scaleY: s.scale * 0.4, alpha: 0,
      duration: 420, ease: 'Quad.out', onComplete: () => s.spr.destroy() });
    this.time.delayedCall(60, () => s.spr.active && s.spr.clearTint());
  }

  // ---- shots ---------------------------------------------------------------------------------------------------

  syncShots(dt) {
    const seen = new Set();
    for (const sh of this.g.shots) {
      seen.add(sh.id);
      let s = this.shotSprites.get(sh.id);
      if (!s) { s = this.makeShot(sh); this.shotSprites.set(sh.id, s); }
      this.poseShot(s, sh, dt);
    }
    for (const [id, s] of this.shotSprites) {
      if (seen.has(id)) continue;
      s.parts.forEach((p) => p.destroy());
      this.shotSprites.delete(id);
    }
  }

  makeShot(sh) {
    const SHOTS = {
      sword: () => [this.add.image(sh.x, sh.y, 'glow').setTint(0x5fc8ff).setBlendMode(Phaser.BlendModes.ADD).setScale(0.9).setDepth(D.shot - 1), this.add.image(sh.x, sh.y, 'sword').setDisplaySize(66, 66).setDepth(D.shot)],
      fox: () => [this.add.image(sh.x, sh.y, 'glow').setTint(0xd8f0ff).setScale(0.7).setBlendMode(Phaser.BlendModes.ADD).setDepth(D.shot)],
      foxfire: () => [this.add.image(sh.x, sh.y, 'yy-skills', 'foxfire-1').setScale(0.36).setDepth(D.shot)],
      huo: () => [this.add.image(sh.x, sh.y, 'fu-huo').setDisplaySize(26, 54).setDepth(D.shot), this.add.image(sh.x, sh.y, 'shadow').setDepth(D.shadow).setScale(0.5)],
      han: () => [this.add.image(sh.x, sh.y, 'fu-han').setDisplaySize(26, 54).setDepth(D.shot), this.add.image(sh.x, sh.y, 'shadow').setDepth(D.shadow).setScale(0.5)],
    };
    if (sh.kind === 'foxfire' && !this.textures.get('yy-skills').has('foxfire-1')) return { kind: sh.kind, parts: SHOTS.fox() };
    return { kind: sh.kind, parts: SHOTS[sh.kind](), t: 0 };
  }

  poseShot(s, sh, dt) {
    const [p, shadow] = s.kind === 'sword' ? [s.parts[1], s.parts[0]] : s.parts;
    s.t += dt;
    const TRAILS = { sword: 'trailSword', fox: 'trailFox', foxfire: 'trailFoxfire', huo: 'trailHuo', han: 'trailHan' };
    if (sh.lob) {
      p.setPosition(sh.x, sh.y - (sh.z ?? 0)).setAngle(s.t * 900);
      shadow?.setPosition(sh.x, sh.y);
    } else {
      p.setPosition(sh.x, sh.y);
      const a = Math.atan2(sh.vy, sh.vx);
      if (s.kind === 'sword') { p.setRotation(a + Math.PI / 4); shadow.setPosition(sh.x, sh.y); }
      if (s.kind === 'foxfire') p.setFrame(`foxfire-${1 + (Math.floor(s.t * 14) % 3)}`).setRotation(a + Math.PI / 2);
    }
    this.em[TRAILS[s.kind]].emitParticleAt(p.x, p.y, s.kind === 'sword' ? 2 : 1);
  }

  syncGrounds() {
    const live = new Set();
    for (const z of this.g.grounds) {
      live.add(z.id);
      if (!this.groundDecals.has(z.id)) {
        const d = this.add.image(z.x, z.y, 'scorch').setDepth(D.decal).setDisplaySize(z.r * 2.3, z.r * 1.4).setAlpha(0);
        this.tweens.add({ targets: d, alpha: 1, duration: 200 });
        this.groundDecals.set(z.id, d);
      }
      if (Math.random() < (this.calm ? 0.4 : 0.9)) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * z.r;
        this.em.burn.emitParticleAt(z.x + Math.cos(a) * r, z.y + Math.sin(a) * r * 0.6, 1);
      }
    }
    for (const [id, d] of this.groundDecals) {
      if (live.has(id)) continue;
      this.groundDecals.delete(id);
      this.tweens.add({ targets: d, alpha: 0, duration: 500, onComplete: () => d.destroy() });
    }
  }

  drawBars() {
    const g = this.bars.clear();
    for (const b of this.g.beasts) {
      if (b.boss || b.hp >= b.max) continue;
      const s = this.beasts.get(b.id);
      if (!s) continue;
      const w = Math.max(34, this.kit(b).size * 0.6), x = b.x - w / 2, y = s.spr.y - this.kit(b).size * 0.95;
      g.fillStyle(0x1b0d06, 0.85).fillRoundedRect(x - 2, y - 2, w + 4, 9, 4);
      g.fillStyle(0xff4b3a, 1).fillRoundedRect(x, y, Math.max(2, (w * b.hp) / b.max), 5, 2);
    }
  }

  // ---- numbers -------------------------------------------------------------------------------------------------

  pop(x, y, n, { tint = 0xffffff, big = false, weak = false } = {}) {
    if (this.nums.length > 70) this.nums.shift().o.destroy();
    const o = this.add.bitmapText(x + (Math.random() - 0.5) * 24, y, big ? 'numBig' : 'num', String(n)).setOrigin(0.5).setDepth(D.num);
    if (!big) o.setTint(tint);
    const base = big ? 1.05 : weak ? 0.5 : 0.72;
    o.setScale(0.1);
    this.nums.push({ o, t: 0, base, vx: (Math.random() - 0.5) * 50, vy: big ? -150 : -110, life: big ? 1 : 0.75 });
  }

  // A crowd takes many small hits a second: each beast's damage is summed for a beat and pops as ONE number (the
  // reference shows a few big numbers, never a wall of them).
  tally(e, y) {
    const t = (this.tallies ??= new Map());
    const cur = t.get(e.id) ?? { sum: 0, age: 0, kind: e.kind, big: false, weak: e.weak };
    cur.sum += e.dmg; cur.x = e.x; cur.y = y; cur.big ||= e.big; cur.weak &&= e.weak;
    if (e.dmg > (cur.top ?? 0)) { cur.top = e.dmg; cur.kind = e.kind; }
    t.set(e.id, cur);
  }

  flushTallies(dt) {
    for (const [id, c] of this.tallies ?? []) {
      c.age += dt;
      const dead = !this.g.beasts.some((b) => b.id === id);
      if (c.age < 0.16 && !dead) continue;
      this.tallies.delete(id);
      this.pop(c.x, c.y, c.sum, { tint: HIT_TINT[c.kind], big: c.big || c.sum >= 80, weak: c.weak });
    }
  }

  moveNums(dt) {
    this.flushTallies(dt);
    for (const n of this.nums) {
      n.t += dt;
      const k = n.t < 0.1 ? 0.3 + (n.t / 0.1) * 1.2 : n.t < 0.2 ? 1.5 - ((n.t - 0.1) / 0.1) * 0.5 : 1;
      n.o.setScale(n.base * k);
      n.o.x += n.vx * dt;
      n.o.y += n.vy * dt;
      n.vy += 220 * dt;
      n.o.setAlpha(n.t > n.life * 0.6 ? Math.max(0, 1 - (n.t - n.life * 0.6) / (n.life * 0.4)) : 1);
    }
    const gone = this.nums.filter((n) => n.t >= n.life);
    gone.forEach((n) => n.o.destroy());
    if (gone.length) this.nums = this.nums.filter((n) => n.t < n.life);
  }

  shake(ms, k) { if (!this.calm) this.cameras.main.shake(ms, k); }

  // ---- events → juice ------------------------------------------------------------------------------------------

  on(e) { this.ON[e.t]?.call(this, e); }

  ON = {
    hit(e) {
      const s = this.beasts.get(e.id);
      const size = s ? this.kit({ kind: s.kind }).size : 60;
      const y = e.y - size * 0.45;
      if (s) { s.flashT = 0.05; s.hitT = Math.max(s.hitT, 0.12); }
      this.tally(e, y - size * 0.3);
      const SPARK = { sword: ['hitStreak', 5], fox: ['spark', 4], thunder: ['bolt', 4], fire: ['spark', 2], frost: ['snow', 3], howl: ['spark', 2], ground: [null] };
      const [preset, n] = SPARK[e.kind] ?? ['spark', 3];
      if (preset) this.em.burst(preset, n, e.x, y);
      if (e.big) this.shake(90, 0.004);
    },
    kill(e) {
      const s = this.beasts.get(e.id);
      const size = this.g.kit.beasts[e.kind].size;
      this.em.burst('poof', e.boss ? 24 : 7, e.x, e.y - size * 0.3);
      this.em.burst('stars', e.boss ? 18 : 4, e.x, e.y - size * 0.5);
      this.em.burst('gold', e.boss ? 20 : 2, e.x, e.y - size * 0.4);
      if (s) this.dropBeast(e.id, s, true, e);
      if (e.boss) {
        this.hitStop = 0.12;
        this.shake(500, 0.014);
        this.cameras.main.flash(220, 255, 240, 200);
        this.em.burst('fire', 60, e.x, e.y - 60);
        this.em.burst('debris', 30, e.x, e.y);
      }
    },
    boom(e) {
      const BOOMS = {
        huo: () => {
          this.ring(e.x, e.y, e.r, 0xffb03a);
          this.em.burst('fire', 34, e.x, e.y);
          this.em.burst('smoke', 10, e.x, e.y);
          this.em.burst('debris', 10, e.x, e.y);
          this.flare(e.x, e.y, e.r * 2.2, 0xffd27a);
          this.shake(140, 0.006);
        },
        han: () => {
          this.ring(e.x, e.y, e.r, 0x9fe8ff);
          this.em.burst('frost', 22, e.x, e.y);
          this.em.burst('snow', 26, e.x, e.y);
          this.flare(e.x, e.y, e.r * 1.8, 0xbff4ff);
        },
        foxfire: () => {
          this.ring(e.x, e.y, e.r, 0x7fc8ff);
          this.em.burst('foxfire', 22, e.x, e.y);
          this.flare(e.x, e.y, e.r * 1.6, 0x9fd8ff);
        },
      };
      BOOMS[e.kind]?.();
    },
    chain(e) {
      jag(this.zap.clear(), e.pts, { color: 0xb68cff, width: 7 });
      this.zapT = 0.13;
      for (const p of e.pts.slice(1)) this.em.burst('bolt', 6, p.x, p.y - 20);
      this.xmCastPose();
    },
    strike(e) {
      jag(this.zap.clear(), [{ x: e.x + 40, y: -30 }, { x: e.x - 10, y: e.y * 0.5 }, { x: e.x, y: e.y - 10 }], { color: 0xd7a8ff, width: 16 });
      this.zapT = 0.2;
      this.ring(e.x, e.y, e.r * 1.4, 0xf3d0ff);
      this.flare(e.x, e.y, 260, 0xffffff);
      this.em.burst('bolt', 30, e.x, e.y);
      this.em.burst('debris', 12, e.x, e.y);
      this.cameras.main.flash(90, 230, 210, 255);
      this.shake(220, 0.01);
      this.hitStop = 0.05;
    },
    howl(e) {
      this.yyPose(['howl-1', 'howl-2', 'howl-2', 'howl-2', 'howl-1'], 0.16);
      for (let i = 0; i < 3; i += 1) this.time.delayedCall(i * 140, () => this.ring(e.x, e.y - 30, 620, 0xdcd2ff, 900));
      this.cameras.main.flash(160, 200, 190, 255);
      this.shake(200, 0.006);
    },
    wail(e) {
      this.ring(e.x, e.y - 60, 220, 0xff7a7a, 700);
      this.hud.bubbleAt(e.x, e.y - 190, this.w.wail, 1400);
      this.shake(300, 0.005);
    },
    cast(e) {
      if (e.who === 'xm') return this.xmCastPose();
      this.yyPose(['cast-1', 'cast-2']);
    },
    wall(e) {
      this.em.burst('dust', 3, e.x, this.g.level.wallY + 4);
      this.hud.wallHit();
      if (!this.calm) {
        this.wall.x = this.wallX + (Math.random() - 0.5) * 3;
        this.time.delayedCall(60, () => (this.wall.x = this.wallX));
      }
    },
    ground() {},
    spawn() {},
    picked(e) { this.hud.picked(e.id, this.g); },
    wave(e) {
      this.hud.waveBanner(e.n, e.of);
      this.fact({ t: 'wave', n: e.n });
    },
    clear(e) {
      if (e.n < this.g.waves) this.hud.clearBanner(e.n);
      this.moment('wave_cleared');
      this.fact({ t: 'wave_cleared', n: e.n });
    },
    offer(e) { this.time.delayedCall(900, () => this.hud.offer(e.cards, this.g, (id) => this.choose(id))); },
    boss() {
      this.hud.bossBanner();
      this.cameras.main.flash(300, 120, 0, 0);
      this.shake(400, 0.008);
      this.moment('boss');
      this.fact({ t: 'boss' });
    },
    low() {
      this.moment('low');
      this.fact({ t: 'low' });
    },
    won(e) { this.finish(true, e.stars); },
    lost() { this.finish(false, 0); },
  };

  xmCastPose() {
    this.xm.setTexture(this.tex('xiaoman-cast', 'xiaoman-idle'));
    this.xmCast = 0.16;
    this.em.burst('spark', 3, HERO.x + 14, HERO.y - 70);
  }

  ring(x, y, r, color, ms = 380) {
    const o = this.add.image(x, y, 'ring').setDepth(D.fx).setTint(color).setBlendMode(Phaser.BlendModes.ADD).setScale(0.1).setAlpha(1);
    this.tweens.add({ targets: o, scaleX: (r * 2) / 100, scaleY: (r * 1.3) / 100, alpha: 0, duration: ms, ease: 'Cubic.out', onComplete: () => o.destroy() });
  }

  flare(x, y, size, color) {
    const o = this.add.image(x, y, 'glow').setDepth(D.fx).setTint(color).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(size, size * 0.8).setAlpha(0.95);
    this.tweens.add({ targets: o, alpha: 0, duration: 260, onComplete: () => o.destroy() });
  }

  // ---- 银月's lines and the facts out ----------------------------------------------------------------------------

  /** A key moment: her prefetched line (the host's `lines`, else the level's default), over her head. */
  moment(name) {
    const pool = this.cfg.lines?.[name] ?? this.g.level.moments?.[name];
    if (!pool?.length) return;
    const line = pool[Math.floor(Math.random() * pool.length)];
    this.say('yinyue', typeof line === 'string' ? line : line[this.lang] ?? line.zh);
  }

  say(who, text) {
    const at = who === 'xiaoman' ? [HERO.x + 30, HERO.y - 130] : [FOX.x - 10, FOX.y - 90];
    this.hud.bubbleAt(at[0], at[1], text, 2200);
  }

  fact(f) { this.cfg.onEvent?.(f); }

  finish(won, stars) {
    if (this.done) return;
    this.done = true;
    if (won) this.moment('win');
    this.fact({ t: 'end', won, stars });
    this.time.delayedCall(won ? 900 : 600, () => {
      this.hud.result(won, stars, this.g);
      this.cfg.onEnd?.({ won, stars, stats: { kills: this.g.kills, wall: Math.round((100 * this.g.wall) / this.g.wallMax) } });
    });
  }
}

