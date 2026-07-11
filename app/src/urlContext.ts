export interface UrlContext {
  tenant?: string;
  itemId?: string;
  storageUnitId?: string;
  characterId?: string;
  /** Render canned data and simulate transactions; no chain access. */
  demo: boolean;
}

/** ef-map.com/storage/0x<unit id> — the id rides in the path. */
function unitIdFromPath(pathname: string): string | undefined {
  const match = pathname.match(/\/storage\/(0x[0-9a-fA-F]{40,64})\/?$/);
  return match?.[1];
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
      unitIdFromPath(window.location.pathname) ||
      undefined,
    characterId: params.get("characterId") || undefined,
    demo: params.get("demo") === "1",
  };
}
