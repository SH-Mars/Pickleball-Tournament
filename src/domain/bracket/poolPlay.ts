import type { Bracket, Group, Slot } from '../types';
import { scheduleGroup } from './roundRobin';
import { buildEliminationFromSlots } from './singleElimination';

export interface PoolOptions {
  pools: number;
  advancePerPool: number;
  thirdPlaceMatch: boolean;
}

export function poolName(i: number): string {
  return String.fromCharCode(65 + i);
}

/** Snake draw over teams in seed order: 1..P go left to right, the next row right to left, and so on. */
export function assignPools(teamIds: string[], pools: number): Group[] {
  const groups: Group[] = Array.from({ length: pools }, (_, i) => ({ id: poolName(i), name: `Pool ${poolName(i)}`, teamIds: [] }));
  teamIds.forEach((id, i) => {
    const row = Math.floor(i / pools);
    const col = i % pools;
    groups[row % 2 === 0 ? col : pools - 1 - col].teamIds.push(id);
  });
  return groups;
}

export function validatePool(teamCount: number, o: Pick<PoolOptions, 'pools' | 'advancePerPool'>): string[] {
  const problems: string[] = [];
  if (!Number.isInteger(o.pools) || o.pools < 2) problems.push('Pool play needs at least 2 pools.');
  else if (teamCount < o.pools * 2) problems.push(`${o.pools} pools need at least ${o.pools * 2} teams (2 per pool). You have ${teamCount}.`);
  else {
    const smallest = Math.floor(teamCount / o.pools);
    if (!Number.isInteger(o.advancePerPool) || o.advancePerPool < 1) problems.push('At least 1 team per pool must advance.');
    else if (o.advancePerPool > smallest) problems.push(`The smallest pool has ${smallest} teams, so at most ${smallest} can advance from each pool.`);
    else if (o.pools * o.advancePerPool < 2) problems.push('At least 2 teams must reach the playoffs.');
  }
  return problems;
}

/**
 * Pools play a round robin. Then the top `advancePerPool` teams from each pool
 * enter a single-elimination playoff, seeded by finishing place first and pool
 * second (A1, B1, ..., A2, B2, ...), which keeps pool-mates apart early.
 */
export function buildPoolPlay(teamIdsInSeedOrder: string[], o: PoolOptions): Bracket {
  const problems = validatePool(teamIdsInSeedOrder.length, o);
  if (problems.length) throw new Error(problems[0]);
  const groups = assignPools(teamIdsInSeedOrder, o.pools);
  const schedules = groups.map((g) => scheduleGroup(g, `${g.name} · `));
  const maxRounds = Math.max(...schedules.map((s) => s.rounds.length));
  const rounds = [];
  const matches = [];
  let order = 1;
  for (let r = 0; r < maxRounds; r++) {
    for (const s of schedules) {
      const x = s.rounds[r];
      if (!x) continue;
      rounds.push({ ...x.round, order: order++ });
      matches.push(...x.matches);
    }
  }
  const seedSlots: Slot[] = [];
  for (let rank = 1; rank <= o.advancePerPool; rank++) for (const g of groups) seedSlots.push({ kind: 'standing', groupId: g.id, rank });
  const playoff = buildEliminationFromSlots(seedSlots, { thirdPlaceMatch: o.thirdPlaceMatch, idPrefix: 'P', section: 'Playoffs', orderStart: order });
  return { formatId: 'pool_play', groups, rounds: [...rounds, ...playoff.rounds], matches: [...matches, ...playoff.matches] };
}
