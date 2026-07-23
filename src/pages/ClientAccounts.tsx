/* Client Accounts — ported from prototype-export/Client Accounts.dc.html.
   Account gallery for operators under audit: intake progress (43-field
   diagnostic), health score, and live ops KPIs where an account matches a
   real mf_clients row. Accounts + diagnostics live in kv (mf_kv), exactly
   like the prototype's kvGet/kvSet — no schema change needed. */
import { useMemo, useState } from 'react';
import { useOpsData } from '../data/useOpsData';
import type { Client } from '../data/types';

type Accounts = Record<string, { created: number }>;
type Diagnostic = Record<string, unknown>;
type Diagnostics = Record<string, Diagnostic>;

const FIELD_TOTAL = 43;

function answered(v: unknown): boolean {
  return Array.isArray(v) ? v.length > 0 : !!(v && String(v).trim());
}

/* Health score — verbatim port of the prototype's weighting. */
function score(a: Diagnostic): number {
  let s = 100;
  const d = (c: boolean) => { if (c) s -= 16; };
  const w = (c: boolean) => { if (c) s -= 8; };
  const docs = (a.docs_tracked as string[]) || [];
  d(a.records === 'Paper folder' || a.records === 'Someone’s head');
  d(docs.includes('None tracked centrally'));
  d(a.rtw === 'No' || a.rtw === 'Partially');
  d(a.double_booking === 'Often' || a.double_booking === 'Sometimes');
  d(a.key_person === 'Owner does everything');
  d(a.deadlines === 'Regularly');
  w(a.scheduling === 'WhatsApp / texts' || a.scheduling === 'Phone calls');
  w(a.payroll === 'Manual from memory / notes');
  w(a.profit_visibility === 'No' || a.profit_visibility === 'Roughly');
  return Math.max(15, s);
}

function initials(n: string): string {
  return n.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase();
}

const fmt = (iso?: string) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';

