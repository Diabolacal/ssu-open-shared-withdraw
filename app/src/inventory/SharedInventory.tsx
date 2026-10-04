import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { StatusState } from "../types";
import { useTypeIcons } from "../typeIcons";
import { formatQuantity } from "./format";
import { InventoryPanel } from "./InventoryPanel";
import {
  clampPending,
  panelTiles,
  pendingVolumeDelta,
  stageMove,
  summarize,
} from "./moves";
import type { MoveSummary, PanelId, PendingMoves, StockEntry, TileModel } from "./moves";
import { MoveBar } from "./MoveBar";
import { QuantityDialog } from "./QuantityDialog";
import { useTileDrag } from "./useTileDrag";
import type { DropEvent } from "./useTileDrag";

interface Bucket {
  used: number;
  max: number;
}

interface SharedInventoryProps {
  shared: StockEntry[];
  own: StockEntry[];
  sharedBucket?: Bucket;
  ownBucket?: Bucket;
  nameOf: (typeId: number) => string;
  canTake: boolean;
  canShare: boolean;
  busy: boolean;
  status: StatusState;
  hint: string;
  sharedEmpty: ReactNode;
  ownEmpty: ReactNode;
  /**
   * Sign and send every staged move. Must call `clearStaged` as soon as the
   * transaction succeeds (before re-reading the unit) and resolve when done.
   */
  onCommit: (summary: MoveSummary, clearStaged: () => void) => Promise<void>;
}

const EMPTY: PendingMoves = new Map();

interface AmountPrompt {
  typeId: number;
  from: PanelId;
  max: number;
  ghost: boolean;
}

/**
 * The two storage windows: shared storage on top (two thirds), your own items
 * below (one third). Drag between them to stage moves; nothing changes on
 * chain until the one commit button sends them all as a single transaction.
 */
