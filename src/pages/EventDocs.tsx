/* Event Documentation — ported from Event Documentation.dc.html (faithful:
   same layout, ALL 19 documents preserved). Two views:
   - Document Library: the full UK document set across 7 categories with
     category filter and MANDATORY/RECOMMENDED badges.
   - Event Checklists: per-event checklist (alcohol toggle adds the licence
     docs), Ready/Expiring/Missing/N-A per doc, live readiness bar, plus the
     AI Compliance Adviser and RAMS drafter (window.claude.complete when
     present; graceful practical fallback otherwise).
   State persists in kv 'eventDocs' ({events, active}) — syncs like all kv. */
import { useMemo, useState, type CSSProperties } from 'react';
import { useOpsData } from '../data/useOpsData';
import type { Client, DocumentRec, DocType } from '../data/types';
import { docState } from '../data/phase12';

const MONO = "'JetBrains Mono', ui-monospace, monospace";

interface DocDef {
  id: string; cat: string; name: string; applies: string; issuer: string;
  renewal: string; mand: boolean; why: string; alcohol?: boolean;
}
interface DocEvent {
  id: string; name: string; alcohol: boolean; created: number;
  statuses: Record<string, string>;
  clientId?: string;                  // operator this checklist belongs to
  links?: Record<string, string>;     // library doc id -> mf_documents row id
}
interface DocStore { events?: DocEvent[]; active?: string | null; }

/* Library category -> Information Hub document type. */
const CAT_TO_DOCTYPE: Record<string, DocType> = {
  'Insurance': 'Insurance', 'Food Safety': 'Hygiene', 'Gas & Electrical': 'Safety',
  'Fire & Safety': 'Safety', 'Alcohol & Trading': 'Licence',
  'Vehicle & Transport': 'General', 'Staff': 'General',
};
const docTypeFor = (d: DocDef): DocType => (d.id === 'rams' ? 'RAMS' : CAT_TO_DOCTYPE[d.cat] || 'General');

