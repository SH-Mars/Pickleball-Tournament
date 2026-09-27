import type { Rng } from '../rng';
import { shuffle } from '../rng';

/**
 * Generic exact-cover style search: partition n items into groups of size k
 * such that every group passes hard checks. Uses most-constrained-first
 * branching and a shared memo of infeasible remainders, so "impossible" is
 * proven (not guessed) for realistic roster sizes.
 */
export interface SolverProblem {
  n: number;
  k: number;
  /** Necessary condition for two items to share a group. */
  pairOk: (i: number, j: number) => boolean;
  /** Full-group check, called when a group is complete. */
  teamOk: (members: number[]) => boolean;
}

export interface SolverContext {
  failed: Set<string>;
  nodes: { count: number; budget: number };
}

export type SolveOutcome =
  | { status: 'ok'; teams: number[][] }
  | { status: 'infeasible' }
  | { status: 'budget' };

export function newContext(budget = 60000): SolverContext {
  return { failed: new Set(), nodes: { count: 0, budget } };
}

/** Optional hook to bias candidate order (lower score tried first). */
export type CandidateScore = (first: number, partial: number[], candidate: number) => number;

export function findTeams(
  p: SolverProblem,
  rng: Rng,
  ctx: SolverContext,
  score?: CandidateScore,
): SolveOutcome {
  const { n, k } = p;
  const remaining = new Array<boolean>(n).fill(true);
  let left = n;
  const result: number[][] = [];
  const BUDGET = Symbol('budget');

  const key = () => {
    let s = '';
    for (let i = 0; i < n; i++) s += remaining[i] ? '1' : '0';
    return s;
  };

  function pickFirst(): number {
    let best = -1;
    let bestDeg = Infinity;
    for (let i = 0; i < n; i++) {
      if (!remaining[i]) continue;
      let deg = 0;
      for (let j = 0; j < n; j++) if (j !== i && remaining[j] && p.pairOk(i, j)) deg++;
      if (deg < bestDeg) {
        bestDeg = deg;
        best = i;
      }
    }
    return best;
  }

  function rec(): boolean {
    if (left === 0) return true;
    const memoKey = key();
    if (ctx.failed.has(memoKey)) return false;
    if (++ctx.nodes.count > ctx.nodes.budget) throw BUDGET;

    const first = pickFirst();
    remaining[first] = false;
    left--;
    let cands: number[] = [];
    for (let j = 0; j < n; j++) if (remaining[j] && p.pairOk(first, j)) cands.push(j);
    cands = shuffle(cands, rng);
    if (score) {
      const keyed = cands.map((c, idx) => ({ c, s: score(first, [first], c), idx }));
      keyed.sort((x, y) => x.s - y.s || x.idx - y.idx);
      cands = keyed.map((x) => x.c);
    }

    const team = [first];
    const extend = (from: number): boolean => {
      if (team.length === k) {
        if (!p.teamOk(team.slice())) return false;
        result.push(team.slice());
        const ok = rec();
        if (ok) return true;
        result.pop();
        return false;
      }
      for (let ci = from; ci < cands.length; ci++) {
        const c = cands[ci];
        if (!remaining[c]) continue;
        let compatible = true;
        for (let t = 1; t < team.length; t++) {
          if (!p.pairOk(team[t], c)) {
            compatible = false;
            break;
          }
        }
        if (!compatible) continue;
        remaining[c] = false;
        left--;
        team.push(c);
        const ok = extend(ci + 1);
        team.pop();
        remaining[c] = true;
        left++;
        if (ok) return true;
      }
      return false;
    };

    const ok = extend(0);
    if (ok) return true;
    remaining[first] = true;
    left++;
    ctx.failed.add(memoKey);
    return false;
  }

  try {
    const ok = rec();
    return ok ? { status: 'ok', teams: result.map((t) => t.slice()) } : { status: 'infeasible' };
  } catch (e) {
    if (e === BUDGET) return { status: 'budget' };
    throw e;
  }
}
