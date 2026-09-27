import { useEffect, useState } from 'react';
import { encodeShare, MAX_SHARE_LENGTH } from '../domain/serialization';
import { useApp } from '../state/store';
import { copyText } from '../util/files';
import { Callout, Modal } from './kit';

export function ShareModal({ onClose }: { onClose: () => void }) {
  const { t, toast } = useApp();
  const [code, setCode] = useState<string | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let dead = false;
    encodeShare(t).then((c) => !dead && setCode(c)).catch(() => !dead && setErr('This browser cannot create share links.'));
    return () => { dead = true; };
  }, [t]);

  const base = typeof window !== 'undefined' ? window.location.href.split('#')[0] : '';
  const link = code ? `${base}#${code}` : '';
  const tooLong = code ? link.length > MAX_SHARE_LENGTH : false;
  const copy = async (text: string, what: string) => toast((await copyText(text)) ? `${what} copied.` : 'Could not copy. Select the text and copy it.', 'info');

  return (
    <Modal title="Share tournament" onClose={onClose} footer={<button className="btn primary" onClick={onClose}>Done</button>}>
      <p className="muted">The whole tournament is packed into the link itself. Nothing is uploaded, and anyone who opens it gets their own copy.</p>
      {err && <Callout kind="error">{err}</Callout>}
      {!code && !err && <p className="muted">Preparing…</p>}
      {code && (
        <div className="stack">
          {tooLong && <Callout kind="warn" title="This link is long">It is {link.length.toLocaleString()} characters. Some chat apps cut long links, so send the saved file instead when you can.</Callout>}
          <div className="field">
            <label htmlFor="share-link">Link</label>
            <textarea id="share-link" readOnly rows={3} value={link} onFocus={(e) => e.currentTarget.select()} />
            <div className="row"><button className="btn primary" onClick={() => void copy(link, 'Link')}>Copy link</button></div>
          </div>
          <div className="field">
            <label htmlFor="share-code">Tournament code</label>
            <textarea id="share-code" readOnly rows={2} value={code} onFocus={(e) => e.currentTarget.select()} />
            <p className="hint">If links do not open on your site, paste this code into Open, then Paste a code.</p>
            <div className="row"><button className="btn" onClick={() => void copy(code, 'Code')}>Copy code</button></div>
          </div>
          <p className="hint">The saved tournament file is the reliable archive. Links are a convenience.</p>
        </div>
      )}
    </Modal>
  );
}
