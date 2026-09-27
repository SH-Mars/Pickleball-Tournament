import type { Bracket, ScoringSettings } from '../types';
import { groupTables, mainFinal, resolveBracket } from './bracket';

/** Champion of a bracket, by format rules. Null until it is decided. */
export function championId(bracket: Bracket, scoring: ScoringSettings): string | null {
  const res = resolveBracket(bracket, scoring);
  switch (bracket.formatId) {
    case 'round_robin': {
      const t = groupTables(bracket, scoring).get('RR');
      return t && t.complete ? t.rows[0]?.teamId ?? null : null;
    }
    case 'double_elimination': {
      const gf1 = res.get('GF1');
      const gf2 = res.get('GF2');
      if (!gf1 || !gf2) return null;
      if (gf2.winnerAbsent) return gf1.winnerId; // undefeated team won the first grand final
      if (gf2.teamAId && gf2.teamBId) return gf2.winnerId; // reset match needed
      return null;
    }
    default: {
      const f = mainFinal(bracket);
      return f ? res.get(f.id)?.winnerId ?? null : null;
    }
  }
}
