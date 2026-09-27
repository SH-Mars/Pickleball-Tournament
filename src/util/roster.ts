import type { Gender, Player } from '../domain/types';
import { newId } from '../domain/tournament';

export function parseGender(s: string): Gender | null {
  const v = s.trim().toLowerCase();
  if (!v) return 'unspecified';
  if (['m', 'male', 'man', 'men', 'boy'].includes(v)) return 'male';
  if (['f', 'female', 'woman', 'women', 'girl'].includes(v)) return 'female';
  if (['o', 'other', 'nb', 'non-binary', 'nonbinary'].includes(v)) return 'other';
  if (['u', 'unspecified', 'prefer not to say', 'prefer not to specify', 'n/a', '-'].includes(v)) return 'unspecified';
  return null;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',' || c === '\t' || c === ';') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

export interface ImportResult { players: Player[]; problems: string[] }

/** Lines of `name[, gender[, rating]]`. A header row is skipped. */
export function parseRoster(text: string): ImportResult {
  const players: Player[] = [];
  const problems: string[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  lines.forEach((line, i) => {
    const cols = splitCsvLine(line);
    if (i === 0 && /^(name|player|players)$/i.test(cols[0])) return;
    const name = cols[0];
    if (!name) { problems.push(`Line ${i + 1}: no name.`); return; }
    const gender = parseGender(cols[1] ?? '');
    if (gender === null) { problems.push(`Line ${i + 1}: "${cols[1]}" is not a known gender, so ${name} was imported without one.`); }
    let rating: number | undefined;
    if (cols[2]) {
      const r = Number(cols[2]);
      if (Number.isFinite(r)) rating = r;
      else problems.push(`Line ${i + 1}: rating "${cols[2]}" is not a number and was ignored.`);
    }
    players.push({ id: newId('p'), name, gender: gender ?? 'unspecified', rating, active: true });
  });
  return { players, problems };
}

export function rosterToCsv(players: Player[]): string {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return ['name,gender,rating', ...players.map((p) => [esc(p.name), p.gender, p.rating ?? ''].join(','))].join('\n');
}

export const EXAMPLE_ROSTER = `name,gender,rating
Mike,male,4.0
John,male,3.5
David,male,3.0
Chris,male,4.5
Alex,male,3.5
Sam,male,2.5
Ben,male,3.0
Tom,male,4.0
Sarah,female,3.5
Lisa,female,3.0
Emma,female,4.0
Priya,female,3.5`;
