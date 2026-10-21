// play.js — 守墙关's scene: draws what the engine (scripts/games/shouqiang/core.js) holds, turns its events into
// juice, and takes the two inputs the game has: a card pick, and (optional) a tap on a beast to focus it.
import * as Phaser from 'phaser';
import { newGame, step, pick, setFocus, reachY, castJieyin, HERO, FOX, HAND, W, H } from 'shouqiang-core';
import { makeTextures, makeNumberFont, makeEmitters, jag } from './fx.js';
import { Hud, WORDS, bar, setBarW, wordsFor } from './hud.js';
import { LaneView, SIDE } from './lanes.js';

const ICONS = ['jian-more', 'jian-pierce', 'jian-arc', 'huo-blast', 'huo-ground', 'han-slow', 'han-freeze', 'lei-chain', 'lei-strike', 'yy-foxfire', 'yy-howl'];
const HIT_TINT = { spell: 0xffd27a, sword: 0xffffff, fire: 0xffb347, frost: 0x9fe8ff, thunder: 0xfff27a, fox: 0xcfe0ff, howl: 0xd9c2ff, ground: 0xff9a52 };
const TRAILS = { sword: 'trailSword', fox: 'trailFox', foxfire: 'trailFoxfire', huo: 'trailHuo', han: 'trailHan' };
// 结印's spells by element (五行): the trail, the tint of the light, the burst. No element (剑诀's 飞剑): the sword's.
const WUXING = { fire: ['trailHuo', 0xffa040, 'fire'], water: ['trailHan', 0x9fe8ff, 'frost'], metal: ['trailSword', 0xfff2c0, 'hitStreak'],
  wood: ['trailFoxfire', 0x8fe07a, 'spark'], earth: ['trailHuo', 0xd9a35a, 'debris'], none: ['trailSword', 0x7fd0ff, 'hitStreak'] };
const wuxingOf = (w) => WUXING[w] ?? WUXING.none;
const SPARK = { sword: ['hitStreak', 5], fox: ['spark', 4], thunder: ['bolt', 4], fire: ['spark', 2], frost: ['snow', 3], howl: ['spark', 2], ground: [null] };
const SPARK_ELSE = ['spark', 3];
// Quality steps, taken one at a time (never back up) when frames keep missing the budget: the look stays; a slow device
// first gets fewer particles, then a canvas at the board's own size, then fewer particles again.
export const ZOOM_MAX = 1.5;
const QUALITY = [{ budget: 1, zoom: null }, { budget: 0.6, zoom: null }, { budget: 0.6, zoom: 1 }, { budget: 0.35, zoom: 1 }];
const SLOW_MS = 1000 / 45;
const D = { bg: 0, decal: 2, ground: 3, shadow: 4, beast: 10, wall: 20, hero: 30, shot: 40, fx: 50, num: 60, light: 70, hud: 80, modal: 90 };

export class PlayScene extends Phaser.Scene {
  constructor() { super('play'); }

  init(cfg) {
    this.cfg = cfg;
    this.lang = cfg.lang === 'en' ? 'en' : 'zh';
    this.w = wordsFor(WORDS[this.lang], cfg.level?.words, this.lang);
  }

  preload() {
    const art = `${this.cfg.base}art/`;
    const img = (k, file = k) => this.load.image(k, `${art}${file}.webp`);
    const base = ['bg', 'wall', 'xiaoman-idle', 'xiaoman-cast', 'fu-huo', 'fu-han', 'fu-lei', 'sword'];
    for (const k of base) img(k);
    // a level's own pictures (`art`: 守白菜's plot, 阿禾, 小满 beside her, the 竹竿 and the 土坷垃), unless the kit loads them anyway
    for (const k of new Set(Object.values(this.cfg.level.art ?? {}).filter((v) => typeof v === 'string' && !base.includes(v)))) if (!this.cfg.level.grid) img(k);
    // …and its own cards' icons (守白菜's 竹竿: icon-gan-*)
    for (const c of this.cfg.level.cards ?? []) if (c.icon && !ICONS.includes(c.icon.replace(/^icon-/, ''))) img(c.icon);
    for (const [b, k] of Object.entries(this.cfg.kit.beasts)) for (const f of k.frames ?? []) img(`${b}-${f}`);
    for (const k of ICONS) img(`icon-${k}`);
    if (this.cfg.level.grid) LaneView.preload(this, this.cfg.level, art);
    // 结印's 火蛋 (games/jieyin/art, local FLUX): only a page that offers 结印 casts it.
    if (this.cfg.kit.jieyin) this.load.image('jy-huodan', `${this.cfg.base}../jieyin/art/huodan.webp`);
    const yy = `${this.cfg.base}../shoulu/art/`;
    this.load.image('yy-sheet', `${yy}yinyue.webp`);
    this.load.image('yy-skills', `${yy}yinyue-skills.webp`);
    this.load.json('yy-meta', `${yy}yinyue.json`);
    this.missing = new Set();
    this.load.on('loaderror', (f) => this.missing.add(f.key));
    const bar = this.add.graphics();
    this.load.on('progress', (p) => {
      bar.clear().fillStyle(0x000000, 0.4).fillRect(120, 470, 300, 20).fillStyle(0xffd34d, 1).fillRect(122, 472, 296 * p, 16);
    });
    this.load.on('complete', () => bar.destroy());
  }

