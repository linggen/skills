export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

export function cubicOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function sineOut(t: number): number {
  return Math.sin((t * Math.PI) / 2);
}

export function sineInOut(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}
