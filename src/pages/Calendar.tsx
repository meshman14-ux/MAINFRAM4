/* Calendar — month grid plus a per-day itinerary (sketch notes §4).
   Click a day to see everything happening across ALL events in time
   order: crew calls, journeys, phases, active units and readiness
   flags. Crew see the same view filtered to their own shifts. */
import { useMemo, useState } from 'react';
import { useOpsData } from '../data/useOpsData';
import { useAuth } from '../data/authContext';
import { monthGrid } from '../data/phase4';
import { dayItinerary } from '../data/phase13';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const KIND_META: Record<string, { icon: string; chip: string }> = {
  call: { icon: '📣', chip: 'chip-green' },
  journey: { icon: '🚚', chip: 'chip-blue' },
  phase: { icon: '🗓', chip: 'chip-amber' },
  units: { icon: '▦', chip: 'chip-blue' },
  flag: { icon: '⛔', chip: 'chip-red' },
};

export default function Calendar() {
  const { data, ready, error } = useOpsData();
  const auth = useAuth();
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [picked, setPicked] = useState<string | null>(null);

  // Crew always get their personal itinerary; operators see everything.
  const isCrew = auth.access?.role === 'crew';
  const staffId = isCrew ? auth.access?.staffId : undefined;

  const grid = useMemo(
    () => (ready ? monthGrid(data, cursor.year, cursor.month) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, data.meta().updatedAt, cursor.year, cursor.month]
  );
  const itinerary = useMemo(
    () => (ready && picked ? dayItinerary(data, picked, staffId ?? undefined) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, picked, staffId, data.meta().updatedAt]
  );

  function shift(delta: number) {
    setCursor((c) => {
      const d = new Date(Date.UTC(c.year, c.month + delta, 1));
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
    });
  }

  if (error) return <div className="p4"><div className="banner">Couldn't load data: {error}</div></div>;
  if (!ready || !grid) return <div className="state"><div><div className="spinner" /><div className="eyebrow">Loading calendar</div></div></div>;

  const pickedLabel = picked
    ? new Date(picked + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
    : null;

  return (
    <div className="p4">
      <div className="cal-head">
        <button className="btn btn-sm" onClick={() => shift(-1)} aria-label="Previous month">←</button>
        <div className="cal-title">{grid.label}</div>
        <button className="btn btn-sm" onClick={() => shift(1)} aria-label="Next month">→</button>
        <button className="btn btn-sm" onClick={() => { const n = new Date(); setCursor({ year: n.getFullYear(), month: n.getMonth() }); }}>Today</button>
        {isCrew && <span className="chip chip-blue" style={{ marginLeft: 'auto' }}>your itinerary</span>}
      </div>

      <div className="cal-grid" style={{ marginBottom: 6 }}>
        {DOW.map((d) => <div key={d} className="cal-dow">{d}</div>)}
      </div>

      {grid.weeks.map((week, wi) => (
        <div className="cal-grid" key={wi} style={{ marginBottom: 6 }}>
          {week.map((cell) => (
            <div
              key={cell.date}
              className="cal-cell"
              data-inmonth={cell.inMonth}
              data-today={cell.isToday}
              data-picked={cell.date === picked}
              onClick={() => cell.inMonth && setPicked(cell.date === picked ? null : cell.date)}
              role="button"
              tabIndex={cell.inMonth ? 0 : -1}
              onKeyDown={(e) => { if (e.key === 'Enter' && cell.inMonth) setPicked(cell.date === picked ? null : cell.date); }}
              style={{ cursor: cell.inMonth ? 'pointer' : 'default' }}
            >
              <div className="cal-daynum">{cell.day}</div>
              {cell.events.map((e) => (
                <a
                  key={e.id + cell.date}
                  className="cal-ev"
                  href={`#/event/${e.id}`}
                  onClick={(ev) => ev.stopPropagation()}
                  style={{ ['--evc' as string]: e.color }}
                  title={`${e.name} · ${e.clientName}`}
                >
                  {e.name}
                </a>
              ))}
            </div>
          ))}
        </div>
      ))}

      {picked && (
        <section className="card" style={{ marginTop: 18 }}>
          <div className="card-head">
            <div className="card-title">{pickedLabel}{isCrew ? ' — your day' : ' — day itinerary'}</div>
            <button className="btn btn-ghost btn-sm" onClick={() => setPicked(null)}>Close</button>
          </div>
          {itinerary.length === 0 ? (
            <div className="muted" style={{ fontSize: 13 }}>
              {isCrew ? 'No shifts or journeys for you this day.' : 'Nothing scheduled across any event this day.'}
            </div>
          ) : itinerary.map((it, i) => (
            <div className="ov-ev" key={i} style={{ ['--evc' as string]: it.color }}>
              <span className="mono ov-ev-date" style={{ minWidth: 44 }}>{it.time || '—'}</span>
              <span className={`chip ${KIND_META[it.kind].chip}`} style={{ fontSize: 10 }}>{KIND_META[it.kind].icon} {it.kind}</span>
              <span className="ov-ev-name">
                <a href={`#/event/${it.eventId}`} style={{ color: 'inherit', textDecoration: 'none' }}>{it.label}</a>
              </span>
              {it.sub && <span className="mono ov-ev-date">{it.sub}</span>}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
