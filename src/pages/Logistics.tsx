import { useMemo, useState } from 'react';
import { useOpsData } from '../data/useOpsData';
import type { Client, EventRec, Unit, Staff, Movement, MovementStatus, Vehicle, VehicleType } from '../data/types';
import { VEHICLE_TYPES } from '../data/types';
import { journeyEta, journeyMinutes } from '../data/phase12';

const fmt = (iso?: string) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
const STATUS_COLOR: Record<MovementStatus, string> = {
  planned: 'var(--ink-3)', 'en-route': 'var(--neon-yellow)', 'on-site': 'var(--neon-green)', returned: 'var(--neon-blue)',
};
const STATUS_LABEL: Record<MovementStatus, string> = {
  planned: 'PLANNED', 'en-route': 'EN ROUTE', 'on-site': 'ON SITE', returned: 'RETURNED',
};
const SUPPORT_VAN = '__van';

export default function Logistics() {
  const { data, ready, error } = useOpsData();
  const [clientId, setClientId] = useState('');

  const clients = useMemo(
    () => (ready ? data.all<Client>('clients') : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, data.meta().updatedAt]
  );
  const activeId = clientId || clients[0]?.id || '';

  const today = new Date().toISOString().slice(0, 10);
  const events = useMemo(
    () => (activeId ? data.eventsForClient(activeId).filter((e) => (e.end || e.start || '') >= today).sort((a, b) => (a.start || '').localeCompare(b.start || '')) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeId, data.meta().updatedAt]
  );
  const summary = useMemo(
    () => (activeId ? data.logisticsSummary(activeId) : { movements: 0, enRoute: 0, towDrivers: 0 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeId, data.meta().updatedAt]
  );

  if (error) return <div className="p4"><div className="banner">Couldn't load data: {error}</div></div>;
  if (!ready) return <div className="state"><div><div className="spinner" /><div className="eyebrow">Loading logistics</div></div></div>;
  if (clients.length === 0) return <div className="p4"><div className="empty-state">No operators yet.</div></div>;

  return (
    <div className="p4">
      <div className="client-bar">
        <select className="client-select" value={activeId} onChange={(e) => setClientId(e.target.value)} aria-label="Operator">
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <span className="client-meta">Units on the road · drivers · departures</span>
      </div>

      <div className="stat-strip">
        <div className="stat-box"><div className="v">{summary.movements}</div><div className="k">Movements</div></div>
        <div className="stat-box" data-tone={summary.enRoute ? 'amber' : undefined}><div className="v">{summary.enRoute}</div><div className="k">En route now</div></div>
        <div className="stat-box" data-tone={summary.towDrivers ? 'green' : 'red'}><div className="v">{summary.towDrivers}</div><div className="k">Tow drivers</div></div>
      </div>

      <div className="row-inline" style={{ marginBottom: 16, justifyContent: 'flex-end' }}>
        <button className="btn btn-sm" onClick={() => window.print()}>Print tab pack</button>
      </div>

      {events.length === 0 ? (
        <div className="empty-state">No upcoming events for this operator.</div>
      ) : (
        events.map((e) => <LogisticsEvent key={e.id} data={data} event={e} clientId={activeId} today={today} />)
      )}

      <div className="hub-grid no-print" style={{ marginTop: 22 }}>
        <FleetCard data={data} clientId={activeId} />
        <JourneyCalculator />
      </div>
    </div>
  );
}

/* The fleet — vans, trucks and trailers behind the movements board. */
function FleetCard({ data, clientId }: { data: ReturnType<typeof useOpsData>['data']; clientId: string }) {
  const [name, setName] = useState('');
  const [reg, setReg] = useState('');
  const [vtype, setVtype] = useState<VehicleType>('Van');
  const [tow, setTow] = useState(false);

  const fleet = useMemo(
    () => data.all<Vehicle>('vehicles').filter((v) => v.clientId === clientId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clientId, data.meta().updatedAt]
  );

  async function add() {
    if (!name.trim()) return;
    await data.save('vehicles', {
      clientId, name: name.trim(), reg: reg || undefined, vtype, towCapable: tow,
    } as Partial<Vehicle>);
    setName(''); setReg('');
  }

  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title">Fleet</div>
        <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>{fleet.length} vehicle{fleet.length !== 1 ? 's' : ''}</span>
      </div>
      {fleet.length === 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>No vehicles registered yet.</div>
      ) : fleet.map((v) => (
        <div className="ov-ev" key={v.id}>
          <span className="chip chip-blue">{v.vtype}</span>
          <span className="ov-ev-name">{v.name}</span>
          {v.reg && <span className="mono ov-ev-date">{v.reg}</span>}
          {v.towCapable && <span className="chip chip-green">tow</span>}
          <button className="btn btn-ghost btn-sm" onClick={() => data.remove('vehicles', v.id)}>✕</button>
        </div>
      ))}
      <div className="row-inline" style={{ marginTop: 12, flexWrap: 'wrap' }}>
        <input className="inp" style={{ flex: 1, minWidth: 110 }} placeholder="Name (Sprinter 1)" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="inp" style={{ width: 100 }} placeholder="Reg" value={reg} onChange={(e) => setReg(e.target.value)} />
        <select className="sel" style={{ width: 'auto' }} value={vtype} onChange={(e) => setVtype(e.target.value as VehicleType)}>
          {VEHICLE_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        <label className="row-inline" style={{ fontSize: 12.5, gap: 5 }}>
          <input type="checkbox" checked={tow} onChange={(e) => setTow(e.target.checked)} /> tow
        </label>
        <button className="btn btn-primary btn-sm" onClick={add} disabled={!name.trim()}>Add</button>
      </div>
    </section>
  );
}

