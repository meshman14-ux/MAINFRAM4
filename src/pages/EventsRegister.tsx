import { useMemo, useState } from 'react';
import { useOpsData } from '../data/useOpsData';
import { registerRows } from '../data/phase4';
import { unitColor } from '../components/console/unitTheme';
import type { EventRec } from '../data/types';

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
        <>
          {rows.filter((r) => r.status !== 'past' || scope === 'past').map((r) => {
            const ev = data.get<EventRec>('events', r.id);
            const types = ev ? data.unitsForEvent(ev).map((u) => u.type) : [];
            const staffPct = r.need ? Math.min(100, Math.round((r.filled / r.need) * 100)) : 0;
            const crewed = r.need > 0 && r.filled >= r.need;
            return (
              <div key={r.id} className="reg-row" style={{ ['--evc' as string]: r.color }}>
                <span className="reg-accent" />
                <div className="reg-main">
                  <div className="nm">
                    <a href={`#/event/${r.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{r.name}</a>
                    <span className="reg-dots" aria-label={`${types.length} units on site`}>
                      {types.map((t, i) => (
                        <span className="reg-dot" key={i} style={{ background: unitColor(t), boxShadow: `0 0 6px ${unitColor(t)}` }} title={t} />
                      ))}
                    </span>
                  </div>
                  <div className="sub">{r.clientName} · {r.loc || '—'} · {fmt(r.start)}{r.end && r.end !== r.start ? `–${fmt(r.end)}` : ''}</div>
                  <div className="reg-staffbar" data-ok={crewed}>
                    <span className="bar"><span style={{ width: `${staffPct}%` }} /></span>
                    <span className="mono">{r.filled}/{r.need} crew · {r.confirmed} confirmed{r.stockLow ? ` · ${r.stockLow} stock low` : ''}</span>
                  </div>
                  <div className="reg-actions">
                    <a className="btn btn-primary btn-sm" href={`#/event/${r.id}`} style={{ textDecoration: 'none' }}>Open data pack</a>
                    <a className="btn btn-sm" href="#/callouts" style={{ textDecoration: 'none' }}>Callout crew</a>
                    <a className="btn btn-ghost btn-sm" href={`#/console/${r.clientId}`} style={{ textDecoration: 'none' }}>Edit</a>
                  </div>
                </div>
                <span className="reg-badge" data-status={r.status}>{r.status === 'live' ? '● LIVE' : r.status === 'past' ? 'DONE' : r.countdownLabel}</span>
              </div>
            );
          })}

          {/* past events collapse into a slim archive */}
          {scope === 'all' && rows.some((r) => r.status === 'past') && (
            <details className="reg-archive">
              <summary>Archive · {rows.filter((r) => r.status === 'past').length} past event{rows.filter((r) => r.status === 'past').length !== 1 ? 's' : ''}</summary>
              {rows.filter((r) => r.status === 'past').map((r) => (
                <a key={r.id} className="reg-arch-row" href={`#/event/${r.id}`} style={{ ['--evc' as string]: r.color }}>
                  <span className="reg-arch-dot" />
                  <span className="reg-arch-name">{r.name}</span>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{fmt(r.start)}</span>
                  <span className="reg-badge" data-status="past">DONE</span>
                </a>
              ))}
            </details>
          )}
        </>
      )}
    </div>
  );
}
