import { useMemo, useState } from 'react';
import { useOpsData } from '../data/useOpsData';
import { useAuth } from '../data/authContext';
import { myShifts, myCompliance } from '../data/phase4';
import { openJobsForCrew } from '../data/phase5';
import { docState } from '../data/phase12';
import type { Staff, Timesheet, Assignment, EventRec, DocumentRec } from '../data/types';

const fmt = (iso?: string) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';

/** Deep link: #/staff/<staffId> opens that person's profile (operators). */
function hashStaffId(): string {
  const m = /^#\/staff\/(.+)$/.exec(window.location.hash || '');
  return m ? decodeURIComponent(m[1]) : '';
}

export default function StaffHub() {
  const { data, ready, error } = useOpsData();
  const auth = useAuth();
  const [pickedId, setPickedId] = useState(() => hashStaffId());

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
        {me.staffNo && <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>#{me.staffNo}</span>}
        {me.phone && <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>☎ {me.phone}</span>}
        <span className="client-meta">{isCrew ? 'Your shifts, callouts, compliance and availability' : 'Viewing as this crew member (operator view)'}</span>
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
                    <div className="sub"><a href={`#/unit/${s.unitId}`} style={{ color: 'inherit' }}>{s.unitCode} · {s.unitName}</a> · {fmt(s.eventStart)}{s.eventEnd && s.eventEnd !== s.eventStart ? `–${fmt(s.eventEnd)}` : ''}{s.area ? ` · ${s.area}` : ''}</div>
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

          <TimesheetsCard data={data} staffId={me.id} />

          <MyCalloutsCard data={data} staffId={me.id} />

          <MyDocumentsCard data={data} staffId={me.id} />
        </div>
      </div>
    </div>
  );
}

/* Open callouts this person can apply for — accept here, the operator
   approves on the Callouts page (never first-come-first-served). */
function MyCalloutsCard({ data, staffId }: { data: ReturnType<typeof useOpsData>['data']; staffId: string }) {
  const jobs = openJobsForCrew(data, staffId);
  const apps = data.applicationsForStaff(staffId);
  if (jobs.length === 0 && apps.length === 0) return null;

  return (
    <section className="card" style={{ marginTop: 16 }}>
      <div className="card-head"><div className="card-title">My callouts</div></div>
      {jobs.map((j) => (
        <div className="ov-ev" key={`${j.eventId}:${j.unitId}`} style={{ ['--evc' as string]: j.color }}>
          <span className="ev-swatch" style={{ color: j.color }} />
          <span className="ov-ev-name">{j.eventName} · {j.unitCode}</span>
          <span className="chip chip-blue" style={{ fontSize: 10 }}>{j.area}</span>
          <span className="mono ov-ev-date">{fmt(j.start)}</span>
          {j.alreadyApplied ? (
            <span className="chip chip-amber">applied</span>
          ) : j.eligible ? (
            <button className="btn btn-primary btn-sm" onClick={() => data.apply(j.eventId, j.unitId, staffId, j.area)}>Accept</button>
          ) : (
            <span className="chip chip-red" title={j.reasons.join(', ')}>{j.reasons[0] || 'ineligible'}</span>
          )}
        </div>
      ))}
      {apps.filter((a) => a.status && a.status !== 'applied').map((a) => {
        const e = data.get<EventRec>('events', a.eventId);
        return (
          <div className="ov-ev" key={a.id}>
            <span className="ov-ev-name">{e?.name ?? a.eventId}</span>
            <span className={`chip ${a.status === 'approved' ? 'chip-green' : 'chip-red'}`}>{a.status}</span>
          </div>
        );
      })}
    </section>
  );
}

/* Personal documents from the Information Hub (RTW copies, training certs…). */
function MyDocumentsCard({ data, staffId }: { data: ReturnType<typeof useOpsData>['data']; staffId: string }) {
  const docs = data.all<DocumentRec>('documents').filter((x) => x.staffId === staffId);
  if (docs.length === 0) return null;
  const CHIP: Record<string, string> = { ok: 'chip-green', expiring: 'chip-amber', expired: 'chip-red', none: 'chip-blue' };
  return (
    <section className="card" style={{ marginTop: 16 }}>
      <div className="card-head"><div className="card-title">My documents</div></div>
      {docs.map((x) => {
        const s = docState(x);
        return (
          <div className="ov-ev" key={x.id}>
            <span className="chip chip-blue" style={{ fontSize: 10 }}>{x.docType}</span>
            <span className="ov-ev-name">{x.title}</span>
            <span className="mono ov-ev-date">{x.expiry ? fmt(x.expiry) : 'no expiry'}</span>
            <span className={`chip ${CHIP[s]}`}>{s === 'none' ? '—' : s}</span>
          </div>
        );
      })}
    </section>
  );
}

