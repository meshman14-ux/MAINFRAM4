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

let loadStarted = false;

export interface UseOpsData {
  data: OpsData;
  ready: boolean;
  error: string | null;
}

export function useOpsData(): UseOpsData {
  const [error, setError] = useState<string | null>(null);

  // Kick the initial load exactly once across the whole app.
  useEffect(() => {
    if (loadStarted) return;
    loadStarted = true;
    opsData.load().catch((e) => setError(String(e?.message || e)));
  }, []);

  // Re-render whenever the store emits.
  const ready = useSyncExternalStore(
    (cb) => opsData.subscribe(cb),
    () => opsData.isReady(),
    () => false
  );

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
