import { describe, expect, it } from 'vitest';
import {
  assignPools, buildDoubleElimination, buildPoolPlay, buildRoundRobin, buildSingleElimination, championId, computeStandings,
  getFormat, groupTables, isPlayable, readyMatches, resolveBracket, roundRobinPairings, setResult, validatePool,
} from '../src/domain/bracket';
import type { Bracket, ScoringSettings } from '../src/domain/types';

const S: ScoringSettings = { pointsToWin: 11, winBy2: true, gamesPerMatch: 1 };
const teams = (n: number) => Array.from({ length: n }, (_, i) => `T${i + 1}`);
const seedNo = (id: string | null) => Number((id ?? 'T0').slice(1));

type Pick = (a: string, b: string, matchId: string) => 'A' | 'B';
/** Plays every ready match (in bracket order) until nothing is left. Returns the final bracket and how many matches were played. */
function playAll(b: Bracket, pick: Pick, s = S): { bracket: Bracket; played: string[]; losses: Map<string, number> } {
  const played: string[] = [];
  const losses = new Map<string, number>();
  let cur = b;
  for (let guard = 0; guard < 1000; guard++) {
    const ready = readyMatches(cur, s);
    if (!ready.length) break;
    const m = ready[0];
    const r = resolveBracket(cur, s).get(m.id)!;
    const side = pick(r.teamAId!, r.teamBId!, m.id);
    const out = setResult(cur, s, m.id, [side === 'A' ? { a: 11, b: 6 } : { a: 6, b: 11 }], { confirm: true });
    if (!out.ok) throw new Error(out.error);
    expect(out.cleared).toEqual([]); // playing forward never invalidates anything
    cur = out.bracket;
    played.push(m.id);
    const loser = side === 'A' ? r.teamBId! : r.teamAId!;
    losses.set(loser, (losses.get(loser) ?? 0) + 1);
  }
  return { bracket: cur, played, losses };
}
const higherSeed: Pick = (a, b) => (seedNo(a) < seedNo(b) ? 'A' : 'B');
let rngState = 12345;
const rnd = () => ((rngState = (rngState * 1664525 + 1013904223) >>> 0) / 4294967296);
const coin: Pick = () => (rnd() < 0.5 ? 'A' : 'B');

describe('round robin schedule', () => {
  it.each([2, 3, 4, 5, 6, 7, 8, 11])('%i teams: every pair meets exactly once and nobody plays twice in a round', (n) => {
    const rounds = roundRobinPairings(teams(n));
    expect(rounds).toHaveLength(n % 2 ? n : n - 1);
    const seen = new Set<string>();
    for (const round of rounds) {
      const inRound = round.flat();
      expect(new Set(inRound).size).toBe(inRound.length);
      for (const [a, b] of round) {
        const k = [a, b].sort().join('|');
        expect(seen.has(k)).toBe(false);
        seen.add(k);
      }
    }
    expect(seen.size).toBe((n * (n - 1)) / 2);
  });
  it('builds matches, one group, and crowns the best record', () => {
    const b = buildRoundRobin(teams(4));
    expect(b.matches).toHaveLength(6);
    expect(b.groups).toHaveLength(1);
    expect(championId(b, S)).toBeNull();
    const done = playAll(b, higherSeed).bracket;
    expect(championId(done, S)).toBe('T1');
    const t = groupTables(done, S).get('RR')!;
    expect(t.complete).toBe(true);
    expect(t.rows.map((r) => r.teamId)).toEqual(['T1', 'T2', 'T3', 'T4']);
    expect(t.rows.map((r) => r.wins)).toEqual([3, 2, 1, 0]);
  });
  it('no champion until every match is complete', () => {
    const b = buildRoundRobin(teams(3));
    const r = readyMatches(b, S)[0];
    const half = setResult(b, S, r.id, [{ a: 11, b: 2 }], { confirm: true });
    expect(half.ok && championId(half.bracket, S)).toBeNull();
  });
});

