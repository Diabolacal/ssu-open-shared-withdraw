import { describe, expect, it } from "vitest";
import { clampPending, panelTiles, stageMove, summarize } from "./moves";
import type { PendingMoves, StockEntry } from "./moves";

// Two Olivine variants (387 and 434) with the same count, as on a live
// Stillness unit after the 2026-11-10 patch: same base type, different items.
const OLIVINE_387 = "1662152440263";
const OLIVINE_434 = "1864015903175";
const shared: StockEntry[] = [
  { typeId: OLIVINE_387, quantity: 152_300, volume: 0 },
  { typeId: OLIVINE_434, quantity: 152_300, volume: 0 },
];
const none: PendingMoves = new Map();
const limits = { shared: 152_300, own: 0 };

describe("staging two variants of one type", () => {
  it("takes 1 from one variant and leaves the other untouched", () => {
    const pending = stageMove(none, OLIVINE_434, "shared", 1, limits);
    expect([...pending]).toEqual([[OLIVINE_434, 1]]);
    expect(summarize(pending)).toEqual({ takes: [{ typeId: OLIVINE_434, quantity: 1 }], shares: [] });

    const tiles = panelTiles("shared", shared, pending);
    expect(tiles.map((t) => [t.typeId, t.quantity])).toEqual([
      [OLIVINE_387, 152_300],
      [OLIVINE_434, 152_299],
    ]);
    const arriving = panelTiles("own", [], pending);
    expect(arriving.map((t) => [t.typeId, t.quantity, t.ghost])).toEqual([[OLIVINE_434, 1, true]]);
    // Tile keys never collide between the two variants.
    expect(new Set(tiles.map((t) => t.key)).size).toBe(2);
  });

  it("clamps each variant against its own stock only", () => {
    const pending: PendingMoves = new Map([
      [OLIVINE_387, 152_300],
      [OLIVINE_434, 5],
    ]);
    const sharedQty = (key: string) => (key === OLIVINE_434 ? 3 : 152_300);
    const clamped = clampPending(pending, sharedQty, () => 0);
    expect([...clamped]).toEqual([
      [OLIVINE_387, 152_300],
      [OLIVINE_434, 3],
    ]);
  });
});
