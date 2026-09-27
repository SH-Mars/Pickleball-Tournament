import { useApp } from '../state/store';
import { hasResults, unlockTournament } from '../domain/tournament';
import { getStrategy } from '../domain/pairing';
import { getFormat } from '../domain/bracket';
import { Callout, Field } from './kit';

export function SettingsPage() {
  const { t, update, confirm, setView, toast, newTournament } = useApp();
  const live = t.status === 'live';
  const s = t.settings;
  return (
    <div className="page narrow">
      <header className="page-head">
        <h1>Settings</h1>
        <p className="lede">Details you can still change during play, and a record of how this tournament was set up.</p>
      </header>
      <section className="card stack">
        <div className="grid3">
          <Field label="Tournament name" htmlFor="s-name"><input id="s-name" value={t.name} maxLength={80} onChange={(e) => update((x) => ({ ...x, name: e.target.value }))} /></Field>
          <Field label="Date" htmlFor="s-date"><input id="s-date" type="date" value={t.date} onChange={(e) => update((x) => ({ ...x, date: e.target.value }))} /></Field>
          <Field label="Courts" htmlFor="s-courts"><input id="s-courts" type="number" min={1} max={24} value={s.courts} onChange={(e) => update((x) => ({ ...x, settings: { ...x.settings, courts: Math.min(24, Math.max(1, Math.trunc(Number(e.target.value)) || 1)) } }))} /></Field>
        </div>
      </section>
      <section className="card">
        <h2>Record</h2>
        <dl className="record">
          <dt>Format</dt><dd>{getFormat(t.formatId).label}</dd>
          <dt>Scoring</dt><dd>{s.scoring.gamesPerMatch === 1 ? '1 game' : `Best of ${s.scoring.gamesPerMatch}`} to {s.scoring.pointsToWin}{s.scoring.winBy2 ? ', win by 2' : ''}</dd>
          <dt>Pairing</dt><dd>{getStrategy(t.pairing.strategy).label}, teams of {t.pairing.teamSize}</dd>
          <dt>Seed</dt><dd>{t.generation?.seed ?? t.pairing.seed} (algorithm v{t.generation?.algorithmVersion ?? 1})</dd>
          <dt>Players</dt><dd>{t.players.filter((p) => p.active).length} active, {t.teams.length} teams</dd>
        </dl>
        <p className="hint">The teams themselves are saved in the tournament file, so this record stays valid even if the pairing algorithm changes later.</p>
      </section>
      <section className="card stack">
        <h2>Start over</h2>
        {live && (
          <>
            <p>Return to setup to change players, teams or rules.</p>
            <div><button className="btn danger" onClick={async () => {
              const results = hasResults(t);
              const ok = await confirm({
                title: 'Return to setup?',
                body: results ? <p>Every score entered so far will be <strong>deleted</strong>. Save the tournament file first if you want to keep them.</p> : <p>The bracket will be removed. You can build it again from the same teams.</p>,
                confirmLabel: results ? 'Delete results and unlock' : 'Unlock',
                danger: true,
              });
              if (!ok) return;
              update(unlockTournament);
              setView('teams');
              toast('Tournament unlocked.', 'info');
            }}>Unlock tournament</button></div>
          </>
        )}
        {!live && <Callout kind="info">The tournament has not started yet, so all setup pages are editable.</Callout>}
        <div><button className="btn danger" onClick={async () => {
          const ok = await confirm({ title: 'Start a new tournament?', body: 'This clears the current tournament from this browser. Save it as a file first if you need it later.', confirmLabel: 'Start new', danger: true });
          if (ok) newTournament();
        }}>Start a new tournament</button></div>
      </section>
    </div>
  );
}
