export interface UrlContext {
  tenant?: string;
  itemId?: string;
  storageUnitId?: string;
  characterId?: string;
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
      undefined,
    characterId: params.get("characterId") || undefined,
  };
}