/* My timesheets — crew clock in/out and submit; approval stays with the
   operator (and RLS blocks self-approval server-side). */
function TimesheetsCard({ data, staffId }: { data: ReturnType<typeof useOpsData>['data']; staffId: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const sheets = data.all<Timesheet>('timesheets')
    .filter((t) => t.staffId === staffId)
    .sort((a, b) => (b.workDate || '').localeCompare(a.workDate || ''));
  const open = sheets.find((t) => t.clockIn && !t.clockOut);

  // Clock-in targets: confirmed assignments whose event covers today.
  const liveShifts = data.assignmentsForStaff(staffId).filter((a: Assignment) => {
    if (!a.confirmed) return false;
    const e = data.get<EventRec>('events', a.eventId);
    return !!e?.start && e.start <= today && today <= (e.end || e.start);
  });
  const hasSheetToday = (eventId: string) =>
    sheets.some((t) => t.eventId === eventId && t.workDate === today);

  async function clockIn(a: Assignment) {
    await data.save('timesheets', {
      eventId: a.eventId, unitId: a.unitId, staffId, assignmentId: a.id,
      workDate: today, clockIn: new Date().toISOString(), status: 'draft',
    } as Partial<Timesheet>);
  }
  async function clockOut(t: Timesheet) {
    await data.save('timesheets', { id: t.id, clockOut: new Date().toISOString() } as Partial<Timesheet>);
  }
  async function submit(t: Timesheet) {
    await data.save('timesheets', { id: t.id, status: 'submitted' } as Partial<Timesheet>);
  }

  const STATUS_CHIP: Record<string, string> = {
    draft: 'chip-blue', submitted: 'chip-amber', approved: 'chip-green', paid: 'chip-green',
  };
  const fmtT = (iso?: string) => iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <section className="card" style={{ marginTop: 16 }}>
      <div className="card-head"><div className="card-title">My timesheets</div></div>

      {open ? (
        <div className="row-inline" style={{ marginBottom: 12 }}>
          <span className="chip chip-green" style={{ animation: 'pulse-glow 2.4s ease-in-out infinite', ['--pulse-c' as string]: 'color-mix(in oklch, var(--neon-green) 55%, transparent)' }}>
            Clocked in {fmtT(open.clockIn)}
          </span>
          <button className="btn btn-sm btn-confirm" onClick={() => clockOut(open)}>Clock out</button>
        </div>
      ) : liveShifts.length > 0 ? (
        <div style={{ marginBottom: 12 }}>
          {liveShifts.map((a) => {
            const e = data.get<EventRec>('events', a.eventId);
            return (
              <div className="row-inline" key={a.id} style={{ marginBottom: 6 }}>
                <span style={{ flex: 1, fontSize: 13.5 }}>{e?.name ?? a.eventId}</span>
                {hasSheetToday(a.eventId)
                  ? <span className="chip chip-green">logged today</span>
                  : <button className="btn btn-sm btn-confirm" onClick={() => clockIn(a)}>Clock in</button>}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>No live event today — clock-in appears here on event days.</div>
      )}

      {sheets.length === 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>No timesheets yet.</div>
      ) : sheets.slice(0, 6).map((t) => {
        const e = data.get<EventRec>('events', t.eventId);
        const hrs = data.timesheetHours(t);
        return (
          <div className="cert-row" key={t.id} style={{ gridTemplateColumns: '1fr auto auto auto' }}>
            <span style={{ fontSize: 13 }}>
              {e?.name ?? t.eventId}
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}> · {t.workDate}</span>
            </span>
            <span className="mono" style={{ fontSize: 12 }}>{hrs ? `${hrs.toFixed(1)}h` : `${fmtT(t.clockIn)}–${fmtT(t.clockOut)}`}</span>
            <span className={`chip ${STATUS_CHIP[t.status]}`}>{t.status}</span>
            {t.status === 'draft' && t.clockOut
              ? <button className="btn btn-ghost btn-sm" onClick={() => submit(t)}>Submit</button>
              : <span />}
          </div>
        );
      })}
    </section>
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
