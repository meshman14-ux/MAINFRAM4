import { useMemo, useState } from 'react';
import { useOpsData } from '../data/useOpsData';
import type { Client, EventRec, Staff, Timesheet } from '../data/types';
import { payrollForEvent } from '../data/phase7';

const fmt = (iso?: string) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
const gbp = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const hrs = (n: number) => (Math.round(n * 10) / 10).toLocaleString('en-GB');

export default function Timesheets() {
  const { data, ready, error } = useOpsData();
  const [clientId, setClientId] = useState('');

  // add-timesheet form state
  const [formEventId, setFormEventId] = useState('');
  const [formStaffId, setFormStaffId] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formIn, setFormIn] = useState('');
  const [formOut, setFormOut] = useState('');
  const [saving, setSaving] = useState(false);

  const clients = useMemo(
    () => (ready ? data.all<Client>('clients') : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, data.meta().updatedAt]
  );
  const activeId = clientId || clients[0]?.id || '';

  const events = useMemo(
    () => (activeId ? data.eventsForClient(activeId).sort((a, b) => (a.start || '').localeCompare(b.start || '')) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeId, data.meta().updatedAt]
  );
  const staff = useMemo(
    () => (activeId ? data.staffForClient(activeId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeId, data.meta().updatedAt]
  );

  const payroll = useMemo(
    () => events.map((e: EventRec) => ({ event: e, rows: payrollForEvent(data, e) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, data.meta().updatedAt]
  );

  const totalHours = payroll.reduce((s, p) => s + p.rows.reduce((x, r) => x + r.hours, 0), 0);
  const totalCost = payroll.reduce((s, p) => s + p.rows.reduce((x, r) => x + r.cost, 0), 0);
  const totalShifts = payroll.reduce((s, p) => s + p.rows.reduce((x, r) => x + r.shifts, 0), 0);

  async function addTimesheet() {
    if (!formEventId || !formStaffId || !formDate || !formIn || !formOut || saving) return;
    setSaving(true);
    try {
      const sheet: Partial<Timesheet> = {
        eventId: formEventId,
        staffId: formStaffId,
        workDate: formDate,
        clockIn: `${formDate}T${formIn}:00`,
        clockOut: `${formDate}T${formOut}:00`,
        breakMins: 0,
        status: 'submitted',
      };
      await data.save('timesheets', sheet);
      setFormIn(''); setFormOut('');
    } finally {
      setSaving(false);
    }
  }

  if (error) return <div className="p4"><div className="banner">Couldn't load data: {error}</div></div>;
  if (!ready) return <div className="state"><div><div className="spinner" /><div className="eyebrow">Loading timesheets</div></div></div>;
  if (clients.length === 0) return <div className="p4"><div className="empty-state">No operators yet.</div></div>;

  return (
    <div className="p4">
      <div className="client-bar">
        <select className="client-select" value={activeId} onChange={(e) => setClientId(e.target.value)} aria-label="Operator">
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <span className="client-meta">Hours worked and payroll cost per event (sheet rate ?? staff rate, overtime ×1.5)</span>
      </div>

      <div className="stat-strip">
        <div className="stat-box"><div className="v">{hrs(totalHours)}</div><div className="k">Total hours</div></div>
        <div className="stat-box"><div className="v">{gbp(totalCost)}</div><div className="k">Payroll cost</div></div>
        <div className="stat-box"><div className="v">{totalShifts}</div><div className="k">Timesheets</div></div>
        <div className="stat-box"><div className="v">{events.length}</div><div className="k">Events</div></div>
      </div>

      <div className="client-bar" style={{ flexWrap: 'wrap', gap: 8 }}>
        <select className="client-select" value={formEventId} onChange={(e) => setFormEventId(e.target.value)} aria-label="Event">
          <option value="">Event…</option>
          {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <select className="client-select" value={formStaffId} onChange={(e) => setFormStaffId(e.target.value)} aria-label="Staff">
          <option value="">Staff…</option>
          {staff.map((s: Staff) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input className="client-select" type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} aria-label="Work date" />
        <input className="client-select" type="time" value={formIn} onChange={(e) => setFormIn(e.target.value)} aria-label="Clock in" />
        <input className="client-select" type="time" value={formOut} onChange={(e) => setFormOut(e.target.value)} aria-label="Clock out" />
        <button
          className="btn btn-primary"
          disabled={!formEventId || !formStaffId || !formDate || !formIn || !formOut || saving}
          onClick={addTimesheet}
        >
          {saving ? 'Adding…' : 'Add timesheet'}
        </button>
      </div>

      {payroll.every((p) => p.rows.length === 0) ? (
        <div className="empty-state">No timesheets yet — add the first one above.</div>
      ) : (
        payroll.filter((p) => p.rows.length > 0).map(({ event, rows }) => (
          <div key={event.id} style={{ marginTop: 18 }}>
            <div className="client-meta" style={{ marginBottom: 6 }}>
              <span className="fin-swatch" style={{ background: data.eventColor(event.id) }} />
              <strong>{event.name}</strong>
              <span className="mono" style={{ fontSize: 12, marginLeft: 8 }}>
                {fmt(event.start)}{event.end && event.end !== event.start ? `–${fmt(event.end)}` : ''}
              </span>
            </div>
            <table className="fin-table">
              <thead>
                <tr>
                  <th>Staff</th>
                  <th style={{ textAlign: 'right' }}>Shifts</th>
                  <th style={{ textAlign: 'right' }}>Hours</th>
                  <th style={{ textAlign: 'right' }}>Cost</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.staffId}>
                    <td>{r.name}</td>
                    <td className="num">{r.shifts}</td>
                    <td className="num">{hrs(r.hours)}</td>
                    <td className="num">{gbp(r.cost)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="fin-total" colSpan={3}>Total</td>
                  <td className="num fin-total">{gbp(rows.reduce((s, r) => s + r.cost, 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ))
      )}
      <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
        Hours use the sheet's explicit hours when set, otherwise clock-out − clock-in − break.
        New timesheets are created as <span className="mono">submitted</span>.
      </p>
    </div>
  );
}
