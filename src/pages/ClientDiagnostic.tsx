/* Client Diagnostic — ported from prototype-export/Client Diagnostic.dc.html.
   The 43-field business intake: 8 sections, chip/multi/text/free fields with
   per-field rationale, a live diagnosis panel (ops-maturity score, risk
   flags, recommended build modules), and per-client saves into kv
   'diagnostics' — the same namespace the Client Accounts page scores from.
   Deep-linkable as #/diagnostic/<business name>. */
import { useMemo, useState } from 'react';
import { useOpsData } from '../data/useOpsData';

type Answers = Record<string, string | string[] | null | undefined>;
type Diagnostics = Record<string, Answers>;

interface Field {
  id: string; label: string;
  type: 'text' | 'chips' | 'multi' | 'free';
  options?: string[]; placeholder?: string;
}
interface Section { id: string; label: string; desc: string; fields: Field[]; }

const SECTIONS: Section[] = [
  { id: 'profile', label: 'Business Profile', desc: 'Who the operator is and how they trade.', fields: [
    { id: 'business_name', label: 'Business name', type: 'text', placeholder: 'e.g. Bay Street Bars Ltd' },
    { id: 'operator_type', label: 'What do they operate?', type: 'chips', options: ['Mobile bars', 'Street food', 'Event catering', 'Coffee', 'Mixed fleet', 'Other'] },
    { id: 'years', label: 'Years operating', type: 'chips', options: ['<1', '1–3', '3–10', '10+'] },
    { id: 'season', label: 'Trading pattern', type: 'chips', options: ['Seasonal (summer)', 'Year-round', 'Weekends only'] },
    { id: 'region', label: 'Region / territory', type: 'text', placeholder: 'e.g. Midlands + South West' },
    { id: 'legal_structure', label: 'Legal structure', type: 'chips', options: ['Sole trader', 'Partnership', 'Limited company', 'Not sure'] },
    { id: 'key_person', label: 'Who runs operations day-to-day?', type: 'chips', options: ['Owner does everything', 'Owner + office staff', 'Dedicated ops manager', 'Shared informally'] },
  ] },
  { id: 'fleet', label: 'Fleet & Units', desc: 'The trailers, vans and units they run.', fields: [
    { id: 'unit_count', label: 'How many units?', type: 'chips', options: ['1–2', '3–5', '6–12', '13+'] },
    { id: 'unit_types', label: 'Unit types', type: 'multi', options: ['Bar', 'Coffee', 'Food', 'Catering', 'Dessert', 'Pizza', 'Van / support'] },
    { id: 'docs_tracked', label: 'Compliance documents held per unit', type: 'multi', options: ['Gas Safe', 'PAT testing', 'Public liability', 'Employer liability', 'Vehicle MOT / tax', 'None tracked centrally'] },
    { id: 'records', label: 'Where do unit records live today?', type: 'chips', options: ['Paper folder', 'Spreadsheet', 'Software', 'Someone’s head'] },
    { id: 'breakdowns', label: 'Unit breakdowns or downtime last season?', type: 'chips', options: ['Often', 'Occasionally', 'Rare / never'] },
    { id: 'insurance_renewals', label: 'How are insurance & certificate renewals tracked?', type: 'chips', options: ['System with reminders', 'Someone’s diary / memory', 'Not tracked'] },
  ] },
  { id: 'staff', label: 'Staff & Payroll', desc: 'Crew size, clearances and how people get paid.', fields: [
    { id: 'headcount', label: 'Peak-season headcount', type: 'chips', options: ['1–5', '6–15', '16–40', '40+'] },
    { id: 'roles', label: 'Roles used', type: 'multi', options: ['Unit manager', 'Supervisor', 'Bartender', 'Barista', 'Chef', 'Kitchen assistant', 'Front of house', 'Driver'] },
    { id: 'scheduling', label: 'How are staff scheduled today?', type: 'chips', options: ['WhatsApp / texts', 'Spreadsheet', 'Rota software', 'Phone calls'] },
    { id: 'rtw', label: 'Are right-to-work & hygiene certificates verified and recorded?', type: 'chips', options: ['Yes, recorded', 'Partially', 'No'] },
    { id: 'payroll', label: 'How is payroll run?', type: 'chips', options: ['Manual from memory / notes', 'Spreadsheet', 'Payroll software', 'Accountant handles it'] },
    { id: 'no_shows', label: 'Staff no-shows or dropped shifts?', type: 'chips', options: ['Most events', 'Some events', 'Rare / never'] },
    { id: 'turnover', label: 'Staff turnover season to season', type: 'chips', options: ['Mostly new faces each year', 'Mixed', 'Mostly returners'] },
    { id: 'staff_type', label: 'How are most staff engaged?', type: 'chips', options: ['PAYE employees', 'Freelance / self-employed', 'Agency', 'Mix'] },
  ] },
  { id: 'events', label: 'Events & Clients', desc: 'The shape of the season and where bookings come from.', fields: [
    { id: 'events_count', label: 'Events per season', type: 'chips', options: ['1–5', '6–15', '16–40', '40+'] },
    { id: 'event_size', label: 'Typical events', type: 'multi', options: ['Local shows', 'Weddings / private', 'Mid-size festivals', 'Major festivals', 'Overseas'] },
    { id: 'double_booking', label: 'Do double-bookings (staff or units) happen today?', type: 'chips', options: ['Often', 'Sometimes', 'Never', 'Don’t know'] },
    { id: 'profit_visibility', label: 'Do they know profit per event?', type: 'chips', options: ['Yes, per event', 'Roughly', 'No'] },
    { id: 'deadlines', label: 'Are organiser deadlines missed (RAMS, accreditation, trader packs)?', type: 'chips', options: ['Regularly', 'Occasionally', 'Never'] },
    { id: 'reconciliation', label: 'Are takings reconciled per unit, per day?', type: 'chips', options: ['Yes, daily', 'Sometimes', 'No'] },
    { id: 'event_revenue', label: 'Typical revenue per event', type: 'chips', options: ['<£5k', '£5–20k', '£20–50k', '£50k+', 'Varies wildly'] },
  ] },
  { id: 'money', label: 'Money & Admin', desc: 'Cash flow, invoicing and the admin drag.', fields: [
    { id: 'invoicing', label: 'How are clients quoted and invoiced?', type: 'chips', options: ['Word / PDF by hand', 'Spreadsheet', 'Accounting software', 'Rarely formalised'] },
    { id: 'payroll_time', label: 'How long does a pay run take?', type: 'chips', options: ['Under an hour', 'Half a day', 'A day or more'] },
    { id: 'late_payments', label: 'Do clients pay late or get chased informally?', type: 'chips', options: ['Often', 'Sometimes', 'Rare / never'] },
    { id: 'admin_hours', label: 'Office admin per week (rotas, chasing, paperwork)', type: 'chips', options: ['<5 hrs', '5–15 hrs', '15–30 hrs', '30+ hrs'] },
    { id: 'cost_tracking', label: 'Do they track costs per unit (stock, staff, fuel)?', type: 'chips', options: ['Yes, per unit', 'Roughly', 'No'] },
  ] },
  { id: 'tech', label: 'Technology', desc: 'What they run on today — scopes what we build vs. integrate.', fields: [
    { id: 'current_software', label: 'Software in use today', type: 'multi', options: ['None / paper', 'Spreadsheets', 'Accounting (Xero/QB)', 'Rota app', 'EPOS / till system', 'CRM', 'Project tool'] },
    { id: 'spreadsheet_reliance', label: 'How dependent are they on spreadsheets?', type: 'chips', options: ['Everything runs on them', 'A few key ones', 'Barely used'] },
    { id: 'connectivity', label: 'Mobile signal / wifi on-site', type: 'chips', options: ['Usually fine', 'Patchy', 'Often no signal on-site'] },
    { id: 'tool_appetite', label: 'Appetite for adopting a new system', type: 'chips', options: ['Keen', 'Cautious', 'Resistant'] },
  ] },
  { id: 'growth', label: 'Growth & Goals', desc: 'Where they want to be — gives the engagement a target.', fields: [
    { id: 'growth_goal', label: 'Primary growth ambition', type: 'chips', options: ['More events / bookings', 'Better margins', 'Less admin time', 'Expand the fleet', 'Franchise / license'] },
    { id: 'growth_blocker', label: 'Biggest thing holding growth back', type: 'chips', options: ['Owner / admin time', 'Cash flow', 'Staff availability', 'Unit capacity', 'Finding clients'] },
    { id: 'timeline', label: 'Timeframe for change', type: 'chips', options: ['Before next season', 'This year', 'No fixed deadline'] },
    { id: 'success_metric', label: 'What does a successful engagement look like to them?', type: 'free', placeholder: 'In their words — e.g. “run 40 events with the same office headcount”' },
  ] },
  { id: 'pain', label: 'Pain Points', desc: 'What hurts most — this drives which modules to build first.', fields: [
    { id: 'pains', label: 'Biggest operational problems', type: 'multi', options: ['Double bookings', 'Chasing staff availability', 'Payroll takes days', 'Compliance docs expire unnoticed', 'No profit view per event', 'Onboarding paperwork', 'Stock ordering chaos', 'Client comms scattered'] },
    { id: 'notes', label: 'Anything else from the conversation', type: 'free', placeholder: 'Verbatim quotes, numbers, deadlines…' },
  ] },
];

