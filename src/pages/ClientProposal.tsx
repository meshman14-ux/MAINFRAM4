/* Client Proposal — ported from prototype-export/Client Proposal.dc.html.
   Generates a print-ready "Operations Diagnostic & Proposal" document from a
   saved diagnostic (kv 'diagnostics'): executive summary with maturity
   score, current-state facts, business-health domain bars, issue register
   with impact lines, phased build roadmap and next steps. The paper is
   deliberately light — it's a client-facing document, not app chrome.
   Deep-linkable as #/proposal/<business name>.

   Adaptation: the prototype's AI-drafted cover note used the prototype
   runtime (window.claude), which this app doesn't have — replaced with an
   editable cover-note box seeded from a template. */
import { useMemo, useState } from 'react';
import { useOpsData } from '../data/useOpsData';

type Answers = Record<string, string | string[] | null | undefined>;
type Diagnostics = Record<string, Answers>;

function answered(v: unknown): boolean {
  return Array.isArray(v) ? v.length > 0 : !!(v && String(v).trim());
}

interface Finding { sev: 'danger' | 'warn'; title: string; detail: string; impact: string; }
interface Mod { phase: string; title: string; detail: string; }

/* Verbatim port of the proposal's findings engine (with impact lines). */
function findings(a: Answers): { F: Finding[]; mods: Mod[]; score: number } {
  const F: Finding[] = [];
  const add = (sev: Finding['sev'], title: string, detail: string, impact: string) => F.push({ sev, title, detail, impact });
  const docs = (a.docs_tracked as string[]) || [];
  const pains = (a.pains as string[]) || [];
  const software = (a.current_software as string[]) || [];

  if (a.records === 'Paper folder' || a.records === 'Someone’s head') add('danger', 'Unit records not centralised', 'Compliance and service history live in ' + String(a.records).toLowerCase() + ', so expiry dates are invisible until something fails.', 'A unit can be turned away at the gate mid-event.');
  if (docs.includes('None tracked centrally')) add('danger', 'No central compliance register', 'Gas, PAT and insurance expiries are untracked across the fleet.', 'Legal and safety exposure on every trading day.');
  if (a.insurance_renewals === 'Someone’s diary / memory' || a.insurance_renewals === 'Not tracked') add('danger', 'Renewals untracked', 'Insurance and certificate renewals rely on memory.', 'One lapse can void cover mid-season.');
  if (a.rtw === 'No' || a.rtw === 'Partially') add('danger', 'Unverified right-to-work / hygiene', 'Clearances are not consistently recorded before staff are deployed.', 'Fines and reputational damage; blocked from major sites.');
  if (a.scheduling === 'WhatsApp / texts' || a.scheduling === 'Phone calls') add('warn', 'Scheduling by message', 'There is no structural record of who is where.', 'Clashes are found on the day, not at booking.');
  if (a.double_booking === 'Often' || a.double_booking === 'Sometimes') add('danger', 'Double-bookings already occurring', 'Staff or units are being committed to overlapping events.', 'Missed shifts, scramble cover, unhappy organisers.');
  if (a.double_booking === 'Don’t know') add('warn', 'No visibility of clashes', 'There is no way to confirm whether double-bookings happen.', 'Silent failures until a unit or person is missing.');
  if (a.payroll === 'Manual from memory / notes') add('warn', 'Manual payroll', 'Hours are re-keyed by hand each pay run.', 'Errors plus days of avoidable admin.');
  if (a.payroll_time === 'A day or more') add('warn', 'Payroll drag', 'A full day per pay run is spent on admin.', 'Owner/office time lost that could go to growth.');
  if (a.profit_visibility === 'No' || a.profit_visibility === 'Roughly') add('warn', 'No profit per event', 'Profitability is not measured per event.', 'Loss-making events are repeated unknowingly.');
  if (a.reconciliation === 'No' || a.reconciliation === 'Sometimes') add('warn', 'Takings not reconciled', 'Per-unit daily takings are not reconciled.', 'Shrinkage and cash/card gaps go unseen.');
  if (a.late_payments === 'Often') add('warn', 'Cash-flow risk', 'Client payments are chased informally.', 'Unpredictable cash flow and wasted admin.');
  if (a.key_person === 'Owner does everything') add('danger', 'Single point of failure', 'The entire operation routes through the owner.', 'Illness or one busy weekend stalls everything.');
  if (a.breakdowns === 'Often') add('warn', 'Reactive maintenance', 'Units fail during trade rather than being serviced between events.', 'Lost revenue and emergency repair costs.');
  if (a.deadlines === 'Regularly') add('danger', 'Organiser deadlines missed', 'RAMS, accreditation and trader packs are submitted late.', 'Risk of losing pitches at major events.');
  if (a.deadlines === 'Occasionally') add('warn', 'Deadline near-misses', 'Organiser paperwork is repeatedly caught late.', 'Last-minute scramble and organiser friction.');
  if (a.no_shows === 'Most events' || a.no_shows === 'Some events') add('warn', 'Shift confirmation gap', 'Shifts are not positively confirmed by staff.', 'No-shows leave units understaffed.');
  if (a.turnover === 'Mostly new faces each year') add('warn', 'High seasonal turnover', 'The crew is rebuilt from scratch each season.', 'Repeated onboarding cost and quality dips.');
  if (a.spreadsheet_reliance === 'Everything runs on them') add('warn', 'Spreadsheet-dependent', 'The operation runs on interlinked spreadsheets.', 'One broken formula can take out the whole system.');
  if (software.includes('None / paper')) add('warn', 'No software backbone', 'Operations run on paper.', 'Greenfield build — fast, visible early wins.');
  if (a.connectivity === 'Often no signal on-site') add('warn', 'Patchy on-site connectivity', 'Sites regularly lose mobile signal.', 'Any tool must work offline and sync later.');
  if (a.tool_appetite === 'Resistant') add('warn', 'Change resistance', 'The team is wary of adopting new systems.', 'Rollout must be phased around one clear win.');

  const mods: Mod[] = [{ phase: 'CORE', title: 'Events · Units · Staff', detail: 'the relational spine every client starts on' }];
  if (pains.includes('Double bookings') || pains.includes('Chasing staff availability') || a.double_booking === 'Often' || a.double_booking === 'Sometimes' || a.double_booking === 'Don’t know') mods.push({ phase: 'S4', title: 'Allocation & conflict engine', detail: 'catches staff and unit clashes at booking time' });
  if (pains.includes('Payroll takes days') || pains.includes('No profit view per event') || (a.profit_visibility && a.profit_visibility !== 'Yes, per event')) mods.push({ phase: 'S5', title: 'Costing & payroll', detail: 'hours to gross pay to profit per event, no re-keying' });
  if (pains.includes('Compliance docs expire unnoticed') || docs.includes('None tracked centrally') || a.breakdowns === 'Often' || a.insurance_renewals === 'Not tracked' || a.insurance_renewals === 'Someone’s diary / memory') mods.push({ phase: 'P2', title: 'Assets & compliance', detail: 'cert register with expiry alerts and maintenance log' });
  if (pains.includes('Stock ordering chaos')) mods.push({ phase: 'P3', title: 'Stock & purchasing', detail: 'per-unit requirements, suppliers and purchase orders' });
  if (pains.includes('Onboarding paperwork') || a.turnover === 'Mostly new faces each year' || a.no_shows === 'Most events' || a.no_shows === 'Some events') mods.push({ phase: 'P4', title: 'People & safety', detail: 'digital onboarding, shift confirmations, training and RAMS' });
  if (pains.includes('Client comms scattered') || a.late_payments === 'Often' || a.invoicing === 'Word / PDF by hand' || a.invoicing === 'Rarely formalised') mods.push({ phase: 'P5', title: 'Commercial / CRM', detail: 'client database, quoting and invoicing with due-date tracking' });

  let score = 100;
  F.forEach((f) => { score -= f.sev === 'danger' ? 16 : 8; });
  return { F, mods, score: Math.max(score, 15) };
}

