import { useMemo, useState } from 'react';
import { useOpsData } from '../data/useOpsData';
import type { Client } from '../data/types';
import { EventsTab } from '../components/console/EventsTab';
import { EventTimeline } from '../components/console/EventTimeline';
import { eventStatus } from '../components/console/eventStatus';
import { TAB_COLORS } from '../components/console/unitTheme';
import { UnitsTab } from '../components/console/UnitsTab';
import { StaffTab } from '../components/console/StaffTab';
import { StockTab } from '../components/console/StockTab';
import { StaffingTab } from '../components/console/StaffingTab';

const TABS = ['Events', 'Units', 'Staff', 'Stock', 'Staffing'] as const;
type Tab = typeof TABS[number];

export default function OpsConsole() {
  const { data, ready, error } = useOpsData();
  const [clientId, setClientId] = useState<string>('');
  const [tab, setTab] = useState<Tab>('Events');

  const clients = useMemo(
    () => (ready ? data.all<Client>('clients') : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, data.meta().updatedAt]
  );

  // Default to the first client once loaded.
  const activeId = clientId || clients[0]?.id || '';
  const client = clients.find((c) => c.id === activeId) || null;

  // Console totals — events by status plus fleet, headcount and the
  // week span the client's season covers (first start → last end).
  const kpis = useMemo(() => {
    if (!ready || !activeId) return { total: 0, upcoming: 0, live: 0, units: 0, staff: 0, weeks: 0 };
    const events = data.eventsForClient(activeId);
    const statuses = events.map((e) => eventStatus(e).kind);
    const dates = events.flatMap((e) => [e.start, e.end || e.start]).filter(Boolean) as string[];
    let weeks = 0;
    if (dates.length) {
      const min = dates.reduce((a, b) => (a < b ? a : b));
      const max = dates.reduce((a, b) => (a > b ? a : b));
      const days = (new Date(max + 'T00:00:00').getTime() - new Date(min + 'T00:00:00').getTime()) / 86400000 + 1;
      weeks = Math.max(1, Math.ceil(days / 7));
    }
    return {
      total: statuses.length,
      upcoming: statuses.filter((k) => k === 'upcoming').length,
      live: statuses.filter((k) => k === 'live').length,
      units: data.unitsForClient(activeId).length,
      staff: data.staffForClient(activeId).length,
      weeks,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, activeId, data.meta().updatedAt]);

  if (error) {
    return <div className="console"><div className="banner">Couldn't load data: {error}</div></div>;
  }
  if (!ready) {
    return <div className="state"><div><div className="spinner" /><div className="eyebrow">Loading console</div></div></div>;
  }
  if (!client) {
    return (
      <div className="console">
        <div className="empty-state">
          No operators yet. Add one from Client Accounts to begin.
        </div>
      </div>
    );
  }

  return (
    <div className="console">
      <div className="client-bar">
        <select
          className="client-select"
          value={activeId}
          onChange={(e) => setClientId(e.target.value)}
          aria-label="Select operator"
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <span className="client-status" data-status={client.status}>{client.status}</span>
        {client.contact && <span className="client-meta">{client.contact}{client.phone ? ` · ${client.phone}` : ''}</span>}
      </div>

      <EventTimeline data={data} clientId={activeId} onOpen={() => setTab('Events')} />

      <div className="kpi-row">
        <div className="kpi-chip"><div className="k">Events</div><div className="v" style={{ color: 'var(--ink)' }}>{kpis.total}</div></div>
        <div className="kpi-chip"><div className="k">Upcoming</div><div className="v" style={{ color: 'var(--accent-2)' }}>{kpis.upcoming}</div></div>
        <div className="kpi-chip"><div className="k">Live now</div><div className="v" style={{ color: kpis.live > 0 ? 'var(--ok)' : 'var(--ink-3)' }}>{kpis.live}</div></div>
        <div className="kpi-chip"><div className="k">Units</div><div className="v" style={{ color: 'var(--neon-pink)' }}>{kpis.units}</div></div>
        <div className="kpi-chip"><div className="k">Staff</div><div className="v" style={{ color: 'var(--neon-green)' }}>{kpis.staff}</div></div>
        <div className="kpi-chip"><div className="k">Week span</div><div className="v" style={{ color: 'var(--neon-yellow)' }}>{kpis.weeks}</div></div>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            className="tab"
            role="tab"
            aria-selected={tab === t}
            style={{ ['--tc' as string]: TAB_COLORS[t] }}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === 'Events' && <EventsTab data={data} clientId={activeId} />}
        {tab === 'Units' && <UnitsTab data={data} clientId={activeId} />}
        {tab === 'Staff' && <StaffTab data={data} clientId={activeId} />}
        {tab === 'Stock' && <StockTab data={data} clientId={activeId} />}
        {tab === 'Staffing' && <StaffingTab data={data} clientId={activeId} />}
      </div>
    </div>
  );
}