describe('standings tiebreaks', () => {
  const res = (a: string, b: string, winner: string, sa: number, sb: number) => ({ teamAId: a, teamBId: b, winnerId: winner, games: [{ a: sa, b: sb }] });
  it('orders by wins first', () => {
    const rows = computeStandings(['A', 'B', 'C'], [res('A', 'B', 'A', 11, 5), res('A', 'C', 'A', 11, 5), res('B', 'C', 'B', 11, 5)]);
    expect(rows.map((r) => r.teamId)).toEqual(['A', 'B', 'C']);
    expect(rows[0]).toMatchObject({ wins: 2, losses: 0, played: 2, pointsFor: 22, pointsAgainst: 10, diff: 12, rank: 1 });
  });
  it('breaks a tie on wins by head-to-head, even against point differential', () => {
    // A, B, C, D: A and B both 2-1. B beat A head to head but A has the far better point differential.
    const rows = computeStandings(['A', 'B', 'C', 'D'], [
      res('A', 'B', 'B', 9, 11), res('A', 'C', 'A', 11, 0), res('A', 'D', 'A', 11, 0),
      res('B', 'C', 'C', 8, 11), res('B', 'D', 'B', 11, 9), res('C', 'D', 'D', 9, 11),
    ]);
    const a = rows.find((r) => r.teamId === 'A')!;
    const b = rows.find((r) => r.teamId === 'B')!;
    expect(a.wins).toBe(2);
    expect(b.wins).toBe(2);
    expect(a.diff).toBeGreaterThan(b.diff);
    expect(b.rank).toBeLessThan(a.rank);
  });
  it('uses point differential when a three-way cycle ties head-to-head', () => {
    const rows = computeStandings(['A', 'B', 'C'], [res('A', 'B', 'A', 11, 9), res('B', 'C', 'B', 11, 0), res('C', 'A', 'C', 11, 8)]);
    expect(rows.every((r) => r.wins === 1)).toBe(true);
    expect(rows.map((r) => r.teamId)).toEqual(['B', 'A', 'C']); // diffs: B +9, A -1, C -8
  });
  it('ignores matches that are not complete and falls back to team order', () => {
    const rows = computeStandings(['A', 'B'], [{ teamAId: 'A', teamBId: 'B', winnerId: null, games: [{ a: 5, b: 3 }] }]);
    expect(rows.map((r) => r.teamId)).toEqual(['A', 'B']);
    expect(rows[0].played).toBe(0);
  });
});

