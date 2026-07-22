/* ============================================================
   Row mappers — translate between Postgres snake_case columns
   and the camelCase domain shapes from opsdeck-data.js.

   Keeping this in one file means the rest of the app only ever
   sees the same shapes the prototype used.
   ============================================================ */
import type {
  Client, EventRec, Unit, Staff, Assignment, StockLine, Application,
  Timesheet, TableName,
} from '../data/types';

/* ---- DB table names per logical table ---- */
export const DB_TABLE: Record<TableName, string> = {
  clients: 'mf_clients',
  events: 'mf_events',
  units: 'mf_units',
  staff: 'mf_staff',
  assignments: 'mf_assignments',
  stock: 'mf_stock',
  applications: 'mf_applications',
  timesheets: 'mf_timesheets',
};

/* ---- row -> domain ---- */
export const fromRow = {
  clients: (r: any): Client => ({
    id: r.id, name: r.name, contact: r.contact, phone: r.phone,
    email: r.email, status: r.status,
  }),
  events: (r: any): EventRec => ({
    id: r.id, clientId: r.client_id, name: r.name, loc: r.loc,
    start: r.start, end: r.end, callTime: r.call_time, notes: r.notes,
    unitIds: r.unit_ids ?? undefined,
    staffing: r.staffing ?? undefined,
    schedule: r.schedule ?? [],
    shortlist: r.shortlist ?? {},
    callout: r.callout ?? undefined,
    eventOnboarding: r.event_onboarding ?? undefined,
  }),
  units: (r: any): Unit => ({
    id: r.id, clientId: r.client_id, type: r.type, code: r.code,
    name: r.name, desc: r.desc ?? undefined, crew: Number(r.crew) || 0,
    pool: r.pool ?? [], checklist: r.checklist ?? [],
  }),
  staff: (r: any): Staff => ({
    id: r.id, clientId: r.client_id, name: r.name, role: r.role,
    phone: r.phone, rate: r.rate != null ? Number(r.rate) : undefined,
    rtw: r.rtw, canTow: r.can_tow, skills: r.skills ?? undefined,
  }),
  assignments: (r: any): Assignment => ({
    id: r.id, eventId: r.event_id, unitId: r.unit_id,
    staffId: r.staff_id, area: r.area ?? undefined,
    confirmed: r.confirmed, overtime: r.overtime,
  }),
  stock: (r: any): StockLine => ({
    id: r.id, unitId: r.unit_id, item: r.item,
    qty: Number(r.qty) || 0, par: Number(r.par) || 0, unit: r.unit,
  }),
  applications: (r: any): Application => ({
    id: r.id, eventId: r.event_id, unitId: r.unit_id,
    staffId: r.staff_id, area: r.area ?? undefined, status: r.status,
    overtime: r.overtime, assignmentId: r.assignment_id ?? undefined,
  }),
  timesheets: (r: any): Timesheet => ({
    id: r.id, eventId: r.event_id, unitId: r.unit_id ?? undefined,
    staffId: r.staff_id, assignmentId: r.assignment_id ?? undefined,
    workDate: r.work_date, clockIn: r.clock_in ?? undefined,
    clockOut: r.clock_out ?? undefined,
    breakMins: r.break_mins != null ? Number(r.break_mins) : undefined,
    hours: r.hours != null ? Number(r.hours) : undefined,
    rate: r.rate != null ? Number(r.rate) : undefined,
    overtime: r.overtime, status: r.status,
    approvedBy: r.approved_by ?? undefined, notes: r.notes ?? undefined,
  }),
};

/* ---- domain -> row (only defined keys, so partial upserts work) ---- */
export const toRow = {
  clients: (o: Partial<Client>): any => prune({
    id: o.id, name: o.name, contact: o.contact, phone: o.phone,
    email: o.email, status: o.status,
  }),
  events: (o: Partial<EventRec>): any => prune({
    id: o.id, client_id: o.clientId, name: o.name, loc: o.loc,
    start: o.start, end: o.end, call_time: o.callTime, notes: o.notes,
    unit_ids: o.unitIds, staffing: o.staffing,
    schedule: o.schedule, shortlist: o.shortlist,
    callout: o.callout, event_onboarding: o.eventOnboarding,
  }),
  units: (o: Partial<Unit>): any => prune({
    id: o.id, client_id: o.clientId, type: o.type, code: o.code,
    name: o.name, desc: o.desc, crew: o.crew, pool: o.pool,
    checklist: o.checklist,
  }),
  staff: (o: Partial<Staff>): any => prune({
    id: o.id, client_id: o.clientId, name: o.name, role: o.role,
    phone: o.phone, rate: o.rate, rtw: o.rtw, can_tow: o.canTow,
    skills: o.skills,
  }),
  assignments: (o: Partial<Assignment>): any => prune({
    id: o.id, event_id: o.eventId, unit_id: o.unitId,
    staff_id: o.staffId, area: o.area, confirmed: o.confirmed,
    overtime: o.overtime,
  }),
  stock: (o: Partial<StockLine>): any => prune({
    id: o.id, unit_id: o.unitId, item: o.item, qty: o.qty,
    par: o.par, unit: o.unit,
  }),
  applications: (o: Partial<Application>): any => prune({
    id: o.id, event_id: o.eventId, unit_id: o.unitId,
    staff_id: o.staffId, area: o.area, status: o.status,
    overtime: o.overtime, assignment_id: o.assignmentId,
  }),
  timesheets: (o: Partial<Timesheet>): any => prune({
    id: o.id, event_id: o.eventId, unit_id: o.unitId,
    staff_id: o.staffId, assignment_id: o.assignmentId,
    work_date: o.workDate, clock_in: o.clockIn, clock_out: o.clockOut,
    break_mins: o.breakMins, hours: o.hours, rate: o.rate,
    overtime: o.overtime, status: o.status,
    approved_by: o.approvedBy, notes: o.notes,
  }),
};

/** Drop undefined keys so an upsert only writes provided fields. */
function prune<T extends Record<string, unknown>>(o: T): Partial<T> {
  const out: Partial<T> = {};
  (Object.keys(o) as (keyof T)[]).forEach((k) => {
    if (o[k] !== undefined) out[k] = o[k];
  });
  return out;
}
