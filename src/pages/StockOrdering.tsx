import { useMemo, useState } from 'react';
import { useOpsData } from '../data/useOpsData';
import type { Client, Unit, ShoppingItem, StockLine } from '../data/types';
import { reorderForClient, reorderCsv, type OrderLine } from '../data/phase6';
import { generateResearch } from '../data/phase12';
import { unitColor } from '../components/console/unitTheme';

const STOCK_CATEGORIES = ['Drink', 'Food', 'Consumables', 'Equipment', 'Cleaning', 'General'];

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
                  <a className="mono" href={`#/unit/${unitId}`} style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}>{lines[0].unitCode} ↗</a>
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

      <ShoppingListBuilder data={data} clientId={activeId} />
    </div>
  );
}

/* "Add New Stock" — a per-unit purchasing checklist. Build the list (by hand
   or from the research generator's suggestions for the unit's purpose), tick
   items off as bought, then promote ticked items into real stock lines. */
function ShoppingListBuilder({ data, clientId }: { data: ReturnType<typeof useOpsData>['data']; clientId: string }) {
  const units = data.unitsForClient(clientId);
  const [unitId, setUnitId] = useState('');
  const activeUnit = units.find((u) => u.id === (unitId || units[0]?.id)) || null;
  const [item, setItem] = useState('');
  const [qty, setQty] = useState('1');
  const [cat, setCat] = useState('General');

  const list = useMemo(
    () => (activeUnit ? data.all<ShoppingItem>('shoppingLists').filter((s) => s.unitId === activeUnit.id) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeUnit?.id, data.meta().updatedAt]
  );

  if (!activeUnit) return null;
  const col = unitColor(activeUnit.type);
  const research = generateResearch(activeUnit.type);
  const have = new Set(list.map((s) => s.item.toLowerCase()));
  const suggestions = research.stock.filter((s) => !have.has(s.toLowerCase()));
  const ticked = list.filter((s) => s.done);

  async function add(name: string, n = Number(qty) || 1, category = cat) {
    if (!name.trim() || !activeUnit) return;
    await data.save('shoppingLists', {
      unitId: activeUnit.id, item: name.trim(), qty: n, category, done: false,
    } as Partial<ShoppingItem>);
    setItem('');
  }

  /** Promote ticked items into real stock lines (par = bought qty) and clear them. */
  async function moveToStock() {
    if (!activeUnit) return;
    const existing = data.stockForUnit(activeUnit.id);
    for (const s of ticked) {
      const line = existing.find((x) => x.item.toLowerCase() === s.item.toLowerCase());
      if (line) {
        await data.save('stock', { id: line.id, qty: line.qty + s.qty, category: s.category ?? line.category } as Partial<StockLine>);
      } else {
        await data.save('stock', {
          unitId: activeUnit.id, item: s.item, qty: s.qty, par: s.qty,
          unit: s.unit, category: s.category,
        } as Partial<StockLine>);
      }
      await data.remove('shoppingLists', s.id);
    }
  }

  return (
    <div className="unit-card unit-details" style={{ ['--uc' as string]: col, marginTop: 22 }}>
      <div className="ev-head">
        <span className="ev-swatch" style={{ color: col }} />
        <span className="unit-name" style={{ marginTop: 0 }}>Shopping list</span>
        <select className="sel" style={{ width: 'auto', marginLeft: 'auto' }} value={activeUnit.id} onChange={(e) => setUnitId(e.target.value)} aria-label="Unit">
          {units.map((u) => <option key={u.id} value={u.id}>{u.code} · {u.name}</option>)}
        </select>
      </div>

      {list.length === 0 ? (
        <div className="muted" style={{ fontSize: 13, marginTop: 10 }}>Nothing on the list — add items below or pull suggestions for a {activeUnit.type.toLowerCase()} unit.</div>
      ) : (
        <div style={{ marginTop: 10 }}>
          {list.map((s) => (
            <div className="ud-item" key={s.id} data-on={s.done}>
              <button className="ud-tick" aria-pressed={s.done} aria-label={`Toggle ${s.item}`}
                onClick={() => data.save('shoppingLists', { id: s.id, done: !s.done } as Partial<ShoppingItem>)}>
                {s.done ? '✓' : ''}
              </button>
              <span className="ud-label">{s.item}</span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>×{s.qty}{s.category ? ` · ${s.category}` : ''}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => data.remove('shoppingLists', s.id)}>✕</button>
            </div>
          ))}
        </div>
      )}

      <div className="row-inline" style={{ marginTop: 12, flexWrap: 'wrap' }}>
        <input className="inp" style={{ flex: 1, minWidth: 140 }} placeholder="Add item"
          value={item} onChange={(e) => setItem(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(item); }} />
        <input className="inp" style={{ width: 64 }} type="number" min={1} aria-label="Qty" value={qty} onChange={(e) => setQty(e.target.value)} />
        <select className="sel" style={{ width: 'auto' }} value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
          {STOCK_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <button className="btn btn-primary btn-sm" onClick={() => add(item)} disabled={!item.trim()}>Add</button>
        {ticked.length > 0 && (
          <button className="btn btn-sm btn-confirm" onClick={moveToStock}>Move {ticked.length} ticked → stock</button>
        )}
      </div>

      {suggestions.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="ev-label" style={{ marginBottom: 6 }}>Suggested for a {activeUnit.type} unit</div>
          <div className="row-inline" style={{ flexWrap: 'wrap', gap: 6 }}>
            {suggestions.map((s) => (
              <button key={s} className="chip unit-type-chip" style={{ cursor: 'pointer', font: 'inherit', fontSize: 11 }}
                onClick={() => add(s, 1, 'General')} title="Add to list">
                + {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
