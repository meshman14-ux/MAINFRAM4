/* Team — the people directory across every operator. Search + role filter,
   one card per person: role, operator, contact, compliance RAG and the units
   they can work. Deep-links to Staff Hub and unit dashboards. */
import { useMemo, useState } from 'react';
import { useOpsData } from '../data/useOpsData';
import type { Client, Staff, Unit } from '../data/types';
import { personalRag } from '../data/phase13';

const RAG_CHIP: Record<string, string> = { green: 'chip-green', amber: 'chip-amber', red: 'chip-red' };

export default function Team() {
  const { data, ready, error } = useOpsData();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('All');

  const people = useMemo(() => {
    if (!ready) return [];
    return data.all<Staff>('staff').map((s) => ({
      s,
      client: s.clientId ? data.get<Client>('clients', s.clientId) : null,
      rag: personalRag(data, s),
      units: data.all<Unit>('units').filter((u) => u.clientId === s.clientId && (u.pool || []).includes(s.id)),
    })).sort((a, b) => a.s.name.localeCompare(b.s.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, data.meta().updatedAt]);

  const roles = useMemo(() => ['All', ...new Set(people.map((p) => p.s.role).filter(Boolean))], [people]);
  const needle = q.trim().toLowerCase();
  const visible = people.filter((p) =>
    (role === 'All' || p.s.role === role) &&
    (!needle || p.s.name.toLowerCase().includes(needle) || (p.client?.name || '').toLowerCase().includes(needle) || (p.s.role || '').toLowerCase().includes(needle))
  );

  if (error) return <div className="p4"><div className="banner">Couldn't load data: {error}</div></div>;
  if (!ready) return <div className="state"><div><div className="spinner" /><div className="eyebrow">Loading team</div></div></div>;

  return (
    <div className="p4">
      <div className="toolbar">
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>Team</h2>
        <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{visible.length} of {people.length} people</span>
        <span style={{ flex: 1 }} />
        <input className="inp" placeholder="Search people / operators / roles" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 260 }} aria-label="Search team" />
        <select className="sel" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role filter">
          {roles.map((r) => <option key={r}>{r}</option>)}
        </select>
      </div>

      {visible.length === 0 ? (
        <div className="empty-state">No people match.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 14 }}>
          {visible.map(({ s, client, rag, units }) => (
            <div key={s.id} className="card" style={{ borderTop: `2px solid var(--${rag.rag === 'green' ? 'ok' : rag.rag === 'amber' ? 'warn' : 'danger'})` }}>
              <div className="row-inline" style={{ alignItems: 'baseline' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 15.5, fontWeight: 700 }}>{s.name}</span>
                <span className={`chip ${RAG_CHIP[rag.rag] || 'chip-blue'}`} style={{ marginLeft: 'auto' }}>{rag.rag === 'green' ? 'compliant' : rag.rag === 'amber' ? 'expiring' : 'blocked'}</span>
              </div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{s.role || '—'}{s.staffNo ? <span className="mono"> · {s.staffNo}</span> : null}</div>
              <div className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 6 }}>
                {client?.name || 'Unattached'}{s.phone ? ` · ${s.phone}` : ''}
              </div>
              {units.length > 0 && (
                <div className="row-inline" style={{ flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                  {units.slice(0, 4).map((u) => (
                    <a key={u.id} className="chip" href={`#/unit/${u.id}`} style={{ textDecoration: 'none' }}>{u.code}</a>
                  ))}
                  {units.length > 4 && <span className="muted" style={{ fontSize: 11 }}>+{units.length - 4}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
