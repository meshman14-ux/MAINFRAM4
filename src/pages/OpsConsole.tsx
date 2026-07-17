import { useMemo, useState } from 'react';
import { useOpsData } from '../data/useOpsData';
import type { Client } from '../data/types';
import { EventsTab } from '../components/console/EventsTab';
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

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            className="tab"
            role="tab"
            aria-selected={tab === t}
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
