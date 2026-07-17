import { useMemo, useState } from 'react';
import { useOpsData } from '../data/useOpsData';
import { registerRows } from '../data/phase4';

type Scope = 'all' | 'upcoming' | 'live' | 'past';
const SCOPES: Scope[] = ['all', 'upcoming', 'live', 'past'];
const fmt = (iso?: string) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';

export default function EventsRegister() {
  const { data, ready, error } = useOpsData();
  const [scope, setScope] = useState<Scope>('all');

  const rows = useMemo(
    () => (ready ? registerRows(data, { scope }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, data.meta().updatedAt, scope]
  );

  if (error) return <div className="p4"><div className="banner">Couldn't load data: {error}</div></div>;
  if (!ready) return <div className="state"><div><div className="spinner" /><div className="eyebrow">Loading register</div></div></div>;

  return (
    <div className="p4">
      <div className="toolbar">
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22 }}>Events register</h2>
        <div className="segmented">
          {SCOPES.map((s) => (
            <button key={s} aria-pressed={scope === s} onClick={() => setScope(s)}>
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">No {scope === 'all' ? '' : scope} events.</div>
      ) : (
        rows.map((r) => (
          <a
            key={r.id}
            className="reg-row"
            href={`#/console`}
            style={{ ['--evc' as string]: r.color }}
          >
            <span className="reg-accent" />
            <div className="reg-main">
              <div className="nm">{r.name}</div>
              <div className="sub">{r.clientName} · {r.loc || '—'} · {fmt(r.start)}{r.end && r.end !== r.start ? `–${fmt(r.end)}` : ''}</div>
            </div>
            <div className="reg-stats">
              <div><span className="k">Units</span>{r.units}</div>
              <div><span className="k">Crew</span>{r.filled}/{r.need}</div>
              <div><span className="k">Conf</span>{r.confirmed}</div>
              <div style={{ color: r.stockLow > 0 ? 'var(--amber)' : 'var(--green)' }}>
                <span className="k">Stock</span>{r.stockLow > 0 ? `${r.stockLow} low` : 'ok'}
              </div>
            </div>
            <span className="reg-badge" data-status={r.status}>{r.countdownLabel}</span>
          </a>
        ))
      )}
    </div>
  );
}
