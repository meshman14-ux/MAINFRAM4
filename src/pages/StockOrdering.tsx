import { useMemo, useState } from 'react';
import { useOpsData } from '../data/useOpsData';
import type { Client, Unit } from '../data/types';
import { reorderForClient, reorderCsv, type OrderLine } from '../data/phase6';
import { unitColor } from '../components/console/unitTheme';

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

  // One widget per unit that has lines below par, in unit-code order.
  const byUnit = useMemo(() => {
    const m = new Map<string, OrderLine[]>();
    for (const l of order) {
      if (!m.has(l.unitId)) m.set(l.unitId, []);
      m.get(l.unitId)!.push(l);
    }
    return [...m.entries()].sort((a, b) => (a[1][0].unitCode || '').localeCompare(b[1][0].unitCode || ''));
  }, [order]);

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

      <div className="kpi-row">
        <div className="kpi-chip"><div className="k">Lines below par</div><div className="v" style={{ color: order.length ? 'var(--neon-yellow)' : 'var(--ink-3)' }}>{order.length}</div></div>
        <div className="kpi-chip"><div className="k">Units affected</div><div className="v" style={{ color: byUnit.length ? 'var(--neon-pink)' : 'var(--ink-3)' }}>{byUnit.length}</div></div>
      </div>

      <div className="toolbar">
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>Reorder list</h2>
        <button className="btn btn-primary btn-sm" onClick={exportCsv} disabled={order.length === 0}>Export .csv</button>
      </div>

      {order.length === 0 ? (
        <div className="empty-state">Everything is at or above par — nothing to reorder.</div>
      ) : (
        <div className="unit-grid">
          {byUnit.map(([unitId, lines]) => {
            const unit = data.get<Unit>('units', unitId);
            const col = unitColor(unit?.type);
            return (
              <div className="unit-card" key={unitId} style={{ ['--uc' as string]: col }}>
                <div className="ev-head">
                  <span className="ev-swatch" style={{ color: col }} />
                  <span className="chip unit-type-chip">{unit?.type || 'Unit'}</span>
                  <span className="mono" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-3)' }}>{lines[0].unitCode}</span>
                </div>
                <div className="unit-name">{lines[0].unitName || lines[0].unitCode}</div>
                <div className="unit-desc">{lines.length} line{lines.length !== 1 ? 's' : ''} below par</div>
                <div style={{ marginTop: 10 }}>
                  {lines.map((l, i) => (
                    <div className="stock-line" key={i}>
                      <span className="stock-item">{l.item}</span>
                      <span className="mono stock-onhand">{l.onHand}/{l.par}</span>
                      <span className="mono stock-order">+{l.orderQty} {l.unit || ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
