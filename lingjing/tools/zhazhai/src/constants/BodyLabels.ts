/**
 * Physics body label constants for collision detection.
 * These labels are used by Matter.js bodies for identification.
 */
export const BodyLabels = {
  FRAGMENT: "fragment",
  DEBRIS: "debris",
  BIRD: "bird",
  PIG: "pig",
  BLOCK: "block",
  GROUND: "ground",
} as const;

export type BodyLabel = (typeof BodyLabels)[keyof typeof BodyLabels];

/**
 * Helper functions for body label checking
 */
export const BodyLabelHelpers = {
  isFragment(label: string): boolean {
    return label === BodyLabels.FRAGMENT;
  },

  isDebris(label: string): boolean {
    return label === BodyLabels.DEBRIS;
  },

  isGround(label: string): boolean {
    return label === BodyLabels.GROUND;
  },

  isBird(label: string): boolean {
    return label.startsWith(BodyLabels.BIRD);
  },

  isPig(label: string): boolean {
    return label.startsWith(BodyLabels.PIG);
  },

  isBlock(label: string): boolean {
    return label.startsWith(BodyLabels.BLOCK);
  },
} as const;
