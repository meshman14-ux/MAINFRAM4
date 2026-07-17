import { useMemo, useState } from 'react';
import { useOpsData } from '../data/useOpsData';
import type { Client, Unit, Staff, StockLine } from '../data/types';
import { onboardingState } from '../data/phase5';

const STEPS = ['Operator', 'Units', 'Staff', 'Review'] as const;
type Step = number;

const UNIT_TYPES = ['Bar', 'Coffee', 'Food', 'Catering', 'Support'];
const ROLES = ['Unit Manager', 'Bartender', 'Barista', 'Chef', 'Kitchen Assistant', 'Driver', 'General'];

export default function Onboarding() {
  const { data, ready, error } = useOpsData();
  const [step, setStep] = useState<Step>(0);
  const [clientId, setClientId] = useState<string>('');

  // Step 0: create or select operator
  const [newName, setNewName] = useState('');
  const [contact, setContact] = useState('');

  const clients = useMemo(
    () => (ready ? data.all<Client>('clients') : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, data.meta().updatedAt]
  );

  if (error) return <div className="p4"><div className="banner">Couldn't load data: {error}</div></div>;
  if (!ready) return <div className="state"><div><div className="spinner" /><div className="eyebrow">Loading onboarding</div></div></div>;

  async function createOperator() {
    if (!newName.trim()) return;
    const c = await data.save<Partial<Client>>('clients', { name: newName.trim(), contact, status: 'Active' });
    setClientId(c.id);
    setStep(1);
  }

  const state = clientId ? onboardingState(data, clientId) : null;

  return (
    <div className="p4">
      <div className="wizard">
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, marginBottom: 4 }}>New operator setup</h1>
        <p className="wiz-sub">Get a new client live: create them, add their units and crew, and we'll seed default stock.</p>

        <div className="wiz-steps">
          {STEPS.map((s, i) => (
            <div key={s} className="wiz-step" data-state={i === step ? 'active' : i < step ? 'done' : ''}>
              <span className="n">STEP {i + 1}</span>{s}
            </div>
          ))}
        </div>

        <div className="wiz-body">
          {step === 0 && (
            <div>
              <h2 className="wiz-h">Create the operator</h2>
              <p className="wiz-sub">The business you're onboarding — a caterer, bar or food-trader.</p>
              <div style={{ display: 'grid', gap: 12 }}>
                <label>Business name<input className="inp" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Coastal Kitchen" /></label>
                <label>Main contact<input className="inp" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="e.g. Sam Reid" /></label>
              </div>
              {clients.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 8 }}>OR CONTINUE AN EXISTING ONE</div>
                  <select className="sel" value={clientId} onChange={(e) => { setClientId(e.target.value); }}>
                    <option value="">— select —</option>
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
              <div className="wiz-actions">
                <span />
                {clientId ? (
                  <button className="btn btn-primary" onClick={() => setStep(1)}>Continue →</button>
                ) : (
                  <button className="btn btn-primary" onClick={createOperator} disabled={!newName.trim()}>Create & continue →</button>
                )}
              </div>
            </div>
          )}

          {step === 1 && clientId && (
            <UnitsStep data={data} clientId={clientId} onBack={() => setStep(0)} onNext={() => setStep(2)} />
          )}
          {step === 2 && clientId && (
            <StaffStep data={data} clientId={clientId} onBack={() => setStep(1)} onNext={() => setStep(3)} />
          )}
          {step === 3 && clientId && state && (
            <div>
              <h2 className="wiz-h">Review & go live</h2>
              <p className="wiz-sub">Here's what's set up for {clients.find((c) => c.id === clientId)?.name}.</p>
              <div className="wiz-added"><span>Units</span><span className="mono">{state.unitCount}</span></div>
              <div className="wiz-added"><span>Crew</span><span className="mono">{state.staffCount}</span></div>
              <div className="wiz-added"><span>Stock lines (seeded)</span><span className="mono">{state.stockCount}</span></div>
              <div style={{ marginTop: 16, padding: 14, borderRadius: 'var(--r-sm)', background: state.complete ? 'color-mix(in oklab, var(--green) 10%, var(--panel))' : 'color-mix(in oklab, var(--amber) 10%, var(--panel))', border: `1px solid ${state.complete ? 'color-mix(in oklab, var(--green) 40%, var(--panel-line))' : 'color-mix(in oklab, var(--amber) 40%, var(--panel-line))'}` }}>
                {state.complete ? '✓ Ready to go — this operator can now be scheduled in the Ops Console.' : 'Add at least one unit and one crew member to complete setup.'}
              </div>
              <div className="wiz-actions">
                <button className="btn btn-ghost" onClick={() => setStep(2)}>← Back</button>
                <a className="btn btn-primary" href="#/console">Open Ops Console →</a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function UnitsStep({ data, clientId, onBack, onNext }: { data: ReturnType<typeof useOpsData>['data']; clientId: string; onBack: () => void; onNext: () => void }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState('Bar');
  const [crew, setCrew] = useState(2);
  const units = data.unitsForClient(clientId);

  async function add() {
    if (!code.trim() || !name.trim()) return;
    const u = await data.save<Partial<Unit>>('units', { clientId, code: code.trim(), name: name.trim(), type, crew });
    // seed default stock for the type
    for (const line of data.defaultStockFor(type)) {
      await data.save<Partial<StockLine>>('stock', { unitId: u.id, ...line });
    }
    setCode(''); setName('');
  }

  return (
    <div>
      <h2 className="wiz-h">Add units</h2>
      <p className="wiz-sub">Each trading unit — a bar, coffee cart, food or catering setup. We'll seed default stock for each.</p>
      {units.map((u: Unit) => (
        <div className="wiz-added" key={u.id}><span>{u.code} · {u.name} <span className="chip chip-blue" style={{ fontSize: 10 }}>{data.areaOfUnit(u)}</span></span><span className="mono">crew {u.crew}</span></div>
      ))}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 1fr 0.7fr auto', gap: 8, marginTop: 12, alignItems: 'end' }}>
        <label>Code<input className="inp" value={code} onChange={(e) => setCode(e.target.value)} placeholder="BAR-01" /></label>
        <label>Name<input className="inp" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Type<select className="sel" value={type} onChange={(e) => setType(e.target.value)}>{UNIT_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label>Crew<input className="inp" type="number" min={0} value={crew} onChange={(e) => setCrew(Number(e.target.value))} /></label>
        <button className="btn btn-primary" onClick={add} disabled={!code.trim() || !name.trim()}>Add</button>
      </div>
      <div className="wiz-actions">
        <button className="btn btn-ghost" onClick={onBack}>← Back</button>
        <button className="btn btn-primary" onClick={onNext} disabled={units.length === 0}>Continue →</button>
      </div>
    </div>
  );
}

function StaffStep({ data, clientId, onBack, onNext }: { data: ReturnType<typeof useOpsData>['data']; clientId: string; onBack: () => void; onNext: () => void }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('Bartender');
  const [rate, setRate] = useState(12);
  const staff = data.staffForClient(clientId);

  async function add() {
    if (!name.trim()) return;
    await data.save<Partial<Staff>>('staff', { clientId, name: name.trim(), role, rate, rtw: 'Pending' });
    setName('');
  }

  return (
    <div>
      <h2 className="wiz-h">Add crew</h2>
      <p className="wiz-sub">The staff pool for this operator. RTW starts as Pending — they verify it in the Staff Hub.</p>
      {staff.map((s: Staff) => (
        <div className="wiz-added" key={s.id}><span>{s.name} · {s.role}</span><span className="mono">£{Number(s.rate || 0).toFixed(2)}</span></div>
      ))}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 0.7fr auto', gap: 8, marginTop: 12, alignItems: 'end' }}>
        <label>Name<input className="inp" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Role<select className="sel" value={role} onChange={(e) => setRole(e.target.value)}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></label>
        <label>Rate<input className="inp" type="number" step="0.5" value={rate} onChange={(e) => setRate(Number(e.target.value))} /></label>
        <button className="btn btn-primary" onClick={add} disabled={!name.trim()}>Add</button>
      </div>
      <div className="wiz-actions">
        <button className="btn btn-ghost" onClick={onBack}>← Back</button>
        <button className="btn btn-primary" onClick={onNext} disabled={staff.length === 0}>Continue →</button>
      </div>
    </div>
  );
}
