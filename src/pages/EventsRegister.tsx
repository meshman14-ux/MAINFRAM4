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

  const live = rows.filter((r) => r.status === 'live').length;
  const staffed = rows.filter((r) => r.need > 0 && r.filled >= r.need).length;
  const stockRisk = rows.filter((r) => r.stockLow > 0).length;

  function exportCsv() {
    const csv = [
      'Event,Client,Location,Start,End,Units,Crew filled,Crew need,Confirmed,Stock low',
      ...rows.map((r) => [
        `"${r.name.replace(/"/g, "'")}"`, `"${(r.clientName || '').replace(/"/g, "'")}"`,
        `"${(r.loc || '').replace(/"/g, "'")}"`, r.start || '', r.end || '',
        r.units, r.filled, r.need, r.confirmed, r.stockLow,
      ].join(',')),
    ].join('\n');
    const b = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(b);
    const a = document.createElement('a'); a.href = url; a.download = 'events-register.csv';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 120);
  }

  return (
    <div className="p4">
      <div className="toolbar">
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22 }}>Events register</h2>
        <div className="row-inline">
          <div className="segmented">
            {SCOPES.map((s) => (
              <button key={s} aria-pressed={scope === s} onClick={() => setScope(s)}>
                {s[0].toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <button className="btn btn-sm" onClick={exportCsv} disabled={!rows.length}>Export .csv</button>
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi-chip"><div className="k">Events</div><div className="v" style={{ color: 'var(--neon-cyan)' }}>{rows.length}</div></div>
        <div className="kpi-chip"><div className="k">Live now</div><div className="v" style={{ color: live ? 'var(--ok)' : 'var(--ink-3)' }}>{live}</div></div>
        <div className="kpi-chip"><div className="k">Fully staffed</div><div className="v" style={{ color: 'var(--neon-green)' }}>{staffed}/{rows.length}</div></div>
        <div className="kpi-chip"><div className="k">Stock risk</div><div className="v" style={{ color: stockRisk ? 'var(--neon-yellow)' : 'var(--ink-3)' }}>{stockRisk}</div></div>
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">No {scope === 'all' ? '' : scope} events.</div>
      ) : (
        rows.map((r) => (
          <a
            key={r.id}
            className="reg-row"
            href={`#/event/${r.id}`}
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
