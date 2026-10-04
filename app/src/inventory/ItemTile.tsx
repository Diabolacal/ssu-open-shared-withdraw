import type { KeyboardEvent, PointerEvent } from "react";
import { formatQuantity } from "./format";
import type { TileModel } from "./moves";

interface ItemTileProps {
  tile: TileModel;
  name: string;
  iconUrl?: string;
  /** Can this tile be dragged / double-clicked across right now? */
  movable: boolean;
  /** Tooltip line describing what moving this tile does. */
  moveHint?: string;
  onPointerDown: (event: PointerEvent) => void;
  /** Move the whole tile across (double-click, Enter). */
  onMoveAll: () => void;
  /** Ask for an amount (Shift+Enter). */
  onPickAmount: () => void;
}

/**
 * One inventory slot drawn like the game's storage windows: 64 px icon on a
 * square plate, black count badge in the bottom-right corner, name wrapped
 * underneath. Ghost tiles are staged arrivals not yet committed.
 */
export function ItemTile({
  tile,
  name,
  iconUrl,
  movable,
  moveHint,
  onPointerDown,
  onMoveAll,
  onPickAmount,
}: ItemTileProps) {
  const classes = ["tile"];
  if (tile.ghost) classes.push("ghost");
  if (tile.departing) classes.push("departing");
  if (movable) classes.push("movable");

  const status = tile.ghost
    ? tile.quantity.toLocaleString("en-US") + " staged to arrive"
    : tile.departing
      ? "All staged to leave"
      : tile.quantity.toLocaleString("en-US");
  const tooltip = [name, status, movable ? moveHint : undefined]
    .filter(Boolean)
    .join("\n");

  function onKeyDown(event: KeyboardEvent) {
    if (!movable || event.key !== "Enter") return;
    event.preventDefault();
    if (event.shiftKey) onPickAmount();
    else onMoveAll();
  }

  return (
    <div
      className={classes.join(" ")}
      title={tooltip}
      tabIndex={movable ? 0 : undefined}
      onPointerDown={movable ? onPointerDown : undefined}
      onDoubleClick={movable ? onMoveAll : undefined}
      onKeyDown={onKeyDown}
    >
      <div className="tile-plate">
        {iconUrl ? (
          <img src={iconUrl} alt="" loading="lazy" draggable={false} />
        ) : (
          <span className="tile-noicon" aria-hidden="true" />
        )}
        {tile.quantity > 0 && (
          <span className="tile-qty">{formatQuantity(tile.quantity)}</span>
        )}
      </div>
      <div className="tile-name">{name}</div>
    </div>
  );
}