export function SharedInventory({
  shared,
  own,
  sharedBucket,
  ownBucket,
  nameOf,
  canTake,
  canShare,
  busy,
  status,
  hint,
  sharedEmpty,
  ownEmpty,
  onCommit,
}: SharedInventoryProps) {
  const iconOf = useTypeIcons();
  const [pending, setPending] = useState<PendingMoves>(EMPTY);
  const [prompt, setPrompt] = useState<AmountPrompt>();

  const lookups = useMemo(() => {
    const sharedQty = new Map(shared.map((e) => [e.typeId, e.quantity]));
    const ownQty = new Map(own.map((e) => [e.typeId, e.quantity]));
    const volume = new Map<number, number>();
    for (const e of [...shared, ...own]) volume.set(e.typeId, e.volume);
    return {
      sharedQty: (typeId: number) => sharedQty.get(typeId) ?? 0,
      ownQty: (typeId: number) => ownQty.get(typeId) ?? 0,
      volume: (typeId: number) => volume.get(typeId) ?? 0,
    };
  }, [shared, own]);

  // Refreshes (every few seconds) may shrink stacks under staged moves, and
  // permissions can drop (wallet disconnect): keep the staging truthful.
  useEffect(() => {
    setPending((current) => {
      let next = clampPending(current, lookups.sharedQty, lookups.ownQty);
      if (!canTake || !canShare) {
        const kept = new Map([...next].filter(([, d]) => (d > 0 ? canTake : canShare)));
        if (kept.size !== next.size) next = kept;
      }
      return next;
    });
  }, [lookups, canTake, canShare]);

  const stage = useCallback(
    (typeId: number, from: PanelId, amount: number) => {
      setPending((current) =>
        stageMove(current, typeId, from, amount, {
          shared: lookups.sharedQty(typeId),
          own: lookups.ownQty(typeId),
        }),
      );
    },
    [lookups],
  );

  const onDrop = useCallback(
    (event: DropEvent) => {
      if (busy) return;
      if (event.pickAmount && event.max > 1) {
        const { typeId, from, max, ghost } = event;
        setPrompt({ typeId, from, max, ghost });
      } else {
        stage(event.typeId, event.from, event.max);
      }
    },
    [busy, stage],
  );

  const { drag, begin } = useTileDrag(onDrop);

  const summary = useMemo(() => summarize(pending), [pending]);
  const sharedTiles = useMemo(() => panelTiles("shared", shared, pending), [shared, pending]);
  const ownTiles = useMemo(() => panelTiles("own", own, pending), [own, pending]);

  function capacityOf(panel: PanelId, bucket?: Bucket) {
    if (!bucket || bucket.max <= 0) return undefined;
    const projected = bucket.used + pendingVolumeDelta(panel, pending, lookups.volume);
    return { used: bucket.used, max: bucket.max, projected };
  }
  const sharedCapacity = capacityOf("shared", sharedBucket);
  const ownCapacity = capacityOf("own", ownBucket);

  const blockedReason =
    sharedCapacity && sharedCapacity.projected > sharedCapacity.max
      ? "Not enough room in shared storage for everything staged."
      : ownCapacity && ownCapacity.projected > ownCapacity.max
        ? "Not enough room in your items for everything staged."
        : undefined;

  const clearStaged = useCallback(() => setPending(EMPTY), []);

  function commit(moves: MoveSummary) {
    if (busy) return;
    void onCommit(moves, clearStaged);
  }

  function shareAll() {
    const everything: PendingMoves = new Map(own.map((e) => [e.typeId, -e.quantity]));
    setPending(everything);
    commit(summarize(everything));
  }

  const moveAllOf = (panel: PanelId) => (tile: TileModel) => {
    if (!busy) stage(tile.typeId, panel, tile.quantity);
  };
  const pickAmountOf = (panel: PanelId) => (tile: TileModel) => {
    if (busy) return;
    if (tile.quantity <= 1) stage(tile.typeId, panel, tile.quantity);
    else setPrompt({ typeId: tile.typeId, from: panel, max: tile.quantity, ghost: tile.ghost });
  };

  const promptTitle = prompt
    ? prompt.ghost
      ? "Put back how many?"
      : prompt.from === "shared"
        ? "Take how many?"
        : "Share how many?"
    : "";

  const panels = (["shared", "own"] as const).map((panel) => (
    <InventoryPanel
      key={panel}
      id={panel}
      title={panel === "shared" ? "Shared storage" : "Your items"}
      titleHint={
        panel === "shared"
          ? "Everything in this unit. Anyone can take from it."
          : "Only you can see these. Drag them into your inventory in game, or share them."
      }
      tiles={panel === "shared" ? sharedTiles : ownTiles}
      nameOf={nameOf}
      iconOf={iconOf}
      canMoveOut={panel === "shared" ? canTake : canShare}
      frozen={busy}
      moveHint={
        panel === "shared"
          ? "Drag down to take. Shift-drag to choose an amount."
          : "Drag up to share. Shift-drag to choose an amount."
      }
      dropReady={Boolean(drag) && drag?.from !== panel}
      dropHover={drag?.over === panel}
      emptyMessage={panel === "shared" ? sharedEmpty : ownEmpty}
      capacity={panel === "shared" ? sharedCapacity : ownCapacity}
      onBeginDrag={begin}
      onMoveAll={moveAllOf(panel)}
      onPickAmount={pickAmountOf(panel)}
    />
  ));

  return (
    <div className={drag ? "inventory dragging" : "inventory"}>
      {panels[0]}
      <MoveBar
        summary={summary}
        status={status}
        busy={busy}
        hint={hint}
        blockedReason={blockedReason}
        canShareAll={canShare && own.length > 0}
        onShareAll={shareAll}
        onCommit={() => commit(summary)}
        onClear={clearStaged}
      />
      {panels[1]}

      {drag && (
        <div
          className={drag.over ? "drag-ghost will-drop" : "drag-ghost"}
          style={{ left: drag.x, top: drag.y }}
          aria-hidden="true"
        >
          {drag.iconUrl ? (
            <img src={drag.iconUrl} alt="" draggable={false} />
          ) : (
            <span className="tile-noicon" />
          )}
          <span className="tile-qty">{formatQuantity(drag.max)}</span>
        </div>
      )}

      {prompt && (
        <QuantityDialog
          title={promptTitle}
          itemName={nameOf(prompt.typeId)}
          max={prompt.max}
          onCancel={() => setPrompt(undefined)}
          onConfirm={(amount) => {
            stage(prompt.typeId, prompt.from, amount);
            setPrompt(undefined);
          }}
        />
      )}
    </div>
  );
}
