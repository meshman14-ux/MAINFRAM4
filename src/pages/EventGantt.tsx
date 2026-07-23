/* Event Timeline (Gantt) — the colourful ops schedule chart.
   Built to the confirmed 6-decision design:
   1. Nested rows: event group header → one bar per unit; click the
      header to collapse the event to a single roll-up bar.
   2. Daily tabs (with event counts) + a Week overview; the day view
      uses an hour axis auto-fitted to activity with a live "now" line;
      unit bars split into phase segments (call → setup → service →
      breakdown), using the event's real schedule day when present.
   3. Colour: bar fill = unit area, group left border = operator,
      phase segments step in lightness.
   4. Overlays: crew-fill label, readiness dot, ▸ journey marker.
   5. Read-only v1: click opens the event data pack; hover = tooltip.
   6. Toggleable lanes (off by default): Logistics, Availability,
      Compliance deadlines. */
import { useMemo, useState } from 'react';
import { useOpsData } from '../data/useOpsData';
import type { EventRec, Unit, Staff, Cert, Client, Assignment } from '../data/types';
import { unitColor } from '../components/console/unitTheme';
import { prepPanel } from '../data/phase13';

const DAY_MS = 86400000;
const todayISO = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const fmtDay = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const toMin = (hhmm?: string, fallback = 0) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : fallback;
};
const toHHMM = (min: number) => `${String(Math.floor(((min % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/* Operator palette — the group's left-border identity. */
const OP_PALETTE = ['var(--accent)', 'var(--accent-2)', 'var(--neon-green)', 'var(--neon-yellow)', 'var(--neon-pink)'];

type min = number;
interface Phase { key: string; label: string; from: min; to: min; }

/** Phase timings: real schedule day (open/close) when the event has one,
    else defaults — call 30m, setup 90m, service 8h, breakdown 90m. */
function derivePhases(e: EventRec, date: string): Phase[] {
  const call = toMin(e.callTime, 7 * 60);
  const day = (e.schedule || []).find((s) => s.date === date);
  const open = day?.open ? toMin(day.open) : call + 120;
  const close = day?.close ? toMin(day.close) : open + 8 * 60;
  return [
    { key: 'call', label: 'Crew call', from: call, to: call + 30 },
    { key: 'setup', label: 'Setup', from: call + 30, to: Math.max(open, call + 31) },
    { key: 'service', label: day?.phase || 'Service', from: open, to: Math.max(close, open + 30) },
    { key: 'breakdown', label: 'Breakdown', from: Math.max(close, open + 30), to: Math.max(close, open + 30) + 90 },
  ];
}
/* Phase segments step in lightness over the area colour. */
const PHASE_MIX = [88, 68, 100, 45]; // % of the area colour per segment

export default function EventGantt({ onOpenEvent }: { onOpenEvent?: (id: string) => void }) {
  const { data, ready, error } = useOpsData();
  const open = onOpenEvent || ((id: string) => { window.location.hash = `#/event/${id}`; });
  const [picked, setPicked] = useState<string>(todayISO());
  const [week, setWeek] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [lanes, setLanes] = useState({ logistics: false, availability: false, compliance: false });

  const v = useMemo(() => {
    if (!ready) return null;
    const events = data.all<EventRec>('events').filter((e) => e.start);
    const clients = data.all<Client>('clients');
    const opColor = (cid: string) => OP_PALETTE[Math.max(0, clients.findIndex((c) => c.id === cid)) % OP_PALETTE.length];

    // Day tabs: today → last event end (capped at 14), plus any earlier live days.
    const lastEnd = events.reduce((m, e) => ((e.end || e.start!) > m ? (e.end || e.start!) : m), todayISO());
    const span = Math.min(14, Math.round((new Date(lastEnd + 'T00:00:00').getTime() - new Date(todayISO() + 'T00:00:00').getTime()) / DAY_MS) + 1);
    const days = Array.from({ length: Math.max(7, span) }, (_, i) => addDays(todayISO(), i));
    const onDay = (date: string) => events.filter((e) => e.start! <= date && date <= (e.end || e.start!));

    return { events, clients, opColor, days, onDay };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, data.meta().updatedAt]);

  if (error) return <div className="p4"><div className="banner">Couldn't load data: {error}</div></div>;
  if (!ready || !v) return <div className="state"><div><div className="spinner" /><div className="eyebrow">Loading timeline</div></div></div>;

  const dayEvents = v.onDay(picked);

  // Hour axis: 06:00–24:00 minimum, widened to fit the day's activity ±1h.
  let axMin = 6 * 60, axMax = 24 * 60;
  dayEvents.forEach((e) => {
    const ph = derivePhases(e, picked);
    axMin = Math.min(axMin, Math.floor((ph[0].from - 60) / 60) * 60);
    axMax = Math.max(axMax, Math.ceil((ph[3].to + 60) / 60) * 60);
  });
  axMin = Math.max(0, axMin);
  const axSpan = Math.max(60, axMax - axMin);
  const pos = (m: min) => `${((m - axMin) / axSpan) * 100}%`;
  const width = (a: min, b: min) => `${(Math.max(0, b - a) / axSpan) * 100}%`;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const showNow = picked === todayISO() && nowMin >= axMin && nowMin <= axMax;

  const hourTicks: min[] = [];
  for (let h = Math.ceil(axMin / 60); h * 60 <= axMax; h += Math.ceil(axSpan / 60 / 12) || 1) hourTicks.push(h * 60);

  const laneToggle = (k: keyof typeof lanes, label: string) => (
    <label key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ink-2)', cursor: 'pointer' }}>
      <input type="checkbox" checked={lanes[k]} onChange={(e) => setLanes((p) => ({ ...p, [k]: e.target.checked }))} style={{ accentColor: 'var(--accent)' }} />
      {label}
    </label>
  );

  return (
    <div data-screen-label="Event Timeline" className="p4" style={{ maxWidth: 1220 }}>
      <div className="toolbar">
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>Ops timeline</h2>
        <div className="row-inline" style={{ flexWrap: 'wrap' }}>
          {laneToggle('logistics', 'Logistics')}
          {laneToggle('availability', 'Availability')}
          {laneToggle('compliance', 'Compliance')}
        </div>
      </div>

      {/* day tabs + week */}
      <div style={{ display: 'flex', gap: 4, overflowX: 'auto', marginBottom: 16, paddingBottom: 4 }}>
        <button className="tab" aria-selected={week} onClick={() => setWeek(true)} style={{ ['--tc' as string]: 'var(--neon-purple-text)' }}>Week</button>
        {v.days.map((d) => {
          const n = v.onDay(d).length;
          return (
            <button key={d} className="tab" aria-selected={!week && picked === d}
              onClick={() => { setPicked(d); setWeek(false); }}
              style={{ ['--tc' as string]: 'var(--neon-cyan)', opacity: n ? 1 : 0.55 }}>
              {fmtDay(d)}{n > 0 && <span className="mono" style={{ fontSize: 9.5, marginLeft: 5, color: 'var(--neon-cyan)' }}>{n}</span>}
            </button>
          );
        })}
      </div>

      {week ? (
        <WeekView v={v} data={data} open={open} pick={(d) => { setPicked(d); setWeek(false); }} />
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 760, position: 'relative' }}>
            {/* hour axis */}
            <div style={{ position: 'relative', height: 22, borderBottom: '1px solid var(--panel-line)', marginBottom: 8 }}>
              {hourTicks.map((m) => (
                <span key={m} className="mono" style={{ position: 'absolute', left: pos(m), transform: 'translateX(-50%)', fontSize: 9.5, color: 'var(--ink-3)' }}>{toHHMM(m)}</span>
              ))}
            </div>
            <div style={{ position: 'relative' }}>
              {/* grid lines + now line */}
              {hourTicks.map((m) => (
                <div key={m} aria-hidden style={{ position: 'absolute', left: pos(m), top: 0, bottom: 0, width: 1, background: 'var(--panel-line)', opacity: 0.5 }} />
              ))}
              {showNow && (
                <div aria-label="now" style={{ position: 'absolute', left: pos(nowMin), top: -26, bottom: 0, width: 2, background: 'var(--danger)', boxShadow: '0 0 8px var(--danger)', zIndex: 3 }}>
                  <span className="mono" style={{ position: 'absolute', top: 0, left: 4, fontSize: 9, color: 'var(--danger)' }}>now</span>
                </div>
              )}

              {dayEvents.length === 0 && <div className="muted" style={{ fontSize: 13, padding: '18px 4px' }}>Nothing scheduled this day.</div>}

              {dayEvents.map((e) => {
                const units = data.unitsForEvent(e);
                const asg = data.assignmentsForEvent(e.id);
                const prep = prepPanel(data, e);
                const dot = prep.blocked ? 'var(--danger)' : prep.score >= 80 ? 'var(--ok)' : 'var(--warn)';
                const phases = derivePhases(e, picked);
                const groupFrom = phases[0].from, groupTo = phases[3].to;
                const isCollapsed = !!collapsed[e.id];
                const journeys = data.movementsForEvent(e.id).filter((m) => m.departDate === picked);
                const opCol = v.opColor(e.clientId);
                return (
                  <div key={e.id} style={{ borderLeft: `3px solid ${opCol}`, paddingLeft: 10, marginBottom: 14 }}>
                    {/* group header */}
                    <button onClick={() => setCollapsed((p) => ({ ...p, [e.id]: !isCollapsed }))}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: 'var(--ink)', font: 'inherit', cursor: 'pointer', padding: '2px 0', marginBottom: 4 }}>
                      <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>{isCollapsed ? '▸' : '▾'}</span>
                      <span title={`Readiness ${prep.blocked ? 'BLOCKED' : prep.score + '%'}`} style={{ width: 9, height: 9, borderRadius: '50%', background: dot, boxShadow: `0 0 7px ${dot}` }} />
                      <span style={{ fontSize: 13.5, fontWeight: 700 }}>{e.name}</span>
                      <span className="mono" style={{ fontSize: 10, color: asg.length >= units.reduce((n, u) => n + u.crew, 0) ? 'var(--ok)' : 'var(--warn)' }}>
                        crew {asg.length}/{units.reduce((n, u) => n + u.crew, 0)}
                      </span>
                      {journeys.length > 0 && <span className="mono" style={{ fontSize: 10, color: 'var(--neon-blue)' }}>▸ {journeys.length} journey{journeys.length !== 1 ? 's' : ''}</span>}
                    </button>

                    {isCollapsed ? (
                      /* roll-up bar */
                      <div style={{ position: 'relative', height: 26 }}>
                        <div role="button" tabIndex={0} onClick={() => open(e.id)} onKeyDown={(k) => { if (k.key === 'Enter') open(e.id); }}
                          title={`${e.name} · ${toHHMM(groupFrom)}–${toHHMM(groupTo)} · ${units.length} units · crew ${asg.length}`}
                          style={{ position: 'absolute', left: pos(groupFrom), width: width(groupFrom, groupTo), top: 2, height: 20, borderRadius: 6, cursor: 'pointer', background: `color-mix(in oklch, ${opCol} 55%, var(--panel))`, border: `1px solid ${opCol}`, boxShadow: `0 0 8px color-mix(in oklch, ${opCol} 40%, transparent)`, display: 'flex', alignItems: 'center', paddingLeft: 8, overflow: 'hidden' }}>
                          <span className="mono" style={{ fontSize: 9.5, whiteSpace: 'nowrap' }}>{units.length} units · {toHHMM(groupFrom)}–{toHHMM(groupTo)}</span>
                        </div>
                      </div>
                    ) : (
                      units.map((u) => {
                        const uc = unitColor(u.type);
                        const crew = asg.filter((a) => a.unitId === u.id);
                        const conf = crew.filter((a) => a.confirmed).length;
                        const uJourneys = journeys.filter((m) => m.unitId === u.id || (!m.unitId && units.length === 1));
                        return (
                          <div key={u.id} style={{ position: 'relative', height: 30, marginBottom: 3 }}>
                            <span className="mono" style={{ position: 'absolute', left: 0, top: 8, fontSize: 9.5, color: uc, width: 64, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.code}</span>
                            <div style={{ position: 'absolute', left: 70, right: 0, top: 0, bottom: 0 }}>
                              <div role="button" tabIndex={0} onClick={() => open(e.id)} onKeyDown={(k) => { if (k.key === 'Enter') open(e.id); }}
                                title={`${u.code} · ${u.name}\ncrew ${crew.length}/${u.crew} (${conf} confirmed)\n${phases.map((p) => `${p.label} ${toHHMM(p.from)}–${toHHMM(p.to)}`).join('\n')}${uJourneys.length ? `\ndeparts ${uJourneys[0].departTime || 'TBC'}` : ''}`}
                                style={{ position: 'absolute', left: pos(phases[0].from), width: width(phases[0].from, phases[3].to), top: 4, height: 20, borderRadius: 6, cursor: 'pointer', overflow: 'hidden', display: 'flex', border: `1px solid color-mix(in oklch, ${uc} 60%, transparent)`, boxShadow: `0 0 8px color-mix(in oklch, ${uc} 30%, transparent)` }}>
                                {phases.map((p, i) => (
                                  <div key={p.key} style={{ width: `${((p.to - p.from) / (phases[3].to - phases[0].from)) * 100}%`, background: `color-mix(in oklch, ${uc} ${PHASE_MIX[i]}%, var(--panel))` }} />
                                ))}
                                <span className="mono" style={{ position: 'absolute', right: 6, top: 3, fontSize: 9, color: 'oklch(0.15 0.02 268)', fontWeight: 700 }}>
                                  {crew.length}/{u.crew}
                                </span>
                              </div>
                              {uJourneys.map((m) => (
                                <span key={m.id} title={`Departs ${m.departTime || 'TBC'}${m.tow ? ' · towing' : ''}`}
                                  style={{ position: 'absolute', left: pos(toMin(m.departTime, phases[0].from - 45)), top: 0, fontSize: 12, color: 'var(--neon-blue)', textShadow: '0 0 6px var(--neon-blue)', zIndex: 2 }}>▸</span>
                              ))}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                );
              })}

              {/* optional lanes */}
              {lanes.logistics && <LogisticsLane data={data} date={picked} pos={pos} events={dayEvents} />}
              {lanes.availability && <AvailabilityLane data={data} date={picked} />}
              {lanes.compliance && <ComplianceLane data={data} date={picked} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* Week overview — 7 columns from today; events as operator-coloured bars. */
function WeekView({ v, data, open, pick }: {
  v: { events: EventRec[]; clients: Client[]; opColor: (c: string) => string; days: string[]; onDay: (d: string) => EventRec[] };
  data: ReturnType<typeof useOpsData>['data'];
  open: (id: string) => void; pick: (d: string) => void;
}) {
  const days = v.days.slice(0, 7);
  return (
    <div className="card" style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 720 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 8 }}>
          {days.map((d) => (
            <button key={d} onClick={() => pick(d)} className="mono"
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10.5, color: d === todayISO() ? 'var(--neon-cyan)' : 'var(--ink-3)', textAlign: 'left', padding: 0 }}>
              {fmtDay(d)}
            </button>
          ))}
        </div>
        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
          {days.map((d) => <div key={d} style={{ minHeight: 120, borderRadius: 8, background: 'var(--inset)', border: '1px solid var(--panel-line)' }} />)}
          <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, gridAutoRows: 30, padding: 0, pointerEvents: 'none' }}>
            {v.events
              .filter((e) => (e.end || e.start!) >= days[0] && e.start! <= days[6])
              .sort((a, b) => (a.start || '').localeCompare(b.start || ''))
              .map((e) => {
                const from = Math.max(0, days.indexOf(e.start! < days[0] ? days[0] : e.start!));
                const toIso = (e.end || e.start!) > days[6] ? days[6] : (e.end || e.start!);
                const to = Math.max(from, days.indexOf(toIso));
                const col = v.opColor(e.clientId);
                const units = data.unitsForEvent(e).length;
                return (
                  <div key={e.id} role="button" tabIndex={0}
                    onClick={() => open(e.id)} onKeyDown={(k) => { if (k.key === 'Enter') open(e.id); }}
                    title={`${e.name} · ${units} units`}
                    style={{ gridColumn: `${from + 1} / ${to + 2}`, pointerEvents: 'auto', cursor: 'pointer', margin: '2px 2px 0', height: 24, borderRadius: 6, background: `color-mix(in oklch, ${col} 45%, var(--panel))`, border: `1px solid ${col}`, boxShadow: `0 0 8px color-mix(in oklch, ${col} 35%, transparent)`, display: 'flex', alignItems: 'center', gap: 6, padding: '0 7px', overflow: 'hidden' }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</span>
                    <span className="mono" style={{ fontSize: 8.5, color: 'var(--ink-2)', flex: 'none' }}>{units}u</span>
                  </div>
                );
              })}
          </div>
        </div>

        <WeekAllocations v={v} data={data} days={days} open={open} />
      </div>
    </div>
  );
}

/* Weekly allocation chart — how the crew is spread across the week.
   Top: per-day filled/needed totals as stacked mini bars. Below: a
   rota-style grid, one row per allocated crew member, one cell per day,
   coloured by the event they're on (solid = confirmed, faded = not). */
function WeekAllocations({ v, data, days, open }: {
  v: { events: EventRec[]; opColor: (c: string) => string; onDay: (d: string) => EventRec[] };
  data: ReturnType<typeof useOpsData>['data'];
  days: string[]; open: (id: string) => void;
}) {
  // per-day totals across every event covering that day
  const totals = days.map((d) => {
    const evs = v.onDay(d);
    const need = evs.reduce((n, e) => n + Object.values(data.staffingFor(e)).reduce((x: number, y) => x + (y as number), 0), 0);
    const got = evs.reduce((n, e) => n + data.assignmentsForEvent(e.id).length, 0);
    const conf = evs.reduce((n, e) => n + data.assignmentsForEvent(e.id).filter((a) => a.confirmed).length, 0);
    return { d, need, got, conf };
  });
  const maxNeed = Math.max(1, ...totals.map((t) => Math.max(t.need, t.got)));

  // rota rows: every staff member with an assignment touching the week
  const weekEvents = v.events.filter((e) => (e.end || e.start!) >= days[0] && e.start! <= days[days.length - 1]);
  const byStaff = new Map<string, { staff: Staff; cells: Record<string, { a: Assignment; e: EventRec }[]> }>();
  weekEvents.forEach((e) => {
    data.assignmentsForEvent(e.id).forEach((a) => {
      const staff = data.get<Staff>('staff', a.staffId);
      if (!staff) return;
      const row = byStaff.get(staff.id) || { staff, cells: {} };
      days.forEach((d) => {
        if (e.start! <= d && d <= (e.end || e.start!)) {
          (row.cells[d] = row.cells[d] || []).push({ a, e });
        }
      });
      byStaff.set(staff.id, row);
    });
  });
  const rows = [...byStaff.values()].sort((x, y) => x.staff.name.localeCompare(y.staff.name));

  return (
    <div style={{ marginTop: 22 }}>
      <div className="ev-label" style={{ marginBottom: 8 }}>Daily allocations — crew across the week</div>

      {/* per-day totals chart */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, alignItems: 'end', marginBottom: 6, minHeight: 64 }}>
        {totals.map((t) => {
          const ok = t.need > 0 && t.got >= t.need;
          return (
            <div key={t.d} title={`${fmtDay(t.d)} · ${t.got}/${t.need} allocated · ${t.conf} confirmed`}
              style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 2, height: 64 }}>
              {t.need > t.got && (
                <div style={{ height: `${((t.need - t.got) / maxNeed) * 100}%`, minHeight: t.need > t.got ? 3 : 0, borderRadius: 3, background: 'color-mix(in oklch, var(--warn) 30%, transparent)', border: '1px dashed var(--warn)' }} />
              )}
              {t.got > 0 && (
                <div style={{ height: `${(t.got / maxNeed) * 100}%`, minHeight: 3, borderRadius: 3, background: ok ? 'var(--ok)' : 'var(--warn)', boxShadow: `0 0 7px ${ok ? 'var(--ok)' : 'var(--warn)'}` }} />
              )}
              <span className="mono" style={{ fontSize: 9, color: ok ? 'var(--ok)' : t.need ? 'var(--warn)' : 'var(--ink-3)', textAlign: 'center' }}>
                {t.need ? `${t.got}/${t.need}` : '—'}
              </span>
            </div>
          );
        })}
      </div>

      {/* rota grid */}
      {rows.length === 0 ? (
        <div className="muted" style={{ fontSize: 12 }}>No crew allocated this week yet — staff events in the Console or run a callout.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '110px repeat(7, 1fr)', gap: 4, alignItems: 'center' }}>
          <span />
          {days.map((d) => (
            <span key={d} className="mono" style={{ fontSize: 9, color: d === todayISO() ? 'var(--neon-cyan)' : 'var(--ink-3)', textAlign: 'center' }}>{fmtDay(d).split(' ')[0]}</span>
          ))}
          {rows.map(({ staff, cells }) => (
            [
              <span key={staff.id} className="mono" title={staff.role} style={{ fontSize: 10.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {staff.name}
              </span>,
              ...days.map((d) => {
                const here = cells[d] || [];
                if (here.length === 0) {
                  const off = data.isUnavailable(staff.id, d);
                  return <div key={d} title={off ? 'Marked unavailable' : 'Free'} style={{ height: 20, borderRadius: 5, background: off ? 'color-mix(in oklch, var(--danger) 14%, transparent)' : 'var(--inset)', border: `1px ${off ? 'dashed var(--danger)' : 'solid var(--panel-line)'}` }} />;
                }
                const { a, e } = here[0];
                const col = data.eventColor(e.id);
                const un = data.get<Unit>('units', a.unitId);
                return (
                  <div key={d} role="button" tabIndex={0}
                    onClick={() => open(e.id)} onKeyDown={(k) => { if (k.key === 'Enter') open(e.id); }}
                    title={`${e.name} · ${un?.code || ''}${a.area ? ` · ${a.area}` : ''} · ${a.confirmed ? 'confirmed' : 'NOT confirmed'}${here.length > 1 ? `\n⚠ also on ${here.slice(1).map((x) => x.e.name).join(', ')}` : ''}`}
                    style={{
                      height: 20, borderRadius: 5, cursor: 'pointer', overflow: 'hidden',
                      background: a.confirmed ? `color-mix(in oklch, ${col} 60%, var(--panel))` : `color-mix(in oklch, ${col} 22%, var(--panel))`,
                      border: `1px ${a.confirmed ? 'solid' : 'dashed'} ${here.length > 1 ? 'var(--danger)' : col}`,
                      boxShadow: here.length > 1 ? '0 0 8px var(--danger)' : a.confirmed ? `0 0 6px color-mix(in oklch, ${col} 35%, transparent)` : 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                    <span className="mono" style={{ fontSize: 8, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '0 3px' }}>
                      {here.length > 1 ? '⚠ 2×' : (un?.code || e.name)}
                    </span>
                  </div>
                );
              }),
            ]
          ))}
        </div>
      )}
      <div className="row-inline" style={{ marginTop: 10, gap: 14, flexWrap: 'wrap' }}>
        <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-3)' }}>solid = confirmed · faded dash = unconfirmed · red dash = unavailable · ⚠ = double-booked</span>
      </div>
    </div>
  );
}

