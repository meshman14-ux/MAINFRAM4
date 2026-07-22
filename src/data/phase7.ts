/* ============================================================
   Phase 7 selectors — Timesheets & payroll.
   Groups an event's timesheets by staff member and prices them:
   hours via timesheetHours, rate = sheet override ?? staff day
   rate ?? 0, overtime paid at 1.5×. Pure, unit-testable.
   ============================================================ */
import type { OpsData } from './opsData';
import type { EventRec, Staff, Timesheet } from './types';

export interface PayrollRow {
  staffId: string;
  name: string;
  shifts: number;
  hours: number;
  cost: number;
}

export function payrollForEvent(d: OpsData, event: EventRec): PayrollRow[] {
  const byStaff = new Map<string, Timesheet[]>();
  d.timesheetsForEvent(event.id).forEach((t) => {
    const list = byStaff.get(t.staffId) ?? [];
    list.push(t);
    byStaff.set(t.staffId, list);
  });
  const rows: PayrollRow[] = [];
  byStaff.forEach((sheets, staffId) => {
    const staff = d.get<Staff>('staff', staffId);
    let hours = 0;
    let cost = 0;
    sheets.forEach((t) => {
      const h = d.timesheetHours(t);
      hours += h;
      cost += h * (t.rate ?? staff?.rate ?? 0) * (t.overtime ? 1.5 : 1);
    });
    rows.push({
      staffId,
      name: staff?.name ?? staffId,
      shifts: sheets.length,
      hours,
      cost,
    });
  });
  return rows.sort((a, b) => b.cost - a.cost);
}
