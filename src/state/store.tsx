import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Tournament } from '../domain/types';
import { createTournament } from '../domain/tournament';
import { randomSeed } from '../domain/rng';
import { decodeShare, parseTournament, serialize } from '../domain/serialization';
import { readStorage, writeStorage } from '../util/files';

export type View = 'tournament' | 'players' | 'pairing' | 'teams' | 'bracket' | 'matches' | 'settings';

export interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export interface Toast { id: number; text: string; kind: 'info' | 'success' | 'error' }

interface AppApi {
  t: Tournament;
  update: (fn: (t: Tournament) => Tournament) => void;
  replace: (t: Tournament, view?: View) => void;
  view: View;
  setView: (v: View) => void;
  toast: (text: string, kind?: Toast['kind']) => void;
  toasts: Toast[];
  confirm: (o: ConfirmOptions) => Promise<boolean>;
  dialog: { opts: ConfirmOptions; resolve: (ok: boolean) => void } | null;
  dirty: boolean;
  markSaved: () => void;
  restored: boolean;
  dismissRestored: () => void;
  newTournament: () => void;
}

const Ctx = createContext<AppApi | null>(null);
const STORE_KEY = 'pbt.current.v1';

function loadInitial(): { t: Tournament; restored: boolean } {
  const raw = readStorage(STORE_KEY);
  if (raw) {
    const r = parseTournament(raw);
    if (r.ok) return { t: r.tournament, restored: r.tournament.players.length > 0 || r.tournament.status === 'live' };
  }
  return { t: createTournament(randomSeed()), restored: false };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const init = useMemo(loadInitial, []);
  const [t, setT] = useState<Tournament>(init.t);
  const [view, setView] = useState<View>(init.t.status === 'live' ? 'bracket' : 'tournament');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<AppApi['dialog']>(null);
  const [restored, setRestored] = useState(init.restored);
  const toastId = useRef(0);

  const json = useMemo(() => serialize(t, new Date(0)), [t]);
  const [baseline, setBaseline] = useState<string | null>(null);
  const dirty = baseline === null ? t.players.length > 0 || t.status === 'live' : baseline !== json;

  useEffect(() => {
    const h = window.setTimeout(() => writeStorage(STORE_KEY, serialize(t)), 400);
    return () => window.clearTimeout(h);
  }, [t]);

  const toast = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = ++toastId.current;
    setToasts((x) => [...x, { id, text, kind }].slice(-3));
    window.setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), kind === 'error' ? 8000 : 4000);
  }, []);

  const confirm = useCallback(
    (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setDialog({ opts, resolve: (ok) => { setDialog(null); resolve(ok); } })),
    [],
  );

  const update = useCallback((fn: (t: Tournament) => Tournament) => setT((cur) => fn(cur)), []);
  const replace = useCallback((next: Tournament, v?: View) => {
    setT(next);
    setBaseline(serialize(next, new Date(0)));
    setView(v ?? (next.status === 'live' ? 'bracket' : 'tournament'));
    setRestored(false);
  }, []);
  const markSaved = useCallback(() => setBaseline(json), [json]);
  const newTournament = useCallback(() => {
    const n = createTournament(randomSeed());
    setT(n);
    setBaseline(serialize(n, new Date(0)));
    setView('tournament');
    setRestored(false);
  }, []);

  // Open a tournament from a share link in the address bar.
  useEffect(() => {
    const h = window.location.hash;
    if (!h.startsWith('#t=')) return;
    let cancelled = false;
    void decodeShare(h).then((r) => {
      if (cancelled) return;
      try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch { /* ignore */ }
      if (r.ok) {
        replace(r.tournament);
        toast('Opened a shared tournament. Changes stay in this browser unless you save a file.', 'success');
      } else toast(r.error, 'error');
    });
    return () => { cancelled = true; };
  }, [replace, toast]);

  const api: AppApi = {
    t, update, replace, view, setView, toast, toasts, confirm, dialog, dirty, markSaved,
    restored, dismissRestored: () => setRestored(false), newTournament,
  };
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useApp(): AppApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside provider');
  return v;
}
