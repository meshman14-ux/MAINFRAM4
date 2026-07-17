import { useMemo } from 'react';
import { useOpsData } from '../data/useOpsData';
import {
  homeKpis, needsAction, eventRows, nextEventConfirmations,
} from '../data/home';

const fmtDate = (iso?: string) =>
  iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';

export default function Home() {
  const { data, ready, error } = useOpsData();

  // Recompute derived views whenever the store changes (ready flips + emits).
  const view = useMemo(() => {
    if (!ready) return null;
    return {
      kpis: homeKpis(data),
      actions: needsAction(data),
      rows: eventRows(data),
      confirmations: nextEventConfirmations(data),
    };
    // `ready` is the signal; data is a stable singleton.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, data, data.meta().updatedAt]);

  if (error) {
    return (
      <div className="page">
        <div className="banner">
          Couldn't load data: {error}. Check your Supabase keys in <code>.env</code> and that the schema is installed.
        </div>
      </div>
    );
  }

  if (!ready || !view) {
    return (
      <div className="state">
        <div>
          <div className="spinner" />
          <div className="eyebrow">Loading operations</div>
        </div>
      </div>
    );
  }

  const { kpis, actions, rows, confirmations } = view;
  const isFirstRun = data.all('clients').length === 0;

  async function markConfirmed(assignmentId: string, current: boolean) {
    // Toggle the confirmed flag; optimistic + persisted via the store.
    await data.save('assignments', { id: assignmentId, confirmed: !current });
  }

  if (isFirstRun) {
    return (
      <div className="page">
        <div className="card" style={{ maxWidth: 560, margin: '48px auto', textAlign: 'center', padding: 36 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Welcome to MAINFRAME</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, margin: '0 0 10px' }}>Let's set up your first operator</h1>
          <p className="muted" style={{ fontSize: 14.5, marginBottom: 22 }}>
            Nothing here yet — the onboarding wizard will walk you through
            creating an operator, adding units and crew, and seeding default stock.
            Takes about two minutes.
          </p>
          <a className="btn btn-primary" href="#/onboard" style={{ display: 'inline-block', padding: '11px 22px' }}>Start setup →</a>
        </div>
      </div>
    );
  }

  return (
    <>
      <KpiRow kpis={kpis} />

      <div className="page" style={{ paddingTop: 0 }}>
        <div className="grid-2">
          {/* LEFT: needs action + events register */}
          <div>
            <section className="card" aria-labelledby="needs-action-h">
              <div className="card-head">
                <div className="card-title" id="needs-action-h">
                  Needs action <span className="pill">{actions.length}</span>
                </div>
              </div>
              {actions.length === 0 ? (
                <Empty label="All clear — nothing needs attention." />
              ) : (
                actions.map((a, i) => (
                  <div className="action-row" key={i}>
                    <span className="tag" data-kind={a.kind}>{a.kind}</span>
                    <span className="action-msg">{stripEventPrefix(a.message, a.eventName)}</span>
                    <a className="action-go" href={`#/events/${a.eventId}`} aria-label={`Open ${a.eventName}`}>→</a>
                  </div>
                ))
              )}
            </section>

            <section className="card" aria-labelledby="register-h">
              <div className="card-head">
                <div className="card-title" id="register-h">Events register · all operators</div>
                <a className="link-btn" href="#/events">Full register →</a>
              </div>
              {rows.length === 0 ? (
                <Empty label="No upcoming events. Create one in the Events register." />
              ) : (
                rows.map((r) => (
                  <a
                    className="event-row"
                    key={r.id}
                    href={`#/events/${r.id}`}
                    style={{ ['--evc' as string]: r.color }}
                  >
                    <div className="event-top">
                      <span className="event-name">{r.name}</span>
                      <span className="event-client">{r.clientName}</span>
                      <span className="event-countdown">{r.countdownLabel}</span>
                    </div>
                    <div className="event-meta">
                      <span><span className="k">Dates</span>{fmtDate(r.start)}{r.end && r.end !== r.start ? ` – ${fmtDate(r.end)}` : ''}</span>
                      <span><span className="k">Loc</span>{r.loc || '—'}</span>
                      <span><span className="k">Units</span>{r.units}</span>
                      <span><span className="k">Crew</span>{r.filled}/{r.need}</span>
                      <span className={r.confirmed === r.filled && r.filled > 0 ? 'chip-ok' : ''}>
                        <span className="k">Conf</span>{r.confirmed} confirmed
                      </span>
                      <span className={r.stockLow > 0 ? 'chip-low' : 'chip-ok'}>
                        <span className="k">Stock</span>{r.stockLow > 0 ? `${r.stockLow} low` : 'ok'}
                      </span>
                    </div>
                  </a>
                ))
              )}
            </section>
          </div>

          {/* RIGHT: crew confirmations for the next event */}
          <div>
            <section className="card" aria-labelledby="confirm-h">
              <div className="confirm-head">
                <div className="card-title" id="confirm-h">Crew confirmations</div>
                <span className="confirm-count">
                  {confirmations.confirmed} / {confirmations.total} confirmed
                </span>
              </div>
              {confirmations.event ? (
                <>
                  <div className="confirm-call">
                    {confirmations.event.name} · crew call {confirmations.event.callTime || '—'} · {fmtDate(confirmations.event.start)}
                  </div>
                  {confirmations.rows.length === 0 ? (
                    <Empty label="No crew assigned yet." />
                  ) : (
                    confirmations.rows.map((c) => (
                      <div className="confirm-row" key={c.assignmentId}>
                        <div>
                          <div className="crew-name">{c.staffName}</div>
                          <div className="crew-meta">{c.unitCode} · {c.unitName}</div>
                        </div>
                        {c.phone ? (
                          <a
                            className="btn btn-wa"
                            href={waLink(c.phone, confirmations.event!.name, confirmations.event!.callTime)}
                            target="_blank" rel="noreferrer"
                          >
                            WhatsApp
                          </a>
                        ) : <span />}
                        <button
                          className="btn btn-mark"
                          onClick={() => markConfirmed(c.assignmentId, c.confirmed)}
                          aria-pressed={c.confirmed}
                        >
                          {c.confirmed ? '✓ Confirmed' : 'Mark ✓'}
                        </button>
                      </div>
                    ))
                  )}
                </>
              ) : (
                <Empty label="No upcoming event to confirm crew for." />
              )}
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

function KpiRow({ kpis }: { kpis: ReturnType<typeof homeKpis> }) {
  const tiles: { label: string; value: number | string; sub: string; color?: string }[] = [
    { label: 'Operators', value: kpis.operators, sub: 'entities on system' },
    { label: 'Events ahead', value: kpis.eventsAhead, sub: 'all operators', color: 'var(--blue)' },
    { label: 'Crew gaps', value: kpis.crewGaps, sub: 'positions unfilled', color: 'var(--violet)' },
    { label: 'Unconfirmed', value: kpis.unconfirmed, sub: 'shifts not confirmed', color: 'var(--amber)' },
    { label: 'Stock low', value: kpis.stockLow, sub: 'lines below par', color: 'var(--pink)' },
  ];
  return (
    <div className="page" style={{ paddingBottom: 0 }}>
      <div className="kpis">
        {tiles.map((t) => (
          <div className="kpi" key={t.label}>
            <div className="label">{t.label}</div>
            <div className="value" style={{ color: t.color }}>{t.value}</div>
            <div className="sub">{t.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return <div style={{ color: 'var(--ink-3)', fontSize: 14, padding: '8px 2px' }}>{label}</div>;
}

/** The event name is already shown as a tag/heading; trim the leading
 *  "Name — " from messages so rows read cleanly. */
function stripEventPrefix(message: string, name: string): string {
  const p = `${name} — `;
  return message.startsWith(p) ? message.slice(p.length) : message;
}

function waLink(phone: string, eventName: string, callTime?: string): string {
  const text = encodeURIComponent(
    `Hi — confirming you for ${eventName}${callTime ? `, crew call ${callTime}` : ''}. Can you confirm? Thanks.`
  );
  const num = phone.replace(/[^\d]/g, '');
  return `https://wa.me/${num}?text=${text}`;
}
