/* ============================================================
   TripleTimeline — three live Gantt widgets (Annual · Monthly ·
   Daily) on the same data, with a shared sort/filter control bar
   and a persisted layout system (stack / columns / grid, plus
   collapse + reorder per widget).

   Data comes from the central store (useOpsData) so realtime
   flows in automatically. Overlap → lane stacking is the pure
   src/lib/overlap.ts engine. Layout state is src/lib/
   useWidgetLayout.ts. The server RPCs (src/lib/timelineApi.ts)
   back the same reads for overlap/sort/filter when needed.

   Bars drag to reschedule (operators): Annual shifts by whole
   months, Monthly by whole days, with a right-edge resize handle
   to change the end. Multi-select (shift-click) moves together.
   The Daily widget is the within-day view (read-only, like
   EventGantt) since events are date-granular in the schema.
   ============================================================ */
import { useMemo, useState, useRef, useCallback } from 'react';
import { useOpsData } from '../data/useOpsData';
import type { EventRec, Client } from '../data/types';
import { unitColor } from '../components/console/unitTheme';
import { assignLanes, overlapCounts, type Interval } from '../lib/overlap';
import {
  addDaysISO, daysInMonth, callMinute,
  yearInterval, monthInterval, dayInterval, shiftBoth, shiftEnd,
} from '../lib/timelineScale';
import { useWidgetLayout, type WidgetId, type LayoutMode } from '../lib/useWidgetLayout';

const OP_PALETTE = ['var(--accent)', 'var(--accent-2)', 'var(--neon-green)', 'var(--neon-yellow)', 'var(--neon-pink)'];
const todayISO = () => new Date().toISOString().slice(0, 10);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const PRIORITY_COLOR: Record<string, string> = { high: 'var(--danger)', medium: 'var(--warn)', low: 'var(--ink-3)' };
const parse = (s?: string) => (s ? new Date(s + 'T00:00:00') : null);

type SortKey = 'time' | 'duration' | 'category' | 'priority' | 'overlap';

