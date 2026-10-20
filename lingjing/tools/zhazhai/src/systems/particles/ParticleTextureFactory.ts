import Phaser from "phaser";

export type ParticleTextureGenerator = (scene: Phaser.Scene, key: string) => void;

export const PARTICLE_TEXTURES: Record<string, ParticleTextureGenerator> = {
  softGlow: (scene, key) => {
    const size = 64;
    const g = scene.add.graphics();
    for (let i = 5; i >= 0; i--) {
      const radius = (size / 2) * (i / 5);
      const alpha = 0.15 * (1 - i / 5);
      g.fillStyle(0xffffff, alpha);
      g.fillCircle(size / 2, size / 2, radius);
    }
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(size / 2, size / 2, 3);
    g.generateTexture(key, size, size);
    g.destroy();
  },

  snowflakeCrystal: (scene, key) => {
    const size = 48;
    const g = scene.add.graphics();
    g.lineStyle(2.5, 0xffffff, 1);
    const cx = size / 2;
    const cy = size / 2;
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3 - Math.PI / 2;
      const len = size / 2.5;
      const ex = cx + Math.cos(angle) * len;
      const ey = cy + Math.sin(angle) * len;
      g.lineBetween(cx, cy, ex, ey);
      const bx = cx + Math.cos(angle) * len * 0.6;
      const by = cy + Math.sin(angle) * len * 0.6;
      for (let j = -1; j <= 1; j += 2) {
        const branchAngle = angle + j * 0.5;
        g.lineBetween(
          bx,
          by,
          bx + Math.cos(branchAngle) * len * 0.35,
          by + Math.sin(branchAngle) * len * 0.35
        );
      }
    }
    g.fillStyle(0xffffff, 1);
    g.fillCircle(cx, cy, 3);
    g.fillStyle(0xe3f2fd, 0.5);
    g.fillCircle(cx - 3, cy - 3, 1.5);
    g.generateTexture(key, size, size);
    g.destroy();
  },

  emberGlow: (scene, key) => {
    const size = 48;
    const g = scene.add.graphics();
    g.fillStyle(0xff6f00, 0.2);
    g.fillCircle(size / 2, size / 2, size / 2.5);
    g.fillStyle(0xff8f00, 0.4);
    g.fillCircle(size / 2, size / 2, size / 4);
    g.fillStyle(0xffa000, 0.6);
    g.fillCircle(size / 2, size / 2, size / 6);
    g.fillStyle(0xffcc00, 0.85);
    g.fillCircle(size / 2, size / 2, size / 10);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(size / 2, size / 2, 3);
    g.generateTexture(key, size, size);
    g.destroy();
  },

  dustMoteLarge: (scene, key) => {
    const size = 32;
    const g = scene.add.graphics();
    g.fillStyle(0xffffff, 0.12);
    g.fillCircle(size / 2, size / 2, size / 2.2);
    g.fillStyle(0xffffff, 0.35);
    g.fillCircle(size / 2, size / 2, size / 4);
    g.fillStyle(0xffffff, 0.75);
    g.fillCircle(size / 2, size / 2, size / 8);
    g.generateTexture(key, size, size);
    g.destroy();
  },

  pollenBright: (scene, key) => {
    const size = 32;
    const g = scene.add.graphics();
    g.fillStyle(0xfffde7, 0.4);
    g.fillCircle(size / 2, size / 2, size / 2.8);
    g.fillStyle(0xfff9c4, 0.7);
    g.fillCircle(size / 2, size / 2, size / 5);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(size / 2, size / 2, size / 12);
    g.generateTexture(key, size, size);
    g.destroy();
  },

  sandGrain: (scene, key) => {
    const size = 24;
    const g = scene.add.graphics();
    g.fillStyle(0xd7ccc8, 0.2);
    g.fillCircle(size / 2, size / 2, size / 2.5);
    g.fillStyle(0xbcaaa4, 0.5);
    g.fillCircle(size / 2, size / 2, size / 4);
    g.fillStyle(0xd7ccc8, 0.85);
    g.fillCircle(size / 2, size / 2, size / 8);
    g.generateTexture(key, size, size);
    g.destroy();
  },

  mysticSparkle: (scene, key) => {
    const size = 48;
    const g = scene.add.graphics();
    g.fillStyle(0xce93d8, 0.15);
    g.fillCircle(size / 2, size / 2, size / 2.5);
    g.fillStyle(0xe1bee7, 0.4);
    g.fillCircle(size / 2, size / 2, size / 4);
    g.fillStyle(0xf3e5f5, 0.7);
    g.fillCircle(size / 2, size / 2, size / 7);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(size / 2, size / 2, size / 14);
    g.generateTexture(key, size, size);
    g.destroy();
  },

  frostCrystal: (scene, key) => {
    const size = 48;
    const g = scene.add.graphics();
    g.fillStyle(0x7986cb, 0.12);
    g.fillCircle(size / 2, size / 2, size / 2.2);
    g.fillStyle(0x9fa8da, 0.35);
    g.fillCircle(size / 2, size / 2, size / 4);
    g.fillStyle(0xc5cae9, 0.65);
    g.fillCircle(size / 2, size / 2, size / 8);
    g.fillStyle(0xe8eaf6, 0.95);
    g.fillCircle(size / 2, size / 2, size / 16);
    g.generateTexture(key, size, size);
    g.destroy();
  },

  fireflyGlow: (scene, key) => {
    const size = 48;
    const g = scene.add.graphics();
    g.fillStyle(0xffffff, 0.06);
    g.fillCircle(size / 2, size / 2, size / 2.2);
    g.fillStyle(0xccff00, 0.25);
    g.fillCircle(size / 2, size / 2, size / 4);
    g.fillStyle(0xeeff77, 0.6);
    g.fillCircle(size / 2, size / 2, size / 8);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(size / 2, size / 2, size / 18);
    g.generateTexture(key, size, size);
    g.destroy();
  },

  heatWave: (scene, key) => {
    const size = 64;
    const g = scene.add.graphics();
    g.fillStyle(0xffe082, 0.08);
    g.fillCircle(size / 2, size / 2, size / 2);
    g.fillStyle(0xffd54f, 0.12);
    g.fillCircle(size / 2, size / 2, size / 3);
    g.fillStyle(0xffca28, 0.06);
    g.fillCircle(size / 2, size / 2, size / 5);
    g.generateTexture(key, size, size);
    g.destroy();
  },
};

export function createParticleTextures(scene: Phaser.Scene): string[] {
  const created: string[] = [];
  for (const [key, generator] of Object.entries(PARTICLE_TEXTURES)) {
    if (!scene.textures.exists(key)) {
      generator(scene, key);
      created.push(key);
    }
  }
  return created;
}
