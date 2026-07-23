import { useMemo, useState } from 'react';
import { useOpsData } from '../data/useOpsData';
import type { Client, DocumentRec, DocType, Unit, Staff } from '../data/types';
import { DOC_TYPES } from '../data/types';
import { complianceSummary } from '../data/phase6';
import { docState, generateResearch } from '../data/phase12';
import { personalRag, unitCompliance, complianceRollup, type Rag } from '../data/phase13';
import { unitColor } from '../components/console/unitTheme';

/* RAG hue — drives each card's glow. */
const RAG_COLOR: Record<Rag, string> = {
  green: 'var(--neon-green)', amber: 'var(--neon-yellow)', red: 'var(--neon-pink)',
};
const RAG_CHIP: Record<Rag, string> = { green: 'chip-green', amber: 'chip-amber', red: 'chip-red' };
const ITEM_CHIP: Record<string, string> = {
  ok: 'chip-green', expiring: 'chip-amber', expired: 'chip-red', missing: 'chip-red',
};

export default function Compliance() {
  const { data, ready, error } = useOpsData();
  const [clientId, setClientId] = useState('');

  const clients = useMemo(
    () => (ready ? data.all<Client>('clients') : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, data.meta().updatedAt]
  );
  const activeId = clientId || clients[0]?.id || '';

  const crew = useMemo(
    () => (activeId ? data.staffForClient(activeId).map((s) => ({ staff: s, rag: personalRag(data, s) })) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeId, data.meta().updatedAt]
  );
  const unitsComp = useMemo(
    () => (activeId ? data.unitsForClient(activeId).map(unitCompliance) : []),
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
        <div className="kpi-row">
          <div className="kpi-chip"><div className="k">Crew</div><div className="v" style={{ color: 'var(--ink)' }}>{summary.total}</div></div>
          <div className="kpi-chip"><div className="k">Compliant</div><div className="v" style={{ color: 'var(--neon-green)' }}>{summary.compliant}</div></div>
          <div className="kpi-chip"><div className="k">Expiring</div><div className="v" style={{ color: summary.expiring ? 'var(--neon-yellow)' : 'var(--ink-3)' }}>{summary.expiring}</div></div>
          <div className="kpi-chip"><div className="k">Blocked</div><div className="v" style={{ color: summary.blocked ? 'var(--neon-pink)' : 'var(--ink-3)' }}>{summary.blocked}</div></div>
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

      {/* Level 1 — per-unit operational compliance */}
      <div className="toolbar" style={{ marginTop: 6 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>Unit compliance (operational)</h2>
      </div>
      {unitsComp.length === 0 ? (
        <div className="empty-state">No units for this operator.</div>
      ) : (
        <div className="unit-grid" style={{ marginBottom: 24 }}>
          {unitsComp.map(({ unit, total, done, requiredOpen, rag, open }) => (
            <div className="unit-card" key={unit.id} style={{ ['--uc' as string]: unitColor(unit.type) }}>
              <div className="ev-head">
                <span className="ev-swatch" style={{ color: unitColor(unit.type) }} />
                <span className="unit-name" style={{ marginTop: 0, fontSize: 15 }}>{unit.code} · {unit.name}</span>
                <span className={`chip ${RAG_CHIP[rag]}`} style={{ marginLeft: 'auto' }}>
                  {rag === 'red' ? `${requiredOpen} required open` : rag === 'amber' ? `${open.length} open` : total ? 'clear' : 'no checks'}
                </span>
              </div>
              <div className="unit-check">
                <div className="unit-check-bar"><div style={{ width: total ? `${(done / total) * 100}%` : 0 }} /></div>
                <span className="mono">{done}/{total} safety & docs</span>
              </div>
              {open.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  {open.map((c) => (
                    <div className="comp-issues" key={c.id} title={c.how ? `How to comply: ${c.how}` : undefined} style={{ fontSize: 12.5, padding: '3px 0' }}>
                      <span className={c.required ? 'bad' : 'warn'}>○ {c.item}</span>
                      {c.desc && <span className="muted"> — {c.desc}</span>}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 10 }}>
                <a className="btn btn-ghost btn-sm" href={`#/console/${unit.clientId}`} style={{ textDecoration: 'none' }}>Open unit checklist →</a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Level 2 — per-employee personal compliance (RAG) */}
      <div className="toolbar">
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>Crew compliance (personal)</h2>
      </div>
      {crew.length === 0 ? (
        <div className="empty-state">No crew for this operator.</div>
      ) : (
        <div className="unit-grid">
          {crew.map(({ staff, rag }) => (
            <CrewRagCard key={staff.id} data={data} staff={staff} rag={rag} />
          ))}
        </div>
      )}

      <InformationHub data={data} clientId={activeId} />
      <UnitComplianceGuide data={data} clientId={activeId} />
    </div>
  );
}

/* One crew member's RAG card — expands to the exact required items; a
   missing/expiring/expired cert clears by attaching a renewal date inline. */
function CrewRagCard({ data, staff, rag }: {
  data: ReturnType<typeof useOpsData>['data']; staff: Staff;
  rag: ReturnType<typeof personalRag>;
}) {
  const [open, setOpen] = useState(rag.rag === 'red');
  const [dates, setDates] = useState<Record<string, string>>({});
  const col = RAG_COLOR[rag.rag];

  async function attach(type: string) {
    const expiry = dates[type];
    if (!expiry) return;
    await data.saveCert({ staffId: staff.id, type, expiry });
    setDates((p) => ({ ...p, [type]: '' }));
  }

  return (
    <div className="unit-card" style={{ ['--uc' as string]: col }}>
      <div className="ev-head" style={{ cursor: 'pointer' }} onClick={() => setOpen((o) => !o)}>
        <span className="ev-swatch" style={{ color: col }} />
        <span className="unit-name" style={{ marginTop: 0, fontSize: 15 }}>{staff.name}</span>
        <span className={`chip ${RAG_CHIP[rag.rag]}`} style={{ marginLeft: 'auto' }}>
          {rag.rag === 'green' ? 'clear' : `${rag.problems} item${rag.problems !== 1 ? 's' : ''}`}
        </span>
        <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{open ? '▾' : '▸'}</span>
      </div>
      <div className="unit-desc">{staff.role}{staff.staffNo ? ` · #${staff.staffNo}` : ''}</div>
      {open && (
        <div style={{ marginTop: 10 }}>
          {rag.items.map((it) => (
            <div className="ud-item" key={it.type} data-on={it.state === 'ok'}>
              <span className={`chip ${ITEM_CHIP[it.state]}`}>{it.state}</span>
              <span className="ud-label">
                {it.type}
                {it.expiry && (
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>
                    {' '}· {it.expiry}{typeof it.days === 'number' ? ` (${it.days}d)` : ''}
                  </span>
                )}
              </span>
              {it.type !== 'Right to work' && it.state !== 'ok' && (
                <span className="row-inline">
                  <input className="inp" type="date" style={{ width: 'auto', padding: '4px 6px', fontSize: 12 }}
                    aria-label={`New expiry for ${it.type}`}
                    value={dates[it.type] || ''}
                    onChange={(e) => setDates((p) => ({ ...p, [it.type]: e.target.value }))} />
                  <button className="btn btn-primary btn-sm" disabled={!dates[it.type]} onClick={() => attach(it.type)}>Attach</button>
                </span>
              )}
              {it.type === 'Right to work' && it.state !== 'ok' && (
                <button className="btn btn-primary btn-sm" onClick={() => data.save('staff', { id: staff.id, rtw: 'Verified' })}>
                  Mark verified
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const DOC_STATE_CHIP: Record<string, string> = {
  ok: 'chip-green', expiring: 'chip-amber', expired: 'chip-red', none: 'chip-blue',
};
const fmtD = (iso?: string) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'no expiry';

/* Information Hub — the central register of every compliance document
   (insurance, licences, hygiene certs, RAMS…) with expiry flags. */
function InformationHub({ data, clientId }: { data: ReturnType<typeof useOpsData>['data']; clientId: string }) {
  const [title, setTitle] = useState('');
  const [dtype, setDtype] = useState<DocType>('Insurance');
  const [expiry, setExpiry] = useState('');
  const [unitId, setUnitId] = useState('');
  const units = data.unitsForClient(clientId);

  const docs = useMemo(
    () => data.all<DocumentRec>('documents').filter((d) => d.clientId === clientId)
      .sort((a, b) => (a.expiry || '9999').localeCompare(b.expiry || '9999')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clientId, data.meta().updatedAt]
  );
  const flagged = docs.filter((d) => { const s = docState(d); return s === 'expired' || s === 'expiring'; }).length;
  const rollup = complianceRollup(data, clientId);

  async function add() {
    if (!title.trim()) return;
    await data.save('documents', {
      clientId, title: title.trim(), docType: dtype,
      expiry: expiry || undefined, unitId: unitId || undefined,
    } as Partial<DocumentRec>);
    setTitle(''); setExpiry('');
  }

  return (
    <section className="card" style={{ marginTop: 22 }}>
      <div className="card-head">
        <div className="card-title">Information Hub</div>
        <span className="row-inline" style={{ flexWrap: 'wrap' }}>
          {flagged > 0 && <span className="chip chip-red">{flagged} doc{flagged !== 1 ? 's' : ''} expiring</span>}
          {rollup.unitRequiredOpen > 0 && <span className="chip chip-red">{rollup.unitRequiredOpen} required unit checks</span>}
          {rollup.unitRequiredOpen === 0 && rollup.unitOpen > 0 && <span className="chip chip-amber">{rollup.unitOpen} unit checks open</span>}
          {rollup.crewRed > 0 && <span className="chip chip-red">{rollup.crewRed} crew blocked</span>}
          {rollup.crewRed === 0 && rollup.crewProblems > 0 && <span className="chip chip-amber">{rollup.crewProblems} crew items</span>}
          {flagged === 0 && rollup.unitOpen === 0 && rollup.crewProblems === 0 && <span className="chip chip-green">all clear</span>}
        </span>
      </div>
      {docs.length === 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>No documents registered. Add insurance, licences, hygiene certificates and RAMS so expiry is tracked in one place.</div>
      ) : docs.map((d) => {
        const s = docState(d);
        const u = d.unitId ? data.get<Unit>('units', d.unitId) : null;
        return (
          <div className="ov-ev" key={d.id} style={{ ['--evc' as string]: s === 'expired' ? 'var(--neon-pink)' : s === 'expiring' ? 'var(--neon-yellow)' : undefined }}>
            <span className="chip chip-blue">{d.docType}</span>
            <span className="ov-ev-name">{d.title}{u ? ` · ${u.code}` : ''}</span>
            <span className="mono ov-ev-date">{fmtD(d.expiry)}</span>
            <span className={`chip ${DOC_STATE_CHIP[s]}`}>{s === 'none' ? 'no expiry' : s}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => data.remove('documents', d.id)}>✕</button>
          </div>
        );
      })}
      <div className="row-inline" style={{ marginTop: 12, flexWrap: 'wrap' }}>
        <select className="sel" style={{ width: 'auto' }} value={dtype} onChange={(e) => setDtype(e.target.value as DocType)} aria-label="Type">
          {DOC_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        <input className="inp" style={{ flex: 1, minWidth: 150 }} placeholder="Document title (e.g. Public liability 2026)"
          value={title} onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        <select className="sel" style={{ width: 'auto' }} value={unitId} onChange={(e) => setUnitId(e.target.value)} aria-label="Unit">
          <option value="">Whole business</option>
          {units.map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}
        </select>
        <input className="inp" style={{ width: 'auto' }} type="date" aria-label="Expiry" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        <button className="btn btn-primary btn-sm" onClick={add} disabled={!title.trim()}>Add</button>
      </div>
    </section>
  );
}

/* What each unit type must hold — from the research generator, so Stock,
   Compliance and unit details all tell the same story. */
function UnitComplianceGuide({ data, clientId }: { data: ReturnType<typeof useOpsData>['data']; clientId: string }) {
  const units = data.unitsForClient(clientId);
  const types = [...new Set(units.map((u) => u.type))];
  if (types.length === 0) return null;
  return (
    <div className="unit-grid" style={{ marginTop: 22 }}>
      {types.map((t) => {
        const r = generateResearch(t);
        const col = unitColor(t);
        return (
          <div className="unit-card" key={t} style={{ ['--uc' as string]: col }}>
            <div className="ev-head">
              <span className="ev-swatch" style={{ color: col }} />
              <span className="chip unit-type-chip">{t}</span>
              <span className="ev-label" style={{ marginLeft: 'auto' }}>required compliance</span>
            </div>
            <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: 'var(--ink-2)' }}>
              {r.compliance.map((c) => <li key={c}>{c}</li>)}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
