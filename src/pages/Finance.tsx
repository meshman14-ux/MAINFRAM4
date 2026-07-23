/* Finance — real P&L. Crew-cost planning view (existing) + invoices with
   line items (jsonb on the row), expenses by category, and a P&L strip:
   paid − expenses − payroll = net. CSV export covers all three sections. */
import { useMemo, useState } from 'react';
import { useOpsData } from '../data/useOpsData';
import type {
  Client, EventRec, Invoice, InvoiceLine, Expense, ExpenseCategory,
} from '../data/types';
import { EXPENSE_CATEGORIES, INVOICE_STATUSES } from '../data/types';
import { clientFinance } from '../data/phase6';
import { clientPnL, invoiceTotal, isOverdue } from '../data/phase12';

const fmt = (iso?: string) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—';
const gbp = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const STATUS_CHIP: Record<string, string> = {
  draft: 'chip-blue', sent: 'chip-amber', paid: 'chip-green', overdue: 'chip-red',
};

export default function Finance() {
  const { data, ready, error } = useOpsData();
  const [clientId, setClientId] = useState('');
  const [editingInv, setEditingInv] = useState<Partial<Invoice> | null>(null);

  const clients = useMemo(
    () => (ready ? data.all<Client>('clients') : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, data.meta().updatedAt]
  );
  const activeId = clientId || clients[0]?.id || '';

  const fin = useMemo(
    () => (activeId ? clientFinance(data, activeId) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeId, data.meta().updatedAt]
  );
  const pnl = useMemo(
    () => (activeId ? clientPnL(data, activeId) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeId, data.meta().updatedAt]
  );
  const invoices = useMemo(
    () => data.all<Invoice>('invoices').filter((i) => i.clientId === activeId)
      .sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || '')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeId, data.meta().updatedAt]
  );
  const expenses = useMemo(
    () => data.all<Expense>('expenses').filter((x) => x.clientId === activeId)
      .sort((a, b) => (b.expDate || '').localeCompare(a.expDate || '')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeId, data.meta().updatedAt]
  );

  if (error) return <div className="p4"><div className="banner">Couldn't load data: {error}</div></div>;
  if (!ready) return <div className="state"><div><div className="spinner" /><div className="eyebrow">Loading finance</div></div></div>;
  if (clients.length === 0) return <div className="p4"><div className="empty-state">No operators yet.</div></div>;

  function exportCsv() {
    const rows = [
      'Section,Ref,Date,Description,Amount',
      ...invoices.map((i) => `Invoice,${i.number || i.id},${i.issueDate || ''},${(i.status || '').toUpperCase()},${invoiceTotal(i)}`),
      ...expenses.map((x) => `Expense,${x.id},${x.expDate || ''},"${x.category}: ${(x.descr || '').replace(/"/g, "'")}",-${x.amount}`),
      ...(fin ? fin.events.map((e) => `Crew cost,${e.eventId},${e.start || ''},"${e.eventName}",-${e.crewCost}`) : []),
    ];
    const b = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(b);
    const a = document.createElement('a'); a.href = url; a.download = `${activeId}-finance.csv`;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 120);
  }

  return (
    <div className="p4">
      <div className="client-bar">
        <select className="client-select" value={activeId} onChange={(e) => setClientId(e.target.value)} aria-label="Operator">
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <span className="client-meta">Invoices · expenses · payroll · profit</span>
        <span style={{ flex: 1 }} />
        <button className="btn btn-primary btn-sm" onClick={exportCsv}>Export .csv</button>
      </div>

      {pnl && (
        <div className="stat-strip">
          <div className="stat-box" data-tone="blue"><div className="v">{gbp(pnl.invoiced)}</div><div className="k">Invoiced</div></div>
          <div className="stat-box" data-tone="green"><div className="v">{gbp(pnl.paid)}</div><div className="k">Paid</div></div>
          <div className="stat-box" data-tone={pnl.outstanding ? 'amber' : undefined}><div className="v">{gbp(pnl.outstanding)}</div><div className="k">Outstanding</div></div>
          <div className="stat-box" data-tone="red"><div className="v">{gbp(pnl.expenses)}</div><div className="k">Expenses</div></div>
          <div className="stat-box" data-tone="red"><div className="v">{gbp(pnl.payroll)}</div><div className="k">Payroll (approved)</div></div>
          <div className="stat-box" data-tone={pnl.net >= 0 ? 'green' : 'red'}><div className="v">{gbp(pnl.net)}</div><div className="k">Net (paid basis)</div></div>
        </div>
      )}

      <div className="hub-grid">
        {/* invoices */}
        <section className="card">
          <div className="card-head">
            <div className="card-title">Invoices</div>
            <button className="btn btn-primary btn-sm" onClick={() => setEditingInv({ clientId: activeId, status: 'draft', lines: [{ desc: '', qty: 1, unitPrice: 0 }] })}>+ New invoice</button>
          </div>
          {invoices.length === 0 ? (
            <div className="muted" style={{ fontSize: 13 }}>No invoices yet.</div>
          ) : invoices.map((inv) => {
            const overdue = isOverdue(inv);
            const ev = inv.eventId ? data.get<EventRec>('events', inv.eventId) : null;
            return (
              <div className="ov-ev" key={inv.id} style={{ ['--evc' as string]: overdue ? 'var(--neon-pink)' : undefined }}>
                <span className="mono ov-ev-date">{inv.number || inv.id}</span>
                <span className="ov-ev-name">{ev ? ev.name : 'General'}{inv.dueDate ? ` · due ${fmt(inv.dueDate)}` : ''}</span>
                <span className="mono" style={{ fontWeight: 700 }}>{gbp(invoiceTotal(inv))}</span>
                <span className={`chip ${overdue ? 'chip-red' : STATUS_CHIP[inv.status]}`}>{overdue ? 'overdue' : inv.status}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditingInv(inv)}>Edit</button>
              </div>
            );
          })}
        </section>

        {/* expenses */}
        <section className="card">
          <div className="card-head"><div className="card-title">Expenses</div></div>
          <ExpenseAdder data={data} clientId={activeId} />
          {expenses.length === 0 ? (
            <div className="muted" style={{ fontSize: 13, marginTop: 10 }}>No expenses logged.</div>
          ) : expenses.slice(0, 12).map((x) => {
            const ev = x.eventId ? data.get<EventRec>('events', x.eventId) : null;
            return (
              <div className="ov-ev" key={x.id}>
                <span className="mono ov-ev-date">{fmt(x.expDate)}</span>
                <span className="chip chip-amber">{x.category}</span>
                <span className="ov-ev-name">{x.descr || ev?.name || '—'}</span>
                <span className="mono" style={{ fontWeight: 700 }}>{gbp(x.amount)}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => data.remove('expenses', x.id)}>✕</button>
              </div>
            );
          })}
        </section>
      </div>

      {/* crew-cost planning table (pre-existing view, kept) */}
      {fin && fin.events.length > 0 && (
        <section className="card" style={{ marginTop: 16 }}>
          <div className="card-head"><div className="card-title">Crew cost by event (planning estimate)</div></div>
          <table className="fin-table">
            <thead>
              <tr>
                <th>Event</th><th>Dates</th>
                <th style={{ textAlign: 'right' }}>Trading hrs</th>
                <th style={{ textAlign: 'right' }}>Confirmed</th>
                <th style={{ textAlign: 'right' }}>Crew cost</th>
              </tr>
            </thead>
            <tbody>
              {fin.events.map((e) => (
                <tr key={e.eventId}>
                  <td><span className="fin-swatch" style={{ background: e.color, color: e.color }} /><a href={`#/event/${e.eventId}`} style={{ color: 'inherit' }}>{e.eventName}</a></td>
                  <td className="mono" style={{ fontSize: 12 }}>{fmt(e.start)}{e.end && e.end !== e.start ? `–${fmt(e.end)}` : ''}</td>
                  <td className="num">{e.tradingHours}</td>
                  <td className="num">{e.confirmedCrew}</td>
                  <td className="num">{gbp(e.crewCost)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="fin-total" colSpan={4}>Total</td>
                <td className="num fin-total">{gbp(fin.totalCrewCost)}</td>
              </tr>
            </tfoot>
          </table>
        </section>
      )}

      {editingInv && (
        <InvoiceEditor
          data={data}
          clientId={activeId}
          value={editingInv}
          onClose={() => setEditingInv(null)}
        />
      )}
    </div>
  );
}

function ExpenseAdder({ data, clientId }: { data: ReturnType<typeof useOpsData>['data']; clientId: string }) {
  const [cat, setCat] = useState<ExpenseCategory>('Stock');
  const [descr, setDescr] = useState('');
  const [amount, setAmount] = useState('');
  const [eventId, setEventId] = useState('');
  const events = data.eventsForClient(clientId);

  async function add() {
    const n = Number(amount);
    if (!(n > 0)) return;
    await data.save('expenses', {
      clientId, category: cat, descr: descr || undefined,
      amount: n, eventId: eventId || undefined,
      expDate: new Date().toISOString().slice(0, 10),
    } as Partial<Expense>);
    setDescr(''); setAmount('');
  }

  return (
    <div className="row-inline" style={{ flexWrap: 'wrap' }}>
      <select className="sel" style={{ width: 'auto' }} value={cat} onChange={(e) => setCat(e.target.value as ExpenseCategory)}>
        {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
      </select>
      <select className="sel" style={{ width: 'auto' }} value={eventId} onChange={(e) => setEventId(e.target.value)} aria-label="Event">
        <option value="">No event</option>
        {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
      </select>
      <input className="inp" style={{ flex: 1, minWidth: 120 }} placeholder="Description" value={descr} onChange={(e) => setDescr(e.target.value)} />
      <input className="inp" style={{ width: 90 }} type="number" min={0} placeholder="£" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <button className="btn btn-primary btn-sm" onClick={add} disabled={!(Number(amount) > 0)}>Add</button>
    </div>
  );
}

function InvoiceEditor({ data, clientId, value, onClose }: {
  data: ReturnType<typeof useOpsData>['data']; clientId: string;
  value: Partial<Invoice>; onClose: () => void;
}) {
  const [inv, setInv] = useState<Partial<Invoice>>({ ...value, lines: [...(value.lines || [])] });
  const events = data.eventsForClient(clientId);
  const set = (k: keyof Invoice, v: unknown) => setInv((p) => ({ ...p, [k]: v }));
  const lines = inv.lines || [];
  const setLine = (i: number, patch: Partial<InvoiceLine>) => {
    const next = [...lines]; next[i] = { ...next[i], ...patch }; set('lines', next);
  };
  const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), 0);

  async function save() {
    await data.save('invoices', { ...inv, clientId } as Partial<Invoice>);
    onClose();
  }
  async function del() {
    if (inv.id && confirm('Delete this invoice?')) {
      await data.remove('invoices', inv.id);
      onClose();
    }
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-head">
        <div className="card-title">{inv.id ? `Invoice ${inv.number || inv.id}` : 'New invoice'}</div>
        <span className="mono" style={{ fontWeight: 700 }}>£{total.toLocaleString('en-GB')}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <label>Number<input className="inp" placeholder="INV-001" value={inv.number || ''} onChange={(e) => set('number', e.target.value)} /></label>
        <label>Event
          <select className="sel" value={inv.eventId || ''} onChange={(e) => set('eventId', e.target.value || undefined)}>
            <option value="">General</option>
            {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </label>
        <label>Issued<input className="inp" type="date" value={inv.issueDate || ''} onChange={(e) => set('issueDate', e.target.value)} /></label>
        <label>Due<input className="inp" type="date" value={inv.dueDate || ''} onChange={(e) => set('dueDate', e.target.value)} /></label>
        <label>Status
          <select className="sel" value={inv.status || 'draft'} onChange={(e) => set('status', e.target.value)}>
            {INVOICE_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
      </div>

      <div className="ev-label" style={{ margin: '14px 0 6px' }}>Line items</div>
      {lines.map((l, i) => (
        <div className="row-inline" key={i} style={{ marginBottom: 6 }}>
          <input className="inp" style={{ flex: 2 }} placeholder="Description" value={l.desc} onChange={(e) => setLine(i, { desc: e.target.value })} />
          <input className="inp" style={{ width: 70 }} type="number" min={0} aria-label="Qty" value={l.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} />
          <input className="inp" style={{ width: 100 }} type="number" min={0} aria-label="Unit price" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: Number(e.target.value) })} />
          <span className="mono" style={{ width: 80, textAlign: 'right' }}>£{((Number(l.qty) || 0) * (Number(l.unitPrice) || 0)).toLocaleString('en-GB')}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => set('lines', lines.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <button className="btn btn-sm" onClick={() => set('lines', [...lines, { desc: '', qty: 1, unitPrice: 0 }])}>+ Line</button>

      <div className="row-inline" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
        {inv.id && <button className="btn btn-danger btn-sm" onClick={del}>Delete</button>}
        <span style={{ flex: 1 }} />
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={!lines.length}>Save invoice</button>
      </div>
    </div>
  );
}
