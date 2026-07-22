import { useMemo, useState } from 'react';
import { useOpsData } from '../data/useOpsData';
import type { PipelineEntry, PipelineStage } from '../data/types';
import { PIPELINE_FUNNEL } from '../data/types';

const STAGE_META: Record<PipelineStage, { label: string; color: string }> = {
  lead: { label: 'Lead', color: 'var(--ink-3)' },
  contacted: { label: 'Contacted', color: 'var(--blue)' },
  diagnostic: { label: 'Diagnostic', color: 'var(--violet)' },
  proposal: { label: 'Proposal Sent', color: 'var(--amber)' },
  won: { label: 'Won', color: 'var(--green)' },
  lost: { label: 'Lost', color: 'var(--red)' },
};
const BOARD_STAGES: PipelineStage[] = ['lead', 'contacted', 'diagnostic', 'proposal', 'won', 'lost'];
const gbp = (n: number) => n >= 1000 ? `£${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k` : `£${n}`;

export default function Pipeline() {
  const { data, ready, error } = useOpsData();
  const [draft, setDraft] = useState('');
  const [booking, setBooking] = useState<PipelineEntry | null>(null);
  const [banner, setBanner] = useState<{ client: string; event: string } | null>(null);

  const entries = useMemo(
    () => data.pipelineEntries(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, data.meta().updatedAt]
  );
  const summary = useMemo(
    () => data.pipelineSummary(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, data.meta().updatedAt]
  );

  if (error) return <div className="p4"><div className="banner">Couldn't load data: {error}</div></div>;
  if (!ready) return <div className="state"><div><div className="spinner" /><div className="eyebrow">Loading pipeline</div></div></div>;

  async function addLead() {
    if (!draft.trim()) return;
    await data.addLead(draft);
    setDraft('');
  }

  const columns = BOARD_STAGES.map((stage) => {
    const cards = entries.filter((e) => e.stage === stage);
    const value = cards.reduce((s, c) => s + (c.value || 0), 0);
    return { stage, cards, value };
  });

  return (
    <div className="p4">
      <div className="toolbar">
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>Sales pipeline</h2>
      </div>

      <div className="pipe-toolbar">
        <div className="pipe-add">
          <input
            className="inp" placeholder="Add a lead…" value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addLead(); }}
          />
          <button className="btn btn-primary btn-sm" onClick={addLead} disabled={!draft.trim()}>Add</button>
        </div>
        <div className="pipe-stats">
          <div><span className="k">Open pipeline</span>{gbp(summary.openValue)}</div>
          <div><span className="k">Won</span>{gbp(summary.wonValue)}</div>
          <div><span className="k">Win rate</span>{summary.winRatePct === null ? '—' : `${summary.winRatePct}%`}</div>
        </div>
      </div>

      {banner && (
        <div className="warn-banner" style={{ background: 'color-mix(in oklab, var(--green) 10%, var(--panel))', borderColor: 'color-mix(in oklab, var(--green) 40%, var(--panel-line))' }}>
          <span style={{ color: 'var(--green)' }}>✓ Booked {banner.event} for {banner.client}.</span>{' '}
          <a href="#/console" style={{ color: 'var(--accent)' }}>Open in Console →</a>
        </div>
      )}

      <div className="pipe-board">
        {columns.map(({ stage, cards, value }) => (
          <div className="pipe-col" key={stage}>
            <div className="pipe-col-head">
              <span className="pipe-col-dot" style={{ ['--stagec' as string]: STAGE_META[stage].color }} />
              <span className="pipe-col-label">{STAGE_META[stage].label}</span>
              <span className="pipe-col-count">{cards.length}</span>
            </div>
            {value > 0 && <span className="pipe-col-value">{gbp(value)}</span>}
            {cards.length === 0 ? (
              <div className="pipe-empty-col">Empty</div>
            ) : (
              cards.map((c) => (
                <PipelineCard key={c.id} entry={c} data={data} onBook={() => setBooking(c)} />
              ))
            )}
          </div>
        ))}
      </div>

      {booking && (
        <BookJobModal
          entry={booking}
          data={data}
          onClose={() => setBooking(null)}
          onBooked={(client, event) => { setBanner({ client, event }); setBooking(null); }}
        />
      )}
    </div>
  );
}

function PipelineCard({ entry, data, onBook }: {
  entry: PipelineEntry; data: ReturnType<typeof useOpsData>['data']; onBook: () => void;
}) {
  const idx = PIPELINE_FUNNEL.indexOf(entry.stage);
  const isLost = entry.stage === 'lost';
  const isWon = entry.stage === 'won';

  return (
    <div className="pipe-card">
      <div className="pc-top">
        <span className="pc-name">{entry.name}</span>
      </div>
      <input
        className="inp pc-value" placeholder="Deal value, e.g. 5000"
        type="number" value={entry.value ?? ''}
        onChange={(e) => data.updatePipelineValue(entry.id, e.target.value ? Number(e.target.value) : undefined)}
      />
      <input
        className="inp pc-next" placeholder="Next step…"
        value={entry.nextStep ?? ''}
        onChange={(e) => data.updatePipelineNextStep(entry.id, e.target.value)}
      />
      <div className="pipe-card-actions">
        {!isLost && (
          <>
            <button className="pipe-arrow" onClick={() => data.moveStage(entry.id, -1)} disabled={idx <= 0} title="Move back">‹</button>
            <button className="pipe-arrow" onClick={() => data.moveStage(entry.id, 1)} disabled={idx >= PIPELINE_FUNNEL.length - 1} title="Move forward">›</button>
            {!isWon && <button className="pipe-arrow job" onClick={onBook} title="Book a job">+Job</button>}
          </>
        )}
        {isWon && <button className="pipe-arrow job" onClick={onBook} title="Book another job">+Job</button>}
        <button className="pipe-arrow danger" onClick={() => data.toggleLost(entry.id)} title={isLost ? 'Reopen' : 'Mark lost'}>
          {isLost ? '↺' : '✕'}
        </button>
      </div>
    </div>
  );
}

function BookJobModal({ entry, data, onClose, onBooked }: {
  entry: PipelineEntry;
  data: ReturnType<typeof useOpsData>['data'];
  onClose: () => void;
  onBooked: (client: string, event: string) => void;
}) {
  const [name, setName] = useState('');
  const [loc, setLoc] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [callTime, setCallTime] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const existing = data.all<{ name: string }>('clients').find(
    (c) => c.name.trim().toLowerCase() === entry.name.trim().toLowerCase()
  );
  const valid = !!(name.trim() && start);

  async function save() {
    if (!valid) return;
    setBusy(true);
    const { client, event } = await data.bookJob(entry.name, { name: name.trim(), loc, start, end, callTime, notes });
    setBusy(false);
    onBooked(client.name, event.name);
  }

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <div className="card-head">
        <div className="card-title">Book a job for {entry.name}</div>
      </div>
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
        {existing ? 'Existing operator — job added to their account.' : 'New operator — will be created on save.'}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label>Event / job name *<input className="inp" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Location<input className="inp" value={loc} onChange={(e) => setLoc(e.target.value)} /></label>
        <label>Start date *<input className="inp" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label>End date<input className="inp" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
        <label>Crew call<input className="inp" type="time" value={callTime} onChange={(e) => setCallTime(e.target.value)} /></label>
        <label>Notes<input className="inp" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      </div>
      <div className="row-inline" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={!valid || busy}>
          {busy ? 'Booking…' : 'Book job'}
        </button>
      </div>
    </div>
  );
}
