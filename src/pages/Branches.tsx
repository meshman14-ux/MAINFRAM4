/* Branches — the fleet grouped by PAL branch. One section per branch
   (plus Unassigned): each unit with its live Health / Readiness scores,
   crew target and low-stock count, linking through to its dashboard.
   Branches themselves are managed in the Console units tab. */
import { useMemo } from 'react';
import { useOpsData } from '../data/useOpsData';
import type { PalBranch, Unit } from '../data/types';
import { unitColor } from '../components/console/unitTheme';
import { gatherUnitContext, scoreUnit } from '../lib/unitAI';

const scoreCol = (v: number) => v >= 80 ? 'var(--ok)' : v >= 50 ? 'var(--warn)' : 'var(--danger)';

export default function Branches() {
  const { data, ready, error } = useOpsData();

  const groups = useMemo(() => {
    if (!ready) return [];
    const branches = data.all<PalBranch>('palBranches').sort((a, b) => a.name.localeCompare(b.name));
    const units = data.all<Unit>('units');
    const row = (u: Unit) => {
      const ctx = gatherUnitContext(data, u.id);
      const scores = ctx ? scoreUnit(ctx) : { health: 0, readiness: 0 };
      return { u, scores, low: ctx?.lowStock.length ?? 0, crew: ctx?.assignments.length ?? 0 };
    };
    const out = branches.map((b) => ({
      branch: b as PalBranch | null,
      rows: units.filter((u) => u.branchId === b.id).map(row),
    }));
    const un = units.filter((u) => !u.branchId || !branches.some((b) => b.id === u.branchId)).map(row);
    if (un.length) out.push({ branch: null, rows: un });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, data.meta().updatedAt]);

  if (error) return <div className="p4"><div className="banner">Couldn't load data: {error}</div></div>;
  if (!ready) return <div className="state"><div><div className="spinner" /><div className="eyebrow">Loading branches</div></div></div>;

  return (
    <div className="p4">
      <div className="toolbar">
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>PAL branches</h2>
        <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{groups.filter((g) => g.branch).length} branch{groups.filter((g) => g.branch).length !== 1 ? 'es' : ''}</span>
        <span style={{ flex: 1 }} />
        <a className="btn btn-ghost btn-sm" href="#/console" style={{ textDecoration: 'none' }}>Manage in Console</a>
      </div>

      {groups.length === 0 && (
        <div className="empty-state">No units yet. Branches group your fleet once units exist — add branches in the Console units tab.</div>
      )}

      {groups.map(({ branch, rows }) => {
        const avg = (k: 'health' | 'readiness') => rows.length ? Math.round(rows.reduce((s, r) => s + r.scores[k], 0) / rows.length) : 0;
        const aH = avg('health'), aR = avg('readiness');
        return (
          <section className="card" key={branch?.id ?? 'unassigned'} style={{ marginBottom: 16 }}>
            <div className="card-head">
              <div className="card-title">{branch ? branch.name : 'Unassigned'}{branch?.region ? <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}> · {branch.region}</span> : null}</div>
              <span className="row-inline" style={{ gap: 12 }}>
                <span className="mono" style={{ fontSize: 11 }}>health <b style={{ color: scoreCol(aH) }}>{aH}</b></span>
                <span className="mono" style={{ fontSize: 11 }}>readiness <b style={{ color: scoreCol(aR) }}>{aR}</b></span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{rows.length} unit{rows.length !== 1 ? 's' : ''}</span>
              </span>
            </div>
            {rows.length === 0 ? (
              <div className="muted" style={{ fontSize: 12.5 }}>No units in this branch — assign one in the unit editor.</div>
            ) : rows.map(({ u, scores, low, crew }) => (
              <a className="ov-ev" key={u.id} href={`#/unit/${u.id}`} style={{ textDecoration: 'none', ['--evc' as string]: unitColor(u.type) }}>
                <span className="ev-swatch" style={{ color: unitColor(u.type) }} />
                <span className="ov-ev-name">{u.code} · {u.name}</span>
                <span className="mono" style={{ fontSize: 11, color: scoreCol(scores.health) }}>H {scores.health}</span>
                <span className="mono" style={{ fontSize: 11, color: scoreCol(scores.readiness) }}>R {scores.readiness}</span>
                <span className="mono ov-ev-date">{crew}/{u.crew} crew{low ? ` · ${low} low` : ''}</span>
              </a>
            ))}
          </section>
        );
      })}
    </div>
  );
}
