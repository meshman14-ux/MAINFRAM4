import { useMemo, useState, type CSSProperties } from 'react';
import { useOpsData } from '../data/useOpsData';
import type { Client, Staff, Unit, Vehicle, DocumentRec, ShoppingItem, Timesheet } from '../data/types';
import { EventTimeline } from '../components/console/EventTimeline';
import { eventStatus } from '../components/console/eventStatus';
import { unitColor } from '../components/console/unitTheme';
import { clientFinance, reorderForClient } from '../data/phase6';
import { clientPnL, docState } from '../data/phase12';
import { personalRag, prepPanel, calloutFill } from '../data/phase13';

/* ============================================================
   CommandCentre — the DENSE per-vendor cockpit. Where Home is
   calm and plain-English, this packs everything about one
   operator onto one screen: a KPI wall, money/compliance
   donuts, crew-cost bars, readiness gauges, the season
   timeline, a pinboard, alerts, confirmations with WhatsApp
   chase, ops mini-widgets and the full schedule table.
   Deliberately its own visual language (mono, tight, glowing).
   ============================================================ */

const C = {
  text: 'var(--ink)', muted: 'var(--ink-2)', faint: 'var(--ink-3)',
  accent: 'var(--accent)', accent2: 'var(--accent-2)',
  ok: 'var(--ok)', warn: 'var(--warn)', danger: 'var(--danger)',
  cyan: 'var(--neon-cyan)', pink: 'var(--neon-pink)', green: 'var(--neon-green)',
  yellow: 'var(--neon-yellow)', blue: 'var(--neon-blue)',
  panel: 'var(--surface, var(--panel))', panel2: 'var(--surface-2, var(--panel-2))',
  line: 'var(--line, var(--panel-line))', bg: 'var(--bg)',
};
const MONO = "'JetBrains Mono', ui-monospace, monospace";
const todayISO = () => new Date().toISOString().slice(0, 10);
const fmt = (iso?: string) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
const gbp = (n: number) => '£' + Math.round(n).toLocaleString('en-GB');

const card: CSSProperties = { background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: '16px 18px' };
const secLabel = (color: string): CSSProperties => ({ fontSize: 11, fontWeight: 600, color, fontFamily: MONO, letterSpacing: '.07em', textTransform: 'uppercase' });

interface Pin { id: string; text: string; tone: string; }
const PIN_TONES = ['var(--neon-cyan)', 'var(--neon-pink)', 'var(--neon-yellow)', 'var(--neon-green)', 'var(--accent-2)'];

