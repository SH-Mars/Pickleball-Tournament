import { useEffect, useState } from 'react';
import { AppProvider, useApp, type View } from '../state/store';
import { serialize } from '../domain/serialization';
import { progress, champion } from '../domain/tournament';
import { saveFile, slug } from '../util/files';
import { Modal } from './kit';
import { TournamentPage } from './TournamentPage';
import { PlayersPage } from './PlayersPage';
import { PairingPage } from './PairingPage';
import { TeamsPage } from './TeamsPage';
import { BracketPage } from './BracketPage';
import { MatchesPage } from './MatchesPage';
import { SettingsPage } from './SettingsPage';
import { ShareModal } from './ShareModal';
import { OpenModal } from './OpenModal';

const SETUP_STEPS: { id: View; label: string }[] = [
  { id: 'tournament', label: 'Tournament' },
  { id: 'players', label: 'Players' },
  { id: 'pairing', label: 'Pairing' },
  { id: 'teams', label: 'Teams' },
  { id: 'bracket', label: 'Bracket' },
];
const LIVE_TABS: { id: View; label: string }[] = [
  { id: 'bracket', label: 'Bracket' },
  { id: 'matches', label: 'Matches' },
  { id: 'teams', label: 'Teams' },
  { id: 'tournament', label: 'Details' },
  { id: 'settings', label: 'Settings' },
];

function Shell() {
  const app = useApp();
  const { t, view, setView, dirty, markSaved, toast, toasts, dialog, restored, dismissRestored } = app;
  const [share, setShare] = useState(false);
  const [opening, setOpening] = useState(false);
  const live = t.status === 'live';
  const steps = live ? LIVE_TABS : SETUP_STEPS;
  const current: View = steps.some((s) => s.id === view) ? view : steps[0].id;
  const prog = progress(t);
  const champ = champion(t);

  useEffect(() => { if (current !== view) setView(current); }, [current, view, setView]);
  useEffect(() => { document.title = t.name ? `${t.name} · Pickleball Organizer` : 'Pickleball Organizer'; }, [t.name]);

  const save = async () => {
    const r = await saveFile(`${slug(t.name)}.pbt`, serialize(t));
    if (r === 'saved') { markSaved(); toast('Tournament file saved.', 'success'); }
    else if (r === 'failed') toast('The file could not be saved. Try again, or use Share to copy a code.', 'error');
  };

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  return (
    <div className="shell">
      <a className="skip" href="#main">Skip to content</a>
      <header className="topbar">
        <div className="brand">
          <span className="mark" aria-hidden="true" />
          <div className="brand-text">
            <span className="app-name">Pickleball Organizer</span>
            <span className="t-name" title={t.name}>{t.name || 'Untitled tournament'}</span>
          </div>
        </div>
        <div className="top-actions">
          <button className="btn" onClick={() => setOpening(true)}>Open</button>
          <button className={`btn${dirty ? ' attention' : ''}`} onClick={() => void save()} title="Download a .pbt file with everything in this tournament">Save file</button>
          <button className="btn" onClick={() => setShare(true)}>Share</button>
        </div>
      </header>

      <nav className="tabs" aria-label={live ? 'Tournament' : 'Setup steps'}>
        <ol>
          {steps.map((s, i) => (
            <li key={s.id}>
              <button className={current === s.id ? 'on' : ''} aria-current={current === s.id ? 'page' : undefined} onClick={() => setView(s.id)}>
                {!live && <span className="stepno" aria-hidden="true">{i + 1}</span>}
                {s.label}
              </button>
            </li>
          ))}
        </ol>
        {live && <span className="prog" aria-label="Progress">{champ ? 'Complete' : `${prog.done}/${prog.total} matches`}</span>}
      </nav>

      {restored && (
        <div className="banner" role="status">
          <span>Restored your unfinished tournament from this browser. Browser storage can be cleared, so download a file to keep a permanent copy.</span>
          <span className="row">
            <button className="btn small" onClick={() => void save()}>Save file</button>
            <button className="btn ghost small" onClick={dismissRestored}>Dismiss</button>
          </span>
        </div>
      )}

      <main id="main" tabIndex={-1}>
        {current === 'tournament' && <TournamentPage />}
        {current === 'players' && <PlayersPage />}
        {current === 'pairing' && <PairingPage />}
        {current === 'teams' && <TeamsPage />}
        {current === 'bracket' && <BracketPage />}
        {current === 'matches' && <MatchesPage />}
        {current === 'settings' && <SettingsPage />}
      </main>

      <footer className="foot">
        Your tournament lives in this browser. No account, no server.
        {dirty ? ' It has changes that are not saved to a file yet.' : ''}
      </footer>

      {share && <ShareModal onClose={() => setShare(false)} />}
      {opening && <OpenModal onClose={() => setOpening(false)} />}
      {dialog && (
        <Modal
          title={dialog.opts.title}
          onClose={() => dialog.resolve(false)}
          footer={
            <>
              <button className="btn" onClick={() => dialog.resolve(false)}>{dialog.opts.cancelLabel ?? 'Cancel'}</button>
              <button className={`btn ${dialog.opts.danger ? 'danger' : 'primary'}`} onClick={() => dialog.resolve(true)}>{dialog.opts.confirmLabel ?? 'Continue'}</button>
            </>
          }
        >
          {dialog.opts.body}
        </Modal>
      )}
      <div className="toasts" aria-live="polite" aria-atomic="false">
        {toasts.map((x) => <div key={x.id} className={`toast ${x.kind}`}>{x.text}</div>)}
      </div>
    </div>
  );
}

export function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
