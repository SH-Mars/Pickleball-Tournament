import type { Tournament } from '../domain/types';
import { courtLabel, type MatchVM } from '../ui/matchView';
import { CARD_H, CHAMP_W, GROUP_W, PAD, W, layoutBracket, type Pos } from './layout';
import { champion, playerMap } from '../domain/tournament';
import { getStrategy } from '../domain/pairing';

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
.bk-section{font-size:15px;font-weight:800;fill:var(--ink,#14201b)}
.bk-small{font-size:12.5px;font-weight:600}
`;

function trunc(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}

const ROW_H = 44;

export interface BracketSvgProps {
  tournament: Tournament;
  onSelect?: (matchId: string) => void;
  /** When set, draws a title block, pool standings and a background so the SVG can stand alone as an image. */
  header?: ExportHeader;
}

export function bracketSize(t: Tournament, header: boolean): { width: number; height: number } {
  const l = layoutBracket(t, header, header);
  return { width: l.width, height: l.height };
}

const teamText = (names: string[]) => names.join(' & ');

export function BracketSvg({ tournament: t, onSelect, header }: BracketSvgProps) {
  const b = t.bracket;
  if (!b) return null;
  const L = layoutBracket(t, !!header, !!header);
  const champ = champion(t);
  const pm = playerMap(t);
  const strat = getStrategy(t.pairing.strategy).label;
  const advance = t.formatId === 'pool_play' ? t.settings.advancePerPool : 0;

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
          {isWin && <rect className="bk-win" x={p.x + 1} y={y + (i === 0 ? 1 : 0)} width={W - 2} height={ROW_H - 1} />}
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

  const champLabel = champ ? teamText(champ.playerIds.map((id) => pm.get(id)?.name ?? '')) : null;
  const subtitle = [t.date, `${t.teams.length} teams`, header?.showSeed ? `${strat} pairing · seed ${t.pairing.seed}` : ''].filter(Boolean).join('  ·  ');
  const noElim = L.cards.size === 0;

  return (
    <svg
      className="bk"
      xmlns="http://www.w3.org/2000/svg"
      width={L.width}
      height={L.height}
      viewBox={`0 0 ${L.width} ${L.height}`}
      role={header ? undefined : 'group'}
      aria-label={header ? undefined : 'Tournament bracket'}
    >
      <style>{CSS}</style>
      {header && <rect className="bk-bg" x={0} y={0} width={L.width} height={L.height} />}
      {header && (
        <>
          <text className="bk-title" x={PAD} y={44}>{t.name}</text>
          <text className="bk-sub" x={PAD} y={68}>{subtitle}</text>
          {noElim && champLabel && <text className="bk-sub bk-name-w" x={L.width - PAD} y={44} textAnchor="end">Champions: {trunc(champLabel, 40)}</text>}
        </>
      )}
      {L.groups.map((g) => (
        <g key={g.view.id}>
          <rect className="bk-card" x={g.x} y={g.y} width={g.w} height={g.h - 8} rx={8} />
          <text className="bk-round" x={g.x + 12} y={g.y + 22}>{g.view.name}</text>
          <text className="bk-meta" x={g.x + g.w - 12} y={g.y + 22} textAnchor="end">{g.view.complete ? 'Final standings' : 'Standings so far'}</text>
          <text className="bk-meta" x={g.x + 12} y={g.y + 42}>#  Team</text>
          <text className="bk-meta" x={g.x + g.w - 62} y={g.y + 42} textAnchor="end">W-L</text>
          <text className="bk-meta" x={g.x + g.w - 12} y={g.y + 42} textAnchor="end">+/-</text>
          {g.view.rows.map((r, i) => {
            const y = g.y + 60 + i * 20;
            const adv = advance > 0 && r.row.rank <= advance;
            return (
              <g key={r.row.teamId}>
                {adv && <rect className="bk-win" x={g.x + 1} y={y - 14} width={g.w - 2} height={19} />}
                <text className="bk-name" x={g.x + 12} y={y}>{r.row.rank}</text>
                <text className={`bk-name${i === 0 ? ' bk-name-w' : ''}`} x={g.x + 32} y={y}>{trunc(teamText(r.names), 30)}</text>
                <text className="bk-score bk-small" x={g.x + g.w - 62} y={y}>{r.row.wins}-{r.row.losses}</text>
                <text className="bk-score bk-small" x={g.x + g.w - 12} y={y}>{r.row.diff > 0 ? '+' : ''}{r.row.diff}</text>
              </g>
            );
          })}
          {g.showResults && g.view.matches.filter((m) => m.status === 'complete').map((m, i) => {
            const y = g.y + 60 + g.view.rows.length * 20 + 18 + i * 16;
            const a = trunc(m.namesA.join(' & '), 22);
            const c = trunc(m.namesB.join(' & '), 22);
            return <text key={m.match.id} className="bk-meta" x={g.x + 12} y={y}>{a} {m.scoreA}–{m.scoreB} {c}</text>;
          })}
        </g>
      ))}
      {L.sectionTitles.map((s) => <text key={s.text} className="bk-section" x={s.x} y={s.y}>{s.text}</text>)}
      {L.roundTitles.map((r, i) => <text key={i} className="bk-round" x={r.x} y={r.y}>{r.text}</text>)}
      {L.connectors.map((d, i) => <path key={i} className="bk-line" d={d} />)}
      {[...L.cards.values()].map(({ vm, pos }) => card(vm, pos))}
      {L.champion && (
        <g>
          <text className="bk-round" x={L.champion.x} y={L.champion.titleY}>Champion</text>
          <rect className={champLabel ? 'bk-champ' : 'bk-card'} x={L.champion.x} y={L.champion.y - 36} width={CHAMP_W} height={72} rx={10} />
          {champ ? (
            <>
              <text className="bk-meta" x={L.champion.x + 14} y={L.champion.y - 14}>CHAMPIONS</text>
              {champ.playerIds.slice(0, 2).map((id, i) => (
                <text key={id} className="bk-name bk-name-w" style={{ fontSize: 15 }} x={L.champion!.x + 14} y={L.champion!.y + 6 + i * 18}>{trunc(pm.get(id)?.name ?? '', 22)}</text>
              ))}
            </>
          ) : (
            <text className="bk-name bk-dim bk-ph" x={L.champion.x + 14} y={L.champion.y + 5}>To be decided</text>
          )}
        </g>
      )}
    </svg>
  );
}

export { GROUP_W };
