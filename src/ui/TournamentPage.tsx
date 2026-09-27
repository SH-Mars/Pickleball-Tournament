import { getFormat, listFormats, SEEDING_LABELS } from '../domain/bracket';
import type { FormatId, SeedingMethod } from '../domain/types';
import { useApp } from '../state/store';
import { Callout, Field } from './kit';

export function TournamentPage() {
  const { t, update, setView } = useApp();
  const live = t.status === 'live';
  const s = t.settings;
  const fmt = getFormat(t.formatId);
  const setSettings = (patch: Partial<typeof s>) => update((x) => ({ ...x, settings: { ...x.settings, ...patch } }));
  const setScoring = (patch: Partial<typeof s.scoring>) => update((x) => ({ ...x, settings: { ...x.settings, scoring: { ...x.settings.scoring, ...patch } } }));
  const clampInt = (v: string, lo: number, hi: number, fallback: number) => {
    const n = Math.trunc(Number(v));
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
  };

  return (
    <div className="page narrow">
      <header className="page-head">
        <h1>Tournament details</h1>
        <p className="lede">Name it, choose a format, and set how matches are scored. Everything here can be changed until you start play.</p>
      </header>
      {live && <Callout kind="info" title="This tournament is running">Only the name, date and court count can change now. Go to Settings to reset it.</Callout>}

      <section className="card stack">
        <div className="grid2">
          <Field label="Tournament name" htmlFor="t-name">
            <input id="t-name" value={t.name} maxLength={80} onChange={(e) => update((x) => ({ ...x, name: e.target.value }))} />
          </Field>
          <Field label="Date" htmlFor="t-date">
            <input id="t-date" type="date" value={t.date} onChange={(e) => update((x) => ({ ...x, date: e.target.value }))} />
          </Field>
        </div>
        <fieldset className="stack-sm" disabled={live}>
          <legend>Format</legend>
          <div className="choice-grid">
            {listFormats().map((f) => (
              <label key={f.id} className={`choice${t.formatId === f.id ? ' on' : ''}${f.available ? '' : ' off'}`}>
                <input type="radio" name="format" checked={t.formatId === f.id} disabled={!f.available || live} onChange={() => update((x) => ({ ...x, formatId: f.id as FormatId }))} />
                <span className="choice-title">{f.label}{!f.available && <em className="soon">Coming soon</em>}</span>
                <span className="choice-desc">{f.description}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="card stack">
        <h2>Play</h2>
        <div className="grid3">
          <Field label="Players per team" htmlFor="t-size" hint="2 for doubles, 1 for singles.">
            <select id="t-size" disabled={live} value={t.pairing.teamSize} onChange={(e) => update((x) => ({ ...x, pairing: { ...x.pairing, teamSize: Number(e.target.value) } }))}>
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          <Field label="Courts" htmlFor="t-courts">
            <input id="t-courts" type="number" min={1} max={24} value={s.courts} onChange={(e) => setSettings({ courts: clampInt(e.target.value, 1, 24, 1) })} />
          </Field>
          <Field label="Games per match" htmlFor="t-games">
            <select id="t-games" disabled={live} value={s.scoring.gamesPerMatch} onChange={(e) => setScoring({ gamesPerMatch: Number(e.target.value) as 1 | 3 | 5 })}>
              <option value={1}>1 game</option>
              <option value={3}>Best of 3</option>
              <option value={5}>Best of 5</option>
            </select>
          </Field>
          <Field label="Points to win a game" htmlFor="t-points">
            <input id="t-points" type="number" min={1} max={99} disabled={live} value={s.scoring.pointsToWin} onChange={(e) => setScoring({ pointsToWin: clampInt(e.target.value, 1, 99, 11) })} />
          </Field>
          <div className="field">
            <span className="label-like">Win by 2</span>
            <label className="switch"><input type="checkbox" disabled={live} checked={s.scoring.winBy2} onChange={(e) => setScoring({ winBy2: e.target.checked })} /><span>Required</span></label>
          </div>
        </div>
        {fmt.usesPools && (
          <div className="grid3">
            <Field label="Number of pools" htmlFor="t-pools" hint="Teams are split into pools with a snake draw by seed.">
              <input id="t-pools" type="number" min={2} max={8} disabled={live} value={s.pools} onChange={(e) => setSettings({ pools: clampInt(e.target.value, 2, 8, 2) })} />
            </Field>
            <Field label="Teams advancing from each pool" htmlFor="t-adv" hint="They play a single-elimination playoff.">
              <input id="t-adv" type="number" min={1} max={8} disabled={live} value={s.advancePerPool} onChange={(e) => setSettings({ advancePerPool: clampInt(e.target.value, 1, 8, 2) })} />
            </Field>
          </div>
        )}
        <details className="advanced">
          <summary>Advanced settings</summary>
          <div className="stack">
            <label className="switch"><input type="checkbox" disabled={live || !fmt.usesThirdPlace} checked={s.thirdPlaceMatch && fmt.usesThirdPlace} onChange={(e) => setSettings({ thirdPlaceMatch: e.target.checked })} /><span>Play a third-place match{!fmt.usesThirdPlace && <em className="soon">Not used by {fmt.label}</em>}</span></label>
            <Field label="Bracket seeding" htmlFor="t-seed-method" hint={fmt.usesPools ? 'Decides which teams share a pool.' : 'Top seeds get byes when the number of teams is not a power of two.'}>
              <select id="t-seed-method" disabled={live} value={s.seeding} onChange={(e) => setSettings({ seeding: e.target.value as SeedingMethod })}>
                {(Object.keys(SEEDING_LABELS) as SeedingMethod[]).map((k) => <option key={k} value={k}>{SEEDING_LABELS[k]}</option>)}
              </select>
            </Field>
            <label className="switch"><input type="checkbox" disabled checked={false} readOnly /><span>Consolation bracket <em className="soon">Coming soon</em></span></label>
          </div>
        </details>
      </section>

      {!live && (
        <div className="step-actions">
          <span />
          <button className="btn primary" onClick={() => setView('players')}>Next: Players</button>
        </div>
      )}
    </div>
  );
}
