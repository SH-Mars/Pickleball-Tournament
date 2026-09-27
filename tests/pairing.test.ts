import { describe, expect, it } from 'vitest';
import { runPairing } from '../src/domain/pairing';
import type { Player } from '../src/domain/types';
import { cfg, mk } from './helpers';

function ok(players: Player[], c: ReturnType<typeof cfg>) {
  const r = runPairing({ players, config: c });
  if (!r.ok) throw new Error(r.error.message + ' ' + r.error.details.join(' '));
  return r;
}
const byId = (ps: Player[]) => new Map(ps.map((p) => [p.id, p]));
const key = (a: string, b: string) => [a, b].sort().join('|');

function assertPartition(players: Player[], teams: string[][], k = 2) {
  const ids = teams.flat();
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids.sort()).toEqual(players.filter((p) => p.active).map((p) => p.id).sort());
  teams.forEach((t) => expect(t).toHaveLength(k));
}

describe('random', () => {
  it('pairs everyone exactly once', () => {
    const ps = mk('M:6,F:6');
    assertPartition(ps, ok(ps, cfg()).teams);
  });
  it('ignores inactive players', () => {
    const ps = mk('M:5,F:4');
    ps[0].active = false;
    assertPartition(ps, ok(ps, cfg()).teams);
  });
  it('supports other team sizes', () => {
    const ps = mk('M:6,F:3');
    assertPartition(ps, ok(ps, cfg({ teamSize: 3 })).teams, 3);
    const solo = mk('M:3');
    assertPartition(solo, ok(solo, cfg({ teamSize: 1 })).teams, 1);
  });
});

describe('gender strategies', () => {
  it("men's doubles", () => {
    const ps = mk('M:6');
    const m = byId(ps);
    ok(ps, cfg({ strategy: 'mens' })).teams.forEach((t) => t.forEach((id) => expect(m.get(id)!.gender).toBe('male')));
  });
  it("men's doubles fails when a non-male is on the roster", () => {
    const r = runPairing({ players: mk('M:4,F:2'), config: cfg({ strategy: 'mens' }) });
    expect(r.ok).toBe(false);
  });
  it("women's doubles", () => {
    const ps = mk('F:4');
    assertPartition(ps, ok(ps, cfg({ strategy: 'womens' })).teams);
  });
  it('mixed doubles pairs one of each', () => {
    const ps = mk('M:5,F:5');
    const m = byId(ps);
    for (const t of ok(ps, cfg({ strategy: 'mixed' })).teams) expect(t.map((id) => m.get(id)!.gender).sort()).toEqual(['female', 'male']);
  });
  it('mixed doubles impossible with unequal counts and explains why', () => {
    const r = runPairing({ players: mk('M:6,F:4'), config: cfg({ strategy: 'mixed' }) });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('no_valid_pairing');
      expect(r.error.details.join(' ')).toMatch(/can only be paired with/);
      expect(r.error.suggestions.length).toBeGreaterThan(0);
    }
  });
});

