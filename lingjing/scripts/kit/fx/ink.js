// kit/fx/ink.js — ink on 宣纸, for whatever Phaser draws (doc/game-kit.md § One engine, (b)): the
// paper's fibres and grain as textures made on the spot (no image files), and the soak — a painting
// wicking in over what lies under it from a point, its front torn by the paper's fibres, a wet rim
// running just ahead. Pixi did the soak as a disc grown in an offscreen texture, torn by two
// DisplacementFilters, blurred and used as a mask (setpieces/painted.js, still Pixi until its port);
// here it is one small shader on the painting (`InkSoak`): mask, tear and rim in one pass, no
// offscreen texture per layer. Plain ESM, no Phaser import: the engine comes by injection.

/// Paper fibres: short soft strokes in every direction over blotches — the
/// displacement that tears the ink's edge like 宣纸 wicking it (r, g: the push across, down).
export function fibreCanvas(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(128,128,128)';
  g.fillRect(0, 0, size, size);
  g.filter = 'blur(6px)';
  for (let i = 0; i < 90; i += 1) {
    g.fillStyle = `rgb(${Math.random() * 255 | 0},${Math.random() * 255 | 0},128)`;
    g.beginPath();
    g.arc(Math.random() * size, Math.random() * size, 6 + Math.random() * 26, 0, Math.PI * 2);
    g.fill();
  }
  g.filter = 'blur(1px)';
  g.lineCap = 'round';
  for (let i = 0; i < 260; i += 1) {
    const x = Math.random() * size, y = Math.random() * size, a = Math.random() * Math.PI, l = 6 + Math.random() * 22;
    g.strokeStyle = `rgba(${Math.random() * 255 | 0},${Math.random() * 255 | 0},128,0.6)`;
    g.lineWidth = 0.6 + Math.random() * 1.4;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  return c;
}

/// Rice-paper grain: fine speckle, laid over everything very faintly.
export function grainCanvas(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 150 + Math.random() * 105 | 0;
    img.data[i] = v; img.data[i + 1] = v - 6; img.data[i + 2] = v - 18; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/// The soak's shape, as shares of its reach R (Pixi's painted.js values): the rim's width; the
/// broad wander of the front and the fine fibres at its lip (how far each pushes, and the size of
/// one fibre tile); the edge's softness.
export const SOAK = { rim: 0.006, broad: 0.3, broadTile: 1.3, fine: 0.016, fineTile: 0.2, soft: 0.004, rimGain: 0.4 };

/// A soak's rim alpha at `v` (0 unseen … 1 whole): it wets in fast, dries as the soak ends.
export const rimAt = (v, max) => (v >= 1 || v <= 0 ? 0 : max * Math.min(1, v * 6) * Math.min(1, (1 - v) * 3));

/// The soak, in one pass over the painting as Phaser drew it (premultiplied): inside the torn
/// disc the painting, outside it nothing; in the ring just ahead the rim — light added (a reward,
/// a page) or ink laid over.
export const SOAK_FRAG = `
#define SHADER_NAME INK_SOAK_FS
precision mediump float;
uniform sampler2D uMainSampler;
uniform sampler2D uFibre;
uniform vec2 uRes;
uniform vec2 uFrom;
uniform float uR;
uniform float uV;
uniform vec4 uRimColor;
uniform float uRimAdd;
uniform float uRimA;
varying vec2 outTexCoord;
float disc(vec2 q, float r, float soft) { return 1.0 - smoothstep(r - soft, r + soft, length(q - uFrom)); }
void main() {
  vec4 col = texture2D(uMainSampler, outTexCoord);
  if (uV >= 1.0) { gl_FragColor = col; return; }
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 broad = texture2D(uFibre, fract(p / (uR * ${SOAK.broadTile.toFixed(3)}))).rg - 0.5;
  vec2 fine = texture2D(uFibre, fract(p / (uR * ${SOAK.fineTile.toFixed(3)}))).rg - 0.5;
  vec2 q = p + broad * uR * ${SOAK.broad.toFixed(3)} + fine * uR * ${SOAK.fine.toFixed(3)};
  float soft = max(1.5, uR * ${SOAK.soft.toFixed(4)});
  float m = disc(q, uV * uR, soft);
  float ring = max(0.0, disc(q, (uV + ${SOAK.rim.toFixed(4)}) * uR, soft) - m) * uRimA * ${SOAK.rimGain.toFixed(3)};
  vec4 rim = uRimAdd > 0.5 ? vec4(uRimColor.rgb * ring, 0.0) : vec4(uRimColor.rgb, 1.0) * ring;
  gl_FragColor = col * m + rim * (1.0 - col.a * m);
}`;

export const SOAK_PIPELINE = 'InkSoak';
const rgbOf = (hex) => [(hex >> 16 & 255) / 255, (hex >> 8 & 255) / 255, (hex & 255) / 255];

/* The pipeline class, made once per Phaser (it extends the engine's PostFXPipeline). */
const classes = new WeakMap();
function soakClassOf(Phaser) {
  if (classes.has(Phaser)) return classes.get(Phaser);
  class InkSoak extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
    constructor(game) {
      super({ game, name: SOAK_PIPELINE, fragShader: SOAK_FRAG });
      this.soak = { v: 1, from: [0, 0], R: 1, rim: [0, 0, 0], add: false, rimA: 0, fibre: null };
    }
    onDraw(src) {
      const s = this.soak;
      this.bind();
      this.set1i('uFibre', 1);
      this.set2f('uRes', this.renderer.width, this.renderer.height);
      this.set2f('uFrom', s.from[0], s.from[1]);
      this.set1f('uR', s.R);
      this.set1f('uV', s.v);
      this.set4f('uRimColor', s.rim[0], s.rim[1], s.rim[2], 1);
      this.set1f('uRimAdd', s.add ? 1 : 0);
      this.set1f('uRimA', s.rimA);
      if (s.fibre) this.bindTexture(s.fibre, 1);
      this.bindAndDraw(src);
    }
  }
  classes.set(Phaser, InkSoak);
  return InkSoak;
}

/// Ready the soak on `scene`'s game (once) and its fibre texture (once per game); returns the fibre's key.
export function soakReady(Phaser, scene) {
  const pipes = scene.renderer.pipelines;
  if (!pipes.postPipelineClasses.has(SOAK_PIPELINE)) pipes.addPostPipeline(SOAK_PIPELINE, soakClassOf(Phaser));
  if (!scene.textures.exists('ink-fibre')) scene.textures.addCanvas('ink-fibre', fibreCanvas());
  return 'ink-fibre';
}

/// One painting soaking in on `scene`: texture `key`, grown from `from` (0–1 of the frame) over a
/// frame W×H units drawn at `k` px a unit. `rim` {color, blend: 'add' | 'multiply', alpha}.
/// `soak.v` 0 unseen … 1 whole; `place({s, x, y})` puts its camera (painted.js frameOf, in units);
/// `apply()` sends the soak to the shader. Its alpha is the image's (the rim follows it).
export function soakLayer(Phaser, scene, key, { W, H, k, from = [0.5, 0.5], rim = {} }) {
  const fibre = scene.textures.getFrame(soakReady(Phaser, scene)).glTexture;
  const image = scene.add.image(0, 0, key).setOrigin(0);
  image.setPostPipeline(SOAK_PIPELINE);
  const pipe = [image.getPostPipeline(SOAK_PIPELINE)].flat()[0];
  const R = Math.hypot(W, H) * 1.15 * k; // a soak from anywhere covers the frame
  const rimMax = rim.alpha ?? 0.55;
  Object.assign(pipe.soak, { from: [from[0] * W * k, from[1] * H * k], R, rim: rgbOf(rim.color ?? 0x2a241e), add: rim.blend === 'add', fibre });
  const soak = { v: 0 };
  return {
    image, soak,
    iw: image.width, ih: image.height,
    place(f) { image.setPosition(f.x * k, f.y * k).setScale(f.s * k); },
    apply() {
      image.setVisible(soak.v > 0.0005);
      pipe.soak.v = soak.v;
      pipe.soak.rimA = rimAt(soak.v, rimMax) * image.alpha;
    },
  };
}
