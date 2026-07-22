/* ============================================================
   MAINFRAME — domain types
   ------------------------------------------------------------
   These mirror the exact record shapes in opsdeck-data.js.
   Field names match the JS backbone so the app logic is a
   straight port. Database column names (snake_case) are mapped
   to these camelCase keys in the data-access layer.
   ============================================================ */

export type ClientStatus = 'Active' | 'Lead' | 'Inactive';
export type RTWStatus = 'Verified' | 'Pending' | 'Expired' | 'Missing';
export type Area = 'Bar' | 'Coffee' | 'Food' | 'General' | 'Driver' | 'Supervisor';
export type Role = 'owner' | 'manager' | 'crew' | 'client';

export interface Client {
  id: string;                 // 'C001'
  name: string;
  contact?: string;
  phone?: string;
  email?: string;
  status?: ClientStatus;
}

export interface ScheduleDay {
  id: string;                 // 'd1'
  date: string;               // ISO 'YYYY-MM-DD'
  phase: string;              // 'Trading Day', 'Build / Set-up', ...
  open?: string;              // '12:00'
  close?: string;             // '23:00'
  note?: string;
}

export interface EventRec {
  id: string;                 // 'E001'
  clientId: string;
  name: string;
  loc?: string;
  start?: string;             // ISO date
  end?: string;               // ISO date
  callTime?: string;          // '07:00'
  notes?: string;
  unitIds?: string[];         // explicit fleet for this event (else client's whole fleet)
  staffing?: Partial<Record<Area, number>>;  // manager override of required headcount
  schedule?: ScheduleDay[];
  shortlist?: Record<string, string[]>;       // { unitId: [staffId, ...] }
  callout?: Callout;          // job-board callout state
  eventOnboarding?: Record<string, boolean> & { ready?: boolean };
}

export interface Callout {
  open: boolean;
  message?: string;
  sentAt?: number;
}

export interface ChecklistItem {
  id: string;
  cat: 'Equipment' | 'Safety' | 'Consumables' | 'Documentation' | 'Tools';
  item: string;
  on: boolean;
}

export interface Unit {
  id: string;                 // 'U001'
  clientId: string;
  type: string;               // 'Bar' | 'Coffee' | 'Food' | 'Catering' | 'Support'
  code: string;               // 'BAR-01'
  name: string;
  desc?: string;
  crew: number;               // target headcount per unit
  pool?: string[];            // standing pool of staff ids who CAN work it
  checklist?: ChecklistItem[];
}

export interface Staff {
  id: string;                 // 'S001'
  clientId: string;
  name: string;
  role: string;               // 'Unit Manager', 'Bartender', ...
  phone?: string;
  rate?: number;
  rtw?: RTWStatus;
  canTow?: boolean;
  skills?: Area[];            // explicit; else derived from role
}

export interface Assignment {
  id: string;                 // 'A001'
  eventId: string;
  unitId: string;
  staffId: string;
  area?: Area;
  confirmed?: boolean;
  overtime?: boolean;
}

export interface StockLine {
  id: string;                 // 'K001'
  unitId: string;
  item: string;
  qty: number;
  par: number;
  unit?: string;              // 'kegs', 'kg', ...
}

export interface Application {
  id: string;                 // 'P...'
  eventId: string;
  unitId?: string;
  staffId: string;
  area?: Area;
  status?: 'applied' | 'approved' | 'declined';
  overtime?: boolean;
  assignmentId?: string;      // set when approved
}

/** The whole store, keyed by id — mirrors the localStorage `db` object. */
export interface OpsState {
  meta: { version: number; updatedAt: number };
  clients: Record<string, Client>;
  events: Record<string, EventRec>;
  units: Record<string, Unit>;
  staff: Record<string, Staff>;
  assignments: Record<string, Assignment>;
  stock: Record<string, StockLine>;
  applications: Record<string, Application>;
  kv: Record<string, unknown>;
  // Promoted from kv in the hardening pass — real, per-crew tables.
  certs: Record<string, Cert>;
  availability: Record<string, AvailabilityDay>;
  // Phase 8 — sales pipeline (operator-only; RLS-restricted).
  pipeline: Record<string, PipelineEntry>;
  // Phase 9 — logistics / vehicle & driver movements (operator-only).
  movements: Record<string, Movement>;
  // Phase 10 — per-event tasks (operator-only).
  eventTasks: Record<string, EventTask>;
}

export interface Cert {
  id: string;
  staffId: string;
  type: string;
  expiry?: string;
}

export interface AvailabilityDay {
  staffId: string;
  date: string;
  available: boolean;   // false = unavailable that day
}

/* ---------------- Phase 8: Sales Pipeline (CRM) ---------------- */

export type PipelineStage = 'lead' | 'contacted' | 'diagnostic' | 'proposal' | 'won' | 'lost';

export const PIPELINE_STAGES: PipelineStage[] = ['lead', 'contacted', 'diagnostic', 'proposal', 'won', 'lost'];
/** The forward funnel order, excluding the 'lost' side-branch. */
export const PIPELINE_FUNNEL: PipelineStage[] = ['lead', 'contacted', 'diagnostic', 'proposal', 'won'];

export interface PipelineEntry {
  id: string;
  name: string;                 // prospect name, free text until resolved to a client
  clientId?: string;            // set once a job is booked -> a real mf_clients row
  stage: PipelineStage;
  priorStage?: PipelineStage;   // remembered so 'lost' can be reopened to where it was
  value?: number;                // deal value, £
  nextStep?: string;
}

/* ---------------- Phase 9: Logistics (vehicle & driver movements) ---------------- */

export type MovementStatus = 'planned' | 'en-route' | 'on-site' | 'returned';
export const MOVEMENT_STATUSES: MovementStatus[] = ['planned', 'en-route', 'on-site', 'returned'];

export interface Movement {
  id: string;
  eventId: string;
  unitId?: string;        // undefined = support van, no trailer
  driverId: string;
  departDate?: string;
  departTime?: string;
  tow: boolean;            // true when unitId is a real towed unit
  status: MovementStatus;
}

/* ---------------- Phase 10: per-event Tasks ---------------- */

export type TaskCategory = 'Prep' | 'Crew' | 'Stock' | 'Compliance' | 'Client' | 'General';
export const TASK_CATEGORIES: TaskCategory[] = ['Prep', 'Crew', 'Stock', 'Compliance', 'Client', 'General'];

export interface EventTask {
  id: string;
  eventId: string;
  title: string;
  category: TaskCategory;
  done: boolean;
  dueDate?: string;
  assignedTo?: string;    // staff id
  notes?: string;
}

export type TableName =
  | 'clients' | 'events' | 'units' | 'staff'
  | 'assignments' | 'stock' | 'applications';

/** Derived compliance result (from staffCompliance). */
export interface Compliance {
  rtwOk: boolean;
  certsOk: boolean;
  expiredCount: number;
  ok: boolean;
}

/** A scored suitability candidate (from suitableForUnit). */
export interface Candidate {
  staff: Staff;
  id: string;
  name: string;
  skills: Area[];
  area: Area;
  skillOk: boolean;
  compliance: Compliance;
  available: boolean;
  unavailable: boolean;
  pastShifts: number;
  ownClient: boolean;
  reasons: string[];
  blocked: boolean;
  score: number;
  inPool: boolean;
  inShortlist: boolean;
}

export interface AccessRow {
  userId: string;
  role: Role;
  clientId?: string;
  staffId?: string;
}