const DESCS: Record<string, string> = {
  business_name: 'The trading name you’ll use on the proposal and all client-facing documents.',
  operator_type: 'What they actually sell. Drives which compliance and licensing modules apply.',
  years: 'Longevity is a proxy for process maturity and how entrenched current habits are.',
  season: 'Seasonal operators have sharp peaks — the system must handle a compressed, high-volume window.',
  region: 'Geographic spread affects travel, logistics and which local authorities they deal with.',
  legal_structure: 'Affects tax, liability and which insurances are mandatory (e.g. employers’ liability).',
  key_person: 'Reveals key-person risk — if one person holds everything, that’s a single point of failure.',
  unit_count: 'Fleet size sets the scale of the allocation and compliance problem.',
  unit_types: 'Different unit types carry different paperwork (gas, alcohol, food hygiene).',
  docs_tracked: 'What compliance they hold per unit today — and whether it’s tracked at all.',
  records: 'Where records live tells you how visible (or invisible) expiries and history are.',
  breakdowns: 'Frequent breakdowns point to reactive rather than scheduled maintenance.',
  insurance_renewals: 'How renewals are tracked — a memory-based system is a lapse waiting to happen.',
  headcount: 'Peak crew size sets the scale of scheduling, payroll and onboarding.',
  roles: 'The role mix shapes the rota template and skill/clearance requirements.',
  scheduling: 'How shifts are assigned today — messaging apps leave no structural record.',
  rtw: 'Whether right-to-work and hygiene certs are verified and recorded before deployment.',
  payroll: 'How pay is calculated — manual methods are slow and error-prone.',
  no_shows: 'No-shows indicate shifts aren’t being positively confirmed.',
  turnover: 'High turnover repeats onboarding cost every season.',
  staff_type: 'Employment model affects payroll, holiday pay, IR35 and insurance.',
  events_count: 'Season volume sets how often the whole allocation cycle runs.',
  event_size: 'The event mix shapes logistics, staffing and revenue profile.',
  double_booking: 'Whether staff or units get committed to overlapping events — the core failure the system prevents.',
  profit_visibility: 'Whether they can see which events actually make money.',
  deadlines: 'Missed organiser deadlines (RAMS, accreditation) risk losing pitches.',
  reconciliation: 'Whether daily takings are checked per unit — or shrinkage goes unseen.',
  event_revenue: 'Revenue scale per event frames the ROI of fixing operational leaks.',
  invoicing: 'How clients are quoted and billed — informal invoicing hurts cash flow.',
  payroll_time: 'Time per pay run is pure admin cost that automation removes.',
  late_payments: 'Late or chased payments signal a cash-flow control gap.',
  admin_hours: 'Weekly office admin is the time automation can give back.',
  cost_tracking: 'Whether costs are attributed per unit — without it, profit per event is guesswork.',
  current_software: 'The existing stack decides what we build fresh vs. integrate.',
  spreadsheet_reliance: 'Heavy spreadsheet dependence is fragile — one formula can break everything.',
  connectivity: 'On-site signal determines whether the system must work offline.',
  tool_appetite: 'Appetite for change sets how the rollout should be phased.',
  growth_goal: 'Their primary ambition gives the engagement a target to aim at.',
  growth_blocker: 'The main constraint on growth is usually the highest-value thing to fix.',
  timeline: 'Their timeframe sets the urgency and phasing of the build.',
  success_metric: 'Defining success in their words makes the engagement measurable.',
};

