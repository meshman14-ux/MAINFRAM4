/* ============================================================
   Row mappers — translate between Postgres snake_case columns
   and the camelCase domain shapes from opsdeck-data.js.

   Keeping this in one file means the rest of the app only ever
   sees the same shapes the prototype used.
   ============================================================ */
import type {
  Client, EventRec, Unit, Staff, Assignment, StockLine, Application,
  Timesheet, Vehicle, Invoice, Expense, DocumentRec, ShoppingItem, TableName,
  Task, UnitChecklist, UnitInsight,
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
  vehicles: 'mf_vehicles',
  invoices: 'mf_invoices',
  expenses: 'mf_expenses',
  documents: 'mf_documents',
  shoppingLists: 'mf_shopping_lists',
  tasks: 'mf_tasks',
  unitChecklists: 'mf_unit_checklists',
  unitInsights: 'mf_unit_insights',
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
    category: r.category ?? undefined,
    priority: r.priority ?? undefined,
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
    staffNo: r.staff_no ?? undefined,
  }),
  assignments: (r: any): Assignment => ({
    id: r.id, eventId: r.event_id, unitId: r.unit_id,
    staffId: r.staff_id, area: r.area ?? undefined,
    confirmed: r.confirmed, overtime: r.overtime,
  }),
  stock: (r: any): StockLine => ({
    id: r.id, unitId: r.unit_id, item: r.item,
    qty: Number(r.qty) || 0, par: Number(r.par) || 0, unit: r.unit,
    category: r.category ?? undefined,
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
  vehicles: (r: any): Vehicle => ({
    id: r.id, clientId: r.client_id, name: r.name, reg: r.reg ?? undefined,
    vtype: r.vtype, towCapable: !!r.tow_capable, notes: r.notes ?? undefined,
  }),
  invoices: (r: any): Invoice => ({
    id: r.id, clientId: r.client_id, eventId: r.event_id ?? undefined,
    number: r.number ?? undefined, issueDate: r.issue_date ?? undefined,
    dueDate: r.due_date ?? undefined, status: r.status,
    lines: r.lines ?? [], notes: r.notes ?? undefined,
  }),
  expenses: (r: any): Expense => ({
    id: r.id, clientId: r.client_id, eventId: r.event_id ?? undefined,
    expDate: r.exp_date ?? undefined, category: r.category,
    descr: r.descr ?? undefined, amount: Number(r.amount) || 0,
  }),
  documents: (r: any): DocumentRec => ({
    id: r.id, clientId: r.client_id, unitId: r.unit_id ?? undefined,
    staffId: r.staff_id ?? undefined, title: r.title, docType: r.doc_type,
    expiry: r.expiry ?? undefined, url: r.url ?? undefined, notes: r.notes ?? undefined,
  }),
  shoppingLists: (r: any): ShoppingItem => ({
    id: r.id, unitId: r.unit_id, item: r.item, qty: Number(r.qty) || 0,
    unit: r.unit ?? undefined, category: r.category ?? undefined, done: !!r.done,
  }),
  tasks: (r: any): Task => ({
    id: r.id, clientId: r.client_id ?? undefined, unitId: r.unit_id ?? undefined,
    eventId: r.event_id ?? undefined, title: r.title, detail: r.detail ?? undefined,
    status: r.status, assigneeStaffId: r.assignee_staff_id ?? undefined, due: r.due ?? undefined,
  }),
  unitChecklists: (r: any): UnitChecklist => ({
    id: r.id, unitId: r.unit_id, kind: r.kind, items: r.items ?? [],
  }),
  unitInsights: (r: any): UnitInsight => ({
    id: r.id, unitId: r.unit_id, generatedAt: r.generated_at ?? undefined,
    healthScore: r.health_score ?? undefined, readinessScore: r.readiness_score ?? undefined,
    insights: r.insights ?? [], summaryDaily: r.summary_daily ?? undefined,
    summaryWeekly: r.summary_weekly ?? undefined, summaryMonthly: r.summary_monthly ?? undefined,
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
    category: o.category, priority: o.priority,
  }),
  units: (o: Partial<Unit>): any => prune({
    id: o.id, client_id: o.clientId, type: o.type, code: o.code,
    name: o.name, desc: o.desc, crew: o.crew, pool: o.pool,
    checklist: o.checklist,
  }),
  staff: (o: Partial<Staff>): any => prune({
    id: o.id, client_id: o.clientId, name: o.name, role: o.role,
    phone: o.phone, rate: o.rate, rtw: o.rtw, can_tow: o.canTow,
    skills: o.skills, staff_no: o.staffNo,
  }),
  assignments: (o: Partial<Assignment>): any => prune({
    id: o.id, event_id: o.eventId, unit_id: o.unitId,
    staff_id: o.staffId, area: o.area, confirmed: o.confirmed,
    overtime: o.overtime,
  }),
  stock: (o: Partial<StockLine>): any => prune({
    id: o.id, unit_id: o.unitId, item: o.item, qty: o.qty,
    par: o.par, unit: o.unit, category: o.category,
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
  vehicles: (o: Partial<Vehicle>): any => prune({
    id: o.id, client_id: o.clientId, name: o.name, reg: o.reg,
    vtype: o.vtype, tow_capable: o.towCapable, notes: o.notes,
  }),
  invoices: (o: Partial<Invoice>): any => prune({
    id: o.id, client_id: o.clientId, event_id: o.eventId,
    number: o.number, issue_date: o.issueDate, due_date: o.dueDate,
    status: o.status, lines: o.lines, notes: o.notes,
  }),
  expenses: (o: Partial<Expense>): any => prune({
    id: o.id, client_id: o.clientId, event_id: o.eventId,
    exp_date: o.expDate, category: o.category, descr: o.descr,
    amount: o.amount,
  }),
  documents: (o: Partial<DocumentRec>): any => prune({
    id: o.id, client_id: o.clientId, unit_id: o.unitId, staff_id: o.staffId,
    title: o.title, doc_type: o.docType, expiry: o.expiry, url: o.url,
    notes: o.notes,
  }),
  shoppingLists: (o: Partial<ShoppingItem>): any => prune({
    id: o.id, unit_id: o.unitId, item: o.item, qty: o.qty,
    unit: o.unit, category: o.category, done: o.done,
  }),
  tasks: (o: Partial<Task>): any => prune({
    id: o.id, client_id: o.clientId, unit_id: o.unitId, event_id: o.eventId,
    title: o.title, detail: o.detail, status: o.status,
    assignee_staff_id: o.assigneeStaffId, due: o.due,
  }),
  unitChecklists: (o: Partial<UnitChecklist>): any => prune({
    id: o.id, unit_id: o.unitId, kind: o.kind, items: o.items,
  }),
  unitInsights: (o: Partial<UnitInsight>): any => prune({
    id: o.id, unit_id: o.unitId, generated_at: o.generatedAt,
    health_score: o.healthScore, readiness_score: o.readinessScore,
    insights: o.insights, summary_daily: o.summaryDaily,
    summary_weekly: o.summaryWeekly, summary_monthly: o.summaryMonthly,
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
