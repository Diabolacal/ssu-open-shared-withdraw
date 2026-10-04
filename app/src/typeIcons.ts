import { useEffect, useState } from "react";

/**
 * Item icons are the game client's own inventory art. They are NOT in git
 * (CCP's art, and this repo is public): a build machine with the client
 * generates `public/icons.json` + `public/icons/<hash>.png` before building.
 * When they are absent the grid simply draws blank tiles.
 *
 * icons.json: { clientBuild, icons: { "<typeId>": "<content hash>" } }
 */
const ICON_BASE = `${import.meta.env.BASE_URL}icons/`;
const INDEX_URL = `${import.meta.env.BASE_URL}icons.json`;

type IconIndex = Record<string, string>;

let indexPromise: Promise<IconIndex> | undefined;

function loadIconIndex(): Promise<IconIndex> {
  indexPromise ??= fetch(INDEX_URL)
    .then(async (response) => {
      if (!response.ok) return {};
      const body = (await response.json()) as { icons?: IconIndex };
      return body.icons ?? {};
    })
    .catch(() => ({}));
  return indexPromise;
}

/** Returns a lookup from typeId to its icon URL (undefined when there is none). */
export function useTypeIcons(): (typeId: number) => string | undefined {
  const [index, setIndex] = useState<IconIndex>({});

  useEffect(() => {
    let cancelled = false;
    void loadIconIndex().then((loaded) => {
      if (!cancelled) setIndex(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (typeId) => {
    const hash = index[String(typeId)];
    return hash ? `${ICON_BASE}${hash}.png` : undefined;
  };
}