/* Journey-time calculator — distance → duration at convoy speed, +20% when
   towing, gives departure→ETA. Pure maths from phase12, testable. */
function JourneyCalculator() {
  const [depart, setDepart] = useState('08:00');
  const [miles, setMiles] = useState('60');
  const [tow, setTow] = useState(true);
  const mins = journeyMinutes(Number(miles) || 0);
  const eta = journeyEta(depart, mins, tow);
  const towMins = Math.round(mins * (tow ? 1.2 : 1));

  return (
    <section className="card">
      <div className="card-head"><div className="card-title">Directions · ETA</div></div>
      <div className="row-inline" style={{ flexWrap: 'wrap' }}>
        <label>Depart<input className="inp" type="time" value={depart} onChange={(e) => setDepart(e.target.value)} /></label>
        <label>Miles<input className="inp" style={{ width: 90 }} type="number" min={0} value={miles} onChange={(e) => setMiles(e.target.value)} /></label>
        <label className="row-inline" style={{ fontSize: 12.5, gap: 5, alignSelf: 'end', paddingBottom: 8 }}>
          <input type="checkbox" checked={tow} onChange={(e) => setTow(e.target.checked)} /> towing (+20%)
        </label>
      </div>
      <div className="stat-strip" style={{ marginTop: 12, marginBottom: 0 }}>
        <div className="stat-box" data-tone="blue"><div className="v">{towMins ? `${Math.floor(towMins / 60)}h ${towMins % 60}m` : '—'}</div><div className="k">Journey time</div></div>
        <div className="stat-box" data-tone="green"><div className="v">{eta}</div><div className="k">ETA on site</div></div>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
        Assumes 38&nbsp;mph average with a loaded van on mixed roads. Add margin for site queues at peak arrival windows.
      </p>
    </section>
  );
}

