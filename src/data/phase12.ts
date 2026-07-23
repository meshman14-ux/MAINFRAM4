/* ============================================================
   Phase 12 — pure selectors for the system upgrade.
   P&L (invoices − expenses − payroll), journey ETA maths,
   research-list generation, staff sorting, document expiry.
   All pure (OpsData in, values out) so they unit-test directly.
   ============================================================ */
import type { OpsData } from './opsData';
import type {
  Invoice, Expense, DocumentRec, Staff, EventRec, Timesheet,
} from './types';

const todayISO = () => new Date().toISOString().slice(0, 10);

/* ---------------- invoices & P&L ---------------- */

export function invoiceTotal(inv: Invoice): number {
  return (inv.lines || []).reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), 0);
}

export interface ClientPnL {
  invoiced: number;      // all invoices
  paid: number;          // invoices with status 'paid'
  outstanding: number;   // sent + overdue
  expenses: number;
  payroll: number;       // approved+paid timesheet hours × rate
  crewCost: number;      // planning estimate (confirmed crew)
  net: number;           // paid − expenses − payroll
}

export function clientPnL(d: OpsData, clientId: string): ClientPnL {
  const invoices = d.all<Invoice>('invoices').filter((i) => i.clientId === clientId);
  const expenses = d.all<Expense>('expenses').filter((x) => x.clientId === clientId);
  const events = d.eventsForClient(clientId);

  const invoiced = invoices.reduce((s, i) => s + invoiceTotal(i), 0);
  const paid = invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + invoiceTotal(i), 0);
  const outstanding = invoices.filter((i) => i.status === 'sent' || i.status === 'overdue')
    .reduce((s, i) => s + invoiceTotal(i), 0);
  const spent = expenses.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  // Payroll counts approved/paid timesheets only — draft/submitted are not
  // yet a liability. Same hours × rate × overtime maths as the payroll view.
  const payroll = events.reduce(
    (s, e) => s + d.timesheetsForEvent(e.id)
      .filter((t: Timesheet) => t.status === 'approved' || t.status === 'paid')
      .reduce((n: number, t: Timesheet) => {
        const rate = t.rate ?? d.get<Staff>('staff', t.staffId)?.rate ?? 0;
        return n + d.timesheetHours(t) * rate * (t.overtime ? 1.5 : 1);
      }, 0),
    0);
  const crewCost = events.reduce((s, e) => s + d.crewCost(e), 0);

  return { invoiced, paid, outstanding, expenses: spent, payroll, crewCost, net: paid - spent - payroll };
}

/** Flag invoices past their due date that aren't paid. */
export function isOverdue(inv: Invoice, today = todayISO()): boolean {
  return inv.status !== 'paid' && !!inv.dueDate && inv.dueDate < today;
}

/* ---------------- journey ETA ---------------- */

/** Add minutes to an 'HH:MM' clock time; towing adds 20% to the journey. */
export function journeyEta(departTime: string, durationMins: number, tow = false): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(departTime || '');
  if (!m || !(durationMins >= 0)) return '—';
  const mins = Math.round(durationMins * (tow ? 1.2 : 1));
  const total = (Number(m[1]) * 60 + Number(m[2]) + mins) % (24 * 60);
  const h = Math.floor(total / 60), mm = total % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Estimated minutes for a distance at festival-convoy speeds (avg 38 mph). */
export function journeyMinutes(miles: number): number {
  if (!(miles > 0)) return 0;
  return Math.round((miles / 38) * 60);
}

/* ---------------- research automation ---------------- */

export interface ResearchList {
  area: string;
  stock: string[];         // suggested stock items to carry
  compliance: string[];    // certificates / checks the unit needs
  requirements: string[];  // operational requirements on site
}

/** Deterministic per-area research lists — surfaced in Stock, Compliance and
    unit details as suggestions. Pure so the output is testable and stable. */
