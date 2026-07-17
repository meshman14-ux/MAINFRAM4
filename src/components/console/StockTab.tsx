import { useMemo } from 'react';
import type { OpsData } from '../../data/opsData';
import type { Unit, StockLine } from '../../data/types';

interface Props { data: OpsData; clientId: string; }

export function StockTab({ data, clientId }: Props) {
  const units = useMemo(
    () => data.unitsForClient(clientId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.meta().updatedAt, clientId]
  );

  const lowCount = useMemo(
    () => data.lowStockForClient(clientId).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.meta().updatedAt, clientId]
  );

  function exportOrder() {
    const low = data.lowStockForClient(clientId);
    const rows = low.map((s) => {
      const u = data.get<Unit>('units', s.unitId);
      return [u?.code || '', s.item, String(s.par - s.qty), s.unit || ''];
    });
    const csv = ['Unit,Item,Order qty,UoM', ...rows.map((r) => r.join(','))].join('\n');
    const b = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(b);
    const a = document.createElement('a'); a.href = url; a.download = `${clientId}-reorder.csv`;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 120);
  }

  async function setQty(line: StockLine, qty: number) {
    await data.save('stock', { id: line.id, qty });
  }

  if (units.length === 0) {
    return <div className="empty-state">No units yet — add units first, then track their stock.</div>;
  }

  return (
    <div>
      <div className="toolbar">
        <h2>Stock <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>· {lowCount} below par</span></h2>
        <button className="btn btn-sm" onClick={exportOrder} disabled={lowCount === 0}>Export reorder .csv</button>
      </div>

      {units.map((u) => {
        const lines = data.stockForUnit(u.id);
        return (
          <div key={u.id} style={{ marginBottom: 22 }}>
            <div className="mono" style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 8, letterSpacing: '0.08em' }}>
              {u.code} · {u.name} · {data.areaOfUnit(u)}
            </div>
            {lines.length === 0 ? (
              <div className="muted" style={{ fontSize: 13 }}>No stock lines.</div>
            ) : (
              <table className="tbl">
                <thead><tr><th>Item</th><th>On hand</th><th>Par</th><th>UoM</th><th>Status</th></tr></thead>
                <tbody>
                  {lines.map((s) => {
                    const low = Number(s.qty) < Number(s.par);
                    return (
                      <tr key={s.id}>
                        <td>{s.item}</td>
                        <td style={{ width: 120 }}>
                          <input
                            className="inp num" type="number" min={0} value={s.qty}
                            style={{ width: 90, padding: '5px 8px' }}
                            onChange={(e) => setQty(s, Number(e.target.value))}
                          />
                        </td>
                        <td className="num">{s.par}</td>
                        <td className="muted">{s.unit}</td>
                        <td>{low ? <span className="chip chip-amber">below par</span> : <span className="chip chip-green">ok</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}
