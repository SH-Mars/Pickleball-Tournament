import type { Match, Team, Tournament } from '../domain/types';
import { groupTables, matchLabel, outcomeOf, resolveBracket, isPlayable, isSkipped, type Resolved, type StandingRow } from '../domain/bracket';
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
  /** Both sides absent: never played and safe to hide (for example an unneeded grand-final reset). */
  skipped: boolean;
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

  const groupName = new Map((b.groups ?? []).map((g) => [g.id, g.name]));
  const ordinal = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);
  const placeholder = (slot: Match['slotA']): string => {
    if (slot.kind === 'bye') return 'Bye';
    if (slot.kind === 'standing') return `${ordinal(slot.rank)} in ${groupName.get(slot.groupId) ?? 'pool'}`;
    if (slot.kind === 'gfReset') return slot.side === 'A' ? 'Winners-bracket champion' : 'Losers-bracket champion';
    if (slot.kind === 'winner') return `Winner of ${labels.get(slot.matchId) ?? 'earlier match'}`;
    if (slot.kind === 'loser') return `Loser of ${labels.get(slot.matchId) ?? 'earlier match'}`;
    return 'TBD';
  };

  for (const m of b.matches) {
    const r = res.get(m.id) as Resolved;
    const teamA = r.teamAId ? teamById.get(r.teamAId) ?? null : null;
    const teamB = r.teamBId ? teamById.get(r.teamBId) ?? null : null;
    const names = (team: Team | null, slot: Match['slotA'], absent: boolean) =>
      team ? team.playerIds.map((id) => pm.get(id)?.name ?? '(removed)') : [absent ? (isSkipped(r) ? 'Not needed' : 'Bye') : placeholder(slot)];
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
      namesA: names(teamA, m.slotA, r.absentA),
      namesB: names(teamB, m.slotB, r.absentB),
      pending: { A: !teamA, B: !teamB },
      winner,
      scoreA: hasGames ? (single ? m.games[0].a : o.winsA) : null,
      scoreB: hasGames ? (single ? m.games[0].b : o.winsB) : null,
      gameText: !single && hasGames ? m.games.map((g) => `${g.a}–${g.b}`).join(', ') : '',
      status: r.isBye ? 'bye' : !playable ? 'waiting' : m.status,
      playable,
      skipped: isSkipped(r),
    });
  }
  return out;
}

export function courtLabel(m: Match): string {
  return m.court ? `Court ${m.court}` : '';
}

export { teamNumber };

export interface GroupView {
  id: string;
  name: string;
  complete: boolean;
  rows: { row: StandingRow; team: Team | null; names: string[] }[];
  matches: MatchVM[];
}

/** Standings tables for round-robin pools, with team names attached. */
export function buildGroupViews(t: Tournament): GroupView[] {
  const b = t.bracket;
  if (!b?.groups?.length) return [];
  const tables = groupTables(b, t.settings.scoring);
  const vms = buildViewModels(t);
  const pm = playerMap(t);
  const teamById = new Map(t.teams.map((x) => [x.id, x]));
  return b.groups.map((g) => {
    const table = tables.get(g.id);
    return {
      id: g.id,
      name: g.name,
      complete: !!table?.complete,
      rows: (table?.rows ?? []).map((row) => {
        const team = teamById.get(row.teamId) ?? null;
        return { row, team, names: team ? team.playerIds.map((id) => pm.get(id)?.name ?? '(removed)') : ['(removed team)'] };
      }),
      matches: b.matches.filter((m) => m.groupId === g.id).map((m) => vms.get(m.id) as MatchVM),
    };
  });
}
