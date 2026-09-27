import { describe, expect, it } from 'vitest';
import {
  buildSingleElimination, championId, clearResult, resolveBracket, seedOrder, setResult, validateGame, validateResult, readyMatches,
} from '../src/domain/bracket';
import type { Bracket, ScoringSettings } from '../src/domain/types';

const S: ScoringSettings = { pointsToWin: 11, winBy2: true, gamesPerMatch: 1 };
const teams = (n: number) => Array.from({ length: n }, (_, i) => `T${i + 1}`);
const win = (b: Bracket, id: string, side: 'A' | 'B', s = S) => {
  const r = setResult(b, s, id, [side === 'A' ? { a: 11, b: 5 } : { a: 5, b: 11 }], { confirm: true });
  if (!r.ok) throw new Error(r.error);
  return r;
};

describe('structure', () => {
  it.each([[2, 1, 1], [4, 2, 3], [8, 3, 7], [16, 4, 15], [32, 5, 31]])('%i teams -> %i rounds, %i matches', (n, rounds, matches) => {
    const b = buildSingleElimination(teams(n), { thirdPlaceMatch: false });
    expect(b.rounds).toHaveLength(rounds);
    expect(b.matches).toHaveLength(matches);
  });
  it('names rounds', () => {
    expect(buildSingleElimination(teams(8), { thirdPlaceMatch: false }).rounds.map((r) => r.name)).toEqual(['Quarterfinals', 'Semifinals', 'Final']);
    expect(buildSingleElimination(teams(16), { thirdPlaceMatch: false }).rounds[0].name).toBe('Round of 16');
  });
  it('standard seeding', () => {
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    const b = buildSingleElimination(teams(8), { thirdPlaceMatch: false });
    const r = resolveBracket(b, S);
    expect(r.get('R1M1')).toMatchObject({ teamAId: 'T1', teamBId: 'T8' });
    expect(r.get('R1M2')).toMatchObject({ teamAId: 'T4', teamBId: 'T5' });
  });
  it('rejects fewer than 2 teams', () => {
    expect(() => buildSingleElimination(['a'], { thirdPlaceMatch: false })).toThrow();
  });
});

describe('byes', () => {
  it.each([3, 5, 6, 7, 9, 12, 13, 20])('%i teams: byes go to top seeds and advance automatically', (n) => {
    const b = buildSingleElimination(teams(n), { thirdPlaceMatch: false });
    const size = 2 ** Math.ceil(Math.log2(n));
    const res = resolveBracket(b, S);
    const byes = b.matches.filter((m) => res.get(m.id)!.isBye);
    expect(byes).toHaveLength(size - n);
    // every team appears exactly once in round 1
    const r1 = b.matches.filter((m) => m.roundId === 'R1').flatMap((m) => [res.get(m.id)!.teamAId, res.get(m.id)!.teamBId]).filter(Boolean);
    expect(new Set(r1).size).toBe(n);
    // the byed teams are seeds 1..byes
    byes.forEach((m) => expect(Number(res.get(m.id)!.winnerId!.slice(1))).toBeLessThanOrEqual(size - n));
    // no match in round 1 has two byes
    byes.forEach((m) => expect([m.slotA.kind, m.slotB.kind].filter((k) => k === 'bye')).toHaveLength(1));
    // byes never count as playable
    expect(readyMatches(b, S).every((m) => !res.get(m.id)!.isBye)).toBe(true);
  });
  it('5 teams: top 3 seeds skip round 1', () => {
    const b = buildSingleElimination(teams(5), { thirdPlaceMatch: false });
    const res = resolveBracket(b, S);
    expect(res.get('R2M1')!.teamAId).toBe('T1');
    expect(res.get('R2M1')!.teamBId).toBeNull(); // waiting for T4 v T5
    expect(res.get('R2M2')!.teamAId).toBe('T2');
    expect(res.get('R2M2')!.teamBId).toBe('T3');
  });
});

describe('advancement and champion', () => {
  it('plays out an 8-team bracket', () => {
    let b = buildSingleElimination(teams(8), { thirdPlaceMatch: false });
    for (const id of ['R1M1', 'R1M2', 'R1M3', 'R1M4']) b = win(b, id, 'A').bracket;
    let res = resolveBracket(b, S);
    expect(res.get('R2M1')).toMatchObject({ teamAId: 'T1', teamBId: 'T4' });
    expect(res.get('R2M2')).toMatchObject({ teamAId: 'T2', teamBId: 'T3' });
    expect(championId(b, S)).toBeNull();
    b = win(b, 'R2M1', 'B').bracket;
    b = win(b, 'R2M2', 'A').bracket;
    res = resolveBracket(b, S);
    expect(res.get('R3M1')).toMatchObject({ teamAId: 'T4', teamBId: 'T2' });
    b = win(b, 'R3M1', 'B').bracket;
    expect(championId(b, S)).toBe('T2');
  });
  it('2 teams: the final decides the champion', () => {
    const b = win(buildSingleElimination(teams(2), { thirdPlaceMatch: false }), 'R1M1', 'B').bracket;
    expect(championId(b, S)).toBe('T2');
  });
  it('refuses scores until both teams are known', () => {
    const b = buildSingleElimination(teams(4), { thirdPlaceMatch: false });
    const r = setResult(b, S, 'R2M1', [{ a: 11, b: 3 }], { confirm: true });
    expect(r.ok).toBe(false);
  });
  it('refuses scoring a bye', () => {
    const b = buildSingleElimination(teams(3), { thirdPlaceMatch: false });
    const bye = b.matches.find((m) => m.slotB.kind === 'bye')!;
    expect(setResult(b, S, bye.id, [{ a: 11, b: 0 }], { confirm: true }).ok).toBe(false);
  });
});

