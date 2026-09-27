import type { Bracket, Group, Match, Round } from '../types';

/** Circle method. Returns rounds of pairings; with an odd count one team sits out each round. */
export function roundRobinPairings(teamIds: string[]): [string, string][][] {
  const t: (string | null)[] = teamIds.slice();
  if (t.length % 2 === 1) t.push(null);
  const n = t.length;
  const rounds: [string, string][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = t[i];
      const b = t[n - 1 - i];
      if (a && b) pairs.push(r % 2 === 0 || i > 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    // keep the first team fixed and rotate the rest
    t.splice(1, 0, t.pop() as string | null);
  }
  return rounds;
}

export interface GroupSchedule {
  group: Group;
  /** rounds[r] holds the matches of that round */
  rounds: { round: Omit<Round, 'order'>; matches: Match[] }[];
}

export function scheduleGroup(group: Group, labelPrefix: string): GroupSchedule {
  const pairings = roundRobinPairings(group.teamIds);
  const rounds = pairings.map((pairs, r) => {
    const roundId = `${group.id}-R${r + 1}`;
    const matches: Match[] = pairs.map(([a, b], i) => ({
      id: `${roundId}M${i + 1}`,
      roundId,
      number: i + 1,
      kind: 'main',
      groupId: group.id,
      label: `${labelPrefix}Round ${r + 1} · Match ${i + 1}`,
      slotA: { kind: 'team', teamId: a },
      slotB: { kind: 'team', teamId: b },
      games: [],
      status: 'not_started',
    }));
    return { round: { id: roundId, name: `Round ${r + 1}`, section: group.name, kind: 'group' as const }, matches };
  });
  return { group, rounds };
}

export function buildRoundRobin(teamIds: string[]): Bracket {
  if (teamIds.length < 2) throw new Error('At least 2 teams are needed for a round robin.');
  const group: Group = { id: 'RR', name: 'Round robin', teamIds: teamIds.slice() };
  const sched = scheduleGroup(group, '');
  return {
    formatId: 'round_robin',
    groups: [group],
    rounds: sched.rounds.map((x, i) => ({ ...x.round, order: i + 1 })),
    matches: sched.rounds.flatMap((x) => x.matches),
  };
}
