import { useMemo, useState } from 'react';
import { useApp } from '../state/store';
import { BracketSvg } from '../export/BracketSvg';
import { bracketToPdf, bracketToPng } from '../export/exportBracket';
import { buildGroupViews, buildViewModels } from './matchView';
import { StandingsTable } from './Standings';
import { buildBracketFor, canStart, champion, playerMap, progress, seedTeams, startTournament, teamLabel, teamNumber } from '../domain/tournament';
import { getFormat, SEEDING_LABELS } from '../domain/bracket';
import { saveFile, slug } from '../util/files';
import { Callout } from './kit';
import { MatchCard } from './MatchCard';
import { ScoreModal } from './ScoreModal';

export function BracketPage() {
  const { t, update, setView, confirm, toast } = useApp();
  const live = t.status === 'live';
  const [openId, setOpenId] = useState<string | null>(null);
  const fmt = getFormat(t.formatId);
  const [mode, setMode] = useState<'bracket' | 'rounds'>(() => (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 720px)').matches ? 'rounds' : 'bracket'));
  const [busy, setBusy] = useState<'png' | 'pdf' | null>(null);
  const [showSeed, setShowSeed] = useState(true);
  const chk = canStart(t);

  // Before play starts, show a preview built from the current teams. It is not stored.
  const shown = useMemo(() => {
    if (live) return t;
    if (!chk.ok) return t;
    try { return { ...t, bracket: buildBracketFor(t) }; } catch { return t; }
  }, [t, live, chk.ok]);
  const vms = useMemo(() => buildViewModels(shown), [shown]);
  const groupViews = useMemo(() => buildGroupViews(shown), [shown]);
  const hasElim = !!shown.bracket?.rounds.some((r) => r.kind === 'elimination');
  const viewMode = hasElim ? mode : 'rounds';
  const champ = champion(t);
  const pm = playerMap(t);
  const prog = progress(t);

  if (!shown.bracket) {
    return (
      <div className="page narrow">
        <header className="page-head"><h1>Bracket</h1></header>
        <Callout kind="warn" title="The bracket needs teams first">{chk.problems.join(' ') || 'Generate teams to see the bracket.'}</Callout>
        <div className="step-actions"><button className="btn" onClick={() => setView('teams')}>Back to Teams</button><span /></div>
      </div>
    );
  }

  const start = async () => {
    const ok = await confirm({
      title: 'Start the tournament?',
      body: (
        <>
          <p>This locks players, teams and settings so scores can be entered. You can still correct scores later.</p>
          <p className="muted">You can go back to setup from Settings, but that clears all results.</p>
        </>
      ),
      confirmLabel: 'Start tournament',
    });
    if (!ok) return;
    try {
      update((x) => startTournament(x));
      setView('bracket');
      toast('Tournament started. Tap a match to enter a score.', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const exportImg = async (kind: 'png' | 'pdf') => {
    setBusy(kind);
    try {
      const base = slug(t.name);
      const blob = kind === 'png' ? (await bracketToPng(shown, showSeed)).blob : await bracketToPdf(shown, showSeed);
      const r = await saveFile(`${base}-bracket.${kind}`, blob);
      if (r === 'saved') toast(kind === 'png' ? 'Bracket image ready.' : 'Bracket PDF ready.', 'success');
      else if (r === 'failed') toast('The file could not be saved.', 'error');
    } catch (e) {
      toast((e as Error).message || 'Export failed.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const order = seedTeams(t);
  const byes = shown.bracket.matches.filter((m) => m.roundId === shown.bracket!.rounds[0].id && vms.get(m.id)?.status === 'bye').length;
  const realMatches = shown.bracket.matches.filter((m) => { const v = vms.get(m.id); return v && v.status !== 'bye' && !v.skipped; }).length;
  const sections = [...new Set(shown.bracket.rounds.map((r) => r.section))];

  return (
    <div className="page wide">
      <header className="page-head">
        <h1>{fmt.viewLabel}</h1>
        {live && <p className="lede">{prog.done} of {prog.total} matches played. Select a match to enter its score.</p>}
        {!live && <p className="lede">A preview built from your current teams. Nothing is locked until you start.</p>}
      </header>

      {champ && (
        <div className="champion" role="status">
          <span className="trophy" aria-hidden="true">★</span>
          <div>
            <div className="champ-label">Champions</div>
            <div className="champ-name">{teamLabel(champ, pm, ' & ')}</div>
          </div>
        </div>
      )}

      {!live && (
        <div className="card row between wrap">
          <div>
            <strong>{t.teams.length} teams</strong>
            <span className="muted"> · {fmt.label} · {realMatches} matches{byes ? ` · ${byes} bye${byes === 1 ? '' : 's'}` : ''} · seeding: {SEEDING_LABELS[t.settings.seeding].toLowerCase()}</span>
            {byes > 0 && t.formatId !== 'pool_play' && <div className="hint">Teams {order.slice(0, byes).map((id) => teamNumber(t, id)).join(', ')} skip the first round.</div>}
          </div>
          <div className="row">
            <button className="btn" onClick={() => setView('teams')}>Back to teams</button>
            <button className="btn primary" onClick={() => void start()}>Start tournament</button>
          </div>
        </div>
      )}

      <div className="toolbar">
        {hasElim ? (
          <div className="seg" role="group" aria-label="View">
            <button className={mode === 'bracket' ? 'on' : ''} aria-pressed={mode === 'bracket'} onClick={() => setMode('bracket')}>Bracket</button>
            <button className={mode === 'rounds' ? 'on' : ''} aria-pressed={mode === 'rounds'} onClick={() => setMode('rounds')}>By round</button>
          </div>
        ) : <span />}
        <div className="row wrap">
          <label className="switch small"><input type="checkbox" checked={showSeed} onChange={(e) => setShowSeed(e.target.checked)} /><span>Show pairing and seed in exports</span></label>
          <button className="btn" disabled={busy !== null} onClick={() => void exportImg('png')}>{busy === 'png' ? 'Preparing…' : 'Download image'}</button>
          <button className="btn" disabled={busy !== null} onClick={() => void exportImg('pdf')}>{busy === 'pdf' ? 'Preparing…' : 'Download PDF'}</button>
        </div>
      </div>

      {groupViews.length > 0 && (
        <div className="standings-grid">
          {groupViews.map((g) => <StandingsTable key={g.id} view={g} advance={t.formatId === 'pool_play' ? t.settings.advancePerPool : 0} />)}
        </div>
      )}

      {viewMode === 'bracket' ? (
        <div className="bracket-scroll" tabIndex={0} role="region" aria-label="Bracket, scrollable">
          <BracketSvg tournament={shown} onSelect={live ? setOpenId : undefined} />
        </div>
      ) : (
        <div className="rounds">
          {sections.map((sec) => (
            <div key={sec} className="rounds-section">
              {sections.length > 1 && <h2 className="section-h">{sec}</h2>}
              {shown.bracket!.rounds.filter((r) => r.section === sec).map((r) => {
                const list = shown.bracket!.matches.filter((m) => m.roundId === r.id && !vms.get(m.id)?.skipped);
                if (!list.length) return null;
                return (
                  <section key={r.id} aria-labelledby={`rd-${r.id}`}>
                    <h3 id={`rd-${r.id}`}>{r.name}</h3>
                    <div className="match-list">
                      {list.map((m) => <MatchCard key={m.id} vm={vms.get(m.id)!} onOpen={live ? () => setOpenId(m.id) : undefined} />)}
                    </div>
                  </section>
                );
              })}
            </div>
          ))}
        </div>
      )}
      {openId && <ScoreModal matchId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
