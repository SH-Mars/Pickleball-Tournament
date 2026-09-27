import type { Bracket, FormatId, Game, Match, ScoringSettings, Slot } from '../types';
import { outcomeOf, validateResult } from './scoring';

export interface Resolved {
  teamAId: string | null;
  teamBId: string | null;
  winnerId: string | null;
  loserId: string | null;
  isBye: boolean;
}

function slotTeam(slot: Slot, res: Map<string, Resolved>): string | null {
  switch (slot.kind) {
    case 'team':
      return slot.teamId;
    case 'winner':
      return res.get(slot.matchId)?.winnerId ?? null;
    case 'loser':
      return res.get(slot.matchId)?.loserId ?? null;
    case 'bye':
      return null;
  }
}

/**
 * Participants and winners are derived from match slots and recorded games
 * rather than stored, so advancement can never drift out of sync.
 */
export function resolveBracket(bracket: Bracket, scoring: ScoringSettings): Map<string, Resolved> {
  const res = new Map<string, Resolved>();
  const byId = new Map(bracket.matches.map((m) => [m.id, m]));
  const visiting = new Set<string>();
  const visit = (m: Match): Resolved => {
    const hit = res.get(m.id);
    if (hit) return hit;
    if (visiting.has(m.id)) throw new Error('Bracket contains a cycle');
    visiting.add(m.id);
    for (const s of [m.slotA, m.slotB]) if ((s.kind === 'winner' || s.kind === 'loser') && byId.has(s.matchId)) visit(byId.get(s.matchId) as Match);
    const teamAId = slotTeam(m.slotA, res);
    const teamBId = slotTeam(m.slotB, res);
    const isBye = m.slotA.kind === 'bye' || m.slotB.kind === 'bye';
    let winnerId: string | null = null;
    let loserId: string | null = null;
    if (isBye) {
      winnerId = teamAId ?? teamBId;
    } else if (m.status === 'complete' && teamAId && teamBId) {
      const o = outcomeOf(m.games, scoring);
      if (o.winner === 'A') [winnerId, loserId] = [teamAId, teamBId];
      else if (o.winner === 'B') [winnerId, loserId] = [teamBId, teamAId];
    }
    const r: Resolved = { teamAId, teamBId, winnerId, loserId, isBye };
    res.set(m.id, r);
    visiting.delete(m.id);
    return r;
  };
  bracket.matches.forEach(visit);
  return res;
}

export function mainFinal(bracket: Bracket): Match | undefined {
  const last = bracket.rounds[bracket.rounds.length - 1];
  return bracket.matches.find((m) => m.roundId === last?.id && m.kind === 'main');
}

export function championId(bracket: Bracket, scoring: ScoringSettings): string | null {
  const f = mainFinal(bracket);
  if (!f) return null;
  return resolveBracket(bracket, scoring).get(f.id)?.winnerId ?? null;
}

export function isPlayable(r: Resolved): boolean {
  return !r.isBye && !!r.teamAId && !!r.teamBId;
}

export interface SetResultOptions {
  /** true = confirm the winner (strict validation); false = save partial score, match stays in progress. */
  confirm: boolean;
}

export type SetResultOutcome =
  | { ok: true; bracket: Bracket; cleared: string[] }
  | { ok: false; error: string };

const isEmptyResult = (m: Match) => m.games.length > 0 || m.status === 'complete';

/**
 * Pure. Returns the updated bracket plus ids of later matches whose recorded
 * results were invalidated because their participants changed. Callers should
 * ask the user to confirm when `cleared` is non-empty.
 */
export function setResult(bracket: Bracket, scoring: ScoringSettings, matchId: string, games: Game[], opts: SetResultOptions): SetResultOutcome {
  const before = resolveBracket(bracket, scoring);
  const target = bracket.matches.find((m) => m.id === matchId);
  const r = before.get(matchId);
  if (!target || !r) return { ok: false, error: 'That match no longer exists.' };
  if (r.isBye) return { ok: false, error: 'A bye has no score.' };
  if (!r.teamAId || !r.teamBId) return { ok: false, error: 'Both teams must be known before a score can be entered.' };
  if (opts.confirm) {
    const err = validateResult(games, scoring);
    if (err) return { ok: false, error: err };
  } else if (games.some((g) => !Number.isInteger(g.a) || !Number.isInteger(g.b) || g.a < 0 || g.b < 0)) {
    return { ok: false, error: 'Scores must be whole numbers, 0 or higher.' };
  }

  const clean = games.map((g) => ({ a: g.a, b: g.b }));
  const status: Match['status'] = opts.confirm ? 'complete' : clean.length ? 'in_progress' : 'not_started';
  let matches = bracket.matches.map((m) => (m.id === matchId ? { ...m, games: clean, status } : m));
  const cleared: string[] = [];

  // Invalidate downstream results whose participants changed; repeat until stable.
  for (let guard = 0; guard < bracket.matches.length + 1; guard++) {
    const now = resolveBracket({ ...bracket, matches }, scoring);
    let changed = false;
    matches = matches.map((m) => {
      if (m.id === matchId || !isEmptyResult(m)) return m;
      const a = before.get(m.id);
      const b = now.get(m.id);
      if (a && b && (a.teamAId !== b.teamAId || a.teamBId !== b.teamBId)) {
        changed = true;
        cleared.push(m.id);
        return { ...m, games: [], status: 'not_started' as const, court: undefined, startedAt: undefined };
      }
      return m;
    });
    if (!changed) break;
  }
  return { ok: true, bracket: { ...bracket, matches }, cleared };
}

export function clearResult(bracket: Bracket, scoring: ScoringSettings, matchId: string): SetResultOutcome {
  return setResult(bracket, scoring, matchId, [], { confirm: false });
}

/** Ready-to-play = both teams known, not finished, not a bye. */
export function readyMatches(bracket: Bracket, scoring: ScoringSettings): Match[] {
  const res = resolveBracket(bracket, scoring);
  return bracket.matches.filter((m) => m.status !== 'complete' && isPlayable(res.get(m.id) as Resolved));
}

export interface FormatDefinition {
  id: FormatId;
  label: string;
  description: string;
  available: boolean;
}
