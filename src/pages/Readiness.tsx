/* Readiness — per-event prep panel. The weighted score breaks into six
   sections (crew and compliance weigh most); each expands to the exact
   outstanding items with a deep-link to fix them. Hard gate: an event
   can never show READY while a required compliance item is missing. */
import { useMemo, useState } from 'react';
import { useOpsData } from '../data/useOpsData';
import type { Client, EventRec } from '../data/types';
import { prepPanel } from '../data/phase13';

const todayISO = () => new Date().toISOString().slice(0, 10);
const daysOut = (start?: string) =>
  start ? Math.round((new Date(start + 'T00:00:00').getTime() - new Date(todayISO() + 'T00:00:00').getTime()) / 86400000) : 0;

export default function Readiness() {
  const { data, ready, error } = useOpsData();
  const [clientId, setClientId] = useState('');

  const clients = useMemo(
    () => (ready ? data.all<Client>('clients') : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, data.meta().updatedAt]
  );
  const activeId = clientId || clients[0]?.id || '';

  const events = useMemo(
    () => (activeId
      ? data.eventsForClient(activeId)
        .filter((e) => (e.end || e.start || '') >= todayISO())
        .sort((a, b) => (a.start || '').localeCompare(b.start || ''))
      : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeId, data.meta().updatedAt]
  );

  if (error) return <div className="p4"><div className="banner">Couldn't load data: {error}</div></div>;
  if (!ready) return <div className="state"><div><div className="spinner" /><div className="eyebrow">Loading readiness</div></div></div>;
  if (clients.length === 0) return <div className="p4"><div className="empty-state">No operators yet.</div></div>;

  return (
    <div className="p4">
      <div className="client-bar">
        <select className="client-select" value={activeId} onChange={(e) => setClientId(e.target.value)} aria-label="Operator">
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <span className="client-meta">Weighted go-live readiness · crew and compliance weigh most</span>
      </div>

      {events.length === 0 ? (
        <div className="empty-state">No upcoming events to assess.</div>
      ) : (
        events.map((e) => <ReadyCard key={e.id} data={data} event={e} />)
      )}
    </div>
  );
}

function barColor(pct: number) {
  if (pct >= 100) return 'var(--green)';
  if (pct >= 60) return 'var(--blue)';
  if (pct >= 30) return 'var(--amber)';
  return 'var(--red)';
}

function ReadyCard({ data, event }: { data: ReturnType<typeof useOpsData>['data']; event: EventRec }) {
  const panel = prepPanel(data, event);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const color = data.eventColor(event.id);
  const d = daysOut(event.start);

  return (
    <div className="ready-card" style={{ ['--evc' as string]: color }}>
      <div className="ready-head">
        <span style={{ width: 10, height: 10, borderRadius: 3, background: color }} />
        <span className="ready-name">{event.name}</span>
        <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>T-{Math.max(0, d)}</span>
        {panel.blocked ? (
          <span className="chip chip-red" style={{ marginLeft: 8 }}>BLOCKED — required compliance</span>
        ) : (
          <span className="ready-badge" data-ready={panel.ready} style={{ marginLeft: 8 }}>{panel.ready ? 'READY' : 'IN PREP'}</span>
        )}
        <span className="ready-pct" style={{ color: panel.blocked ? 'var(--red)' : barColor(panel.score) }}>{panel.score}%</span>
        <a className="btn btn-ghost btn-sm" href={`#/event/${event.id}`} style={{ textDecoration: 'none' }}>Dashboard →</a>
      </div>
      <div className="ready-bar">
        <div className="ready-fill" style={{ width: `${panel.score}%`, background: panel.blocked ? 'var(--red)' : barColor(panel.score) }} />
      </div>

      {panel.blocked && (
        <div className="warn-banner" style={{ marginTop: 12, marginBottom: 4 }}>
          <div className="wt">Hard gate — this event cannot go ready until:</div>
          {panel.blockers.map((b, i) => <div className="warn-item" key={i}>{b}</div>)}
        </div>
      )}

      <div className="prep-grid">
        {panel.sections.map((s) => {
          const open = openKey === s.key;
          return (
            <div className="prep-sec" key={s.key} data-done={s.done}>
              <button className="prep-row" aria-expanded={open} onClick={() => setOpenKey(open ? null : s.key)}>
                <span className="tick">{s.done ? '✓' : ''}</span>
                <span className="prep-label">{s.label}</span>
                <span className="mono prep-pct" style={{ color: barColor(s.pct) }}>{s.pct}%</span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>{open ? '▾' : '▸'}</span>
              </button>
              {open && (
                <div className="prep-detail">
                  {s.items.length === 0 ? (
                    <div className="muted" style={{ fontSize: 12.5 }}>Nothing outstanding.</div>
                  ) : s.items.map((it, i) => <div className="prep-item" key={i}>○ {it}</div>)}
                  <a className="btn btn-primary btn-sm" href={s.link} style={{ textDecoration: 'none', marginTop: 8, display: 'inline-block' }}>
                    Fix in {s.label} →
                  </a>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
