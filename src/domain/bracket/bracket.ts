import type { Bracket, Game, Match, ScoringSettings, Slot } from '../types';
import { outcomeOf, validateResult } from './scoring';
import { computeStandings, type StandingRow } from './standings';

export interface Resolved {
  teamAId: string | null;
  teamBId: string | null;
  /** The slot can never be filled (a bye, or an opponent who was never produced). */
  absentA: boolean;
  absentB: boolean;
  winnerId: string | null;
  loserId: string | null;
  /** True when one or both sides are absent, so nothing is played. */
  isBye: boolean;
  /** No team will ever come out of this match as its winner (both sides absent). */
  winnerAbsent: boolean;
  /** Byes have no loser. */
  loserAbsent: boolean;
}

interface SlotState { team: string | null; absent: boolean }
const PENDING: SlotState = { team: null, absent: false };
const ABSENT: SlotState = { team: null, absent: true };

export interface GroupTable { rows: StandingRow[]; complete: boolean }

/**
 * Participants, winners and pool standings are derived from match slots and the
 * recorded games rather than stored, so advancement can never drift out of sync.
 */
export function resolveBracket(bracket: Bracket, scoring: ScoringSettings): Map<string, Resolved> {
  return resolveAll(bracket, scoring).res;
}

export function groupTables(bracket: Bracket, scoring: ScoringSettings): Map<string, GroupTable> {
  return resolveAll(bracket, scoring).tables;
}

function resolveAll(bracket: Bracket, scoring: ScoringSettings): { res: Map<string, Resolved>; tables: Map<string, GroupTable> } {
  const res = new Map<string, Resolved>();
  const tables = new Map<string, GroupTable>();
  const byId = new Map(bracket.matches.map((m) => [m.id, m]));
  const groups = new Map((bracket.groups ?? []).map((g) => [g.id, g]));
  const visiting = new Set<string>();

  const table = (groupId: string): GroupTable | null => {
    const hit = tables.get(groupId);
    if (hit) return hit;
    const g = groups.get(groupId);
    if (!g) return null;
    const ms = bracket.matches.filter((m) => m.groupId === groupId);
    ms.forEach((m) => visit(m));
    const results = ms
      .map((m) => ({ m, r: res.get(m.id) as Resolved }))
      .filter((x) => x.r.teamAId && x.r.teamBId && !x.r.isBye)
      .map((x) => ({ teamAId: x.r.teamAId as string, teamBId: x.r.teamBId as string, winnerId: x.r.winnerId, games: x.m.games }));
    const t: GroupTable = { rows: computeStandings(g.teamIds, results), complete: results.length > 0 && results.every((x) => x.winnerId !== null) };
    tables.set(groupId, t);
    return t;
  };

  const state = (slot: Slot): SlotState => {
    switch (slot.kind) {
      case 'team':
        return { team: slot.teamId, absent: false };
      case 'bye':
        return ABSENT;
      case 'winner': {
        const r = res.get(slot.matchId);
        return r ? { team: r.winnerId, absent: r.winnerAbsent } : PENDING;
      }
      case 'loser': {
        const r = res.get(slot.matchId);
        return r ? { team: r.loserId, absent: r.loserAbsent } : PENDING;
      }
      case 'standing': {
        const t = table(slot.groupId);
        if (!t) return ABSENT;
        if (!t.complete) return PENDING;
        const row = t.rows[slot.rank - 1];
        return row ? { team: row.teamId, absent: false } : ABSENT;
      }
      case 'gfReset': {
        const r = res.get(slot.matchId);
        if (!r || !r.winnerId) return PENDING;
        // Reset is played only when the team from the losers side (B) won the first grand final.
        if (r.winnerId !== r.teamBId) return ABSENT;
        return { team: slot.side === 'A' ? r.teamAId : r.teamBId, absent: false };
      }
    }
  };

  const visit = (m: Match): Resolved => {
    const hit = res.get(m.id);
    if (hit) return hit;
    if (visiting.has(m.id)) throw new Error('Bracket contains a cycle');
    visiting.add(m.id);
    for (const s of [m.slotA, m.slotB]) {
      if ((s.kind === 'winner' || s.kind === 'loser' || s.kind === 'gfReset') && byId.has(s.matchId)) visit(byId.get(s.matchId) as Match);
      if (s.kind === 'standing') table(s.groupId);
    }
    const a = state(m.slotA);
    const b = state(m.slotB);
    const isBye = a.absent || b.absent;
    let winnerId: string | null = null;
    let loserId: string | null = null;
    let winnerAbsent = false;
    if (isBye) {
      if (a.absent && b.absent) winnerAbsent = true;
      else winnerId = a.absent ? b.team : a.team;
    } else if (m.status === 'complete' && a.team && b.team) {
      const o = outcomeOf(m.games, scoring);
      if (o.winner === 'A') [winnerId, loserId] = [a.team, b.team];
      else if (o.winner === 'B') [winnerId, loserId] = [b.team, a.team];
    }
    const r: Resolved = { teamAId: a.team, teamBId: b.team, absentA: a.absent, absentB: b.absent, winnerId, loserId, isBye, winnerAbsent, loserAbsent: isBye };
    res.set(m.id, r);
    visiting.delete(m.id);
    return r;
  };
  bracket.matches.forEach(visit);
  (bracket.groups ?? []).forEach((g) => table(g.id));
  return { res, tables };
}

/** Last round's main match, i.e. the final of an elimination bracket. */
export function mainFinal(bracket: Bracket): Match | undefined {
  const last = bracket.rounds.slice().sort((a, b) => a.order - b.order).pop();
  return bracket.matches.find((m) => m.roundId === last?.id && m.kind === 'main');
}

export function isPlayable(r: Resolved): boolean {
  return !r.isBye && !!r.teamAId && !!r.teamBId;
}

/** A match that will never be played and has no teams at all (safe to hide). */
export function isSkipped(r: Resolved): boolean {
  return r.absentA && r.absentB;
}

export interface SetResultOptions {
  /** true = confirm the winner (strict validation); false = save partial score, match stays in progress. */
  confirm: boolean;
}

export type SetResultOutcome =
  | { ok: true; bracket: Bracket; cleared: string[] }
  | { ok: false; error: string };

const hasRecordedResult = (m: Match) => m.games.length > 0 || m.status === 'complete';

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
      if (m.id === matchId || !hasRecordedResult(m) || before.get(m.id)?.isBye) return m; // byes hold no result
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
