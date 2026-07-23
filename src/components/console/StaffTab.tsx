import { useMemo, useState } from 'react';
import type { OpsData } from '../../data/opsData';
import type { Staff } from '../../data/types';
import { sortStaff, type StaffSort } from '../../data/phase12';
import { personalRag } from '../../data/phase13';
import { unitColor } from './unitTheme';

interface Props { data: OpsData; clientId: string; }
const ROLES = ['Unit Manager', 'Bartender', 'Barista', 'Chef', 'Kitchen Assistant', 'Driver', 'General'];
const SORTS: { key: StaffSort; label: string }[] = [
  { key: 'staffNo', label: 'Staff #' },
  { key: 'name', label: 'Name' },
  { key: 'skill', label: 'Skill' },
];
const RAG_CHIP: Record<string, string> = { green: 'chip-green', amber: 'chip-amber', red: 'chip-red' };

/* The operational roster — one widget per crew member; clicking a card
   opens their full Staff Hub profile (sketch notes §8). */
export function StaffTab({ data, clientId }: Props) {
  const [sortBy, setSortBy] = useState<StaffSort>('staffNo');
  const staff = useMemo(
    () => sortStaff(data.staffForClient(clientId), sortBy),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.meta().updatedAt, clientId, sortBy]
  );
  const [editing, setEditing] = useState<Partial<Staff> | null>(null);

  async function save(s: Partial<Staff>) { await data.save('staff', s); setEditing(null); }
  async function del(id: string) {
    if (confirm('Delete this staff member and their assignments?')) await data.remove('staff', id);
  }

  return (
    <div>
      <div className="toolbar">
        <h2>Staff <span className="mono" style={{ fontSize: 14, color: 'var(--neon-green)', textShadow: '0 0 10px color-mix(in oklch, var(--neon-green) 45%, transparent)' }}>· {staff.length}</span></h2>
        <div className="row-inline">
          <div className="segmented">
            {SORTS.map((s) => (
              <button key={s.key} aria-pressed={sortBy === s.key} onClick={() => setSortBy(s.key)}>{s.label}</button>
            ))}
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setEditing({ clientId, role: 'Bartender', rtw: 'Pending', rate: 12 })}>+ New staff</button>
        </div>
      </div>

      {staff.length === 0 ? (
        <div className="empty-state">No crew yet. Add your first staff member.</div>
      ) : (
        <div className="unit-grid">
          {staff.map((s) => {
            const skills = data.skillsOf(s);
            const rag = personalRag(data, s);
            const col = unitColor(skills[0]);
            return (
              <div className="unit-card" key={s.id} style={{ ['--uc' as string]: col }}>
                <div className="ev-head">
                  <a href={`#/staff/${s.id}`} className="unit-name" style={{ marginTop: 0, fontSize: 15, color: 'inherit', textDecoration: 'none' }}>
                    {s.name}
                  </a>
                  <span className={`chip ${RAG_CHIP[rag.rag]}`} style={{ marginLeft: 'auto' }}>{rag.rag === 'green' ? 'clear' : `${rag.problems} item${rag.problems !== 1 ? 's' : ''}`}</span>
                </div>
                <div className="unit-desc">
                  {s.staffNo ? <span className="mono">#{s.staffNo} · </span> : null}{s.role} · £{Number(s.rate || 0).toFixed(2)}/hr
                </div>
                <div className="row-inline" style={{ marginTop: 10, flexWrap: 'wrap', gap: 6 }}>
                  {skills.map((sk) => (
                    <span key={sk} className="chip" style={{ color: unitColor(sk), fontSize: 10 }}>{sk}</span>
                  ))}
                  {s.canTow && <span className="chip chip-blue" style={{ fontSize: 10 }}>TOW</span>}
                  <button
                    className={`chip ${s.rtw === 'Verified' ? 'chip-green' : 'chip-amber'}`}
                    style={{ fontSize: 10, cursor: 'pointer', font: 'inherit' }}
                    onClick={() => data.save('staff', { id: s.id, rtw: s.rtw === 'Verified' ? 'Pending' : 'Verified' })}
                    title="Toggle right-to-work"
                  >RTW {s.rtw}</button>
                </div>
                <div className="row-inline" style={{ marginTop: 12 }}>
                  <a className="btn btn-primary btn-sm" href={`#/staff/${s.id}`} style={{ textDecoration: 'none' }}>Open profile</a>
                  <span style={{ flex: 1 }} />
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditing(s)}>Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={() => del(s.id)}>Del</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && <StaffEditor value={editing} onCancel={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

function StaffEditor({ value, onCancel, onSave }: {
  value: Partial<Staff>; onCancel: () => void; onSave: (s: Partial<Staff>) => void;
}) {
  const [s, setS] = useState<Partial<Staff>>({ ...value });
  const set = (k: keyof Staff, v: unknown) => setS((p) => ({ ...p, [k]: v }));
  return (
    <div className="card" style={{ marginTop: 18 }}>
      <div className="card-head"><div className="card-title">{s.id ? 'Edit staff' : 'New staff'}</div></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <label>Staff #<input className="inp" placeholder="001" value={s.staffNo || ''} onChange={(e) => set('staffNo', e.target.value)} /></label>
        <label>Name<input className="inp" value={s.name || ''} onChange={(e) => set('name', e.target.value)} /></label>
        <label>Role
          <select className="sel" value={s.role || 'Bartender'} onChange={(e) => set('role', e.target.value)}>
            {ROLES.map((r) => <option key={r}>{r}</option>)}
          </select>
        </label>
        <label>Phone<input className="inp" placeholder="447700900000" value={s.phone || ''} onChange={(e) => set('phone', e.target.value)} /></label>
        <label>Rate £/hr<input className="inp" type="number" step="0.5" value={s.rate ?? 12} onChange={(e) => set('rate', Number(e.target.value))} /></label>
        <label>RTW
          <select className="sel" value={s.rtw || 'Pending'} onChange={(e) => set('rtw', e.target.value as Staff['rtw'])}>
            <option>Pending</option><option>Verified</option>
          </select>
        </label>
        <label className="row-inline" style={{ alignItems: 'center', marginTop: 22 }}>
          <input type="checkbox" checked={!!s.canTow} onChange={(e) => set('canTow', e.target.checked)} /> Can tow
        </label>
      </div>
      <div className="row-inline" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" onClick={() => onSave(s)} disabled={!s.name}>Save staff</button>
      </div>
    </div>
  );
}
