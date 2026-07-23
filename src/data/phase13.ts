/* ============================================================
   Phase 13 — sketch-notes refinements: two-level compliance.
   Personal (per-employee) RAG rollup and per-unit operational
   rollup, both pure so they unit-test directly and can feed the
   readiness hard gate later.
   ============================================================ */
import type { OpsData } from './opsData';
import type { Staff, Unit, ChecklistItem } from './types';

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