export default function TripleTimeline({ onOpenEvent }: { onOpenEvent?: (id: string) => void }) {
  const { data, ready, error } = useOpsData();
  const open = onOpenEvent || ((id: string) => { window.location.hash = `#/event/${id}`; });
  const { layout, dispatch } = useWidgetLayout();

  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth()); // 0-11
  const [day, setDay] = useState(() => todayISO());
  const [sortBy, setSortBy] = useState<SortKey>('time');
  const [fCategory, setFCategory] = useState('');
  const [fPriority, setFPriority] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const ctx = useMemo(() => {
    if (!ready) return null;
    const clients = data.all<Client>('clients');
    const opColor = (cid: string) => OP_PALETTE[Math.max(0, clients.findIndex((c) => c.id === cid)) % OP_PALETTE.length];
    const areaColor = (e: EventRec) => unitColor(data.unitsForEvent(e)[0]?.type);
    let events = data.all<EventRec>('events').filter((e) => e.start);
    if (fCategory) events = events.filter((e) => (e.category || '') === fCategory);
    if (fPriority) events = events.filter((e) => (e.priority || '') === fPriority);
    const counts = overlapCounts(events.map((e) => ({ id: e.id, start: parse(e.start)!.getTime(), end: parse(e.end || e.start)!.getTime() + 86400000 })));
    const dur = (e: EventRec) => (parse(e.end || e.start)!.getTime() - parse(e.start)!.getTime());
    events = [...events].sort((a, b) => {
      if (sortBy === 'duration') return dur(b) - dur(a);
      if (sortBy === 'category') return (a.category || '~').localeCompare(b.category || '~');
      if (sortBy === 'priority') return (a.priority || '~').localeCompare(b.priority || '~');
      if (sortBy === 'overlap') return (counts.get(b.id) || 0) - (counts.get(a.id) || 0);
      return (a.start || '').localeCompare(b.start || '');
    });
    const categories = [...new Set(data.all<EventRec>('events').map((e) => e.category).filter(Boolean))] as string[];
    return { events, opColor, areaColor, counts, categories };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, data.meta().updatedAt, sortBy, fCategory, fPriority]);

  const reschedule = useCallback(async (ids: string[], patch: (e: EventRec) => Partial<EventRec>) => {
    for (const id of ids) {
      const e = data.get<EventRec>('events', id);
      if (e) await data.save('events', { id, ...patch(e) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (error) return <div className="p4"><div className="banner">Couldn't load data: {error}</div></div>;
  if (!ready || !ctx) return <div className="state"><div><div className="spinner" /><div className="eyebrow">Loading timelines</div></div></div>;

  const toggleSelect = (id: string, additive: boolean) => {
    setSelected((prev) => {
      const next = new Set(additive ? prev : []);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const widgetProps = { ctx, open, selected, toggleSelect, reschedule };

  const widgets: Record<WidgetId, React.ReactNode> = {
    year: <YearWidget {...widgetProps} year={year} setYear={setYear} onZoom={(m) => { setMonth(m); }} />,
    month: <MonthWidget {...widgetProps} year={year} month={month} setMonth={setMonth} setYear={setYear} onZoom={(d) => setDay(d)} />,
    day: <DayWidget {...widgetProps} day={day} setDay={setDay} />,
  };

  const gridClass =
    layout.mode === 'columns' ? { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, alignItems: 'start' } :
    layout.mode === 'grid' ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gridAutoRows: 'min-content', gap: 12 } :
    { display: 'flex', flexDirection: 'column' as const, gap: 12 };

  return (
    <div className="p4" style={{ maxWidth: 1320 }}>
      {/* shared control bar */}
      <div className="toolbar" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>Timelines</h2>
        <div className="row-inline" style={{ flexWrap: 'wrap', gap: 10 }}>
          <label style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>Sort
            <select className="sel" style={{ marginLeft: 6, width: 'auto' }} value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)}>
              <option value="time">Time</option><option value="duration">Duration</option>
              <option value="category">Category</option><option value="priority">Priority</option>
              <option value="overlap">Overlap</option>
            </select>
          </label>
          <label style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>Category
            <select className="sel" style={{ marginLeft: 6, width: 'auto' }} value={fCategory} onChange={(e) => setFCategory(e.target.value)}>
              <option value="">All</option>
              {ctx.categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>Priority
            <select className="sel" style={{ marginLeft: 6, width: 'auto' }} value={fPriority} onChange={(e) => setFPriority(e.target.value)}>
              <option value="">All</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
            </select>
          </label>
          <span style={{ width: 1, height: 22, background: 'var(--panel-line)' }} />
          <div className="segmented" role="tablist" aria-label="Layout mode">
            {(['stack', 'columns', 'grid'] as LayoutMode[]).map((m) => (
              <button key={m} aria-pressed={layout.mode === m} onClick={() => dispatch({ type: 'setMode', mode: m })}>{m}</button>
            ))}
          </div>
        </div>
      </div>
      {selected.size > 0 && (
        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
          {selected.size} selected · drag any selected bar to move them together · <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>clear</button>
        </div>
      )}

      <div style={gridClass}>
        {layout.order.map((id) => {
          const pref = layout.widgets[id];
          const big = layout.mode === 'grid' && id === layout.order[0];
          return (
            <section key={id} className="card" style={{
              padding: 0, overflow: 'hidden',
              gridColumn: big ? '1 / -1' : undefined,
              flex: layout.mode === 'stack' ? pref.size : undefined,
            }}>
              <div className="card-head" style={{ padding: '10px 14px', cursor: 'default' }}>
                <div className="card-title" style={{ textTransform: 'capitalize' }}>{id} view</div>
                <span className="row-inline">
                  <button className="btn btn-ghost btn-sm" aria-label={`Move ${id} earlier`} onClick={() => dispatch({ type: 'reorder', id, dir: -1 })}>↑</button>
                  <button className="btn btn-ghost btn-sm" aria-label={`Move ${id} later`} onClick={() => dispatch({ type: 'reorder', id, dir: 1 })}>↓</button>
                  <button className="btn btn-ghost btn-sm" aria-expanded={!pref.collapsed} aria-label={`${pref.collapsed ? 'Expand' : 'Collapse'} ${id} view`} onClick={() => dispatch({ type: 'toggleCollapse', id })}>{pref.collapsed ? '▸' : '▾'}</button>
                </span>
              </div>
              {!pref.collapsed && <div style={{ padding: '4px 14px 16px' }}>{widgets[id]}</div>}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   Shared widget internals
   ============================================================ */
interface Ctx {
  events: EventRec[];
  opColor: (cid: string) => string;
  areaColor: (e: EventRec) => string;
  counts: Map<string, number>;
  categories: string[];
}
interface WidgetShared {
  ctx: Ctx;
  open: (id: string) => void;
  selected: Set<string>;
  toggleSelect: (id: string, additive: boolean) => void;
  reschedule: (ids: string[], patch: (e: EventRec) => Partial<EventRec>) => Promise<void>;
}

const LANE_H = 26;

/** One lane-stacked Gantt grid. Bars positioned in fractional columns. */
function GanttGrid({
  shared, colCount, colLabels, toInterval, draggable, unit, onBarOpen, useAreaData,
}: {
  shared: WidgetShared;
  colCount: number;
  colLabels: string[];
  toInterval: (e: EventRec) => { start: number; end: number } | null;
  draggable: boolean;
  unit: 'month' | 'day';        // drag granularity
  onBarOpen: (e: EventRec) => void;
  useAreaData: ReturnType<typeof useOpsData>['data'];
}) {
  const { ctx, selected, toggleSelect, reschedule } = shared;
  const bodyRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; deltaCols: number; mode: 'move' | 'resize' } | null>(null);

  const placed = useMemo(() => {
    const items: (Interval & { e: EventRec })[] = [];
    ctx.events.forEach((e) => {
      const iv = toInterval(e);
      if (iv && iv.end > 0 && iv.start < colCount) items.push({ id: e.id, start: iv.start, end: iv.end, e });
    });
    const { laned, laneCount } = assignLanes(items);
    return { laned, laneCount };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.events, colCount]);

  const colWidthPx = () => (bodyRef.current ? bodyRef.current.clientWidth / colCount : 0);

  const onPointerDown = (e: React.PointerEvent, id: string, mode: 'move' | 'resize') => {
    if (!draggable) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const startX = e.clientX;
    const cw = colWidthPx() || 1;
    const onMove = (ev: PointerEvent) => setDrag({ id, mode, deltaCols: Math.round((ev.clientX - startX) / cw) });
    const onUp = async (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const deltaCols = Math.round((ev.clientX - startX) / cw);
      setDrag(null);
      if (deltaCols === 0) return;
      const ids = mode === 'move' && selected.has(id) ? [...selected] : [id];
      if (mode === 'resize') {
        await reschedule([id], (evt) => ({ end: shiftEnd(evt, deltaCols, unit) }));
      } else {
        await reschedule(ids, (evt) => shiftBoth(evt, deltaCols, unit));
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: colCount <= 12 ? 0 : colCount * 34 }}>
        {/* header */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${colCount}, 1fr)`, gap: 0, marginBottom: 6 }}>
          {colLabels.map((l, i) => (
            <div key={i} className="mono" style={{ fontSize: 9, color: 'var(--ink-3)', textAlign: 'center', borderLeft: i ? '1px solid var(--panel-line)' : 'none', padding: '2px 0' }}>{l}</div>
          ))}
        </div>
        {/* body */}
        <div ref={bodyRef} style={{ position: 'relative', height: Math.max(1, placed.laneCount) * LANE_H + 6 }}>
          {/* grid lines */}
          {colLabels.map((_, i) => (
            <div key={i} aria-hidden style={{ position: 'absolute', left: `${(i / colCount) * 100}%`, top: 0, bottom: 0, width: 1, background: 'var(--panel-line)', opacity: 0.5 }} />
          ))}
          {placed.laned.length === 0 && <div className="muted" style={{ fontSize: 12, padding: '10px 2px' }}>Nothing scheduled in this window.</div>}
          {placed.laned.map(({ item, lane }) => {
            const e = (item as any).e as EventRec;
            const border = ctx.opColor(e.clientId);
            const area = ctx.areaColor(e);
            const isSel = selected.has(e.id);
            const dcols = drag && (drag.id === e.id || (drag.mode === 'move' && isSel && selected.has(drag.id))) ? drag.deltaCols : 0;
            const left = ((item.start + (drag?.mode === 'move' ? dcols : 0)) / colCount) * 100;
            const rawW = item.end - item.start + (drag?.mode === 'resize' && drag.id === e.id ? dcols : 0);
            const width = (Math.max(0.4, rawW) / colCount) * 100;
            const oc = ctx.counts.get(e.id) || 0;
            const units = useAreaData.unitsForEvent(e).length;
            return (
              <div key={e.id}
                role="button" tabIndex={0}
                aria-label={`${e.name}, ${e.category || 'uncategorised'}, priority ${e.priority || 'none'}${oc ? `, overlaps ${oc}` : ''}`}
                title={`${e.name}\n${e.start}${e.end && e.end !== e.start ? ` – ${e.end}` : ''}${e.category ? `\n${e.category}` : ''}${e.priority ? ` · ${e.priority} priority` : ''}${oc ? `\n⚠ overlaps ${oc}` : ''}${units ? `\n${units} unit${units !== 1 ? 's' : ''}` : ''}`}
                onClick={(ev) => { if (ev.shiftKey) toggleSelect(e.id, true); else onBarOpen(e); }}
                onKeyDown={(k) => { if (k.key === 'Enter') onBarOpen(e); }}
                onPointerDown={(ev) => onPointerDown(ev, e.id, 'move')}
                style={{
                  position: 'absolute', top: lane * LANE_H + 3, left: `${left}%`, width: `${width}%`,
                  height: LANE_H - 6, borderRadius: 6, cursor: draggable ? 'grab' : 'pointer',
                  background: `color-mix(in oklch, ${border} 42%, var(--panel))`,
                  border: `1px solid ${isSel ? 'var(--neon-cyan)' : border}`,
                  boxShadow: isSel ? '0 0 8px var(--neon-cyan)' : `0 0 6px color-mix(in oklch, ${border} 30%, transparent)`,
                  display: 'flex', alignItems: 'center', gap: 5, padding: '0 6px', overflow: 'hidden', userSelect: 'none',
                }}>
                <span style={{ width: 6, height: 6, borderRadius: 2, background: area, boxShadow: `0 0 5px ${area}`, flex: 'none' }} />
                <span style={{ fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</span>
                {e.priority && <span style={{ width: 6, height: 6, borderRadius: '50%', background: PRIORITY_COLOR[e.priority] || 'var(--ink-3)', flex: 'none' }} title={`${e.priority} priority`} />}
                {e.category && <span className="mono" style={{ fontSize: 7.5, color: 'var(--ink-2)', flex: 'none' }}>{e.category.slice(0, 3).toUpperCase()}</span>}
                {oc > 0 && <span className="mono" style={{ fontSize: 8, color: 'var(--danger)', flex: 'none' }} title={`overlaps ${oc}`}>⚠{oc}</span>}
                {draggable && <span onPointerDown={(ev) => onPointerDown(ev, e.id, 'resize')} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 8, cursor: 'ew-resize' }} aria-hidden />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---- Annual: months across the year ---- */
function YearWidget({ ctx, open, selected, toggleSelect, reschedule, year, setYear, onZoom }: WidgetShared & {
  year: number; setYear: (y: number) => void; onZoom: (m: number) => void;
}) {
  const { data } = useOpsData();
  return (
    <div>
      <div className="row-inline" style={{ marginBottom: 8 }}>
        <button className="btn btn-sm" onClick={() => setYear(year - 1)} aria-label="Previous year">←</button>
        <span className="mono" style={{ fontSize: 12, fontWeight: 700 }}>{year}</span>
        <button className="btn btn-sm" onClick={() => setYear(year + 1)} aria-label="Next year">→</button>
        <span className="muted" style={{ fontSize: 11 }}>drag a bar to move by whole months</span>
      </div>
      <GanttGrid
        shared={{ ctx, open, selected, toggleSelect, reschedule }}
        colCount={12} colLabels={MONTHS} draggable unit="month" useAreaData={data}
        onBarOpen={(e) => onZoom(parse(e.start!)!.getMonth())}
        toInterval={(e) => yearInterval(e, year)}
      />
    </div>
  );
}

/* ---- Monthly: days across the month ---- */
function MonthWidget({ ctx, open, selected, toggleSelect, reschedule, year, month, setMonth, setYear, onZoom }: WidgetShared & {
  year: number; month: number; setMonth: (m: number) => void; setYear: (y: number) => void; onZoom: (d: string) => void;
}) {
  const { data } = useOpsData();
  const dim = daysInMonth(year, month);
  const labels = Array.from({ length: dim }, (_, i) => String(i + 1));
  const shift = (delta: number) => { const d = new Date(year, month + delta, 1); setYear(d.getFullYear()); setMonth(d.getMonth()); };
  return (
    <div>
      <div className="row-inline" style={{ marginBottom: 8 }}>
        <button className="btn btn-sm" onClick={() => shift(-1)} aria-label="Previous month">←</button>
        <span className="mono" style={{ fontSize: 12, fontWeight: 700 }}>{MONTHS[month]} {year}</span>
        <button className="btn btn-sm" onClick={() => shift(1)} aria-label="Next month">→</button>
        <span className="muted" style={{ fontSize: 11 }}>drag to move by days · drag the right edge to resize</span>
      </div>
      <GanttGrid
        shared={{ ctx, open, selected, toggleSelect, reschedule }}
        colCount={dim} colLabels={labels} draggable unit="day" useAreaData={data}
        onBarOpen={(e) => onZoom(e.start!)}
        toInterval={(e) => monthInterval(e, year, month)}
      />
    </div>
  );
}

/* ---- Daily: hours across the day (read-only, within-day view) ---- */
function DayWidget({ ctx, open, selected, toggleSelect, reschedule, day, setDay }: WidgetShared & {
  day: string; setDay: (d: string) => void;
}) {
  const { data } = useOpsData();
  const dayEvents = ctx.events.filter((e) => e.start! <= day && day <= (e.end || e.start!));
  // fitted hour axis around each event's crew call → +8h trading window
  let axMin = 6 * 60, axMax = 24 * 60;
  dayEvents.forEach((e) => { const c = callMinute(e); axMin = Math.min(axMin, Math.floor((c - 60) / 60) * 60); axMax = Math.max(axMax, Math.ceil((c + 8 * 60 + 60) / 60) * 60); });
  axMin = Math.max(0, axMin);
  const span = Math.max(60, axMax - axMin);
  const ticks: number[] = [];
  for (let h = Math.ceil(axMin / 60); h * 60 <= axMax; h++) ticks.push(h * 60);
  const labels = ticks.map((m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:00`);

  return (
    <div>
      <div className="row-inline" style={{ marginBottom: 8 }}>
        <button className="btn btn-sm" onClick={() => setDay(addDaysISO(day, -1))} aria-label="Previous day">←</button>
        <span className="mono" style={{ fontSize: 12, fontWeight: 700 }}>{new Date(day + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
        <button className="btn btn-sm" onClick={() => setDay(addDaysISO(day, 1))} aria-label="Next day">→</button>
        <button className="btn btn-sm" onClick={() => setDay(todayISO())}>Today</button>
      </div>
      <GanttGrid
        shared={{ ctx, open, selected, toggleSelect, reschedule }}
        colCount={ticks.length} colLabels={labels} draggable={false} unit="day" useAreaData={data}
        onBarOpen={(e) => open(e.id)}
        toInterval={(e) => dayInterval(callMinute(e), axMin, span, ticks.length)}
      />
    </div>
  );
}
