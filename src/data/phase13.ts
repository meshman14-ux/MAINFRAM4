/* ============================================================
   Phase 13 — sketch-notes refinements: two-level compliance.
   Personal (per-employee) RAG rollup and per-unit operational
   rollup, both pure so they unit-test directly and can feed the
   readiness hard gate later.
   ============================================================ */
import type { OpsData } from './opsData';
import type { Staff, Unit, ChecklistItem, EventRec, CalloutRequest, Candidate } from './types';

export type Rag = 'red' | 'amber' | 'green';

export interface PersonalItem {
  type: string;              // 'RTW' or a cert type
  state: 'ok' | 'expiring' | 'expired' | 'missing';
  expiry?: string;
  days?: number;             // days until expiry (negative = past)
}

export interface PersonalRag {
  staffId: string;
  name: string;
  role: string;
  rag: Rag;                  // red = missing/expired required · amber = expiring ≤60d · green = clear
  items: PersonalItem[];     // every required item with its exact state
  problems: number;          // items not 'ok'
}

/** Per-employee compliance with RAG status. Red when anything required is
    missing/expired (incl. RTW), amber when only expiries ≤60d loom. */
export function personalRag(d: OpsData, staff: Staff, today = new Date()): PersonalRag {
  const det = d.complianceDetail(staff);
  const items: PersonalItem[] = [
    { type: 'Right to work', state: det.rtwOk ? 'ok' : 'missing' },
    ...det.certs.map((c): PersonalItem => ({
      type: c.type, state: c.state, expiry: c.expiry,
      days: c.expiry ? Math.round((new Date(c.expiry + 'T00:00:00').getTime() - today.getTime()) / 86400000) : undefined,
    })),
  ];
  const red = items.some((i) => i.state === 'missing' || i.state === 'expired');
  const amber = items.some((i) => i.state === 'expiring');
  return {
    staffId: staff.id, name: staff.name, role: staff.role,
    rag: red ? 'red' : amber ? 'amber' : 'green',
    items,
    problems: items.filter((i) => i.state !== 'ok').length,
  };
}

export interface UnitCompliance {
  unit: Unit;
  total: number;             // compliance-relevant checks (Safety + Documentation)
  done: number;
  requiredOpen: number;      // unticked items marked required
  rag: Rag;
  open: ChecklistItem[];     // the unticked compliance items
}

/** Per-unit operational compliance — the Safety/Documentation slice of the
    unit checklist. Red when a required item is unticked, amber when anything
    compliance-relevant is open, green when all ticked. */
export function unitCompliance(unit: Unit): UnitCompliance {
  const rel = (unit.checklist || []).filter((c) => c.cat === 'Safety' || c.cat === 'Documentation');
  const open = rel.filter((c) => !c.on);
  const requiredOpen = open.filter((c) => c.required).length;
  return {
    unit,
    total: rel.length,
    done: rel.length - open.length,
    requiredOpen,
    rag: requiredOpen > 0 ? 'red' : open.length > 0 ? 'amber' : 'green',
    open,
  };
}

/* ---------------- callouts by skill (module 2) ---------------- */

export interface CalloutFillRow extends CalloutRequest {
  unitCode: string;
  unitName: string;
  filled: number;          // assignments on the unit (approval creates one)
  pending: number;         // applications awaiting operator approval
}

/** The event's skill requests — explicit ones if the operator set them,
    otherwise derived from each unit's staffing gap. */
export function calloutRequests(d: OpsData, e: EventRec): CalloutRequest[] {
  if (e.callout?.requests?.length) return e.callout.requests;
  return d.unitsForEvent(e).flatMap((u) => {
    const assigned = d.assignmentsForEvent(e.id).filter((a) => a.unitId === u.id).length;
    const gap = Math.max(0, (u.crew || 0) - assigned);
    return gap > 0 ? [{ unitId: u.id, area: d.areaOfUnit(u), needed: gap }] : [];
  });
}

/** Live fill per request + the event rollup for Home's crew tile. */
export function calloutFill(d: OpsData, e: EventRec): { rows: CalloutFillRow[]; needed: number; filled: number } {
  const rows = calloutRequests(d, e).map((r) => {
    const u = d.get<Unit>('units', r.unitId);
    const filled = d.assignmentsForEvent(e.id).filter((a) => a.unitId === r.unitId).length;
    const pending = d.all<{ id: string; eventId: string; unitId?: string; status?: string }>('applications')
      .filter((p) => p.eventId === e.id && p.unitId === r.unitId && (p.status ?? 'applied') === 'applied').length;
    return { ...r, unitCode: u?.code ?? '', unitName: u?.name ?? '', filled, pending };
  });
  return {
    rows,
    needed: rows.reduce((n, r) => n + r.needed, 0),
    filled: rows.reduce((n, r) => n + Math.min(r.filled, r.needed), 0),
  };
}

/** Auto-shortlist for a request: the unit's suitable, unblocked, unassigned
    candidates, best first. Reuses the staffing suitability engine. */
export function autoShortlist(d: OpsData, e: EventRec, unitId: string, limit = 5): Candidate[] {
  const unit = d.get<Unit>('units', unitId);
  if (!unit) return [];
  const assigned = new Set(d.assignmentsForEvent(e.id).map((a) => a.staffId));
  return d.suitableForUnit(unit, { event: e })
    .filter((c) => !c.blocked && !assigned.has(c.id))
    .slice(0, limit);
}

/** Both levels rolled up for the Information Hub header. */
export function complianceRollup(d: OpsData, clientId: string): {
  unitOpen: number; unitRequiredOpen: number; crewProblems: number; crewRed: number;
} {
  const units = d.unitsForClient(clientId).map(unitCompliance);
  const crew = d.staffForClient(clientId).map((s) => personalRag(d, s));
  return {
    unitOpen: units.reduce((n, u) => n + u.open.length, 0),
    unitRequiredOpen: units.reduce((n, u) => n + u.requiredOpen, 0),
    crewProblems: crew.reduce((n, c) => n + c.problems, 0),
    crewRed: crew.filter((c) => c.rag === 'red').length,
  };
}
