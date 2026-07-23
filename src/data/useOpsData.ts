/* ============================================================
   useOpsData — the one shared data hook.
   ------------------------------------------------------------
   Every module calls this. It:
     - triggers the initial load() once,
     - subscribes to the store, re-rendering on any change
       (local write OR realtime event from another device),
     - returns the store instance so components call the exact
       same methods the prototype used (all/get/save/… + helpers).

   This is the React equivalent of the prototype's
   "subscribe(render)" wiring.
   ============================================================ */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { opsData, OpsData } from './opsData';

export interface UseOpsData {
  data: OpsData;
  ready: boolean;
  error: string | null;
}

export function useOpsData(): UseOpsData {
  const [error, setError] = useState<string | null>(null);

  // Re-render whenever the store emits (local write or realtime).
  const ready = useSyncExternalStore(
    (cb) => opsData.subscribe(cb),
    () => opsData.isReady(),
    () => false
  );

  // Trigger load whenever the store isn't ready. load() is idempotent (its own
  // guard), so this no-ops once loaded — but after sign-out reset() flips
  // ready→false, so the next authed page reloads fresh for the new session.
  useEffect(() => {
    if (!ready) opsData.load().catch((e) => setError(String(e?.message || e)));
  }, [ready]);

  return { data: opsData, ready, error };
}

/**
 * Convenience selector hook: recompute a derived value whenever the
 * store changes. Keeps components tidy — e.g.
 *   const gaps = useOpsSelector(d => computeCrewGaps(d));
 */
export function useOpsSelector<T>(selector: (d: OpsData) => T): T {
  const subscribe = (cb: () => void) => opsData.subscribe(cb);
  const snapshot = () => selector(opsData);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
