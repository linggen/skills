// 砸寨 御物 (Hanli 10-20: 「A可以, 按A改」): the things 小满 flings rest in a bamboo basket (竹篮) beside the
// slingshot, and each one rises out of it on a wisp of 灵光 and floats into the pouch. Upstream's living aliens
// walked in along the ground and hopped to the sling (its walk / jump / dust tunables are gone with that motion).
export const BirdQueueConfig = {
  basket: {
    /** The basket's centre, this far left of the pouch, standing on the ground. */
    offsetX: 215,
    /** Its drawn width (world units); the height follows the drawing (atlas.py basket()). */
    width: 250,
    /** The front wall's top, as a fraction of the basket's height from its top (the drawing's rim line). */
    rimY: 0.42,
  },
  items: {
    /** An item in the basket, as a fraction of its size in the sling. */
    scale: 0.95,
    /** Slot spacing (world units), narrowed so a full load fits the basket's mouth; slot 0 — the next to go — is
     *  nearest the sling. */
    spacing: 56,
    mouth: 190,
    /** How far an item's centre sits above the rim: most of it shows, enough to tell what it is. */
    peek: 22,
    /** Alternate slots sit a little lower and tilt, so the pile reads as laid in, not lined up. */
    stagger: 9,
    tilt: 0.16,
  },
  float: {
    /** Rise straight up out of the basket, with a small overshoot: the bob at the top. */
    riseDuration: 200,
    riseHeight: 95,
    riseEase: "Back.easeOut",
    /** Glide on an arc into the pouch. */
    glideDuration: 260,
    glideArc: 50,
    glideEase: "Sine.easeInOut",
    /** A soft settle in the pouch: a small sink and a lift (upstream's landing dropped 20 and bounced thrice). */
    settleDepth: 7,
  },
  glow: {
    frame: "light_01",
    tint: 0xfff2b8,
    alpha: 0.55,
    /** The halo's size, relative to the item's. */
    scale: 0.75,
  },
  sparkle: {
    frames: ["star_01", "star_02", "spark_01"],
    lifespan: 420,
    speedMin: 10,
    speedMax: 40,
    scaleStart: 0.12,
    scaleEnd: 0,
    alphaStart: 0.9,
    alphaEnd: 0,
    tints: [0xfff6c8, 0xbfe8ff, 0xffffff],
    /** Sparkles a frame while floating, and the puff as an item leaves the basket. */
    perFrame: 0.6,
    puff: 6,
  },
  depth: {
    basketBack: 22,
    item: 23,
    basketFront: 24,
    /** In the air: over the basket and the slingshot's fork, under the pouch's bird layer. */
    floating: 29,
    sparkle: 28,
  },
} as const;
