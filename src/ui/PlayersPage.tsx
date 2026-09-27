import { useMemo, useRef, useState } from 'react';
import type { Gender, Player } from '../domain/types';
import { newId } from '../domain/tournament';
import { checkPlayers } from '../domain/pairing';
import { useApp } from '../state/store';
import { EXAMPLE_ROSTER, parseRoster, rosterToCsv } from '../util/roster';
import { saveFile, slug } from '../util/files';
import { Callout, Empty, GENDER_LABEL } from './kit';

const GENDERS: Gender[] = ['male', 'female', 'other', 'unspecified'];

export function PlayersPage() {
  const { t, update, setView, toast, confirm } = useApp();
  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender>('unspecified');
  const [rating, setRating] = useState('');
  const [bulk, setBulk] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const live = t.status === 'live';
  const players = t.players;

  const dupes = useMemo(() => checkPlayers(players).filter((e) => e.startsWith('Duplicate')), [players]);
  const dupNames = useMemo(() => {
    const seen = new Map<string, number>();
    players.forEach((p) => seen.set(p.name.trim().toLowerCase(), (seen.get(p.name.trim().toLowerCase()) ?? 0) + 1));
    return seen;
  }, [players]);
  const active = players.filter((p) => p.active);
  const count = (g: Gender) => active.filter((p) => p.gender === g).length;

  const add = () => {
    const n = name.trim();
    if (!n) { nameRef.current?.focus(); return; }
    const r = rating.trim() === '' ? undefined : Number(rating);
    update((x) => ({ ...x, players: [...x.players, { id: newId('p'), name: n, gender, rating: r !== undefined && Number.isFinite(r) ? r : undefined, active: true }] }));
    setName('');
    setRating('');
    nameRef.current?.focus();
  };
  const patch = (id: string, p: Partial<Player>) => update((x) => ({ ...x, players: x.players.map((q) => (q.id === id ? { ...q, ...p } : q)) }));
  const remove = async (p: Player) => {
    const onTeam = t.teams.some((tm) => tm.playerIds.includes(p.id));
    const inPairs = t.pairing.forbiddenPairs.some(([a, b]) => a === p.id || b === p.id);
    if (onTeam || inPairs) {
      const ok = await confirm({
        title: `Remove ${p.name}?`,
        body: onTeam ? 'This player is on a team. Their team will be cleared and you will need to generate teams again.' : 'Their forbidden pairings will be removed too.',
        confirmLabel: 'Remove player',
        danger: true,
      });
      if (!ok) return;
    }
    update((x) => ({
      ...x,
      players: x.players.filter((q) => q.id !== p.id),
      teams: onTeam ? [] : x.teams,
      generation: onTeam ? undefined : x.generation,
      pairing: { ...x.pairing, forbiddenPairs: x.pairing.forbiddenPairs.filter(([a, b]) => a !== p.id && b !== p.id) },
    }));
  };
  const move = (i: number, d: -1 | 1) =>
    update((x) => {
      const j = i + d;
      if (j < 0 || j >= x.players.length) return x;
      const arr = x.players.slice();
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...x, players: arr };
    });

  const importText = (text: string) => {
    const r = parseRoster(text);
    if (!r.players.length) { toast(r.problems[0] ?? 'No players found in that text.', 'error'); return; }
    update((x) => ({ ...x, players: [...x.players, ...r.players] }));
    toast(`Added ${r.players.length} player${r.players.length === 1 ? '' : 's'}.${r.problems.length ? ` ${r.problems.length} line(s) had problems: ${r.problems[0]}` : ''}`, r.problems.length ? 'info' : 'success');
    setBulk('');
    setBulkOpen(false);
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1>Players</h1>
        <p className="lede">Add everyone who is playing. Gender and rating are optional and only matter if your pairing rules use them.</p>
      </header>
      {live && <Callout kind="info" title="Roster is locked">Players cannot be changed once play has started. Use Settings to reset the tournament if you need to.</Callout>}

      {!live && (
        <section className="card stack" aria-labelledby="add-h">
          <h2 id="add-h">Add a player</h2>
          <form className="add-row" onSubmit={(e) => { e.preventDefault(); add(); }}>
            <div className="field grow">
              <label htmlFor="np-name">Name</label>
              <input id="np-name" ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Maria Lopez" autoComplete="off" />
            </div>
            <div className="field">
              <label htmlFor="np-gender">Gender</label>
              <select id="np-gender" value={gender} onChange={(e) => setGender(e.target.value as Gender)}>
                {GENDERS.map((g) => <option key={g} value={g}>{GENDER_LABEL[g]}</option>)}
              </select>
            </div>
            <div className="field narrow-field">
              <label htmlFor="np-rating">Rating <span className="opt">optional</span></label>
              <input id="np-rating" type="number" step="0.1" min={0} max={10} value={rating} onChange={(e) => setRating(e.target.value)} placeholder="3.5" />
            </div>
            <button className="btn primary" type="submit">Add</button>
          </form>
          <div className="row wrap">
            <button className="btn" onClick={() => setBulkOpen((v) => !v)} aria-expanded={bulkOpen}>Paste or import a list</button>
            <button className="btn ghost" onClick={() => fileRef.current?.click()}>Import CSV file</button>
            <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) importText(await f.text());
            }} />
            {players.length > 0 && <button className="btn ghost" onClick={async () => {
              const r = await saveFile(`${slug(t.name)}-players.csv`, new Blob([rosterToCsv(players)], { type: 'text/csv' }));
              if (r === 'saved') toast('Player list exported.', 'success');
              else if (r === 'failed') toast('Could not export the player list.', 'error');
            }}>Export players (CSV)</button>}
          </div>
          {bulkOpen && (
            <div className="stack-sm">
              <label htmlFor="bulk">One player per line: <code>name, gender, rating</code>. Gender and rating can be left off.</label>
              <textarea id="bulk" rows={7} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={'Maria Lopez, female, 3.5\nJames Chen, male\nPat'} />
              <div className="row">
                <button className="btn primary" disabled={!bulk.trim()} onClick={() => importText(bulk)}>Add these players</button>
                <button className="btn ghost" onClick={() => setBulk(EXAMPLE_ROSTER)}>Fill with an example</button>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="card" aria-labelledby="roster-h">
        <div className="card-head">
          <h2 id="roster-h">Roster</h2>
          {players.length > 0 && (
            <p className="counts" aria-live="polite">
              <strong>{active.length}</strong> playing
              <span>{count('male')} male</span><span>{count('female')} female</span>
              {(count('other') + count('unspecified')) > 0 && <span>{count('other') + count('unspecified')} other / not specified</span>}
            </p>
          )}
        </div>
        {dupes.length > 0 && <Callout kind="error" title="Duplicate names">{dupes.join(' ')} Team generation is blocked until each name is unique.</Callout>}
        {players.length === 0 ? (
          <Empty title="No players yet" action={!live ? <button className="btn primary" onClick={() => importText(EXAMPLE_ROSTER)}>Load an example roster</button> : undefined}>
            Add players above, paste a list, or load a sample of 12 players to see how the app works.
          </Empty>
        ) : (
          <ul className="roster">
            {players.map((p, i) => (
              <li key={p.id} className={`roster-row${p.active ? '' : ' inactive'}`}>
                <span className="idx" aria-hidden="true">{i + 1}</span>
                <input aria-label={`Name of player ${i + 1}`} className={`r-name${(dupNames.get(p.name.trim().toLowerCase()) ?? 0) > 1 ? ' invalid' : ''}`} value={p.name} disabled={live} onChange={(e) => patch(p.id, { name: e.target.value })} />
                <select aria-label={`Gender of ${p.name}`} value={p.gender} disabled={live} onChange={(e) => patch(p.id, { gender: e.target.value as Gender })}>
                  {GENDERS.map((g) => <option key={g} value={g}>{GENDER_LABEL[g]}</option>)}
                </select>
                <input aria-label={`Rating of ${p.name}`} className="r-rating" type="number" step="0.1" min={0} max={10} placeholder="Rating" disabled={live} value={p.rating ?? ''} onChange={(e) => patch(p.id, { rating: e.target.value === '' ? undefined : Number(e.target.value) })} />
                <label className="switch small" title="Inactive players are skipped when teams are generated"><input type="checkbox" disabled={live} checked={p.active} onChange={(e) => patch(p.id, { active: e.target.checked })} /><span>Playing</span></label>
                {!live && (
                  <span className="row-actions">
                    <button className="btn ghost icon" aria-label={`Move ${p.name} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                    <button className="btn ghost icon" aria-label={`Move ${p.name} down`} disabled={i === players.length - 1} onClick={() => move(i, 1)}>↓</button>
                    <button className="btn ghost icon danger" aria-label={`Remove ${p.name}`} onClick={() => void remove(p)}>×</button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {!live && (
        <div className="step-actions">
          <button className="btn" onClick={() => setView('tournament')}>Back</button>
          <button className="btn primary" onClick={() => setView('pairing')} disabled={active.length < 2}>Next: Pairing rules</button>
        </div>
      )}
    </div>
  );
}
