import type {
  Bracket, PairingConfig, Player, SeedingMethod, Team, Tournament, TournamentSettings,
} from './types';
import { PAIRING_ALGORITHM_VERSION } from './types';
import { deriveSeed, mulberry32, shuffle } from './rng';
import { runPairing, teamViolations, type PairingResult } from './pairing';
import { getFormat } from './bracket/formats';
import { championId, readyMatches, resolveBracket } from './bracket/bracket';

let idCounter = 0;
export function newId(prefix: string): string {
  idCounter++;
  const rand = Math.floor(Math.random() * 0x7fffffff).toString(36);
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}${rand}`;
}

export function defaultSettings(): TournamentSettings {
  return {
    courts: 2,
    scoring: { pointsToWin: 11, winBy2: true, gamesPerMatch: 1 },
    thirdPlaceMatch: false,
    seeding: 'order',
  };
}

export function defaultPairing(seed: number): PairingConfig {
  return {
    strategy: 'random',
    teamSize: 2,
    allowedCombinations: ['male+male', 'female+male'],
    forbiddenPairs: [],
    preferences: { balanceSkill: false },
    seed,
  };
}

export function createTournament(seed: number, today = new Date()): Tournament {
  const iso = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  return {
    id: newId('tournament'),
    name: 'Pickleball Tournament',
    date: iso,
    formatId: 'single_elimination',
    status: 'setup',
    settings: defaultSettings(),
    pairing: defaultPairing(seed),
    players: [],
    teams: [],
  };
}

export function playerMap(t: Pick<Tournament, 'players'>): Map<string, Player> {
  return new Map(t.players.map((p) => [p.id, p]));
}

export function teamLabel(team: Team, players: Map<string, Player>, sep = ' + '): string {
  return team.playerIds.map((id) => players.get(id)?.name ?? '(removed player)').join(sep);
}

export function teamNumber(t: Pick<Tournament, 'teams'>, teamId: string): number {
  return t.teams.findIndex((x) => x.id === teamId) + 1;
}

/** Pure: apply pairing to the tournament, preserving locked teams. Never mutates. */
export function generateTeams(t: Tournament): { result: PairingResult; tournament?: Tournament } {
  const locked = t.teams.filter((x) => x.locked);
  const result = runPairing({ players: t.players, config: t.pairing, lockedTeams: locked });
  if (!result.ok) return { result };
  let n = 0;
  const used = new Set(t.teams.map((x) => x.id));
  const nextId = () => {
    while (used.has(`team_${++n}`)) { /* find free id */ }
    used.add(`team_${n}`);
    return `team_${n}`;
  };
  const fresh: Team[] = result.teams.map((playerIds) => ({ id: nextId(), playerIds, source: 'generated', locked: false }));
  return {
    result,
    tournament: {
      ...t,
      teams: [...locked, ...fresh],
      generation: {
        seed: t.pairing.seed,
        algorithmVersion: PAIRING_ALGORITHM_VERSION,
        strategy: t.pairing.strategy,
        generatedAt: new Date().toISOString(),
      },
    },
  };
}

export interface TeamIssue { teamId: string; messages: string[] }

/** Rule violations and roster problems in the current (possibly hand-edited) teams. */
export function teamIssues(t: Tournament): TeamIssue[] {
  const pm = playerMap(t);
  const out: TeamIssue[] = [];
  for (const team of t.teams) {
    const members = team.playerIds.map((id) => pm.get(id)).filter((p): p is Player => !!p);
    const messages = teamViolations(members, t.pairing);
    if (members.length !== team.playerIds.length) messages.push('Includes a player who was removed from the roster');
    if (members.some((m) => !m.active)) messages.push('Includes an inactive player');
    if (messages.length) out.push({ teamId: team.id, messages });
  }
  return out;
}

/** Players who are active but not on any team. */
export function benchPlayers(t: Tournament): Player[] {
  const on = new Set(t.teams.flatMap((x) => x.playerIds));
  return t.players.filter((p) => p.active && !on.has(p.id));
}

export function isModifiedSinceGeneration(t: Tournament): boolean {
  return t.teams.some((x) => x.source === 'manual');
}

/**
 * Swap two players between slots. `b` may be a bench player (teamId null).
 * Returns updated teams; marks affected teams as manual.
 */
export function swapPlayers(teams: Team[], a: { teamId: string | null; playerId: string }, b: { teamId: string | null; playerId: string }): Team[] {
  if (a.playerId === b.playerId) return teams;
  return teams.map((team) => {
    if (team.id === a.teamId) return { ...team, source: 'manual' as const, playerIds: team.playerIds.map((p) => (p === a.playerId ? b.playerId : p)) };
    if (team.id === b.teamId) return { ...team, source: 'manual' as const, playerIds: team.playerIds.map((p) => (p === b.playerId ? a.playerId : p)) };
    return team;
  });
}

export function teamRating(team: Team, players: Map<string, Player>): number | null {
  const rs = team.playerIds.map((id) => players.get(id)?.rating).filter((r): r is number => typeof r === 'number');
  return rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null;
}

export function seedTeams(t: Tournament, method: SeedingMethod = t.settings.seeding): string[] {
  const pm = playerMap(t);
  const ids = t.teams.map((x) => x.id);
  if (method === 'order') return ids;
  if (method === 'random') return shuffle(ids, mulberry32(deriveSeed(t.pairing.seed, 'seeding')));
  const rating = new Map(t.teams.map((x) => [x.id, teamRating(x, pm)]));
  return ids
    .map((id, i) => ({ id, i }))
    .sort((a, b) => (rating.get(b.id) ?? -Infinity) - (rating.get(a.id) ?? -Infinity) || a.i - b.i)
    .map((x) => x.id);
}

export function buildBracketFor(t: Tournament): Bracket {
  return getFormat(t.formatId).build({ teamIdsInSeedOrder: seedTeams(t), thirdPlaceMatch: t.settings.thirdPlaceMatch });
}

export interface StartCheck { ok: boolean; problems: string[] }

export function canStart(t: Tournament): StartCheck {
  const problems: string[] = [];
  if (!getFormat(t.formatId).available) problems.push('The selected tournament format is not available yet.');
  if (t.teams.length < 2) problems.push('At least 2 teams are needed.');
  if (benchPlayers(t).length) problems.push(`${benchPlayers(t).length} active player(s) are not on a team.`);
  const dupes = new Set<string>();
  for (const id of t.teams.flatMap((x) => x.playerIds)) {
    if (dupes.has(id)) problems.push('A player appears on more than one team.');
    dupes.add(id);
  }
  if (t.teams.some((x) => x.playerIds.length !== t.pairing.teamSize)) problems.push(`Every team must have ${t.pairing.teamSize} player(s).`);
  return { ok: problems.length === 0, problems };
}

export function startTournament(t: Tournament): Tournament {
  const chk = canStart(t);
  if (!chk.ok) throw new Error(chk.problems.join(' '));
  return { ...t, status: 'live', bracket: buildBracketFor(t) };
}

export function hasResults(t: Tournament): boolean {
  return !!t.bracket?.matches.some((m) => m.games.length > 0 || (m.status === 'complete' && !(m.slotA.kind === 'bye' || m.slotB.kind === 'bye')));
}

/** Return to setup. Callers must confirm first when results exist; they are discarded. */
export function unlockTournament(t: Tournament): Tournament {
  return { ...t, status: 'setup', bracket: undefined };
}

export function champion(t: Tournament): Team | null {
  if (!t.bracket) return null;
  const id = championId(t.bracket, t.settings.scoring);
  return t.teams.find((x) => x.id === id) ?? null;
}

export function progress(t: Tournament): { done: number; total: number } {
  if (!t.bracket) return { done: 0, total: 0 };
  const res = resolveBracket(t.bracket, t.settings.scoring);
  const real = t.bracket.matches.filter((m) => !res.get(m.id)?.isBye);
  return { done: real.filter((m) => m.status === 'complete').length, total: real.length };
}

/** Assign ready, unassigned matches to free courts in bracket order. */
export function autoAssignCourts(t: Tournament): Tournament {
  if (!t.bracket) return t;
  const ready = readyMatches(t.bracket, t.settings.scoring);
  const busy = new Set(t.bracket.matches.filter((m) => m.status === 'in_progress' && m.court).map((m) => m.court as number));
  const free: number[] = [];
  for (let c = 1; c <= t.settings.courts; c++) if (!busy.has(c)) free.push(c);
  const order = new Map(t.bracket.rounds.map((r) => [r.id, r.order]));
  const queue = ready
    .filter((m) => m.status === 'not_started' && !m.court)
    .sort((a, b) => (order.get(a.roundId) as number) - (order.get(b.roundId) as number) || a.number - b.number);
  const assign = new Map<string, number>();
  queue.forEach((m, i) => {
    if (i < free.length) assign.set(m.id, free[i]);
  });
  return {
    ...t,
    bracket: { ...t.bracket, matches: t.bracket.matches.map((m) => (assign.has(m.id) ? { ...m, court: assign.get(m.id) } : m)) },
  };
}
