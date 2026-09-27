import { useState } from 'react';
import type { ComboKey, StrategyId } from '../domain/types';
import { COMBO_LABELS, listStrategies, MAIN_COMBOS, OTHER_COMBOS } from '../domain/pairing';
import { useApp } from '../state/store';
import { Callout, Field } from './kit';

export function PairingPage() {
  const { t, update, setView } = useApp();
  const live = t.status === 'live';
  const p = t.pairing;
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [err, setErr] = useState('');
  const setP = (patch: Partial<typeof p>) => update((x) => ({ ...x, pairing: { ...x.pairing, ...patch } }));
  const name = (id: string) => t.players.find((q) => q.id === id)?.name ?? '(removed player)';

  const toggleCombo = (k: ComboKey) =>
    setP({ allowedCombinations: p.allowedCombinations.includes(k) ? p.allowedCombinations.filter((x) => x !== k) : [...p.allowedCombinations, k] });

  const addPair = () => {
    if (!a || !b) { setErr('Choose two players.'); return; }
    if (a === b) { setErr('Choose two different players.'); return; }
    const exists = p.forbiddenPairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
    if (exists) { setErr('That pairing is already on the list.'); return; }
    setErr('');
    setP({ forbiddenPairs: [...p.forbiddenPairs, [a, b]] });
    setA('');
    setB('');
  };

  return (
    <div className="page narrow">
      <header className="page-head">
        <h1>Pairing rules</h1>
        <p className="lede">Choose how teams are formed. Hard rules are never broken. Preferences only guide the draw.</p>
      </header>
      {live && <Callout kind="info" title="Pairing is locked">Teams are set now that play has started.</Callout>}

      <fieldset className="card stack" disabled={live}>
        <legend className="card-legend">Strategy</legend>
        <div className="choice-grid">
          {listStrategies().map((s) => (
            <label key={s.id} className={`choice${p.strategy === s.id ? ' on' : ''}`}>
              <input type="radio" name="strategy" checked={p.strategy === s.id} onChange={() => setP({ strategy: s.id as StrategyId })} />
              <span className="choice-title">{s.label}</span>
              <span className="choice-desc">{s.description}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {p.strategy === 'custom' && p.teamSize === 2 && (
        <fieldset className="card stack" disabled={live}>
          <legend className="card-legend">Allowed combinations</legend>
          <p className="hint">Tick every kind of team you accept. Anything not ticked is never generated.</p>
          <div className="checks">
            {MAIN_COMBOS.map((k) => (
              <label key={k} className="switch"><input type="checkbox" checked={p.allowedCombinations.includes(k)} onChange={() => toggleCombo(k)} /><span>{COMBO_LABELS[k]}</span></label>
            ))}
          </div>
          {t.players.some((x) => x.gender === 'other' || x.gender === 'unspecified') && (
            <details className="advanced" open={OTHER_COMBOS.some((k) => p.allowedCombinations.includes(k))}>
              <summary>Players with other or unspecified gender</summary>
              <div className="checks">
                {OTHER_COMBOS.map((k) => (
                  <label key={k} className="switch"><input type="checkbox" checked={p.allowedCombinations.includes(k)} onChange={() => toggleCombo(k)} /><span>{COMBO_LABELS[k]}</span></label>
                ))}
              </div>
            </details>
          )}
          {p.allowedCombinations.length === 0 && <Callout kind="warn">Select at least one combination.</Callout>}
        </fieldset>
      )}
      {p.strategy === 'custom' && p.teamSize !== 2 && (
        <Callout kind="info">Gender combinations only apply to teams of two. With {p.teamSize} players per team, any players can be teammates unless you list a forbidden pairing below.</Callout>
      )}

      {p.strategy === 'custom' && (
        <section className="card stack">
          <h2>Skill</h2>
          <label className="switch"><input type="checkbox" disabled={live} checked={p.preferences.balanceSkill} onChange={(e) => setP({ preferences: { ...p.preferences, balanceSkill: e.target.checked } })} /><span>Balance team strength using player ratings (a preference, never overrides the rules above)</span></label>
        </section>
      )}

      <section className="card stack">
        <h2>Never on the same team</h2>
        <p className="hint">Applies to every strategy. Add any two players who cannot be teammates.</p>
        {!live && (
          <div className="pair-row">
            <div className="field grow">
              <label htmlFor="fp-a">Player</label>
              <select id="fp-a" value={a} onChange={(e) => setA(e.target.value)}>
                <option value="">Choose…</option>
                {t.players.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </div>
            <span className="times" aria-hidden="true">×</span>
            <div className="field grow">
              <label htmlFor="fp-b">Player</label>
              <select id="fp-b" value={b} onChange={(e) => setB(e.target.value)}>
                <option value="">Choose…</option>
                {t.players.filter((x) => x.id !== a).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </div>
            <button className="btn" onClick={addPair}>Add forbidden pairing</button>
          </div>
        )}
        {err && <p className="error-text" role="alert">{err}</p>}
        {p.forbiddenPairs.length === 0 ? (
          <p className="muted">No forbidden pairings.</p>
        ) : (
          <ul className="chips">
            {p.forbiddenPairs.map(([x, y], i) => (
              <li key={i} className="chip">
                <span>{name(x)} <span className="times">×</span> {name(y)}</span>
                {!live && <button className="btn ghost icon" aria-label={`Remove forbidden pairing of ${name(x)} and ${name(y)}`} onClick={() => setP({ forbiddenPairs: p.forbiddenPairs.filter((_, j) => j !== i) })}>×</button>}
              </li>
            ))}
          </ul>
        )}
        {t.players.length < 2 && <Field label=""><span className="muted">Add players first to create forbidden pairings.</span></Field>}
      </section>

      {!live && (
        <div className="step-actions">
          <button className="btn" onClick={() => setView('players')}>Back</button>
          <button className="btn primary" onClick={() => setView('teams')}>Next: Teams</button>
        </div>
      )}
    </div>
  );
}
