import { useMemo, useState } from 'react';
import { useOpsData } from '../data/useOpsData';
import { useAuth } from '../data/authContext';
import { myShifts, myCompliance } from '../data/phase4';
import type { Staff } from '../data/types';

const fmt = (iso?: string) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';

export default function StaffHub() {
  const { data, ready, error } = useOpsData();
  const auth = useAuth();
  const [pickedId, setPickedId] = useState('');

  const staff = useMemo(
    () => (ready ? data.all<Staff>('staff') : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, data.meta().updatedAt]
  );

  // Crew are bound to their own staff row; operators may pick anyone to view.
  const isCrew = auth.access?.role === 'crew';
  const boundId = isCrew ? (auth.access?.staffId ?? '') : (pickedId || staff[0]?.id || '');
  const me = staff.find((s) => s.id === boundId) || null;

  const shifts = useMemo(
    () => (me ? myShifts(data, me.id) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [me?.id, data.meta().updatedAt]
  );

  if (error) return <div className="p4"><div className="banner">Couldn't load data: {error}</div></div>;
  if (!ready) return <div className="state"><div><div className="spinner" /><div className="eyebrow">Loading staff hub</div></div></div>;
  if (!me) return <div className="p4"><div className="empty-state">{isCrew ? 'Your crew profile is not set up yet — ask your operator.' : 'No staff yet.'}</div></div>;

  const comp = myCompliance(data, me);

  async function confirm(assignmentId: string, val: boolean) {
    await data.save('assignments', { id: assignmentId, confirmed: val });
  }

  return (
    <div className="p4">
      <div className="client-bar">
        {isCrew ? (
          <span className="client-select" style={{ cursor: 'default' }}>{me.name}</span>
        ) : (
          <select className="client-select" value={boundId} onChange={(e) => setPickedId(e.target.value)} aria-label="Viewing as">
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        <span className="client-status" data-status={me.rtw === 'Verified' ? 'Active' : 'Lead'}>{me.role}</span>
        <span className="client-meta">{isCrew ? 'Your shifts, compliance and availability' : 'Viewing as this crew member (operator view)'}</span>
      </div>

      <div className="hub-grid">
        {/* left: my shifts */}
        <div>
          <section className="card">
            <div className="card-head"><div className="card-title">My shifts</div></div>
            {shifts.length === 0 ? (
              <div className="empty-state">No shifts assigned yet.</div>
            ) : (
              shifts.map((s) => (
                <div className="shift-card" key={s.assignmentId} style={{ ['--evc' as string]: s.color }}>
                  <span className="shift-accent" />
                  <div className="shift-main">
                    <div className="nm">{s.eventName}</div>
                    <div className="sub">{s.unitCode} · {s.unitName} · {fmt(s.eventStart)}{s.eventEnd && s.eventEnd !== s.eventStart ? `–${fmt(s.eventEnd)}` : ''}{s.area ? ` · ${s.area}` : ''}</div>
                  </div>
                  <div className="shift-actions">
                    {s.confirmed ? (
                      <>
                        <span className="chip chip-green">✓ Confirmed</span>
                        <button className="btn btn-sm btn-decline" onClick={() => confirm(s.assignmentId, false)}>Withdraw</button>
                      </>
                    ) : (
                      <>
                        <button className="btn btn-sm btn-confirm" onClick={() => confirm(s.assignmentId, true)}>Confirm</button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </section>
        </div>

        {/* right: compliance + availability */}
        <div>
          <section className="card">
            <div className="card-head">
              <div className="card-title">My compliance</div>
              <span className={`chip ${comp.status === 'compliant' ? 'chip-green' : comp.status === 'expiring' ? 'chip-amber' : 'chip-red'}`}>{comp.status}</span>
            </div>
            <div className="mono" style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 10 }}>
              RTW: {me.rtw || 'Pending'}
            </div>
            {comp.certs.length === 0 ? (
              <div className="muted" style={{ fontSize: 13 }}>No certificates required for your role.</div>
            ) : (
              comp.certs.map((c) => (
                <div className="cert-row" key={c.type}>
                  <span>{c.type}</span>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>{c.expiry ? fmt(c.expiry) : '—'}</span>
                  <span className="cert-state" data-s={c.state}>{c.state}</span>
                </div>
              ))
            )}
            <CertUploader data={data} staffId={me.id} />
          </section>

          <AvailabilityCard data={data} staffId={me.id} />
        </div>
      </div>
    </div>
  );
}

function CertUploader({ data, staffId }: { data: ReturnType<typeof useOpsData>['data']; staffId: string }) {
  const [type, setType] = useState('Personal Licence');
  const [expiry, setExpiry] = useState('');
  const CERTS = ['Personal Licence', 'Food Hygiene L2', 'First Aid', 'DBS Check', 'Allergen Awareness'];

  async function add() {
    if (!expiry) return;
    await data.saveCert({ staffId, type, expiry });
    setExpiry('');
  }

  return (
    <div style={{ marginTop: 14, borderTop: '1px solid var(--panel-line)', paddingTop: 14 }}>
      <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 8 }}>ADD / RENEW A CERTIFICATE</div>
      <div className="row-inline">
        <select className="sel" value={type} onChange={(e) => setType(e.target.value)}>
          {CERTS.map((c) => <option key={c}>{c}</option>)}
        </select>
        <input className="inp" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        <button className="btn btn-primary btn-sm" onClick={add} disabled={!expiry}>Save</button>
      </div>
    </div>
  );
}

function AvailabilityCard({ data, staffId }: { data: ReturnType<typeof useOpsData>['data']; staffId: string }) {
  const [cursor] = useState(() => { const n = new Date(); return { year: n.getUTCFullYear(), month: n.getUTCMonth() }; });

  // Build the current month's days.
  const days = useMemo(() => {
    const out: { date: string; day: number; inMonth: boolean }[] = [];
    const first = new Date(Date.UTC(cursor.year, cursor.month, 1));
    const offset = (first.getUTCDay() + 6) % 7;
    const start = new Date(first); start.setUTCDate(1 - offset);
    for (let i = 0; i < 42; i++) {
      const iso = start.toISOString().slice(0, 10);
      out.push({ date: iso, day: start.getUTCDate(), inMonth: start.getUTCMonth() === cursor.month });
      start.setUTCDate(start.getUTCDate() + 1);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor.year, cursor.month, data.meta().updatedAt]);

  const label = new Date(Date.UTC(cursor.year, cursor.month, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  async function toggle(dateISO: string) {
    const off = data.isUnavailable(staffId, dateISO);
    await data.setAvailability(staffId, dateISO, off); // off->available(true) or on->unavailable(false)
  }

  return (
    <section className="card" style={{ marginTop: 16 }}>
      <div className="card-head"><div className="card-title">My availability · {label}</div></div>
      <div className="muted" style={{ fontSize: 12.5 }}>Tap a day to mark yourself unavailable (red). Operators see this when staffing.</div>
      <div className="avail-grid">
        {days.map((d) => (
          <button
            key={d.date}
            className="avail-day"
            data-off={data.isUnavailable(staffId, d.date)}
            data-out={!d.inMonth}
            onClick={() => d.inMonth && toggle(d.date)}
            disabled={!d.inMonth}
          >{d.day}</button>
        ))}
      </div>
    </section>
  );
}
