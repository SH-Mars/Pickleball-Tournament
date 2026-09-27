import type { Tournament } from '../domain/types';
import { buildGroupViews, buildViewModels, type GroupView, type MatchVM } from '../ui/matchView';

export const W = 236;
export const CARD_H = 88;
export const SLOT = 124;
export const GAP_X = 60;
export const PAD = 20;
const ROUND_ROW = 46;
const SECTION_ROW = 34;
export const CHAMP_W = 210;
export const GROUP_W = 340;

export interface Pos { x: number; y: number }
export interface ColumnTitle { x: number; y: number; text: string }

export interface GroupBlock { x: number; y: number; w: number; h: number; view: GroupView; showResults: boolean }

export interface Layout {
  width: number;
  height: number;
  cards: Map<string, { vm: MatchVM; pos: Pos }>;
  connectors: string[];
  roundTitles: ColumnTitle[];
  sectionTitles: ColumnTitle[];
  champion: (Pos & { titleY: number }) | null;
  groups: GroupBlock[];
  headerHeight: number;
}

const groupHeight = (v: GroupView, showResults: boolean) => 30 + 20 + v.rows.length * 20 + (showResults ? 14 + v.matches.length * 16 : 0) + 22;

/**
 * Pure geometry for the whole bracket. Elimination rounds are drawn in
 * sections stacked vertically; pools are drawn as standings blocks above them
 * when `withGroups` is set (used for exported images).
 */
export function layoutBracket(t: Tournament, withGroups: boolean, withHeader: boolean): Layout {
  const b = t.bracket;
  const empty: Layout = { width: 0, height: 0, cards: new Map(), connectors: [], roundTitles: [], sectionTitles: [], champion: null, groups: [], headerHeight: 0 };
  if (!b) return empty;
  const vms = buildViewModels(t);
  const headerHeight = withHeader ? 96 : 0;

  const elim = b.rounds.filter((r) => r.kind === 'elimination').sort((a, c) => a.order - c.order);
  const sectionNames: string[] = [];
  elim.forEach((r) => { if (!sectionNames.includes(r.section)) sectionNames.push(r.section); });
  const multi = sectionNames.length > 1;

  // Visible columns per section.
  const visibleIn = (roundId: string) => b.matches.filter((m) => m.roundId === roundId && !vms.get(m.id)?.skipped);
  const sections = sectionNames.map((name) => ({
    name,
    columns: elim.filter((r) => r.section === name && visibleIn(r.id).length > 0),
  }));
  const maxCols = Math.max(0, ...sections.map((s) => s.columns.length));
  const elimWidth = PAD * 2 + maxCols * (W + GAP_X) + CHAMP_W;

  // Group blocks (export only).
  const groupViews = withGroups ? buildGroupViews(t) : [];
  const targetWidth = Math.max(elimWidth, groupViews.length ? Math.min(groupViews.length, 3) * (GROUP_W + 20) + PAD * 2 : 0);
  const groups: GroupBlock[] = [];
  let groupsBottom = headerHeight;
  if (groupViews.length) {
    const perRow = Math.max(1, Math.floor((targetWidth - PAD * 2 + 20) / (GROUP_W + 20)));
    const show = (v: GroupView) => v.matches.length <= 30;
    let y = headerHeight + 6;
    for (let i = 0; i < groupViews.length; i += perRow) {
      const row = groupViews.slice(i, i + perRow);
      const h = Math.max(...row.map((v) => groupHeight(v, show(v))));
      row.forEach((v, j) => groups.push({ x: PAD + j * (GROUP_W + 20), y, w: GROUP_W, h, view: v, showResults: show(v) }));
      y += h + 8;
    }
    groupsBottom = y;
  }

  const cards = new Map<string, { vm: MatchVM; pos: Pos }>();
  const connectors: string[] = [];
  const roundTitles: ColumnTitle[] = [];
  const sectionTitles: ColumnTitle[] = [];
  let top = groupsBottom;
  let lastMain: { id: string; pos: Pos; cols: number; titleY: number } | null = null;

  for (const sec of sections) {
    if (!sec.columns.length) continue;
    const base = top + (multi ? SECTION_ROW : 0);
    if (multi) sectionTitles.push({ x: PAD, y: top + 22, text: sec.name });
    const rel = new Map<string, number>(); // matchId -> y relative to base + ROUND_ROW
    const colX = (ci: number) => PAD + ci * (W + GAP_X);
    let maxY = 0;
    sec.columns.forEach((round, ci) => {
      roundTitles.push({ x: colX(ci), y: base + 28, text: round.name });
      const mains = visibleIn(round.id).filter((m) => m.kind === 'main').sort((a, c) => a.number - c.number);
      const ys: number[] = mains.map((m, idx) => {
        const feeders = [m.slotA, m.slotB]
          .map((s) => (s.kind === 'winner' && rel.has(s.matchId) ? (rel.get(s.matchId) as number) : null))
          .filter((v): v is number => v !== null);
        return feeders.length ? feeders.reduce((a, c) => a + c, 0) / feeders.length : (idx + 0.5) * SLOT;
      });
      for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + SLOT); // never overlap
      mains.forEach((m, i) => {
        rel.set(m.id, ys[i]);
        maxY = Math.max(maxY, ys[i] + CARD_H / 2);
        const pos = { x: colX(ci), y: base + ROUND_ROW + ys[i] };
        cards.set(m.id, { vm: vms.get(m.id) as MatchVM, pos });
        lastMain = { id: m.id, pos, cols: sec.columns.length, titleY: base + 28 };
        for (const s of [m.slotA, m.slotB]) {
          if (s.kind !== 'winner') continue;
          const from = cards.get(s.matchId);
          if (!from || !rel.has(s.matchId) || !sec.columns.some((c) => c.id === b.matches.find((x) => x.id === s.matchId)?.roundId)) continue;
          const x1 = from.pos.x + W;
          const xm = x1 + GAP_X / 2;
          connectors.push(`M${x1},${from.pos.y} H${xm} V${pos.y} H${pos.x}`);
        }
      });
      // A third-place match sits under the main match of the same round.
      visibleIn(round.id).filter((m) => m.kind === 'third_place').forEach((m) => {
        const main = mains[0];
        const y = (main ? (rel.get(main.id) as number) : 0) + SLOT * 1.15;
        rel.set(m.id, y);
        maxY = Math.max(maxY, y + CARD_H / 2);
        cards.set(m.id, { vm: vms.get(m.id) as MatchVM, pos: { x: colX(ci), y: base + ROUND_ROW + y } });
      });
    });
    top = base + ROUND_ROW + maxY + 26;
  }

  // The champion box follows the last drawn main match (the final, or the grand final).
  const last = lastMain as { id: string; pos: Pos; cols: number; titleY: number } | null;
  const champion = last ? { x: PAD + last.cols * (W + GAP_X), y: last.pos.y, titleY: last.titleY } : null;
  if (last) {
    connectors.push(`M${last.pos.x + W},${last.pos.y} H${last.pos.x + W + GAP_X}`);
  }
  const width = Math.max(elimWidth, targetWidth);
  const height = Math.max(top, groupsBottom) + PAD;
  return { width, height, cards, connectors, roundTitles, sectionTitles, champion, groups, headerHeight };
}
