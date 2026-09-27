import { useEffect, useRef, type ReactNode } from 'react';
import type { Gender } from '../domain/types';

export function Modal({ title, onClose, children, footer, wide, labelledBy }: {
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean; labelledBy?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>('[data-autofocus], input, select, textarea, button');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      const all = document.querySelectorAll('.modal');
      if (all[all.length - 1] !== el) return; // only the top-most dialog reacts
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'Tab' && el) {
        const f = Array.from(el.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'));
        if (!f.length) return;
        const a = f[0];
        const z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('keydown', onKey, true); prev?.focus?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy ?? 'modal-title'} ref={ref}>
        <div className="modal-head">
          <h2 id={labelledBy ?? 'modal-title'}>{title}</h2>
          <button className="btn ghost icon" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export const GENDER_LABEL: Record<Gender, string> = { male: 'Male', female: 'Female', other: 'Other', unspecified: 'Not specified' };
const GENDER_SHORT: Record<Gender, string> = { male: 'M', female: 'F', other: 'O', unspecified: '–' };

export function GenderBadge({ gender }: { gender: Gender }) {
  return <span className={`gbadge g-${gender}`} title={GENDER_LABEL[gender]} aria-label={GENDER_LABEL[gender]}>{GENDER_SHORT[gender]}</span>;
}

export function Callout({ kind = 'info', title, children, actions }: { kind?: 'info' | 'warn' | 'error' | 'success'; title?: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className={`callout ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <div className="callout-body">
        {title && <strong>{title}</strong>}
        {children && <div>{children}</div>}
      </div>
      {actions && <div className="callout-actions">{actions}</div>}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}
