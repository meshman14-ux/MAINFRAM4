import { useMemo, useState } from 'react';
import { useOpsData } from '../data/useOpsData';
import type { Client } from '../data/types';
import { reorderForClient, reorderCsv } from '../data/phase6';

export default function StockOrdering() {
  const { data, ready, error } = useOpsData();
  const [clientId, setClientId] = useState('');

  const clients = useMemo(
    () => (ready ? data.all<Client>('clients') : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, data.meta().updatedAt]
  );
  const activeId = clientId || clients[0]?.id || '';

  const order = useMemo(
    () => (activeId ? reorderForClient(data, activeId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeId, data.meta().updatedAt]
  );

  if (error) return <div className="p4"><div className="banner">Couldn't load data: {error}</div></div>;
  if (!ready) return <div className="state"><div><div className="spinner" /><div className="eyebrow">Loading stock</div></div></div>;
  if (clients.length === 0) return <div className="p4"><div className="empty-state">No operators yet.</div></div>;

  function exportCsv() {
    const csv = reorderCsv(order);
    const b = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(b);
    const a = document.createElement('a'); a.href = url; a.download = `${activeId}-reorder.csv`;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 120);
  }

  return (
    <div className="p4">
      <div className="client-bar">
        <select className="client-select" value={activeId} onChange={(e) => setClientId(e.target.value)} aria-label="Operator">
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <span className="client-meta">Consolidated reorder across all units</span>
      </div>

      <div className="toolbar">
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>
          Reorder list <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>· {order.length} line{order.length !== 1 ? 's' : ''} below par</span>
        </h2>
        <button className="btn btn-primary btn-sm" onClick={exportCsv} disabled={order.length === 0}>Export .csv</button>
      </div>

      {order.length === 0 ? (
        <div className="empty-state">Everything is at or above par — nothing to reorder.</div>
      ) : (
        <table className="fin-table">
          <thead>
            <tr><th>Unit</th><th>Item</th><th style={{ textAlign: 'right' }}>On hand</th><th style={{ textAlign: 'right' }}>Par</th><th style={{ textAlign: 'right' }}>Order</th><th>UoM</th></tr>
          </thead>
          <tbody>
            {order.map((l, i) => (
              <tr key={`${l.unitId}-${i}`}>
                <td className="mono" style={{ fontSize: 12 }}>{l.unitCode}</td>
                <td>{l.item}</td>
                <td className="num">{l.onHand}</td>
                <td className="num">{l.par}</td>
                <td className="num" style={{ color: 'var(--amber)' }}>{l.orderQty}</td>
                <td className="muted">{l.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
