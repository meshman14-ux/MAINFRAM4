/* ============================================================
   OpsData — the typed data-access layer
   ------------------------------------------------------------
   This is the Supabase-backed replacement for the prototype's
   window.OPSDATA. It keeps the SAME method surface the app
   already uses — all() / get() / save() / remove() / subscribe()
   — plus the load/persist/subscribe/emit lifecycle, so every
   existing module becomes a thin view over this with no rewrite.

   Strategy:
     - load(): one initial fetch of every table into an in-memory
       mirror (same {table: {id: row}} shape as localStorage db).
     - reads (all/get + all relational + derived helpers) run
       synchronously against that mirror — identical to before.
     - writes (save/remove) go to Supabase, update the mirror
       optimistically, then emit().
     - realtime: postgres_changes on every table patches the
       mirror and emits(), so every device stays live.
   ============================================================ */
import { supabase } from '../lib/supabase';
import { DB_TABLE, fromRow, toRow } from './mappers';
import type {
  OpsState, TableName, EventRec, Unit, Staff,
  Assignment, StockLine, Application, Area, Compliance, Candidate,
  Cert, AvailabilityDay,
} from './types';

type Row = Record<string, any>;
type Sub = () => void;

const PREFIX: Record<TableName, string> = {
  clients: 'C', events: 'E', units: 'U', staff: 'S',
  assignments: 'A', stock: 'K', applications: 'P',
};

const AREAS: Area[] = ['Bar', 'Coffee', 'Food', 'General', 'Driver', 'Supervisor'];

export class OpsData {
  private db: OpsState = emptyState();
  private subs: Sub[] = [];
  private ready = false;
  private channel: ReturnType<typeof supabase.channel> | null = null;
  // Echo suppression: rows we just wrote locally, with a timestamp. A realtime
  // event for one of these within the window is our own write coming back — we
  // skip it so it can't clobber a newer local edit (last-write-wins hazard).
  private localWrites = new Map<string, number>();
  private static ECHO_WINDOW_MS = 4000;

  private markLocalWrite(t: TableName, id: string): void {
    this.localWrites.set(`${t}:${id}`, Date.now());
  }

  private isOwnEcho(t: TableName, id: string): boolean {
    const key = `${t}:${id}`;
    const at = this.localWrites.get(key);
    if (at === undefined) return false;
    if (Date.now() - at > OpsData.ECHO_WINDOW_MS) {
      this.localWrites.delete(key);
      return false;
    }
    // Consume it: the first echo is suppressed, later genuine changes apply.
    this.localWrites.delete(key);
    return true;
  }

  /* ---------------- lifecycle ---------------- */

  /** Initial load of every table into the in-memory mirror. */
  async load(): Promise<void> {
    const tables = Object.keys(DB_TABLE) as TableName[];
    await Promise.all(
      tables.map(async (t) => {
        const { data, error } = await supabase.from(DB_TABLE[t]).select('*');
        if (error) throw new Error(`load ${t}: ${error.message}`);
        const bucket: Record<string, any> = {};
        (data ?? []).forEach((r: Row) => {
          bucket[r.id] = (fromRow[t] as (x: Row) => any)(r);
        });
        (this.db as any)[t] = bucket;
      })
    );
    // kv — global JSON blobs keyed by ns
    const { data: kvRows } = await supabase.from('mf_kv').select('*');
    const kv: Record<string, unknown> = {};
    (kvRows ?? []).forEach((r: Row) => { kv[r.ns] = r.data; });
    this.db.kv = kv;

    // certs — promoted real table, keyed by id
    const { data: certRows } = await supabase.from('mf_certs').select('*');
    const certs: Record<string, any> = {};
    (certRows ?? []).forEach((r: Row) => {
      certs[r.id] = { id: r.id, staffId: r.staff_id, type: r.type, expiry: r.expiry ?? undefined };
    });
    this.db.certs = certs;

    // availability — promoted real table, keyed by staffId:date
    const { data: availRows } = await supabase.from('mf_availability').select('*');
    const availability: Record<string, any> = {};
    (availRows ?? []).forEach((r: Row) => {
      availability[`${r.staff_id}:${r.date}`] = { staffId: r.staff_id, date: r.date, available: r.available };
    });
    this.db.availability = availability;

    this.ready = true;
    this.subscribeRealtime();
    this.emit();
  }

  isReady(): boolean { return this.ready; }

  /** Monotonic version — bumped on every emit so React memos can depend on it. */
  meta(): { version: number; updatedAt: number } { return this.db.meta; }

  subscribe(fn: Sub): () => void {
    this.subs.push(fn);
    return () => {
      const i = this.subs.indexOf(fn);
      if (i >= 0) this.subs.splice(i, 1);
    };
  }

