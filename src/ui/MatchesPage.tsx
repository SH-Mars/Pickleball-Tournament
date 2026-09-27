import { useMemo, useState } from 'react';
import { useApp } from '../state/store';
import { autoAssignCourts } from '../domain/tournament';
import { buildViewModels, type MatchVM } from './matchView';
import { Callout, Empty } from './kit';
import { MatchCard } from './MatchCard';
import { ScoreModal } from './ScoreModal';

export function MatchesPage() {
  const { t, update, toast } = useApp();
  const [openId, setOpenId] = useState<string | null>(null);
  const vms = useMemo(() => buildViewModels(t), [t]);
  const b = t.bracket;
  if (!b) return <div className="page narrow"><Empty title="No matches yet">Start the tournament to see matches here.</Empty></div>;

  const all = b.matches.map((m) => vms.get(m.id) as MatchVM).filter((v) => v.status !== 'bye');
  const roundOrder = new Map(b.rounds.map((r) => [r.id, r.order]));
  const sorted = all.slice().sort((x, y) => (roundOrder.get(x.match.roundId) as number) - (roundOrder.get(y.match.roundId) as number) || x.match.number - y.match.number);
  const playing = sorted.filter((v) => v.status === 'in_progress');
  const ready = sorted.filter((v) => v.playable && v.status === 'not_started');
  const waiting = sorted.filter((v) => v.status === 'waiting');
  const done = sorted.filter((v) => v.status === 'complete');
  const courts = Array.from({ length: t.settings.courts }, (_, i) => i + 1);
  const onCourt = (c: number) => sorted.find((v) => v.match.court === c && v.status !== 'complete' && v.playable);

  const patchMatch = (id: string, p: Partial<MatchVM['match']>) =>
    update((x) => (x.bracket ? { ...x, bracket: { ...x.bracket, matches: x.bracket.matches.map((m) => (m.id === id ? { ...m, ...p } : m)) } } : x));

  const startMatch = (vm: MatchVM) => {
    const court = vm.match.court ?? courts.find((c) => !onCourt(c));
    patchMatch(vm.match.id, { status: 'in_progress', court, startedAt: new Date().toISOString() });
  };

  const courtSelect = (vm: MatchVM) => (
    <label className="court-select">
      <span className="sr-only">Court for {vm.label}</span>
      <select value={vm.match.court ?? ''} onChange={(e) => patchMatch(vm.match.id, { court: e.target.value ? Number(e.target.value) : undefined })}>
        <option value="">No court</option>
        {courts.map((c) => <option key={c} value={c}>Court {c}</option>)}
      </select>
    </label>
  );

  return (
    <div className="page wide">
      <header className="page-head">
        <h1>Matches</h1>
        <p className="lede">Run the courts. Matches appear here as soon as both teams are known.</p>
      </header>

      <section aria-labelledby="courts-h" className="stack">
        <div className="row between wrap">
          <h2 id="courts-h">Courts</h2>
          <button className="btn" disabled={ready.length === 0} onClick={() => {
            const next = autoAssignCourts(t);
            const n = (next.bracket?.matches.filter((m, i) => m.court !== t.bracket?.matches[i].court).length) ?? 0;
            update(() => next);
            toast(n ? `Assigned ${n} match${n === 1 ? '' : 'es'} to free courts.` : 'No free courts or no matches waiting.', 'info');
          }}>Assign ready matches to free courts</button>
        </div>
        <div className="court-grid">
          {courts.map((c) => {
            const vm = onCourt(c);
            return (
              <div key={c} className={`court${vm ? '' : ' free'}`}>
                <div className="court-name">Court {c}</div>
                {vm ? (
                  <>
                    <div className="court-match">{vm.label}</div>
                    <div className="court-teams">{vm.namesA.join(' & ')}<span className="vs">vs</span>{vm.namesB.join(' & ')}</div>
                    <div className="row">
                      {vm.status === 'not_started' ? <button className="btn small primary" onClick={() => startMatch(vm)}>Start match</button> : <span className="pill st-in_progress">In progress</span>}
                      <button className="btn small" onClick={() => setOpenId(vm.match.id)}>Enter score</button>
                    </div>
                  </>
                ) : <div className="muted">Free</div>}
              </div>
            );
          })}
        </div>
      </section>

      {playing.length + ready.length === 0 && done.length < sorted.length && <Callout kind="info">Waiting for earlier matches to finish before the next ones can start.</Callout>}

      <Group title="Up next" items={ready} render={(vm) => (
        <MatchCard key={vm.match.id} vm={vm} onOpen={() => setOpenId(vm.match.id)}>
          {courtSelect(vm)}
          <button className="btn small" onClick={() => startMatch(vm)}>Start</button>
        </MatchCard>
      )} empty="No matches are ready." />
      <Group title="In progress" items={playing} render={(vm) => (
        <MatchCard key={vm.match.id} vm={vm} onOpen={() => setOpenId(vm.match.id)}>{courtSelect(vm)}</MatchCard>
      )} />
      <Group title="Waiting for earlier results" items={waiting} render={(vm) => <MatchCard key={vm.match.id} vm={vm} />} />
      <Group title="Completed" items={done} render={(vm) => <MatchCard key={vm.match.id} vm={vm} onOpen={() => setOpenId(vm.match.id)} />} />
      {openId && <ScoreModal matchId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function Group({ title, items, render, empty }: { title: string; items: MatchVM[]; render: (v: MatchVM) => React.ReactNode; empty?: string }) {
  if (!items.length && !empty) return null;
  return (
    <section className="stack">
      <h2>{title} <span className="count">{items.length}</span></h2>
      {items.length ? <div className="match-list">{items.map(render)}</div> : <p className="muted">{empty}</p>}
    </section>
  );
}