interface Domain { name: string; score: number; note: string; band: string; color: string; }

/* Verbatim port of the per-domain health scoring. */
function domainScores(a: Answers): Domain[] {
  const clamp = (v: number) => Math.max(15, Math.min(100, v));
  const band = (s: number) => s >= 75 ? 'Strong' : s >= 50 ? 'Developing' : 'At risk';
  const col = (s: number) => s >= 75 ? 'oklch(0.55 0.14 150)' : s >= 50 ? 'oklch(0.62 0.12 75)' : 'oklch(0.55 0.2 25)';
  const docs = (a.docs_tracked as string[]) || [];
  const software = (a.current_software as string[]) || [];
  const D: Omit<Domain, 'band' | 'color'>[] = [];

  let c = 100;
  if (docs.includes('None tracked centrally')) c -= 30;
  if (a.insurance_renewals === 'Not tracked') c -= 30; else if (a.insurance_renewals === 'Someone’s diary / memory') c -= 18;
  if (a.records === 'Paper folder' || a.records === 'Someone’s head') c -= 18;
  if (a.breakdowns === 'Often') c -= 10;
  c = clamp(c);
  D.push({ name: 'Compliance & Risk', score: c, note: c >= 75 ? 'Documentation is tracked and current.' : 'Compliance is tracked informally — the highest-priority fix.' });

  let s2 = 100;
  if (a.scheduling === 'WhatsApp / texts' || a.scheduling === 'Phone calls') s2 -= 25;
  if (a.double_booking === 'Often') s2 -= 30; else if (a.double_booking === 'Sometimes') s2 -= 20; else if (a.double_booking === 'Don’t know') s2 -= 12;
  if (a.no_shows === 'Most events') s2 -= 15; else if (a.no_shows === 'Some events') s2 -= 8;
  s2 = clamp(s2);
  D.push({ name: 'Scheduling & Allocation', score: s2, note: s2 >= 75 ? 'Bookings are managed with good visibility.' : 'Scheduling is manual and clash-prone.' });

  let f = 100;
  if (a.profit_visibility === 'No') f -= 25; else if (a.profit_visibility === 'Roughly') f -= 15;
  if (a.payroll === 'Manual from memory / notes') f -= 20;
  if (a.payroll_time === 'A day or more') f -= 12;
  if (a.reconciliation === 'No') f -= 18; else if (a.reconciliation === 'Sometimes') f -= 10;
  if (a.late_payments === 'Often') f -= 12;
  f = clamp(f);
  D.push({ name: 'Finance & Payroll', score: f, note: f >= 75 ? 'Costs and payroll are well controlled.' : 'Financial visibility is limited and payroll is manual.' });

  let pp = 100;
  if (a.rtw === 'No') pp -= 30; else if (a.rtw === 'Partially') pp -= 18;
  if (a.turnover === 'Mostly new faces each year') pp -= 18;
  if (a.key_person === 'Owner does everything') pp -= 20; else if (a.key_person === 'Shared informally') pp -= 10;
  pp = clamp(pp);
  D.push({ name: 'People & Staffing', score: pp, note: pp >= 75 ? 'Crew is stable and clearances recorded.' : 'Clearances and continuity need shoring up.' });

  let t = 100;
  if (software.includes('None / paper')) t -= 25;
  if (a.spreadsheet_reliance === 'Everything runs on them') t -= 20;
  if (a.connectivity === 'Often no signal on-site') t -= 15; else if (a.connectivity === 'Patchy') t -= 8;
  if (a.tool_appetite === 'Resistant') t -= 10;
  t = clamp(t);
  D.push({ name: 'Technology & Data', score: t, note: t >= 75 ? 'A workable digital backbone is in place.' : 'Little structured software — mostly paper and spreadsheets.' });

  return D.map((d) => ({ ...d, band: band(d.score), color: col(d.score) }));
}

