/* ============================================================
   Phase 5 selectors — Callouts & Open Jobs, Onboarding, Readiness.
   Pure functions over OpsData, unit-testable.
   ============================================================ */
import type { OpsData } from './opsData';
import type { EventRec, Unit, Application, Area } from './types';
import { eventStaffing } from './home';
import { daysBetween, todayISO } from './home';

/* ---------------- Callouts & Open Jobs ---------------- */

export interface OpenPosition {
  eventId: string;
  eventName: string;
  clientId: string;
  unitId: string;
  unitCode: string;
  unitName: string;
  area: Area;
  gap: number;              // unfilled slots on this unit
  start?: string;
  end?: string;
  color: string;
}

/** Open positions across an event: units whose target exceeds assignments. */
export function openPositionsForEvent(d: OpsData, e: EventRec): OpenPosition[] {
  const out: OpenPosition[] = [];
  d.unitsForEvent(e).forEach((u) => {
    const assigned = d.assignmentsForEvent(e.id).filter((a) => a.unitId === u.id).length;
    const gap = Math.max(0, (u.crew || 0) - assigned);
    if (gap > 0) {
      out.push({
        eventId: e.id, eventName: e.name, clientId: e.clientId,
        unitId: u.id, unitCode: u.code, unitName: u.name,
        area: d.areaOfUnit(u), gap, start: e.start, end: e.end,
        color: d.eventColor(e.id),
      });
    }
  });
  return out;
}

/** Every open position for a client where the callout is open. */
export function openJobsForClient(d: OpsData, clientId: string): OpenPosition[] {
  return d.eventsForClient(clientId)
    .filter((e) => e.callout?.open)
    .flatMap((e) => openPositionsForEvent(d, e));
}

/**
 * Open jobs a crew member can see and apply for: callout open, they have the
 * skill, they're available, not already assigned or applied. Scored by the
 * same suitability engine so operators get a ranked applicant list later.
 */
export interface OpenJobForCrew extends OpenPosition {
  alreadyApplied: boolean;
  eligible: boolean;
  reasons: string[];
}

export function openJobsForCrew(d: OpsData, staffId: string): OpenJobForCrew[] {
  const staff = d.get('staff', staffId) as any;
  if (!staff) return [];
  const myApps = d.applicationsForStaff(staffId);
  const appliedKey = new Set(myApps.map((a) => `${a.eventId}:${a.unitId}`));

  // All clients with open callouts (crew may work across the pool if widened).
  const clients = d.all<{ id: string }>('clients');
  const jobs: OpenJobForCrew[] = [];
  clients.forEach((c) => {
    openJobsForClient(d, c.id).forEach((p) => {

      const skills = d.skillsOf(staff);
      const skillOk = skills.includes(p.area);
      const comp = d.staffCompliance(staff);
      const unavailable = d.staffUnavailableOn(staffId, p.start, p.end || p.start);
      const already = appliedKey.has(`${p.eventId}:${p.unitId}`) ||
        d.assignmentsForEvent(p.eventId).some((a) => a.unitId === p.unitId && a.staffId === staffId);
      const reasons: string[] = [];
      if (!skillOk) reasons.push(`no ${p.area} skill`);
      if (unavailable) reasons.push('unavailable');
      if (!comp.ok) reasons.push('compliance');
      jobs.push({
        ...p,
        alreadyApplied: appliedKey.has(`${p.eventId}:${p.unitId}`),
        eligible: skillOk && !unavailable && !already,
        reasons,
      });
    });
  });
  return jobs;
}

/** Applicants for an operator to review on a given event, ranked. */
export interface RankedApplicant {
  application: Application;
  staffId: string;
  name: string;
  area?: Area;
  unitId?: string;
  unitCode?: string;
  score: number;
  blocked: boolean;
  reasons: string[];
}

export function applicantsForEvent(d: OpsData, eventId: string): RankedApplicant[] {
  const apps = d.applicationsForEvent(eventId).filter((a) => a.status === 'applied');
  const event = d.get<EventRec>('events', eventId);
  return apps.map((a): RankedApplicant => {
    const staff = d.get('staff', a.staffId) as any;
    const unit = a.unitId ? d.get<Unit>('units', a.unitId) : null;
    // Score via the suitability engine (widen so cross-client applicants rank).
    let score = 0, blocked = true, reasons: string[] = ['unknown'];
    if (unit && staff) {
      const ranked = d.suitableForUnit(unit, { event: event || undefined, widen: true });
      const found = ranked.find((c) => c.id === a.staffId);
      if (found) { score = found.score; blocked = found.blocked; reasons = found.reasons; }
    }
    return {
      application: a, staffId: a.staffId, name: staff?.name ?? a.staffId,
      area: a.area, unitId: a.unitId, unitCode: unit?.code,
      score, blocked, reasons,
    };
  }).sort((x, y) => y.score - x.score);
}

/* ---------------- Onboarding (new client setup) ---------------- */

export interface OnboardingState {
  clientId: string;
  hasUnits: boolean;
  hasStaff: boolean;
  hasStock: boolean;
  unitCount: number;
  staffCount: number;
  stockCount: number;
  complete: boolean;
}

export function onboardingState(d: OpsData, clientId: string): OnboardingState {
  const units = d.unitsForClient(clientId);
  const staff = d.staffForClient(clientId);
  const stock = units.flatMap((u) => d.stockForUnit(u.id));
  const hasUnits = units.length > 0;
  const hasStaff = staff.length > 0;
  const hasStock = stock.length > 0;
  return {
    clientId,
    hasUnits, hasStaff, hasStock,
    unitCount: units.length, staffCount: staff.length, stockCount: stock.length,
    complete: hasUnits && hasStaff && hasStock,
  };
}

/* ---------------- Readiness (re-exported convenience) ---------------- */

export interface ReadinessView {
  eventId: string;
  eventName: string;
  daysOut: number;
  pct: number;
  ready: boolean;
  steps: { key: string; label: string; done: boolean }[];
  color: string;
}

export function readinessFor(d: OpsData, e: EventRec, today = todayISO()): ReadinessView {
  const r = d.eventReadiness(e);
  return {
    eventId: e.id,
    eventName: e.name,
    daysOut: daysBetween(today, e.start),
    pct: r.pct,
    ready: r.ready,
    steps: r.steps,
    color: d.eventColor(e.id),
  };
}

export function readinessForClient(d: OpsData, clientId: string, today = todayISO()): ReadinessView[] {
  return d.eventsForClient(clientId)
    .filter((e) => (e.end || e.start || '') >= today)
    .sort((a, b) => (a.start || '').localeCompare(b.start || ''))
    .map((e) => readinessFor(d, e, today));
}

// keep for tests
export { eventStaffing };
