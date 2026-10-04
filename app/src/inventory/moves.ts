/**
 * Staged ("ghosted") moves between the two panels, committed together as one
 * transaction.
 *
 * Each item type carries ONE signed delta: positive = take (shared storage to
 * your items), negative = share (your items to shared storage). Dragging a
 * ghost back simply moves the delta toward zero, so cancelling, netting and
 * re-dragging all fall out of the same arithmetic.
 */

export type PanelId = "shared" | "own";

export interface StockEntry {
  typeId: number;
  quantity: number;
  /** Per-unit volume in on-chain units (m3 x VOLUME_SCALE). */
  volume: number;
}

export type PendingMoves = ReadonlyMap<number, number>;

export interface TileModel {
  key: string;
  typeId: number;
  /** The count printed on the tile's badge. */
  quantity: number;
  /** A staged arrival, drawn as a ghost until committed. */
  ghost: boolean;
  /** Real stock whose whole stack is staged to leave. */
  departing: boolean;
}

export function otherPanel(panel: PanelId): PanelId {
  return panel === "shared" ? "own" : "shared";
}

/** How much of a type is staged to leave `panel` (never negative). */
function outgoing(panel: PanelId, delta: number): number {
  return panel === "shared" ? Math.max(delta, 0) : Math.max(-delta, 0);
}

/** How much of a type is staged to arrive in `panel` (never negative). */
function incoming(panel: PanelId, delta: number): number {
  return outgoing(otherPanel(panel), delta);
}

/** Ghost arrivals first (so they are seen), then real stock in given order. */
export function panelTiles(
  panel: PanelId,
  stock: StockEntry[],
  pending: PendingMoves,
): TileModel[] {
  const ghosts: TileModel[] = [];
  for (const [typeId, delta] of pending) {
    const arriving = incoming(panel, delta);
    if (arriving > 0) {
      ghosts.push({
        key: `ghost-${typeId}`,
        typeId,
        quantity: arriving,
        ghost: true,
        departing: false,
      });
    }
  }
  const real = stock.map((entry) => {
    const remaining = entry.quantity - outgoing(panel, pending.get(entry.typeId) ?? 0);
    return {
      key: `stock-${entry.typeId}`,
      typeId: entry.typeId,
      quantity: remaining,
      ghost: false,
      departing: remaining <= 0,
    };
  });
  return [...ghosts, ...real];
}

/**
 * Stage `amount` of a type moving out of `from`. The result is clamped to
 * what actually exists: never take more than shared storage holds nor share
 * more than your items hold. Putting a ghost back (`ghost`) only ever undoes:
 * it stops at zero rather than flipping into a move the other way (its
 * amount may be stale if a refresh shrank the staged move meanwhile).
 */
export function stageMove(
  pending: PendingMoves,
  typeId: number,
  from: PanelId,
  amount: number,
  limits: { shared: number; own: number },
  ghost = false,
): PendingMoves {
  const current = pending.get(typeId) ?? 0;
  let raw = from === "shared" ? current + amount : current - amount;
  if (ghost) raw = from === "shared" ? Math.min(raw, 0) : Math.max(raw, 0);
  const next = Math.min(Math.max(raw, -limits.own), limits.shared);
  const result = new Map(pending);
  if (next === 0) result.delete(typeId);
  else result.set(typeId, next);
  return result;
}

/**
 * Re-clamp staged moves after a refresh (someone else may have taken items
 * meanwhile). Returns the SAME map when nothing changed, so React state
 * updates stay no-ops.
 */
export function clampPending(
  pending: PendingMoves,
  sharedQuantity: (typeId: number) => number,
  ownQuantity: (typeId: number) => number,
): PendingMoves {
  let changed = false;
  const result = new Map<number, number>();
  for (const [typeId, delta] of pending) {
    const next = Math.min(Math.max(delta, -ownQuantity(typeId)), sharedQuantity(typeId));
    if (next !== delta) changed = true;
    if (next !== 0) result.set(typeId, next);
  }
  return changed ? result : pending;
}

export interface MoveSummary {
  takes: { typeId: number; quantity: number }[];
  shares: { typeId: number; quantity: number }[];
}

export function summarize(pending: PendingMoves): MoveSummary {
  const summary: MoveSummary = { takes: [], shares: [] };
  for (const [typeId, delta] of pending) {
    if (delta > 0) summary.takes.push({ typeId, quantity: delta });
    else if (delta < 0) summary.shares.push({ typeId, quantity: -delta });
  }
  return summary;
}

/** Net change in a panel's used volume once the staged moves land. */
export function pendingVolumeDelta(
  panel: PanelId,
  pending: PendingMoves,
  volumeOf: (typeId: number) => number,
): number {
  let delta = 0;
  for (const [typeId, moved] of pending) {
    const volume = volumeOf(typeId);
    delta += (incoming(panel, moved) - outgoing(panel, moved)) * volume;
  }
  return delta;
}

/** Volume staged to arrive in a panel (ignores what is staged to leave). */
export function pendingVolumeIn(
  panel: PanelId,
  pending: PendingMoves,
  volumeOf: (typeId: number) => number,
): number {
  let total = 0;
  for (const [typeId, moved] of pending) total += incoming(panel, moved) * volumeOf(typeId);
  return total;
}
