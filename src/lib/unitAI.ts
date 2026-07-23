/* ============================================================
   unitAI.ts — assembles a unit's full context and produces its
   analysis: Health + Readiness scores, tone-coded insight chips,
   and daily/weekly/monthly summaries.

   Scores and rule-based insights are ALWAYS computed
   deterministically from the data, so the panel works with no
   model. When window.claude.complete is available it enriches the
   prose summaries (and may append extra insight bullets). Nothing
   crashes without the model.
   ============================================================ */
import type { OpsData } from '../data/opsData';
import type {
  Unit, StockLine, Assignment, DocumentRec, Task, UnitChecklist,
  EventRec, UnitInsight, UnitInsightItem,
} from '../data/types';
import { docState } from '../data/phase12';
import { CHECKLIST_KINDS } from '../data/types';

export interface UnitContext {
  unit: Unit;
  stock: StockLine[];
  lowStock: StockLine[];
  assignments: Assignment[];
  documents: DocumentRec[];
  flaggedDocs: DocumentRec[];
  tasks: Task[];
  openTasks: Task[];
  checklists: UnitChecklist[];
  events: EventRec[];
  crewTarget: number;
}

export function gatherUnitContext(data: OpsData, unitId: string): UnitContext | null {
  const unit = data.get<Unit>('units', unitId);
  if (!unit) return null;
  const stock = data.stockForUnit(unitId);
  const documents = data.all<DocumentRec>('documents').filter((d) => d.unitId === unitId);
  const tasks = data.tasksForUnit(unitId);
  const assignments = data.all<Assignment>('assignments').filter((a) => a.unitId === unitId);
  return {
    unit, stock,
    lowStock: stock.filter((s) => Number(s.qty) < Number(s.par)),
    assignments,
    documents,
    flaggedDocs: documents.filter((d) => { const s = docState(d); return s === 'expired' || s === 'expiring'; }),
    tasks,
    openTasks: tasks.filter((t) => t.status !== 'done'),
    checklists: data.unitChecklistsFor(unitId),
    events: data.eventsForUnit(unitId),
    crewTarget: unit.crew || 0,
  };
}

/** Checklist completion 0..1 across all six kinds (kinds with no items count as neutral). */
function checklistCompletion(ctx: UnitContext): { pct: number; safetyOpen: number; paperworkOpen: number } {
  let total = 0, done = 0, safetyOpen = 0, paperworkOpen = 0;
  ctx.checklists.forEach((c) => {
    c.items.forEach((i) => {
      total++; if (i.on) done++;
      if (!i.on && c.kind === 'safety') safetyOpen++;
      if (!i.on && c.kind === 'paperwork') paperworkOpen++;
    });
  });
  return { pct: total ? done / total : 0, safetyOpen, paperworkOpen };
}

export interface UnitScores { health: number; readiness: number }

/** Deterministic 0-100 scores. Health = condition (stock/docs/safety);
    Readiness = prepared-to-trade (checklists + crew + open tasks). */
export function scoreUnit(ctx: UnitContext): UnitScores {
  const cc = checklistCompletion(ctx);
  const stockPct = ctx.stock.length ? (ctx.stock.length - ctx.lowStock.length) / ctx.stock.length : 1;
  const docsPct = ctx.documents.length ? (ctx.documents.length - ctx.flaggedDocs.length) / ctx.documents.length : 1;
  const crewPct = ctx.crewTarget ? Math.min(1, ctx.assignments.length / ctx.crewTarget) : 1;

  // Health: physical/compliance condition. Safety gaps and expiring docs bite hardest.
  const health = Math.round(100 * (
    0.35 * stockPct +
    0.30 * docsPct +
    0.25 * (cc.safetyOpen === 0 ? 1 : Math.max(0, 1 - cc.safetyOpen / 5)) +
    0.10 * (ctx.openTasks.length === 0 ? 1 : Math.max(0, 1 - ctx.openTasks.length / 8))
  ));

  // Readiness: prepared to trade. Crew coverage dominates — an unstaffed unit is
  // never "ready" regardless of how complete its checklists are — then checklist
  // completion, then no paperwork gaps, then stock.
  const readiness = Math.round(100 * (
    0.45 * crewPct +
    0.30 * cc.pct +
    0.15 * (cc.paperworkOpen === 0 ? 1 : Math.max(0, 1 - cc.paperworkOpen / 5)) +
    0.10 * stockPct
  ));

  return { health: clamp(health), readiness: clamp(readiness) };
}
const clamp = (n: number) => Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0));

