import type { MatchVM } from './matchView';
import { courtLabel, STATUS_LABEL } from './matchView';

export function MatchCard({ vm, onOpen, children }: { vm: MatchVM; onOpen?: () => void; children?: React.ReactNode }) {
  const rows: ('A' | 'B')[] = ['A', 'B'];
  return (
    <div className={`match-card status-${vm.status}`}>
      <div className="match-top">
        <span className="match-label">{vm.label}</span>
        <span className="match-meta">
          {courtLabel(vm.match) && <span className="pill">{courtLabel(vm.match)}</span>}
          <span className={`pill st-${vm.status}`}>{STATUS_LABEL[vm.status]}</span>
        </span>
      </div>
      {rows.map((side) => {
        const names = side === 'A' ? vm.namesA : vm.namesB;
        const score = side === 'A' ? vm.scoreA : vm.scoreB;
        const pending = vm.pending[side];
        const won = vm.winner === side;
        return (
          <div key={side} className={`match-row${won ? ' won' : ''}${vm.winner && !won ? ' lost' : ''}`}>
            <div className={`match-names${pending ? ' pending' : ''}`}>
              {names.map((n, i) => <span key={i}>{n}</span>)}
            </div>
            <span className="match-score" aria-label={score === null ? undefined : `Score ${score}`}>{score ?? ''}</span>
            {won && <span className="win-mark" aria-label="Winner">✓</span>}
          </div>
        );
      })}
      {vm.gameText && <div className="game-text">{vm.gameText}</div>}
      <div className="match-actions">
        {onOpen && vm.playable && (
          <button className={`btn small${vm.status === 'complete' ? '' : ' primary'}`} onClick={onOpen}>
            {vm.status === 'complete' ? 'Edit result' : vm.status === 'in_progress' ? 'Enter score' : 'Enter score'}
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
