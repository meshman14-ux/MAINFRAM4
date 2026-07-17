import { useMemo, useState } from 'react';
import { useOpsData } from '../data/useOpsData';
import { monthGrid } from '../data/phase4';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function Calendar() {
  const { data, ready, error } = useOpsData();
  // Default to the month of the earliest upcoming event, else today.
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const grid = useMemo(
    () => (ready ? monthGrid(data, cursor.year, cursor.month) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, data.meta().updatedAt, cursor.year, cursor.month]
  );

  function shift(delta: number) {
    setCursor((c) => {
      const d = new Date(Date.UTC(c.year, c.month + delta, 1));
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
    });
  }

  if (error) return <div className="p4"><div className="banner">Couldn't load data: {error}</div></div>;
  if (!ready || !grid) return <div className="state"><div><div className="spinner" /><div className="eyebrow">Loading calendar</div></div></div>;

  return (
    <div className="p4">
      <div className="cal-head">
        <button className="btn btn-sm" onClick={() => shift(-1)} aria-label="Previous month">←</button>
        <div className="cal-title">{grid.label}</div>
        <button className="btn btn-sm" onClick={() => shift(1)} aria-label="Next month">→</button>
        <button className="btn btn-sm" onClick={() => { const n = new Date(); setCursor({ year: n.getFullYear(), month: n.getMonth() }); }}>Today</button>
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
            >
              <div className="cal-daynum">{cell.day}</div>
              {cell.events.map((e) => (
                <a
                  key={e.id + cell.date}
                  className="cal-ev"
                  href="#/console"
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
    </div>
  );
}