/** Rule-based insight chips — always available, model or not. */
export function ruleInsights(ctx: UnitContext): UnitInsightItem[] {
  const out: UnitInsightItem[] = [];
  const cc = checklistCompletion(ctx);
  if (cc.safetyOpen > 0) out.push({ kind: 'safety', tone: 'danger', title: `${cc.safetyOpen} safety item${cc.safetyOpen !== 1 ? 's' : ''} unchecked`, detail: 'Complete the safety checklist before trading.' });
  if (ctx.flaggedDocs.length > 0) out.push({ kind: 'compliance', tone: 'danger', title: `${ctx.flaggedDocs.length} document${ctx.flaggedDocs.length !== 1 ? 's' : ''} expired/expiring`, detail: ctx.flaggedDocs.map((d) => d.title).slice(0, 3).join(', ') });
  if (cc.paperworkOpen > 0) out.push({ kind: 'paperwork', tone: 'warn', title: `${cc.paperworkOpen} paperwork item${cc.paperworkOpen !== 1 ? 's' : ''} outstanding` });
  if (ctx.lowStock.length > 0) out.push({ kind: 'stock', tone: 'warn', title: `${ctx.lowStock.length} stock line${ctx.lowStock.length !== 1 ? 's' : ''} below par`, detail: ctx.lowStock.map((s) => s.item).slice(0, 3).join(', ') });
  if (ctx.crewTarget && ctx.assignments.length < ctx.crewTarget) out.push({ kind: 'staff', tone: 'warn', title: `Crew short (${ctx.assignments.length}/${ctx.crewTarget})`, detail: 'Open a callout to fill the gap.' });
  if (ctx.openTasks.length > 0) out.push({ kind: 'tasks', tone: 'info', title: `${ctx.openTasks.length} open task${ctx.openTasks.length !== 1 ? 's' : ''}` });
  if (ctx.checklists.length === 0) out.push({ kind: 'setup', tone: 'info', title: 'No checklists seeded yet', detail: 'Seed the default lists for this unit type to start tracking readiness.' });
  if (out.length === 0) out.push({ kind: 'clear', tone: 'ok', title: 'No issues detected', detail: 'Stock at par, docs in date, checklists complete.' });
  return out;
}

function fallbackSummaries(ctx: UnitContext, s: UnitScores): { daily: string; weekly: string; monthly: string } {
  const name = `${ctx.unit.code} · ${ctx.unit.name}`;
  const issues = ruleInsights(ctx).filter((i) => i.tone !== 'ok').map((i) => i.title);
  const head = `${name} — health ${s.health}%, readiness ${s.readiness}%.`;
  return {
    daily: `${head} ${issues.length ? 'Today: ' + issues.slice(0, 3).join('; ') + '.' : 'No blockers for today.'}`,
    weekly: `${head} ${ctx.events.length} linked event${ctx.events.length !== 1 ? 's' : ''}. ${issues.length ? 'This week, clear: ' + issues.join('; ') + '.' : 'On track this week.'}`,
    monthly: `${head} Trend depends on keeping stock at par, documents in date and checklists complete. ${ctx.flaggedDocs.length ? 'Renew flagged documents this month.' : 'No document renewals due.'}`,
  };
}