function LogisticsLane({ data, date, pos, events }: {
  data: ReturnType<typeof useOpsData>['data']; date: string;
  pos: (m: number) => string; events: EventRec[];
}) {
  const moves = events.flatMap((e) => data.movementsForEvent(e.id).filter((m) => m.departDate === date)
    .map((m) => ({ m, e })));
  return (
    <div style={{ borderTop: '1px dashed var(--panel-line)', paddingTop: 8, marginTop: 8, position: 'relative', minHeight: 30 }}>
      <span className="mono" style={{ fontSize: 9, letterSpacing: '.08em', color: 'var(--neon-blue)' }}>LOGISTICS</span>
      {moves.length === 0 && <span className="muted" style={{ fontSize: 11, marginLeft: 10 }}>no journeys this day</span>}
      {moves.map(({ m, e }) => {
        const drv = data.get<Staff>('staff', m.driverId);
        const un = m.unitId ? data.get<Unit>('units', m.unitId) : null;
        return (
          <span key={m.id} title={`${e.name} · ${drv?.name ?? ''}${m.tow ? ' · towing' : ''}`}
            className="mono"
            style={{ position: 'absolute', left: pos(toMin(m.departTime, 8 * 60)), top: 6, fontSize: 10, color: 'var(--neon-blue)', whiteSpace: 'nowrap' }}>
            ▸ {m.departTime || 'TBC'} {un ? un.code : 'VAN'}
          </span>
        );
      })}
    </div>
  );
}