describe('double elimination', () => {
  it.each([[4, 6], [8, 14]])('%i teams has the right shape', (n, _lb) => {
    const b = buildDoubleElimination(teams(n));
    const wb = b.matches.filter((m) => m.id.startsWith('WR')).length;
    const lb = b.matches.filter((m) => m.id.startsWith('LR')).length;
    expect(wb).toBe(n - 1);
    expect(lb).toBe(n - 2);
    expect(b.matches.filter((m) => m.id.startsWith('GF'))).toHaveLength(2);
    expect(b.rounds.map((r) => r.order)).toEqual(b.rounds.map((_, i) => i + 1));
  });
  it('rejects fewer than 3 teams', () => {
    expect(() => buildDoubleElimination(teams(2))).toThrow();
    expect(getFormat('double_elimination').validate(2, { thirdPlaceMatch: false, pools: 2, advancePerPool: 2 })).not.toEqual([]);
  });
  it('the undefeated team wins the first grand final: reset is skipped', () => {
    const b = buildDoubleElimination(teams(8));
    const { bracket, played, losses } = playAll(b, higherSeed);
    expect(championId(bracket, S)).toBe('T1');
    expect(played).not.toContain('GF2');
    expect(played).toHaveLength(14); // 2n-2
    expect(losses.get('T1') ?? 0).toBe(0);
  });
  it('when the losers-bracket team wins the first grand final, a reset decides it', () => {
    const b = buildDoubleElimination(teams(8));
    // Everyone plays normally, but in GF1 the losers-bracket team wins; in GF2 the higher seed wins.
    const pick: Pick = (a, bb, id) => (id === 'GF1' ? 'B' : higherSeed(a, bb, id));
    const { bracket, played } = playAll(b, pick);
    expect(played).toContain('GF2');
    expect(played).toHaveLength(15); // 2n-1
    const res = resolveBracket(bracket, S);
    expect(championId(bracket, S)).toBe(res.get('GF2')!.winnerId);
    expect(res.get('GF2')!.teamAId).toBe('T1');
  });
  it('champion is unknown while a reset is pending', () => {
    let b = buildDoubleElimination(teams(4));
    const pick: Pick = (a, bb, id) => (id === 'GF1' ? 'B' : higherSeed(a, bb, id));
    for (let i = 0; i < 100; i++) {
      const ready = readyMatches(b, S).filter((m) => m.id !== 'GF2');
      if (!ready.length) break;
      const m = ready[0];
      const r = resolveBracket(b, S).get(m.id)!;
      const out = setResult(b, S, m.id, [pick(r.teamAId!, r.teamBId!, m.id) === 'A' ? { a: 11, b: 3 } : { a: 3, b: 11 }], { confirm: true });
      if (!out.ok) throw new Error(out.error);
      b = out.bracket;
      if (m.id === 'GF1') break;
    }
    expect(championId(b, S)).toBeNull();
    expect(isPlayable(resolveBracket(b, S).get('GF2')!)).toBe(true);
  });
  it.each([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 16, 17, 24])('%i teams, random results: always finishes, nobody loses more than twice', (n) => {
    for (let trial = 0; trial < 5; trial++) {
      const { bracket, played, losses } = playAll(buildDoubleElimination(teams(n)), coin);
      const champ = championId(bracket, S);
      expect(champ).not.toBeNull();
      expect(played.length === 2 * n - 2 || played.length === 2 * n - 1).toBe(true);
      losses.forEach((c, id) => {
        expect(c).toBeLessThanOrEqual(2);
        if (id !== champ) expect(c).toBe(2);
      });
      expect(losses.size).toBe(n - 1 + (losses.has(champ!) ? 1 : 0));
    }
  });
  it('byes pass teams straight through the losers bracket', () => {
    const b = buildDoubleElimination(teams(5)); // size 8, three byes
    const res = resolveBracket(b, S);
    expect(res.get('WR1M1')!.isBye).toBe(true);
    expect(res.get('LR1M1')!.isBye).toBe(true); // two absent losers or one absent and one pending
    const both = b.matches.filter((m) => res.get(m.id)!.absentA && res.get(m.id)!.absentB);
    expect(both.length).toBeGreaterThan(0);
    for (const m of both) expect(res.get(m.id)!.winnerAbsent).toBe(true);
  });
  it('changing a winners-bracket result resets dependent losers-bracket results', () => {
    const b0 = buildDoubleElimination(teams(4));
    let b = b0;
    const step = (id: string, side: 'A' | 'B') => {
      const out = setResult(b, S, id, [side === 'A' ? { a: 11, b: 4 } : { a: 4, b: 11 }], { confirm: true });
      if (!out.ok) throw new Error(out.error);
      b = out.bracket;
      return out.cleared;
    };
    step('WR1M1', 'A'); step('WR1M2', 'A'); // T1, T2 win; T4, T3 drop
    step('LR1M1', 'A'); // T4 v T3 ... winner advances
    const cleared = step('WR1M1', 'B'); // flip the winner: LR1 participants change
    expect(cleared).toContain('LR1M1');
  });
});

