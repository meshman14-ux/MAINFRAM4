/* ============================================================
   Phase 6 selectors — Compliance register, Stock ordering, Finance.
   Reuses complianceDetail, crewCost, lowStockForClient, and the new
   double-booking detection. Pure, unit-testable.
   ============================================================ */
import type { OpsData } from './opsData';
import type { EventRec, Staff, StockLine } from './types';
import { todayISO } from './home';

/* ---------------- Compliance register ---------------- */

export interface ComplianceRow {
  staffId: string;
  name: string;
  role: string;
  rtw?: string;
  status: 'compliant' | 'expiring' | 'blocked';
  required: string[];
  issues: string[];          // human-readable problems
  expiringSoon: { type: string; expiry?: string }[];
}

export function complianceRegister(d: OpsData, clientId: string): ComplianceRow[] {
  return d.staffForClient(clientId).map((s: Staff): ComplianceRow => {
    const detail = d.complianceDetail(s);
    const issues: string[] = [];
    if (!detail.rtwOk) issues.push('RTW not verified');
    detail.certs.forEach((c) => {
      if (c.state === 'missing') issues.push(`${c.type} missing`);
      if (c.state === 'expired') issues.push(`${c.type} expired`);
    });
    const expiringSoon = detail.certs.filter((c) => c.state === 'expiring').map((c) => ({ type: c.type, expiry: c.expiry }));
    return {
      staffId: s.id, name: s.name, role: s.role, rtw: s.rtw,
      status: detail.status, required: detail.required, issues, expiringSoon,
    };
  }).sort((a, b) => {
    const rank = { blocked: 0, expiring: 1, compliant: 2 } as const;
    return rank[a.status] - rank[b.status];
  });
}

export interface ComplianceSummary {
  total: number;
  compliant: number;
  expiring: number;
  blocked: number;
  doubleBookings: { staffName: string; eventA?: string; eventB?: string }[];
}

export function complianceSummary(d: OpsData, clientId: string): ComplianceSummary {
  const rows = complianceRegister(d, clientId);
  const db = d.doubleBookingsForClient(clientId).map((x) => ({
    staffName: x.staffName, eventA: x.eventA?.name, eventB: x.eventB?.name,
  }));
  return {
    total: rows.length,
    compliant: rows.filter((r) => r.status === 'compliant').length,
    expiring: rows.filter((r) => r.status === 'expiring').length,
    blocked: rows.filter((r) => r.status === 'blocked').length,
    doubleBookings: db,
  };
}

/* ---------------- Stock ordering ---------------- */

export interface OrderLine {
  unitId: string;
  unitCode: string;
  unitName: string;
  item: string;
  onHand: number;
  par: number;
  orderQty: number;
  unit?: string;
}

/** Aggregate reorder list for a client: every below-par line, order = par−qty. */
export function reorderForClient(d: OpsData, clientId: string): OrderLine[] {
  const units = d.unitsForClient(clientId);
  const byId = new Map(units.map((u) => [u.id, u]));
  return d.lowStockForClient(clientId).map((s: StockLine): OrderLine => {
    const u = byId.get(s.unitId);
    return {
      unitId: s.unitId, unitCode: u?.code ?? '', unitName: u?.name ?? '',
      item: s.item, onHand: Number(s.qty), par: Number(s.par),
      orderQty: Math.max(0, Number(s.par) - Number(s.qty)), unit: s.unit,
    };
  }).sort((a, b) => a.unitCode.localeCompare(b.unitCode) || a.item.localeCompare(b.item));
}

export function reorderCsv(lines: OrderLine[]): string {
  const rows = lines.map((l) => [l.unitCode, l.item, String(l.orderQty), l.unit ?? ''].join(','));
  return ['Unit,Item,Order qty,UoM', ...rows].join('\n');
}

/* ---------------- Finance ---------------- */

export interface EventFinance {
  eventId: string;
  eventName: string;
  start?: string;
  end?: string;
  tradingHours: number;
  confirmedCrew: number;
  crewCost: number;
  color: string;
}

export function eventFinance(d: OpsData, e: EventRec): EventFinance {
  const confirmed = d.assignmentsForEvent(e.id).filter((a) => a.confirmed);
  return {
    eventId: e.id, eventName: e.name, start: e.start, end: e.end,
    tradingHours: d.tradingHours(e),
    confirmedCrew: confirmed.length,
    crewCost: d.crewCost(e),
    color: d.eventColor(e.id),
  };
}

export interface ClientFinance {
  clientId: string;
  events: EventFinance[];
  totalCrewCost: number;
  totalConfirmed: number;
  upcomingCost: number;   // cost of events not yet past
}

export function clientFinance(d: OpsData, clientId: string, today = todayISO()): ClientFinance {
  const events = d.eventsForClient(clientId)
    .sort((a, b) => (a.start || '').localeCompare(b.start || ''))
    .map((e) => eventFinance(d, e));
  const upcomingCost = events
    .filter((e) => (e.end || e.start || '') >= today)
    .reduce((sum, e) => sum + e.crewCost, 0);
  return {
    clientId,
    events,
    totalCrewCost: events.reduce((sum, e) => sum + e.crewCost, 0),
    totalConfirmed: events.reduce((sum, e) => sum + e.confirmedCrew, 0),
    upcomingCost,
  };
}
