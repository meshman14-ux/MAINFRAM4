import { useMemo, useState } from 'react';
import { useOpsData } from '../data/useOpsData';
import { useAuth } from '../data/authContext';
import type { Client, EventRec, Staff, Timesheet } from '../data/types';
import { payrollForEvent, payrollCsv } from '../data/phase7';

const fmt = (iso?: string) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
const clock = (iso?: string) => iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—';
const gbp = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const hrs = (n: number) => (Math.round(n * 10) / 10).toLocaleString('en-GB');

// Semantic coding (neon spec §2): informational=blue, pending=yellow, done/paid=green.
const STATUS_COLOR: Record<Timesheet['status'], string> = {
  draft: 'var(--neon-blue)', submitted: 'var(--neon-yellow)', approved: 'var(--neon-green)', paid: 'var(--neon-green)',
};

export default function Timesheets() {
  const { data, ready, error } = useOpsData();
  const auth = useAuth();
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
  const staffName = useMemo(() => new Map(staff.map((s: Staff) => [s.id, s.name])), [staff]);

  const payroll = useMemo(
    () => events.map((e: EventRec) => ({
      event: e,
      rows: payrollForEvent(data, e),
      sheets: data.timesheetsForEvent(e.id)
        .sort((a, b) => (a.workDate || '').localeCompare(b.workDate || '') || a.id.localeCompare(b.id)),
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, data.meta().updatedAt]
  );

  const allSheets = payroll.flatMap((p) => p.sheets);
  const totalHours = payroll.reduce((s, p) => s + p.rows.reduce((x, r) => x + r.hours, 0), 0);
  const totalCost = payroll.reduce((s, p) => s + p.rows.reduce((x, r) => x + r.cost, 0), 0);
  const pending = allSheets.filter((t) => t.status === 'submitted').length;

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

  async function approve(id: string) {
    const patch: Partial<Timesheet> = { id, status: 'approved', approvedBy: auth.session?.user?.id };
    await data.save('timesheets', patch);
  }
  async function markPaid(id: string) {
    const patch: Partial<Timesheet> = { id, status: 'paid' };
    await data.save('timesheets', patch);
  }

  function exportCsv() {
    const csv = payrollCsv(payroll.filter((p) => p.rows.length > 0).map((p) => ({ eventName: p.event.name, rows: p.rows })));
    const b = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(b);
    const a = document.createElement('a'); a.href = url; a.download = `${activeId}-payroll.csv`;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 120);
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
        <span className="client-meta">Hours and payroll per event · submitted → approved → paid</span>
        <button className="btn btn-primary btn-sm" onClick={exportCsv} disabled={totalCost === 0}>Export .csv</button>
      </div>

      <div className="stat-strip">
        <div className="stat-box" data-tone="blue"><div className="v">{hrs(totalHours)}</div><div className="k">Total hours</div></div>
        <div className="stat-box" data-tone="green"><div className="v">{gbp(totalCost)}</div><div className="k">Payroll cost</div></div>
        <div className="stat-box" data-tone="blue"><div className="v">{allSheets.length}</div><div className="k">Timesheets</div></div>
        <div className="stat-box" data-tone="amber"><div className="v">{pending}</div><div className="k">Awaiting approval</div></div>
      </div>

      <div className="ts-form">
        <select value={formEventId} onChange={(e) => setFormEventId(e.target.value)} aria-label="Event">
          <option value="">Event…</option>
          {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <select value={formStaffId} onChange={(e) => setFormStaffId(e.target.value)} aria-label="Staff">
          <option value="">Staff…</option>
          {staff.map((s: Staff) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} aria-label="Work date" />
        <input type="time" value={formIn} onChange={(e) => setFormIn(e.target.value)} aria-label="Clock in" />
        <input type="time" value={formOut} onChange={(e) => setFormOut(e.target.value)} aria-label="Clock out" />
        <button
          className="btn-primary"
          disabled={!formEventId || !formStaffId || !formDate || !formIn || !formOut || saving}
          onClick={addTimesheet}
        >
          {saving ? 'Adding…' : 'Add timesheet'}
        </button>
      </div>

      {allSheets.length === 0 ? (
        <div className="empty-state">No timesheets yet — add the first one above.</div>
      ) : (
        payroll.filter((p) => p.sheets.length > 0).map(({ event, rows, sheets }) => (
          <div key={event.id} className="ts-section">
            <div className="ts-head">
              <span className="fin-swatch" style={{ background: data.eventColor(event.id), color: data.eventColor(event.id) }} />
              <strong>{event.name}</strong>
              <span className="mono" style={{ fontSize: 12 }}>
                {fmt(event.start)}{event.end && event.end !== event.start ? `–${fmt(event.end)}` : ''}
              </span>
            </div>
            <table className="fin-table ts-table">
              <thead>
                <tr>
                  <th>Date</th><th>Staff</th><th>In–Out</th>
                  <th style={{ textAlign: 'right' }}>Hours</th>
                  <th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {sheets.map((t) => (
                  <tr key={t.id}>
                    <td className="mono" style={{ fontSize: 12 }}>{fmt(t.workDate)}</td>
                    <td>{staffName.get(t.staffId) ?? t.staffId}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{clock(t.clockIn)}–{clock(t.clockOut)}</td>
                    <td className="num">{hrs(data.timesheetHours(t))}</td>
                    <td>
                      <span className="pill" style={{ color: STATUS_COLOR[t.status], borderColor: STATUS_COLOR[t.status] }}>
                        {t.status}{t.overtime ? ' · OT' : ''}
                      </span>
                    </td>
                    <td>
                      <span className="ts-actions">
                        {t.status === 'submitted' && (
                          <button className="btn btn-confirm btn-sm" onClick={() => approve(t.id)}>Approve</button>
                        )}
                        {t.status === 'approved' && (
                          <button className="btn btn-sm" onClick={() => markPaid(t.id)}>Mark paid</button>
                        )}
                        <button className="btn btn-danger btn-sm" onClick={() => data.remove('timesheets', t.id)} aria-label="Delete timesheet">✕</button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="fin-total" colSpan={3}>Payroll ({rows.length} staff)</td>
                  <td className="num fin-total">{hrs(rows.reduce((s, r) => s + r.hours, 0))}</td>
                  <td className="num fin-total" colSpan={2}>{gbp(rows.reduce((s, r) => s + r.cost, 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ))
      )}
      <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
        Hours use the sheet's explicit hours when set, otherwise clock-out − clock-in − break.
        Approving stamps the signed-in user; cost = hours × (sheet rate ?? staff rate) with overtime ×1.5.
      </p>
    </div>
  );
}
