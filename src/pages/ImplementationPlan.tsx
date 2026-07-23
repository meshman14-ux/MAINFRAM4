/* Implementation Plan — ported from prototype-export/Implementation Plan.dc.html.
   Turns a saved diagnostic's recommended build into phased delivery tasks
   (3 per module), each with To do / In progress / Done status. Progress is
   saved per client in kv 'implplan' ({ "<client>": { "PHASE:i": status } })
   so it syncs and survives like everything else. Deep link: #/plan/<name>. */
import { useMemo, useState } from 'react';
import { useOpsData } from '../data/useOpsData';

type Answers = Record<string, string | string[] | null | undefined>;
type Diagnostics = Record<string, Answers>;
type Progress = Record<string, Record<string, string>>;

interface Mod { phase: string; title: string; tasks: string[]; }

/* Verbatim port: module list + delivery tasks derived from the diagnostic. */
function modules(a: Answers): Mod[] {
  const mods: Mod[] = [{ phase: 'CORE', title: 'Events · Units · Staff', tasks: ['Import event calendar', 'Set up unit records', 'Build staff roster with clearances'] }];
  const p = (a.pains as string[]) || [];
  const docs = (a.docs_tracked as string[]) || [];
  if (p.includes('Double bookings') || p.includes('Chasing staff availability') || a.double_booking === 'Often' || a.double_booking === 'Sometimes' || a.double_booking === 'Don’t know') mods.push({ phase: 'S4', title: 'Allocation & conflict engine', tasks: ['Configure clash rules (staff + units)', 'Set working-time limits', 'Train office on allocation flow'] });
  if (p.includes('Payroll takes days') || p.includes('No profit view per event') || (a.profit_visibility && a.profit_visibility !== 'Yes, per event')) mods.push({ phase: 'S5', title: 'Costing & payroll', tasks: ['Set pay rates and roles', 'Link hours to payroll export', 'Build profit-per-event view'] });
  if (p.includes('Compliance docs expire unnoticed') || docs.includes('None tracked centrally') || a.breakdowns === 'Often' || a.insurance_renewals === 'Not tracked' || a.insurance_renewals === 'Someone’s diary / memory') mods.push({ phase: 'P2', title: 'Assets & compliance', tasks: ['Load all unit certificates', 'Set expiry alerts', 'Add maintenance log'] });
  if (p.includes('Stock ordering chaos')) mods.push({ phase: 'P3', title: 'Stock & purchasing', tasks: ['Define per-unit stock lists', 'Add supplier database', 'Set up purchase orders'] });
  if (p.includes('Onboarding paperwork') || a.turnover === 'Mostly new faces each year' || a.no_shows === 'Most events' || a.no_shows === 'Some events') mods.push({ phase: 'P4', title: 'People & safety', tasks: ['Digitise onboarding forms', 'Set up shift confirmations', 'Load RAMS + training records'] });
  if (p.includes('Client comms scattered') || a.late_payments === 'Often' || a.invoicing === 'Word / PDF by hand' || a.invoicing === 'Rarely formalised') mods.push({ phase: 'P5', title: 'Commercial / CRM', tasks: ['Import client database', 'Build quote templates', 'Set up invoicing + due dates'] });
  return mods;
}

const STATUS = ['To do', 'In progress', 'Done'] as const;
const ST_COLOR: Record<string, string> = { 'To do': 'var(--ink-3)', 'In progress': 'var(--warn)', 'Done': 'var(--ok)' };

const PHASE_META: Record<string, { when: string; title: string; horizon: string; color: string }> = {
  CORE: { when: 'IMMEDIATE', title: 'Foundation', horizon: 'Weeks 1–4', color: 'oklch(0.5 0.14 150)' },
  S4: { when: 'SHORT', title: 'Allocation', horizon: 'Month 1–2', color: 'oklch(0.5 0.13 220)' },
  S5: { when: 'SHORT', title: 'Costing & payroll', horizon: 'Month 1–2', color: 'oklch(0.5 0.13 220)' },
  P2: { when: 'MEDIUM', title: 'Assets & compliance', horizon: 'Quarter', color: 'oklch(0.5 0.12 262)' },
  P3: { when: 'MEDIUM', title: 'Stock & purchasing', horizon: 'Quarter', color: 'oklch(0.5 0.12 262)' },
  P4: { when: 'LONG', title: 'People & safety', horizon: 'Next season', color: 'oklch(0.55 0.08 300)' },
  P5: { when: 'LONG', title: 'Commercial / CRM', horizon: 'Next season', color: 'oklch(0.55 0.08 300)' },
};

function hashClient(): string | null {
  const m = /^#\/plan\/(.+)$/.exec(window.location.hash || '');
  return m ? decodeURIComponent(m[1]) : null;
}

