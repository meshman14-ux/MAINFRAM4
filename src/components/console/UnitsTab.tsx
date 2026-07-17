import { useMemo, useState } from 'react';
import type { OpsData } from '../../data/opsData';
import type { Unit, StockLine } from '../../data/types';

interface Props { data: OpsData; clientId: string; }
const TYPES = ['Bar', 'Coffee', 'Food', 'Catering', 'Support'];

export function UnitsTab({ data, clientId }: Props) {
  const units = useMemo(
    () => data.unitsForClient(clientId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.meta().updatedAt, clientId]
  );
  const [editing, setEditing] = useState<Partial<Unit> | null>(null);

  async function save(u: Partial<Unit>) {
    const isNew = !u.id;
    const saved = await data.save('units', u);
    // On create, seed the default stock catalogue for the unit type.
    if (isNew && saved.id) {
      const cat = data.defaultStockFor(saved.type || 'Support');
      for (const line of cat) {
        await data.save<Partial<StockLine>>('stock', { unitId: saved.id, ...line });
      }
    }
    setEditing(null);
  }
  async function del(id: string) {
    if (confirm('Delete this unit, its stock and assignments?')) await data.remove('units', id);
  }

  return (
    <div>
      <div className="toolbar">
        <h2>Units</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing({ clientId, type: 'Bar', crew: 2 })}>+ New unit</button>
      </div>

      {units.length === 0 ? (
        <div className="empty-state">No units yet. Add a bar, coffee cart, food or catering unit.</div>
      ) : (
        <table className="tbl">
          <thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Area</th><th>Crew target</th><th>Stock lines</th><th></th></tr></thead>
          <tbody>
            {units.map((u) => (
              <tr key={u.id}>
                <td className="num">{u.code}</td>
                <td>{u.name}</td>
                <td>{u.type}</td>
                <td><span className="chip chip-blue">{data.areaOfUnit(u)}</span></td>
                <td className="num">{u.crew}</td>
                <td className="num">{data.stockForUnit(u.id).length}</td>
                <td>
                  <div className="row-inline">
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing(u)}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={() => del(u.id)}>Del</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <UnitEditor value={editing} onCancel={() => setEditing(null)} onSave={save} />
      )}
    </div>
  );
}

function UnitEditor({ value, onCancel, onSave }: {
  value: Partial<Unit>; onCancel: () => void; onSave: (u: Partial<Unit>) => void;
}) {
  const [u, setU] = useState<Partial<Unit>>({ ...value });
  const set = (k: keyof Unit, v: unknown) => setU((p) => ({ ...p, [k]: v }));
  return (
    <div className="card" style={{ marginTop: 18 }}>
      <div className="card-head"><div className="card-title">{u.id ? 'Edit unit' : 'New unit'}</div></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <label>Code<input className="inp" placeholder="BAR-01" value={u.code || ''} onChange={(e) => set('code', e.target.value)} /></label>
        <label>Name<input className="inp" value={u.name || ''} onChange={(e) => set('name', e.target.value)} /></label>
        <label>Type
          <select className="sel" value={u.type || 'Bar'} onChange={(e) => set('type', e.target.value)}>
            {TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label>Crew target<input className="inp" type="number" min={0} value={u.crew ?? 0} onChange={(e) => set('crew', Number(e.target.value))} /></label>
        <label style={{ gridColumn: 'span 2' }}>Description<input className="inp" value={u.desc || ''} onChange={(e) => set('desc', e.target.value)} /></label>
      </div>
      {!u.id && <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Creating a unit seeds the default stock catalogue for its type.</p>}
      <div className="row-inline" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" onClick={() => onSave(u)} disabled={!u.code || !u.name}>Save unit</button>
      </div>
    </div>
  );
}