function hashClient(): string | null {
  const m = /^#\/proposal\/(.+)$/.exec(window.location.hash || '');
  return m ? decodeURIComponent(m[1]) : null;
}

const SERIF = "'IBM Plex Serif', Georgia, 'Times New Roman', serif";
const MONO = 'var(--font-mono)';
const paperInk = 'oklch(0.28 0.02 255)';
const paperDim = 'oklch(0.5 0.02 255)';
const paperFaint = 'oklch(0.55 0.02 255)';
const paperLine = 'oklch(0.88 0.01 255)';

export default function ClientProposal() {
  const { data, ready, error } = useOpsData();
  const [picked, setPicked] = useState<string | null>(null);
  const [booted, setBooted] = useState(false);
  const [cover, setCover] = useState('');
  const [showCover, setShowCover] = useState(false);

  const diags = useMemo(
    () => (ready ? (data.kvGet<Diagnostics>('diagnostics') || {}) : {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, data.meta().updatedAt]
  );
  const names = Object.keys(diags).sort();

  if (ready && !booted) {
    setBooted(true);
    const want = hashClient();
    if (want && diags[want]) setPicked(want);
  }
  const active = picked && diags[picked] ? picked : names[0] || null;
  const a: Answers = active ? diags[active] : {};

  const { F, mods, score } = useMemo(() => findings(a), [a]);
  const domains = useMemo(() => domainScores(a), [a]);

  if (error) return <div className="p4"><div className="banner">Couldn't load data: {error}</div></div>;
  if (!ready) return <div className="state"><div><div className="spinner" /><div className="eyebrow">Loading proposal</div></div></div>;

  if (!active) {
    return (
      <div className="p4">
        <div className="empty-state" style={{ maxWidth: 520, margin: '70px auto', padding: '44px 40px' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>No saved diagnostics</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>
            Run and save a <a href="#/diagnostic" style={{ color: 'var(--accent)' }}>Client Diagnostic</a> first — the proposal is generated from it automatically.
          </div>
        </div>
      </div>
    );
  }

  const crit = F.filter((f) => f.sev === 'danger');
  const scoreColor = score >= 75 ? 'oklch(0.5 0.14 150)' : score >= 50 ? 'oklch(0.58 0.12 75)' : 'oklch(0.55 0.2 25)';
  const maturityBand = score >= 75 ? 'Well run' : score >= 50 ? 'Typical operator' : 'High risk';
  const summary = `${active} operates as a ${String(a.operator_type || 'mobile hospitality').toLowerCase()} business${a.region ? ' across ' + a.region : ''}. This diagnostic scores their operation at ${score}/100 (${maturityBand.toLowerCase()}), with ${crit.length} critical issue${crit.length === 1 ? '' : 's'} and ${F.length - crit.length} warning${(F.length - crit.length) === 1 ? '' : 's'} identified. ${crit.length ? 'The engagement should lead with the critical risks below — chiefly ' + crit[0].title.toLowerCase() + '.' : 'No critical risks were found; the opportunity is to consolidate and automate for efficiency.'} OPSDECK proposes a phased build starting with the relational core and prioritising the modules that address the issues on record.`;

  const factDefs: [string, unknown][] = [
    ['Operation', a.operator_type], ['Region', a.region], ['Years trading', a.years],
    ['Trading pattern', a.season], ['Fleet size', a.unit_count ? a.unit_count + ' units' : null],
    ['Peak headcount', a.headcount], ['Events / season', a.events_count], ['Runs day-to-day', a.key_person],
  ];
  const facts = factDefs.filter(([, v]) => answered(v)).map(([k, v]) => ({ k, v: String(v) }));

  const prMap = { danger: { priority: 'CRITICAL', color: 'oklch(0.55 0.2 25)' }, warn: { priority: 'MEDIUM', color: 'oklch(0.58 0.12 75)' } };
  const phaseCol = (ph: string) => ph === 'CORE' ? 'oklch(0.5 0.14 150)' : ph[0] === 'S' ? 'oklch(0.5 0.13 220)' : 'oklch(0.5 0.12 262)';
  const groups: { when: string; horizon: string; color: string; items: Mod[] }[] = [];
  const imm = mods.filter((m) => m.phase === 'CORE');
  const shortP = mods.filter((m) => m.phase === 'S4' || m.phase === 'S5');
  const med = mods.filter((m) => m.phase === 'P2' || m.phase === 'P3');
  const longP = mods.filter((m) => m.phase === 'P4' || m.phase === 'P5');
  if (imm.length) groups.push({ when: 'IMMEDIATE', horizon: 'Weeks 1–4 · foundation', color: 'oklch(0.5 0.14 150)', items: imm });
  if (shortP.length) groups.push({ when: 'SHORT TERM', horizon: 'Month 1–2 · core operations', color: 'oklch(0.5 0.13 220)', items: shortP });
  if (med.length) groups.push({ when: 'MEDIUM TERM', horizon: 'Quarter · risk & control', color: 'oklch(0.5 0.12 262)', items: med });
  if (longP.length) groups.push({ when: 'LONG TERM', horizon: 'Next season · scale', color: 'oklch(0.5 0.05 262)', items: longP });

  const nextSteps = `We recommend a 45-minute review of this proposal with ${active}, confirming the priority order and agreeing the scope of the first (foundation) phase. On sign-off, OPSDECK stands up the relational core and the highest-priority module within the first build cycle, with a follow-up diagnostic to measure movement in the domain scores above.`;

  const d = new Date();
  const today = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const ref = 'OD-' + active.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase() + '-' + (d.getMonth() + 1) + d.getFullYear();

  function seedCover() {
    setShowCover(true);
    if (!cover) {
      setCover(
        `Dear ${active},\n\nThank you for walking us through your operation — it's clear how much you've built${a.years ? ` over ${a.years} years` : ''}. ` +
        `Our diagnostic scored the operation ${score}/100. ${crit.length ? `The headline risks are ${crit.slice(0, 2).map((f) => f.title.toLowerCase()).join(' and ')}, both fixable in the first build phase.` : 'There are no critical risks — the opportunity is efficiency: giving you back the hours the admin currently takes.'}\n\n` +
        `The attached proposal sets out a phased build, starting with the operational core. We'd welcome a short call to walk through it together.`
      );
    }
  }

  const label = { fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.12em', color: paperFaint } as const;
  const serifH = { fontFamily: SERIF, fontSize: 19, fontWeight: 600, borderBottom: `1px solid ${paperLine}`, paddingBottom: 8 } as const;

  return (
    <div style={{ minHeight: '100vh' }}>
      <style>{`
        @media print {
          .topbar, .proposal-controls { display: none !important; }
          body { background: #fff !important; }
          .paper { box-shadow: none !important; margin: 0 !important; max-width: 100% !important; }
          .page-break { break-before: page; }
        }
      `}</style>

      {/* control bar (screen only) */}
      <div className="proposal-controls client-bar" style={{ padding: '14px 24px', marginBottom: 0, background: 'var(--panel)', borderBottom: '1px solid var(--panel-line)' }}>
        <span style={{ fontWeight: 700, fontSize: 13.5, letterSpacing: '0.02em' }}>PROPOSAL GENERATOR</span>
        <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>Client</span>
        <select className="sel" style={{ width: 'auto' }} value={active} onChange={(e) => { setPicked(e.target.value); setCover(''); setShowCover(false); }} aria-label="Client">
          {names.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={seedCover}>Cover note</button>
        <button className="btn btn-primary" onClick={() => window.print()}>Print / Save PDF</button>
      </div>

      {/* the document */}
      <div className="paper" style={{
        maxWidth: 860, margin: '28px auto', background: '#fbfaf8', color: paperInk,
        boxShadow: '0 12px 40px oklch(0.1 0.01 255 / 0.5)', padding: '64px 72px 80px',
      }}>
        {/* masthead */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid oklch(0.62 0.25 295)', paddingBottom: 22 }}>
          <div>
            <div style={{ ...label, fontSize: 11, letterSpacing: '0.18em' }}>MAINFRAME</div>
            <div style={{ fontFamily: SERIF, fontSize: 29, fontWeight: 600, marginTop: 10, lineHeight: 1.15 }}>Operations Diagnostic &amp; Proposal</div>
            <div style={{ fontSize: 14, color: 'oklch(0.45 0.02 255)', marginTop: 6 }}>Prepared for <strong>{active}</strong></div>
          </div>
          <div style={{ textAlign: 'right', fontFamily: MONO, fontSize: 11, color: paperFaint, lineHeight: 1.9 }}>
            <div>{today}</div>
            <div>REF · {ref}</div>
            <div style={{ color: 'oklch(0.70 0.24 350)' }}>COMMERCIAL IN CONFIDENCE</div>
          </div>
        </div>

        {/* executive summary */}
        <div style={{ display: 'flex', gap: 30, marginTop: 34, alignItems: 'stretch', flexWrap: 'wrap' }}>
          <div style={{ flex: 'none', width: 170, background: '#fff', border: `1px solid ${paperLine}`, borderRadius: 14, padding: 22, textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={label}>OPS MATURITY</div>
            <div style={{ fontSize: 52, fontWeight: 700, fontFamily: MONO, color: scoreColor, lineHeight: 1.05, marginTop: 6 }}>{score}</div>
            <div style={{ fontSize: 11, color: paperFaint, fontFamily: MONO }}>/ 100</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: scoreColor, marginTop: 8 }}>{maturityBand}</div>
          </div>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ ...label, marginBottom: 9 }}>EXECUTIVE SUMMARY</div>
            <div style={{ fontSize: 14.5, lineHeight: 1.62, color: 'oklch(0.3 0.02 255)' }}>{summary}</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'oklch(0.55 0.2 25)', border: '1px solid oklch(0.75 0.14 25)', background: 'oklch(0.96 0.03 25)', borderRadius: 20, padding: '4px 12px' }}>{crit.length} critical</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'oklch(0.52 0.11 75)', border: '1px solid oklch(0.8 0.1 85)', background: 'oklch(0.97 0.04 90)', borderRadius: 20, padding: '4px 12px' }}>{F.length - crit.length} warnings</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'oklch(0.45 0.09 262)', border: '1px solid oklch(0.8 0.06 262)', background: 'oklch(0.96 0.02 262)', borderRadius: 20, padding: '4px 12px' }}>{mods.length} modules proposed</span>
            </div>
          </div>
        </div>

        {/* cover note (editable) */}
        {showCover && (
          <div style={{ marginTop: 30, border: '1px solid oklch(0.86 0.04 262)', background: 'oklch(0.97 0.012 262)', borderRadius: 12, padding: '22px 24px' }}>
            <div className="proposal-controls" style={{ ...label, color: 'oklch(0.5 0.08 262)', marginBottom: 11 }}>COVER NOTE · EDIT BEFORE SENDING</div>
            <textarea
              value={cover} onChange={(e) => setCover(e.target.value)} aria-label="Cover note"
              className="proposal-controls"
              style={{ width: '100%', minHeight: 140, border: '1px dashed oklch(0.8 0.04 262)', borderRadius: 8, padding: 12, font: 'inherit', fontSize: 14, lineHeight: 1.7, color: 'oklch(0.28 0.03 262)', background: 'transparent', resize: 'vertical' }}
            />
            {/* print shows the text, not the textarea */}
            <div style={{ fontSize: 14, lineHeight: 1.7, color: 'oklch(0.28 0.03 262)', whiteSpace: 'pre-wrap', display: 'none' }} className="proposal-print-cover">{cover}</div>
            <style>{`@media print { .proposal-print-cover { display: block !important; } }`}</style>
          </div>
        )}

        {/* 1 · current state */}
        <div style={{ marginTop: 40 }}>
          <div style={serifH}>1 · Current State</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 2, marginTop: 16, background: paperLine, border: `1px solid ${paperLine}`, borderRadius: 10, overflow: 'hidden' }}>
            {facts.map((f) => (
              <div key={f.k} style={{ background: '#fff', padding: '13px 15px' }}>
                <div style={{ fontSize: 10.5, letterSpacing: '0.06em', color: 'oklch(0.58 0.02 255)', fontFamily: MONO, textTransform: 'uppercase' }}>{f.k}</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{f.v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 2 · business health */}
        <div style={{ marginTop: 38 }}>
          <div style={serifH}>2 · Business Health by Domain</div>
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {domains.map((dm) => (
              <div key={dm.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{dm.name}</span>
                  <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: dm.color }}>
                    {dm.score}<span style={{ color: 'oklch(0.6 0.02 255)', fontWeight: 400 }}>/100 · {dm.band}</span>
                  </span>
                </div>
                <div style={{ height: 8, borderRadius: 5, background: paperLine, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${dm.score}%`, background: dm.color }} />
                </div>
                <div style={{ fontSize: 12, color: paperDim, marginTop: 5, lineHeight: 1.45 }}>{dm.note}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 3 · issue register */}
        <div style={{ marginTop: 38 }} className="page-break">
          <div style={serifH}>3 · Issue Register</div>
          {F.length === 0 && <div style={{ fontSize: 13.5, color: 'oklch(0.45 0.14 150)', marginTop: 14 }}>No structural risks were identified from the information provided.</div>}
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 11 }}>
            {F.map((f) => {
              const pr = prMap[f.sev];
              return (
                <div key={f.title} style={{ border: `1px solid ${paperLine}`, borderLeft: `4px solid ${pr.color}`, borderRadius: 8, padding: '14px 17px', background: '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5 }}>
                    <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 700, color: pr.color, border: `1px solid ${pr.color}`, padding: '2px 7px', borderRadius: 5 }}>{pr.priority}</span>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{f.title}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'oklch(0.42 0.02 255)', lineHeight: 1.55 }}>{f.detail}</div>
                  <div style={{ fontSize: 11.5, color: paperFaint, marginTop: 6 }}><strong style={{ color: 'oklch(0.42 0.02 255)' }}>Impact:</strong> {f.impact}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 4 · roadmap */}
        <div style={{ marginTop: 38 }}>
          <div style={serifH}>4 · Recommended Build &amp; Roadmap</div>
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>
            {groups.map((g) => (
              <div key={g.when}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
                  <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em', color: '#fff', background: g.color, padding: '3px 11px', borderRadius: 20 }}>{g.when}</span>
                  <span style={{ fontSize: 13, color: paperDim }}>{g.horizon}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, paddingLeft: 4 }}>
                  {g.items.map((m) => (
                    <div key={m.phase + m.title} style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                      <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600, color: phaseCol(m.phase), border: `1px solid ${phaseCol(m.phase)}`, padding: '2px 7px', borderRadius: 5, flex: 'none', marginTop: 1 }}>{m.phase}</span>
                      <div>
                        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{m.title}</span>
                        <span style={{ fontSize: 12.5, color: 'oklch(0.48 0.02 255)' }}> — {m.detail}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 5 · next steps */}
        <div style={{ marginTop: 40, background: 'oklch(0.96 0.015 262)', border: '1px solid oklch(0.86 0.04 262)', borderRadius: 12, padding: '24px 26px' }}>
          <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 600 }}>5 · Next Steps</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.6, color: 'oklch(0.35 0.03 262)', marginTop: 10 }}>{nextSteps}</div>
          <div style={{ fontSize: 11.5, color: 'oklch(0.5 0.02 262)', marginTop: 16, fontFamily: MONO }}>
            OPSDECK ADVISORY · Operations systems for mobile hospitality · This document is generated from the diagnostic on record and updates as new information is captured.
          </div>
        </div>
      </div>
    </div>
  );
}