const FIELD_TOTAL = SECTIONS.reduce((n, s) => n + s.fields.length, 0);

function answered(v: unknown): boolean {
  return Array.isArray(v) ? v.length > 0 : !!(v && String(v).trim());
}

interface Flag { sev: 'danger' | 'warn'; title: string; detail: string; }
interface Module { phase: string; title: string; detail: string; }

/* Verbatim port of the prototype's diagnosis engine. */
function computeFindings(a: Answers): { flags: Flag[]; modules: Module[]; score: number } {
  const flags: Flag[] = [];
  const add = (sev: Flag['sev'], title: string, detail: string) => flags.push({ sev, title, detail });
  const docs = (a.docs_tracked as string[]) || [];
  const pains = (a.pains as string[]) || [];
  const software = (a.current_software as string[]) || [];

  if (a.records === 'Paper folder' || a.records === 'Someone’s head') add('danger', 'Records not centralised', 'Unit compliance and history live in ' + String(a.records).toLowerCase() + ' — expiry dates are invisible until something fails an inspection.');
  if (docs.includes('None tracked centrally')) add('danger', 'No central compliance register', 'Gas, PAT and insurance expiries are untracked. One expired cert can shut a unit mid-event.');
  if (a.scheduling === 'WhatsApp / texts' || a.scheduling === 'Phone calls') add('warn', 'Scheduling by message', 'No structural record of who is where — clashes get found on the day, not at booking.');
  if (a.double_booking === 'Often' || a.double_booking === 'Sometimes') add('danger', 'Double-bookings already occurring', 'Confirmed relational failure — the OPSDECK allocation engine fixes this on day one. Lead the pitch with it.');
  if (a.double_booking === 'Don’t know') add('warn', 'No visibility of clashes', 'They can’t tell whether double-bookings happen — same fix, framed as visibility rather than rescue.');
  if (a.rtw === 'No' || a.rtw === 'Partially') add('danger', 'Unverified right-to-work / hygiene', 'Legal exposure on every event. Blocking unverified staff at allocation is a headline feature for them.');
  if (a.payroll === 'Manual from memory / notes') add('warn', 'Manual payroll', 'Hours re-keyed by hand — errors plus days of admin per pay run.');
  if (a.profit_visibility === 'No' || a.profit_visibility === 'Roughly') add('warn', 'No profit per event', 'They can’t tell which events to drop. The costing view answers this directly.');
  if (a.key_person === 'Owner does everything') add('danger', 'Single point of failure', 'Everything routes through the owner — illness or one busy weekend stalls the whole operation. The system must externalise their head.');
  if (a.key_person === 'Shared informally') add('warn', 'Unclear ops ownership', 'No one clearly owns operations — tasks fall between people.');
  if (a.breakdowns === 'Often') add('warn', 'Reactive maintenance', 'Units fail during trade instead of being serviced between events — a maintenance log with scheduled checks pays for itself.');
  if (a.insurance_renewals === 'Someone’s diary / memory' || a.insurance_renewals === 'Not tracked') add('danger', 'Renewals untracked', 'Insurance and certificate expiries rely on memory — one lapse can void cover mid-season.');
  if (a.no_shows === 'Most events' || a.no_shows === 'Some events') add('warn', 'Shift confirmation gap', 'No-shows mean shifts are never positively confirmed — automated confirmations and a standby list fix this.');
  if (a.turnover === 'Mostly new faces each year') add('warn', 'Onboarding burden', 'Rebuilding the crew every season repeats the same paperwork — a returner database plus digital onboarding cuts weeks of admin.');
  if (a.deadlines === 'Regularly') add('danger', 'Organiser deadlines missed', 'Late RAMS or accreditation risks losing pitches — per-event deadline tracking belongs in the core build.');
  if (a.deadlines === 'Occasionally') add('warn', 'Deadline near-misses', 'Organiser paperwork is being caught late — per-event deadline tracking removes the scramble.');
  if (a.reconciliation === 'No' || a.reconciliation === 'Sometimes') add('warn', 'Takings not reconciled', 'Without per-unit daily reconciliation, shrinkage and card/cash gaps go unseen.');
  if (a.payroll_time === 'A day or more') add('warn', 'Payroll drag', 'A full day per pay run is pure admin cost — hours should flow straight from allocations.');
  if (a.late_payments === 'Often') add('warn', 'Cash-flow risk', 'Client payments are chased informally — invoicing with due-date tracking belongs in the commercial module.');
  if (a.spreadsheet_reliance === 'Everything runs on them') add('warn', 'Spreadsheet-dependent', 'A single broken formula or wrong tab can take out the whole operation — the relational build removes that fragility.');
  if (software.includes('None / paper')) add('warn', 'No software backbone', 'Operations run on paper — every module here is greenfield, which means fast, visible wins.');
  if (a.connectivity === 'Often no signal on-site') add('warn', 'Patchy on-site connectivity', 'Festival sites lose signal — the system must work offline and sync later. Design for this from the start.');
  if (a.tool_appetite === 'Resistant') add('warn', 'Change resistance', 'They are wary of new systems — phase the rollout and lead with one undeniable win before expanding.');
  if (a.growth_blocker === 'Owner / admin time' && a.key_person !== 'Owner does everything') add('warn', 'Owner time is the ceiling', 'Growth is capped by the owner’s hours — automation of admin is the direct lever.');

  const modules: Module[] = [{ phase: 'CORE', title: 'Events · Units · Staff', detail: 'Every client starts here — the relational spine (Stages 1–3).' }];
  if (pains.includes('Double bookings') || pains.includes('Chasing staff availability') || a.double_booking === 'Often' || a.double_booking === 'Sometimes' || a.double_booking === 'Don’t know') modules.push({ phase: 'S4', title: 'Allocation & conflict engine', detail: 'Clash detection for staff and units at booking time, not on the day.' });
  if (pains.includes('Payroll takes days') || pains.includes('No profit view per event') || (a.profit_visibility && a.profit_visibility !== 'Yes, per event')) modules.push({ phase: 'S5', title: 'Costing & payroll', detail: 'Hours → gross pay → profit per event, with no re-keying.' });
  if (pains.includes('Compliance docs expire unnoticed') || docs.includes('None tracked centrally') || a.breakdowns === 'Often' || a.insurance_renewals === 'Not tracked' || a.insurance_renewals === 'Someone’s diary / memory') modules.push({ phase: 'P2', title: 'Assets & compliance', detail: 'Cert register with expiry alerts, maintenance log; blocks non-compliant units from events.' });
  if (pains.includes('Stock ordering chaos')) modules.push({ phase: 'P3', title: 'Stock & purchasing', detail: 'Per-unit stock requirements, supplier database, purchase orders.' });
  if (pains.includes('Onboarding paperwork') || a.turnover === 'Mostly new faces each year' || a.no_shows === 'Most events' || a.no_shows === 'Some events') modules.push({ phase: 'P4', title: 'People & safety', detail: 'Digital onboarding, shift confirmations, training records, RAMS and incident reporting.' });
  if (pains.includes('Client comms scattered') || a.late_payments === 'Often' || a.invoicing === 'Word / PDF by hand' || a.invoicing === 'Rarely formalised') modules.push({ phase: 'P5', title: 'Commercial / CRM', detail: 'Client database, quoting, invoicing with due-date tracking and the event pipeline.' });

  let score = 100;
  flags.forEach((f) => { score -= f.sev === 'danger' ? 16 : 8; });
  return { flags, modules, score: Math.max(score, 15) };
}

