import { useMemo, useState } from "react";
import type { PointerEvent, ReactNode } from "react";
import { formatMaxM3, formatUsedM3 } from "./format";
import { ItemTile } from "./ItemTile";
import type { PanelId, TileModel } from "./moves";
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
  onBeginDrag: (event: PointerEvent, payload: DragPayload) => void;
  onMoveAll: (tile: TileModel) => void;
  onPickAmount: (tile: TileModel) => void;
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
  onBeginDrag,
  onMoveAll,
  onPickAmount,
}: InventoryPanelProps) {
  const [search, setSearch] = useState("");

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return tiles;
    return tiles.filter(
      (tile) =>
        nameOf(tile.typeId).toLowerCase().includes(needle) ||
        String(tile.typeId).includes(needle),
    );
  }, [tiles, search, nameOf]);

  const classes = ["inv", `inv-${id}`];
  if (dropReady) classes.push("drop-ready");
  if (dropHover) classes.push("drop-hover");

  return (
    <section className={classes.join(" ")} data-drop-panel={id}>
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
      <div className="inv-body">
        {tiles.length === 0 ? (
          <p className="inv-empty">{emptyMessage}</p>
        ) : visible.length === 0 ? (
          <p className="inv-empty">No items match your search.</p>
        ) : (
          <div className="inv-grid">
            {visible.map((tile) => {
              const movable = !frozen && tile.quantity > 0 && (tile.ghost || canMoveOut);
              return (
                <ItemTile
                  key={tile.key}
                  tile={tile}
                  name={nameOf(tile.typeId)}
                  iconUrl={iconOf(tile.typeId)}
                  movable={movable}
                  moveHint={
                    tile.ghost ? "Drag back or double-click to undo. Right-click for an amount." : moveHint
                  }
                  onPointerDown={(event) =>
                    onBeginDrag(event, {
                      typeId: tile.typeId,
                      from: id,
                      max: tile.quantity,
                      ghost: tile.ghost,
                      iconUrl: iconOf(tile.typeId),
                    })
                  }
                  onMoveAll={() => onMoveAll(tile)}
                  onPickAmount={() => onPickAmount(tile)}
                />
              );
            })}
          </div>
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