export default function ImplementationPlan() {
  const { data, ready, error } = useOpsData();
  const [picked, setPicked] = useState<string | null>(null);
  const [booted, setBooted] = useState(false);

  const diags = useMemo(
    () => (ready ? (data.kvGet<Diagnostics>('diagnostics') || {}) : {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, data.meta().updatedAt]
  );
  const progress = useMemo(
    () => (ready ? (data.kvGet<Progress>('implplan') || {}) : {}),
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
  const prog = (active && progress[active]) || {};

  async function setStatus(key: string, val: string) {
    if (!active) return;
    const cur = data.kvGet<Progress>('implplan') || {};
    await data.kvSet('implplan', { ...cur, [active]: { ...(cur[active] || {}), [key]: val } });
  }

  if (error) return <div className="p4"><div className="banner">Couldn't load data: {error}</div></div>;
  if (!ready) return <div className="state"><div><div className="spinner" /><div className="eyebrow">Loading plan</div></div></div>;

  if (!active) {
    return (
      <div className="p4">
        <div className="empty-state" style={{ maxWidth: 480, margin: '60px auto', padding: 40 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>No diagnostics saved</div>
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            Run and save a <a href="#/diagnostic" style={{ color: 'var(--accent)' }}>Client Diagnostic</a> — the implementation plan is generated from the recommended build automatically.
          </div>
        </div>
      </div>
    );
  }

  const mods = modules(a);
  let totalTasks = 0, doneTasks = 0;
  const phases = mods.map((m) => {
    const meta = PHASE_META[m.phase] || { when: m.phase, title: m.title, horizon: '', color: 'var(--accent)' };
    const tasks = m.tasks.map((name, i) => {
      const key = `${m.phase}:${i}`;
      const cur = prog[key] || 'To do';
      totalTasks++;
      if (cur === 'Done') doneTasks++;
      return { name, key, cur, module: m.title };
    });
    const done = tasks.filter((t) => t.cur === 'Done').length;
    return { ...meta, title: `${meta.title} — ${m.title}`, tasks, done };
  });
  const donePct = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;

  return (
    <div className="p4" style={{ maxWidth: 920 }}>
      <div className="client-bar">
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: '0.02em' }}>IMPLEMENTATION PLAN</div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>RECOMMENDED BUILD → DELIVERY TASKS</div>
        </div>
        <select className="sel" style={{ width: 'auto' }} value={active} onChange={(e) => setPicked(e.target.value)} aria-label="Client">
          {names.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 22, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{active}</div>
          <div className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>{phases.length} phases · {totalTasks} tasks</div>
        </div>
        <div style={{ flex: 1, maxWidth: 280 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-2)', marginBottom: 5 }}>
            <span>Overall progress</span>
            <span className="mono" style={{ color: 'var(--ok)' }}>{donePct}%</span>
          </div>
          <div style={{ height: 9, borderRadius: 5, background: 'var(--panel)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${donePct}%`, background: 'var(--ok)', transition: 'width 0.3s' }} />
          </div>
        </div>
      </div>

      {phases.map((p) => (
        <div key={p.title} className="ev-card" style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '15px 18px', borderBottom: '1px solid var(--panel-line)', background: 'var(--panel-2)', flexWrap: 'wrap' }}>
            <span className="mono" style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em', color: '#fff', background: p.color, padding: '3px 11px', borderRadius: 20 }}>{p.when}</span>
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700 }}>{p.title}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{p.horizon}</div>
            </div>
            <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: p.done === p.tasks.length ? 'var(--ok)' : 'var(--ink-2)' }}>{p.done}/{p.tasks.length}</span>
          </div>
          {p.tasks.map((t) => (
            <div key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 18px', borderBottom: '1px solid var(--panel-line)', flexWrap: 'wrap' }}>
              <button
                onClick={() => setStatus(t.key, t.cur === 'Done' ? 'To do' : 'Done')}
                aria-label={`Toggle ${t.name}`}
                style={{
                  flex: 'none', width: 22, height: 22, borderRadius: 6, cursor: 'pointer', font: 'inherit',
                  border: `1px solid ${t.cur === 'Done' ? 'var(--ok)' : 'var(--panel-line)'}`,
                  background: t.cur === 'Done' ? 'var(--ok)' : 'transparent',
                  color: 'oklch(0.18 0.02 255)', fontSize: 12, fontWeight: 700,
                }}>{t.cur === 'Done' ? '✓' : ''}</button>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, ...(t.cur === 'Done' ? { textDecoration: 'line-through', color: 'var(--ink-3)' } : {}) }}>{t.name}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{t.module}</div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {STATUS.map((s) => (
                  <button key={s} onClick={() => setStatus(t.key, s)} aria-pressed={t.cur === s}
                    className="mono"
                    style={{
                      padding: '4px 9px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                      border: `1px solid ${t.cur === s ? ST_COLOR[s] : 'var(--panel-line)'}`,
                      background: t.cur === s ? ST_COLOR[s] : 'transparent',
                      color: t.cur === s ? 'oklch(0.18 0.02 255)' : 'var(--ink-3)',
                    }}>{s}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
