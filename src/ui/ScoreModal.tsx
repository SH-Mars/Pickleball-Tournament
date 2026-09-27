import { useMemo, useState } from 'react';
import type { Game } from '../domain/types';
import { clearResult, gamesToWin, setResult, validateResult } from '../domain/bracket';
import { useApp } from '../state/store';
import { buildViewModels } from './matchView';
import { Modal } from './kit';

export function ScoreModal({ matchId, onClose }: { matchId: string; onClose: () => void }) {
  const { t, update, confirm, toast } = useApp();
  const vms = useMemo(() => buildViewModels(t), [t]);
  const vm = vms.get(matchId);
  const scoring = t.settings.scoring;
  const slots = scoring.gamesPerMatch;
  const existing = vm?.match.games ?? [];
  const [vals, setVals] = useState<{ a: string; b: string }[]>(() =>
    Array.from({ length: slots }, (_, i) => ({ a: existing[i] ? String(existing[i].a) : '', b: existing[i] ? String(existing[i].b) : '' })),
  );
  const [error, setError] = useState('');
  if (!t.bracket || !vm) return null;
  const wasComplete = vm.match.status === 'complete';

  const games = (): Game[] => {
    const out: Game[] = [];
    for (const v of vals) {
      if (v.a === '' && v.b === '') continue;
      out.push({ a: v.a === '' ? NaN : Number(v.a), b: v.b === '' ? NaN : Number(v.b) });
    }
    return out;
  };


  const apply = async (confirmWinner: boolean) => {
    const g = games();
    if (g.some((x) => Number.isNaN(x.a) || Number.isNaN(x.b))) { setError('Fill in both scores for each game you enter.'); return; }
    const bracket = t.bracket as NonNullable<typeof t.bracket>;
    const out = setResult(bracket, scoring, matchId, g, { confirm: confirmWinner });
    if (!out.ok) { setError(out.error); return; }
    const changedResult = JSON.stringify(existing) !== JSON.stringify(g) || (wasComplete && !confirmWinner);
    const cleared = out.cleared.map((id) => vms.get(id)?.label ?? id);
    if (wasComplete && changedResult || cleared.length) {
      const ok = await confirm({
        title: wasComplete ? 'Change a completed result?' : 'This resets later matches',
        body: (
          <>
            {wasComplete && <p>{vm.label} is already complete. Saving replaces the recorded score.</p>}
            {cleared.length > 0 && <p>The winner changes, so results already entered for <strong>{cleared.join(', ')}</strong> will be cleared.</p>}
          </>
        ),
        confirmLabel: cleared.length ? 'Change result and reset' : 'Replace result',
        danger: true,
      });
      if (!ok) return;
    }
    update((x) => ({ ...x, bracket: out.bracket }));
    toast(confirmWinner ? 'Result saved. The winner has advanced.' : 'Score saved.', 'success');
    onClose();
  };

  const clear = async () => {
    const bracket = t.bracket as NonNullable<typeof t.bracket>;
    const out = clearResult(bracket, scoring, matchId);
    if (!out.ok) { setError(out.error); return; }
    const cleared = out.cleared.map((id) => vms.get(id)?.label ?? id);
    const ok = await confirm({
      title: 'Undo this result?',
      body: cleared.length ? <p>Later results that depend on it will be cleared too: <strong>{cleared.join(', ')}</strong>.</p> : <p>The score for {vm.label} will be removed.</p>,
      confirmLabel: 'Undo result',
      danger: true,
    });
    if (!ok) return;
    update((x) => ({ ...x, bracket: out.bracket }));
    toast('Result removed.', 'info');
    onClose();
  };

  const live = validateResult(games().filter((g) => !Number.isNaN(g.a) && !Number.isNaN(g.b)), scoring);
  const need = gamesToWin(slots);
  const set = (i: number, side: 'a' | 'b', v: string) => {
    setError('');
    setVals((cur) => cur.map((x, j) => (j === i ? { ...x, [side]: v.replace(/[^0-9]/g, '').slice(0, 3) } : x)));
  };
  const teamHead = (side: 'A' | 'B') => (side === 'A' ? vm.namesA : vm.namesB).join(' & ');

  return (
    <Modal
      title={vm.label}
      onClose={onClose}
      footer={
        <>
          {(existing.length > 0 || wasComplete) && <button className="btn ghost danger-text left" onClick={() => void clear()}>Undo result</button>}
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={() => void apply(false)} disabled={games().length === 0}>Save progress</button>
          <button className="btn primary" onClick={() => void apply(true)}>Confirm winner</button>
        </>
      }
    >
      <p className="muted">{scoring.gamesPerMatch === 1 ? `One game to ${scoring.pointsToWin}${scoring.winBy2 ? ', win by 2' : ''}.` : `Best of ${slots}: first to ${need} games. Each game to ${scoring.pointsToWin}${scoring.winBy2 ? ', win by 2' : ''}.`}</p>
      <div className="score-grid" role="group" aria-label="Scores">
        <div />
        <div className="score-team"><span className="tlabel">Team A</span>{teamHead('A')}</div>
        <div className="score-team"><span className="tlabel">Team B</span>{teamHead('B')}</div>
        {vals.map((v, i) => (
          <div className="score-line" key={i}>
            <span className="game-no">{slots > 1 ? `Game ${i + 1}` : 'Score'}</span>
            <input aria-label={`${slots > 1 ? `Game ${i + 1}, ` : ''}score for ${teamHead('A')}`} inputMode="numeric" value={v.a} onChange={(e) => set(i, 'a', e.target.value)} data-autofocus={i === 0 ? '' : undefined} />
            <input aria-label={`${slots > 1 ? `Game ${i + 1}, ` : ''}score for ${teamHead('B')}`} inputMode="numeric" value={v.b} onChange={(e) => set(i, 'b', e.target.value)} />
          </div>
        ))}
      </div>
      {error ? <p className="error-text" role="alert">{error}</p> : games().length > 0 && live ? <p className="hint">{live}</p> : null}
    </Modal>
  );
}