const DOCS: DocDef[] = [
  { id: 'pli', cat: 'Insurance', name: 'Public Liability Insurance', applies: 'Per business', issuer: 'Insurer', renewal: 'Annual', mand: true, why: 'Covers injury or damage claims from the public. Event organisers almost universally require proof (£5–10m) before confirming your pitch.' },
  { id: 'eli', cat: 'Insurance', name: 'Employers’ Liability Insurance', applies: 'Per business', issuer: 'Insurer', renewal: 'Annual', mand: true, why: 'Legally required the moment you employ staff. Minimum £5m cover; certificate must be available on site.' },
  { id: 'prod', cat: 'Insurance', name: 'Product Liability Insurance', applies: 'Per business', issuer: 'Insurer', renewal: 'Annual', mand: false, why: 'Covers claims from food or drink causing illness or injury. Usually bundled into specialist mobile-catering policies.' },
  { id: 'fbr', cat: 'Food Safety', name: 'Food Business Registration', applies: 'Per business', issuer: 'Local authority', renewal: 'No expiry', mand: true, why: 'Free legal registration with your council, at least 28 days before trading. Trading without it is an offence.' },
  { id: 'fh2', cat: 'Food Safety', name: 'Level 2 Food Hygiene Certificate', applies: 'Per food handler', issuer: 'Training provider', renewal: '~3 years', mand: true, why: 'Every person handling food must be trained. EHOs expect to see certificates on inspection.' },
  { id: 'sfbb', cat: 'Food Safety', name: 'Food Safety Management (HACCP / SFBB)', applies: 'Per unit', issuer: 'Self-documented', renewal: 'Review ongoing', mand: true, why: 'A documented safe-method system (temperatures, cleaning, cross-contamination). EHOs check it at events.' },
  { id: 'alg', cat: 'Food Safety', name: 'Allergen Matrix (14 allergens)', applies: 'Per menu', issuer: 'Self-documented', renewal: 'On menu change', mand: true, why: 'Natasha’s Law: a written matrix of which dishes contain which of the 14 allergens, with trained staff to answer questions.' },
  { id: 'gas', cat: 'Gas & Electrical', name: 'Gas Safety Certificate (LPG / CP44)', applies: 'Per unit', issuer: 'Gas Safe engineer', renewal: 'Annual', mand: true, why: 'Mandatory for any LPG appliance. Mobile-catering-registered Gas Safe engineer only. Organisers refuse units without it.' },
  { id: 'eicr', cat: 'Gas & Electrical', name: 'Electrical Installation Report (EICR)', applies: 'Per unit', issuer: 'Qualified electrician', renewal: '1–5 years', mand: false, why: 'Checks the fixed wiring / onboard electrical system is safe. Reduces fire risk and supports your insurance.' },
  { id: 'pat', cat: 'Gas & Electrical', name: 'PAT Testing', applies: 'Per unit', issuer: 'Competent person', renewal: 'Annual', mand: false, why: 'Portable appliance testing (kettles, fryers, coffee machines). Not strictly law but organisers and insurers ask for it.' },
  { id: 'fra', cat: 'Fire & Safety', name: 'Fire Risk Assessment', applies: 'Per unit', issuer: 'Self-documented', renewal: 'Review annually', mand: true, why: 'Confirms correct extinguishers, fire blankets and signage, and that staff know the emergency procedure.' },
  { id: 'rams', cat: 'Fire & Safety', name: 'Risk Assessment / Method Statement', applies: 'Per unit / event', issuer: 'Self-documented', renewal: 'Per event', mand: true, why: 'Must accurately reflect the food cooked and equipment used at that event. Frequently requested in the organiser pack.' },
  { id: 'pl', cat: 'Alcohol & Trading', name: 'Personal Licence', applies: 'Per DPS', issuer: 'Council', renewal: '~10 years', mand: true, why: 'Held by whoever authorises alcohol sales under the Licensing Act 2003.', alcohol: true },
  { id: 'ten', cat: 'Alcohol & Trading', name: 'Temporary Event Notice (TEN)', applies: 'Per event', issuer: 'Council', renewal: 'Per event', mand: true, why: 'Authorises alcohol sales at a one-off event where there is no premises licence. Apply well in advance.', alcohol: true },
  { id: 'lnr', cat: 'Alcohol & Trading', name: 'Late Night Refreshment', applies: 'Per event', issuer: 'Council', renewal: 'As needed', mand: false, why: 'Needed to serve hot food or drink between 11pm and 5am — common at festivals running late.' },
  { id: 'stl', cat: 'Alcohol & Trading', name: 'Street Trading Licence / Consent', applies: 'Per location', issuer: 'Council', renewal: 'Varies', mand: false, why: 'Required when trading on public land. On private event sites the organiser’s permission usually covers this — confirm.' },
  { id: 'mot', cat: 'Vehicle & Transport', name: 'Vehicle MOT & Tax', applies: 'Per vehicle', issuer: 'Test centre / DVLA', renewal: 'Annual', mand: true, why: 'The towing vehicle must be road-legal. Keep maintenance records for the trailer too.' },
  { id: 'vins', cat: 'Vehicle & Transport', name: 'Business Vehicle Insurance', applies: 'Per vehicle', issuer: 'Insurer', renewal: 'Annual', mand: true, why: 'Standard car policies exclude business use — you need cover for commercial towing/transport.' },
  { id: 'wcl', cat: 'Vehicle & Transport', name: 'Waste Carrier Registration', applies: 'Per business', issuer: 'Environment Agency', renewal: '~3 years', mand: false, why: 'Required to legally transport your own trade waste away from site.' },
  { id: 'rtw', cat: 'Staff', name: 'Right to Work Check', applies: 'Per staff member', issuer: 'Self-documented', renewal: 'On hire', mand: true, why: 'Verify and record every worker’s right to work before deploying them. Also record hygiene certificates here.' },
];
const CATS = [
  { name: 'Insurance', color: 'var(--accent)' }, { name: 'Food Safety', color: 'var(--ok)' },
  { name: 'Gas & Electrical', color: 'var(--warn)' }, { name: 'Fire & Safety', color: 'var(--danger)' },
  { name: 'Alcohol & Trading', color: 'var(--accent-2)' }, { name: 'Vehicle & Transport', color: 'oklch(0.7 0.1 200)' },
  { name: 'Staff', color: 'oklch(0.75 0.12 300)' },
];
const STATUSES = ['Ready', 'Expiring', 'Missing', 'N/A'];
const ST_COLOR: Record<string, string> = {
  Ready: 'var(--ok)', Expiring: 'var(--warn)', Missing: 'var(--danger)', 'N/A': 'var(--ink-3)',
};

