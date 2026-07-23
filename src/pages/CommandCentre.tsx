import { useMemo, type CSSProperties } from 'react';
import { useOpsData } from '../data/useOpsData';

/* ============================================================
   CommandCentre — the top-level operations dashboard, ported
   from the Home.dc.html prototype into the live app.
   Sections: KPI strip · Needs Action alerts · Events Register ·
   Crew Confirmations (WhatsApp + mark) · Modules grid · the
   highly-visual all-operators events table.

   Reads through the central store (useOpsData). To stay drop-in
   safe it computes from raw tables (data.all/get) with small
   local helpers, so it does not depend on any particular helper
   method existing on the store.
   ============================================================ */

// ---- palette (matches the neon theme tokens) ----
const C = {
  text: 'var(--ink, oklch(0.97 0.005 260))',
  muted: 'var(--ink-2, oklch(0.72 0.02 260))',
  faint: 'var(--ink-3, oklch(0.52 0.02 260))',
  accent: 'var(--accent, oklch(0.72 0.19 250))',
  accent2: 'var(--neon-purple, oklch(0.62 0.25 295))',
  ok: 'var(--ok, oklch(0.80 0.21 150))',
  warn: 'var(--warn, oklch(0.75 0.18 55))',
  danger: 'var(--danger, oklch(0.70 0.24 350))',
  panel: 'var(--surface, oklch(0.165 0.025 268 / 0.7))',
  panel2: 'var(--surface-2, oklch(0.21 0.028 268 / 0.8))',
  line: 'var(--line, oklch(0.32 0.035 268))',
  bg: 'var(--bg, oklch(0.13 0.022 268))',
};
const PALETTE = [C.accent, C.accent2, C.ok, C.warn, C.danger];
const MONO = "'JetBrains Mono', ui-monospace, monospace";

const todayISO = () => new Date().toISOString().slice(0, 10);
const fmt = (iso?: string) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
const daysBetween = (a: string, b: string) => Math.round((new Date(a + 'T00:00:00').getTime() - new Date(b + 'T00:00:00').getTime()) / 86400000);

export interface CommandCentreProps {
  /** navigate within the app (e.g. hash route). Defaults to setting window.location.hash */
  onNavigate?: (route: string) => void;
}