export default function ClientAccounts() {
  const { data, ready, error } = useOpsData();
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const model = useMemo(() => {
    if (!ready) return null;
    const acc = data.kvGet<Accounts>('accounts') || {};
    const diag = data.kvGet<Diagnostics>('diagnostics') || {};
    const clients = data.all<Client>('clients');
    const clientByName = new Map(clients.map((c) => [(c.name || '').trim().toLowerCase(), c]));
    // Union: kv accounts ∪ diagnostic subjects ∪ real operator clients.
    const names = Array.from(new Set([
      ...Object.keys(acc), ...Object.keys(diag), ...clients.map((c) => c.name),
    ])).filter(Boolean).sort((a, b) => a.localeCompare(b));

    const todayISO = new Date().toISOString().slice(0, 10);
    let sumUnits = 0, sumUpcoming = 0;

    const accounts = names.map((name) => {
      const a = diag[name] || {};
      const cl = clientByName.get(name.trim().toLowerCase()) || null;
      let units = 0, upcoming = 0, crew = 0, nextLine = 'No upcoming events';
      if (cl) {
        units = data.unitsForClient(cl.id).length;
        const up = data.eventsForClient(cl.id)
          .filter((e) => (e.start || e.end || '') >= todayISO)
          .sort((x, y) => (x.start || '').localeCompare(y.start || ''));
        upcoming = up.length;
        crew = data.staffForClient(cl.id).length;
        if (up.length) nextLine = `${up[0].name || 'Event'}${up[0].start ? ` · ${fmt(up[0].start)}` : ''}`;
      }
      sumUnits += units; sumUpcoming += upcoming;

      const answeredN = Object.keys(a).filter((k) => answered(a[k])).length;
      const has = answeredN > 0;
      const sc = has ? score(a) : null;
      const pct = Math.round((answeredN / FIELD_TOTAL) * 100);
      const status = answeredN >= FIELD_TOTAL ? 'Complete' : has ? 'In progress' : 'Not started';
      const statusColor = answeredN >= FIELD_TOTAL ? 'var(--ok)' : has ? 'var(--warn)' : 'var(--ink-3)';
      const bits = [a.operator_type, a.region].filter(Boolean) as string[];
      return {
        name, client: cl, meta: bits.length ? bits.join(' · ') : 'No profile yet',
        status, statusColor, pct,
        pctColor: pct >= 100 ? 'var(--ok)' : pct > 0 ? 'var(--warn)' : 'var(--panel-line)',
        completion: `${answeredN}/${FIELD_TOTAL}`,
        units, upcoming, crew, nextLine,
        score: sc, scoreColor: sc == null ? 'var(--ink-3)' : sc >= 75 ? 'var(--ok)' : sc >= 50 ? 'var(--warn)' : 'var(--danger)',
      };
    });

    const diagnosed = accounts.filter((x) => x.score != null).length;
    return {
      accounts,
      stats: [
        { label: 'Total accounts', value: String(accounts.length), sub: 'operators on file', color: 'var(--ink)' },
        { label: 'Units / trailers', value: String(sumUnits), sub: 'across all accounts', color: 'var(--ink)' },
        { label: 'Upcoming events', value: String(sumUpcoming), sub: 'booked ahead', color: sumUpcoming ? 'var(--accent-2)' : 'var(--ink-3)' },
        { label: 'Diagnosed', value: String(diagnosed), sub: 'have a diagnostic started', color: 'var(--accent)' },
        { label: 'Awaiting intake', value: String(accounts.length - diagnosed), sub: 'no diagnostic yet', color: accounts.length - diagnosed ? 'var(--warn)' : 'var(--ok)' },
      ],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, data.meta().updatedAt]);

  async function addAccount() {
    const n = draft.trim();
    if (!n || saving) return;
    const acc = data.kvGet<Accounts>('accounts') || {};
    if (acc[n]) { setDraft(''); return; }
    setSaving(true);
    try {
      await data.kvSet('accounts', { ...acc, [n]: { created: Date.now() } });
      setDraft('');
    } finally {
      setSaving(false);
    }
  }

  if (error) return <div className="p4"><div className="banner">Couldn't load data: {error}</div></div>;
  if (!ready || !model) return <div className="state"><div><div className="spinner" /><div className="eyebrow">Loading accounts</div></div></div>;

  return (
    <div className="p4" style={{ maxWidth: 1080 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap', marginBottom: 28 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div className="eyebrow">MAINFRAME · CLIENT ACCOUNTS</div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: '7px 0 0', letterSpacing: '-0.01em' }}>Client accounts</h1>
          <p style={{ fontSize: 14, color: 'var(--ink-2)', marginTop: 6, maxWidth: 560, lineHeight: 1.6 }}>
            Every operator you audit has their own account. Open one to run its diagnostic, generate the report, and build the proposal and plan.
          </p>
        </div>
        <div className="row-inline">
          <input
            className="inp" style={{ width: 230 }}
            value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addAccount(); }}
            placeholder="New client business name…" aria-label="New client business name"
          />
          <button className="btn btn-primary" onClick={addAccount} disabled={!draft.trim() || saving}>
            {saving ? 'Adding…' : '+ Add account'}
          </button>
        </div>
      </div>

      <div className="kpi-row">
        {model.stats.map((s) => (
          <div className="kpi-chip" key={s.label} style={{ flex: '1 1 160px' }}>
            <div className="k">{s.label}</div>
            <div className="v" style={{ color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginTop: 3 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="ev-label" style={{ marginBottom: 13 }}>Accounts</div>
      {model.accounts.length === 0 ? (
        <div className="empty-state">No accounts yet — add the first operator above.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 16 }}>
          {model.accounts.map((c) => {
            const body = (
              <>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div className="mono" style={{
                    width: 40, height: 40, flex: 'none', borderRadius: 10, background: 'var(--panel-2)',
                    border: '1px solid var(--panel-line)', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontWeight: 600, fontSize: 14, color: 'var(--accent)',
                  }}>{initials(c.name)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>{c.name}</div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 3 }}>{c.meta}</div>
                  </div>
                  <span className="chip" style={{ color: c.statusColor, flex: 'none' }}>{c.status}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[
                    { label: 'Units', value: c.units, color: 'var(--ink)' },
                    { label: 'Upcoming', value: c.upcoming, color: c.upcoming ? 'var(--accent-2)' : 'var(--ink-3)' },
                    { label: 'Crew', value: c.crew, color: 'var(--ink)' },
                  ].map((o) => (
                    <div key={o.label} style={{
                      flex: 1, background: 'var(--panel-2)', border: '1px solid var(--panel-line)',
                      borderRadius: 9, padding: '8px 6px', textAlign: 'center',
                    }}>
                      <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: o.color }}>{o.value}</div>
                      <div className="ev-label" style={{ fontSize: 9, marginTop: 2 }}>{o.label}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>
                  <span className="ev-label">Next </span>{c.nextLine}
                </div>
                <div style={{ height: 6, borderRadius: 4, background: 'var(--bg)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${c.pct}%`, background: c.pctColor }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>{c.completion} intake</span>
                  <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: c.scoreColor }}>{c.score ?? '—'}</span>
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent-2)', marginTop: 'auto' }}>Open diagnostic →</div>
              </>
            );
            const cardStyle = { display: 'flex', flexDirection: 'column' as const, gap: 14, textDecoration: 'none', color: 'inherit' };
            return (
              <a className="ev-card" key={c.name} href={`#/diagnostic/${encodeURIComponent(c.name)}`} style={cardStyle}>{body}</a>
            );
          })}
        </div>
      )}
    </div>
  );
}
