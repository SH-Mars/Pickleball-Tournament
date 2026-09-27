import type { Bracket, Match, Round, Slot } from '../types';
import { buildEliminationFromSlots, nextPow2 } from './singleElimination';

const WB = 'Winners bracket';
const LB = 'Losers bracket';
const GF = 'Grand final';

/**
 * Double elimination. The winners bracket is a normal single-elimination tree.
 * Every loss drops a team into the losers bracket; a second loss eliminates it.
 * When the winners-bracket size is not a power of two, byes in round 1 leave
 * "absent" losers, and the resolver passes the remaining team straight through.
 * The grand final has a reset match that is only played if the losers-bracket
 * team wins the first one.
 */
export function buildDoubleElimination(teamIds: string[]): Bracket {
  const n = teamIds.length;
  if (n < 3) throw new Error('Double elimination needs at least 3 teams.');
  const size = nextPow2(n);
  const R = Math.log2(size);

  const wb = buildEliminationFromSlots(
    teamIds.map((teamId) => ({ kind: 'team' as const, teamId })),
    { thirdPlaceMatch: false, idPrefix: 'W', section: WB },
  );
  const wId = (r: number, m: number) => `WR${r}M${m}`;
  const wCount = (r: number) => size / 2 ** r;

  const roundsById = new Map<string, Round>();
  const matches: Match[] = [...wb.matches];
  wb.rounds.forEach((r) => {
    roundsById.set(r.id, { ...r, name: r.id === `WR${R}` ? 'Winners final' : `Winners round ${r.id.slice(2)}` });
  });
  matches.forEach((m) => {
    if (m.id.startsWith('WR')) m.label = m.roundId === `WR${R}` ? 'Winners final' : `Winners R${m.roundId.slice(2)} · Match ${m.number}`;
  });

  const lId = (r: number, m: number) => `LR${r}M${m}`;
  const lRounds = 2 * (R - 1);
  const lMatch = (r: number, m: number, a: Slot, b: Slot): Match => ({
    id: lId(r, m),
    roundId: `LR${r}`,
    number: m,
    kind: 'main',
    label: r === lRounds ? 'Losers final' : `Losers R${r} · Match ${m}`,
    slotA: a,
    slotB: b,
    games: [],
    status: 'not_started',
  });
  const lCount = (r: number) => {
    if (r === 1) return size / 4;
    const k = Math.floor(r / 2); // r = 2k or 2k+1
    return r % 2 === 0 ? size / 2 ** (k + 1) : size / 2 ** (k + 2);
  };
  for (let r = 1; r <= lRounds; r++) {
    roundsById.set(`LR${r}`, { id: `LR${r}`, order: 0, name: r === lRounds ? 'Losers final' : `Losers round ${r}`, section: LB, kind: 'elimination' });
    const count = lCount(r);
    for (let m = 1; m <= count; m++) {
      if (r === 1) {
        matches.push(lMatch(r, m, { kind: 'loser', matchId: wId(1, 2 * m - 1) }, { kind: 'loser', matchId: wId(1, 2 * m) }));
      } else if (r % 2 === 0) {
        // drop-in round: survivors of the previous losers round meet fresh losers from the winners bracket
        const k = r / 2;
        const drop = wCount(k + 1) - m + 1; // reversed order lowers the chance of an immediate rematch
        matches.push(lMatch(r, m, { kind: 'winner', matchId: lId(r - 1, m) }, { kind: 'loser', matchId: wId(k + 1, drop) }));
      } else {
        matches.push(lMatch(r, m, { kind: 'winner', matchId: lId(r - 1, 2 * m - 1) }, { kind: 'winner', matchId: lId(r - 1, 2 * m) }));
      }
    }
  }

  const gf1: Match = {
    id: 'GF1', roundId: 'GF1', number: 1, kind: 'main', label: 'Grand final',
    slotA: { kind: 'winner', matchId: wId(R, 1) }, slotB: { kind: 'winner', matchId: lId(lRounds, 1) },
    games: [], status: 'not_started',
  };
  const gf2: Match = {
    id: 'GF2', roundId: 'GF2', number: 1, kind: 'main', label: 'Grand final reset',
    slotA: { kind: 'gfReset', matchId: 'GF1', side: 'A' }, slotB: { kind: 'gfReset', matchId: 'GF1', side: 'B' },
    games: [], status: 'not_started',
  };
  roundsById.set('GF1', { id: 'GF1', order: 0, name: 'Grand final', section: GF, kind: 'elimination' });
  roundsById.set('GF2', { id: 'GF2', order: 0, name: 'Reset (if needed)', section: GF, kind: 'elimination' });
  matches.push(gf1, gf2);

  // Play order: W1, L1, then for each k: W(k+1), L(2k), L(2k+1), and finally the grand final.
  const sequence: string[] = ['WR1', 'LR1'];
  for (let k = 1; k <= R - 1; k++) {
    sequence.push(`WR${k + 1}`, `LR${2 * k}`);
    if (2 * k + 1 <= lRounds) sequence.push(`LR${2 * k + 1}`);
  }
  sequence.push('GF1', 'GF2');
  const rounds = sequence.map((id, i) => ({ ...(roundsById.get(id) as Round), order: i + 1 }));
  return { formatId: 'double_elimination', rounds, matches };
}
