/* WriteErrorToast — audit C5. Failed store writes now roll the optimistic
   change back (in opsData.failWrite) and report here, so the user sees a
   toast instead of losing data silently. Also catches stray unhandled
   promise rejections as a backstop. */
import { useEffect, useState } from 'react';
import { opsData } from '../data/opsData';

interface Toast { id: number; msg: string }

export default function WriteErrorToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    let n = 0;
    const push = (raw: string) => {
      const id = ++n;
      // Trim the internal "op: " prefix noise into something human.
      const msg = raw.replace(/^(save|remove|kvSet|saveCert|removeCert|setAvailability|pipeline save|pipeline remove|movement save|movement remove|task save|task remove)[^:]*:\s*/i, '');
      setToasts((t) => [...t, { id, msg: msg || raw }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
    };
    const off = opsData.subscribeError((m) => push('Couldn’t save — ' + m));
    const onRej = (e: PromiseRejectionEvent) => {
      const m = String(e.reason?.message || e.reason || '');
      // The store already toasts its own failures; only surface *other* stray rejections.
      if (m && !/^(save|remove|kvSet|saveCert|removeCert|setAvailability|pipeline|movement|task)\b/i.test(m)) {
        push('Something didn’t complete — ' + m);
      }
    };
    window.addEventListener('unhandledrejection', onRej);
    return () => { off(); window.removeEventListener('unhandledrejection', onRej); };
  }, []);

  if (toasts.length === 0) return null;
  return (
    <div style={{ position: 'fixed', right: 18, bottom: 18, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360 }} role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} style={{
          background: 'var(--panel)', border: '1px solid var(--danger)',
          borderLeft: '3px solid var(--danger)', borderRadius: 10, padding: '11px 14px',
          fontSize: 13, color: 'var(--ink)', boxShadow: 'var(--glow-md) color-mix(in oklch, var(--danger) 30%, transparent)',
        }}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}
