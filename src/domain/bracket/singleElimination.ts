import type { Bracket, Match, Round, Slot } from '../types';

/** Standard seed order for a bracket of `size` (power of two): 1 v size, etc. */
export function seedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order;
}

export function roundName(roundsRemaining: number): string {
  if (roundsRemaining === 1) return 'Final';
  if (roundsRemaining === 2) return 'Semifinals';
  if (roundsRemaining === 3) return 'Quarterfinals';
  return `Round of ${2 ** roundsRemaining}`;
}

export function nextPow2(n: number): number {
  let s = 1;
  while (s < n) s *= 2;
  return s;
}

export interface SingleEliminationOptions {
  thirdPlaceMatch: boolean;
}

/**
 * teamIds must be in seed order (index 0 = top seed). Top seeds receive byes
 * when the count is not a power of two.
 */
export function buildSingleElimination(teamIds: string[], opts: SingleEliminationOptions): Bracket {
  const n = teamIds.length;
  if (n < 2) throw new Error('At least 2 teams are needed for a bracket.');
  const size = nextPow2(n);
  const totalRounds = Math.log2(size);
  const rounds: Round[] = [];
  const matches: Match[] = [];
  const id = (r: number, m: number) => `R${r}M${m}`;

  for (let r = 1; r <= totalRounds; r++) rounds.push({ id: `R${r}`, order: r, name: roundName(totalRounds - r + 1) });

  const order = seedOrder(size);
  for (let i = 0; i < size / 2; i++) {
    const sa = order[2 * i];
    const sb = order[2 * i + 1];
    const slot = (s: number): Slot => (s <= n ? { kind: 'team', teamId: teamIds[s - 1] } : { kind: 'bye' });
    const isBye = sa > n || sb > n;
    matches.push({
      id: id(1, i + 1),
      roundId: 'R1',
      number: i + 1,
      kind: 'main',
      slotA: slot(sa),
      slotB: slot(sb),
      games: [],
      status: isBye ? 'complete' : 'not_started',
    });
  }
  for (let r = 2; r <= totalRounds; r++) {
    for (let i = 0; i < size / 2 ** r; i++) {
      matches.push({
        id: id(r, i + 1),
        roundId: `R${r}`,
        number: i + 1,
        kind: 'main',
        slotA: { kind: 'winner', matchId: id(r - 1, 2 * i + 1) },
        slotB: { kind: 'winner', matchId: id(r - 1, 2 * i + 2) },
        games: [],
        status: 'not_started',
      });
    }
  }
  if (opts.thirdPlaceMatch && totalRounds >= 2) {
    matches.push({
      id: 'THIRD',
      roundId: `R${totalRounds}`,
      number: 2,
      kind: 'third_place',
      slotA: { kind: 'loser', matchId: id(totalRounds - 1, 1) },
      slotB: { kind: 'loser', matchId: id(totalRounds - 1, 2) },
      games: [],
      status: 'not_started',
    });
  }
  return { formatId: 'single_elimination', rounds, matches };
}

export function matchLabel(m: Match, roundName: string, matchesInRound: number): string {
  if (m.kind === 'third_place') return 'Third place';
  if (roundName === 'Final') return 'Final';
  return matchesInRound > 1 ? `${roundName.replace(/s$/, '')} ${m.number}` : roundName;
}
