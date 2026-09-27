import type { Game } from '../types';

export interface GroupMatchResult {
  teamAId: string;
  teamBId: string;
  /** null until the match is complete. */
  winnerId: string | null;
  games: Game[];
}

export interface StandingRow {
  teamId: string;
  played: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  diff: number;
  rank: number;
}

/**
 * Ranking: 1) match wins, 2) wins in matches among the teams tied on wins,
 * 3) point differential, 4) points scored, 5) original team order.
 * Only completed matches count.
 */
export function computeStandings(teamIds: string[], results: GroupMatchResult[]): StandingRow[] {
  const rows = new Map<string, StandingRow>(
    teamIds.map((id) => [id, { teamId: id, played: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, diff: 0, rank: 0 }]),
  );
  const done = results.filter((r) => r.winnerId !== null);
  for (const r of done) {
    const a = rows.get(r.teamAId);
    const b = rows.get(r.teamBId);
    if (!a || !b) continue;
    a.played++;
    b.played++;
    if (r.winnerId === a.teamId) { a.wins++; b.losses++; } else { b.wins++; a.losses++; }
    for (const g of r.games) {
      a.pointsFor += g.a; a.pointsAgainst += g.b;
      b.pointsFor += g.b; b.pointsAgainst += g.a;
    }
  }
  rows.forEach((row) => { row.diff = row.pointsFor - row.pointsAgainst; });

  const index = new Map(teamIds.map((id, i) => [id, i]));
  const byWins = new Map<number, StandingRow[]>();
  rows.forEach((row) => byWins.set(row.wins, [...(byWins.get(row.wins) ?? []), row]));
  const ordered: StandingRow[] = [];
  [...byWins.keys()].sort((x, y) => y - x).forEach((w) => {
    const tied = byWins.get(w) as StandingRow[];
    const set = new Set(tied.map((t) => t.teamId));
    const h2h = new Map<string, number>(tied.map((t) => [t.teamId, 0]));
    if (tied.length > 1) {
      for (const r of done) if (r.winnerId && set.has(r.teamAId) && set.has(r.teamBId)) h2h.set(r.winnerId, (h2h.get(r.winnerId) ?? 0) + 1);
    }
    tied.sort(
      (p, q) =>
        (h2h.get(q.teamId) as number) - (h2h.get(p.teamId) as number) ||
        q.diff - p.diff ||
        q.pointsFor - p.pointsFor ||
        (index.get(p.teamId) as number) - (index.get(q.teamId) as number),
    );
    ordered.push(...tied);
  });
  ordered.forEach((row, i) => { row.rank = i + 1; });
  return ordered;
}
