import { useMemo, useState } from 'react';
import type { OpsData } from '../../data/opsData';
import type { Unit, StockLine, ChecklistItem } from '../../data/types';
import { unitColor } from './unitTheme';

interface Props { data: OpsData; clientId: string; }
const TYPES = ['Bar', 'Coffee', 'Food', 'Cocktail', 'Catering', 'Support'];

/* Structured operational details, kept per unit in kv 'unitDetails'
   ({ "<unitId>": { staffing, equipment, hygiene, operational } }) so
   free-text notes sync without touching the units table shape. */
interface UnitDetail {
  staffing?: string;
  equipment?: string;
  hygiene?: string;
  operational?: string;
}
type UnitDetails = Record<string, UnitDetail>;

const DETAIL_FIELDS: { key: keyof UnitDetail; label: string; hint: string }[] = [
  { key: 'staffing',    label: 'Staffing',            hint: 'Roles, shift pattern, who leads the unit' },
  { key: 'equipment',   label: 'Equipment',           hint: 'What travels with the unit, power / gas needs' },
  { key: 'hygiene',     label: 'Hygiene notes',       hint: 'Cleaning schedule, temp checks, allergen handling' },
  { key: 'operational', label: 'Operational details', hint: 'Set-up order, trading quirks, close-down routine' },
];

const CATS: ChecklistItem['cat'][] = ['Equipment', 'Safety', 'Consumables', 'Documentation', 'Tools'];

/* Starter checklist per unit type — seeded on demand, then fully editable. */
function defaultChecklistFor(type: string): ChecklistItem[] {
  const rows: [ChecklistItem['cat'], string][] =
    type === 'Bar' ? [
      ['Equipment', 'Taps & lines cleaned'], ['Equipment', 'Glass washer working'],
      ['Consumables', 'CO₂ / gas connected'], ['Safety', 'Fire extinguisher in date'],
      ['Documentation', 'Personal licence on file'], ['Tools', 'Bar keys packed'],
    ] : type === 'Coffee' ? [
      ['Equipment', 'Machine serviced & descaled'], ['Equipment', 'Grinder dialled in'],
      ['Consumables', 'Water containers filled'], ['Safety', 'LPG certificate in date'],
      ['Documentation', 'Hygiene rating displayed'],
    ] : type === 'Food' || type === 'Catering' ? [
      ['Equipment', 'Fridges holding temp'], ['Tools', 'Temp probe calibrated'],
      ['Consumables', 'Probe wipes stocked'], ['Safety', 'Fire blanket present'],
      ['Safety', 'First aid kit stocked'], ['Documentation', 'Allergen matrix printed'],
    ] : type === 'Cocktail' ? [
      ['Equipment', 'Shakers & strainers packed'], ['Equipment', 'Ice wells sanitised'],
      ['Consumables', 'Garnish prep done'], ['Documentation', 'Spirits licence on file'],
    ] : [
      ['Equipment', 'Generator fuelled'], ['Tools', 'Tool kit checked'],
      ['Safety', 'Hi-vis & PPE packed'],
    ];
  return rows.map(([cat, item], i) => ({ id: `c-${type}-${i}`, cat, item, on: false }));
}

