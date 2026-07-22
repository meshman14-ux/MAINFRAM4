/* Phase 8 — Sales Pipeline (CRM) tests. Ported behaviour from the
   Pipeline.dc.html prototype, with two deliberate improvements flagged
   in comments: reopening a lost lead remembers its real prior stage
   (not a fixed one), and booking a job auto-advances the entry to 'won'. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/lib/supabase', () => {
  const ok = { data: null, error: null };
  const chain: any = {
    select: () => ({
      eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
    }),
    upsert: () => Promise.resolve(ok),
    delete: () => ({ eq: () => Promise.resolve(ok) }),
  };
  return {
    supabase: {
      from: () => chain,
      channel: () => ({ on: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }), subscribe: () => ({}) }),
    },
  };
});

import { OpsData } from '../src/data/opsData';
import type { OpsState } from '../src/data/types';

function seed(): OpsState {
  return {
    meta: { version: 1, updatedAt: Date.now() },
    clients: { C001: { id: 'C001', name: 'JP Events', status: 'Active' } },
    events: {}, units: {}, staff: {}, assignments: {}, stock: {}, applications: {},
    kv: {}, certs: {}, availability: {}, pipeline: {},
  };
}

function store(): OpsData {
  const d = new OpsData();
  // @ts-expect-error inject mirror
  d.db = seed();
  return d;
}

describe('adding leads', () => {
  let d: OpsData;
  beforeEach(() => { d = store(); });

  it('adds a new lead at stage "lead"', async () => {
    const e = await d.addLead('Coastal Kitchen');
    expect(e).not.toBeNull();
    expect(e!.stage).toBe('lead');
    expect(d.pipelineEntries()).toHaveLength(1);
  });

  it('is a case-insensitive no-op for a name already tracked', async () => {
    await d.addLead('Coastal Kitchen');
    const dup = await d.addLead('  coastal kitchen ');
    expect(dup).toBeNull();
    expect(d.pipelineEntries()).toHaveLength(1);
  });

  it('ignores blank input', async () => {
    const e = await d.addLead('   ');
    expect(e).toBeNull();
    expect(d.pipelineEntries()).toHaveLength(0);
  });
});

describe('moving through the funnel', () => {
  let d: OpsData;
  let id: string;
  beforeEach(async () => {
    d = store();
    const e = await d.addLead('Coastal Kitchen');
    id = e!.id;
  });

  it('moves forward one stage at a time', async () => {
    await d.moveStage(id, 1);
    expect(d.pipelineEntries()[0].stage).toBe('contacted');
    await d.moveStage(id, 1);
    expect(d.pipelineEntries()[0].stage).toBe('diagnostic');
  });

  it('moves backward and clamps at "lead"', async () => {
    await d.moveStage(id, -1);
    expect(d.pipelineEntries()[0].stage).toBe('lead'); // can't go below lead
  });

  it('clamps forward at "won" (does not fall off the funnel)', async () => {
    for (let i = 0; i < 10; i++) await d.moveStage(id, 1);
    expect(d.pipelineEntries()[0].stage).toBe('won');
  });
});

describe('lost / reopen (improved over the prototype)', () => {
  let d: OpsData;
  let id: string;
  beforeEach(async () => {
    d = store();
    const e = await d.addLead('Coastal Kitchen');
    id = e!.id;
    await d.moveStage(id, 1); // -> contacted
    await d.moveStage(id, 1); // -> diagnostic
  });

  it('marking lost remembers the exact prior stage', async () => {
    await d.toggleLost(id);
    const e = d.pipelineEntries()[0];
    expect(e.stage).toBe('lost');
    expect(e.priorStage).toBe('diagnostic');
  });

  it('reopening restores the exact remembered stage, not a fixed one', async () => {
    await d.toggleLost(id);   // lost, priorStage=diagnostic
    await d.toggleLost(id);   // reopen
    const e = d.pipelineEntries()[0];
    expect(e.stage).toBe('diagnostic'); // NOT 'proposal' (prototype's quirk) or 'lead'
    expect(e.priorStage).toBeUndefined();
  });

  it('moveStage is a no-op while lost', async () => {
    await d.toggleLost(id);
    await d.moveStage(id, 1);
    expect(d.pipelineEntries()[0].stage).toBe('lost');
  });
});

describe('booking a job (won flow)', () => {
  let d: OpsData;
  beforeEach(() => { d = store(); });

  it('creates a NEW client when the name does not match an existing one', async () => {
    const { client, event } = await d.bookJob('Coastal Kitchen', {
      name: 'Harbour Wedding', loc: 'Padstow', start: '2026-08-08',
    });
    expect(client.name).toBe('Coastal Kitchen');
    expect(event.clientId).toBe(client.id);
    expect(d.all('clients').some((c: any) => c.id === client.id)).toBe(true);
  });

  it('resolves to an EXISTING client by case-insensitive name match', async () => {
    const { client } = await d.bookJob('jp events', {
      name: 'Latitude', start: '2026-07-23',
    });
    expect(client.id).toBe('C001'); // matched the seeded client, no duplicate created
    expect(d.all('clients')).toHaveLength(1);
  });

  it('links and auto-advances a matching pipeline entry to "won"', async () => {
    const lead = await d.addLead('Coastal Kitchen');
    await d.moveStage(lead!.id, 1); // -> contacted, to prove it jumps straight to won
    const { client } = await d.bookJob('Coastal Kitchen', { name: 'Harbour Wedding', start: '2026-08-08' });
    const entry = d.pipelineEntries().find((e) => e.id === lead!.id)!;
    expect(entry.stage).toBe('won');
    expect(entry.clientId).toBe(client.id);
  });

  it('does not touch the pipeline stage when advanceToWon is disabled', async () => {
    const lead = await d.addLead('Coastal Kitchen');
    await d.bookJob('Coastal Kitchen', { name: 'Harbour Wedding', start: '2026-08-08' }, { advanceToWon: false });
    const entry = d.pipelineEntries().find((e) => e.id === lead!.id)!;
    expect(entry.stage).toBe('lead'); // untouched, matching strict prototype fidelity
  });

  it('booking with no matching pipeline entry does not create one', async () => {
    await d.bookJob('Nobody Tracked', { name: 'Some Job', start: '2026-09-01' });
    expect(d.pipelineEntries()).toHaveLength(0);
  });
});

describe('pipeline summary', () => {
  it('sums open value, won value, and computes win rate from closed deals only', async () => {
    const d = store();
    const a = await d.addLead('A'); await d.updatePipelineValue(a!.id, 1000);
    const b = await d.addLead('B'); await d.updatePipelineValue(b!.id, 2000);
    await d.moveStage(b!.id, 4); // -> won
    const c = await d.addLead('C'); await d.updatePipelineValue(c!.id, 500);
    await d.toggleLost(c!.id);   // -> lost

    const s = d.pipelineSummary();
    expect(s.openValue).toBe(1000);      // only A is still open
    expect(s.wonValue).toBe(2000);       // B
    expect(s.winRatePct).toBe(50);       // 1 won / (1 won + 1 lost)
  });

  it('win rate is null when nothing has closed yet', async () => {
    const d = store();
    await d.addLead('A');
    expect(d.pipelineSummary().winRatePct).toBeNull();
  });
});
