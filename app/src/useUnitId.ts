import { useEffect, useState } from "react";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { firstString } from "./objectReaders";
import type { SmartObjectState } from "./types";
import { resolveItemIdToObjectId } from "./unitState";
import type { UrlContext } from "./urlContext";

/**
 * Resolves the storage unit's object id from, in order: an explicit URL
 * param, the dapp-kit's assembly lookup, or our own derivation from the
 * ?itemId=&tenant= pair the in-game browser appends.
 */
export function useUnitId(
  urlContext: UrlContext,
  smartObject: SmartObjectState,
): string | undefined {
  const direct =
    urlContext.storageUnitId ||
    firstString(smartObject.assembly, ["id", "objectId", "address"]);

  const [derived, setDerived] = useState<string>();

  useEffect(() => {
    if (direct || derived || !urlContext.itemId) return;
    const itemId = urlContext.itemId.trim();

    // Some dApps put the object id itself in itemId; accept that too.
    if (/^0x[0-9a-fA-F]{40,64}$/.test(itemId)) {
      setDerived(normalizeSuiAddress(itemId));
      return;
    }
    if (!/^\d+$/.test(itemId)) return;

    let cancelled = false;
    void resolveItemIdToObjectId(itemId, urlContext.tenant || "stillness")
      .then((objectId) => {
        if (!cancelled) setDerived(objectId);
      })
      .catch(() => {
        // Leave unresolved; the dapp-kit path may still land.
      });
    return () => {
      cancelled = true;
    };
  }, [direct, derived, urlContext.itemId, urlContext.tenant]);

  return direct || derived;
}
