import { useMemo, useState } from 'react';
import { useOpsData } from '../data/useOpsData';
import type { Client } from '../data/types';
import { complianceRegister, complianceSummary } from '../data/phase6';

export default function Compliance() {
  const { data, ready, error } = useOpsData();
  const [clientId, setClientId] = useState('');

  const clients = useMemo(
    () => (ready ? data.all<Client>('clients') : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, data.meta().updatedAt]
  );
  const activeId = clientId || clients[0]?.id || '';

  const rows = useMemo(
    () => (activeId ? complianceRegister(data, activeId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeId, data.meta().updatedAt]
  );
  const summary = useMemo(
    () => (activeId ? complianceSummary(data, activeId) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeId, data.meta().updatedAt]
  );

  if (error) return <div className="p4"><div className="banner">Couldn't load data: {error}</div></div>;
  if (!ready) return <div className="state"><div><div className="spinner" /><div className="eyebrow">Loading compliance</div></div></div>;
  if (clients.length === 0) return <div className="p4"><div className="empty-state">No operators yet.</div></div>;

  return (
    <div className="p4">
      <div className="client-bar">
        <select className="client-select" value={activeId} onChange={(e) => setClientId(e.target.value)} aria-label="Operator">
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <span className="client-meta">Right-to-work, certificates and scheduling conflicts</span>
      </div>

      {summary && (
        <div className="stat-strip">
          <div className="stat-box"><div className="v">{summary.total}</div><div className="k">Crew</div></div>
          <div className="stat-box" data-tone="green"><div className="v">{summary.compliant}</div><div className="k">Compliant</div></div>
          <div className="stat-box" data-tone="amber"><div className="v">{summary.expiring}</div><div className="k">Expiring</div></div>
          <div className="stat-box" data-tone="red"><div className="v">{summary.blocked}</div><div className="k">Blocked</div></div>
        </div>
      )}

      {summary && summary.doubleBookings.length > 0 && (
        <div className="warn-banner">
          <div className="wt">⚠ {summary.doubleBookings.length} scheduling conflict{summary.doubleBookings.length > 1 ? 's' : ''}</div>
          {summary.doubleBookings.map((db, i) => (
            <div className="warn-item" key={i}>
              <strong>{db.staffName}</strong> is double-booked across <strong>{db.eventA}</strong> and <strong>{db.eventB}</strong>.
            </div>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="empty-state">No crew for this operator.</div>
      ) : (
        rows.map((r) => {
          const chip = r.status === 'compliant' ? 'chip-green' : r.status === 'expiring' ? 'chip-amber' : 'chip-red';
          return (
            <div className="comp-row" key={r.staffId}>
              <div>
                <div className="comp-name">{r.name}</div>
                <div className="comp-role">{r.role}</div>
              </div>
              <div>
                <span className={`chip ${r.rtw === 'Verified' ? 'chip-green' : 'chip-amber'}`}>RTW {r.rtw || 'Pending'}</span>
              </div>
              <div className="comp-issues">
                {r.issues.length === 0 && r.expiringSoon.length === 0 && <span className="muted">All clear</span>}
                {r.issues.map((iss, i) => <span key={i} className="bad">{iss}{i < r.issues.length - 1 ? ' · ' : ''}</span>)}
                {r.expiringSoon.map((c, i) => <span key={`e${i}`} className="warn">{r.issues.length ? ' · ' : ''}{c.type} expiring</span>)}
              </div>
              <span className={`chip ${chip}`}>{r.status}</span>
            </div>
          );
        })
      )}
    </div>
  );
}
