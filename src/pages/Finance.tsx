import { useMemo, useState } from 'react';
import { useOpsData } from '../data/useOpsData';
import type { Client } from '../data/types';
import { clientFinance } from '../data/phase6';

const fmt = (iso?: string) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
const gbp = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export default function Finance() {
  const { data, ready, error } = useOpsData();
  const [clientId, setClientId] = useState('');

  const clients = useMemo(
    () => (ready ? data.all<Client>('clients') : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, data.meta().updatedAt]
  );
  const activeId = clientId || clients[0]?.id || '';

  const fin = useMemo(
    () => (activeId ? clientFinance(data, activeId) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeId, data.meta().updatedAt]
  );

  if (error) return <div className="p4"><div className="banner">Couldn't load data: {error}</div></div>;
  if (!ready) return <div className="state"><div><div className="spinner" /><div className="eyebrow">Loading finance</div></div></div>;
  if (clients.length === 0) return <div className="p4"><div className="empty-state">No operators yet.</div></div>;

  return (
    <div className="p4">
      <div className="client-bar">
        <select className="client-select" value={activeId} onChange={(e) => setClientId(e.target.value)} aria-label="Operator">
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <span className="client-meta">Crew cost by event (confirmed crew × rate × trading hours)</span>
      </div>

      {fin && (
        <>
          <div className="stat-strip">
            <div className="stat-box"><div className="v">{gbp(fin.totalCrewCost)}</div><div className="k">Total crew cost</div></div>
            <div className="stat-box"><div className="v">{gbp(fin.upcomingCost)}</div><div className="k">Upcoming</div></div>
            <div className="stat-box"><div className="v">{fin.totalConfirmed}</div><div className="k">Confirmed shifts</div></div>
            <div className="stat-box"><div className="v">{fin.events.length}</div><div className="k">Events</div></div>
          </div>

          {fin.events.length === 0 ? (
            <div className="empty-state">No events yet.</div>
          ) : (
            <table className="fin-table">
              <thead>
                <tr>
                  <th>Event</th><th>Dates</th>
                  <th style={{ textAlign: 'right' }}>Trading hrs</th>
                  <th style={{ textAlign: 'right' }}>Confirmed</th>
                  <th style={{ textAlign: 'right' }}>Crew cost</th>
                </tr>
              </thead>
              <tbody>
                {fin.events.map((e) => (
                  <tr key={e.eventId}>
                    <td><span className="fin-swatch" style={{ background: e.color }} />{e.eventName}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{fmt(e.start)}{e.end && e.end !== e.start ? `–${fmt(e.end)}` : ''}</td>
                    <td className="num">{e.tradingHours}</td>
                    <td className="num">{e.confirmedCrew}</td>
                    <td className="num">{gbp(e.crewCost)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="fin-total" colSpan={4}>Total</td>
                  <td className="num fin-total">{gbp(fin.totalCrewCost)}</td>
                </tr>
              </tfoot>
            </table>
          )}
          <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
            Crew cost counts confirmed assignments only, at 8 trading hours per event day. Add day rates per staff member in the Ops Console.
          </p>
        </>
      )}
    </div>
  );
}
