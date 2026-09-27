import type { Bracket, FormatId, SeedingMethod, TournamentSettings } from '../types';
import { buildSingleElimination } from './singleElimination';
import { buildRoundRobin } from './roundRobin';
import { buildDoubleElimination } from './doubleElimination';
import { buildPoolPlay, validatePool } from './poolPlay';

export interface BuildContext {
  teamIdsInSeedOrder: string[];
  settings: Pick<TournamentSettings, 'thirdPlaceMatch' | 'pools' | 'advancePerPool'>;
}

export interface TournamentFormat {
  id: FormatId;
  label: string;
  description: string;
  available: boolean;
  minTeams: number;
  /** Name of the main view for this format. */
  viewLabel: string;
  usesThirdPlace: boolean;
  usesPools: boolean;
  /** Problems that stop this format from being built with `teamCount` teams. Empty when fine. */
  validate(teamCount: number, settings: BuildContext['settings']): string[];
  build(ctx: BuildContext): Bracket;
}

const tooFew = (min: number, n: number) => (n < min ? [`${min === 2 ? 'At least 2 teams are' : `At least ${min} teams are`} needed for this format. You have ${n}.`] : []);

const FORMATS: TournamentFormat[] = [
  {
    id: 'single_elimination',
    label: 'Single Elimination',
    description: 'Lose once and you are out. Byes go to top seeds when the team count is not a power of two.',
    available: true, minTeams: 2, viewLabel: 'Bracket', usesThirdPlace: true, usesPools: false,
    validate: (n) => tooFew(2, n),
    build: (ctx) => buildSingleElimination(ctx.teamIdsInSeedOrder, { thirdPlaceMatch: ctx.settings.thirdPlaceMatch }),
  },
  {
    id: 'round_robin',
    label: 'Round Robin',
    description: 'Every team plays every other team once. The best record wins.',
    available: true, minTeams: 2, viewLabel: 'Standings', usesThirdPlace: false, usesPools: false,
    validate: (n) => tooFew(2, n),
    build: (ctx) => buildRoundRobin(ctx.teamIdsInSeedOrder),
  },
  {
    id: 'double_elimination',
    label: 'Double Elimination',
    description: 'A team is out after its second loss. The final has a reset match if the team with one loss wins it.',
    available: true, minTeams: 3, viewLabel: 'Bracket', usesThirdPlace: false, usesPools: false,
    validate: (n) => tooFew(3, n),
    build: (ctx) => buildDoubleElimination(ctx.teamIdsInSeedOrder),
  },
  {
    id: 'pool_play',
    label: 'Pool Play → Single Elimination',
    description: 'Teams play a round robin inside their pool. The best from each pool go to a playoff bracket.',
    available: true, minTeams: 4, viewLabel: 'Pools & playoffs', usesThirdPlace: true, usesPools: true,
    validate: (n, s) => validatePool(n, s),
    build: (ctx) => buildPoolPlay(ctx.teamIdsInSeedOrder, { pools: ctx.settings.pools, advancePerPool: ctx.settings.advancePerPool, thirdPlaceMatch: ctx.settings.thirdPlaceMatch }),
  },
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
