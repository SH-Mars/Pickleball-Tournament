import type { Game, ScoringSettings } from '../types';

export function gamesToWin(gamesPerMatch: number): number {
  return Math.floor(gamesPerMatch / 2) + 1;
}

/** Returns an error message, or null if the game score is a legal final score. */
export function validateGame(g: Game, s: ScoringSettings): string | null {
  const { a, b } = g;
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return 'Scores must be whole numbers, 0 or higher.';
  if (a === b) return 'A game cannot end in a tie.';
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  const P = s.pointsToWin;
  if (hi < P) return `The winner must reach at least ${P} points.`;
  if (s.winBy2) {
    if (hi - lo < 2) return 'The winner must win by 2 points.';
    if (hi > P && hi - lo !== 2) return `Past ${P} the game ends as soon as a team leads by 2 (for example ${hi - (hi - lo) + 2}–${hi - (hi - lo)}).`;
  } else if (hi !== P) {
    return `Without win-by-2 the game ends at ${P} points.`;
  }
  return null;
}

export interface Outcome {
  winsA: number;
  winsB: number;
  /** 'A' or 'B' once a team has won enough games. */
  winner: 'A' | 'B' | null;
}

export function outcomeOf(games: Game[], s: ScoringSettings): Outcome {
  const need = gamesToWin(s.gamesPerMatch);
  let winsA = 0;
  let winsB = 0;
  for (const g of games) {
    if (g.a > g.b) winsA++;
    else if (g.b > g.a) winsB++;
  }
  return { winsA, winsB, winner: winsA >= need ? 'A' : winsB >= need ? 'B' : null };
}

/** Full validation of a set of games for confirming a result. */
export function validateResult(games: Game[], s: ScoringSettings): string | null {
  if (games.length === 0) return 'Enter a score first.';
  if (games.length > s.gamesPerMatch) return `A match has at most ${s.gamesPerMatch} game${s.gamesPerMatch === 1 ? '' : 's'}.`;
  const need = gamesToWin(s.gamesPerMatch);
  let wa = 0;
  let wb = 0;
  for (let i = 0; i < games.length; i++) {
    if (wa >= need || wb >= need) return `The match was already decided before game ${i + 1}.`;
    const err = validateGame(games[i], s);
    if (err) return games.length > 1 ? `Game ${i + 1}: ${err}` : err;
    if (games[i].a > games[i].b) wa++;
    else wb++;
  }
  if (wa < need && wb < need) return `Someone must win ${need} game${need === 1 ? '' : 's'} to finish the match.`;
  return null;
}
