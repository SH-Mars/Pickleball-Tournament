import type { Gender, PairingConfig, Player } from '../src/domain/types';

export function mk(spec: string, rating?: (i: number) => number | undefined): Player[] {
  // spec like "M:6,F:4" -> Mike1.. etc
  const out: Player[] = [];
  let n = 0;
  for (const part of spec.split(',')) {
    const [g, c] = part.split(':');
    const gender: Gender = g === 'M' ? 'male' : g === 'F' ? 'female' : g === 'O' ? 'other' : 'unspecified';
    for (let i = 0; i < Number(c); i++) {
      n++;
      out.push({ id: `p${n}`, name: `${g}${n}`, gender, rating: rating?.(n), active: true });
    }
  }
  return out;
}

export function cfg(over: Partial<PairingConfig> = {}): PairingConfig {
  return {
    strategy: 'random',
    teamSize: 2,
    allowedCombinations: ['male+male', 'female+male'],
    forbiddenPairs: [],
    preferences: { balanceSkill: false },
    seed: 837421,
    ...over,
  };
}
