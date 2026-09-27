import { useRef, useState } from 'react';
import { decodeShare, parseTournament, SHARE_PREFIX } from '../domain/serialization';
import { useApp } from '../state/store';
import { Callout, Modal } from './kit';

export async function loadFromText(text: string) {
  const trimmed = text.trim();
  const hashAt = trimmed.indexOf('#t=');
  if (hashAt >= 0) return decodeShare(trimmed.slice(hashAt));
  if (trimmed.startsWith(SHARE_PREFIX)) return decodeShare(trimmed);
  return parseTournament(trimmed);
}

export function OpenModal({ onClose }: { onClose: () => void }) {
  const { replace, toast, confirm, dirty } = useApp();
  const [err, setErr] = useState('');
  const [paste, setPaste] = useState('');
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const open = async (text: string) => {
    const r = await loadFromText(text);
    if (!r.ok) { setErr(r.error); return; }
    if (dirty) {
      const ok = await confirm({ title: 'Replace the current tournament?', body: 'Opening this file replaces what is on screen. Save the current tournament first if you need it.', confirmLabel: 'Open file', danger: true });
      if (!ok) return;
    }
    replace(r.tournament);
    toast(`Opened "${r.tournament.name}".`, 'success');
    onClose();
  };
  const fromFile = async (f: File | undefined) => {
    if (!f) return;
    setErr('');
    if (f.size > 20 * 1024 * 1024) { setErr('That file is too large to be a tournament file.'); return; }
    try { await open(await f.text()); } catch { setErr('That file could not be read.'); }
  };

  return (
    <Modal title="Open a tournament" onClose={onClose} footer={<button className="btn" onClick={onClose}>Cancel</button>}>
      <div className="stack">
        <div
          className={`dropzone${over ? ' over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); void fromFile(e.dataTransfer.files?.[0]); }}
        >
          <p><strong>Drop a tournament file here</strong></p>
          <p className="muted">.pbt or .json files saved from this app</p>
          <button className="btn primary" onClick={() => input.current?.click()}>Choose file</button>
          <input ref={input} type="file" hidden accept=".pbt,.json,application/json,text/plain" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void fromFile(f); }} />
        </div>
        <div className="field">
          <label htmlFor="paste-code">Or paste a share link or code</label>
          <textarea id="paste-code" rows={3} value={paste} onChange={(e) => { setPaste(e.target.value); setErr(''); }} placeholder="t=…" />
          <div className="row"><button className="btn" disabled={!paste.trim()} onClick={() => void open(paste)}>Open from code</button></div>
        </div>
        {err && <Callout kind="error" title="Could not open that">{err}</Callout>}
      </div>
    </Modal>
  );
}