describe('corrections', () => {
  const played = () => {
    let b = buildSingleElimination(teams(4), { thirdPlaceMatch: false });
    b = win(b, 'R1M1', 'A').bracket; // T1
    b = win(b, 'R1M2', 'A').bracket; // T2
    b = win(b, 'R2M1', 'A').bracket; // T1 champion
    return b;
  };
  it('fixing a score without changing the winner keeps later results', () => {
    const r = setResult(played(), S, 'R1M1', [{ a: 11, b: 9 }], { confirm: true });
    expect(r.ok && r.cleared).toEqual([]);
    expect(championId((r as { bracket: Bracket }).bracket, S)).toBe('T1');
  });
  it('flipping a winner clears dependent results and reports them', () => {
    const r = setResult(played(), S, 'R1M1', [{ a: 4, b: 11 }], { confirm: true });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.cleared).toEqual(['R2M1']);
      expect(resolveBracket(r.bracket, S).get('R2M1')).toMatchObject({ teamAId: 'T4', teamBId: 'T2', winnerId: null });
      expect(championId(r.bracket, S)).toBeNull();
    }
  });
  it('undo removes the result and cascades', () => {
    const r = clearResult(played(), S, 'R1M2');
    expect(r.ok && r.cleared).toEqual(['R2M1']);
    if (r.ok) expect(r.bracket.matches.find((m) => m.id === 'R1M2')).toMatchObject({ status: 'not_started', games: [] });
  });
  it('does not mutate the input bracket', () => {
    const b = played();
    const snapshot = JSON.stringify(b);
    setResult(b, S, 'R1M1', [{ a: 4, b: 11 }], { confirm: true });
    expect(JSON.stringify(b)).toBe(snapshot);
  });
  it('partial scores keep the match in progress with no winner', () => {
    const b = buildSingleElimination(teams(2), { thirdPlaceMatch: false });
    const r = setResult(b, S, 'R1M1', [{ a: 6, b: 4 }], { confirm: false });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.bracket.matches[0].status).toBe('in_progress');
      expect(championId(r.bracket, S)).toBeNull();
    }
  });
});

describe('third place', () => {
  it('is fed by the semifinal losers', () => {
    let b = buildSingleElimination(teams(4), { thirdPlaceMatch: true });
    b = win(b, 'R1M1', 'A').bracket;
    b = win(b, 'R1M2', 'B').bracket; // T3 beats T2
    const res = resolveBracket(b, S);
    expect(res.get('THIRD')).toMatchObject({ teamAId: 'T4', teamBId: 'T2' });
    expect(championId(b, S)).toBeNull();
  });
});

describe('score validation', () => {
  it('win by 2 to 11', () => {
    expect(validateGame({ a: 11, b: 9 }, S)).toBeNull();
    expect(validateGame({ a: 11, b: 10 }, S)).toMatch(/by 2/);
    expect(validateGame({ a: 12, b: 10 }, S)).toBeNull();
    expect(validateGame({ a: 13, b: 10 }, S)).toMatch(/lead/);
    expect(validateGame({ a: 10, b: 8 }, S)).toMatch(/at least 11/);
    expect(validateGame({ a: 11, b: 11 }, S)).toMatch(/tie/);
    expect(validateGame({ a: -1, b: 11 }, S)).toMatch(/whole/);
    expect(validateGame({ a: 1.5, b: 11 }, S)).toMatch(/whole/);
  });
  it('first to N without win-by-2', () => {
    const s = { ...S, winBy2: false };
    expect(validateGame({ a: 11, b: 10 }, s)).toBeNull();
    expect(validateGame({ a: 12, b: 10 }, s)).toMatch(/ends at 11/);
  });
  it('best of 3', () => {
    const s: ScoringSettings = { ...S, gamesPerMatch: 3 };
    expect(validateResult([{ a: 11, b: 5 }], s)).toMatch(/win 2/);
    expect(validateResult([{ a: 11, b: 5 }, { a: 11, b: 6 }], s)).toBeNull();
    expect(validateResult([{ a: 11, b: 5 }, { a: 5, b: 11 }, { a: 11, b: 2 }], s)).toBeNull();
    expect(validateResult([{ a: 11, b: 5 }, { a: 11, b: 6 }, { a: 11, b: 2 }], s)).toMatch(/already decided/);
    expect(validateResult([], s)).toMatch(/Enter/);
  });
  it('best-of-3 advances on games won, not points', () => {
    const s: ScoringSettings = { ...S, gamesPerMatch: 3 };
    const b = buildSingleElimination(teams(2), { thirdPlaceMatch: false });
    const r = setResult(b, s, 'R1M1', [{ a: 11, b: 0 }, { a: 9, b: 11 }, { a: 8, b: 11 }], { confirm: true });
    expect(r.ok && championId(r.bracket, s)).toBe('T2');
  });
});