function LogisticsEvent({ data, event, clientId, today }: {
  data: ReturnType<typeof useOpsData>['data']; event: EventRec; clientId: string; today: string;
}) {
  const [unitSel, setUnitSel] = useState(SUPPORT_VAN);
  const [driverSel, setDriverSel] = useState('');
  const [date, setDate] = useState(event.start || '');
  const [time, setTime] = useState('08:00');

  const movements = data.movementsForEvent(event.id);
  const units = data.unitsForClient(clientId);
  const drivers = data.eligibleDrivers(clientId);
  const clashes = data.driverClashesForEvent(clientId, event);
  const assignedHere = new Set(movements.map((m) => m.driverId));

  const live = (event.start || '') <= today && today <= (event.end || event.start || '');
  const days = event.start ? Math.round((new Date(event.start + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000) : 0;
  const countdown = live ? 'LIVE' : days <= 0 ? 'TODAY' : `T-${days}`;

  const selUnit = unitSel !== SUPPORT_VAN ? units.find((u) => u.id === unitSel) : null;
  const selDriver = drivers.find((s) => s.id === driverSel) || null;
  const towWarn = !!(selUnit && selDriver && !selDriver.canTow);
  const readyToAdd = !!driverSel;

  async function add() {
    if (!readyToAdd) return;
    await data.addMovement(event.id, driverSel, {
      unitId: unitSel !== SUPPORT_VAN ? unitSel : undefined,
      departDate: date, departTime: time,
    });
    setDriverSel('');
  }

  return (
    <div className="logi-event" style={{ ['--uc' as string]: data.eventColor(event.id) }}>
      <div className="logi-head">
        <span className="logi-name">{event.name}</span>
        <span className="logi-badge" data-tone={live ? 'live' : undefined}>{countdown}</span>
      </div>
      <div className="logi-sub">{fmt(event.start)}{event.end && event.end !== event.start ? `–${fmt(event.end)}` : ''} · {event.loc || 'TBC'} · {movements.length} movement{movements.length === 1 ? '' : 's'}</div>

      {movements.length === 0 ? (
        <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>No movements planned yet — add the first one below.</div>
      ) : (
        movements.map((m) => <MovementRow key={m.id} m={m} data={data} />)
      )}

      <div className="logi-form">
        <label>Unit / vehicle
          <select className="sel" value={unitSel} onChange={(e) => setUnitSel(e.target.value)}>
            <option value={SUPPORT_VAN}>Support van (no trailer)</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.code}{u.name ? ` · ${u.name}` : ''}</option>)}
          </select>
        </label>
        <label>Driver
          <select className="sel" value={driverSel} onChange={(e) => setDriverSel(e.target.value)}>
            <option value="">Pick…</option>
            {drivers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.canTow ? ' · tow' : ''}</option>)}
          </select>
        </label>
        <label>Depart date<input className="inp" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label>Time<input className="inp" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
        <button className="btn btn-primary btn-sm" onClick={add} disabled={!readyToAdd}>+ Plan</button>
      </div>

      {towWarn && (
        <div className="logi-tow-warn">
          {selDriver!.name} is not marked as able to tow — {selUnit!.code || selUnit!.type} needs a tow-qualified driver, or send them in the support van.
        </div>
      )}

      <div className="logi-pool">
        {drivers.map((s) => {
          const clash = clashes[s.id];
          const assigned = assignedHere.has(s.id);
          return (
            <div className="logi-pool-item" key={s.id} data-clash={!!clash}
              style={{ ['--poolb' as string]: clash ? 'var(--amber)' : assigned ? 'var(--green)' : 'var(--panel-line)', ['--poold' as string]: s.canTow ? 'var(--violet)' : 'var(--ink-3)' }}>
              <span className="logi-pool-dot" />
              <span>{s.name}</span>
              <span className="logi-pool-tag">{s.canTow ? 'TOW' : 'DRV'}{assigned ? ' · assigned' : ''}{clash ? ` · ⚠ ${clash}` : ''}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MovementRow({ m, data }: { m: Movement; data: ReturnType<typeof useOpsData>['data'] }) {
  const unit = m.unitId ? data.get<Unit>('units', m.unitId) : null;
  const driver = data.get<Staff>('staff', m.driverId);
  return (
    <div className="logi-move-row">
      <span className="logi-move-unit">{unit ? (unit.code || unit.type) : 'VAN'}</span>
      <span className="logi-move-driver">{driver?.name ?? '—'}{m.tow && <span className="logi-tow-note"> · allow +20% towing</span>}</span>
      <span className="logi-move-depart">{m.departDate ? fmt(m.departDate) : 'TBC'} {m.departTime}</span>
      <button className="logi-status-chip" style={{ ['--statc' as string]: STATUS_COLOR[m.status] }} onClick={() => data.advanceMovement(m.id)} title="Advance status">
        {STATUS_LABEL[m.status]} →
      </button>
      <button className="btn btn-ghost btn-sm" onClick={() => data.removeMovement(m.id)}>✕</button>
    </div>
  );
}
