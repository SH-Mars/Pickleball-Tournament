import type { Bracket, FormatId, SeedingMethod } from '../types';
import type { FormatDefinition } from './bracket';
import { buildSingleElimination } from './singleElimination';

export interface BuildContext {
  teamIdsInSeedOrder: string[];
  thirdPlaceMatch: boolean;
}

export interface TournamentFormat extends FormatDefinition {
  build(ctx: BuildContext): Bracket;
}

const comingSoon = (id: FormatId, label: string, description: string): TournamentFormat => ({
  id,
  label,
  description,
  available: false,
  build: () => {
    throw new Error(`${label} is not available yet.`);
  },
});

const FORMATS: TournamentFormat[] = [
  {
    id: 'single_elimination',
    label: 'Single Elimination',
    description: 'Lose once and you are out. Byes are given to top seeds when the team count is not a power of two.',
    available: true,
    build: (ctx) => buildSingleElimination(ctx.teamIdsInSeedOrder, { thirdPlaceMatch: ctx.thirdPlaceMatch }),
  },
  comingSoon('round_robin', 'Round Robin', 'Every team plays every other team.'),
  comingSoon('double_elimination', 'Double Elimination', 'A second life after the first loss.'),
  comingSoon('pool_play', 'Pool Play → Single Elimination', 'Pools first, then a championship bracket.'),
];

export const listFormats = (): TournamentFormat[] => FORMATS;
export function getFormat(id: FormatId): TournamentFormat {
  const f = FORMATS.find((x) => x.id === id);
  if (!f) throw new Error(`Unknown tournament format: ${id}`);
  return f;
}

export const SEEDING_LABELS: Record<SeedingMethod, string> = {
  order: 'Team order (as generated)',
  rating: 'Strongest teams seeded first (by rating)',
  random: 'Random',
};
