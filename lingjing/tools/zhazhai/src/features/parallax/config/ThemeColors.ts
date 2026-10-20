import type { ThemeType } from "../../../config/GameConfig";

export interface ThemeColors {
  skyTop: number;
  skyMid1: number;
  skyMid2: number;
  skyBottom: number;
  atmosphereFar: number;
  atmosphereMid: number;
  atmosphereNear: number;
  cloud: number;
  mountain: number;
  hill: number;
  ground: number;
  fogFar: number;
  fogMid: number;
  fogNear: number;
  ambientGlow: number;
  lightRay: number;
}

export const THEME_COLORS: Record<ThemeType, ThemeColors> = {
  forest: {
    skyTop: 0x1e88e5,
    skyMid1: 0x42a5f5,
    skyMid2: 0x90caf9,
    skyBottom: 0xc8e6c9,
    atmosphereFar: 0xb2dfdb,
    atmosphereMid: 0x81c784,
    atmosphereNear: 0x4caf50,
    cloud: 0xffffff,
    mountain: 0x2e7d32,
    hill: 0x81c784,
    ground: 0x4caf50,
    fogFar: 0xc8e6c9,
    fogMid: 0xa5d6a7,
    fogNear: 0x81c784,
    ambientGlow: 0xfff9c4,
    lightRay: 0xfffde7,
  },
  desert: {
    skyTop: 0xe65100,
    skyMid1: 0xff8f00,
    skyMid2: 0xffb74d,
    skyBottom: 0xfff8e1,
    atmosphereFar: 0xffe0b2,
    atmosphereMid: 0xffcc80,
    atmosphereNear: 0xffb74d,
    cloud: 0xfff8e1,
    mountain: 0x8d6e63,
    hill: 0xa1887f,
    ground: 0x6d4c41,
    fogFar: 0xffe0b2,
    fogMid: 0xffcc80,
    fogNear: 0xffb74d,
    ambientGlow: 0xffecb3,
    lightRay: 0xfff8e1,
  },
  castle: {
    skyTop: 0x1a0033,
    skyMid1: 0x311b92,
    skyMid2: 0x6a1b9a,
    skyBottom: 0xe1bee7,
    atmosphereFar: 0xce93d8,
    atmosphereMid: 0xab47bc,
    atmosphereNear: 0x7b1fa2,
    cloud: 0xce93d8,
    mountain: 0x4a148c,
    hill: 0x6a1b9a,
    ground: 0x38006b,
    fogFar: 0xce93d8,
    fogMid: 0xba68c8,
    fogNear: 0x9c27b0,
    ambientGlow: 0x9c27b0,
    lightRay: 0xe1bee7,
  },
  ice: {
    skyTop: 0x0d47a1,
    skyMid1: 0x1565c0,
    skyMid2: 0x5c6bc0,
    skyBottom: 0xc5cae9,
    atmosphereFar: 0xc5cae9,
    atmosphereMid: 0x9fa8da,
    atmosphereNear: 0x7986cb,
    cloud: 0xc5cae9,
    mountain: 0x303f9f,
    hill: 0x3949ab,
    ground: 0x1a237e,
    fogFar: 0xc5cae9,
    fogMid: 0x9fa8da,
    fogNear: 0x7986cb,
    ambientGlow: 0xc5cae9,
    lightRay: 0xe8eaf6,
  },
  volcano: {
    skyTop: 0x4a0000,
    skyMid1: 0xb71c1c,
    skyMid2: 0xe65100,
    skyBottom: 0x424242,
    atmosphereFar: 0x616161,
    atmosphereMid: 0x757575,
    atmosphereNear: 0x9e9e9e,
    cloud: 0x424242,
    mountain: 0x212121,
    hill: 0x424242,
    ground: 0x212121,
    fogFar: 0x616161,
    fogMid: 0x757575,
    fogNear: 0x9e9e9e,
    ambientGlow: 0xff5722,
    lightRay: 0xff6f00,
  },
  jungle: {
    skyTop: 0x00695c,
    skyMid1: 0x00897b,
    skyMid2: 0x4db6ac,
    skyBottom: 0xa5d6a7,
    atmosphereFar: 0xb2dfdb,
    atmosphereMid: 0x80cbc4,
    atmosphereNear: 0x4db6ac,
    cloud: 0xe0f2f1,
    mountain: 0x004d40,
    hill: 0x00695c,
    ground: 0x1b5e20,
    fogFar: 0xb2dfdb,
    fogMid: 0x80cbc4,
    fogNear: 0x4db6ac,
    ambientGlow: 0xc8e6c9,
    lightRay: 0xa5d6a7,
  },
};

export function getThemeColors(theme: ThemeType): ThemeColors {
  return THEME_COLORS[theme];
}
