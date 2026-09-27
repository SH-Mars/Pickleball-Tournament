/** Core domain model. Pure data, JSON-serializable, no UI concerns. */

export const SCHEMA_VERSION = 2;
export const APP_VERSION = '1.0.0';
/** Bump when pairing output for the same inputs+seed would change. */
export const PAIRING_ALGORITHM_VERSION = 1;

export type Gender = 'male' | 'female' | 'other' | 'unspecified';
export type GenderCategory = 'male' | 'female' | 'other';

export interface Player {
  id: string;
  name: string;
  gender: Gender;
  rating?: number;
  active: boolean;
}

export type TeamSource = 'generated' | 'manual';

export interface Team {
  id: string;
  playerIds: string[];
  source: TeamSource;
  locked: boolean;
}

export type StrategyId = 'random' | 'balanced' | 'skill' | 'mens' | 'womens' | 'mixed' | 'custom';

/** Sorted category multiset joined by "+", e.g. "female+male". */
export type ComboKey = string;

export interface PairingConfig {
  strategy: StrategyId;
  teamSize: number;
  /** Only used by the Custom strategy when teamSize is 2. */
  allowedCombinations: ComboKey[];
  /** Hard constraint: these two players may never be on the same team. */
  forbiddenPairs: [string, string][];
  preferences: { balanceSkill: boolean };
  seed: number;
}

export interface GenerationRecord {
  seed: number;
  algorithmVersion: number;
  strategy: StrategyId;
  generatedAt: string;
}

export interface Game {
  a: number;
  b: number;
}

export type MatchStatus = 'not_started' | 'in_progress' | 'complete';

export type Slot =
  | { kind: 'team'; teamId: string }
  | { kind: 'winner'; matchId: string }
  | { kind: 'loser'; matchId: string }
  | { kind: 'bye' }
  /** Team finishing at `rank` (1 = first) in a pool, known once every match in that pool is complete. */
  | { kind: 'standing'; groupId: string; rank: number }
  /** Grand-final reset: only exists if the losers-bracket team won the first grand final. */
  | { kind: 'gfReset'; matchId: string; side: 'A' | 'B' };

export interface Match {
  id: string;
  roundId: string;
  number: number;
  kind: 'main' | 'third_place';
  /** Optional display name; when absent the UI derives one from the round. */
  label?: string;
  /** Set for round-robin and pool matches; standings are computed per group. */
  groupId?: string;
  slotA: Slot;
  slotB: Slot;
  games: Game[];
  status: MatchStatus;
  court?: number;
  startedAt?: string;
}

export interface Round {
  id: string;
  /** Global play order across the whole bracket (1 = first). */
  order: number;
  name: string;
  /** Rounds with the same section are drawn together, e.g. "Winners bracket". */
  section: string;
  kind: 'elimination' | 'group';
}

/** A pool (or the single group of a round robin). */
export interface Group {
  id: string;
  name: string;
  teamIds: string[];
}

export interface Bracket {
  formatId: FormatId;
  rounds: Round[];
  matches: Match[];
  groups?: Group[];
}

export type FormatId = 'single_elimination' | 'round_robin' | 'double_elimination' | 'pool_play';
export type SeedingMethod = 'order' | 'rating' | 'random';

export interface ScoringSettings {
  pointsToWin: number;
  winBy2: boolean;
  gamesPerMatch: 1 | 3 | 5;
}

export interface TournamentSettings {
  courts: number;
  scoring: ScoringSettings;
  thirdPlaceMatch: boolean;
  seeding: SeedingMethod;
  /** Pool play only. */
  pools: number;
  advancePerPool: number;
}

export interface Tournament {
  id: string;
  name: string;
  date: string;
  formatId: FormatId;
  status: 'setup' | 'live';
  settings: TournamentSettings;
  pairing: PairingConfig;
  players: Player[];
  teams: Team[];
  generation?: GenerationRecord;
  bracket?: Bracket;
}
