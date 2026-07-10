import { useCallback, useEffect, useRef, useState } from "react";
import { fetchUnitState, UnitState } from "./unitState";
import { fetchDemoUnitState } from "./demo";

const POLL_MS = 8000;

interface UnitStateHook {
  state?: UnitState;
  loading: boolean;
  error?: string;
  refetch: () => Promise<void>;
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
  const inflight = useRef(false);

  const refetch = useCallback(async () => {
    if (demo) {
      setState(fetchDemoUnitState());
      setError(undefined);
      return;
    }
    if (!storageUnitId || inflight.current) return;
    inflight.current = true;
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
      inflight.current = false;
      setLoading(false);
    }
  }, [storageUnitId, characterOwnerCapId, demo]);

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
