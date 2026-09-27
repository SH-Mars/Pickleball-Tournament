import { createTournament, generateTeams } from '../src/domain/tournament';
import type { Tournament } from '../src/domain/types';
import { mk } from './helpers';

export { createTournament, generateTeams };
export function setPlayersForTest(t: Tournament, spec: string): Tournament {
  return { ...t, players: mk(spec, (i) => 1 + (i % 5)) };
}
