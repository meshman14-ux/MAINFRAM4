import { useMemo } from 'react';
import type { OpsData } from '../../data/opsData';
import { eventStatus } from './eventStatus';

interface Props {
  data: OpsData;
  clientId: string;
  onOpen: (eventId: string) => void;
}

const fmt = (iso?: string) =>
  iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—';

/* Chronological index of the client's events — a wrapping strip of neon
   bars joined by glowing connectors. Hover expands the detail card;
   click jumps to that event's dashboard. Data comes from the shared
   store, so realtime changes reflow the strip automatically. */
export function EventTimeline({ data, clientId, onOpen }: Props) {
  const events = useMemo(
    () => data.eventsForClient(clientId).sort((a, b) => (a.start || '').localeCompare(b.start || '')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.meta().updatedAt, clientId]
  );

  if (events.length === 0) return null;

  return (
    <div className="tl" role="list" aria-label="Event timeline">
      {events.map((e) => {
        const col = data.eventColor(e.id);
        const st = eventStatus(e);
        const assigned = data.assignmentsForEvent(e.id).length;
        const units = data.unitsForEvent(e).length;
        return (
          <button
            key={e.id}
            role="listitem"
            className="tl-item"
            data-kind={st.kind}
            style={{ ['--uc' as string]: col }}
            onClick={() => onOpen(e.id)}
          >
            <span className="tl-dot" />
            <span className="tl-bar" />
            <span className="tl-name">{e.name}</span>
            <span className="tl-date mono">{fmt(e.start)}</span>
            <span className="tl-pop">
              <span className="tl-pop-name">{e.name}</span>
              <span className="tl-pop-row mono">{fmt(e.start)}{e.end && e.end !== e.start ? ` – ${fmt(e.end)}` : ''} · {st.label}</span>
              {e.loc && <span className="tl-pop-row">{e.loc}</span>}
              <span className="tl-pop-row">{units} units · {assigned} staff assigned</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
