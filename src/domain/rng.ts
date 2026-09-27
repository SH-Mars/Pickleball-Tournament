export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function deriveSeed(seed: number, salt: number | string): number {
  return hashString(`${seed >>> 0}:${salt}`);
}

/** Accepts digits (used as-is) or any text (hashed). Returns null when empty. */
export function parseSeed(input: string | number): number | null {
  if (typeof input === 'number') return Number.isFinite(input) ? Math.abs(Math.trunc(input)) % 4294967296 : null;
  const t = input.trim();
  if (!t) return null;
  if (/^\d{1,10}$/.test(t)) {
    const n = Number(t);
    if (n < 4294967296) return n;
  }
  return hashString(t);
}

export function shuffle<T>(arr: readonly T[], rng: Rng): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Non-deterministic; only for suggesting a fresh seed to the user. */
export function randomSeed(): number {
  return 100000 + Math.floor(Math.random() * 900000);
}
