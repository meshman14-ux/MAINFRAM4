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

/* ---------------- readiness prep panel (module 3) ---------------- */

export interface PrepSection {
  key: 'crew' | 'units' | 'stock' | 'compliance' | 'logistics' | 'documents';
  label: string;
  pct: number;               // 0–100
  done: boolean;
  items: string[];           // exact outstanding items
  link: string;              // deep-link to fix
  weight: number;
}

export interface PrepPanel {
  sections: PrepSection[];
  score: number;             // weighted 0–100
  blocked: boolean;          // hard gate: required compliance missing
  blockers: string[];
  ready: boolean;            // score 100 AND not blocked
}

/** Crew and compliance weigh more than stock — a fully stocked bar with no
    licensed staff is not "ready". */
const WEIGHTS: Record<PrepSection['key'], number> = {
  crew: 25, compliance: 30, units: 15, stock: 10, logistics: 10, documents: 10,
};

export function prepPanel(d: OpsData, e: EventRec): PrepPanel {
  const units = d.unitsForEvent(e);
  const assigns = d.assignmentsForEvent(e.id);
  const target = Object.values(d.staffingFor(e)).reduce((n: number, v) => n + (v as number), 0);
  const confirmed = assigns.filter((a) => a.confirmed).length;
  const clientId = e.clientId;

  // crew — half the credit for booking to target, half for confirmations
  const bookPct = target ? Math.min(1, assigns.length / target) : 0;
  const confPct = assigns.length ? confirmed / assigns.length : 0;
  const crewItems: string[] = [];
  if (assigns.length < target) crewItems.push(`${target - assigns.length} of ${target} unfilled`);
  if (confirmed < assigns.length) crewItems.push(`${assigns.length - confirmed} awaiting confirmation`);
  if (!target) crewItems.push('No staffing target set');
  const crew: PrepSection = {
    key: 'crew', label: 'Crew', weight: WEIGHTS.crew,
    pct: Math.round((bookPct * 0.5 + confPct * 0.5) * 100),
    done: target > 0 && assigns.length >= target && confirmed === assigns.length,
    items: crewItems, link: '#/callouts',
  };

  // units — on site with checklists progressing
  const unitTotals = units.map((u) => {
    const cl = u.checklist || [];
    return { u, total: cl.length, done: cl.filter((c) => c.on).length };
  });
  const totChecks = unitTotals.reduce((n, x) => n + x.total, 0);
  const doneChecks = unitTotals.reduce((n, x) => n + x.done, 0);
  const unitsSec: PrepSection = {
    key: 'units', label: 'Units', weight: WEIGHTS.units,
    pct: units.length === 0 ? 0 : totChecks === 0 ? 60 : Math.round((doneChecks / totChecks) * 100),
    done: units.length > 0 && totChecks > 0 && doneChecks === totChecks,
    items: units.length === 0
      ? ['No units allocated']
      : unitTotals.filter((x) => x.done < x.total).map((x) => `${x.u.code}: ${x.total - x.done} checks open`),
    link: `#/console/${clientId}`,
  };

  // stock — event units above par
  const unitIds = new Set(units.map((u) => u.id));
  const lines = d.all<{ unitId: string; qty: number; par: number }>('stock').filter((s) => unitIds.has(s.unitId));
  const low = lines.filter((s) => Number(s.qty) < Number(s.par));
  const stock: PrepSection = {
    key: 'stock', label: 'Stock', weight: WEIGHTS.stock,
    pct: lines.length ? Math.round(((lines.length - low.length) / lines.length) * 100) : 0,
    done: lines.length > 0 && low.length === 0,
    items: low.length ? [`${low.length} line${low.length !== 1 ? 's' : ''} below par`] : lines.length ? [] : ['No stock lines yet'],
    link: '#/stock',
  };

  // compliance — the hard gate: required unit checks + assigned crew RAG
  const unitComp = units.map(unitCompliance);
  const requiredOpen = unitComp.reduce((n, u) => n + u.requiredOpen, 0);
  const assignedStaff = [...new Set(assigns.map((a) => a.staffId))]
    .map((id) => d.get<Staff>('staff', id)).filter(Boolean) as Staff[];
  const crewRags = assignedStaff.map((s) => personalRag(d, s));
  const redCrew = crewRags.filter((r) => r.rag === 'red');
  const blockers = [
    ...unitComp.flatMap((u) => u.open.filter((c) => c.required).map((c) => `${u.unit.code}: ${c.item}`)),
    ...redCrew.map((r) => `${r.name}: ${r.items.filter((i) => i.state === 'missing' || i.state === 'expired').map((i) => i.type).join(', ')}`),
  ];
  const compProblems = requiredOpen + redCrew.length + crewRags.filter((r) => r.rag === 'amber').length;
  const compDenom = unitComp.reduce((n, u) => n + u.total, 0) + crewRags.length || 1;
  const compliance: PrepSection = {
    key: 'compliance', label: 'Compliance', weight: WEIGHTS.compliance,
    pct: Math.max(0, Math.round((1 - compProblems / compDenom) * 100)),
    done: compProblems === 0 && assigns.length > 0,
    items: blockers.length ? blockers : compProblems ? ['Expiring items to renew'] : [],
    link: '#/compliance',
  };

  // logistics — movements planned for the event
  const movements = d.movementsForEvent(e.id);
  const logistics: PrepSection = {
    key: 'logistics', label: 'Logistics', weight: WEIGHTS.logistics,
    pct: units.length === 0 ? 0 : Math.min(100, Math.round((movements.length / Math.max(1, units.length)) * 100)),
    done: movements.length >= Math.max(1, units.length),
    items: movements.length === 0 ? ['No movements planned'] : [],
    link: '#/logistics',
  };

  // documents — RAMS/docs flagged ready on the event, no expired docs in the hub
  const docs = d.all<{ clientId: string; expiry?: string }>('documents').filter((x) => x.clientId === clientId);
  const expired = docs.filter((x) => x.expiry && x.expiry < new Date().toISOString().slice(0, 10));
  const docsReady = !!(e.eventOnboarding && e.eventOnboarding.docs);
  const documents: PrepSection = {
    key: 'documents', label: 'Documents', weight: WEIGHTS.documents,
    pct: (docsReady ? 60 : 0) + (docs.length && expired.length === 0 ? 40 : 0),
    done: docsReady && expired.length === 0,
    items: [
      ...(docsReady ? [] : ['RAMS / docs not marked ready']),
      ...(expired.length ? [`${expired.length} document${expired.length !== 1 ? 's' : ''} expired`] : []),
    ],
    link: '#/compliance',
  };

  const sections = [crew, unitsSec, stock, compliance, logistics, documents];
  const totalW = sections.reduce((n, s) => n + s.weight, 0);
  const score = Math.round(sections.reduce((n, s) => n + s.pct * s.weight, 0) / totalW);
  const blocked = blockers.length > 0;
  return { sections, score, blocked, blockers, ready: !blocked && sections.every((s) => s.done) };
}

