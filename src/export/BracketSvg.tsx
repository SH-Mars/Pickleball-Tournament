import type { Tournament } from '../domain/types';
import { buildViewModels, courtLabel, type MatchVM } from '../ui/matchView';
import { champion, playerMap, teamLabel } from '../domain/tournament';
import { getStrategy } from '../domain/pairing';

const W = 236;
const CARD_H = 88;
const ROW_H = 44;
const SLOT = 124;
const GAP_X = 60;
const PAD = 20;
const TOP = 46;
const CHAMP_W = 210;

export interface ExportHeader {
  showSeed: boolean;
}

const CSS = `
.bk{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
.bk-bg{fill:var(--bk-bg,#ffffff)}
.bk-round{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;fill:var(--muted,#5c6b64)}
.bk-card{fill:var(--surface,#ffffff);stroke:var(--line-strong,#c5cfc8);stroke-width:1}
.bk-hit{cursor:pointer;outline:none}
.bk-hit:hover .bk-card{stroke:var(--accent,#1f6f9c)}
.bk-hit:focus-visible .bk-card{stroke:var(--accent,#1f6f9c);stroke-width:2.5}
.bk-sep{stroke:var(--line,#e1e7e2);stroke-width:1}
.bk-name{font-size:12.5px;fill:var(--ink,#14201b)}
.bk-name-w{font-weight:700}
.bk-dim{fill:var(--muted,#5c6b64)}
.bk-ph{font-style:italic}
.bk-loser{opacity:.55}
.bk-score{font-size:15px;font-weight:700;fill:var(--ink,#14201b);text-anchor:end;font-variant-numeric:tabular-nums}
.bk-meta{font-size:11px;fill:var(--muted,#5c6b64)}
.bk-win{fill:var(--win-bg,#e6f3ec)}
.bk-winbar{fill:var(--good,#1b8a5a)}
.bk-line{fill:none;stroke:var(--line-strong,#c5cfc8);stroke-width:1.5}
.bk-champ{fill:var(--champ-bg,#f6f9d8);stroke:var(--champ,#b7c400);stroke-width:1.5}
.bk-title{font-size:22px;font-weight:800;fill:var(--ink,#14201b)}
.bk-sub{font-size:12.5px;fill:var(--muted,#5c6b64)}
`;

function trunc(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}

interface Pos { x: number; y: number }

export interface BracketSvgProps {
  tournament: Tournament;
  onSelect?: (matchId: string) => void;
  /** When set, draws a title block and background so the SVG can stand alone as an image. */
  header?: ExportHeader;
}

export function bracketSize(t: Tournament, header: boolean): { width: number; height: number } {
  const b = t.bracket;
  if (!b) return { width: 0, height: 0 };
  const rounds = b.rounds.length;
  const first = b.matches.filter((m) => m.roundId === b.rounds[0].id && m.kind === 'main').length;
  const hasThird = b.matches.some((m) => m.kind === 'third_place');
  const finalCenter = TOP + (SLOT * 2 ** (rounds - 1)) / 2;
  const mainH = TOP + first * SLOT;
  const thirdBottom = hasThird ? finalCenter + SLOT * 1.15 + CARD_H / 2 + 24 : 0;
  const extra = header ? 96 : 0;
  return {
    width: PAD * 2 + rounds * (W + GAP_X) + CHAMP_W,
    height: Math.max(mainH, thirdBottom) + PAD + extra,
  };
}