  /** A texture that loaded, else its stand-in (a beast's second walk frame → its first). */
  tex(k, fallback) { return !k || this.missing.has(k) || !this.textures.exists(k) ? fallback : k; }

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
    this.quality = 0;
    this.frameMs = 1000 / 60;
    this.qualityAt = 4000; // never judge the first seconds (textures upload, the font settles)
    this.frame = 0;
    this.world();
    this.beasts = new Map();
    this.shotSprites = new Map();
    this.groundDecals = new Map();
    this.nums = [];
    this.zap = this.add.graphics().setDepth(D.fx + 1).setBlendMode(Phaser.BlendModes.ADD);
    this.zapT = 0;
    this.reticle = this.add.image(0, 0, 'reticle').setDepth(D.num - 2).setVisible(false).setScale(0.8);
    this.hud = new Hud(this, { depth: D.hud, modal: D.modal });
    this.lanes = level.grid ? new LaneView(this, D) : null;
    this.paused = false;
    this.input.on('pointerdown', (p) => this.tapField(p));
    this.input.on('pointerup', (p) => this.lanes?.release(p));
    this.events.once('shutdown', () => { this.hud.destroy(); this.offShell?.(); });
    // In the one shell (games/shell.js): the shell's bar pauses it and its foot shows the result, so the canvas's own
    // pause button and result screen stand down — nothing twice.
    if (this.cfg.shell) {
      this.hud.pauseBtn.setVisible(false).disableInteractive();
      this.offShell = this.cfg.shell.onPause?.((on) => this.setPaused(on, false));
    }
    // `held` (the shell's lead card is up): the field is drawn and stands still behind it; `go()` starts the lead-in.
    this.held = Boolean(this.cfg.hold?.on);
    if (!this.held) this.leadIn();
    if (this.lanes) this.layout(Boolean(this.cfg.landscape));
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
    const art = this.g.level.art ?? {};
    const bg = this.add.image(W / 2, H / 2, this.tex(art.bg, 'bg')).setDepth(D.bg);
    bg.setScale(Math.max(W / bg.width, H / bg.height) * 1.02);
    // The light band (a slow diagonal shaft over the road) and the vignette: the reference's lighting. The 药园 is at
    // night: no sun shaft there.
    if (!this.g.grid) {
      this.band = this.add.image(W * 0.55, H * 0.36, 'band').setDepth(D.light).setBlendMode(Phaser.BlendModes.ADD)
        .setAngle(-28).setDisplaySize(W * 2.2, 230).setAlpha(0.42);
      if (!this.calm) this.tweens.add({ targets: this.band, alpha: 0.26, x: W * 0.47, duration: 5200, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }
    this.add.image(W / 2, H / 2, 'vignette').setDisplaySize(W, H).setDepth(D.light + 1);
    if (this.g.level.rangeLine !== false) this.rangeLine();
    const wy = this.g.level.wallY;
    this.wall = this.add.image(W / 2, wy - 22, this.tex(art.wall, 'wall')).setOrigin(0.5, 0).setDepth(D.wall);
    this.wall.setScale((W + 30) / this.wall.width);
    this.wallX = this.wall.x;
    this.add.image(HERO.x, HERO.y + 26, 'shadow').setDepth(D.hero - 1).setScale(1.3, 1.2);
    // The hero: 小满, or a level's own (`art.hero` · `art.heroCast` — 守白菜: 阿禾 with her 竹竿)
    this.heroIdle = this.tex(art.hero, 'xiaoman-idle');
    this.heroCast = this.tex(art.heroCast, art.hero ? this.heroIdle : 'xiaoman-cast');
    this.xm = this.add.image(HERO.x, HERO.y + 30, this.heroIdle).setOrigin(0.5, 1).setDepth(D.hero);
    this.xmScale = 150 / this.xm.height;
    this.xm.setScale(this.xmScale);
    this.tweens.add({ targets: this.xm, scaleY: this.xmScale * 1.03, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    // His sword hovers at his raised hand as its own sprite, tip UP the road toward the beasts (the painted frames
    // hold no blade: Hanli 10-20 「不要剑锋对着自己」); it bobs, glows, and is gone for a beat while a volley launches.
    this.handGlow = this.add.image(HAND.x, HAND.y, 'glow').setDepth(D.hero + 1).setBlendMode(Phaser.BlendModes.ADD).setTint(0x7fd0ff).setScale(1.1).setAlpha(0.5);
    this.handSword = this.add.image(HAND.x, HAND.y, 'sword').setDisplaySize(58, 58).setRotation(-Math.PI / 4).setDepth(D.hero + 2);
    this.handBack = 0;
    this.xmAura = this.add.image(HERO.x, HERO.y - 20, 'glow').setDepth(D.hero - 1).setBlendMode(Phaser.BlendModes.ADD).setScale(2.4).setTint(0x7fd0ff).setAlpha(0.25);
    // `art.hand: null` — nothing hovers at the hero's hand (阿禾 holds her pole); no aura (no 灵气 yet)
    this.noHand = 'hand' in art && !art.hand;
    if (this.noHand) { this.handSword.setVisible(false); this.handGlow.setVisible(false); this.xmAura.setVisible(false); }
    this.add.image(FOX.x, FOX.y + 24, 'shadow').setDepth(D.hero - 1).setScale(1.2, 1);
    // beside the hero: 银月, or a level's own (`art.side` — 守白菜: 小满, before he ever meets her)
    this.side = art.side ? this.add.image(FOX.x, FOX.y + 30, this.tex(art.side, 'xiaoman-idle')).setOrigin(0.5, 1).setDepth(D.hero) : null;
    if (this.side) { this.sideScale = 112 / this.side.height; this.side.setScale(this.sideScale); }
    const yyKey = !this.side && this.textures.get('yy-sheet').has('idle-1') ? 'yy-sheet' : null;
    this.yy = yyKey ? this.add.image(FOX.x, FOX.y + 26, 'yy-sheet', 'idle-1').setOrigin(0.5, this.yyFoot ?? 0.97).setDepth(D.hero) : null;
    if (this.yy) {
      this.yyScale = 92 / 150;
      this.yy.setScale(this.yyScale);
      this.yyIdle = 0;
    }
  }

  // The range line (Hanli 10-20: 「让怪出现在攻击范围外, 让玩家能看到」): 小满's and 银月's reach ends here. A rope of
  // talismans strung across the road on a band of mist; above it the horde walks in, seen and untouchable.
  rangeLine() {
    const y = reachY(this.g);
    if (!Number.isFinite(y)) return;
    this.add.image(W / 2, y, 'band').setDisplaySize(W * 1.15, 110).setTint(0xeaf6ff).setAlpha(0.32).setDepth(D.ground);
    const spans = 5, pts = [];
    for (let i = 0; i <= spans * 8; i += 1) {
      const t = i / 8, x = -12 + ((W + 24) * t) / spans;
      pts.push(new Phaser.Math.Vector2(x, y - 8 + Math.sin(Math.PI * (t % 1)) * 9));
    }
    this.add.graphics().setDepth(D.ground).lineStyle(5, 0x2e1a0c, 0.85).strokePoints(pts).lineStyle(2, 0xe2c27e, 0.95).strokePoints(pts);
    const FU = ['fu-huo', 'fu-han', 'fu-lei'];
    for (let i = 0; i < spans; i += 1) {
      const x = -12 + ((W + 24) * (i + 0.5)) / spans;
      const fu = this.add.image(x, y + 1, FU[i % 3]).setOrigin(0.5, 0.04).setDisplaySize(20, 42).setDepth(D.ground).setAlpha(0.95);
      if (!this.calm) this.tweens.add({ targets: fu, angle: { from: -5, to: 5 }, duration: 1300 + i * 170, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }
  }

  /** Option A: landscape puts the same portrait field in the middle with side panels; portrait shows the field alone. */
  layout(landscape) {
    if (!this.lanes) return;
    const z = this.cameras.main.zoom;
    const gw = landscape ? W + 2 * SIDE : W;
    this.scale.setGameSize(Math.round(gw * z), Math.round(H * z));
    this.cameras.main.setSize(Math.round(gw * z), Math.round(H * z)).setZoom(z).centerOn(W / 2, H / 2);
    this.lanes.layout(landscape);
    this.hud.layout(landscape);
  }

  // ---- input ---------------------------------------------------------------------------------------------------

  tapField(p) {
    if (this.hud.modalOpen || this.paused) return;
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    if (wp.x < 0 || wp.x > W) return;
    if (this.lanes?.tap(wp)) return;
    if (wp.y > this.g.level.wallY + 30) return;
    let best = null, bd = 80;
    for (const b of this.g.beasts) {
      const d = Math.hypot(b.x - wp.x, b.y - (b.r * 0.6) - wp.y);
      if (b.hp > 0 && d < bd) { best = b; bd = d; }
    }
    setFocus(this.g, best?.id ?? null);
    if (best) this.em.burst('spark', 6, best.x, best.y - 20);
  }

  go() {
    if (!this.held) return;
    this.held = false;
    this.leadIn();
  }

  // The lead-in. With an opening pick, only the story lines read here; the big 「兽潮来袭！」 banners and the how-to hint
  // wait for the count-in after the pick, right before the beasts come.
  leadIn() {
    const { lead = [], leadSec = 5 } = this.g.level;
    if (!this.g.opening) return this.hud.lead(lead, leadSec);
    this.hud.lead(lead.filter((l) => !l.big), leadSec, { hint: false });
  }

  // The opening chosen: 小满's raised hand holds that line's talisman (his sword only on the 剑阵 line), and the count-in
  // into wave 1 carries the big banners.
  opened(e) {
    const FU = { huo: ['fu-huo', 0xffa040], lei: ['fu-lei', 0xc08bff] };
    if (FU[e.line]) {
      this.handSword.setTexture(FU[e.line][0]).setDisplaySize(30, 62).setRotation(0);
      this.handGlow.setTint(FU[e.line][1]).setScale(1.3);
    }
    this.hud.lead((this.g.level.lead ?? []).filter((l) => l.big), this.g.level.countIn ?? 3.4);
    this.fact({ t: 'opening', line: e.line });
  }

  togglePause() { this.setPaused(!this.paused, true); }

  setPaused(on, veil) {
    if (this.paused === on) return;
    this.paused = on;
    if (veil) this.hud.showPause(on);
    if (on) this.tweens.pauseAll(); else this.tweens.resumeAll();
  }

  choose(id) {
    pick(this.g, id);
  }

  // ---- 结印 (games/jieyin/helper.js makes the seals at the camera; the page calls these) ---------------------------

  /** A move made at the camera: its spell flies (true), or not now (no 大妖 out, resting, nothing in reach). */
  jieyin(id) {
    if (this.paused || this.held || this.done) return false;
    return castJieyin(this.g, id);
  }

  // ---- the frame -----------------------------------------------------------------------------------------------

  update(time) {
    // Phaser's own `delta` is smoothed and held to the 60 fps target (a 60 ms frame reports ~17), so a slow device
    // played in slow motion and never looked slow. The raw frame time drives both the clock and the budget.
    const raw = this.game.loop.rawDelta || 1000 / 60;
    this.frame += 1;
    this.watchFrames(time, raw);
    const dt = Math.min(raw, 50) / 1000;
    if (!this.paused && !this.hitStop && !this.held) step(this.g, dt);
    if (this.hitStop) this.hitStop = Math.max(0, this.hitStop - dt);
    for (const e of this.g.events) this.on(e);
    this.g.events.length = 0;
    if (this.paused) return;
    this.syncBeasts(time, dt);
    this.syncShots(dt);
    this.syncGrounds();
    this.moveNums(dt);
    this.heroes(dt);
    this.lanes?.update(dt);
    if (this.zapT > 0 && (this.zapT -= dt) <= 0) this.zap.clear();
    this.hud.update(this.g, dt, this.game.loop.actualFps);
  }

  // The frame budget: a running mean of the frame time; 2 s over budget (under ~45 fps) → one quality step down.
  watchFrames(time, delta) {
    if (this.paused || document.hidden || delta > 250) return;
    this.frameMs += (delta - this.frameMs) * 0.03;
    if (this.frameMs < SLOW_MS) { this.slowSince = null; return; }
    this.slowSince ??= time;
    if (time < this.qualityAt || time - this.slowSince < 2000 || this.quality >= QUALITY.length - 1) return;
    this.setQuality(this.quality + 1);
    this.qualityAt = time + 3000;
    this.slowSince = null;
  }

  setQuality(q) {
    const was = QUALITY[this.quality], now = QUALITY[q];
    this.quality = q;
    this.em.budget = now.budget * (this.calm ? 0.45 : 1);
    const zoom = Math.min(this.cfg.zoom ?? 1, now.zoom ?? Infinity);
    if (zoom !== Math.min(this.cfg.zoom ?? 1, was.zoom ?? Infinity)) {
      const gw = this.lanes?.landscape ? W + 2 * SIDE : W;
      this.scale.setGameSize(Math.round(gw * zoom), Math.round(H * zoom));
      this.cameras.main.setSize(Math.round(gw * zoom), Math.round(H * zoom)).setZoom(zoom).centerOn(W / 2, H / 2);
    }
    this.fact({ t: 'quality', q });
  }

  heroes(dt) {
    if (this.xmCast > 0 && (this.xmCast -= dt) <= 0) this.xm.setTexture(this.heroIdle);
    if (this.side) this.side.setScale(this.sideScale, this.sideScale * (1 + Math.sin(this.time.now / 210) * 0.025));
    this.xmAura.setAlpha(0.18 + Math.sin(this.time.now / 300) * 0.06);
    const bob = Math.sin(this.time.now / 380) * 4;
    if (this.handBack > 0) this.handBack = Math.max(0, this.handBack - dt);
    const back = this.noHand || this.handBack > 0 ? 0 : 1;
    this.handSword.setPosition(HAND.x, HAND.y + bob).setAlpha(back);
    this.handGlow.setPosition(HAND.x, HAND.y + bob).setAlpha(back * (0.42 + Math.sin(this.time.now / 260) * 0.1));
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

  // Sprites follow the engine's beasts; one gone from the engine (killed: its sprite went with the kill event) drops.
  // A frame stamp marks the live ones — no Set allocated a frame.
  syncBeasts(time, dt) {
    let f = null;
    for (const b of this.g.beasts) {
      const s = this.beasts.get(b.id) ?? this.makeBeast(b);
      s.seen = this.frame;
      this.poseBeast(s, b, time, dt);
      if (b.id === this.g.focus) f = b;
    }
    for (const [id, s] of this.beasts) if (s.seen !== this.frame) this.dropBeast(id, s, false);
    this.reticle.setVisible(Boolean(f));
    if (f) this.reticle.setPosition(f.x, f.y - this.kit(f).size * 0.42).setAngle(time / 8);
  }

  kit(b) { return this.g.beastKit[b.kind]; }

  makeBeast(b) {
    const k = this.kit(b);
    const walk1 = `${b.kind}-walk-1`;
    const spr = this.add.image(b.x, b.y, walk1).setOrigin(0.5, 0.86);
    const scale = k.size / spr.height;
    spr.setScale(scale);
    const shadow = this.add.image(b.x, b.y, 'shadow').setDepth(D.shadow).setScale(k.size / 64 * (b.fly ? 0.7 : 1.05), k.size / 64);
    const s = { spr, shadow, scale, kind: b.kind, hitT: 0, flashT: 0, phase: Math.random() * 6, frames: [walk1, this.tex(`${b.kind}-walk-2`, walk1)],
      hit: this.tex(`${b.kind}-hit`, walk1), stars: null, tint: null, hpW: Math.max(34, k.size * 0.6), hpBg: null, hpFill: null };
    if (!b.boss) {
      s.hpBg = bar(this, 0, 0, s.hpW + 4, 9, 4, 0x1b0d06, 0.85).setDepth(D.num - 1).setVisible(false);
      s.hpFill = bar(this, 0, 0, s.hpW, 5, 2, 0xff4b3a).setDepth(D.num - 1).setVisible(false);
    }
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
    s.spr.setPosition(b.x, b.y - lift + lunge - (b.z ?? 0)).setDepth(D.beast + b.y / 1000 + (b.z ? 0.2 : 0));
    s.shadow.setPosition(b.x, b.y + 2).setAlpha(b.fly ? 0.45 : 0.8);
    const key = s.hitT > 0 ? s.hit : s.frames[(Math.floor(s.phase / Math.PI) & 1)];
    if (s.spr.texture.key !== key) s.spr.setTexture(key);
    const squash = s.hitT > 0 ? 1 + s.hitT * 1.2 : 1;
    s.spr.setScale(s.scale * squash * (b.boss ? 1 : 1), s.scale / squash).setAngle(moving ? step * 4 : 0);
    this.tintBeast(s, b);
    this.starsOver(s, b, k, time);
    this.hpBar(s, b, k);
    if (b.burnT > 0 && Math.random() < 0.3) this.em.burst('burn', 1, b.x + (Math.random() - 0.5) * k.size * 0.5, b.y - k.size * 0.3);
  }

  tintBeast(s, b) {
    const t = s.flashT > 0 ? 'flash' : b.freezeT > 0 ? 0x8fe3ff : b.wailT > 0 ? 0xff9a9a : b.slowT > 0 ? 0xbfe2ff : b.id === this.g.focus ? 0xffe0e0 : null;
    if (t === s.tint) return;
    s.tint = t;
    if (t === 'flash') s.spr.setTintFill(0xffffff);
    else if (t === null) s.spr.clearTint();
    else s.spr.setTint(t);
  }

  hpBar(s, b, k) {
    if (!s.hpBg) return;
    const on = b.hp < b.max;
    s.hpBg.setVisible(on);
    s.hpFill.setVisible(on);
    if (!on) return;
    const x = b.x - s.hpW / 2, y = s.spr.y - k.size * 0.95;
    s.hpBg.setPosition(x - 2, y - 2);
    setBarW(s.hpFill.setPosition(x, y), (s.hpW * b.hp) / b.max);
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
    s.hpBg?.destroy();
    s.hpFill?.destroy();
    if (!dead) return void s.spr.destroy();
    s.spr.setTexture(s.hit).setTintFill(0xffffff).setVisible(true);
    const dir = (at?.x ?? s.spr.x) < W / 2 ? -1 : 1;
    this.tweens.add({ targets: s.spr, y: s.spr.y - 60, x: s.spr.x + dir * 50, angle: dir * 200, scaleX: s.scale * 0.4, scaleY: s.scale * 0.4, alpha: 0,
      duration: 420, ease: 'Quad.out', onComplete: () => s.spr.destroy() });
    this.time.delayedCall(60, () => s.spr.active && s.spr.clearTint());
  }

  // ---- shots ---------------------------------------------------------------------------------------------------

  syncShots(dt) {
    for (const sh of this.g.shots) {
      let s = this.shotSprites.get(sh.id);
      if (!s) { s = this.makeShot(sh); this.shotSprites.set(sh.id, s); }
      s.seen = this.frame;
      this.poseShot(s, sh, dt);
    }
    for (const [id, s] of this.shotSprites) {
      if (s.seen === this.frame) continue;
      s.parts.forEach((p) => p.destroy());
      this.shotSprites.delete(id);
    }
  }

  makeShot(sh) {
    const SHOTS = {
      sword: () => [this.add.image(sh.x, sh.y, 'glow').setTint(0x5fc8ff).setBlendMode(Phaser.BlendModes.ADD).setScale(0.9).setDepth(D.shot - 1), this.add.image(sh.x, sh.y, 'sword').setDisplaySize(66, 66).setDepth(D.shot)],
      fox: () => [this.add.image(sh.x, sh.y, 'glow').setTint(0xd8f0ff).setScale(0.7).setBlendMode(Phaser.BlendModes.ADD).setDepth(D.shot)],
      // a level's own shots (`art.shot` for the hero's, `art.sideShot` for the one beside: 守白菜's 竹竿 and 土坷垃)
      own: (key, size) => [this.add.image(sh.x, sh.y, 'glow').setTint(0xfff4d0).setScale(0.6).setBlendMode(Phaser.BlendModes.ADD).setDepth(D.shot - 1), this.add.image(sh.x, sh.y, key).setDisplaySize(size, size).setDepth(D.shot)],
      foxfire: () => [this.add.image(sh.x, sh.y, 'yy-skills', 'foxfire-1').setScale(0.36).setDepth(D.shot)],
      huo: () => [this.add.image(sh.x, sh.y, 'fu-huo').setDisplaySize(26, 54).setDepth(D.shot), this.add.image(sh.x, sh.y, 'shadow').setDepth(D.shadow).setScale(0.5)],
      han: () => [this.add.image(sh.x, sh.y, 'fu-han').setDisplaySize(26, 54).setDepth(D.shot), this.add.image(sh.x, sh.y, 'shadow').setDepth(D.shadow).setScale(0.5)],
      spell: () => this.spellParts(sh),
    };
    if (sh.lane != null) return { kind: sh.kind, parts: this.lanes.boltParts(sh), t: 0 };
    const A = this.g.level.art ?? {};
    if (sh.kind === 'sword' && A.shot && this.tex(A.shot)) return { kind: 'sword', parts: SHOTS.own(A.shot, 56), t: 0 };
    if ((sh.kind === 'fox' || sh.kind === 'foxfire') && A.sideShot && this.tex(A.sideShot)) return { kind: 'clod', parts: SHOTS.own(A.sideShot, 26), t: 0 };
    if (sh.kind === 'foxfire' && !this.textures.get('yy-skills').has('foxfire-1')) return { kind: sh.kind, parts: SHOTS.fox() };
    return { kind: sh.kind, parts: SHOTS[sh.kind](), t: 0 };
  }

  // A spell in flight: 飞剑 the sword, 火弹 the 火蛋, the others a glow in their element's colour.
  spellParts(sh) {
    const [, tint] = wuxingOf(sh.wuxing);
    const glow = this.add.image(sh.x, sh.y, 'glow').setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setScale(1.1).setDepth(D.shot - 1);
    const body = sh.move === 'feijian' ? this.add.image(sh.x, sh.y, 'sword').setDisplaySize(72, 72)
      : sh.move === 'huodan' || sh.move === 'huodan4' ? this.add.image(sh.x, sh.y, this.tex('jy-huodan', 'glow')).setDisplaySize(52, 52) : null;
    return body ? [body.setDepth(D.shot), glow] : [glow];
  }

  poseShot(s, sh, dt) {
    const [p, shadow] = s.kind === 'sword' || s.kind === 'clod' || sh.lane != null ? [s.parts[1], s.parts[0]] : s.parts;
    s.t += dt;
    if (sh.lane != null) {
      p.setPosition(sh.x, sh.y);
      shadow.setPosition(sh.x, sh.y);
      return;
    }
    if (sh.lob && s.kind === 'spell') {
      const y = sh.y - (sh.z ?? 0) * (sh.move === 'feijian' ? 0.3 : 1);
      p.setPosition(sh.x, y);
      shadow?.setPosition(sh.x, y);
      if (sh.move === 'feijian') p.setRotation(Math.atan2(sh.toY - sh.fromY, sh.toX - sh.fromX) + Math.PI / 4); else p.setAngle(s.t * 600);
    } else if (sh.lob) {
      p.setPosition(sh.x, sh.y - (sh.z ?? 0)).setAngle(s.t * 900);
      shadow?.setPosition(sh.x, sh.y);
    } else {
      p.setPosition(sh.x, sh.y);
      const a = Math.atan2(sh.vy, sh.vx);
      // The sword's art points up-right (−45°): +45° turns its tip along the flight (the engine never flies one down).
      if (s.kind === 'sword') { p.setRotation(a + Math.PI / 4); shadow.setPosition(sh.x, sh.y); }
      if (s.kind === 'clod') { p.setAngle(s.t * 720); shadow.setPosition(sh.x, sh.y); }
      if (s.kind === 'foxfire') p.setFrame(`foxfire-${1 + (Math.floor(s.t * 14) % 3)}`).setRotation(a + Math.PI / 2);
    }
    const trail = s.kind === 'spell' ? wuxingOf(sh.wuxing)[0] : TRAILS[s.kind === 'clod' ? 'fox' : s.kind];
    if (this.em.budget >= 1 || Math.random() < this.em.budget) this.em[trail].emitParticleAt(p.x, p.y, s.kind === 'sword' || s.kind === 'spell' ? 2 : 1);
  }

  syncGrounds() {
    for (const z of this.g.grounds) {
      let d = this.groundDecals.get(z.id);
      if (!d) {
        d = this.add.image(z.x, z.y, 'scorch').setDepth(D.decal).setDisplaySize(z.r * 2.3, z.r * 1.4).setAlpha(0);
        this.tweens.add({ targets: d, alpha: 1, duration: 200 });
        this.groundDecals.set(z.id, d);
      }
      d.seen = this.frame;
      if (Math.random() < (this.calm ? 0.4 : 0.9)) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * z.r;
        this.em.burn.emitParticleAt(z.x + Math.cos(a) * r, z.y + Math.sin(a) * r * 0.6, 1);
      }
    }
    for (const [id, d] of this.groundDecals) {
      if (d.seen === this.frame) continue;
      this.groundDecals.delete(id);
      this.tweens.add({ targets: d, alpha: 0, duration: 500, onComplete: () => d.destroy() });
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
    let k = 0;
    for (const n of this.nums) if (n.t >= n.life) n.o.destroy(); else this.nums[k++] = n;
    this.nums.length = k;
  }

  shake(ms, k) { if (!this.calm) this.cameras.main.shake(ms, k); }

  // ---- events → juice ------------------------------------------------------------------------------------------

  on(e) {
    this.ON[e.t]?.call(this, e);
    this.lanes?.on(e);
  }

  ON = {
    hit(e) {
      const s = this.beasts.get(e.id);
      const size = s ? this.kit({ kind: s.kind }).size : 60;
      const y = e.y - size * 0.45;
      if (s) { s.flashT = 0.05; s.hitT = Math.max(s.hitT, 0.12); }
      this.tally(e, y - size * 0.3);
      const [preset, n] = SPARK[e.kind] ?? SPARK_ELSE;
      if (preset) this.em.burst(preset, n, e.x, y);
      if (e.big) this.shake(90, 0.004);
    },
    kill(e) {
      const s = this.beasts.get(e.id);
      const size = this.g.beastKit[e.kind].size;
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
        spell: () => this.spellBoom(e),
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
    roar(e) {
      const b = this.g.beasts.find((o) => o.id === e.id);
      const y = e.y - (b ? this.kit(b).size : 120) * 0.5;
      for (let i = 0; i < 2; i += 1) this.time.delayedCall(i * 220, () => this.ring(e.x, y, 300, 0xffb08a, 700));
      this.em.burst('dust', 10, e.x, e.y);
      this.hud.bubbleAt(e.x, e.y - 200, this.w.roar, 1400);
      this.shake(500, 0.012);
    },
    fade(e) {
      this.em.burst('spark', 5, e.x, e.y);
      this.flare(e.x, e.y, 80, 0xcfeaff);
    },
    wail(e) {
      this.ring(e.x, e.y - 60, 220, 0xff7a7a, 700);
      this.hud.bubbleAt(e.x, e.y - 190, this.w.wail, 1400);
      this.shake(300, 0.005);
    },
    cast(e) {
      if (e.who === 'xm') { if (e.kind === 'sword' || e.kind === this.g.main) this.handBack = 0.32; return this.xmCastPose(); }
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
    spawn(e) {
      // 银月's line for the level's new beast, the first time it shows (the lesson comes with the beast).
      if (this.g.grid && e.kind === this.g.level.twist && !this.twistSaid) { this.twistSaid = true; this.time.delayedCall(1200, () => this.moment('twist')); }
    },
    huge() { this.moment('huge'); this.fact({ t: 'huge' }); },
    picked(e) {
      this.hud.picked(e.gives ?? e.id, this.g);
      if (e.opening) this.opened(e);
    },
    wave(e) {
      if (this.g.level.huge?.includes(e.n)) this.time.delayedCall(1500, () => this.hud.waveBanner(e.n, e.of));
      else this.hud.waveBanner(e.n, e.of);
      this.fact({ t: 'wave', n: e.n });
    },
    clear(e) {
      if (e.n < this.g.waves) this.hud.clearBanner(e.n);
      this.moment('wave_cleared');
      this.fact({ t: 'wave_cleared', n: e.n });
    },
    offer(e) {
      if (e.opening) this.moment('open');
      this.time.delayedCall(e.opening ? 250 : 900, () => this.hud.offer(e.cards, this.g, (id) => this.choose(id), { opening: e.opening }));
    },
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

  // A spell lands, drawn by its shape: 矛 a streak along its line, 镰 a band across the road, 绳 / 墙 a ring, one a flash.
  spellBoom(e) {
    const [, tint, burst] = wuxingOf(e.wuxing);
    const SHAPES = {
      spear: () => {
        const dx = e.x - e.fromX, dy = e.y - e.fromY, n = Math.hypot(dx, dy) || 1, far = 520;
        jag(this.zap.clear(), [{ x: e.fromX, y: e.fromY }, { x: e.x, y: e.y }, { x: e.x + (dx / n) * far, y: e.y + (dy / n) * far }], { color: tint, width: 12 });
        this.zapT = 0.22;
      },
      row: () => {
        const band = this.add.image(W / 2, e.y, 'band').setDisplaySize(W * 1.2, 90).setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setDepth(D.fx).setAlpha(0.9);
        this.tweens.add({ targets: band, alpha: 0, duration: 520, onComplete: () => band.destroy() });
      },
      ring: () => this.ring(e.x, e.y, e.r, tint, 600),
      one: () => {},
    };
    (SHAPES[e.shape] ?? SHAPES.one)();
    this.em.burst(burst, 30, e.x, e.y);
    this.flare(e.x, e.y, (e.r ?? 60) * 2.6, tint);
    this.shake(160, 0.007);
  }

  xmCastPose() {
    this.xm.setTexture(this.heroCast);
    this.xmCast = 0.16;
    this.em.burst('spark', 3, HAND.x, HAND.y);
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
    const yy = this.lanes?.yyAt();
    const at = who === 'xiaoman' ? [HERO.x + 30, HERO.y - 130] : yy ? [yy.x, yy.y] : [FOX.x - 10, FOX.y - 90];
    this.hud.bubbleAt(at[0], at[1], text, 2200);
  }

  fact(f) { this.cfg.onEvent?.(f); }

  finish(won, stars) {
    if (this.done) return;
    this.done = true;
    if (won) this.moment('win');
    this.fact({ t: 'end', won, stars });
    this.time.delayedCall(won ? 900 : 600, () => {
      if (!this.cfg.shell) this.hud.result(won, stars, this.g);
      this.cfg.onEnd?.({ won, stars, stats: { kills: this.g.kills, wall: Math.round((100 * this.g.wall) / this.g.wallMax) } });
    });
  }
}

