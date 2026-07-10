export interface UrlContext {
  tenant?: string;
  itemId?: string;
  storageUnitId?: string;
  characterId?: string;
  /** Render canned data and simulate transactions; no chain access. */
  demo: boolean;
}

export function readUrlContext(): UrlContext {
  const params = new URLSearchParams(window.location.search);
  return {
    tenant: params.get("tenant") || undefined,
    itemId: params.get("itemId") || undefined,
    storageUnitId:
      params.get("storageUnitId") ||
      params.get("objectId") ||
      params.get("assemblyId") ||
      params.get("ssu") ||
      undefined,
    characterId: params.get("characterId") || undefined,
    demo: params.get("demo") === "1",
  };
}
