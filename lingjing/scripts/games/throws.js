// throws.js — the things 小满 throws (Hanli 2026-10-16: 「投掷类都可以换. 可以多设计一些工具, 特效,
// 让它更好玩」), the 愤怒小鸟 way: each its own weight and flight, and at most one tap in flight.
// Declared in data (worlds/jiuding/games.json `projectiles`); this file only knows the kinds of
// ability and how each is drawn. The card law: a thing is in his tray only when it is his — its
// `from` card is in his hand (rules: Look deals `owned`), or it is the scene's own tool (a level's
// first `ammo`). Pure helpers; deerarc.js (and the boards built on it) fly them.
import { n } from './ink.js';

/** The arrow: what a projectile is when the data says nothing else. */
export const ARROW = Object.freeze({ id: 'arrow', name: { zh: '箭', en: 'Arrow' }, shape: 'arrow', mass: 1, speed: 1, drag: 0, half: 13, ability: null, pierce: false, knock: false, bounce: 0 });

/** A projectile by id from the table, over the arrow's defaults. */
export function projectileOf(table, id) {
  const p = table?.[id];
  return p ? { ...ARROW, ...p, id } : { ...ARROW, id: id ?? 'arrow' };
}

/** The tray for a level: its `ammo` that he holds — the first is the scene's own tool, always his.
    `owned` null (the 游戏厅, no save) holds everything declared. */
export function trayOf(level, table, owned) {
  const ammo = level?.ammo?.length ? level.ammo : ['arrow'];
  return ammo.filter((id, i) => i === 0 || owned == null || !table?.[id]?.from || owned.includes(table[id].from));
}

/* ── Abilities: one tap in flight ─────────────────────────────────────────────────────────── */

/** Dash (短飞剑 · 火柴, the yellow bird): straight on along the line it was loosed on, faster. */
function dash(ar, velocity) {
  const [ux, uy] = ar.dir, speed = Math.hypot(velocity.x, velocity.y) * (ar.proj.dash ?? 1.7);
  return { velocity: { x: ux * speed, y: uy * speed }, fx: { kind: 'dash', at: [...ar.tip] } };
}
/** Burst (五雷符, the bomb): lightning in a small radius where it is; the throw is spent. */
function burst(ar) {
  return { burst: { at: [...ar.tip], r: ar.proj.radius ?? 34 }, fx: { kind: 'burst', at: [...ar.tip], r: ar.proj.radius ?? 34 } };
}
const ABILITIES = { dash, burst };

/** The tap: what the ability does now (null when it has none, or it is used, or the throw is spent). */
export function tapNow(ar, velocity) {
  if (!ar || ar.done || !ar.true || ar.tapped || !ABILITIES[ar.proj.ability]) return null;
  ar.tapped = true;
  return ABILITIES[ar.proj.ability](ar, velocity);
}

/* ── The pictures (ink until a painting is declared: `art` on the projectile) ─────────────── */

const SHAPES = {
  arrow: () => '', // deerarc.js draws the arrow (painted or ink) itself
  stone: () => '<ellipse class="g-tk-stone" rx="7" ry="5.8"/><path class="g-tk-stone-lit" d="M-3.6 -2.5 q2.8 -2 5.3 -.6"/>',
  sword: () => '<path class="g-tk-blade" d="M-9 -1.4 L7 -1.2 L11 0 L7 1.2 L-9 1.4Z"/><path class="g-tk-guard" d="M-9 -3.6 L-9 3.6"/><path class="g-tk-hilt" d="M-9 0 L-14 0"/>',
  log: () => '<rect class="g-sm-ink is-wood" x="-15" y="-4.5" width="30" height="9" rx="3"/>',
  pot: () => '<ellipse class="g-sm-ink is-clay" rx="8" ry="8"/>',
  talisman: () => '<rect class="g-tk-paper" x="-6" y="-8" width="12" height="16" rx="1"/><path class="g-tk-glyph" d="M-3 -5 L3 -5 M0 -5 L0 5 M-3 0 L3 0 M-2.5 3 L2.5 5"/>',
};

/** A projectile drawn at the origin, pointing +x (the caller places and turns it). */
export function shapeOf(proj) {
  return (SHAPES[proj.shape] ?? SHAPES.stone)();
}
/** Turned with its flight (arrow, sword) or tumbling (stone, talisman). */
export const turnsWithFlight = (proj) => proj.shape === 'arrow' || proj.shape === 'sword';

/** The effects in the air: a dash's ink streak, a burst's lightning, a bounce's dust. `age` ms. */
export function fxPicture(fx, age, still = false) {
  if (!fx || age < 0 || age > 700) return '';
  const k = Math.min(1, age / 700), o = n(1 - k, 2);
  const [x, y] = fx.at;
  if (fx.kind === 'dash') return `<g class="g-tk-dash" opacity="${o}" transform="translate(${n(x)} ${n(y)})"><circle r="${n(4 + k * 10)}"/><path d="M-14 -3 L-2 0 L-14 3"/></g>`;
  if (fx.kind === 'bounce') return `<g class="g-tk-dust" opacity="${o}" transform="translate(${n(x)} ${n(y)})"><circle cx="-5" cy="-2" r="${n(2 + k * 4)}"/><circle cx="4" cy="-3" r="${n(1.5 + k * 3)}"/></g>`;
  if (fx.kind === 'burst') return lightning(x, y, fx.r, k, still);
  return '';
}

/** 五行 雷 · 金 in ink: a ring going out and a few jagged bolts from the centre. */
function lightning(x, y, r, k, still) {
  const bolts = [0, 1, 2, 3, 4, 5].map((i) => {
    const a = (i / 6) * Math.PI * 2 + 0.4, len = r * (still ? 1 : 0.5 + k * 0.6);
    const mx = Math.cos(a + 0.35) * len * 0.5, my = Math.sin(a + 0.35) * len * 0.5;
    return `M0 0 L${n(mx)} ${n(my)} L${n(Math.cos(a) * len)} ${n(Math.sin(a) * len)}`;
  }).join(' ');
  return `<g class="g-tk-burst" opacity="${n(1 - k * 0.8, 2)}" transform="translate(${n(x)} ${n(y)})">`
    + `<circle class="g-tk-burst-ring" r="${n(r * (still ? 1 : 0.3 + k))}"/><path class="g-tk-bolt" d="${bolts}"/><circle class="g-tk-core" r="${n(5 * (1 - k))}"/></g>`;
}