export function generateResearch(area: string): ResearchList {
  const A = (area || '').toLowerCase();
  if (A === 'bar') return {
    area: 'Bar',
    stock: ['Kegs (lager/IPA)', 'CO₂ cylinders', 'Plastic pints', 'Spirits + mixers', 'Ice', 'Fruit garnish', 'Bar runners'],
    compliance: ['Premises/occasional licence (TEN)', 'Personal licence holder on site', 'Challenge 25 signage', 'Weights & measures (stamped glasses)'],
    requirements: ['Mains or generator power for coolers', 'Potable water for glass wash', 'Secure overnight stock storage'],
  };
  if (A === 'coffee') return {
    area: 'Coffee',
    stock: ['Espresso beans', 'Oat/whole milk', '8oz/12oz cups + lids', 'Syrups', 'Hot chocolate', 'Napkins & stirrers'],
    compliance: ['Food business registration', 'LPG safety certificate (Gas Safe)', 'Food hygiene rating displayed', 'Water system sanitisation log'],
    requirements: ['LPG or 16A power for machine', 'Fresh-water containers + waste water', 'Level pitch for machine'],
  };
  if (A === 'food') return {
    area: 'Food',
    stock: ['Core menu ingredients', 'Fryer oil', 'Compostable serveware', 'Probe wipes', 'Blue roll', 'Sanitiser', 'First-aid blue plasters'],
    compliance: ['Food business registration', 'Food hygiene L2 (all handlers)', 'Allergen matrix (Natasha’s law)', 'Fire blanket + extinguisher in date', 'Fridge/probe temp logs'],
    requirements: ['Hand-wash station with hot water', 'Fridge power overnight', 'Grey-water disposal', 'Fire point within reach'],
  };
  if (A === 'cocktail') return {
    area: 'Cocktail',
    stock: ['Spirits (premium pour)', 'Fresh citrus + garnish', 'Cocktail ice (cubed/crushed)', 'Shakers & strainers', 'Compostable cups', 'Straws'],
    compliance: ['Personal licence holder on site', 'Challenge 25 signage', 'Free-pour training records'],
    requirements: ['High-volume ice supply/freezer', 'Speed rail set-up', 'Prep space for garnish'],
  };
  return {
    area: area || 'General',
    stock: ['PPE (hi-vis, gloves)', 'Gaffer tape + cable ties', 'Tool kit', 'Spare bulbs/fuses', 'Bin bags'],
    compliance: ['Public liability insurance in date', 'RAMS for the activity', 'Working-at-height/manual-handling as needed'],
    requirements: ['Access route for vehicles', 'Radio/comms channel', 'Site induction completed'],
  };
}

/* ---------------- staff sorting ---------------- */

export type StaffSort = 'staffNo' | 'name' | 'skill';

export function sortStaff(list: Staff[], by: StaffSort): Staff[] {
  const out = [...list];
  if (by === 'name') out.sort((a, b) => a.name.localeCompare(b.name));
  else if (by === 'skill') out.sort((a, b) => (a.role || '').localeCompare(b.role || '') || a.name.localeCompare(b.name));
  else out.sort((a, b) => {
    // staff numbers sort numerically when both are numeric ('12' after '2')
    const an = a.staffNo, bn = b.staffNo;
    if (!an && !bn) return a.name.localeCompare(b.name);
    if (!an) return 1;
    if (!bn) return -1;
    const ai = Number(an), bi = Number(bn);
    if (Number.isFinite(ai) && Number.isFinite(bi) && ai !== bi) return ai - bi;
    return an.localeCompare(bn, undefined, { numeric: true });
  });
  return out;
}

/* ---------------- document expiry ---------------- */

export type DocState = 'ok' | 'expiring' | 'expired' | 'none';

/** Expiring = within 30 days. */
export function docState(doc: DocumentRec, today = todayISO()): DocState {
  if (!doc.expiry) return 'none';
  if (doc.expiry < today) return 'expired';
  const soon = new Date(today + 'T00:00:00');
  soon.setDate(soon.getDate() + 30);
  return doc.expiry <= soon.toISOString().slice(0, 10) ? 'expiring' : 'ok';
}

/* ---------------- per-event rollup (Event Dashboard) ---------------- */

export interface EventRollup {
  units: number;
  crewAssigned: number;
  crewTarget: number;
  confirmed: number;
  stockLow: number;
  tasksOpen: number;
  tasksDone: number;
  movements: number;
  timesheets: number;
  invoiced: number;
  expenses: number;
}

export function eventRollup(d: OpsData, e: EventRec): EventRollup {
  const units = d.unitsForEvent(e);
  const asg = d.assignmentsForEvent(e.id);
  const target = Object.values(d.staffingFor(e)).reduce((n, v) => n + v, 0);
  const unitIds = new Set(units.map((u) => u.id));
  const stockLow = d.all<any>('stock').filter((s) => unitIds.has(s.unitId) && Number(s.qty) < Number(s.par)).length;
  const tasks = d.tasksForEvent ? d.tasksForEvent(e.id) : [];
  const invoices = d.all<Invoice>('invoices').filter((i) => i.eventId === e.id);
  const expenses = d.all<Expense>('expenses').filter((x) => x.eventId === e.id);
  return {
    units: units.length,
    crewAssigned: asg.length,
    crewTarget: target,
    confirmed: asg.filter((a) => a.confirmed).length,
    stockLow,
    tasksOpen: tasks.filter((t: any) => !t.done).length,
    tasksDone: tasks.filter((t: any) => t.done).length,
    movements: d.movementsForEvent(e.id).length,
    timesheets: d.all<any>('timesheets').filter((t) => t.eventId === e.id).length,
    invoiced: invoices.reduce((s, i) => s + invoiceTotal(i), 0),
    expenses: expenses.reduce((s, x) => s + (Number(x.amount) || 0), 0),
  };
}