describe('pool play', () => {
  it('snake-drafts teams into pools', () => {
    const g = assignPools(teams(8), 2);
    expect(g.map((x) => x.teamIds)).toEqual([['T1', 'T4', 'T5', 'T8'], ['T2', 'T3', 'T6', 'T7']]);
    const g3 = assignPools(teams(7), 3);
    expect(g3.map((x) => x.teamIds.length)).toEqual([3, 2, 2]);
  });
  it('validates pool settings', () => {
    expect(validatePool(8, { pools: 2, advancePerPool: 2 })).toEqual([]);
    expect(validatePool(3, { pools: 2, advancePerPool: 1 })[0]).toMatch(/at least 4 teams/);
    expect(validatePool(9, { pools: 3, advancePerPool: 4 })[0]).toMatch(/at most 3/);
    expect(validatePool(8, { pools: 1, advancePerPool: 2 })[0]).toMatch(/at least 2 pools/);
    expect(validatePool(4, { pools: 2, advancePerPool: 1 })).toEqual([]); // 2 teams reach the playoff
  });
  const opts = { pools: 2, advancePerPool: 2, thirdPlaceMatch: false };
  it('playoff teams stay unknown until every pool match is done', () => {
    const b = buildPoolPlay(teams(8), opts);
    const res = resolveBracket(b, S);
    expect(res.get('PR1M1')!.teamAId).toBeNull();
    expect(readyMatches(b, S).every((m) => !m.id.startsWith('P'))).toBe(true);
    // play all but one pool match
    let cur = b;
    const poolMatches = b.matches.filter((m) => m.groupId);
    for (const m of poolMatches.slice(0, -1)) {
      const r = resolveBracket(cur, S).get(m.id)!;
      const out = setResult(cur, S, m.id, [{ a: 11, b: 5 }], { confirm: true });
      if (!out.ok) throw new Error(out.error);
      cur = out.bracket;
      void r;
    }
    const r1 = resolveBracket(cur, S).get('PR1M1')!;
    expect(r1.teamAId).not.toBeNull(); // pool A is finished, so A1 is known
    expect(r1.teamBId).toBeNull(); // pool B still has a match to play, so B2 is not
    expect(isPlayable(r1)).toBe(false);
  });
  it('cross-seeds the playoff and crowns the playoff winner', () => {
    const b = buildPoolPlay(teams(8), opts);
    let cur = b;
    for (const m of b.matches.filter((x) => x.groupId)) {
      const out = setResult(cur, S, m.id, [seedNo(resolveBracket(cur, S).get(m.id)!.teamAId) < seedNo(resolveBracket(cur, S).get(m.id)!.teamBId) ? { a: 11, b: 5 } : { a: 5, b: 11 }], { confirm: true });
      if (!out.ok) throw new Error(out.error);
      cur = out.bracket;
    }
    const tables = groupTables(cur, S);
    expect(tables.get('A')!.complete && tables.get('B')!.complete).toBe(true);
    // Pool A = T1,T4,T5,T8 -> order T1,T4,T5,T8; Pool B = T2,T3,T6,T7 -> T2,T3,T6,T7
    const res = resolveBracket(cur, S);
    expect(res.get('PR1M1')).toMatchObject({ teamAId: 'T1', teamBId: 'T3' }); // A1 v B2
    expect(res.get('PR1M2')).toMatchObject({ teamAId: 'T2', teamBId: 'T4' }); // B1 v A2
    const finished = playAll(cur, higherSeed).bracket;
    expect(championId(finished, S)).toBe('T1');
  });
  it('correcting a pool result that changes the standings resets the playoff', () => {
    const b = buildPoolPlay(teams(4), { pools: 2, advancePerPool: 1, thirdPlaceMatch: false });
    // pools: A = T1,T4 ; B = T2,T3 ; one match each; playoff = final A1 v B1
    const { bracket } = playAll(b, higherSeed);
    expect(championId(bracket, S)).toBe('T1');
    const m = bracket.matches.find((x) => x.groupId === 'A')!;
    const flip = setResult(bracket, S, m.id, [{ a: 3, b: 11 }], { confirm: true });
    expect(flip.ok && flip.cleared).toEqual(['PR1M1']);
    if (flip.ok) expect(championId(flip.bracket, S)).toBeNull();
  });
  it.each([[4, 2, 1], [6, 2, 1], [6, 3, 1], [8, 2, 2], [9, 3, 2], [10, 2, 3], [12, 4, 2], [13, 3, 2]])('%i teams, %i pools, %i advance: random results finish', (n, pools, adv) => {
    const cfg = { pools, advancePerPool: adv, thirdPlaceMatch: n % 2 === 0 };
    const { bracket } = playAll(buildPoolPlay(teams(n), cfg), coin);
    expect(championId(bracket, S)).not.toBeNull();
    const total = (n * (n - 1)) / 2; // upper bound only; pools are smaller
    expect(bracket.matches.filter((m) => m.groupId).every((m) => m.status === 'complete')).toBe(true);
    expect(bracket.matches.length).toBeLessThan(total + n);
  });
});

describe('single elimination is unchanged', () => {
  it('still builds ids like R1M1 and has no groups', () => {
    const b = buildSingleElimination(teams(4), { thirdPlaceMatch: false });
    expect(b.matches.map((m) => m.id)).toEqual(['R1M1', 'R1M2', 'R2M1']);
    expect(b.groups).toBeUndefined();
    expect(b.rounds[0]).toMatchObject({ section: 'Main bracket', kind: 'elimination' });
  });
});
