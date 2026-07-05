import { useCallback, useEffect, useState } from "react";
import { fetchSsuInventories, InventoryEntry } from "./inventories";

interface InventoriesState {
  open: InventoryEntry[];
  own: InventoryEntry[];
  loading: boolean;
  error?: string;
}

const EMPTY: InventoriesState = { open: [], own: [], loading: false };

export function useInventories(
  storageUnitId?: string,
  characterOwnerCapId?: string,
): InventoriesState & { refetch: () => Promise<void> } {
  const [state, setState] = useState<InventoriesState>(EMPTY);

  const refetch = useCallback(async () => {
    if (!storageUnitId) {
      setState(EMPTY);
      return;
    }
    setState((previous) => ({ ...previous, loading: true, error: undefined }));
    try {
      const inventories = await fetchSsuInventories(
        storageUnitId,
        characterOwnerCapId,
      );
      setState({ ...inventories, loading: false });
    } catch (error) {
      setState((previous) => ({
        ...previous,
        loading: false,
        error:
          error instanceof Error ? error.message : "Inventory lookup failed.",
      }));
    }
  }, [storageUnitId, characterOwnerCapId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { ...state, refetch };
}