function hashClient(): string | null {
  const m = /^#\/diagnostic\/(.+)$/.exec(window.location.hash || '');
  return m ? decodeURIComponent(m[1]) : null;
}

export default function ClientDiagnostic() {
  const { data, ready, error } = useOpsData();
  const [section, setSection] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [activeClient, setActiveClient] = useState<string | null>(null);
  const [booted, setBooted] = useState(false);
  const [saving, setSaving] = useState(false);

  const saved = useMemo(
    () => (ready ? (data.kvGet<Diagnostics>('diagnostics') || {}) : {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, data.meta().updatedAt]
  );

  // One-time boot: honour a #/diagnostic/<name> deep link once data is loaded.
  if (ready && !booted) {
    setBooted(true);
    const want = hashClient();
    if (want) {
      if (saved[want]) { setActiveClient(want); setAnswers({ ...saved[want] }); }
      else setAnswers({ business_name: want });
    }
  }

  const setAns = (id: string, val: Answers[string]) => setAnswers((p) => ({ ...p, [id]: val }));
  const toggleMulti = (id: string, opt: string) => setAnswers((p) => {
    const cur = ([...(p[id] as string[] | undefined) || []]);
    const i = cur.indexOf(opt);
    if (i >= 0) cur.splice(i, 1); else cur.push(opt);
    return { ...p, [id]: cur };
  });

  async function saveClient() {
    const name = String(answers.business_name || '').trim();
    if (!name || saving) return;
    setSaving(true);
    try {
      const next = { ...(data.kvGet<Diagnostics>('diagnostics') || {}), [name]: answers };
      await data.kvSet('diagnostics', next);
      setActiveClient(name);
    } finally {
      setSaving(false);
    }
  }
  function loadClient(name: string) {
    setActiveClient(name); setAnswers({ ...saved[name] }); setSection(0);
  }
  function newClient() {
    setActiveClient(null); setAnswers({}); setSection(0);
  }

  if (error) return <div className="p4"><div className="banner">Couldn't load data: {error}</div></div>;
  if (!ready) return <div className="state"><div><div className="spinner" /><div className="eyebrow">Loading diagnostic</div></div></div>;

  const sec = SECTIONS[section];
  const answeredN = SECTIONS.reduce((n, s) => n + s.fields.filter((f) => answered(answers[f.id])).length, 0);
  const started = answeredN > 0;
  const { flags, modules, score } = computeFindings(answers);
  const scoreColor = !started ? 'var(--ink-3)' : score >= 75 ? 'var(--ok)' : score >= 50 ? 'var(--warn)' : 'var(--danger)';
  const scoreNote = !started
    ? 'Answer the questionnaire to build the diagnosis.'
    : score >= 75 ? 'Well-run operation — sell efficiency, not rescue.'
    : score >= 50 ? 'Typical operator — clear, sellable wins available.'
    : 'High-risk operation — lead the pitch with the risk flags.';
  const canSave = !!String(answers.business_name || '').trim();
  const prevOk = section > 0, nextOk = section < SECTIONS.length - 1;

  return (
    <div className="p4" style={{ maxWidth: 'none', padding: 0 }}>
      {/* header strip */}
      <div style={{ borderBottom: '1px solid var(--panel-line)', background: 'var(--panel)', padding: '10px 30px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: '0.02em' }}>MAINFRAME · CLIENT DIAGNOSTIC</div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>BUSINESS INTAKE &amp; SCOPING TOOL</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="mono" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--accent)' }}>{answeredN} / {FIELD_TOTAL}</div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>questions answered</div>
        </div>
        {activeClient && (
          <a className="btn" href={`#/proposal/${encodeURIComponent(activeClient)}`}>Generate proposal →</a>
        )}
        <a className="btn" href="#/onboard" title="Won the client? Set up their operator record, units and crew">Onboard →</a>
        <button className="btn" onClick={() => window.print()} title="Print the questionnaire to gather answers on paper">Print</button>
        <button className="btn btn-primary" onClick={saveClient} disabled={!canSave || saving}>
          {saving ? 'Saving…' : activeClient ? 'Save changes' : 'Save client'}
        </button>
      </div>

      {/* saved-clients bar */}
      <div style={{ borderBottom: '1px solid var(--panel-line)', background: 'var(--panel)', padding: '10px 30px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', marginRight: 4 }}>CLIENTS ›</span>
        {Object.keys(saved).sort().map((name) => (
          <button key={name} className="tab" aria-selected={activeClient === name} onClick={() => loadClient(name)}>{name}</button>
        ))}
        <button className="btn btn-ghost btn-sm" style={{ borderStyle: 'dashed', border: '1px dashed var(--panel-line)' }} onClick={newClient}>+ New diagnostic</button>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>Saved to the shared workspace — run one per prospect</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'stretch', flexWrap: 'wrap' }}>
        {/* section nav */}
        <aside style={{ width: 232, flex: 'none', borderRight: '1px solid var(--panel-line)', background: 'var(--panel)', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div className="ev-label" style={{ padding: '6px 10px' }}>Intake sections</div>
          {SECTIONS.map((s, i) => {
            const done = s.fields.filter((f) => answered(answers[f.id])).length;
            const active = i === section;
            return (
              <button key={s.id} onClick={() => setSection(i)} style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: 10,
                border: 'none', borderRadius: 8, cursor: 'pointer', font: 'inherit', fontSize: 13,
                fontWeight: active ? 600 : 500,
                background: active ? 'var(--panel-2)' : 'transparent',
                color: active ? 'var(--ink)' : 'var(--ink-2)',
                boxShadow: active ? 'inset 3px 0 0 var(--accent)' : 'none',
              }}>
                <span className="mono" style={{
                  width: 26, height: 26, flex: 'none', borderRadius: 6, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: 10.5, fontWeight: 600,
                  background: active ? 'var(--accent)' : 'var(--bg)', color: active ? 'var(--bg)' : 'var(--ink-3)',
                }}>0{i + 1}</span>
                <span style={{ flex: 1, textAlign: 'left' }}>{s.label}</span>
                <span className="mono" style={{ fontSize: 10.5, color: done === s.fields.length ? 'var(--ok)' : 'var(--ink-3)' }}>{done}/{s.fields.length}</span>
              </button>
            );
          })}
          <div style={{ flex: 1 }} />
          <div style={{ padding: '12px 10px', borderTop: '1px solid var(--panel-line)', fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.55 }}>
            Run this in the first client meeting. The diagnosis panel builds the pitch as you type.
          </div>
        </aside>

        {/* questions */}
        <main style={{ flex: 1, minWidth: 350, padding: '30px 34px 70px' }}>
          <div style={{ maxWidth: 680 }}>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '0.01em' }}>{sec.label}</div>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', margin: '4px 0 28px' }}>{sec.desc}</div>

            {sec.fields.map((f) => {
              const v = answers[f.id];
              const desc = DESCS[f.id];
              return (
                <div key={f.id} style={{ marginBottom: 28 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 5 }}>{f.label}</div>
                  {desc && <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5, marginBottom: 11, maxWidth: 520 }}>{desc}</div>}
                  {f.type === 'text' && (
                    <input className="inp" style={{ maxWidth: 440 }} value={String(v || '')} placeholder={f.placeholder}
                      onChange={(e) => setAns(f.id, e.target.value)} aria-label={f.label} />
                  )}
                  {f.type === 'free' && (
                    <textarea className="inp" style={{ minHeight: 110, resize: 'vertical' }} value={String(v || '')} placeholder={f.placeholder}
                      onChange={(e) => setAns(f.id, e.target.value)} aria-label={f.label} />
                  )}
                  {(f.type === 'chips' || f.type === 'multi') && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {(f.options || []).map((opt) => {
                        const on = f.type === 'multi' ? ((v as string[]) || []).includes(opt) : v === opt;
                        return (
                          <button key={opt}
                            onClick={() => f.type === 'multi' ? toggleMulti(f.id, opt) : setAns(f.id, on ? null : opt)}
                            aria-pressed={on}
                            style={{
                              padding: '9px 15px', borderRadius: 8, fontSize: 12.5, fontWeight: 600,
                              cursor: 'pointer', font: 'inherit',
                              border: `1px solid ${on ? 'var(--accent)' : 'var(--panel-line)'}`,
                              background: on ? 'color-mix(in oklch, var(--accent) 14%, transparent)' : 'var(--panel)',
                              color: on ? 'var(--accent)' : 'var(--ink-2)',
                            }}>{opt}</button>
                        );
                      })}
                    </div>
                  )}
                  {f.type === 'multi' && <div className="ev-label" style={{ marginTop: 8 }}>Select all that apply</div>}
                </div>
              );
            })}

            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button className="btn" onClick={() => prevOk && setSection(section - 1)} disabled={!prevOk}>
                ‹ {prevOk ? SECTIONS[section - 1].label : 'Start'}
              </button>
              <button className="btn btn-primary" onClick={() => nextOk && setSection(section + 1)} disabled={!nextOk}>
                {nextOk ? SECTIONS[section + 1].label : 'End of intake'} ›
              </button>
            </div>
          </div>
        </main>

        {/* live diagnosis */}
        <aside style={{ flex: '1 1 334px', minWidth: 320, maxWidth: 430, borderLeft: '1px solid var(--panel-line)', background: 'var(--panel)', padding: '22px 22px 50px' }}>
          <div className="ev-label" style={{ marginBottom: 14 }}>Live diagnosis</div>

          <div style={{ background: 'var(--bg)', border: '1px solid var(--panel-line)', borderRadius: 12, padding: 18, marginBottom: 20 }}>
            <div className="ev-label">Ops maturity score</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
              <span className="mono" style={{ fontSize: 38, fontWeight: 700, color: scoreColor }}>{started ? score : '—'}</span>
              <span className="mono" style={{ fontSize: 13, color: 'var(--ink-3)' }}>/ 100</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5, marginTop: 7 }}>{scoreNote}</div>
          </div>

          <div className="ev-label" style={{ marginBottom: 10 }}>Risk flags</div>
          {!started && <div style={{ fontSize: 12, color: 'var(--ink-3)', padding: '6px 0 16px', lineHeight: 1.5 }}>Risks appear here as answers come in.</div>}
          {started && flags.length === 0 && <div style={{ fontSize: 12, color: 'var(--ok)', padding: '6px 0 16px' }}>No structural risks detected so far.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 22 }}>
            {flags.map((f) => {
              const color = f.sev === 'danger' ? 'var(--danger)' : 'var(--warn)';
              return (
                <div key={f.title} style={{
                  border: `1px solid ${color}`, borderRadius: 9, padding: '11px 13px',
                  background: `color-mix(in oklch, ${f.sev === 'danger' ? 'var(--danger)' : 'var(--warn)'} 11%, transparent)`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span className="mono" style={{ fontSize: 9.5, fontWeight: 700, color, border: `1px solid ${color}`, padding: '1px 6px', borderRadius: 4 }}>
                      {f.sev === 'danger' ? 'RISK' : 'WARN'}
                    </span>
                    <span style={{ fontWeight: 600, fontSize: 12.5 }}>{f.title}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>{f.detail}</div>
                </div>
              );
            })}
          </div>

          <div className="ev-label" style={{ marginBottom: 6 }}>Recommended build</div>
          <div>
            {modules.map((m) => {
              const color = m.phase === 'CORE' ? 'var(--ok)' : m.phase[0] === 'S' ? 'var(--accent)' : 'var(--accent-2)';
              return (
                <div key={m.phase + m.title} style={{ display: 'flex', gap: 11, alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid var(--panel-line)' }}>
                  <span className="mono" style={{ fontSize: 10.5, fontWeight: 600, color, border: `1px solid ${color}`, padding: '2px 8px', borderRadius: 20, flex: 'none' }}>{m.phase}</span>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{m.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-2)', lineHeight: 1.45, marginTop: 2 }}>{m.detail}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