export function BracketSvg({ tournament: t, onSelect, header }: BracketSvgProps) {
  const b = t.bracket;
  if (!b) return null;
  const vms = buildViewModels(t);
  const { width, height } = bracketSize(t, !!header);
  const offY = header ? 96 : 0;
  const R = b.rounds.length;
  const roundIndex = new Map(b.rounds.map((r, i) => [r.id, i]));
  const pos = new Map<string, Pos>();
  const finalId = b.matches.find((m) => m.kind === 'main' && roundIndex.get(m.roundId) === R - 1)?.id;
  for (const m of b.matches) {
    const r = roundIndex.get(m.roundId) as number;
    const x = PAD + r * (W + GAP_X);
    if (m.kind === 'main') pos.set(m.id, { x, y: offY + TOP + (m.number - 0.5) * SLOT * 2 ** r });
  }
  const fp = pos.get(finalId as string) as Pos;
  const third = b.matches.find((m) => m.kind === 'third_place');
  if (third) pos.set(third.id, { x: fp.x, y: fp.y + SLOT * 1.15 });

  const champ = champion(t);
  const pm = playerMap(t);
  const strat = getStrategy(t.pairing.strategy).label;

  const connectors: string[] = [];
  for (const m of b.matches) {
    if (m.kind !== 'main') continue;
    const to = pos.get(m.id) as Pos;
    for (const s of [m.slotA, m.slotB]) {
      if (s.kind !== 'winner') continue;
      const from = pos.get(s.matchId);
      if (!from) continue;
      const x1 = from.x + W;
      const x2 = to.x;
      const xm = x1 + GAP_X / 2;
      connectors.push(`M${x1},${from.y} H${xm} V${to.y} H${x2}`);
    }
  }
  const finalPos = fp;
  connectors.push(`M${finalPos.x + W},${finalPos.y} H${finalPos.x + W + GAP_X}`);

  const card = (vm: MatchVM, p: Pos) => {
    const top = p.y - CARD_H / 2;
    const interactive = !!onSelect && vm.playable;
    const meta = [vm.label, courtLabel(vm.match), vm.status === 'in_progress' ? 'In progress' : ''].filter(Boolean).join(' · ');
    const clipId = `clip-${vm.match.id}`;
    const row = (side: 'A' | 'B', i: number) => {
      const names = side === 'A' ? vm.namesA : vm.namesB;
      const pending = vm.pending[side];
      const score = side === 'A' ? vm.scoreA : vm.scoreB;
      const isWin = vm.winner === side;
      const isLose = vm.winner !== null && !isWin;
      const y = top + i * ROW_H;
      const lines = pending || names.length > 2 ? [trunc(names.join(', '), 27)] : names.map((n) => trunc(n, 27));
      const cls = `bk-name${isWin ? ' bk-name-w' : ''}${pending ? ' bk-dim bk-ph' : ''}`;
      const lineY = lines.length === 1 ? y + ROW_H / 2 + 4.5 : undefined;
      return (
        <g key={side} className={isLose ? 'bk-loser' : undefined}>
          {isWin && <rect className="bk-win" x={p.x + 1} y={y + (i === 0 ? 1 : 0)} width={W - 2} height={ROW_H - (i === 0 ? 1 : 1)} />}
          {isWin && <rect className="bk-winbar" x={p.x + 1} y={y + (i === 0 ? 1 : 0)} width={4} height={ROW_H - 1} />}
          {lines.map((ln, li) => (
            <text key={li} className={cls} x={p.x + 14} y={lineY ?? y + 18 + li * 15}>{ln}</text>
          ))}
          {score !== null && <text className="bk-score" x={p.x + W - 12} y={y + ROW_H / 2 + 5.5}>{score}</text>}
        </g>
      );
    };
    const body = (
      <>
        <clipPath id={clipId}><rect x={p.x} y={top} width={W} height={CARD_H} rx={8} /></clipPath>
        <rect className="bk-card" x={p.x} y={top} width={W} height={CARD_H} rx={8} />
        <g clipPath={`url(#${clipId})`}>
          {row('A', 0)}
          <line className="bk-sep" x1={p.x} x2={p.x + W} y1={top + ROW_H} y2={top + ROW_H} />
          {row('B', 1)}
        </g>
        <text className="bk-meta" x={p.x + 2} y={top - 6}>{trunc(meta, 40)}</text>
        {vm.gameText && <text className="bk-meta" x={p.x + W} y={top - 6} textAnchor="end">{trunc(vm.gameText, 26)}</text>}
      </>
    );
    if (!interactive) return <g key={vm.match.id}>{body}</g>;
    const label = `${vm.label}: ${vm.namesA.join(' and ')} versus ${vm.namesB.join(' and ')}. ${vm.status.replace('_', ' ')}. Open to enter the score.`;
    return (
      <g
        key={vm.match.id}
        className="bk-hit"
        role="button"
        tabIndex={0}
        aria-label={label}
        onClick={() => onSelect?.(vm.match.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect?.(vm.match.id);
          }
        }}
      >
        {body}
      </g>
    );
  };

  const cx = PAD + R * (W + GAP_X);
  const champLabel = champ ? teamLabel(champ, pm, ' & ') : null;
  const subtitle = [t.date, t.teams.length + ' teams', header?.showSeed ? `${strat} pairing · seed ${t.pairing.seed}` : ''].filter(Boolean).join('  ·  ');

  return (
    <svg
      className="bk"
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role={header ? undefined : 'group'}
      aria-label={header ? undefined : 'Tournament bracket'}
    >
      <style>{CSS}</style>
      {header && <rect className="bk-bg" x={0} y={0} width={width} height={height} />}
      {header && (
        <>
          <text className="bk-title" x={PAD} y={44}>{t.name}</text>
          <text className="bk-sub" x={PAD} y={68}>{subtitle}</text>
        </>
      )}
      {b.rounds.map((r, i) => (
        <text key={r.id} className="bk-round" x={PAD + i * (W + GAP_X)} y={offY + 28}>{r.name}</text>
      ))}
      <text className="bk-round" x={cx} y={offY + 28}>Champion</text>
      {connectors.map((d, i) => <path key={i} className="bk-line" d={d} />)}
      {b.matches.map((m) => card(vms.get(m.id) as MatchVM, pos.get(m.id) as Pos))}
      <g>
        <rect className={champLabel ? 'bk-champ' : 'bk-card'} x={cx} y={finalPos.y - 36} width={CHAMP_W} height={72} rx={10} />
        {champ ? (
          <>
            <text className="bk-meta" x={cx + 14} y={finalPos.y - 14}>CHAMPIONS</text>
            {champ.playerIds.slice(0, 2).map((id, i) => (
              <text key={id} className="bk-name bk-name-w" style={{ fontSize: 15 }} x={cx + 14} y={finalPos.y + 6 + i * 18}>{trunc(pm.get(id)?.name ?? '', 22)}</text>
            ))}
          </>
        ) : (
          <text className="bk-name bk-dim bk-ph" x={cx + 14} y={finalPos.y + 5}>To be decided</text>
        )}
      </g>
    </svg>
  );
}
