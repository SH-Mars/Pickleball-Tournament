import type { PairingConfig, Player, Team } from '../types';
import { deriveSeed, mulberry32, shuffle } from '../rng';
import { findTeams, newContext, type CandidateScore, type SolverProblem } from './solver';
import { categoryOf, comboLabel, getStrategy, MAIN_COMBOS, OTHER_COMBOS, type SoftPlan } from './strategies';

export interface PairingError {
  code: 'invalid_players' | 'invalid_config' | 'too_few_players' | 'indivisible' | 'no_valid_pairing' | 'search_limit';
  message: string;
  details: string[];
  suggestions: string[];
}

export type PairingResult =
  | { ok: true; teams: string[][]; cost: number; notes: string[] }
  | { ok: false; error: PairingError };

export interface PairingInput {
  players: Player[];
  config: PairingConfig;
  /** Teams that must be kept as they are; their players are excluded from the draw. */
  lockedTeams?: Pick<Team, 'playerIds'>[];
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function forbiddenSet(config: PairingConfig): Set<string> {
  return new Set(config.forbiddenPairs.map(([a, b]) => pairKey(a, b)));
}

/** Names of teammates that break a hard rule, for manual-edit warnings. */
export function teamViolations(members: Player[], config: PairingConfig): string[] {
  const out: string[] = [];
  const forb = forbiddenSet(config);
  for (let i = 0; i < members.length; i++)
    for (let j = i + 1; j < members.length; j++)
      if (forb.has(pairKey(members[i].id, members[j].id)))
        out.push(`${members[i].name} and ${members[j].name} are not allowed to be teammates`);
  const s = getStrategy(config.strategy);
  if (members.length === config.teamSize && !s.allowsTeam(members, config)) {
    out.push(`${members.map((m) => m.name).join(' + ')} breaks the "${s.label}" team rules`);
  }
  return out;
}

export function checkPlayers(players: Player[]): string[] {
  const errs: string[] = [];
  const seen = new Map<string, string>();
  for (const p of players) {
    const n = p.name.trim();
    if (!n) {
      errs.push('A player has no name.');
      continue;
    }
    const k = n.toLowerCase();
    if (seen.has(k)) errs.push(`Duplicate player: "${n}" appears more than once. Rename one of them.`);
    else seen.set(k, n);
  }
  return errs;
}

function names(ps: Player[], max = 4): string {
  const list = ps.map((p) => p.name);
  return list.length <= max ? list.join(', ') : `${list.slice(0, max).join(', ')} and ${list.length - max} more`;
}

function ratingsFor(pool: Player[]): { r: number[]; rated: number } {
  const known = pool.filter((p) => typeof p.rating === 'number' && Number.isFinite(p.rating));
  const mean = known.length ? known.reduce((s, p) => s + (p.rating as number), 0) / known.length : 0;
  return { r: pool.map((p) => (typeof p.rating === 'number' && Number.isFinite(p.rating) ? p.rating : mean)), rated: known.length };
}

function costOf(teams: number[][], r: number[]): number {
  if (!teams.length) return 0;
  const s = teams.map((t) => t.reduce((a, i) => a + r[i], 0));
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return s.reduce((a, v) => a + (v - mean) * (v - mean), 0);
}

export function runPairing(input: PairingInput): PairingResult {
  const { players, config } = input;
  const strategy = getStrategy(config.strategy);
  const fail = (code: PairingError['code'], message: string, details: string[] = [], suggestions: string[] = []): PairingResult => ({
    ok: false,
    error: { code, message, details, suggestions },
  });

  const playerErrs = checkPlayers(players);
  if (playerErrs.length) return fail('invalid_players', 'The roster has problems that need fixing first.', playerErrs);

  const cfgErrs: string[] = [];
  if (!Number.isInteger(config.teamSize) || config.teamSize < 1 || config.teamSize > 8) cfgErrs.push('Team size must be a whole number from 1 to 8.');
  cfgErrs.push(...(strategy.validateConfig?.(config) ?? []));
  if (cfgErrs.length) return fail('invalid_config', 'The pairing settings are not valid.', cfgErrs);

  const lockedIds = new Set((input.lockedTeams ?? []).flatMap((t) => t.playerIds));
  const pool = players.filter((p) => p.active && !lockedIds.has(p.id));
  const k = config.teamSize;
  const notes: string[] = [];

  if (pool.length === 0) {
    if (input.lockedTeams?.length) return { ok: true, teams: [], cost: 0, notes: ['All teams are locked; nothing to generate.'] };
    return fail('too_few_players', 'Add players before generating teams.', ['There are no active players on the roster.']);
  }
  if (pool.length < k) {
    return fail('too_few_players', `Not enough players: teams of ${k} need at least ${k} players, but only ${pool.length} ${pool.length === 1 ? 'is' : 'are'} available.`, [], ['Add more players or reduce the team size.']);
  }
  if (pool.length % k !== 0) {
    const extra = pool.length % k;
    return fail(
      'indivisible',
      `${pool.length} players can't be split evenly into teams of ${k}.`,
      [],
      [`Add ${k - extra} more player${k - extra === 1 ? '' : 's'}, or mark ${extra} player${extra === 1 ? '' : 's'} inactive.`],
    );
  }

  const forb = forbiddenSet(config);
  const pairOk = (i: number, j: number) =>
    !forb.has(pairKey(pool[i].id, pool[j].id)) && strategy.allowsPair(pool[i], pool[j], config) && strategy.allowsPair(pool[j], pool[i], config);
  const problem: SolverProblem = {
    n: pool.length,
    k,
    pairOk,
    teamOk: (m) => strategy.allowsTeam(m.map((i) => pool[i]), config),
  };
  const ctx = newContext();
  const rng = mulberry32(deriveSeed(config.seed, 'pairing'));

  const first = findTeams(problem, rng, ctx);
  if (first.status === 'budget') {
    return fail('search_limit', 'This roster and rule set is too complex to solve automatically.', ['The search gave up before finding a valid grouping or proving there is none.'], ['Remove some forbidden pairs, or generate in smaller groups using locked teams.']);
  }
  if (first.status === 'infeasible') {
    return { ok: false, error: diagnose(pool, config, problem) };
  }

  let best = first.teams;
  const soft: SoftPlan = strategy.soft(config);
  const { r, rated } = ratingsFor(pool);
  let cost = 0;
  if (soft.balance) {
    if (rated < 2) {
      notes.push('Skill balancing was skipped because fewer than two players have a rating.');
    } else {
      if (rated < pool.length) notes.push(`${pool.length - rated} player(s) have no rating and were treated as average.`);
      const mean = r.reduce((a, b) => a + b, 0) / r.length;
      cost = costOf(best, r);
      const target = mean * k;
      for (let attempt = 0; attempt < soft.restarts; attempt++) {
        const noise = attempt === 0 ? 0 : 1 + rng() * 3;
        const spread = Math.max(1e-9, Math.sqrt(r.reduce((a, v) => a + (v - mean) ** 2, 0) / r.length));
        const score: CandidateScore = (_f, partial, c) =>
          Math.abs(partial.reduce((a, i) => a + r[i], 0) + r[c] + (k - partial.length - 1) * mean - target) + noise * spread * rng();
        const out = findTeams(problem, rng, ctx, score);
        if (out.status !== 'ok') break;
        const c = costOf(out.teams, r);
        if (c < cost - 1e-9) {
          cost = c;
          best = out.teams;
        }
      }
      if (soft.localSearch) best = improve(best, problem, r);
      cost = costOf(best, r);
    }
  }

  const teams = shuffle(
    best.map((t) => t.slice().sort((a, b) => a - b)),
    rng,
  ).map((t) => t.map((i) => pool[i].id));
  return { ok: true, teams, cost, notes };
}

/** Swap single players between teams while it lowers cost and keeps rules satisfied. */
function improve(teams: number[][], p: SolverProblem, r: number[]): number[][] {
  const t = teams.map((x) => x.slice());
  const valid = (team: number[]) => {
    for (let a = 0; a < team.length; a++) for (let b = a + 1; b < team.length; b++) if (!p.pairOk(team[a], team[b])) return false;
    return p.teamOk(team);
  };
  let cur = costOf(t, r);
  for (let iter = 0; iter < 200; iter++) {
    let improved = false;
    for (let x = 0; x < t.length; x++) {
      for (let y = x + 1; y < t.length; y++) {
        for (let a = 0; a < t[x].length; a++) {
          for (let b = 0; b < t[y].length; b++) {
            const pa = t[x][a];
            const pb = t[y][b];
            t[x][a] = pb;
            t[y][b] = pa;
            const c = costOf(t, r);
            if (c < cur - 1e-9 && valid(t[x]) && valid(t[y])) {
              cur = c;
              improved = true;
            } else {
              t[x][a] = pa;
              t[y][b] = pb;
            }
          }
        }
      }
    }
    if (!improved) break;
  }
  return t;
}

function feasible(pool: Player[], config: PairingConfig, removed: string | null, combos: string[] | null): boolean {
  const strategy = getStrategy(config.strategy);
  const cfg: PairingConfig = combos ? { ...config, allowedCombinations: combos } : config;
  const forb = forbiddenSet(cfg);
  if (removed) forb.delete(removed);
  const p: SolverProblem = {
    n: pool.length,
    k: cfg.teamSize,
    pairOk: (i, j) => !forb.has(pairKey(pool[i].id, pool[j].id)) && strategy.allowsPair(pool[i], pool[j], cfg),
    teamOk: (m) => strategy.allowsTeam(m.map((i) => pool[i]), cfg),
  };
  return findTeams(p, mulberry32(1), newContext(20000)).status === 'ok';
}

function diagnose(pool: Player[], config: PairingConfig, problem: SolverProblem): PairingError {
  const strategy = getStrategy(config.strategy);
  const details: string[] = [];
  const suggestions: string[] = [];
  const n = pool.length;
  const k = config.teamSize;
  const forb = forbiddenSet(config);

  const partners = (i: number) => {
    const out: number[] = [];
    for (let j = 0; j < n; j++) if (j !== i && problem.pairOk(i, j)) out.push(j);
    return out;
  };
  const why = (i: number): string[] => {
    const reasons: string[] = [];
    const bannedBy = pool.filter((q) => q.id !== pool[i].id && forb.has(pairKey(pool[i].id, q.id)));
    if (bannedBy.length) reasons.push(`cannot be teamed with ${names(bannedBy)}`);
    const genderBlocked = pool.filter((q, j) => j !== i && !forb.has(pairKey(pool[i].id, q.id)) && !strategy.allowsPair(pool[i], q, config));
    if (genderBlocked.length && genderBlocked.length === n - 1 - bannedBy.length) {
      reasons.push(`the "${strategy.label}" rules do not allow ${cap(categoryOf(pool[i].gender))} players to partner with anyone else on the roster`);
    }
    return reasons;
  };

  if (k === 2) {
    const zero = pool.map((_, i) => i).filter((i) => partners(i).length === 0);
    for (const i of zero.slice(0, 5)) details.push(`${pool[i].name} has no eligible partner: ${why(i).join('; ') || 'every other player is ruled out'}.`);
    if (zero.length > 5) details.push(`…and ${zero.length - 5} more players with no eligible partner.`);

    if (!zero.length) {
      const seen = new Set<string>();
      for (let i = 0; i < n && details.length < 3; i++) {
        const T = partners(i);
        const tset = new Set(T);
        const S = pool.map((_, j) => j).filter((j) => !tset.has(j) && partners(j).every((x) => tset.has(x)));
        if (S.length > T.length) {
          const sig = S.join(',');
          if (seen.has(sig)) continue;
          seen.add(sig);
          details.push(
            `${names(S.map((j) => pool[j]))} can only be paired with ${names(T.map((j) => pool[j]))}, ` +
              `so at most ${T.length} of those ${S.length} players can be placed.`,
          );
        }
      }
    }
  }

  // Suggestions by actually testing each relaxation.
  const tried = new Set<string>();
  for (const [a, b] of config.forbiddenPairs) {
    const key = pairKey(a, b);
    if (tried.has(key) || suggestions.length >= 6) continue;
    tried.add(key);
    const pa = pool.find((p) => p.id === a);
    const pb = pool.find((p) => p.id === b);
    if (!pa || !pb) continue;
    if (feasible(pool, config, key, null)) suggestions.push(`Allow ${pa.name} and ${pb.name} to be teammates (remove that forbidden pairing).`);
  }
  if (k === 2 && config.strategy === 'custom') {
    for (const c of [...MAIN_COMBOS, ...OTHER_COMBOS]) {
      if (config.allowedCombinations.includes(c)) continue;
      if (feasible(pool, config, null, [...config.allowedCombinations, c]))
        suggestions.push(`Allow ${comboLabel(c)} teams.`);
    }
  }
  if (config.strategy !== 'custom' && config.strategy !== 'random' && k === 2) {
    const all = [...MAIN_COMBOS, ...OTHER_COMBOS];
    if (feasible(pool, { ...config, strategy: 'custom', allowedCombinations: all }, null, all))
      suggestions.push('Switch to the Custom or Random strategy, which are less strict about gender.');
  }
  if (!suggestions.length) suggestions.push('Mark a player inactive, or relax one of the pairing restrictions.');

  return {
    code: 'no_valid_pairing',
    message: 'No valid team configuration exists with the current players and pairing restrictions.',
    details: details.length ? details : ['The combined restrictions leave no way to place every player on a team.'],
    suggestions,
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
