import { useCallback, useEffect, useRef, useState } from "react";
import { fetchUnitState, UnitState } from "./unitState";
import { fetchDemoUnitState } from "./demo";

const POLL_MS = 8000;

interface RefetchOptions {
  /**
   * Guarantee a read that STARTS after this call. Without it, a call while a
   * poll is in flight just joins that poll, whose result may predate a
   * transaction that has just landed.
   */
  fresh?: boolean;
}

interface UnitStateHook {
  state?: UnitState;
  loading: boolean;
  error?: string;
  refetch: (options?: RefetchOptions) => Promise<void>;
}

/**
 * Loads the unit + inventories, then keeps them fresh with a light poll so
 * in-game drags (deposits/withdrawals) show up without a manual refresh.
 */
export function useUnitState(
  storageUnitId?: string,
  characterOwnerCapId?: string,
  demo = false,
): UnitStateHook {
  const [state, setState] = useState<UnitState>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const inflight = useRef<Promise<void>>(undefined);

  const read = useCallback(async () => {
    if (!storageUnitId) return;
    setLoading(true);
    try {
      const next = await fetchUnitState(storageUnitId, characterOwnerCapId);
      setState(next);
      setError(undefined);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not read the unit.",
      );
    } finally {
      setLoading(false);
    }
  }, [storageUnitId, characterOwnerCapId]);

  const refetch = useCallback(
    async (options?: RefetchOptions) => {
      if (demo) {
        setState(fetchDemoUnitState());
        setError(undefined);
        return;
      }
      const running = inflight.current;
      if (running) {
        if (!options?.fresh) return running;
        await running;
        // A read started after `running` finished also postdates this call.
        if (inflight.current) return inflight.current;
      }
      const job = read().finally(() => {
        if (inflight.current === job) inflight.current = undefined;
      });
      inflight.current = job;
      return job;
    },
    [demo, read],
  );

  useEffect(() => {
    void refetch();
    if (demo) return;
    const timer = setInterval(() => {
      if (!document.hidden) void refetch();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [refetch, demo]);

  return { state, loading, error, refetch };
}