/* ---------------- calendar day itinerary (module 6) ---------------- */

export interface ItineraryEntry {
  time?: string;             // 'HH:MM' — timeless entries sort last
  kind: 'call' | 'journey' | 'phase' | 'units' | 'flag';
  label: string;
  sub?: string;
  eventId: string;
  eventName: string;
  color: string;
}

/** Everything happening on one date, across ALL events, in time order.
    Pass staffId for a crew member's personal itinerary — only their
    events, their journeys and their own unit. */
export function dayItinerary(d: OpsData, date: string, staffId?: string): ItineraryEntry[] {
  const out: ItineraryEntry[] = [];
  const events = d.all<EventRec>('events').filter((e) => {
    if (!e.start) return false;
    if (!(e.start <= date && date <= (e.end || e.start))) return false;
    if (staffId) {
      const mine = d.assignmentsForEvent(e.id).some((a) => a.staffId === staffId)
        || d.movementsForEvent(e.id).some((m) => m.driverId === staffId);
      if (!mine) return false;
    }
    return true;
  });

  for (const e of events) {
    const color = d.eventColor(e.id);
    const base = { eventId: e.id, eventName: e.name, color };

    if (e.callTime) out.push({ ...base, time: e.callTime, kind: 'call', label: `Crew call — ${e.name}`, sub: e.loc });

    const day = (e.schedule || []).find((s) => s.date === date);
    if (day) {
      out.push({
        ...base, time: day.open, kind: 'phase',
        label: `${day.phase} — ${e.name}`,
        sub: [day.open && day.close ? `${day.open}–${day.close}` : '', day.note || ''].filter(Boolean).join(' · ') || undefined,
      });
    }

    for (const m of d.movementsForEvent(e.id)) {
      if (m.departDate !== date) continue;
      if (staffId && m.driverId !== staffId) continue;
      const unit = m.unitId ? d.get<Unit>('units', m.unitId) : null;
      const driver = d.get<Staff>('staff', m.driverId);
      out.push({
        ...base, time: m.departTime, kind: 'journey',
        label: `${unit ? (unit.code || unit.type) : 'Support van'} departs — ${driver?.name ?? '—'}`,
        sub: m.tow ? 'towing · allow +20% journey time' : undefined,
      });
    }

    if (staffId) {
      const mine = d.assignmentsForEvent(e.id).find((a) => a.staffId === staffId);
      const unit = mine ? d.get<Unit>('units', mine.unitId) : null;
      if (unit) out.push({ ...base, kind: 'units', label: `Your unit: ${unit.code} · ${unit.name}`, sub: mine!.area });
    } else {
      const units = d.unitsForEvent(e);
      const assigns = d.assignmentsForEvent(e.id);
      const target = Object.values(d.staffingFor(e)).reduce((n: number, v) => n + (v as number), 0);
      out.push({
        ...base, kind: 'units',
        label: `${units.length} unit${units.length !== 1 ? 's' : ''} active — ${e.name}`,
        sub: `${assigns.length}/${target} crew · ${assigns.filter((a) => a.confirmed).length} confirmed`,
      });
      if (e.start === date) {
        const prep = prepPanel(d, e);
        if (prep.blocked) out.push({ ...base, kind: 'flag', label: `Readiness BLOCKED — ${e.name}`, sub: prep.blockers[0] });
      }
    }
  }

  return out.sort((a, b) => {
    if (a.time && b.time) return a.time.localeCompare(b.time) || a.eventName.localeCompare(b.eventName);
    if (a.time) return -1;
    if (b.time) return 1;
    return a.kind === 'flag' ? 1 : b.kind === 'flag' ? -1 : a.eventName.localeCompare(b.eventName);
  });
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
