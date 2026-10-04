import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { StatusState } from "../types";
import { useTypeIcons } from "../typeIcons";
import { formatQuantity } from "./format";
import { InventoryPanel } from "./InventoryPanel";
import {
  clampPending,
  panelTiles,
  pendingVolumeDelta,
  pendingVolumeIn,
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
  /** The player changed what is staged (retires stale status messages). */
  onStagingChange: () => void;
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
  onStagingChange,
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
  // permissions can drop (wallet disconnect). The truthful staging is derived
  // DURING render, so a commit can never send a pre-refresh amount; the raw
  // state only records what the player asked for.
  const normalize = useCallback(
    (raw: PendingMoves): PendingMoves => {
      const next = clampPending(raw, lookups.sharedQty, lookups.ownQty);
      if (canTake && canShare) return next;
      const kept = new Map([...next].filter(([, d]) => (d > 0 ? canTake : canShare)));
      return kept.size === next.size ? next : kept;
    },
    [lookups, canTake, canShare],
  );
  const staged = useMemo(() => normalize(pending), [normalize, pending]);

  const stage = useCallback(
    (typeId: number, from: PanelId, amount: number, ghost: boolean) => {
      setPending((current) =>
        stageMove(
          normalize(current),
          typeId,
          from,
          amount,
          { shared: lookups.sharedQty(typeId), own: lookups.ownQty(typeId) },
          ghost,
        ),
      );
      onStagingChange();
    },
    [lookups, normalize, onStagingChange],
  );

  const onDrop = useCallback(
    (event: DropEvent) => {
      if (busy) return;
      if (event.pickAmount && event.max > 1) {
        const { typeId, from, max, ghost } = event;
        setPrompt({ typeId, from, max, ghost });
      } else {
        stage(event.typeId, event.from, event.max, event.ghost);
      }
    },
    [busy, stage],
  );

  const { drag, begin } = useTileDrag(onDrop);

  const summary = useMemo(() => summarize(staged), [staged]);
  const sharedTiles = useMemo(() => panelTiles("shared", shared, staged), [shared, staged]);
  const ownTiles = useMemo(() => panelTiles("own", own, staged), [own, staged]);

  function capacityOf(panel: PanelId, moves: PendingMoves, bucket?: Bucket) {
    if (!bucket || bucket.max <= 0) return undefined;
    const projected = bucket.used + pendingVolumeDelta(panel, moves, lookups.volume);
    return { used: bucket.used, max: bucket.max, projected };
  }

  /**
   * Mirrors buildMoveTx's order (takes, then shares): shared storage only
   * has to hold the NET result, but your items must hold everything taken
   * before any share leaves.
   */
  function blockedFor(moves: PendingMoves): string | undefined {
    const sharedAfter = capacityOf("shared", moves, sharedBucket);
    if (sharedAfter && sharedAfter.projected > sharedAfter.max) {
      return "Not enough room in shared storage for everything staged.";
    }
    if (ownBucket && ownBucket.max > 0) {
      const ownPeak = ownBucket.used + pendingVolumeIn("own", moves, lookups.volume);
      if (ownPeak > ownBucket.max) return "Not enough room in your items for everything staged.";
    }
    return undefined;
  }

  const sharedCapacity = capacityOf("shared", staged, sharedBucket);
  const ownCapacity = capacityOf("own", staged, ownBucket);
  const blockedReason = blockedFor(staged);

  const clearStaged = useCallback(() => setPending(EMPTY), []);

  function commit(moves: PendingMoves) {
    if (busy || blockedFor(moves)) return;
    void onCommit(summarize(moves), clearStaged);
  }

  /** Stage the whole of your items; send it unless it cannot fit. */
  function shareAll() {
    if (busy) return;
    const everything: PendingMoves = new Map(own.map((e) => [e.typeId, -e.quantity]));
    setPending(everything);
    onStagingChange();
    commit(everything);
  }

  const moveAllOf = (panel: PanelId) => (tile: TileModel) => {
    if (!busy) stage(tile.typeId, panel, tile.quantity, tile.ghost);
  };
  const pickAmountOf = (panel: PanelId) => (tile: TileModel) => {
    if (busy) return;
    if (tile.quantity <= 1) stage(tile.typeId, panel, tile.quantity, tile.ghost);
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
          ? "Drag down to take, or double-click for the whole stack. Shift-drag or right-click to choose an amount."
          : "Drag up to share, or double-click for the whole stack. Shift-drag or right-click to choose an amount."
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
        onCommit={() => commit(staged)}
        onClear={() => {
          clearStaged();
          onStagingChange();
        }}
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
            stage(prompt.typeId, prompt.from, amount, prompt.ghost);
            setPrompt(undefined);
          }}
        />
      )}
    </div>
  );
}
