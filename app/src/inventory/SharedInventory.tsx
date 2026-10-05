import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { NO_SELECTION } from "./selection";
import type { Selection } from "./selection";
import { useTileDrag } from "./useTileDrag";
import type { DragItem, DropEvent } from "./useTileDrag";

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

const asItem = (tile: TileModel): DragItem => ({
  typeId: tile.typeId,
  max: tile.quantity,
  ghost: tile.ghost,
});

interface AmountPrompt {
  typeId: number;
  from: PanelId;
  max: number;
  ghost: boolean;
  viaKeyboard?: boolean;
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
  const [selection, setSelection] = useState<Selection>(NO_SELECTION);

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

  /**
   * Stage each item's `max` moving out of `from`. Put-backs go first: undoing
   * a ghost of a type must not eat into the real stack of that same type
   * moving in the same drop.
   */
  const stage = useCallback(
    (from: PanelId, items: DragItem[]) => {
      const ordered = [...items].sort((a, b) => Number(b.ghost) - Number(a.ghost));
      setPending((current) =>
        ordered.reduce(
          (moves, { typeId, max, ghost }) =>
            stageMove(
              moves,
              typeId,
              from,
              max,
              { shared: lookups.sharedQty(typeId), own: lookups.ownQty(typeId) },
              ghost,
            ),
          normalize(current),
        ),
      );
      setSelection(NO_SELECTION);
      onStagingChange();
    },
    [lookups, normalize, onStagingChange],
  );

  const onDrop = useCallback(
    (event: DropEvent) => {
      if (busy) return;
      const [only] = event.items;
      if (event.items.length === 1 && event.pickAmount && only.max > 1) {
        setPrompt({ typeId: only.typeId, from: event.from, max: only.max, ghost: only.ghost });
      } else {
        stage(event.from, event.items);
      }
    },
    [busy, stage],
  );

  const { drag, begin } = useTileDrag(onDrop);

  // Escape drops the selection. A drag in progress, or the amount box,
  // takes the key instead.
  const dragging = useRef(false);
  dragging.current = Boolean(drag);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented && !dragging.current) {
        setSelection(NO_SELECTION);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
    setSelection(NO_SELECTION);
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

  const moveTilesOf = (panel: PanelId) => (tiles: TileModel[]) => {
    if (!busy) stage(panel, tiles.map(asItem));
  };
  const pickAmountOf = (panel: PanelId) => (tile: TileModel, viaKeyboard: boolean) => {
    if (busy) return;
    if (tile.quantity <= 1) stage(panel, [asItem(tile)]);
    else {
      const { typeId, quantity: max, ghost } = tile;
      setPrompt({ typeId, from: panel, max, ghost, viaKeyboard });
    }
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
        (panel === "shared"
          ? "Drag down to take, or double-click for the whole stack. Shift-drag or right-click to choose an amount."
          : "Drag up to share, or double-click for the whole stack. Shift-drag or right-click to choose an amount.") +
        "\nCtrl-click, Shift-click or drag a box to select several, then drag them together."
      }
      dropReady={Boolean(drag) && drag?.from !== panel}
      dropHover={drag?.over === panel}
      emptyMessage={panel === "shared" ? sharedEmpty : ownEmpty}
      capacity={panel === "shared" ? sharedCapacity : ownCapacity}
      selection={selection}
      onSelectionChange={setSelection}
      onBeginDrag={begin}
      onMoveTiles={moveTilesOf(panel)}
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
          className={["drag-ghost", drag.items.length > 1 && "multi", drag.over && "will-drop"]
            .filter(Boolean)
            .join(" ")}
          style={{ left: drag.x, top: drag.y }}
          aria-hidden="true"
        >
          {drag.iconUrl ? (
            <img src={drag.iconUrl} alt="" draggable={false} />
          ) : (
            <span className="tile-noicon" />
          )}
          <span className="tile-qty">
            {drag.items.length > 1
              ? `${drag.items.length} stacks`
              : formatQuantity(drag.items[0].max)}
          </span>
        </div>
      )}

      {prompt && (
        <QuantityDialog
          title={promptTitle}
          itemName={nameOf(prompt.typeId)}
          max={prompt.max}
          waitForEnterRelease={prompt.viaKeyboard}
          onCancel={() => setPrompt(undefined)}
          onConfirm={(amount) => {
            stage(prompt.from, [{ typeId: prompt.typeId, max: amount, ghost: prompt.ghost }]);
            setPrompt(undefined);
          }}
        />
      )}
    </div>
  );
}