/** Compose the LLM prompt from the context (used when window.claude exists). */
export function buildPrompt(ctx: UnitContext, s: UnitScores): string {
  const c = ctx;
  const lines = [
    `Unit: ${c.unit.code} "${c.unit.name}" (type ${c.unit.type}, crew target ${c.crewTarget}).`,
    `Scores (computed): health ${s.health}/100, readiness ${s.readiness}/100.`,
    `Stock: ${c.stock.length} lines, ${c.lowStock.length} below par${c.lowStock.length ? ' (' + c.lowStock.map((x) => x.item).slice(0, 5).join(', ') + ')' : ''}.`,
    `Documents: ${c.documents.length}, ${c.flaggedDocs.length} expired/expiring.`,
    `Checklists: ${c.checklists.map((cl) => `${cl.kind} ${cl.items.filter((i) => i.on).length}/${cl.items.length}`).join(', ') || 'none seeded'}.`,
    `Crew assigned: ${c.assignments.length}/${c.crewTarget}. Open tasks: ${c.openTasks.length}. Linked events: ${c.events.length}.`,
  ];
  return `You are an operations analyst for a mobile festival-catering unit. Given this unit's data, write three short plain-English summaries — DAILY (what to do today), WEEKLY (what to sort this week), MONTHLY (the trend and what to plan). Be concrete and specific to the data; under 60 words each. Then optionally add up to 3 extra INSIGHT bullets prefixed "INSIGHT:". Data:\n${lines.join('\n')}`;
}

/**
 * Analyse a unit. Always returns scores + rule insights; enriches the
 * summaries via window.claude.complete when present. Returns the fields for a
 * mf_unit_insights row (caller persists via data.save('unitInsights', …)).
 */
export async function analyzeUnit(data: OpsData, unitId: string): Promise<Omit<UnitInsight, 'id'> | null> {
  const ctx = gatherUnitContext(data, unitId);
  if (!ctx) return null;
  const scores = scoreUnit(ctx);
  const insights = ruleInsights(ctx);
  let { daily, weekly, monthly } = fallbackSummaries(ctx, scores);

  try {
    const claude = (window as any).claude;
    if (claude?.complete) {
      const text: string = await claude.complete({
        system: 'You are a concise UK mobile-catering operations analyst. Be specific and practical.',
        messages: [{ role: 'user', content: buildPrompt(ctx, scores) }],
      });
      const parsed = parseSummaries(text || '');
      if (parsed.daily) daily = parsed.daily;
      if (parsed.weekly) weekly = parsed.weekly;
      if (parsed.monthly) monthly = parsed.monthly;
      parsed.extraInsights.forEach((title) => insights.push({ kind: 'ai', tone: 'info', title }));
    }
  } catch { /* keep deterministic summaries */ }

  return {
    unitId,
    generatedAt: new Date().toISOString(),
    healthScore: scores.health,
    readinessScore: scores.readiness,
    insights,
    summaryDaily: daily,
    summaryWeekly: weekly,
    summaryMonthly: monthly,
  };
}

/** Best-effort parse of the model's DAILY/WEEKLY/MONTHLY + INSIGHT lines. */
export function parseSummaries(text: string): { daily?: string; weekly?: string; monthly?: string; extraInsights: string[] } {
  const grab = (label: string) => {
    const m = new RegExp(`${label}\\s*[:\\-]?\\s*([\\s\\S]*?)(?=\\n\\s*(?:DAILY|WEEKLY|MONTHLY|INSIGHT)\\b|$)`, 'i').exec(text);
    return m ? m[1].trim().replace(/\s+/g, ' ') : undefined;
  };
  const extraInsights = [...text.matchAll(/INSIGHT\s*[:\-]\s*(.+)/gi)].map((m) => m[1].trim()).slice(0, 3);
  return { daily: grab('DAILY'), weekly: grab('WEEKLY'), monthly: grab('MONTHLY'), extraInsights };
}

export const ALL_CHECKLIST_KINDS = CHECKLIST_KINDS;