export function UnitsTab({ data, clientId }: Props) {
  const units = useMemo(
    () => data.unitsForClient(clientId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.meta().updatedAt, clientId]
  );
  const details = useMemo(
    () => data.kvGet<UnitDetails>('unitDetails') || {},
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.meta().updatedAt]
  );
  const [editing, setEditing] = useState<Partial<Unit> | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

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
    if (confirm('Delete this unit, its stock and assignments?')) {
      if (openId === id) setOpenId(null);
      await data.remove('units', id);
    }
  }

  const open = openId ? units.find((u) => u.id === openId) || null : null;

  return (
    <div>
      <div className="toolbar">
        <h2>Units</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing({ clientId, type: 'Bar', crew: 2 })}>+ New unit</button>
      </div>

      {units.length === 0 ? (
        <div className="empty-state">No units yet. Add a bar, coffee cart, food or cocktail unit.</div>
      ) : (
        <div className="unit-grid">
          {units.map((u) => {
            const col = unitColor(u.type);
            const cl = u.checklist || [];
            const done = cl.filter((c) => c.on).length;
            return (
              <div className="unit-card" key={u.id} style={{ ['--uc' as string]: col }}>
                <div className="ev-head">
                  <span className="ev-swatch" style={{ color: col }} />
                  <span className="chip unit-type-chip">{u.type}</span>
                  <span className="mono" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-3)' }}>{u.code}</span>
                </div>
                <div className="unit-name">{u.name}</div>
                {u.desc && <div className="unit-desc">{u.desc}</div>}
                <div className="ev-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                  <div className="ev-field">
                    <div className="ev-label">Crew</div>
                    <div className="fv mono">{u.crew}</div>
                  </div>
                  <div className="ev-field">
                    <div className="ev-label">Area</div>
                    <div className="fv">{data.areaOfUnit(u)}</div>
                  </div>
                  <div className="ev-field">
                    <div className="ev-label">Stock</div>
                    <div className="fv mono">{data.stockForUnit(u.id).length}</div>
                  </div>
                </div>
                <div className="unit-check">
                  <div className="unit-check-bar">
                    <div style={{ width: cl.length ? `${(done / cl.length) * 100}%` : 0 }} />
                  </div>
                  <span className="mono">{cl.length ? `${done}/${cl.length} checks` : 'no checklist'}</span>
                </div>
                <div className="row-inline" style={{ marginTop: 12 }}>
                  <button className="btn btn-primary btn-sm" onClick={() => setOpenId(openId === u.id ? null : u.id)}>
                    {openId === u.id ? 'Close details' : 'Add details'}
                  </button>
                  <span style={{ flex: 1 }} />
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditing(u)}>Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={() => del(u.id)}>Del</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {open && (
        <UnitDetailsEditor
          key={open.id}
          data={data}
          unit={open}
          detail={details[open.id] || {}}
          onClose={() => setOpenId(null)}
        />
      )}

      {editing && (
        <UnitEditor value={editing} onCancel={() => setEditing(null)} onSave={save} />
      )}
    </div>
  );
}

/* "Add details" page: structured notes + the unit's operational checklist. */
function UnitDetailsEditor({ data, unit, detail, onClose }: {
  data: OpsData; unit: Unit; detail: UnitDetail; onClose: () => void;
}) {
  const col = unitColor(unit.type);
  const [d, setD] = useState<UnitDetail>({ ...detail });
  const [newItem, setNewItem] = useState('');
  const [newCat, setNewCat] = useState<ChecklistItem['cat']>('Equipment');
  const cl = unit.checklist || [];

  async function saveNotes() {
    const cur = data.kvGet<UnitDetails>('unitDetails') || {};
    await data.kvSet('unitDetails', { ...cur, [unit.id]: d });
  }
  async function setChecklist(next: ChecklistItem[]) {
    await data.save('units', { id: unit.id, checklist: next } as Partial<Unit>);
  }
  async function toggle(id: string) {
    await setChecklist(cl.map((c) => (c.id === id ? { ...c, on: !c.on } : c)));
  }
  async function addItem() {
    if (!newItem.trim()) return;
    const item: ChecklistItem = { id: `c${Date.now().toString(36)}`, cat: newCat, item: newItem.trim(), on: false };
    setNewItem('');
    await setChecklist([...cl, item]);
  }

  const byCat = CATS.map((cat) => ({ cat, items: cl.filter((c) => c.cat === cat) })).filter((g) => g.items.length);

  return (
    <div className="unit-card unit-details" style={{ ['--uc' as string]: col, marginTop: 18 }}>
      <div className="ev-head">
        <span className="ev-swatch" style={{ color: col }} />
        <span className="ev-name">{unit.name}</span>
        <span className="chip unit-type-chip">{unit.type}</span>
        <span className="row-inline" style={{ marginLeft: 'auto' }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </span>
      </div>

      <div className="ud-grid">
        {DETAIL_FIELDS.map((f) => (
          <label key={f.key}>
            {f.label}
            <textarea
              className="inp ud-text"
              rows={3}
              placeholder={f.hint}
              value={d[f.key] || ''}
              onChange={(e) => setD((p) => ({ ...p, [f.key]: e.target.value }))}
              onBlur={saveNotes}
            />
          </label>
        ))}
      </div>

      <div className="toolbar" style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 15 }}>Checklist</h2>
        {cl.length === 0 && (
          <button className="btn btn-sm" onClick={() => setChecklist(defaultChecklistFor(unit.type))}>
            Seed default {unit.type} checklist
          </button>
        )}
      </div>
      {byCat.map((g) => (
        <div key={g.cat} style={{ marginBottom: 10 }}>
          <div className="ev-label" style={{ marginBottom: 5 }}>{g.cat}</div>
          {g.items.map((c) => (
            <div className="ud-item" key={c.id} data-on={c.on}>
              <button className="ud-tick" aria-label={`Toggle ${c.item}`} aria-pressed={c.on} onClick={() => toggle(c.id)}>
                {c.on ? '✓' : ''}
              </button>
              <span className="ud-label">{c.item}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setChecklist(cl.filter((x) => x.id !== c.id))}>×</button>
            </div>
          ))}
        </div>
      ))}
      <div className="row-inline" style={{ marginTop: 10 }}>
        <select className="sel" style={{ width: 'auto' }} value={newCat} onChange={(e) => setNewCat(e.target.value as ChecklistItem['cat'])}>
          {CATS.map((c) => <option key={c}>{c}</option>)}
        </select>
        <input
          className="inp"
          placeholder="Add checklist item"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addItem(); }}
        />
        <button className="btn btn-primary btn-sm" onClick={addItem} disabled={!newItem.trim()}>Add</button>
      </div>
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