export default function CommandCentre({ onNavigate }: CommandCentreProps) {
  const { data, ready, error } = useOpsData();
  const go = onNavigate || ((r: string) => { window.location.hash = r; });

  const vals = useMemo(() => {
    const today = todayISO();
    const clients = ready ? data.all<any>('clients') : [];
    const allEvents = ready ? data.all<any>('events') : [];
    const allUnits = ready ? data.all<any>('units') : [];
    const allStaff = ready ? data.all<any>('staff') : [];
    const allStock = ready ? data.all<any>('stock') : [];
    const allAsg = ready ? data.all<any>('assignments') : [];

    // local helpers (independent of store helper names)
    const unitsForClient = (cid: string) => allUnits.filter((u) => u.clientId === cid);
    const staffForClient = (cid: string) => allStaff.filter((s) => s.clientId === cid);
    const asgForEvent = (eid: string) => allAsg.filter((a) => a.eventId === eid);
    const lowStockForClient = (cid: string) => allStock.filter((s) => {
      const unit = allUnits.find((u) => u.id === s.unitId);
      return unit && unit.clientId === cid && s.par != null && Number(s.qty) < Number(s.par);
    });
    const cname = (cid: string) => (clients.find((c) => c.id === cid)?.name) || '';
    const statusOf = (e: any) => {
      const s = e.start || '', en = e.end || e.start || '';
      if (en < today) return 'past'; if (s <= today && today <= en) return 'live'; return 'upcoming';
    };

    const upcoming = allEvents
      .filter((e) => (e.end || e.start || '') >= today)
      .sort((a, b) => (a.start || '').localeCompare(b.start || ''));

    const evStats = upcoming.map((e) => {
      const units = unitsForClient(e.clientId);
      const target = units.reduce((n, u) => n + (Number(u.crew) || 0), 0);
      const asgs = asgForEvent(e.id);
      const confirmed = asgs.filter((a) => a.confirmed).length;
      const low = lowStockForClient(e.clientId).length;
      const days = Math.max(0, daysBetween(e.start || today, today));
      return { e, units, target, asgs, confirmed, low, days };
    });

    // ---- alerts ----
    const alerts: any[] = [];
    evStats.forEach((s) => {
      if (s.target > 0 && s.asgs.length < s.target && s.days <= 30)
        alerts.push({ kind: 'STAFFING', color: C.warn, route: `#/console/${encodeURIComponent(s.e.clientId)}`,
          text: `${s.e.name} — ${s.target - s.asgs.length} crew short (${s.asgs.length}/${s.target}), ${s.days === 0 ? 'starts today' : s.days + ' days out'}` });
      if (s.asgs.length > 0 && s.confirmed < s.asgs.length && s.days <= 14)
        alerts.push({ kind: 'CONFIRM', color: C.accent2, route: '#/command',
          text: `${s.e.name} — ${s.asgs.length - s.confirmed} of ${s.asgs.length} crew not yet confirmed` });
    });
    clients.forEach((c) => {
      const low = lowStockForClient(c.id);
      if (low.length) alerts.push({ kind: 'STOCK', color: C.danger, route: '#/stock',
        text: `${c.name} — ${low.length} stock line${low.length > 1 ? 's' : ''} below par (${low.slice(0, 3).map((s) => s.item).join(', ')}${low.length > 3 ? '…' : ''})` });
      const rtw = staffForClient(c.id).filter((s) => s.rtw && s.rtw !== 'Verified');
      if (rtw.length) alerts.push({ kind: 'RTW', color: C.warn, route: '#/compliance',
        text: `${c.name} — right-to-work pending: ${rtw.map((s) => s.name).join(', ')}` });
    });

    // ---- events list (left column) ----
    const events = evStats.map((s) => {
      const crewOk = s.asgs.length >= s.target && s.target > 0;
      const confOk = s.asgs.length > 0 && s.confirmed === s.asgs.length;
      return {
        name: s.e.name, client: cname(s.e.clientId).toUpperCase(), route: `#/event/${s.e.id}`,
        when: fmt(s.e.start) + (s.e.end && s.e.end !== s.e.start ? ` – ${fmt(s.e.end)}` : '') + (s.e.loc ? ` · ${s.e.loc}` : ''),
        units: s.units.map((u) => u.code).join(' · ') || 'no units',
        countdown: s.days === 0 ? 'TODAY' : `T-${s.days}`, dColor: s.days <= 7 ? C.warn : C.faint,
        crew: `${s.asgs.length}/${s.target}`, crewColor: crewOk ? C.ok : C.warn,
        conf: `${s.confirmed} confirmed`, confColor: confOk ? C.ok : C.accent2,
        stock: s.low ? `${s.low} stock low` : 'stock ok', stockColor: s.low ? C.danger : C.ok,
      };
    });

    // ---- crew confirmations for the next event ----
    const nxt = evStats[0] || null;
    let confs: any[] = [], confEventName = '', confSummary = '', confSummaryColor = C.faint;
    if (nxt) {
      confEventName = `${nxt.e.name} · crew call ${nxt.e.callTime || 'TBC'} · ${fmt(nxt.e.start)}`;
      confSummary = `${nxt.confirmed} / ${nxt.asgs.length} confirmed`;
      confSummaryColor = (nxt.asgs.length && nxt.confirmed === nxt.asgs.length) ? C.ok : C.warn;
      confs = nxt.asgs.map((a) => {
        const st = data.get<any>('staff', a.staffId) || {};
        const un = data.get<any>('units', a.unitId) || {};
        const first = (st.name || '').split(' ')[0];
        return {
          id: a.id, name: st.name || '?', unit: `${un.code || ''} · ${un.name || ''}`,
          pending: !a.confirmed, done: !!a.confirmed,
          chase: () => {
            const msg = `Hi ${first}, confirming your shift: ${nxt.e.name} at ${nxt.e.loc || ''} on ${nxt.e.start || ''}, crew call ${nxt.e.callTime || 'TBC'}, unit ${un.code || ''}. Reply YES to confirm.`;
            window.open(`https://wa.me/${String(st.phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
          },
          confirm: () => data.save('assignments', { id: a.id, confirmed: true }),
          unconfirm: () => data.save('assignments', { id: a.id, confirmed: false }),
        };
      });
    }

    // ---- all-operators events table ----
    const table = allEvents.map((e) => {
      const units = unitsForClient(e.clientId);
      const target = units.reduce((n, u) => n + (Number(u.crew) || 0), 0);
      const asgs = asgForEvent(e.id);
      const conf = asgs.filter((a) => a.confirmed).length;
      const low = lowStockForClient(e.clientId).length;
      const st = statusOf(e);
      const days = daysBetween(e.start || today, today);
      const crewPct = target ? Math.min(100, Math.round(asgs.length / target * 100)) : 0;
      const confPct = asgs.length ? Math.round(conf / asgs.length * 100) : 0;
      const idx = Math.max(0, clients.findIndex((c) => c.id === e.clientId));
      const color = PALETTE[idx % PALETTE.length];
      const crewOk = asgs.length >= target && target > 0;
      const span = e.start ? (e.end && e.end !== e.start ? daysBetween(e.end, e.start) + 1 : 1) : 0;
      return {
        sortKey: (st === 'past' ? '2' : st === 'live' ? '0' : '1') + (e.start || 'zzz'),
        route: `#/event/${e.id}`,
        op: cname(e.clientId) || '—', opColor: color,
        opInitials: (cname(e.clientId) || '?').split(/\s+/).map((w: string) => w[0]).join('').slice(0, 2).toUpperCase(),
        name: e.name || 'Untitled', loc: e.loc || '—',
        dates: fmt(e.start) + (e.end && e.end !== e.start ? ` – ${fmt(e.end)}` : ''),
        daysInfo: span ? `${span} day${span > 1 ? 's' : ''}` : 'no dates',
        countdown: st === 'live' ? 'LIVE' : (st === 'past' ? 'DONE' : (days <= 0 ? 'TODAY' : `T-${days}`)),
        cdColor: st === 'live' ? C.ok : (st === 'past' ? C.faint : (days <= 7 ? C.warn : C.accent)),
        units: units.map((u) => u.code), noUnits: units.length === 0,
        crewLabel: `${asgs.length} / ${target}`, crewPct: crewPct + '%', crewColor: crewOk ? C.ok : C.warn,
        confLabel: `${conf} / ${asgs.length}`, confPct: confPct + '%', confColor: (asgs.length && conf === asgs.length) ? C.ok : C.accent2,
        stock: low ? `${low} low` : 'ok', stockColor: low ? C.danger : C.ok,
        status: ({ upcoming: 'UPCOMING', live: 'LIVE', past: 'DONE' } as any)[st],
        statusColor: ({ upcoming: C.accent2, live: C.ok, past: C.faint } as any)[st],
      };
    }).sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    // ---- KPIs ----
    const totalGap = evStats.reduce((n, s) => n + Math.max(0, s.target - s.asgs.length), 0);
    const totalLow = clients.reduce((n, c) => n + lowStockForClient(c.id).length, 0);
    const unconf = evStats.reduce((n, s) => n + (s.asgs.length - s.confirmed), 0);
    const kpis = [
      { label: 'Operators', value: String(clients.length), sub: 'entities on system', color: C.text },
      { label: 'Events ahead', value: String(upcoming.length), sub: 'all operators', color: C.accent2 },
      { label: 'Crew gaps', value: String(totalGap), sub: 'positions unfilled', color: totalGap ? C.warn : C.ok },
      { label: 'Unconfirmed', value: String(unconf), sub: 'shifts not confirmed', color: unconf ? C.accent2 : C.ok },
      { label: 'Stock low', value: String(totalLow), sub: 'lines below par', color: totalLow ? C.danger : C.ok },
    ];

    return { kpis, alerts, events, confs, confEventName, confSummary, confSummaryColor, table };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, data.meta().updatedAt]);

  const modules = [
    { label: 'Ops Console', sub: 'events · units · crew · stock', route: '#/console' },
    { label: 'Events Register', sub: 'all events · full details', route: '#/events' },
    { label: 'Events Calendar', sub: 'month view', route: '#/calendar' },
    { label: 'Callouts', sub: 'recruit & approve crew', route: '#/callouts' },
    { label: 'Compliance', sub: 'certs, RTW & expiry', route: '#/compliance' },
    { label: 'Staff Hub', sub: 'per-person profiles', route: '#/staff' },
    { label: 'Logistics', sub: 'journeys & routes', route: '#/logistics' },
    { label: 'Finance', sub: 'per-client P&L', route: '#/finance' },
  ];

  const card: CSSProperties = { background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: '18px 20px' };
  const secLabel = (color: string): CSSProperties => ({ fontSize: 12, fontWeight: 600, color, fontFamily: MONO, letterSpacing: '.05em' });

  if (error) return <div className="p4"><div className="banner">Couldn't load data: {error}</div></div>;
  if (!ready) return <div className="state"><div><div className="spinner" /><div className="eyebrow">Loading command centre</div></div></div>;

  return (
    <div data-screen-label="Command Centre" style={{ minHeight: '100vh', padding: '30px 28px 100px' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>

        {/* KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 11, marginBottom: 26 }}>
          {vals.kpis.map((k, i) => (
            <div key={i} style={{ ...card, padding: '13px 15px' }}>
              <div style={{ fontSize: 9.5, letterSpacing: '.08em', color: C.faint, fontFamily: MONO, textTransform: 'uppercase' }}>{k.label}</div>
              <div style={{ fontSize: 23, fontWeight: 700, fontFamily: MONO, color: k.color, marginTop: 3 }}>{k.value}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 18, alignItems: 'start' }}>
          {/* LEFT */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
            {/* alerts */}
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 13 }}>
                <div style={secLabel(C.danger)}>NEEDS ACTION</div>
                <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: C.danger, background: 'oklch(0.70 0.24 350/0.16)', borderRadius: 20, padding: '1px 8px' }}>{vals.alerts.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {vals.alerts.map((a, i) => (
                  <a key={i} href={a.route} onClick={(e) => { e.preventDefault(); go(a.route); }}
                    style={{ display: 'flex', gap: 11, alignItems: 'center', background: C.panel2, border: `1px solid ${C.line}`, borderLeft: `3px solid ${a.color}`, borderRadius: 9, padding: '9px 13px', color: 'inherit' }}>
                    <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 600, color: a.color, minWidth: 64, letterSpacing: '.04em' }}>{a.kind}</span>
                    <span style={{ flex: 1, fontSize: 13, lineHeight: 1.45 }}>{a.text}</span>
                    <span style={{ color: C.faint, fontSize: 12 }}>→</span>
                  </a>
                ))}
                {vals.alerts.length === 0 && <div style={{ fontSize: 13, color: C.ok, padding: '6px 2px' }}>All clear — nothing needs action. ✓</div>}
              </div>
            </div>

            {/* events register */}
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13 }}>
                <div style={secLabel(C.accent2)}>EVENTS REGISTER — ALL OPERATORS</div>
                <a href="#/events" onClick={(e) => { e.preventDefault(); go('#/events'); }} style={{ fontSize: 12, fontWeight: 600, color: C.accent }}>Full register →</a>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {vals.events.map((ev, i) => (
                  <a key={i} href={ev.route} onClick={(e) => { e.preventDefault(); go(ev.route); }}
                    style={{ display: 'block', background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 11, padding: '12px 15px', color: 'inherit' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                      <span style={{ fontSize: 14.5, fontWeight: 700 }}>{ev.name}</span>
                      <span style={{ fontSize: 11, color: C.faint, fontFamily: MONO }}>{ev.client}</span>
                      <span style={{ flex: 1 }} />
                      <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 600, color: ev.dColor }}>{ev.countdown}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11.5, color: C.muted }}>
                      <span>{ev.when}</span>
                      <span style={{ fontFamily: MONO, color: C.faint }}>{ev.units}</span>
                      <span style={{ color: ev.crewColor, fontFamily: MONO }}>crew {ev.crew}</span>
                      <span style={{ color: ev.confColor, fontFamily: MONO }}>{ev.conf}</span>
                      <span style={{ color: ev.stockColor, fontFamily: MONO }}>{ev.stock}</span>
                    </div>
                  </a>
                ))}
                {vals.events.length === 0 && <div style={{ fontSize: 13, color: C.faint }}>Nothing booked ahead.</div>}
              </div>
            </div>
          </div>

          {/* RIGHT */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
            {/* crew confirmations */}
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={secLabel(C.ok)}>CREW CONFIRMATIONS</div>
                <span style={{ fontFamily: MONO, fontSize: 11.5, color: vals.confSummaryColor }}>{vals.confSummary}</span>
              </div>
              <div style={{ fontSize: 11.5, color: C.faint, marginBottom: 12 }}>{vals.confEventName}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {vals.confs.map((c) => (
                  <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'center', background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 9, padding: '8px 11px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</div>
                      <div style={{ fontSize: 10.5, color: C.faint, fontFamily: MONO }}>{c.unit}</div>
                    </div>
                    {c.pending ? (
                      <>
                        <button onClick={c.chase} style={{ background: 'oklch(0.80 0.21 150/0.14)', border: `1px solid ${C.ok}`, color: C.ok, borderRadius: 7, padding: '5px 9px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>WhatsApp</button>
                        <button onClick={c.confirm} style={{ background: 'transparent', border: `1px solid ${C.line}`, color: C.muted, borderRadius: 7, padding: '5px 9px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Mark ✓</button>
                      </>
                    ) : (
                      <button onClick={c.unconfirm} style={{ background: 'transparent', border: 'none', color: C.ok, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: MONO }}>CONFIRMED ✓</button>
                    )}
                  </div>
                ))}
                {vals.confs.length === 0 && <div style={{ fontSize: 12.5, color: C.faint }}>No crew assigned to the next event yet — <a href="#/console" onClick={(e) => { e.preventDefault(); go('#/console'); }} style={{ color: C.accent }}>assign in the Console</a>.</div>}
              </div>
            </div>

            {/* modules */}
            <div style={card}>
              <div style={{ ...secLabel(C.accent), marginBottom: 12 }}>MODULES</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {modules.map((m, i) => (
                  <a key={i} href={m.route} onClick={(e) => { e.preventDefault(); go(m.route); }}
                    style={{ background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 10, padding: '11px 13px', color: 'inherit', display: 'block' }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{m.label}</div>
                    <div style={{ fontSize: 10.5, color: C.faint, marginTop: 2 }}>{m.sub}</div>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* visual events table */}
        <div style={{ ...card, marginTop: 18, overflowX: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={secLabel(C.accent)}>EVENTS SCHEDULE — ALL OPERATORS</div>
            <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: C.accent, background: 'oklch(0.72 0.19 250/0.14)', borderRadius: 20, padding: '1px 8px' }}>{vals.table.length}</span>
            <div style={{ flex: 1, height: 1, background: C.line }} />
            <a href="#/events" onClick={(e) => { e.preventDefault(); go('#/events'); }} style={{ fontSize: 12, fontWeight: 600, color: C.accent }}>Full register →</a>
          </div>
          <div style={{ minWidth: 940 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1.15fr 1.1fr 1fr 1fr 0.9fr', gap: 14, padding: '0 14px 9px', fontFamily: MONO, fontSize: 9, letterSpacing: '.1em', color: C.faint }}>
              <div>OPERATOR / EVENT</div><div>WHEN</div><div>UNITS</div><div>CREW</div><div>CONFIRMED</div><div>STATUS</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {vals.table.map((r, i) => (
                <a key={i} href={r.route} onClick={(e) => { e.preventDefault(); go(r.route); }}
                  style={{ display: 'grid', gridTemplateColumns: '1.7fr 1.15fr 1.1fr 1fr 1fr 0.9fr', gap: 14, alignItems: 'center', background: C.panel2, border: `1px solid ${C.line}`, borderLeft: `3px solid ${r.opColor}`, borderRadius: 12, padding: '12px 14px', color: 'inherit' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <div style={{ width: 32, height: 32, flex: 'none', borderRadius: 9, background: r.opColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: 11, fontWeight: 700, color: 'oklch(0.13 0.02 268)', boxShadow: `0 0 10px ${r.opColor}` }}>{r.opInitials}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                      <div style={{ fontSize: 10.5, color: C.faint, fontFamily: MONO, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.op} · {r.loc}</div>
                    </div>
                  </div>
                  <div>
                    <div style={{ display: 'inline-block', fontFamily: MONO, fontSize: 11, fontWeight: 700, color: r.cdColor, border: `1px solid ${r.cdColor}`, borderRadius: 6, padding: '2px 8px', marginBottom: 4 }}>{r.countdown}</div>
                    <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.muted }}>{r.dates}</div>
                    <div style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint }}>{r.daysInfo}</div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {r.units.map((u: string, j: number) => <span key={j} style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 600, color: C.muted, border: `1px solid ${C.line}`, borderRadius: 5, padding: '2px 6px' }}>{u}</span>)}
                    {r.noUnits && <span style={{ fontSize: 10.5, color: C.faint }}>no units</span>}
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 10.5, marginBottom: 4 }}><span style={{ color: C.muted }}>crew</span><span style={{ color: r.crewColor, fontWeight: 600 }}>{r.crewLabel}</span></div>
                    <div style={{ height: 6, borderRadius: 3, background: C.bg, overflow: 'hidden' }}><div style={{ height: '100%', borderRadius: 3, background: r.crewColor, boxShadow: `0 0 7px ${r.crewColor}`, width: r.crewPct }} /></div>
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 10.5, marginBottom: 4 }}><span style={{ color: C.muted }}>conf</span><span style={{ color: r.confColor, fontWeight: 600 }}>{r.confLabel}</span></div>
                    <div style={{ height: 6, borderRadius: 3, background: C.bg, overflow: 'hidden' }}><div style={{ height: '100%', borderRadius: 3, background: r.confColor, boxShadow: `0 0 7px ${r.confColor}`, width: r.confPct }} /></div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-start' }}>
                    <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 600, color: r.statusColor, border: `1px solid ${r.statusColor}`, borderRadius: 5, padding: '2px 8px' }}>{r.status}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: MONO, fontSize: 10, color: r.stockColor }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: r.stockColor, boxShadow: `0 0 6px ${r.stockColor}` }} />{r.stock}</span>
                  </div>
                </a>
              ))}
              {vals.table.length === 0 && <div style={{ fontSize: 13, color: C.faint, padding: '8px 2px' }}>No events on the system yet.</div>}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