export default function CommandCentre() {
  const { data, ready, error } = useOpsData();
  const [clientId, setClientId] = useState('');
  const [pinText, setPinText] = useState('');

  const clients = useMemo(
    () => (ready ? data.all<Client>('clients') : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, data.meta().updatedAt]
  );
  const activeId = clientId || clients[0]?.id || '';
  const vendor = clients.find((c) => c.id === activeId) || null;

  const v = useMemo(() => {
    if (!ready || !activeId) return null;
    const today = todayISO();
    const events = data.eventsForClient(activeId).sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    const upcoming = events.filter((e) => (e.end || e.start || '') >= today);
    const staff = data.staffForClient(activeId);
    const units = data.unitsForClient(activeId);
    const rags = staff.map((s) => personalRag(data, s));
    const pnl = clientPnL(data, activeId);
    const fin = clientFinance(data, activeId);
    const lowStock = reorderForClient(data, activeId);
    const fleet = data.all<Vehicle>('vehicles').filter((x) => x.clientId === activeId);
    const docs = data.all<DocumentRec>('documents').filter((x) => x.clientId === activeId);
    const docsFlagged = docs.filter((x) => { const s = docState(x); return s === 'expired' || s === 'expiring'; });
    const shoppingOpen = data.all<ShoppingItem>('shoppingLists')
      .filter((s) => !s.done && units.some((u) => u.id === s.unitId)).length;
    const logi = data.logisticsSummary(activeId);
    const timesheetsPending = data.all<Timesheet>('timesheets')
      .filter((t) => t.status === 'submitted' && events.some((e) => e.id === t.eventId)).length;

    const preps = upcoming.slice(0, 6).map((e) => ({ e, prep: prepPanel(data, e), color: data.eventColor(e.id) }));
    const fills = upcoming.map((e) => calloutFill(data, e));
    const crewGaps = fills.reduce((n, f) => n + Math.max(0, f.needed - f.filled), 0);
    const assigns = upcoming.flatMap((e) => data.assignmentsForEvent(e.id));
    const unconfirmed = assigns.filter((a) => !a.confirmed).length;

    // alerts for this vendor
    const alerts: { kind: string; color: string; route: string; text: string }[] = [];
    preps.forEach(({ e, prep }) => {
      if (prep.blocked) alerts.push({ kind: 'BLOCKED', color: C.danger, route: '#/readiness', text: `${e.name} — hard-gated: ${prep.blockers[0]}` });
    });
    upcoming.forEach((e) => {
      const f = calloutFill(data, e);
      if (f.needed > f.filled) alerts.push({ kind: 'STAFFING', color: C.warn, route: '#/callouts', text: `${e.name} — ${f.needed - f.filled} position${f.needed - f.filled !== 1 ? 's' : ''} unfilled (${f.filled}/${f.needed})` });
      const asg = data.assignmentsForEvent(e.id);
      const unconf = asg.filter((a) => !a.confirmed).length;
      if (unconf) alerts.push({ kind: 'CONFIRM', color: C.accent2, route: '#/command', text: `${e.name} — ${unconf} of ${asg.length} crew not confirmed` });
    });
    if (lowStock.length) alerts.push({ kind: 'STOCK', color: C.yellow, route: '#/stock', text: `${lowStock.length} stock line${lowStock.length !== 1 ? 's' : ''} below par (${lowStock.slice(0, 3).map((s: { item: string }) => s.item).join(', ')}${lowStock.length > 3 ? '…' : ''})` });
    rags.filter((r) => r.rag === 'red').forEach((r) => alerts.push({ kind: 'COMPLIANCE', color: C.pink, route: '#/compliance', text: `${r.name} — ${r.items.filter((i) => i.state !== 'ok').map((i) => i.type).slice(0, 3).join(', ')}` }));
    if (docsFlagged.length) alerts.push({ kind: 'DOCS', color: C.yellow, route: '#/compliance', text: `${docsFlagged.length} document${docsFlagged.length !== 1 ? 's' : ''} expired or expiring` });
    if (timesheetsPending) alerts.push({ kind: 'PAYROLL', color: C.blue, route: '#/timesheets', text: `${timesheetsPending} timesheet${timesheetsPending !== 1 ? 's' : ''} awaiting approval` });

    // confirmations for the next event
    const nxt = upcoming[0] || null;
    const confs = nxt ? data.assignmentsForEvent(nxt.id).map((a) => {
      const st = data.get<Staff>('staff', a.staffId);
      const un = data.get<Unit>('units', a.unitId);
      return { a, st, un };
    }) : [];

    return {
      events, upcoming, staff, units, rags, pnl, fin, lowStock, fleet, docs,
      docsFlagged, shoppingOpen, logi, timesheetsPending, preps, crewGaps,
      unconfirmed, alerts, nxt, confs,
      live: events.filter((e) => eventStatus(e).kind === 'live').length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, activeId, data.meta().updatedAt]);

  const pins = useMemo(() => {
    const all = (ready ? data.kvGet<Record<string, Pin[]>>('pins') : null) || {};
    return all[activeId] || [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, activeId, data.meta().updatedAt]);

  async function addPin() {
    if (!pinText.trim()) return;
    const all = data.kvGet<Record<string, Pin[]>>('pins') || {};
    const pin: Pin = { id: `p${Date.now().toString(36)}`, text: pinText.trim(), tone: PIN_TONES[pins.length % PIN_TONES.length] };
    await data.kvSet('pins', { ...all, [activeId]: [...pins, pin] });
    setPinText('');
  }
  async function removePin(id: string) {
    const all = data.kvGet<Record<string, Pin[]>>('pins') || {};
    await data.kvSet('pins', { ...all, [activeId]: pins.filter((p) => p.id !== id) });
  }

  if (error) return <div className="p4"><div className="banner">Couldn't load data: {error}</div></div>;
  if (!ready) return <div className="state"><div><div className="spinner" /><div className="eyebrow">Loading command centre</div></div></div>;
  if (!vendor || !v) return <div className="p4"><div className="empty-state">No operators yet. Add one from Client Accounts.</div></div>;

  const money = [
    { label: 'paid', value: v.pnl.paid, color: C.green },
    { label: 'outstanding', value: v.pnl.outstanding, color: C.yellow },
    { label: 'expenses', value: v.pnl.expenses, color: C.pink },
  ];
  const ragCounts = [
    { label: 'clear', value: v.rags.filter((r) => r.rag === 'green').length, color: C.green },
    { label: 'expiring', value: v.rags.filter((r) => r.rag === 'amber').length, color: C.yellow },
    { label: 'blocked', value: v.rags.filter((r) => r.rag === 'red').length, color: C.pink },
  ];
  const maxCost = Math.max(1, ...v.fin.events.map((e) => e.crewCost));

  const wall = [
    { k: 'Events', n: v.events.length, c: C.cyan, href: '#/events' },
    { k: 'Live now', n: v.live, c: v.live ? C.green : C.faint, href: '#/events' },
    { k: 'Units', n: v.units.length, c: C.pink, href: `#/console/${activeId}` },
    { k: 'Staff', n: v.staff.length, c: C.green, href: `#/console/${activeId}` },
    { k: 'Crew gaps', n: v.crewGaps, c: v.crewGaps ? C.warn : C.faint, href: '#/callouts' },
    { k: 'Unconfirmed', n: v.unconfirmed, c: v.unconfirmed ? C.accent2 : C.faint, href: '#/callouts' },
    { k: 'Stock low', n: v.lowStock.length, c: v.lowStock.length ? C.yellow : C.faint, href: '#/stock' },
    { k: 'Shopping', n: v.shoppingOpen, c: v.shoppingOpen ? C.blue : C.faint, href: '#/stock' },
    { k: 'Fleet', n: v.fleet.length, c: C.blue, href: '#/logistics' },
    { k: 'En route', n: v.logi.enRoute, c: v.logi.enRoute ? C.yellow : C.faint, href: '#/logistics' },
    { k: 'Docs flagged', n: v.docsFlagged.length, c: v.docsFlagged.length ? C.pink : C.faint, href: '#/compliance' },
    { k: 'Sheets to approve', n: v.timesheetsPending, c: v.timesheetsPending ? C.blue : C.faint, href: '#/timesheets' },
  ];

  return (
    <div data-screen-label="Command Centre" style={{ minHeight: '100vh', padding: '26px 24px 100px' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>

        {/* vendor bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
          <select className="client-select" value={activeId} onChange={(e) => setClientId(e.target.value)} aria-label="Vendor">
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <span className="client-status" data-status={vendor.status}>{vendor.status}</span>
          {vendor.contact && <span style={{ fontSize: 13, color: C.faint }}>{vendor.contact}{vendor.phone ? ` · ${vendor.phone}` : ''}</span>}
          <span style={{ flex: 1 }} />
          <span style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color: v.pnl.net >= 0 ? C.green : C.pink, textShadow: `0 0 12px color-mix(in oklch, ${v.pnl.net >= 0 ? C.green : C.pink} 45%, transparent)` }}>
            {gbp(v.pnl.net)} <span style={{ fontSize: 10, color: C.faint, fontWeight: 400 }}>NET</span>
          </span>
        </div>

        {/* KPI wall */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(105px,1fr))', gap: 8, marginBottom: 18 }}>
          {wall.map((w) => (
            <a key={w.k} href={w.href} style={{ ...card, padding: '9px 12px', textDecoration: 'none', color: 'inherit' }}>
              <div style={{ fontSize: 8.5, letterSpacing: '.08em', color: C.faint, fontFamily: MONO, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{w.k}</div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: MONO, color: w.c }}>{w.n}</div>
            </a>
          ))}
        </div>

        {/* monthly analytics + compliance evaluation */}
        <MonthlyChart events={v.events} fin={v.fin.events} rags={v.rags} preps={v.preps} />

        {/* season timeline */}
        <div style={{ ...card, marginBottom: 18, paddingBottom: 8 }}>
          <div style={{ ...secLabel(C.cyan), marginBottom: 8 }}>Season timeline</div>
          <EventTimeline data={data} clientId={activeId} onOpen={(id) => { window.location.hash = `#/event/${id}`; }} />
        </div>

        {/* graphs row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14, marginBottom: 18 }}>
          <Donut title="Money" total={gbp(v.pnl.invoiced)} totalSub="invoiced" segments={money} fmtVal={gbp} link="#/finance" />
          <Donut title="Crew compliance" total={String(v.staff.length)} totalSub="crew" segments={ragCounts} fmtVal={(n) => String(n)} link="#/compliance" />
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={secLabel(C.accent2)}>Crew cost by event</span>
              <a href="#/finance" style={{ fontSize: 11, color: C.accent }}>Finance →</a>
            </div>
            {v.fin.events.length === 0 ? (
              <div style={{ fontSize: 12, color: C.faint }}>No events yet.</div>
            ) : v.fin.events.slice(0, 6).map((e) => (
              <div key={e.eventId} style={{ marginBottom: 7 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 10, marginBottom: 2 }}>
                  <span style={{ color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{e.eventName}</span>
                  <span style={{ color: e.color, fontWeight: 700 }}>{gbp(e.crewCost)}</span>
                </div>
                <div style={{ height: 7, borderRadius: 4, background: C.bg, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.round((e.crewCost / maxCost) * 100)}%`, background: e.color, boxShadow: `0 0 8px ${e.color}`, borderRadius: 4 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* readiness gauges + pinboard */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 14, marginBottom: 18, alignItems: 'start' }}>
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={secLabel(C.green)}>Readiness gauges</span>
              <a href="#/readiness" style={{ fontSize: 11, color: C.accent }}>Prep panels →</a>
            </div>
            {v.preps.length === 0 ? (
              <div style={{ fontSize: 12.5, color: C.faint }}>No upcoming events.</div>
            ) : v.preps.map(({ e, prep, color }) => (
              <a key={e.id} href={`#/event/${e.id}`} style={{ display: 'block', textDecoration: 'none', color: 'inherit', marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                  <span style={{ fontWeight: 600 }}><span style={{ color, marginRight: 6 }}>●</span>{e.name}</span>
                  <span style={{ fontFamily: MONO, fontWeight: 700, color: prep.blocked ? C.danger : prep.score >= 80 ? C.green : prep.score >= 50 ? C.yellow : C.warn }}>
                    {prep.blocked ? 'BLOCKED' : `${prep.score}%`}
                  </span>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: C.bg, overflow: 'hidden', display: 'flex' }}>
                  {prep.sections.map((s) => (
                    <div key={s.key} title={`${s.label} ${s.pct}%`} style={{
                      width: `${(s.weight / 100) * 100}%`, height: '100%',
                      background: `color-mix(in oklch, ${prep.blocked && s.key === 'compliance' ? C.danger : s.done ? C.green : s.pct >= 50 ? C.yellow : C.warn} ${Math.max(25, s.pct)}%, ${C.bg})`,
                      borderRight: `1px solid ${C.bg}`,
                    }} />
                  ))}
                </div>
              </a>
            ))}
          </div>

          {/* pinboard */}
          <div style={card}>
            <div style={{ ...secLabel(C.yellow), marginBottom: 10 }}>Pinboard</div>
            {pins.length === 0 && <div style={{ fontSize: 12.5, color: C.faint, marginBottom: 8 }}>Pin anything you must not forget for {vendor.name} — it syncs to every device.</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              {pins.map((p) => (
                <div key={p.id} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: C.panel2, border: `1px solid ${C.line}`, borderLeft: `3px solid ${p.tone}`, borderRadius: 8, padding: '8px 10px' }}>
                  <span style={{ color: p.tone, fontSize: 11, marginTop: 1 }}>📌</span>
                  <span style={{ flex: 1, fontSize: 12.5, lineHeight: 1.45 }}>{p.text}</span>
                  <button onClick={() => removePin(p.id)} aria-label="Remove pin" style={{ background: 'none', border: 'none', color: C.faint, cursor: 'pointer', fontSize: 12 }}>✕</button>
                </div>
              ))}
            </div>
            <div className="row-inline">
              <input className="inp" placeholder="Pin a note…" value={pinText}
                onChange={(e) => setPinText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addPin(); }} />
              <button className="btn btn-primary btn-sm" onClick={addPin} disabled={!pinText.trim()}>Pin</button>
            </div>
          </div>
        </div>

        {/* alerts + confirmations */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 14, marginBottom: 18, alignItems: 'start' }}>
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 11 }}>
              <span style={secLabel(C.danger)}>Needs action — {vendor.name}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: v.alerts.length ? C.danger : C.green, background: 'color-mix(in oklch, currentColor 14%, transparent)', borderRadius: 20, padding: '1px 8px' }}>{v.alerts.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {v.alerts.map((a, i) => (
                <a key={i} href={a.route} style={{ display: 'flex', gap: 10, alignItems: 'center', background: C.panel2, border: `1px solid ${C.line}`, borderLeft: `3px solid ${a.color}`, borderRadius: 8, padding: '8px 12px', color: 'inherit', textDecoration: 'none' }}>
                  <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: a.color, minWidth: 74, letterSpacing: '.05em' }}>{a.kind}</span>
                  <span style={{ flex: 1, fontSize: 12.5, lineHeight: 1.45 }}>{a.text}</span>
                  <span style={{ color: C.faint, fontSize: 12 }}>→</span>
                </a>
              ))}
              {v.alerts.length === 0 && <div style={{ fontSize: 12.5, color: C.green }}>All clear for this vendor. ✓</div>}
            </div>
          </div>

          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={secLabel(C.green)}>Crew confirmations</span>
              {v.nxt && <span style={{ fontFamily: MONO, fontSize: 11, color: v.confs.length && v.confs.every((c) => c.a.confirmed) ? C.green : C.warn }}>
                {v.confs.filter((c) => c.a.confirmed).length}/{v.confs.length}
              </span>}
            </div>
            {!v.nxt ? (
              <div style={{ fontSize: 12.5, color: C.faint }}>No upcoming event.</div>
            ) : (
              <>
                <div style={{ fontSize: 11, color: C.faint, marginBottom: 10 }}>{v.nxt.name} · crew call {v.nxt.callTime || 'TBC'} · {fmt(v.nxt.start)}</div>
                {v.confs.length === 0 && <div style={{ fontSize: 12.5, color: C.faint }}>No crew assigned yet — <a href={`#/console/${activeId}`} style={{ color: C.accent }}>staff it in the Console</a>.</div>}
                {v.confs.map(({ a, st, un }) => (
                  <div key={a.id} style={{ display: 'flex', gap: 9, alignItems: 'center', background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 8, padding: '7px 10px', marginBottom: 6 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600 }}>{st?.name ?? '?'}</div>
                      <div style={{ fontSize: 10, color: C.faint, fontFamily: MONO }}>{un?.code || ''}{a.area ? ` · ${a.area}` : ''}</div>
                    </div>
                    {a.confirmed ? (
                      <button onClick={() => data.save('assignments', { id: a.id, confirmed: false })}
                        style={{ background: 'transparent', border: 'none', color: C.green, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: MONO }}>✓ CONF</button>
                    ) : (
                      <>
                        {st?.phone && (
                          <button onClick={() => {
                            const msg = `Hi ${(st.name || '').split(' ')[0]}, confirming your shift: ${v.nxt!.name} on ${v.nxt!.start || ''}, crew call ${v.nxt!.callTime || 'TBC'}, unit ${un?.code || ''}. Reply YES to confirm.`;
                            window.open(`https://wa.me/${String(st.phone).replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
                          }} style={{ background: 'color-mix(in oklch, var(--neon-green) 14%, transparent)', border: `1px solid ${C.green}`, color: C.green, borderRadius: 7, padding: '4px 8px', fontSize: 10.5, cursor: 'pointer', fontFamily: 'inherit' }}>WhatsApp</button>
                        )}
                        <button onClick={() => data.save('assignments', { id: a.id, confirmed: true })}
                          style={{ background: 'transparent', border: `1px solid ${C.line}`, color: C.muted, borderRadius: 7, padding: '4px 8px', fontSize: 10.5, cursor: 'pointer', fontFamily: 'inherit' }}>Mark ✓</button>
                      </>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* ops mini-widgets */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(215px,1fr))', gap: 14, marginBottom: 18 }}>
          <MiniList title="Fleet" color={C.blue} link="#/logistics" empty="No vehicles registered."
            rows={v.fleet.slice(0, 4).map((f) => ({ a: f.name, b: `${f.vtype}${f.towCapable ? ' · tow' : ''}`, c: f.reg || '' }))} />
          <MiniList title="Docs expiring" color={C.pink} link="#/compliance" empty="Nothing expiring. ✓"
            rows={v.docsFlagged.slice(0, 4).map((x) => ({ a: x.title, b: x.docType, c: x.expiry ? fmt(x.expiry) : '' }))} />
          <MiniList title="Low stock" color={C.yellow} link="#/stock" empty="Everything at par. ✓"
            rows={v.lowStock.slice(0, 4).map((l: { item: string; unitCode: string; orderQty: number }) => ({ a: l.item, b: l.unitCode, c: `+${l.orderQty}` }))} />
          <MiniList title="Units" color={C.pink} link={`#/console/${activeId}`} empty="No units yet."
            rows={v.units.slice(0, 4).map((u) => {
              const cl = u.checklist || [];
              return { a: `${u.code} · ${u.name}`, b: u.type, c: cl.length ? `${cl.filter((c) => c.on).length}/${cl.length}` : '—', tone: unitColor(u.type) };
            })} />
        </div>

        {/* schedule table */}
        <div style={{ ...card, overflowX: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={secLabel(C.accent)}>Schedule — {vendor.name}</span>
            <div style={{ flex: 1, height: 1, background: C.line }} />
            <a href="#/events" style={{ fontSize: 11.5, fontWeight: 600, color: C.accent }}>Full register →</a>
          </div>
          <div style={{ minWidth: 760 }}>
            {v.events.map((e) => {
              const st = eventStatus(e);
              const color = data.eventColor(e.id);
              const asg = data.assignmentsForEvent(e.id);
              const target = Object.values(data.staffingFor(e)).reduce((n: number, x) => n + (x as number), 0);
              const conf = asg.filter((a) => a.confirmed).length;
              return (
                <a key={e.id} href={`#/event/${e.id}`}
                  style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr 0.7fr', gap: 12, alignItems: 'center', background: C.panel2, border: `1px solid ${C.line}`, borderLeft: `3px solid ${color}`, borderRadius: 10, padding: '10px 13px', color: 'inherit', textDecoration: 'none', marginBottom: 7, opacity: st.kind === 'past' ? 0.55 : 1 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</div>
                    <div style={{ fontSize: 10, color: C.faint, fontFamily: MONO }}>{e.loc || '—'}</div>
                  </div>
                  <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.muted }}>{fmt(e.start)}{e.end && e.end !== e.start ? ` – ${fmt(e.end)}` : ''}</span>
                  <span style={{ fontFamily: MONO, fontSize: 10.5, color: asg.length >= target && target > 0 ? C.green : C.warn }}>crew {asg.length}/{target}</span>
                  <span style={{ fontFamily: MONO, fontSize: 10.5, color: asg.length && conf === asg.length ? C.green : C.accent2 }}>conf {conf}/{asg.length}</span>
                  <span className="status-pill" data-kind={st.kind} style={{ justifySelf: 'end' }}>{st.label}</span>
                </a>
              );
            })}
            {v.events.length === 0 && <div style={{ fontSize: 12.5, color: C.faint }}>No events for this vendor yet.</div>}
          </div>
        </div>

      </div>
    </div>
  );
}

/* Donut chart via conic-gradient — no chart library needed. */
function Donut({ title, total, totalSub, segments, fmtVal, link }: {
  title: string; total: string; totalSub: string;
  segments: { label: string; value: number; color: string }[];
  fmtVal: (n: number) => string; link: string;
}) {
  const sum = segments.reduce((n, s) => n + s.value, 0);
  let acc = 0;
  const stops = segments.map((s) => {
    const from = sum ? (acc / sum) * 360 : 0;
    acc += s.value;
    const to = sum ? (acc / sum) * 360 : 0;
    return `${s.color} ${from}deg ${to}deg`;
  }).join(', ');
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={secLabel(C.cyan)}>{title}</span>
        <a href={link} style={{ fontSize: 11, color: C.accent }}>Open →</a>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ position: 'relative', width: 96, height: 96, flex: 'none' }}>
          <div aria-hidden style={{
            width: 96, height: 96, borderRadius: '50%',
            background: sum ? `conic-gradient(${stops})` : C.bg,
            mask: 'radial-gradient(circle, transparent 55%, black 56%)',
            WebkitMask: 'radial-gradient(circle, transparent 55%, black 56%)',
            filter: 'drop-shadow(0 0 8px color-mix(in oklch, var(--neon-cyan) 25%, transparent))',
          }} />
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700 }}>{total}</div>
              <div style={{ fontSize: 8.5, color: C.faint, textTransform: 'uppercase', letterSpacing: '.06em' }}>{totalSub}</div>
            </div>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          {segments.map((s) => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, padding: '2px 0' }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, boxShadow: `0 0 6px ${s.color}`, flex: 'none' }} />
              <span style={{ color: C.muted, flex: 1 }}>{s.label}</span>
              <span style={{ fontFamily: MONO, fontWeight: 700, color: s.color }}>{fmtVal(s.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Compact three-column list widget. */
function MiniList({ title, color, link, empty, rows }: {
  title: string; color: string; link: string; empty: string;
  rows: { a: string; b: string; c: string; tone?: string }[];
}) {
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 9 }}>
        <span style={secLabel(color)}>{title}</span>
        <a href={link} style={{ fontSize: 11, color: C.accent }}>→</a>
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 12, color: C.faint }}>{empty}</div>
      ) : rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12, padding: '3px 0', borderBottom: `1px solid ${C.line}` }}>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: r.tone || C.text }}>{r.a}</span>
          <span style={{ fontFamily: MONO, fontSize: 9.5, color: C.faint }}>{r.b}</span>
          <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, color }}>{r.c}</span>
        </div>
      ))}
    </div>
  );
}