  private emit(): void {
    this.db.meta.updatedAt = Date.now();
    this.subs.slice().forEach((f) => { try { f(); } catch { /* noop */ } });
  }

  /** Realtime: patch the mirror on any change, then emit. */
  private subscribeRealtime(): void {
    if (this.channel) return;
    const ch = supabase.channel('mainframe-live');
    (Object.keys(DB_TABLE) as TableName[]).forEach((t) => {
      ch.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: DB_TABLE[t] },
        (payload: any) => this.applyRealtime(t, payload)
      );
    });
    ch.subscribe();
    this.channel = ch;
  }

  private applyRealtime(t: TableName, payload: any): void {
    const bucket = (this.db as any)[t] as Record<string, any>;
    if (payload.eventType === 'DELETE') {
      const id = payload.old?.id;
      if (id) delete bucket[id];
    } else {
      const row = payload.new;
      if (!row?.id) return;
      // Suppress our own write echoing back (would clobber a newer local edit).
      if (this.isOwnEcho(t, row.id)) return;
      bucket[row.id] = (fromRow[t] as (x: Row) => any)(row);
    }
    this.emit();
  }

  uid(t: TableName): string {
    return (PREFIX[t] || 'X') + '-' +
      Date.now().toString(36).slice(-4) +
      Math.random().toString(36).slice(2, 5);
  }

  /* ---------------- generic reads (sync, off the mirror) ---------------- */

  all<T = any>(t: TableName): T[] {
    const o = (this.db as any)[t] || {};
    return Object.keys(o).map((k) => o[k]);
  }

  get<T = any>(t: TableName, id: string): T | null {
    return ((this.db as any)[t] || {})[id] || null;
  }

  /* ---------------- generic writes (async, to Supabase) ---------------- */

  /**
   * Upsert a row. Safe against the "cold mirror" hazard: if we're doing a
   * PARTIAL update (no full row in memory) we first fetch the current row so
   * an upsert can't blank JSONB columns (schedule, shortlist, …) we never
   * loaded. Pass a full object to skip the fetch.
   */
  async save<T extends { id?: string }>(t: TableName, obj: T): Promise<T & { id: string }> {
    const isNew = !obj.id;
    if (!obj.id) obj.id = this.uid(t);
    const bucket = (this.db as any)[t] as Record<string, any>;

    let base = bucket[obj.id];
    // Cold mirror on an existing row: fetch before merging so we don't wipe
    // columns absent from `obj`. (Skipped for brand-new rows.)
    if (!isNew && base === undefined && this.ready) {
      const { data } = await supabase.from(DB_TABLE[t]).select('*').eq('id', obj.id).maybeSingle();
      if (data) base = (fromRow[t] as (x: Row) => any)(data);
    }

    const merged = Object.assign({}, base, obj) as T & { id: string };
    bucket[obj.id] = merged;                       // optimistic
    this.markLocalWrite(t, merged.id);
    this.emit();

    const row = (toRow[t] as (x: any) => Row)(merged);
    const { error } = await supabase.from(DB_TABLE[t]).upsert(row);
    if (error) throw new Error(`save ${t}: ${error.message}`);
    return merged;
  }

  /**
   * Deep-merge a single JSONB field safely (read-modify-write on the field
   * only). Use for nested maps like event.shortlist so a partial write to one
   * key doesn't replace the whole object.
   */
  async patchJson<T extends { id: string }>(
    t: TableName, id: string, field: keyof T, updater: (current: any) => any
  ): Promise<void> {
    let current = (this.get<any>(t, id) || {})[field];
    if (current === undefined && this.ready) {
      const { data } = await supabase.from(DB_TABLE[t]).select('*').eq('id', id).maybeSingle();
      if (data) current = (fromRow[t] as (x: Row) => any)(data)[field as string];
    }
    const next = updater(current);
    await this.save(t, { id, [field]: next } as any);
  }

  async remove(t: TableName, id: string): Promise<void> {
    const bucket = (this.db as any)[t] as Record<string, any>;
    this.markLocalWrite(t, id);
    delete bucket[id];
    // Cascades are enforced by ON DELETE CASCADE in the DB; mirror
    // them locally so the UI updates instantly before realtime lands.
    if (t === 'clients') {
      (['events', 'units', 'staff'] as TableName[]).forEach((tt) => {
        this.all(tt).forEach((r: any) => { if (r.clientId === id) delete (this.db as any)[tt][r.id]; });
      });
    }
    if (t === 'events') {
      this.all('assignments').forEach((a: Assignment) => { if (a.eventId === id) delete this.db.assignments[a.id]; });
      this.all('applications').forEach((p: Application) => { if (p.eventId === id) delete this.db.applications[p.id]; });
    }
    if (t === 'units') {
      this.all('assignments').forEach((a: Assignment) => { if (a.unitId === id) delete this.db.assignments[a.id]; });
      this.all('stock').forEach((s: StockLine) => { if (s.unitId === id) delete this.db.stock[s.id]; });
    }
    if (t === 'staff') {
      this.all('assignments').forEach((a: Assignment) => { if (a.staffId === id) delete this.db.assignments[a.id]; });
      this.all('applications').forEach((p: Application) => { if (p.staffId === id) delete this.db.applications[p.id]; });
    }
    this.emit();

    const { error } = await supabase.from(DB_TABLE[t]).delete().eq('id', id);
    if (error) throw new Error(`remove ${t}: ${error.message}`);
  }

  /* ---------------- kv store ---------------- */

  kvGet<T = unknown>(ns: string): T | null {
    return (this.db.kv && this.db.kv[ns] !== undefined)
      ? (this.db.kv[ns] as T) : null;
  }

  async kvSet<T>(ns: string, val: T): Promise<T> {
    this.db.kv[ns] = val;
    this.emit();
    const { error } = await supabase.from('mf_kv')
      .upsert({ ns, data: val, updated_at: new Date().toISOString() });
    if (error) throw new Error(`kvSet ${ns}: ${error.message}`);
    return val;
  }

  /* ============================================================
     RELATIONAL HELPERS — ported verbatim from opsdeck-data.js
     ============================================================ */

  eventsForClient(cid: string): EventRec[] {
    return this.all<EventRec>('events').filter((e) => e.clientId === cid);
  }
  unitsForClient(cid: string): Unit[] {
    return this.all<Unit>('units').filter((u) => u.clientId === cid);
  }
  staffForClient(cid: string): Staff[] {
    return this.all<Staff>('staff').filter((s) => s.clientId === cid);
  }
  stockForUnit(uid: string): StockLine[] {
    return this.all<StockLine>('stock').filter((s) => s.unitId === uid);
  }
  unitsForEvent(e: EventRec | null): Unit[] {
    if (!e) return [];
    if (Array.isArray(e.unitIds) && e.unitIds.length) {
      return e.unitIds
        .map((id) => this.get<Unit>('units', id))
        .filter((u): u is Unit => !!u);
    }
    return this.unitsForClient(e.clientId);
  }
  assignmentsForEvent(eid: string): Assignment[] {
    return this.all<Assignment>('assignments').filter((a) => a.eventId === eid);
  }
  assignmentsForStaff(sid: string): Assignment[] {
    return this.all<Assignment>('assignments').filter((a) => a.staffId === sid);
  }
  assignedStaff(eid: string, uid: string): Assignment[] {
    return this.assignmentsForEvent(eid).filter((a) => a.unitId === uid);
  }
  applicationsForEvent(eid: string): Application[] {
    return this.all<Application>('applications').filter((p) => p.eventId === eid);
  }
  applicationsForStaff(sid: string): Application[] {
    return this.all<Application>('applications').filter((p) => p.staffId === sid);
  }

  /* ---------------- Phase 5 workflow helpers ---------------- */

  /** Open or close an event's job callout. */
  async toggleCallout(eventId: string, open: boolean, message?: string): Promise<void> {
    const e = this.get<EventRec>('events', eventId);
    const callout = { open, message: message ?? e?.callout?.message, sentAt: open ? Date.now() : e?.callout?.sentAt };
    await this.save('events', { id: eventId, callout });
  }

  /** A crew member applies for an open position. */
  async apply(eventId: string, unitId: string, staffId: string, area?: Area): Promise<Application> {
    return this.save<Partial<Application>>('applications', {
      eventId, unitId, staffId, area, status: 'applied',
    }) as Promise<Application>;
  }

  /**
   * Operator approves an application → creates the assignment and links it
   * back on the application. The inverse of a crew gap being filled.
   */
  async approveApplication(applicationId: string): Promise<void> {
    const app = this.get<Application>('applications', applicationId);
    if (!app) throw new Error('Application not found');
    if (!app.unitId) throw new Error('Application has no unit');
    const assignment = await this.save<Partial<Assignment>>('assignments', {
      eventId: app.eventId, unitId: app.unitId, staffId: app.staffId,
      area: app.area, confirmed: false,
    });
    await this.save('applications', {
      id: applicationId, status: 'approved', assignmentId: assignment.id,
    });
  }

  async declineApplication(applicationId: string): Promise<void> {
    await this.save('applications', { id: applicationId, status: 'declined' });
  }

  /* ---------------- Double-booking detection (Phase 6) ---------------- */

  /** Do two events overlap in date range? (inclusive, date-only) */
  eventsOverlap(a: EventRec | null, b: EventRec | null): boolean {
    if (!a || !b || a.id === b.id) return false;
    const aStart = a.start || a.end;
    const aEnd = a.end || a.start;
    const bStart = b.start || b.end;
    const bEnd = b.end || b.start;
    if (!aStart || !aEnd || !bStart || !bEnd) return false;
    return aStart <= bEnd && bStart <= aEnd;
  }

  /**
   * Double-bookings for a staff member: pairs of their assignments whose
   * events overlap in time. Returns each conflicting pair once.
   */
  doubleBookingsForStaff(staffId: string): { a: Assignment; b: Assignment; eventA?: EventRec; eventB?: EventRec }[] {
    const assigns = this.assignmentsForStaff(staffId);
    const out: { a: Assignment; b: Assignment; eventA?: EventRec; eventB?: EventRec }[] = [];
    for (let i = 0; i < assigns.length; i++) {
      for (let j = i + 1; j < assigns.length; j++) {
        const eA = this.get<EventRec>('events', assigns[i].eventId);
        const eB = this.get<EventRec>('events', assigns[j].eventId);
        if (this.eventsOverlap(eA, eB)) {
          out.push({ a: assigns[i], b: assigns[j], eventA: eA || undefined, eventB: eB || undefined });
        }
      }
    }
    return out;
  }

  /** All double-bookings across a client's staff (for the compliance register). */
  doubleBookingsForClient(clientId: string): { staffId: string; staffName: string; eventA?: EventRec; eventB?: EventRec }[] {
    const out: { staffId: string; staffName: string; eventA?: EventRec; eventB?: EventRec }[] = [];
    this.staffForClient(clientId).forEach((s) => {
      this.doubleBookingsForStaff(s.id).forEach((pair) => {
        out.push({ staffId: s.id, staffName: s.name, eventA: pair.eventA, eventB: pair.eventB });
      });
    });
    return out;
  }

  /* ---------------- skills / staffing model ---------------- */

  areaOfUnit(u: Unit | null): Area {
    const t = (u && u.type ? u.type : '').toLowerCase();
    if (t.indexOf('bar') >= 0) return 'Bar';
    if (t.indexOf('coffee') >= 0 || t.indexOf('barista') >= 0) return 'Coffee';
    if (t.indexOf('food') >= 0 || t.indexOf('cater') >= 0 || t.indexOf('kitchen') >= 0) return 'Food';
    return 'General';
  }

  skillsOf(staff: Staff | null): Area[] {
    if (staff && Array.isArray(staff.skills)) return staff.skills;
    const role = (staff && staff.role ? staff.role : '').toLowerCase();
    if (role.indexOf('manager') >= 0) return ['Bar', 'Supervisor', 'General'];
    if (role.indexOf('bartender') >= 0 || role.indexOf('bar ') >= 0) return ['Bar', 'General'];
    if (role.indexOf('barista') >= 0) return ['Coffee', 'General'];
    if (role.indexOf('chef') >= 0) return ['Food', 'Supervisor'];
    if (role.indexOf('kitchen') >= 0) return ['Food', 'General'];
    if (role.indexOf('driver') >= 0) return ['Driver', 'General'];
    return ['General'];
  }

  /** Required headcount per area: manager override or summed unit crew. */
  staffingFor(e: EventRec | null): Record<Area, number> {
    const out = {} as Record<Area, number>;
    AREAS.forEach((a) => { out[a] = 0; });
    if (e && e.staffing && typeof e.staffing === 'object') {
      AREAS.forEach((a) => { out[a] = Number(e.staffing![a]) || 0; });
      return out;
    }
    this.unitsForEvent(e).forEach((u) => {
      const a = this.areaOfUnit(u);
      out[a] = (out[a] || 0) + (Number(u.crew) || 0);
    });
    return out;
  }

  private today(): string { return new Date().toISOString().slice(0, 10); }

  staffCompliance(s: Staff | null): Compliance {
    if (!s) return { rtwOk: false, certsOk: false, expiredCount: 0, ok: false };
    const rtwOk = s.rtw === 'Verified';
    const today = this.today();
    const certs = this.certsForStaff(s.id);
    const expired = certs.filter((c) => c.expiry && c.expiry < today);
    const certsOk = expired.length === 0;
    return { rtwOk, certsOk, expiredCount: expired.length, ok: rtwOk && certsOk };
  }

  staffUnavailableOn(sid: string, startISO?: string, endISO?: string): boolean {
    const s = startISO || endISO;
    if (!s) return false;
    const e = endISO || startISO!;
    const d = new Date(s + 'T00:00:00');
    const end = new Date(e + 'T00:00:00');
    while (d <= end) {
      const iso = d.toISOString().slice(0, 10);
      const row = this.db.availability[`${sid}:${iso}`];
      if (row && row.available === false) return true;
      d.setDate(d.getDate() + 1);
    }
    return false;
  }

  staffPastShifts(sid: string): number {
    const today = this.today();
    return this.assignmentsForStaff(sid).filter((a) => {
      const ev = this.get<EventRec>('events', a.eventId);
      return ev && (ev.end || ev.start || '') < today;
    }).length;
  }

  inUnitPool(unitId: string, sid: string): boolean {
    const u = this.get<Unit>('units', unitId);
    return !!u && (u.pool || []).indexOf(sid) >= 0;
  }

  inShortlist(eid: string, unitId: string, sid: string): boolean {
    const e = this.get<EventRec>('events', eid);
    const sl = (e && e.shortlist) || {};
    return (sl[unitId] || []).indexOf(sid) >= 0;
  }

  /** Suitability scoring — identical weights to the prototype. */
  suitableForUnit(unit: Unit | null, opts: { event?: EventRec; widen?: boolean } = {}): Candidate[] {
    if (!unit) return [];
    const area = this.areaOfUnit(unit);
    const ev = opts.event || null;
    const widen = !!opts.widen;
    const clientId = unit.clientId;
    const pool = widen
      ? this.all<Staff>('staff')
      : this.all<Staff>('staff').filter((s) => s.clientId === clientId);

    return pool.map((s): Candidate => {
      const skills = this.skillsOf(s);
      const skillOk = skills.indexOf(area) >= 0;
      const comp = this.staffCompliance(s);
      const unavailable = ev ? this.staffUnavailableOn(s.id, ev.start, ev.end || ev.start) : false;
      const past = this.staffPastShifts(s.id);
      const ownClient = s.clientId === clientId;
      const reasons: string[] = [];
      if (!skillOk) reasons.push('no ' + area + ' skill');
      if (unavailable) reasons.push('unavailable');
      if (!comp.rtwOk) reasons.push('RTW pending');
      if (!comp.certsOk) reasons.push(comp.expiredCount + ' cert' + (comp.expiredCount === 1 ? '' : 's') + ' expired');
      const score = (skillOk ? 100 : 0) + (unavailable ? 0 : 30) +
        (comp.ok ? 25 : 0) + (ownClient ? 15 : 0) + Math.min(past, 20);
      return {
        staff: s, id: s.id, name: s.name, skills, area, skillOk,
        compliance: comp, available: !unavailable, unavailable, pastShifts: past,
        ownClient, reasons, blocked: (!skillOk || unavailable || !comp.ok), score,
        inPool: this.inUnitPool(unit.id, s.id),
        inShortlist: ev ? this.inShortlist(ev.id, unit.id, s.id) : false,
      };
    }).sort((a, b) => b.score - a.score || (b.pastShifts - a.pastShifts));
  }

  lowStockForClient(cid: string): StockLine[] {
    const units: Record<string, boolean> = {};
    this.unitsForClient(cid).forEach((u) => { units[u.id] = true; });
    return this.all<StockLine>('stock').filter((s) => units[s.unitId] && Number(s.qty) < Number(s.par));
  }

  /* ============================================================
     CERTS & AVAILABILITY — promoted real tables (hardening pass)
     Staff Hub (Phase 4) reads and writes these.
     ============================================================ */

  certsForStaff(sid: string): Cert[] {
    return Object.values(this.db.certs).filter((c) => c.staffId === sid);
  }

  /** Upsert a cert for a staff member. */
  async saveCert(cert: Partial<Cert> & { staffId: string; type: string }): Promise<Cert> {
    const id = cert.id || `CERT-${cert.staffId}-${Date.now().toString(36).slice(-4)}`;
    const full: Cert = { id, staffId: cert.staffId, type: cert.type, expiry: cert.expiry };
    this.db.certs[id] = full;
    this.markLocalWrite('certs' as any, id);
    this.emit();
    const { error } = await supabase.from('mf_certs').upsert({
      id, staff_id: full.staffId, type: full.type, expiry: full.expiry ?? null,
    });
    if (error) throw new Error(`saveCert: ${error.message}`);
    return full;
  }

  async removeCert(id: string): Promise<void> {
    delete this.db.certs[id];
    this.markLocalWrite('certs' as any, id);
    this.emit();
    const { error } = await supabase.from('mf_certs').delete().eq('id', id);
    if (error) throw new Error(`removeCert: ${error.message}`);
  }

  availabilityForStaff(sid: string): AvailabilityDay[] {
    return Object.values(this.db.availability).filter((a) => a.staffId === sid);
  }

  isUnavailable(sid: string, dateISO: string): boolean {
    const row = this.db.availability[`${sid}:${dateISO}`];
    return !!row && row.available === false;
  }

  /** Toggle a single day's availability for a staff member. */
  async setAvailability(sid: string, dateISO: string, available: boolean): Promise<void> {
    const key = `${sid}:${dateISO}`;
    if (available) {
      // "available" is the default — represent it by removing the block row.
      delete this.db.availability[key];
      this.emit();
      const { error } = await supabase.from('mf_availability').delete().eq('staff_id', sid).eq('date', dateISO);
      if (error) throw new Error(`setAvailability: ${error.message}`);
    } else {
      this.db.availability[key] = { staffId: sid, date: dateISO, available: false };
      this.emit();
      const { error } = await supabase.from('mf_availability').upsert({ staff_id: sid, date: dateISO, available: false });
      if (error) throw new Error(`setAvailability: ${error.message}`);
    }
  }

  /* ============================================================
     IMPORT — load a prototype exportAll() JSON dump into Supabase.
     The prototype's dump is { clients:{}, events:{}, ... , kv:{} }.
     We upsert every row per table, translating kv.staffCerts /
     kv.availability into the promoted mf_certs / mf_availability
     tables, and the rest of kv into mf_kv.
     ============================================================ */
  async importAll(json: string | OpsState): Promise<{ imported: Record<string, number> }> {
    const dump: OpsState = typeof json === 'string' ? JSON.parse(json) : json;
    if (!dump || !dump.clients) throw new Error('Not a valid OPSDECK/MAINFRAME export');

    const counts: Record<string, number> = {};
    const tables: TableName[] = ['clients', 'events', 'units', 'staff', 'assignments', 'stock', 'applications'];

    // Parents before children (FK order) — tables[] is already in that order.
    for (const t of tables) {
      const rows = Object.values((dump as any)[t] || {}) as any[];
      if (!rows.length) { counts[t] = 0; continue; }
      const dbRows = rows.map((r) => (toRow[t] as (x: any) => Row)(r));
      const { error } = await supabase.from(DB_TABLE[t]).upsert(dbRows);
      if (error) throw new Error(`importAll ${t}: ${error.message}`);
      counts[t] = dbRows.length;
    }

    // kv → promoted tables + generic blobs
    const kv = dump.kv || {};
    // staffCerts: { staffId: [{type, expiry}] } -> mf_certs rows
    const certs = (kv as any).staffCerts as Record<string, { type: string; expiry?: string }[]> | undefined;
    if (certs) {
      const rows: any[] = [];
      Object.entries(certs).forEach(([staffId, list]) =>
        (list || []).forEach((c, i) => rows.push({
          id: `CERT-${staffId}-${i}`, staff_id: staffId, type: c.type, expiry: c.expiry ?? null,
        })));
      if (rows.length) {
        const { error } = await supabase.from('mf_certs').upsert(rows);
        if (error) throw new Error(`importAll certs: ${error.message}`);
        counts.certs = rows.length;
      }
    }
    // availability: { staffId: { date: true } } -> mf_availability rows (unavailable)
    const avail = (kv as any).availability as Record<string, Record<string, boolean>> | undefined;
    if (avail) {
      const rows: any[] = [];
      Object.entries(avail).forEach(([staffId, dates]) =>
        Object.entries(dates || {}).forEach(([date, unavailable]) => {
          if (unavailable) rows.push({ staff_id: staffId, date, available: false });
        }));
      if (rows.length) {
        const { error } = await supabase.from('mf_availability').upsert(rows);
        if (error) throw new Error(`importAll availability: ${error.message}`);
        counts.availability = rows.length;
      }
    }
    // remaining kv namespaces -> mf_kv blobs
    const genericNs = Object.keys(kv).filter((ns) => ns !== 'staffCerts' && ns !== 'availability');
    for (const ns of genericNs) {
      const { error } = await supabase.from('mf_kv').upsert({ ns, data: (kv as any)[ns], updated_at: new Date().toISOString() });
      if (error) throw new Error(`importAll kv ${ns}: ${error.message}`);
    }
    counts.kv = genericNs.length;

    // Refresh the in-memory mirror from the DB so the UI reflects the import.
    await this.load();
    return { imported: counts };
  }

  /** Certs required for a staff member, derived from their skill areas. */
  requiredCertsFor(staff: Staff | null): string[] {
    if (!staff) return [];
    const areas = this.skillsOf(staff);
    const req = new Set<string>();
    areas.forEach((a) => {
      if (a === 'Bar') { req.add('Personal Licence'); req.add('Food Hygiene L2'); }
      if (a === 'Coffee' || a === 'Food') req.add('Food Hygiene L2');
      if (a === 'Supervisor') req.add('First Aid');
    });
    return [...req];
  }

  /**
   * Full compliance view for a staff member (Blueprint §03):
   * cert status by expiry — <0 days EXPIRED (blocked), <=60 days expiring
   * (warn), else OK. Blocked if RTW not Verified or any required cert
   * missing/expired.
   */
  complianceDetail(staff: Staff | null): {
    rtwOk: boolean;
    required: string[];
    certs: { type: string; expiry?: string; state: 'ok' | 'expiring' | 'expired' | 'missing' }[];
    expiredCount: number;
    expiringCount: number;
    missingCount: number;
    status: 'compliant' | 'expiring' | 'blocked';
    blocked: boolean;
  } {
    if (!staff) {
      return { rtwOk: false, required: [], certs: [], expiredCount: 0, expiringCount: 0, missingCount: 0, status: 'blocked', blocked: true };
    }
    const rtwOk = staff.rtw === 'Verified';
    const today = new Date();
    const held = this.certsForStaff(staff.id);
    const heldByType = new Map(held.map((c) => [c.type, c]));
    const required = this.requiredCertsFor(staff);

    let expiredCount = 0, expiringCount = 0, missingCount = 0;
    const certs = required.map((type) => {
      const c = heldByType.get(type);
      if (!c || !c.expiry) { missingCount++; return { type, state: 'missing' as const }; }
      const days = Math.round((new Date(c.expiry + 'T00:00:00').getTime() - today.getTime()) / 86400000);
      let state: 'ok' | 'expiring' | 'expired';
      if (days < 0) { state = 'expired'; expiredCount++; }
      else if (days <= 60) { state = 'expiring'; expiringCount++; }
      else state = 'ok';
      return { type, expiry: c.expiry, state };
    });

    const blocked = !rtwOk || expiredCount > 0 || missingCount > 0;
    const status = blocked ? 'blocked' : (expiringCount > 0 ? 'expiring' : 'compliant');
    return { rtwOk, required, certs, expiredCount, expiringCount, missingCount, status, blocked };
  }

  /* ============================================================
     FINANCE — crew cost (Blueprint §03)
     ============================================================ */

  /** Trading hours = max(1, dayCount) × 8h/day fallback. */
  tradingHours(e: EventRec | null): number {
    if (!e) return 8;
    const start = e.start;
    const end = e.end || e.start;
    if (!start) return 8;
    const days = Math.max(1,
      Math.round((new Date((end || start) + 'T00:00:00').getTime()
        - new Date(start + 'T00:00:00').getTime()) / 86400000) + 1);
    return days * 8;
  }

  /** Crew cost = Σ over CONFIRMED assignments of staff.rate × tradingHours. */
  crewCost(e: EventRec | null): number {
    if (!e) return 0;
    const hours = this.tradingHours(e);
    return this.assignmentsForEvent(e.id)
      .filter((a) => a.confirmed)
      .reduce((sum, a) => {
        const s = this.get<Staff>('staff', a.staffId);
        return sum + (s && s.rate ? Number(s.rate) : 0) * hours;
      }, 0);
  }

  /* ============================================================
     EVENT READINESS — 9-step scoring (Blueprint §03)
     ============================================================ */

  eventReadiness(e: EventRec | null): {
    steps: { key: string; label: string; done: boolean }[];
    doneCount: number;
    pct: number;
    ready: boolean;
  } {
    if (!e) return { steps: [], doneCount: 0, pct: 0, ready: false };
    const units = this.unitsForEvent(e);
    const assigns = this.assignmentsForEvent(e.id);
    const need = Object.values(this.staffingFor(e)).reduce((n, v) => n + v, 0);
    const confirmed = assigns.filter((a) => a.confirmed).length;
    const shortlistCount = Object.values(e.shortlist || {}).reduce((n, arr) => n + arr.length, 0);

    // stock above par across attending units
    let stockOk = true;
    units.forEach((u) => this.stockForUnit(u.id).forEach((k) => { if (Number(k.qty) < Number(k.par)) stockOk = false; }));

    // compliance clear across assigned crew
    const complianceOk = assigns.every((a) => {
      const s = this.get<Staff>('staff', a.staffId);
      return s ? !this.complianceDetail(s).blocked : false;
    });

    const ob = e.eventOnboarding || {};
    const steps = [
      { key: 'units', label: 'Units assigned', done: units.length > 0 },
      { key: 'shortlist', label: 'Crew shortlisted', done: shortlistCount > 0 },
      { key: 'booked', label: 'Crew booked to target', done: need > 0 && assigns.length >= need },
      { key: 'confirmed', label: 'Crew confirmed', done: assigns.length > 0 && confirmed === assigns.length },
      { key: 'stock', label: 'Stock above par', done: units.length > 0 && stockOk },
      { key: 'compliance', label: 'Compliance clear', done: assigns.length > 0 && complianceOk },
      { key: 'schedule', label: 'Schedule planned', done: (e.schedule || []).length > 0 },
      { key: 'docs', label: 'Docs / RAMS ready', done: !!ob.docs },
      { key: 'notified', label: 'Client notified', done: !!ob.notified },
    ];
    const doneCount = steps.filter((s) => s.done).length;
    const pct = Math.round((doneCount / steps.length) * 100);
    return { steps, doneCount, pct, ready: !!ob.ready || doneCount === steps.length };
  }

  /* ============================================================
     DEFAULT STOCK CATALOGUE per unit type (Blueprint §03 / opsdeck)
     ============================================================ */
  static DEFAULT_STOCK: Record<string, { item: string; unit: string; qty: number; par: number }[]> = {
    Bar: [
      { item: 'Lager keg (50L)', unit: 'kegs', qty: 4, par: 3 },
      { item: 'Cider keg (50L)', unit: 'kegs', qty: 2, par: 1 },
      { item: 'House red wine', unit: 'bottles', qty: 12, par: 6 },
      { item: 'House white wine', unit: 'bottles', qty: 12, par: 6 },
      { item: 'Prosecco', unit: 'bottles', qty: 12, par: 6 },
      { item: 'Spirits (house)', unit: 'bottles', qty: 8, par: 4 },
      { item: 'Mixers', unit: 'cases', qty: 6, par: 4 },
      { item: 'Ice', unit: 'bags', qty: 20, par: 10 },
      { item: 'Disposable cups', unit: 'sleeves', qty: 10, par: 5 },
    ],
    Coffee: [
      { item: 'Coffee beans', unit: 'kg', qty: 10, par: 5 },
      { item: 'Fresh milk', unit: 'litres', qty: 24, par: 12 },
      { item: 'Oat milk', unit: 'litres', qty: 12, par: 6 },
      { item: 'Cups 12oz', unit: 'sleeves', qty: 8, par: 4 },
      { item: 'Lids', unit: 'sleeves', qty: 8, par: 4 },
      { item: 'Syrups', unit: 'bottles', qty: 6, par: 3 },
    ],
    Food: [
      { item: 'Burger buns', unit: 'packs', qty: 20, par: 10 },
      { item: 'Beef patties', unit: 'boxes', qty: 10, par: 5 },
      { item: 'Chips / fries', unit: 'kg', qty: 25, par: 12 },
      { item: 'Cooking oil', unit: 'litres', qty: 20, par: 10 },
      { item: 'Food boxes', unit: 'sleeves', qty: 10, par: 5 },
      { item: 'Food-safe gloves', unit: 'boxes', qty: 4, par: 2 },
    ],
    Catering: [
      { item: 'Protein (mixed)', unit: 'kg', qty: 40, par: 20 },
      { item: 'Vegetables (mixed)', unit: 'kg', qty: 30, par: 15 },
      { item: 'Rice / grains', unit: 'kg', qty: 20, par: 10 },
      { item: 'Disposable plates', unit: 'sleeves', qty: 12, par: 6 },
      { item: 'Cutlery sets', unit: 'boxes', qty: 8, par: 4 },
    ],
    Support: [
      { item: 'Bin bags', unit: 'rolls', qty: 6, par: 3 },
      { item: 'Blue roll', unit: 'rolls', qty: 8, par: 4 },
      { item: 'First-aid consumables', unit: 'kits', qty: 2, par: 1 },
    ],
  };

  defaultStockFor(type: string): { item: string; unit: string; qty: number; par: number }[] {
    const key = OpsData.DEFAULT_STOCK[type] ? type : 'Support';
    return OpsData.DEFAULT_STOCK[key].map((r) => ({ ...r }));
  }

  /* ---------------- event identity colour (deterministic) ---------------- */
  private static PALETTE = [
    'oklch(0.72 0.19 250)', 'oklch(0.72 0.21 150)', 'oklch(0.75 0.18 55)',
    'oklch(0.70 0.24 350)', 'oklch(0.62 0.25 295)', 'oklch(0.74 0.15 195)',
    'oklch(0.72 0.20 25)', 'oklch(0.70 0.16 320)',
  ];
  eventColor(id: string): string {
    const s = String(id || '');
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return OpsData.PALETTE[h % OpsData.PALETTE.length];
  }
}

function emptyState(): OpsState {
  return {
    meta: { version: 1, updatedAt: Date.now() },
    clients: {}, events: {}, units: {}, staff: {},
    assignments: {}, stock: {}, applications: {}, kv: {},
    certs: {}, availability: {},
  };
}

/** Singleton — the app imports this one instance, like window.OPSDATA. */
export const opsData = new OpsData();
