import type { Match, Team, Tournament } from '../domain/types';
import { matchLabel, outcomeOf, resolveBracket, isPlayable, type Resolved } from '../domain/bracket';
import { playerMap, teamNumber } from '../domain/tournament';

export interface MatchVM {
  match: Match;
  label: string;
  roundName: string;
  r: Resolved;
  teamA: Team | null;
  teamB: Team | null;
  /** One entry per player, or a placeholder such as "Winner of Semifinal 1". */
  namesA: string[];
  namesB: string[];
  pending: { A: boolean; B: boolean };
  winner: 'A' | 'B' | null;
  scoreA: number | null;
  scoreB: number | null;
  gameText: string;
  status: 'bye' | 'waiting' | 'not_started' | 'in_progress' | 'complete';
  playable: boolean;
}

export const STATUS_LABEL: Record<MatchVM['status'], string> = {
  bye: 'Bye',
  waiting: 'Waiting',
  not_started: 'Not started',
  in_progress: 'In progress',
  complete: 'Complete',
};

export function buildViewModels(t: Tournament): Map<string, MatchVM> {
  const out = new Map<string, MatchVM>();
  const b = t.bracket;
  if (!b) return out;
  const res = resolveBracket(b, t.settings.scoring);
  const pm = playerMap(t);
  const teamById = new Map(t.teams.map((x) => [x.id, x]));
  const roundOf = new Map(b.rounds.map((r) => [r.id, r]));
  const perRound = new Map<string, number>();
  b.matches.forEach((m) => m.kind === 'main' && perRound.set(m.roundId, (perRound.get(m.roundId) ?? 0) + 1));
  const labels = new Map(b.matches.map((m) => [m.id, matchLabel(m, roundOf.get(m.roundId)?.name ?? '', perRound.get(m.roundId) ?? 1)]));

  const placeholder = (slot: Match['slotA']): string => {
    if (slot.kind === 'bye') return 'Bye';
    if (slot.kind === 'winner') return `Winner of ${labels.get(slot.matchId) ?? 'earlier match'}`;
    if (slot.kind === 'loser') return `Loser of ${labels.get(slot.matchId) ?? 'earlier match'}`;
    return 'TBD';
  };

  for (const m of b.matches) {
    const r = res.get(m.id) as Resolved;
    const teamA = r.teamAId ? teamById.get(r.teamAId) ?? null : null;
    const teamB = r.teamBId ? teamById.get(r.teamBId) ?? null : null;
    const names = (team: Team | null, slot: Match['slotA']) =>
      team ? team.playerIds.map((id) => pm.get(id)?.name ?? '(removed)') : [placeholder(slot)];
    const o = outcomeOf(m.games, t.settings.scoring);
    const single = t.settings.scoring.gamesPerMatch === 1;
    const hasGames = m.games.length > 0;
    const winner = r.winnerId && !r.isBye ? (r.winnerId === r.teamAId ? 'A' : 'B') : null;
    const playable = isPlayable(r);
    out.set(m.id, {
      match: m,
      label: labels.get(m.id) ?? m.id,
      roundName: roundOf.get(m.roundId)?.name ?? '',
      r,
      teamA,
      teamB,
      namesA: names(teamA, m.slotA),
      namesB: names(teamB, m.slotB),
      pending: { A: !teamA, B: !teamB },
      winner,
      scoreA: hasGames ? (single ? m.games[0].a : o.winsA) : null,
      scoreB: hasGames ? (single ? m.games[0].b : o.winsB) : null,
      gameText: !single && hasGames ? m.games.map((g) => `${g.a}–${g.b}`).join(', ') : '',
      status: r.isBye ? 'bye' : !playable ? 'waiting' : m.status,
      playable,
    });
  }
  return out;
}

export function courtLabel(m: Match): string {
  return m.court ? `Court ${m.court}` : '';
}

export { teamNumber };
