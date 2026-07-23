/* Home — the calm page. One glance answers "is everything OK, and what
   needs me today?" in plain English: big status tiles (each one a link
   to the fix), the next event, and the top three actions. Everything
   dense — graphs, pins, per-vendor detail — lives in Command Centre. */
import { useMemo } from 'react';
import { useOpsData } from '../data/useOpsData';
import { homeKpis, needsAction, eventRows } from '../data/home';

const fmtDate = (iso?: string) =>
  iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '';

export default function Home() {
  const { data, ready, error } = useOpsData();

  const view = useMemo(() => {
    if (!ready) return null;
    return { kpis: homeKpis(data), actions: needsAction(data), rows: eventRows(data) };
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
        <div><div className="spinner" /><div className="eyebrow">Loading operations</div></div>
      </div>
    );
  }

  const { kpis, actions, rows } = view;
  const isFirstRun = data.all('clients').length === 0;

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

  const next = rows[0] || null;
  const problems = kpis.crewGaps + kpis.unconfirmed + kpis.stockLow + kpis.complianceAlerts + kpis.blockedEvents;
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  /* Plain-English tiles: what it is, whether it's fine, where to fix it. */
  const tiles: { label: string; value: number | string; sub: string; href: string; ok: boolean }[] = [
    { label: 'Events coming up', value: kpis.eventsAhead, sub: 'across all operators', href: '#/events', ok: true },
    { label: 'Crew to sort', value: kpis.crewGaps + kpis.unconfirmed, sub: kpis.crewGaps + kpis.unconfirmed ? `${kpis.crewGaps} unfilled · ${kpis.unconfirmed} unconfirmed` : 'everyone booked & confirmed', href: '#/callouts', ok: kpis.crewGaps + kpis.unconfirmed === 0 },
    { label: 'Stock to reorder', value: kpis.stockLow, sub: kpis.stockLow ? 'lines below par' : 'everything at par', href: '#/stock', ok: kpis.stockLow === 0 },
    { label: 'Compliance to fix', value: kpis.complianceAlerts, sub: kpis.complianceAlerts ? 'items missing or expiring' : 'all in date', href: '#/compliance', ok: kpis.complianceAlerts === 0 },
    { label: 'Events blocked', value: kpis.blockedEvents, sub: kpis.blockedEvents ? 'required compliance missing' : 'nothing blocked', href: '#/readiness', ok: kpis.blockedEvents === 0 },
  ];

  return (
    <div className="page">
      {/* greeting */}
      <div style={{ margin: '10px 0 22px' }}>
        <div className="eyebrow">{today}</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, margin: '6px 0 4px' }}>
          {problems === 0 ? 'All clear — everything is under control.' : `${problems} thing${problems !== 1 ? 's' : ''} need${problems === 1 ? 's' : ''} your attention.`}
        </h1>
        <div className="muted" style={{ fontSize: 14 }}>
          Tap a tile to go straight to the fix, or open the{' '}
          <a href="#/command" style={{ color: 'var(--accent)' }}>Command Centre</a> for the full picture.
        </div>
      </div>

      {/* status tiles */}
      <div className="kpis" style={{ marginBottom: 24 }}>
        {tiles.map((t) => (
          <a className="kpi home-tile" key={t.label} href={t.href} data-ok={t.ok}>
            <div className="label">{t.label}</div>
            <div className="value" style={{ color: t.ok ? 'var(--ok)' : 'var(--warn)' }}>{t.value}</div>
            <div className="sub">{t.sub}</div>
          </a>
        ))}
      </div>

      <div className="grid-2">
        {/* next event hero */}
        <section className="card">
          <div className="card-head"><div className="card-title">Next event</div></div>
          {!next ? (
            <div className="muted" style={{ fontSize: 14 }}>Nothing booked ahead. <a href="#/console" style={{ color: 'var(--accent)' }}>Create an event →</a></div>
          ) : (
            <div style={{ ['--evc' as string]: next.color }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span className="ev-swatch" style={{ color: next.color }} />
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700 }}>{next.name}</span>
                <span className="reg-badge" data-status={next.daysOut <= 0 ? 'live' : undefined} style={{ marginLeft: 'auto' }}>{next.countdownLabel}</span>
              </div>
              <div className="muted" style={{ fontSize: 13.5, margin: '6px 0 14px' }}>
                {next.clientName} · {next.loc || 'location TBC'} · {fmtDate(next.start)}{next.end && next.end !== next.start ? ` – ${fmtDate(next.end)}` : ''}
              </div>
              <div className="reg-staffbar" data-ok={next.need > 0 && next.filled >= next.need}>
                <span className="bar"><span style={{ width: `${next.need ? Math.min(100, Math.round((next.filled / next.need) * 100)) : 0}%` }} /></span>
                <span className="mono">{next.filled}/{next.need} crew · {next.confirmed} confirmed{next.stockLow ? ` · ${next.stockLow} stock low` : ''}</span>
              </div>
              <div className="row-inline" style={{ marginTop: 16 }}>
                <a className="btn btn-primary" href={`#/event/${next.id}`} style={{ textDecoration: 'none' }}>Open the event →</a>
                <a className="btn btn-ghost" href="#/readiness" style={{ textDecoration: 'none' }}>Check readiness</a>
              </div>
            </div>
          )}
        </section>

        {/* what needs you today */}
        <section className="card">
          <div className="card-head">
            <div className="card-title">What needs you today</div>
            {actions.length > 3 && <a href="#/command" style={{ fontSize: 12.5, color: 'var(--accent)' }}>All {actions.length} →</a>}
          </div>
          {actions.length === 0 ? (
            <div className="muted" style={{ fontSize: 14 }}>Nothing — enjoy the quiet. ✓</div>
          ) : (
            actions.slice(0, 3).map((a, i) => (
              <div className="action-row" key={i}>
                <span className="action-tag" style={{ color: a.color }}>{a.kind}</span>
                <span style={{ fontSize: 13.5, lineHeight: 1.5 }}>{a.message}</span>
                <a className="action-go" href={`#/event/${a.eventId}`} aria-label={`Open ${a.eventName}`}>→</a>
              </div>
            ))
          )}
          <div className="row-inline" style={{ marginTop: 18, flexWrap: 'wrap' }}>
            <a className="btn btn-sm" href="#/command" style={{ textDecoration: 'none' }}>Command Centre</a>
            <a className="btn btn-sm" href="#/console" style={{ textDecoration: 'none' }}>Console</a>
            <a className="btn btn-sm" href="#/calendar" style={{ textDecoration: 'none' }}>Calendar</a>
            <a className="btn btn-sm" href="#/timesheets" style={{ textDecoration: 'none' }}>Timesheets</a>
          </div>
        </section>
      </div>
    </div>
  );
}