describe('custom: the "more men than women, no F+F" tournament', () => {
  const combos = ['male+male', 'female+male'];
  it('never produces Female + Female', () => {
    const ps = mk('M:10,F:4');
    const m = byId(ps);
    for (let seed = 1; seed <= 50; seed++) {
      const r = ok(ps, cfg({ strategy: 'custom', allowedCombinations: combos, seed }));
      assertPartition(ps, r.teams);
      r.teams.forEach((t) => expect(t.filter((id) => m.get(id)!.gender === 'female').length).toBeLessThanOrEqual(1));
    }
  });
  it('is impossible when women outnumber men', () => {
    const r = runPairing({ players: mk('M:2,F:4'), config: cfg({ strategy: 'custom', allowedCombinations: combos }) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.suggestions.join(' ')).toMatch(/Female \+ Female/);
  });
  it('requires at least one combination', () => {
    const r = runPairing({ players: mk('M:4'), config: cfg({ strategy: 'custom', allowedCombinations: [] }) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid_config');
  });
  it('handles other/unspecified players only when allowed', () => {
    const ps = mk('M:2,O:2');
    expect(runPairing({ players: ps, config: cfg({ strategy: 'custom', allowedCombinations: ['male+male'] }) }).ok).toBe(false);
    assertPartition(ps, ok(ps, cfg({ strategy: 'custom', allowedCombinations: ['male+other'] })).teams);
  });
});

describe('forbidden pairs', () => {
  it('are never violated, even several at once', () => {
    const ps = mk('M:8');
    const forbidden: [string, string][] = [['p1', 'p2'], ['p3', 'p4'], ['p1', 'p3'], ['p5', 'p6'], ['p7', 'p8']];
    const fset = new Set(forbidden.map(([a, b]) => key(a, b)));
    for (let seed = 1; seed <= 100; seed++) {
      const r = ok(ps, cfg({ forbiddenPairs: forbidden, seed }));
      r.teams.forEach(([a, b]) => expect(fset.has(key(a, b))).toBe(false));
    }
  });
  it('detects an isolated player', () => {
    const ps = mk('M:4');
    const r = runPairing({ players: ps, config: cfg({ forbiddenPairs: [['p1', 'p2'], ['p1', 'p3'], ['p1', 'p4']] }) });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.details[0]).toMatch(/M1 has no eligible partner/);
      expect(r.error.suggestions.join(' ')).toMatch(/Allow M1 and M/);
    }
  });
  it('detects two players competing for one partner', () => {
    const ps = mk('M:4');
    const r = runPairing({ players: ps, config: cfg({ forbiddenPairs: [['p1', 'p2'], ['p1', 'p3'], ['p2', 'p3'], ['p2', 'p4']] }) });
    // p1 can only pair with p4, p2 with nobody => isolated; use a subtler case below
    expect(r.ok).toBe(false);
    const r2 = runPairing({ players: mk('M:4'), config: cfg({ forbiddenPairs: [['p1', 'p2'], ['p1', 'p3'], ['p2', 'p3']] }) });
    expect(r2.ok).toBe(false); // p1,p2,p3 all need p4
    if (!r2.ok) expect(r2.error.details.join(' ')).toMatch(/can only be paired with/);
  });
  it('solves tight but feasible puzzles', () => {
    const ps = mk('M:6');
    // forces the chain 1-2, 3-4, 5-6
    const all: [string, string][] = [];
    const want = new Set(['p1|p2', 'p3|p4', 'p5|p6']);
    for (let i = 1; i <= 6; i++) for (let j = i + 1; j <= 6; j++) if (!want.has(`p${i}|p${j}`)) all.push([`p${i}`, `p${j}`]);
    const r = ok(ps, cfg({ forbiddenPairs: all }));
    expect(r.teams.map((t) => t.slice().sort().join('|')).sort()).toEqual(['p1|p2', 'p3|p4', 'p5|p6']);
  });
});

describe('roster errors', () => {
  it('too few players', () => {
    const r = runPairing({ players: mk('M:1'), config: cfg() });
    expect(!r.ok && r.error.code).toBe('too_few_players');
  });
  it('odd player count', () => {
    const r = runPairing({ players: mk('M:5'), config: cfg() });
    expect(!r.ok && r.error.code).toBe('indivisible');
  });
  it('duplicate names', () => {
    const ps = mk('M:4');
    ps[1].name = ' m1 ';
    ps[0].name = 'M1';
    const r = runPairing({ players: ps, config: cfg() });
    expect(!r.ok && r.error.code).toBe('invalid_players');
  });
});

describe('seeds', () => {
  const ps = mk('M:10,F:10');
  it('same inputs and seed reproduce the same teams', () => {
    const c = cfg({ strategy: 'custom', seed: 42 });
    expect(ok(ps, c).teams).toEqual(ok(ps, c).teams);
  });
  it('different seeds give different teams', () => {
    const a = JSON.stringify(ok(ps, cfg({ seed: 1 })).teams);
    const b = JSON.stringify(ok(ps, cfg({ seed: 2 })).teams);
    expect(a).not.toBe(b);
  });
});

describe('locked teams', () => {
  it('excludes locked players from the draw', () => {
    const ps = mk('M:6');
    const r = runPairing({ players: ps, config: cfg(), lockedTeams: [{ playerIds: ['p1', 'p2'] }] });
    expect(r.ok && r.teams.flat().sort()).toEqual(['p3', 'p4', 'p5', 'p6']);
  });
});

describe('skill balancing', () => {
  const ratings = [5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5];
  const ps = mk('M:8', (i) => ratings[i - 1]);
  const spread = (teams: string[][]) => {
    const r = new Map(ps.map((p) => [p.id, p.rating!]));
    const s = teams.map((t) => t.reduce((a, id) => a + r.get(id)!, 0));
    return Math.max(...s) - Math.min(...s);
  };
  it('skill strategy finds the optimal split (all teams sum to 6.5)', () => {
    expect(spread(ok(ps, cfg({ strategy: 'skill' })).teams)).toBeCloseTo(0);
  });
  it('is at least as balanced as random on average', () => {
    let bal = 0;
    let rnd = 0;
    for (let seed = 1; seed <= 20; seed++) {
      bal += spread(ok(ps, cfg({ strategy: 'balanced', seed })).teams);
      rnd += spread(ok(ps, cfg({ strategy: 'random', seed })).teams);
    }
    expect(bal).toBeLessThan(rnd);
  });
  it('balances while honouring forbidden pairs', () => {
    const r = ok(ps, cfg({ strategy: 'skill', forbiddenPairs: [['p1', 'p8']] }));
    r.teams.forEach((t) => expect(t.includes('p1') && t.includes('p8')).toBe(false));
  });
  it('notes when ratings are missing', () => {
    const r = ok(mk('M:4'), cfg({ strategy: 'skill' }));
    expect(r.notes.join(' ')).toMatch(/skipped/);
  });
});

describe('performance', () => {
  it('handles 40 players with many constraints quickly', () => {
    const ps = mk('M:26,F:14', (i) => (i % 7) + 1);
    const forb: [string, string][] = [];
    for (let i = 1; i <= 38; i += 2) forb.push([`p${i}`, `p${i + 1}`]);
    const t = Date.now();
    const r = ok(ps, cfg({ strategy: 'custom', forbiddenPairs: forb, preferences: { balanceSkill: true } }));
    assertPartition(ps, r.teams);
    expect(Date.now() - t).toBeLessThan(5000);
  });
});