const applicable = (ev: DocEvent) => DOCS.filter((d) => (d.alcohol ? ev.alcohol : true));

export default function EventDocs() {
  const { data, ready, error } = useOpsData();
  const [view, setView] = useState<'library' | 'checklists'>('library');
  const [cat, setCat] = useState('all');
  const [draftName, setDraftName] = useState('');
  const [draftAlcohol, setDraftAlcohol] = useState(false);
  const [draftClient, setDraftClient] = useState('');
  const [attachDates, setAttachDates] = useState<Record<string, string>>({});
  const [advice, setAdvice] = useState('');
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [rams, setRams] = useState('');
  const [ramsLoading, setRamsLoading] = useState(false);

  const store = useMemo<DocStore>(
    () => (ready ? (data.kvGet<DocStore>('eventDocs') || {}) : {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, data.meta().updatedAt]
  );
  const events = store.events || [];
  const active = store.active && events.some((e) => e.id === store.active) ? store.active : events[0]?.id || null;
  const ev0 = events.find((e) => e.id === active) || null;

  async function persist(next: DocStore) { await data.kvSet('eventDocs', next); }

  const clients = useMemo(
    () => (ready ? data.all<Client>('clients') : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, data.meta().updatedAt]
  );

  async function addEvent() {
    const name = draftName.trim();
    if (!name) return;
    const evn: DocEvent = {
      id: 'e' + Date.now(), name, alcohol: draftAlcohol, created: Date.now(), statuses: {},
      clientId: draftClient || clients[0]?.id || undefined,
    };
    await persist({ events: [...events, evn], active: evn.id });
    setDraftName(''); setDraftAlcohol(false); setAdvice('');
  }

  /** Attach a real document: creates an mf_documents row (with expiry, so
      the Information Hub tracks it) and marks the checklist item Ready. */
  async function attachDoc(evX: DocEvent, d: DocDef) {
    const expiry = attachDates[d.id];
    const saved = await data.save('documents', {
      clientId: evX.clientId || clients[0]?.id,
      title: d.name,
      docType: docTypeFor(d),
      expiry: expiry || undefined,
      notes: `Attached from the ${evX.name} event checklist`,
    } as Partial<DocumentRec>);
    await persist({
      events: events.map((e) => (e.id === evX.id ? {
        ...e,
        statuses: { ...e.statuses, [d.id]: 'Ready' },
        links: { ...(e.links || {}), [d.id]: saved.id },
      } : e)),
      active,
    });
    setAttachDates((p) => ({ ...p, [d.id]: '' }));
  }
  async function deleteEvent() {
    if (!ev0 || !confirm(`Delete the checklist for ${ev0.name}?`)) return;
    const rest = events.filter((e) => e.id !== ev0.id);
    await persist({ events: rest, active: rest[0]?.id || null });
    setAdvice('');
  }
  async function setStatus(docId: string, val: string) {
    if (!ev0) return;
    await persist({
      events: events.map((e) => (e.id === ev0.id ? { ...e, statuses: { ...e.statuses, [docId]: val } } : e)),
      active,
    });
  }

  async function askAI() {
    if (!ev0) return;
    setAdviceLoading(true); setAdvice('');
    const apps = applicable(ev0);
    const lines = apps.map((d) => `- ${d.name} [${d.cat}] (${d.mand ? 'mandatory' : 'recommended'}): ${ev0.statuses[d.id] || 'Missing'}`).join('\n');
    const prompt = `Event: "${ev0.name}" (${ev0.alcohol ? 'bar unit, serving alcohol' : 'food unit, no alcohol'}).\nDocument status:\n${lines}\n\nAs a UK mobile-hospitality compliance adviser, give brief, practical advice: what is the single most urgent gap and why, then a short prioritised list of what to sort before this event trades. Flag anything mandatory that is Missing or Expiring. Be concrete and concise (under 180 words). This is guidance, not legal advice.`;
    try {
      const claude = (window as any).claude;
      if (!claude?.complete) throw new Error('unavailable');
      const text = await claude.complete({ system: 'You are a pragmatic UK mobile-catering and events compliance adviser. Prioritise legal/safety-critical gaps. Be concise and specific.', messages: [{ role: 'user', content: prompt }] });
      setAdvice((text || '').trim() || 'No response returned.');
    } catch {
      const miss = apps.filter((d) => d.mand && (ev0.statuses[d.id] || 'Missing') !== 'Ready' && (ev0.statuses[d.id] || 'Missing') !== 'N/A');
      setAdvice(miss.length
        ? `${miss.length} mandatory item${miss.length !== 1 ? 's are' : ' is'} not marked Ready — prioritise: ${miss.slice(0, 5).map((d) => d.name).join(', ')}. Sort insurance and gas certificates first (organisers refuse pitches without them), then food-safety paperwork, then event-specific licences.`
        : 'All mandatory items are marked Ready — you are clear to trade on paperwork. Double-check the organiser pack for event-specific extras.');
      setAdviceLoading(false);
      return;
    }
    setAdviceLoading(false);
  }

  async function draftRams() {
    if (!ev0) return;
    setRamsLoading(true); setRams('');
    const kind = ev0.alcohol ? 'mobile bar unit serving alcohol' : 'mobile food catering unit';
    const prompt = `Draft a first-draft Risk Assessment and Method Statement (RAMS) for a ${kind} trading at the event "${ev0.name}" in the UK.\n\nProduce:\n1. A short site/activity description.\n2. A risk assessment table in plain text: Hazard | Who is at risk | Likelihood | Severity | Control measures.\n3. A method statement: the safe sequence of setup, service and breakdown.\n4. Emergency procedures (fire, gas leak, first aid).\n\nMark clearly at the top that it is a template to be reviewed and adapted.`;
    try {
      const claude = (window as any).claude;
      if (!claude?.complete) throw new Error('unavailable');
      const text = await claude.complete({ system: 'You are a UK health & safety adviser specialising in mobile catering and events. Write clear, practical RAMS documents suitable for event organiser packs.', messages: [{ role: 'user', content: prompt }] });
      setRams((text || '').trim() || 'No response returned.');
    } catch {
      setRams(`RAMS TEMPLATE — ${ev0.name} (review and adapt before use)\n\n1. SITE / ACTIVITY\n• Describe the pitch, footprint and activity.\n\n2. RISK ASSESSMENT (Hazard | Who | Likelihood | Severity | Controls)\n• LPG gas — crew/public — connections leak-tested, bottles secured upright, Gas Safe cert in date\n• Hot surfaces/oil — crew — PPE, extinguisher + fire blanket in reach, no unattended fryers\n• Manual handling — crew — two-person lifts, trolleys, load below shoulder height\n• Slips & trips — crew/public — cables matted, spills cleaned immediately, lighting at close-down${ev0.alcohol ? '\n• Alcohol service & crowds — public — Challenge 25, refusal log, radio to security' : ''}\n• Electrical — crew — PAT-tested appliances, RCD protection, cables off the ground\n\n3. METHOD STATEMENT\n• Setup: position, level and stabilise unit → connect services → leak-test gas → temp-check fridges → sign off checklist.\n• Service: hygiene routine, temp logs, waste management.\n• Breakdown: isolate gas/power → cool-down → deep clean → load-out → leave site clear.\n\n4. EMERGENCY PROCEDURES\n• Fire: raise alarm, evacuate, extinguisher only if safe, call site control.\n• Gas leak: isolate bottle, ventilate, no ignition sources, report.\n• First aid: kit location, nearest first-aid point, incident log.`);
      setRamsLoading(false);
      return;
    }
    setRamsLoading(false);
  }

  if (error) return <div className="p4"><div className="banner">Couldn't load data: {error}</div></div>;
  if (!ready) return <div className="state"><div><div className="spinner" /><div className="eyebrow">Loading documentation</div></div></div>;

  const seg = (act: boolean): CSSProperties => ({
    padding: '8px 15px', borderRadius: 7, border: 'none', cursor: 'pointer', font: 'inherit',
    fontSize: 12.5, fontWeight: 600,
    background: act ? 'var(--accent)' : 'transparent',
    color: act ? 'oklch(0.13 0.02 268)' : 'var(--ink-2)',
  });
  const shownCats = CATS.filter((c) => cat === 'all' || cat === c.name);

  return (
    <div data-screen-label="Event Documentation" className="p4" style={{ maxWidth: 1180 }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ width: 38, height: 38, flex: 'none', borderRadius: 9, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontWeight: 600, fontSize: 15, color: 'oklch(0.13 0.02 268)' }}>DOC</div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: '.02em' }}>EVENT DOCUMENTATION</div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: MONO }}>PAPERWORK TO RUN A UNIT AT AN EVENT · UK</div>
        </div>
        <div style={{ display: 'flex', gap: 6, background: 'var(--inset)', border: '1px solid var(--panel-line)', borderRadius: 10, padding: 4 }}>
          <button style={seg(view === 'library')} onClick={() => setView('library')}>Document Library</button>
          <button style={seg(view === 'checklists')} onClick={() => setView('checklists')}>Event Checklists</button>
        </div>
        <button className="btn btn-sm" onClick={() => window.print()}>Print</button>
      </div>

      {view === 'library' && (
        <>
          <div style={{ fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.6, maxWidth: 760, marginBottom: 20 }}>
            Every document a mobile bar or catering unit typically needs to trade legally at a UK event.
            Requirements vary by council and organiser — always confirm the specific event pack.{' '}
            <span style={{ color: 'var(--ink-3)' }}>Not legal advice.</span>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 22 }}>
            {['all', ...CATS.map((c) => c.name)].map((c) => (
              <button key={c} onClick={() => setCat(c)} style={{
                padding: '7px 14px', borderRadius: 20, cursor: 'pointer', font: 'inherit', fontSize: 12, fontWeight: 600,
                border: `1px solid ${cat === c ? 'var(--accent)' : 'var(--panel-line)'}`,
                background: cat === c ? 'color-mix(in oklch, var(--accent) 14%, transparent)' : 'var(--panel)',
                color: cat === c ? 'var(--accent)' : 'var(--ink-2)',
              }}>{c === 'all' ? 'All documents' : c}</button>
            ))}
          </div>

          {shownCats.map((c) => (
            <div key={c.name} style={{ marginBottom: 30 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 13 }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: c.color, boxShadow: `0 0 8px ${c.color}` }} />
                <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.06em', fontFamily: MONO }}>{c.name}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 13 }}>
                {DOCS.filter((d) => d.cat === c.name).map((d) => (
                  <div key={d.id} className="ev-card" style={{ padding: '17px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 9 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.25 }}>{d.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: MONO, marginTop: 3 }}>{d.applies}</div>
                      </div>
                      <span style={{
                        flex: 'none', fontFamily: MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '.06em',
                        padding: '3px 7px', borderRadius: 5,
                        border: `1px solid ${d.mand ? 'var(--danger)' : 'var(--ink-3)'}`,
                        color: d.mand ? 'var(--danger)' : 'var(--ink-3)',
                      }}>{d.mand ? 'MANDATORY' : 'RECOMMENDED'}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>{d.why}</div>
                    <div style={{ display: 'flex', gap: 14, marginTop: 12, paddingTop: 11, borderTop: '1px solid var(--panel-line)' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 9.5, letterSpacing: '.08em', color: 'var(--ink-3)', fontFamily: MONO }}>ISSUED BY</div>
                        <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>{d.issuer}</div>
                      </div>
                      <div style={{ flex: 'none', textAlign: 'right' }}>
                        <div style={{ fontSize: 9.5, letterSpacing: '.08em', color: 'var(--ink-3)', fontFamily: MONO }}>RENEWAL</div>
                        <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>{d.renewal}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {view === 'checklists' && (
        <div style={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap', gap: 20 }}>
          {/* events sidebar */}
          <aside style={{ width: 280, flex: '1 1 240px', maxWidth: 320 }} className="card">
            <div style={{ fontSize: 10.5, letterSpacing: '.12em', color: 'var(--ink-3)', fontFamily: MONO, marginBottom: 12 }}>EVENTS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {events.map((e) => {
                const apps = applicable(e);
                const readyN = apps.filter((d) => e.statuses[d.id] === 'Ready' || e.statuses[d.id] === 'N/A').length;
                const pct = apps.length ? Math.round((readyN / apps.length) * 100) : 0;
                const act = e.id === active;
                return (
                  <button key={e.id} onClick={() => { persist({ events, active: e.id }); setAdvice(''); setRams(''); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 11px',
                      border: `1px solid ${act ? 'var(--accent)' : 'var(--panel-line)'}`, borderRadius: 9,
                      cursor: 'pointer', font: 'inherit', background: act ? 'var(--panel-2)' : 'var(--inset)', color: 'var(--ink)',
                    }}>
                    <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--ink-3)', fontFamily: MONO }}>{(e.alcohol ? 'Bar · ' : 'Food · ') + applicable(e).length + ' docs'}</div>
                    </div>
                    <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: pct === 100 ? 'var(--ok)' : pct >= 60 ? 'var(--warn)' : 'var(--danger)' }}>{pct}%</span>
                  </button>
                );
              })}
            </div>
            <div style={{ borderTop: '1px solid var(--panel-line)', paddingTop: 14 }}>
              <div style={{ fontSize: 10.5, letterSpacing: '.12em', color: 'var(--ink-3)', fontFamily: MONO, marginBottom: 9 }}>NEW EVENT</div>
              <input className="inp" placeholder="Event name" value={draftName} style={{ marginBottom: 8 }}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addEvent(); }} />
              {clients.length > 0 && (
                <select className="sel" style={{ marginBottom: 8 }} value={draftClient} onChange={(e) => setDraftClient(e.target.value)} aria-label="Operator">
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ink-2)', cursor: 'pointer', marginBottom: 10, userSelect: 'none' }}>
                <input type="checkbox" checked={draftAlcohol} onChange={(e) => setDraftAlcohol(e.target.checked)} style={{ width: 15, height: 15, accentColor: 'var(--accent)' }} />
                Serving alcohol (bar unit)
              </label>
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={addEvent} disabled={!draftName.trim()}>+ Create checklist</button>
            </div>
          </aside>

          {/* active checklist */}
          <main style={{ flex: '2 1 380px', minWidth: 340 }}>
            {!ev0 ? (
              <div className="empty-state" style={{ maxWidth: 420, margin: '40px auto', padding: 32 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>No event selected</div>
                <div style={{ fontSize: 13, lineHeight: 1.6 }}>Create an event on the left and a documentation checklist is generated automatically from the library.</div>
              </div>
            ) : (() => {
              const apps = applicable(ev0);
              const readyCount = apps.filter((d) => ev0.statuses[d.id] === 'Ready' || ev0.statuses[d.id] === 'N/A').length;
              const catsUsed = CATS.filter((c) => apps.some((d) => d.cat === c.name));
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap', marginBottom: 6 }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontSize: 21, fontWeight: 700 }}>{ev0.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink-3)', fontFamily: MONO, marginTop: 3 }}>
                        {(ev0.alcohol ? 'Bar unit · alcohol' : 'Food unit') + ' · ' + apps.length + ' applicable documents'}
                      </div>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={deleteEvent}>Delete</button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '16px 0 22px' }}>
                    <div style={{ flex: 1, height: 9, borderRadius: 5, background: 'var(--inset)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${apps.length ? Math.round((readyCount / apps.length) * 100) : 0}%`, background: 'var(--ok)', boxShadow: '0 0 8px var(--ok)', transition: 'width .3s' }} />
                    </div>
                    <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: 'var(--ok)' }}>{readyCount}/{apps.length} ready</span>
                  </div>

                  {catsUsed.map((c) => (
                    <div key={c.name} style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', fontFamily: MONO, color: 'var(--ink-2)', marginBottom: 9 }}>{c.name}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {apps.filter((d) => d.cat === c.name).map((d) => {
                          const cur = ev0.statuses[d.id] || 'Missing';
                          const linkId = ev0.links?.[d.id];
                          const linked = linkId ? data.get<DocumentRec>('documents', linkId) : null;
                          const linkedState = linked ? docState(linked) : null;
                          return (
                            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--panel)', border: '1px solid var(--panel-line)', borderLeft: `3px solid ${ST_COLOR[cur]}`, borderRadius: 9, padding: '11px 14px', flexWrap: 'wrap' }}>
                              <div style={{ flex: 1, minWidth: 150 }} title={d.why}>
                                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{d.name}</div>
                                <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{d.applies} · renew {d.renewal}</div>
                              </div>
                              {linked ? (
                                <a href="#/compliance" className={`chip ${linkedState === 'expired' ? 'chip-red' : linkedState === 'expiring' ? 'chip-amber' : 'chip-green'}`}
                                  style={{ textDecoration: 'none', fontSize: 10.5 }}
                                  title="Registered in the Information Hub — click to open">
                                  📎 {linked.expiry || 'no expiry'}{linkedState === 'expired' ? ' · EXPIRED' : linkedState === 'expiring' ? ' · expiring' : ''}
                                </a>
                              ) : (
                                <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                  <input className="inp" type="date" aria-label={`Expiry for ${d.name}`}
                                    style={{ width: 'auto', padding: '4px 6px', fontSize: 11.5 }}
                                    value={attachDates[d.id] || ''}
                                    onChange={(e) => setAttachDates((p) => ({ ...p, [d.id]: e.target.value }))} />
                                  <button className="btn btn-primary btn-sm" style={{ fontSize: 10.5 }}
                                    onClick={() => attachDoc(ev0, d)}
                                    title="Register in the Information Hub and mark Ready">📎 Attach</button>
                                </span>
                              )}
                              <div style={{ display: 'flex', gap: 4 }}>
                                {STATUSES.map((s) => (
                                  <button key={s} onClick={() => setStatus(d.id, s)} style={{
                                    padding: '5px 9px', borderRadius: 6, cursor: 'pointer', fontFamily: MONO, fontSize: 10.5, fontWeight: 600,
                                    border: `1px solid ${cur === s ? ST_COLOR[s] : 'var(--panel-line)'}`,
                                    background: cur === s ? ST_COLOR[s] : 'transparent',
                                    color: cur === s ? 'oklch(0.18 0.02 255)' : 'var(--ink-3)',
                                  }}>{s}</button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {/* AI compliance adviser */}
                  <div style={{ marginTop: 26, background: 'linear-gradient(135deg, color-mix(in oklch, var(--accent-2) 14%, transparent), color-mix(in oklch, var(--accent) 8%, transparent))', border: '1px solid var(--panel-line)', borderRadius: 14, padding: '20px 22px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 11, flexWrap: 'wrap' }}>
                      <div style={{ width: 30, height: 30, flex: 'none', borderRadius: 8, background: 'var(--accent-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontWeight: 600, fontSize: 12, color: 'oklch(0.13 0.02 268)' }}>AI</div>
                      <div style={{ flex: 1, minWidth: 160 }}>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>Compliance Adviser</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>Analyses this checklist and tells you what to fix first.</div>
                      </div>
                      <button className="btn btn-primary btn-sm" onClick={askAI} disabled={adviceLoading}>{adviceLoading ? 'Analysing…' : 'Analyse checklist'}</button>
                    </div>
                    {advice && <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--panel-line)', fontSize: 13, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{advice}</div>}
                  </div>

                  {/* RAMS drafter */}
                  <div className="card" style={{ marginTop: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 11, flexWrap: 'wrap' }}>
                      <div style={{ width: 30, height: 30, flex: 'none', borderRadius: 8, background: 'var(--warn)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontWeight: 600, fontSize: 11, color: 'oklch(0.13 0.02 268)' }}>R</div>
                      <div style={{ flex: 1, minWidth: 160 }}>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>Draft a Risk Assessment / Method Statement</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>Generates a first-draft RAMS for this unit at this event. Review and adapt before use.</div>
                      </div>
                      <button className="btn btn-sm" onClick={draftRams} disabled={ramsLoading}>{ramsLoading ? 'Drafting…' : 'Draft RAMS'}</button>
                    </div>
                    {rams && <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--panel-line)', fontSize: 12.5, lineHeight: 1.6, whiteSpace: 'pre-wrap', maxHeight: 420, overflowY: 'auto', fontFamily: MONO }}>{rams}</div>}
                  </div>
                </>
              );
            })()}
          </main>
        </div>
      )}
    </div>
  );
}
