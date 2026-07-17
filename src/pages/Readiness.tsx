import { useMemo, useState } from 'react';
import { useOpsData } from '../data/useOpsData';
import type { Client } from '../data/types';
import { readinessForClient } from '../data/phase5';

export default function Readiness() {
  const { data, ready, error } = useOpsData();
  const [clientId, setClientId] = useState('');

  const clients = useMemo(
    () => (ready ? data.all<Client>('clients') : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, data.meta().updatedAt]
  );
  const activeId = clientId || clients[0]?.id || '';

  const views = useMemo(
    () => (activeId ? readinessForClient(data, activeId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeId, data.meta().updatedAt]
  );

  if (error) return <div className="p4"><div className="banner">Couldn't load data: {error}</div></div>;
  if (!ready) return <div className="state"><div><div className="spinner" /><div className="eyebrow">Loading readiness</div></div></div>;
  if (clients.length === 0) return <div className="p4"><div className="empty-state">No operators yet.</div></div>;

  function barColor(pct: number) {
    if (pct >= 100) return 'var(--green)';
    if (pct >= 60) return 'var(--blue)';
    if (pct >= 30) return 'var(--amber)';
    return 'var(--red)';
  }

  return (
    <div className="p4">
      <div className="client-bar">
        <select className="client-select" value={activeId} onChange={(e) => setClientId(e.target.value)} aria-label="Operator">
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <span className="client-meta">Go-live readiness across upcoming events</span>
      </div>

      {views.length === 0 ? (
        <div className="empty-state">No upcoming events to assess.</div>
      ) : (
        views.map((v) => (
          <div className="ready-card" key={v.eventId} style={{ ['--evc' as string]: v.color }}>
            <div className="ready-head">
              <span style={{ width: 10, height: 10, borderRadius: 3, background: v.color }} />
              <span className="ready-name">{v.eventName}</span>
              <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>T-{Math.max(0, v.daysOut)}</span>
              <span className="ready-badge" data-ready={v.ready} style={{ marginLeft: 8 }}>{v.ready ? 'READY' : 'IN PREP'}</span>
              <span className="ready-pct" style={{ color: barColor(v.pct) }}>{v.pct}%</span>
            </div>
            <div className="ready-bar">
              <div className="ready-fill" style={{ width: `${v.pct}%`, background: barColor(v.pct) }} />
            </div>
            <div className="ready-steps">
              {v.steps.map((s) => (
                <div className="ready-step" key={s.key} data-done={s.done}>
                  <span className="tick">{s.done ? '✓' : ''}</span>
                  {s.label}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
