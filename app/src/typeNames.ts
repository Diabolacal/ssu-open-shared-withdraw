import { useEffect, useState } from "react";

// The dapp-kit's getDatahubGameInfo points at the retired
// world-api-stillness.live.tech host, so we call the world API directly.
const WORLD_API_HOST =
  import.meta.env.VITE_WORLD_API_HOST ||
  "world-api-stillness.live.pub.evefrontier.com";

const nameCache = new Map<number, string>();
const pending = new Map<number, Promise<string>>();

async function resolveTypeName(typeId: number): Promise<string> {
  const cached = nameCache.get(typeId);
  if (cached) return cached;

  let inflight = pending.get(typeId);
  if (!inflight) {
    inflight = fetch(`https://${WORLD_API_HOST}/v2/types/${typeId}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`type lookup ${response.status}`);
        const info = (await response.json()) as { name?: unknown };
        const name =
          typeof info.name === "string" && info.name.length > 0
            ? info.name
            : `type ${typeId}`;
        nameCache.set(typeId, name);
        return name;
      })
      .finally(() => pending.delete(typeId));
    pending.set(typeId, inflight);
  }
  return inflight;
}

/**
 * Resolves type_ids to player-facing names via the EVE Frontier world API.
 * Unresolved ids fall back to "type <id>".
 */
export function useTypeNames(typeIds: number[]): Record<number, string> {
  const [names, setNames] = useState<Record<number, string>>({});
  const wanted = typeIds
    .filter((id) => names[id] === undefined)
    .sort((a, b) => a - b)
    .join(",");

  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;

    void Promise.all(
      wanted.split(",").map(async (raw) => {
        const typeId = Number(raw);
        try {
          return [typeId, await resolveTypeName(typeId)] as const;
        } catch {
          return [typeId, `type ${typeId}`] as const;
        }
      }),
    ).then((resolved) => {
      if (cancelled) return;
      setNames((previous) => {
        const next = { ...previous };
        for (const [typeId, name] of resolved) next[typeId] = name;
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [wanted]);

  return names;
}
