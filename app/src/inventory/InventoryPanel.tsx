import { useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, ReactNode } from "react";
import { formatMaxM3, formatUsedM3 } from "./format";
import { ItemTile } from "./ItemTile";
import type { PanelId, TileModel } from "./moves";
import { boxSelect, clickSelect, keysIn, NO_SELECTION } from "./selection";
import type { Selection } from "./selection";
import { useMarquee } from "./useMarquee";
import type { DragPayload } from "./useTileDrag";

export interface Capacity {
  used: number;
  max: number;
  /** Used volume once staged moves land; equals `used` when nothing is staged. */
  projected: number;
}

interface InventoryPanelProps {
  id: PanelId;
  title: string;
  titleHint?: string;
  tiles: TileModel[];
  nameOf: (typeId: number) => string;
  iconOf: (typeId: number) => string | undefined;
  /** May real (non-ghost) tiles in this panel move to the other one? */
  canMoveOut: boolean;
  /** Nothing moves (a transaction is in flight). */
  frozen: boolean;
  moveHint: string;
  /** Highlight as a drop target while a drag from the other panel is over it. */
  dropHover: boolean;
  /** Dim slightly while something is being dragged from the other panel. */
  dropReady: boolean;
  emptyMessage: ReactNode;
  capacity?: Capacity;
  /** The selection across both panels (only one panel holds it at a time). */
  selection: Selection;
  onSelectionChange: (next: Selection) => void;
  onBeginDrag: (event: PointerEvent, payload: DragPayload) => void;
  /** Move these whole tiles to the other panel. */
  onMoveTiles: (tiles: TileModel[]) => void;
  onPickAmount: (tile: TileModel, viaKeyboard: boolean) => void;
}

/** A storage window in the game's style: title bar + search, icon grid, capacity bar. */
export function InventoryPanel({
  id,
  title,
  titleHint,
  tiles,
  nameOf,
  iconOf,
  canMoveOut,
  frozen,
  moveHint,
  dropHover,
  dropReady,
  emptyMessage,
  capacity,
  selection,
  onSelectionChange,
  onBeginDrag,
  onMoveTiles,
  onPickAmount,
}: InventoryPanelProps) {
  const [search, setSearch] = useState("");
  const body = useRef<HTMLDivElement>(null);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return tiles;
    return tiles.filter(
      (tile) =>
        nameOf(tile.typeId).toLowerCase().includes(needle) ||
        String(tile.typeId).includes(needle),
    );
  }, [tiles, search, nameOf]);

  // Only tiles that can move right now are selectable, and only visible
  // ones count: a search never leaves hidden tiles riding along in a drag.
  const selectable = useMemo(
    () =>
      visible.filter(
        (tile) => !frozen && tile.quantity > 0 && (tile.ghost || canMoveOut),
      ),
    [visible, frozen, canMoveOut],
  );
  const orderedKeys = useMemo(() => selectable.map((tile) => tile.key), [selectable]);
  const movableKeys = useMemo(() => new Set(orderedKeys), [orderedKeys]);
  const selectedKeys = keysIn(selection, id);
  const picked = selectable.filter((tile) => selectedKeys.has(tile.key));

  /** What moves when `tile` is dragged or sent: the selection if it's in it. */
  function groupFor(tile: TileModel): TileModel[] {
    return picked.length > 1 && selectedKeys.has(tile.key) ? picked : [tile];
  }

  // The selection when a box started, so Ctrl/Shift boxes add to it.
  const boxBase = useRef<Selection>(NO_SELECTION);
  const marquee = useMarquee({
    bodyRef: body,
    onBox: (hits, additive) => onSelectionChange(boxSelect(boxBase.current, id, hits, additive)),
    onEmptyClick: (additive) => {
      if (!additive && selection.panel === id) onSelectionChange(NO_SELECTION);
    },
    onCancel: () => onSelectionChange(boxBase.current),
  });

  function onBodyPointerDown(event: PointerEvent) {
    if ((event.target as Element).closest(".tile.movable")) return;
    boxBase.current = selection;
    marquee.begin(event);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.target instanceof HTMLInputElement) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      event.preventDefault();
      onSelectionChange({ panel: id, keys: new Set(orderedKeys), anchor: orderedKeys[0] });
    }
  }

  const classes = ["inv", `inv-${id}`];
  if (dropReady) classes.push("drop-ready");
  if (dropHover) classes.push("drop-hover");

  return (
    <section className={classes.join(" ")} data-drop-panel={id} onKeyDown={onKeyDown}>
      <header className="inv-head">
        <span className="inv-title" title={titleHint}>
          {title}
        </span>
        <input
          className="inv-search"
          type="text"
          placeholder="Search"
          title="Show only items whose name contains this"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </header>
      <div className="inv-body" ref={body} tabIndex={0} onPointerDown={onBodyPointerDown}>
        {tiles.length === 0 ? (
          <p className="inv-empty">{emptyMessage}</p>
        ) : visible.length === 0 ? (
          <p className="inv-empty">No items match your search.</p>
        ) : (
          <div className="inv-grid">
            {visible.map((tile) => {
              const movable = movableKeys.has(tile.key);
              return (
                <ItemTile
                  key={tile.key}
                  tile={tile}
                  name={nameOf(tile.typeId)}
                  iconUrl={iconOf(tile.typeId)}
                  movable={movable}
                  selected={selectedKeys.has(tile.key)}
                  moveHint={
                    tile.ghost ? "Drag back or double-click to undo. Right-click for an amount." : moveHint
                  }
                  onPointerDown={(event) =>
                    onBeginDrag(event, {
                      from: id,
                      items: groupFor(tile).map((t) => ({
                        typeId: t.typeId,
                        max: t.quantity,
                        ghost: t.ghost,
                      })),
                      iconUrl: iconOf(tile.typeId),
                    })
                  }
                  onSelect={(modifiers) =>
                    onSelectionChange(clickSelect(selection, id, tile.key, orderedKeys, modifiers))
                  }
                  onMoveAll={() => onMoveTiles(groupFor(tile))}
                  onPickAmount={(viaKeyboard) => onPickAmount(tile, viaKeyboard)}
                />
              );
            })}
          </div>
        )}
        {marquee.box && (
          <div
            className="marquee"
            style={{
              left: marquee.box.left,
              top: marquee.box.top,
              width: marquee.box.width,
              height: marquee.box.height,
            }}
            aria-hidden="true"
          />
        )}
      </div>
      {capacity && capacity.max > 0 && <CapacityBar capacity={capacity} />}
    </section>
  );
}

function CapacityBar({ capacity }: { capacity: Capacity }) {
  const { used, max, projected } = capacity;
  const pct = (value: number) => `${Math.min(Math.max(value / max, 0), 1) * 100}%`;
  const staged = projected !== used;
  const over = projected > max;
  return (
    <div
      className={over ? "capbar over" : "capbar"}
      title={over ? "Not enough room for everything staged" : undefined}
    >
      <div className="capbar-fill" style={{ width: pct(Math.min(used, projected)) }} />
      {staged && (
        <div
          className="capbar-staged"
          style={{
            left: pct(Math.min(used, projected)),
            width: pct(Math.abs(projected - used)),
          }}
        />
      )}
      <span className="capbar-label">
        {formatUsedM3(used)}
        {staged && <span className="capbar-next">{` → ${formatUsedM3(projected)}`}</span>}
        {`/${formatMaxM3(max)} m³`}
      </span>
    </div>
  );
}
