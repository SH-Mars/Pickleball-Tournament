import { useMemo, useState } from 'react';
import type { Player, Team } from '../domain/types';
import { parseSeed, randomSeed } from '../domain/rng';
import { getStrategy, teamViolations, type PairingError } from '../domain/pairing';
import {
  benchPlayers, canStart, generateTeams, isModifiedSinceGeneration, playerMap, swapPlayers, teamIssues, teamRating,
} from '../domain/tournament';
import { useApp } from '../state/store';
import { copyText } from '../util/files';
import { Callout, Empty, GenderBadge } from './kit';

interface Sel { teamId: string | null; playerId: string }

export function TeamsPage() {
  const { t, update, setView, toast, confirm } = useApp();
  const live = t.status === 'live';
  const [error, setError] = useState<PairingError | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [sel, setSel] = useState<Sel | null>(null);
  const [seedText, setSeedText] = useState(String(t.pairing.seed));
  const pm = useMemo(() => playerMap(t), [t]);
  const strategy = getStrategy(t.pairing.strategy);
  const issues = useMemo(() => new Map(teamIssues(t).map((i) => [i.teamId, i.messages])), [t]);
  const bench = benchPlayers(t);
  const modified = isModifiedSinceGeneration(t);
  const start = canStart(t);
  const hasTeams = t.teams.length > 0;

  const run = async (seed: number) => {
    const unlockedManual = t.teams.some((x) => !x.locked && x.source === 'manual');
    if (unlockedManual) {
      const ok = await confirm({
        title: 'Replace edited teams?',
        body: 'Some unlocked teams were changed by hand. Generating again discards those edits. Locked teams are kept.',
        confirmLabel: 'Generate again',
        danger: true,
      });
      if (!ok) return;
    }
    const withSeed = { ...t, pairing: { ...t.pairing, seed } };
    const { result, tournament } = generateTeams(withSeed);
    setSel(null);
    if (!result.ok || !tournament) {
      update((x) => ({ ...x, pairing: { ...x.pairing, seed } }));
      setError(result.ok ? null : result.error);
      setNotes([]);
      return;
    }
    setError(null);
    setNotes(result.notes);
    update(() => tournament);
    setSeedText(String(seed));
  };

  const applySeed = (): number => {
    const s = parseSeed(seedText);
    if (s === null) { toast('Enter a seed first, or use New seed.', 'error'); return t.pairing.seed; }
    return s;
  };

  const pick = async (teamId: string | null, p: Player) => {
    if (live) return;
    if (!sel) { setSel({ teamId, playerId: p.id }); return; }
    if (sel.playerId === p.id) { setSel(null); return; }
    if (sel.teamId === null && teamId === null) { setSel({ teamId, playerId: p.id }); return; }
    const next = swapPlayers(t.teams, sel, { teamId, playerId: p.id });
    const changed = next.filter((x, i) => x !== t.teams[i]);
    const problems = changed.flatMap((tm) => teamViolations(tm.playerIds.map((id) => pm.get(id)).filter((q): q is Player => !!q), t.pairing));
    if (problems.length) {
      const ok = await confirm({
        title: 'This swap breaks a pairing rule',
        body: <ul className="plain">{problems.map((m) => <li key={m}>{m}</li>)}</ul>,
        confirmLabel: 'Swap anyway',
        danger: true,
      });
      if (!ok) { setSel(null); return; }
    }
    update((x) => ({ ...x, teams: next }));
    setSel(null);
  };

  const toggleLock = (id: string) => update((x) => ({ ...x, teams: x.teams.map((tm) => (tm.id === id ? { ...tm, locked: !tm.locked } : tm)) }));

  return (
    <div className="page">
      <header className="page-head">
        <h1>Teams</h1>
        <p className="lede">{live ? 'Teams are set. They cannot change once play has started.' : 'Generate teams, then review, swap players or lock the ones you like.'}</p>
      </header>

      {!live && (
        <section className="card stack" aria-labelledby="gen-h">
          <div className="card-head">
            <h2 id="gen-h">Team generation</h2>
            <button className="btn ghost" onClick={() => setView('pairing')}>Edit rules</button>
          </div>
          <div className="gen-summary">
            <div>
              <div className="kv"><span>Strategy</span><strong>{strategy.label}</strong></div>
              <ul className="rules">
                {strategy.describeRules(t.pairing).map((r) => <li key={r}>{r}</li>)}
                {t.pairing.forbiddenPairs.length > 0 && <li>{t.pairing.forbiddenPairs.length} forbidden pairing{t.pairing.forbiddenPairs.length === 1 ? '' : 's'} (never teammates).</li>}
                {(strategy.soft(t.pairing).balance) && <li>Preference: even team ratings.</li>}
              </ul>
            </div>
            <div className="seedbox">
              <label htmlFor="seed">Seed</label>
              <div className="seed-row">
                <input id="seed" inputMode="numeric" value={seedText} onChange={(e) => setSeedText(e.target.value)} onBlur={() => { const s = parseSeed(seedText); if (s !== null) update((x) => ({ ...x, pairing: { ...x.pairing, seed: s } })); }} />
                <button className="btn ghost" onClick={async () => toast((await copyText(String(t.pairing.seed))) ? 'Seed copied.' : 'Could not copy. Select the seed and copy it.', 'info')}>Copy</button>
              </div>
              <p className="hint">The same players, rules and seed always give the same teams.</p>
            </div>
          </div>
          <div className="row wrap">
            <button className="btn primary" onClick={() => void run(applySeed())}>{hasTeams ? 'Generate with this seed' : 'Generate teams'}</button>
            {hasTeams && <button className="btn" onClick={() => void run(randomSeed())}>Regenerate with a new seed</button>}
          </div>
        </section>
      )}

      {error && (
        <Callout kind="error" title={error.message}>
          {error.details.length > 0 && <ul className="plain">{error.details.map((d) => <li key={d}>{d}</li>)}</ul>}
          {error.suggestions.length > 0 && (<><p className="sub-h">What you can try</p><ul className="plain">{error.suggestions.map((d) => <li key={d}>{d}</li>)}</ul></>)}
        </Callout>
      )}
      {!error && notes.length > 0 && <Callout kind="info">{notes.join(' ')}</Callout>}
      {modified && !live && t.generation && (
        <Callout kind="warn" title="Teams edited by hand">These teams no longer match seed {t.generation.seed}. The seed alone cannot recreate them, so save the tournament file to keep them.</Callout>
      )}

      {!hasTeams && !error && (
        <Empty title="No teams yet">Press Generate teams to draw teams from your {t.players.filter((p) => p.active).length} active players.</Empty>
      )}

      {hasTeams && (
        <>
          {sel && !live && <Callout kind="info">Now choose the player to swap {pm.get(sel.playerId)?.name} with. Choose the same player again to cancel.</Callout>}
          <ul className="team-grid">
            {t.teams.map((tm, i) => (
              <TeamCard key={tm.id} team={tm} index={i} pm={pm} sel={sel} live={live} messages={issues.get(tm.id)} onPick={pick} onLock={() => toggleLock(tm.id)} />
            ))}
          </ul>
        </>
      )}

      {bench.length > 0 && hasTeams && (
        <section className="card" aria-labelledby="bench-h">
          <h2 id="bench-h">Not on a team</h2>
          <p className="hint">{live ? 'These players are not in the bracket.' : 'Select one of these players and then a team member to swap them in.'}</p>
          <ul className="chips">
            {bench.map((p) => (
              <li key={p.id}>
                <button className={`player-chip${sel?.playerId === p.id ? ' sel' : ''}`} disabled={live} onClick={() => void pick(null, p)} aria-pressed={sel?.playerId === p.id}>
                  <GenderBadge gender={p.gender} />{p.name}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!live && (
        <>
          {hasTeams && !start.ok && <Callout kind="warn" title="Before you can continue">{start.problems.join(' ')}</Callout>}
          <div className="step-actions">
            <button className="btn" onClick={() => setView('pairing')}>Back</button>
            <button className="btn primary" disabled={!start.ok} onClick={() => setView('bracket')}>Accept teams: Next</button>
          </div>
        </>
      )}
    </div>
  );
}

function TeamCard({ team, index, pm, sel, live, messages, onPick, onLock }: {
  team: Team; index: number; pm: Map<string, Player>; sel: Sel | null; live: boolean; messages?: string[];
  onPick: (teamId: string | null, p: Player) => void; onLock: () => void;
}) {
  const r = teamRating(team, pm);
  return (
    <li className={`team-card${team.locked ? ' locked' : ''}${messages ? ' problem' : ''}`}>
      <div className="team-head">
        <h3>Team {index + 1}</h3>
        <div className="badges">
          {team.source === 'manual' && <span className="pill warn">Manually modified</span>}
          {team.locked && <span className="pill">Locked</span>}
        </div>
      </div>
      <ul className="members">
        {team.playerIds.map((id) => {
          const p = pm.get(id);
          if (!p) return <li key={id} className="muted">(removed player)</li>;
          return (
            <li key={id}>
              <button className={`player-chip${sel?.playerId === id ? ' sel' : ''}`} disabled={live || (team.locked && sel?.teamId !== team.id)} aria-pressed={sel?.playerId === id} onClick={() => onPick(team.id, p)} title={live ? undefined : 'Select to swap'}>
                <GenderBadge gender={p.gender} /><span className="pname">{p.name}</span>
                {p.rating !== undefined && <span className="rating">{p.rating}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="team-foot">
        <span className="muted">{r !== null ? `Avg rating ${r.toFixed(2)}` : 'No ratings'}</span>
        {!live && <button className="btn ghost small" onClick={onLock} aria-pressed={team.locked}>{team.locked ? 'Unlock team' : 'Lock team'}</button>}
      </div>
      {messages && <ul className="issues">{messages.map((m) => <li key={m}>{m}</li>)}</ul>}
    </li>
  );
}