function AvailabilityLane({ data, date }: { data: ReturnType<typeof useOpsData>['data']; date: string }) {
  const out = data.all<Staff>('staff').filter((s) => data.isUnavailable(s.id, date));
  return (
    <div style={{ borderTop: '1px dashed var(--panel-line)', paddingTop: 8, marginTop: 8 }}>
      <span className="mono" style={{ fontSize: 9, letterSpacing: '.08em', color: 'var(--neon-yellow)' }}>UNAVAILABLE</span>
      {out.length === 0
        ? <span className="muted" style={{ fontSize: 11, marginLeft: 10 }}>everyone available</span>
        : out.map((s) => <span key={s.id} className="chip chip-amber" style={{ fontSize: 10, marginLeft: 8 }}>{s.name}</span>)}
    </div>
  );
}

function ComplianceLane({ data, date }: { data: ReturnType<typeof useOpsData>['data']; date: string }) {
  const horizon = addDays(date, 14);
  const due: Cert[] = data.all<Staff>('staff')
    .flatMap((s) => data.certsForStaff(s.id))
    .filter((c) => c.expiry && c.expiry >= date && c.expiry <= horizon);
  return (
    <div style={{ borderTop: '1px dashed var(--panel-line)', paddingTop: 8, marginTop: 8 }}>
      <span className="mono" style={{ fontSize: 9, letterSpacing: '.08em', color: 'var(--neon-pink)' }}>COMPLIANCE ≤14d</span>
      {due.length === 0
        ? <span className="muted" style={{ fontSize: 11, marginLeft: 10 }}>no expiries inside two weeks</span>
        : due.map((c) => {
          const s = data.get<Staff>('staff', c.staffId);
          return <span key={c.id} className="chip chip-red" style={{ fontSize: 10, marginLeft: 8 }}>{s?.name ?? '?'} · {c.type} · {c.expiry}</span>;
        })}
    </div>
  );
}
