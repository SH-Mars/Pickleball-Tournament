import type { ComboKey, Gender, GenderCategory, PairingConfig, Player, StrategyId } from '../types';

export function categoryOf(g: Gender): GenderCategory {
  return g === 'male' || g === 'female' ? g : 'other';
}

export function comboKey(cats: GenderCategory[]): ComboKey {
  return cats.slice().sort().join('+');
}

export const COMBO_LABELS: Record<string, string> = {
  'male+male': 'Male + Male',
  'female+male': 'Male + Female',
  'female+female': 'Female + Female',
  'male+other': 'Male + Other/unspecified',
  'female+other': 'Female + Other/unspecified',
  'other+other': 'Other/unspecified + Other/unspecified',
};
export const MAIN_COMBOS: ComboKey[] = ['male+male', 'female+male', 'female+female'];
export const OTHER_COMBOS: ComboKey[] = ['male+other', 'female+other', 'other+other'];

export function comboLabel(k: ComboKey): string {
  return COMBO_LABELS[k] ?? k.replace(/\+/g, ' + ');
}

export interface SoftPlan {
  /** Optimise skill balance? */
  balance: boolean;
  /** Random restarts used to search for a better grouping. */
  restarts: number;
  localSearch: boolean;
}

/**
 * Strategy plugin. The engine enforces team size, roster exclusivity and
 * forbidden pairs for every strategy; a strategy only adds its own hard rules
 * (`allowsPair`/`allowsTeam`) and describes its soft preferences (`soft`).
 */
export interface PairingStrategy {
  id: StrategyId;
  label: string;
  description: string;
  /** Necessary pairwise condition (must be true for any two teammates). */
  allowsPair(a: Player, b: Player, config: PairingConfig): boolean;
  /** Complete-team condition. */
  allowsTeam(members: Player[], config: PairingConfig): boolean;
  validateConfig?(config: PairingConfig): string[];
  soft(config: PairingConfig): SoftPlan;
  /** Human-readable hard rules for display before generating. */
  describeRules(config: PairingConfig): string[];
}

const NO_SOFT: SoftPlan = { balance: false, restarts: 1, localSearch: false };

function categoriesOf(members: Player[]): GenderCategory[] {
  return members.map((m) => categoryOf(m.gender));
}

const registry = new Map<StrategyId, PairingStrategy>();

export function registerStrategy(s: PairingStrategy): void {
  registry.set(s.id, s);
}
export function getStrategy(id: StrategyId): PairingStrategy {
  const s = registry.get(id);
  if (!s) throw new Error(`Unknown pairing strategy: ${id}`);
  return s;
}
export function listStrategies(): PairingStrategy[] {
  return [...registry.values()];
}

registerStrategy({
  id: 'random',
  label: 'Random',
  description: 'Teams are drawn at random. Gender and skill are ignored; only forbidden pairs apply.',
  allowsPair: () => true,
  allowsTeam: () => true,
  soft: () => NO_SOFT,
  describeRules: () => ['Any player can partner with any other player.'],
});

registerStrategy({
  id: 'balanced',
  label: 'Balanced',
  description: 'Aims for teams of roughly equal strength using ratings. Results still vary with the seed.',
  allowsPair: () => true,
  allowsTeam: () => true,
  soft: () => ({ balance: true, restarts: 40, localSearch: false }),
  describeRules: () => ['Any player can partner with any other player.', 'Soft goal: similar total rating per team.'],
});

registerStrategy({
  id: 'skill',
  label: 'Skill Balanced',
  description: 'Searches hard for the most even team strengths using ratings. Best when ratings are filled in.',
  allowsPair: () => true,
  allowsTeam: () => true,
  soft: () => ({ balance: true, restarts: 300, localSearch: true }),
  describeRules: () => ['Any player can partner with any other player.', 'Soft goal: minimise differences in team rating.'],
});

registerStrategy({
  id: 'mens',
  label: "Men's Doubles",
  description: 'Male players only; everyone else is left out of team generation.',
  allowsPair: (a, b) => a.gender === 'male' && b.gender === 'male',
  allowsTeam: (m) => m.every((p) => p.gender === 'male'),
  soft: () => NO_SOFT,
  describeRules: () => ['Every team is all male. Players who are not male cannot be placed.'],
});

registerStrategy({
  id: 'womens',
  label: "Women's Doubles",
  description: 'Female players only; everyone else is left out of team generation.',
  allowsPair: (a, b) => a.gender === 'female' && b.gender === 'female',
  allowsTeam: (m) => m.every((p) => p.gender === 'female'),
  soft: () => NO_SOFT,
  describeRules: () => ['Every team is all female. Players who are not female cannot be placed.'],
});

registerStrategy({
  id: 'mixed',
  label: 'Mixed Doubles',
  description: 'Each team has at least one male and one female player (exactly one of each for doubles).',
  allowsPair: (a, b, c) => {
    const ca = categoryOf(a.gender);
    const cb = categoryOf(b.gender);
    if (ca === 'other' || cb === 'other') return false;
    return c.teamSize === 2 ? ca !== cb : true;
  },
  allowsTeam: (m) => {
    const cats = categoriesOf(m);
    return !cats.includes('other') && cats.includes('male') && cats.includes('female');
  },
  soft: () => NO_SOFT,
  describeRules: (c) => [c.teamSize === 2 ? 'Every team is one male and one female.' : 'Every team has at least one male and one female.'],
});

registerStrategy({
  id: 'custom',
  label: 'Custom',
  description: 'You choose which gender combinations are allowed and which players can never be teammates.',
  allowsPair: (a, b, c) => {
    if (c.teamSize !== 2) return true;
    return c.allowedCombinations.includes(comboKey([categoryOf(a.gender), categoryOf(b.gender)]));
  },
  allowsTeam: (m, c) => {
    if (c.teamSize !== 2) return true;
    return c.allowedCombinations.includes(comboKey(categoriesOf(m)));
  },
  validateConfig: (c) =>
    c.teamSize === 2 && c.allowedCombinations.length === 0
      ? ['Select at least one allowed gender combination for the Custom strategy.']
      : [],
  soft: (c) => (c.preferences.balanceSkill ? { balance: true, restarts: 60, localSearch: true } : NO_SOFT),
  describeRules: (c) =>
    c.teamSize === 2
      ? ['Allowed combinations: ' + (c.allowedCombinations.map(comboLabel).join(', ') || 'none selected')]
      : ['Any players can be teammates (gender combinations apply to teams of two).'],
});