/* ---- monthly analytics chart + compliance evaluation strip ---- */
function MonthlyChart({ events, fin, rags, preps }: {
  events: import('../data/types').EventRec[];
  fin: import('../data/phase6').EventFinance[];
  rags: { rag: string }[];
  preps: { prep: import('../data/phase13').PrepPanel }[];
}) {
  const year = new Date().getFullYear();
  const months = Array.from({ length: 12 }, (_, m) => {
    const evs = events.filter((e) => {
      const d = e.start ? new Date(e.start + 'T00:00:00') : null;
      return d && d.getFullYear() === year && d.getMonth() === m;
    });
    const cost = fin
      .filter((f) => f.start && new Date(f.start + 'T00:00:00').getFullYear() === year && new Date(f.start + 'T00:00:00').getMonth() === m)
      .reduce((s, f) => s + f.crewCost, 0);
    return { m, count: evs.length, cost };
  });
  const maxCount = Math.max(1, ...months.map((x) => x.count));
  const maxCost = Math.max(1, ...months.map((x) => x.cost));
  const nowM = new Date().getMonth();

  const compliancePct = rags.length ? Math.round((rags.filter((r) => r.rag === 'green').length / rags.length) * 100) : 100;
  const readinessPct = preps.length ? Math.round(preps.reduce((s, p) => s + p.prep.score, 0) / preps.length) : 100;
  const trend = months[nowM].count - (nowM > 0 ? months[nowM - 1].count : 0);
  const evalItems = [
    { k: 'Level compliance', v: `${compliancePct}%`, c: compliancePct >= 80 ? C.green : compliancePct >= 50 ? C.yellow : C.pink },
    { k: 'Readiness', v: `${readinessPct}%`, c: readinessPct >= 80 ? C.green : readinessPct >= 50 ? C.yellow : C.pink },
    { k: 'Month trend', v: trend > 0 ? `▲ +${trend}` : trend < 0 ? `▼ ${trend}` : '— level', c: trend > 0 ? C.cyan : trend < 0 ? C.yellow : C.faint },
  ];
  const monthName = (m: number) => new Date(year, m, 1).toLocaleDateString('en-GB', { month: 'short' });

  return (
    <div style={{ ...card, marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={secLabel(C.accent2)}>Monthly analytics · {year}</div>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: MONO, fontSize: 10, color: C.faint }}>
          <span style={{ color: C.cyan }}>■</span> events&nbsp;&nbsp;<span style={{ color: C.pink }}>■</span> crew cost
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 6, alignItems: 'end', height: 92 }}>
        {months.map((x) => (
          <div key={x.m} title={`${monthName(x.m)}: ${x.count} event${x.count !== 1 ? 's' : ''}, ${gbp(x.cost)} crew cost`}
            style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: '100%', outline: x.m === nowM ? `1px solid color-mix(in oklch, ${C.cyan} 40%, transparent)` : undefined, outlineOffset: 2, borderRadius: 3 }}>
            <div style={{ flex: 1, height: `${(x.count / maxCount) * 100}%`, minHeight: x.count ? 3 : 0, background: C.cyan, borderRadius: '2px 2px 0 0', boxShadow: x.count ? `0 0 8px color-mix(in oklch, ${C.cyan} 50%, transparent)` : undefined, transition: 'height .7s cubic-bezier(.2,.8,.2,1)' }} />
            <div style={{ flex: 1, height: `${(x.cost / maxCost) * 100}%`, minHeight: x.cost ? 3 : 0, background: C.pink, borderRadius: '2px 2px 0 0', opacity: .85, transition: 'height .7s cubic-bezier(.2,.8,.2,1)' }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 6, marginTop: 4 }}>
        {months.map((x) => (
          <div key={x.m} style={{ textAlign: 'center', fontFamily: MONO, fontSize: 8.5, color: x.m === nowM ? C.cyan : C.faint, textTransform: 'uppercase' }}>{monthName(x.m)}</div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 18, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.line}`, flexWrap: 'wrap' }}>
        {evalItems.map((it) => (
          <div key={it.k} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
            <span style={{ fontFamily: MONO, fontSize: 9, color: C.faint, textTransform: 'uppercase', letterSpacing: '.07em' }}>{it.k}</span>
            <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: it.c }}>{it.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
