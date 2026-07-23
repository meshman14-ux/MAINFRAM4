/* Overview — the whole-system operations dashboard. Totals across every
   operator (events, units, staff, alerts) plus one widget per operator
   with live status and per-event dashboard buttons. Read-only: it links
   into the Console and Events register for action. */
import { useMemo } from 'react';
import { useOpsData } from '../data/useOpsData';
import type { Client } from '../data/types';
import { eventStatus } from '../components/console/eventStatus';
import { complianceSummary, reorderForClient } from '../data/phase6';

const fmt = (iso?: string) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'TBC';

export default function Overview() {
  const { data, ready, error } = useOpsData();

  const rows = useMemo(() => {
    if (!ready) return [];
    return data.all<Client>('clients').map((client) => {
      const events = data.eventsForClient(client.id)
        .sort((a, b) => (a.start || '').localeCompare(b.start || ''))
        .map((e) => ({ e, st: eventStatus(e), color: data.eventColor(e.id) }));
      return {
        client,
        events,
        units: data.unitsForClient(client.id).length,
        staff: data.staffForClient(client.id).length,
        lowStock: reorderForClient(data, client.id).length,
        comp: complianceSummary(data, client.id),
        logi: data.logisticsSummary(client.id),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, data.meta().updatedAt]);

  if (error) return <div className="p4"><div className="banner">Couldn't load data: {error}</div></div>;
  if (!ready) return <div className="state"><div><div className="spinner" /><div className="eyebrow">Loading overview</div></div></div>;
  if (rows.length === 0) return <div className="p4"><div className="empty-state">No operators yet. Add one from Client Accounts to begin.</div></div>;

  const tot = rows.reduce((t, r) => ({
    events: t.events + r.events.length,
    live: t.live + r.events.filter((x) => x.st.kind === 'live').length,
    upcoming: t.upcoming + r.events.filter((x) => x.st.kind === 'upcoming').length,
    units: t.units + r.units,
    staff: t.staff + r.staff,
    lowStock: t.lowStock + r.lowStock,
    blocked: t.blocked + r.comp.blocked,
    enRoute: t.enRoute + r.logi.enRoute,
  }), { events: 0, live: 0, upcoming: 0, units: 0, staff: 0, lowStock: 0, blocked: 0, enRoute: 0 });

  return (
    <div className="p4">
      <div className="client-bar">
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 20 }}>System overview</div>
          <div className="client-meta">Every operator, every event — one board</div>
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi-chip"><div className="k">Operators</div><div className="v" style={{ color: 'var(--ink)' }}>{rows.length}</div></div>
        <div className="kpi-chip"><div className="k">Events</div><div className="v" style={{ color: 'var(--neon-cyan)' }}>{tot.events}</div></div>
        <div className="kpi-chip"><div className="k">Live now</div><div className="v" style={{ color: tot.live ? 'var(--ok)' : 'var(--ink-3)' }}>{tot.live}</div></div>
        <div className="kpi-chip"><div className="k">Upcoming</div><div className="v" style={{ color: 'var(--accent-2)' }}>{tot.upcoming}</div></div>
        <div className="kpi-chip"><div className="k">Units</div><div className="v" style={{ color: 'var(--neon-pink)' }}>{tot.units}</div></div>
        <div className="kpi-chip"><div className="k">Staff</div><div className="v" style={{ color: 'var(--neon-green)' }}>{tot.staff}</div></div>
        <div className="kpi-chip"><div className="k">Below par</div><div className="v" style={{ color: tot.lowStock ? 'var(--neon-yellow)' : 'var(--ink-3)' }}>{tot.lowStock}</div></div>
        <div className="kpi-chip"><div className="k">Blocked crew</div><div className="v" style={{ color: tot.blocked ? 'var(--neon-pink)' : 'var(--ink-3)' }}>{tot.blocked}</div></div>
      </div>

      <div className="ov-grid">
        {rows.map(({ client, events, units, staff, lowStock, comp, logi }) => (
          <div className="unit-card" key={client.id} style={{ ['--uc' as string]: 'var(--neon-cyan)' }}>
            <div className="ev-head">
              <span className="unit-name" style={{ marginTop: 0 }}>{client.name}</span>
              <span className="client-status" data-status={client.status}>{client.status}</span>
              <a className="btn btn-primary btn-sm" href="#/console" style={{ marginLeft: 'auto', textDecoration: 'none' }}>Console</a>
            </div>
            <div className="ev-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <div className="ev-field"><div className="ev-label">Events</div><div className="fv mono">{events.length}</div></div>
              <div className="ev-field"><div className="ev-label">Units</div><div className="fv mono">{units}</div></div>
              <div className="ev-field"><div className="ev-label">Staff</div><div className="fv mono">{staff}</div></div>
            </div>
            {(lowStock > 0 || comp.blocked > 0 || logi.enRoute > 0) && (
              <div className="row-inline" style={{ marginTop: 10, flexWrap: 'wrap' }}>
                {lowStock > 0 && <span className="chip chip-amber">{lowStock} stock line{lowStock !== 1 ? 's' : ''} low</span>}
                {comp.blocked > 0 && <span className="chip chip-red">{comp.blocked} crew blocked</span>}
                {logi.enRoute > 0 && <span className="chip chip-blue">{logi.enRoute} en route</span>}
              </div>
            )}
            {events.length > 0 && (
              <div style={{ marginTop: 12 }}>
                {events.map(({ e, st, color }) => (
                  <div className="ov-ev" key={e.id} style={{ ['--evc' as string]: color }}>
                    <span className="ev-swatch" style={{ color }} />
                    <span className="ov-ev-name">{e.name}</span>
                    <span className="mono ov-ev-date">{fmt(e.start)}</span>
                    <span className="status-pill" data-kind={st.kind}>{st.label}</span>
                    <a className="btn btn-ghost btn-sm" href={`#/events/${e.id}`} style={{ textDecoration: 'none' }}>Open →</a>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
