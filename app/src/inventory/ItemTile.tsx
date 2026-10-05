import { useRef } from "react";
import type { KeyboardEvent, MouseEvent, PointerEvent } from "react";
import { formatQuantity } from "./format";
import type { TileModel } from "./moves";
import type { ClickModifiers } from "./selection";

interface ItemTileProps {
  tile: TileModel;
  name: string;
  iconUrl?: string;
  /** Can this tile be dragged / double-clicked across right now? */
  movable: boolean;
  /** Part of the current selection (moves with it when dragged). */
  selected: boolean;
  /** Tooltip line describing what moving this tile does. */
  moveHint?: string;
  onPointerDown: (event: PointerEvent) => void;
  /** A single click: select this tile, or extend/toggle with Shift/Ctrl. */
  onSelect: (modifiers: ClickModifiers) => void;
  /** Move the whole tile across (double-click, Enter). */
  onMoveAll: () => void;
  /** Ask for an amount (right-click, or Shift+Enter with `viaKeyboard`). */
  onPickAmount: (viaKeyboard: boolean) => void;
}

/** Two clicks on one tile within this window count as a double-click. */
const DOUBLE_CLICK_MS = 400;

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
  selected,
  moveHint,
  onPointerDown,
  onSelect,
  onMoveAll,
  onPickAmount,
}: ItemTileProps) {
  const classes = ["tile"];
  if (tile.ghost) classes.push("ghost");
  if (tile.departing) classes.push("departing");
  if (movable) classes.push("movable");
  if (movable && selected) classes.push("selected");

  const status = tile.ghost
    ? tile.quantity.toLocaleString("en-US") + " staged to arrive"
    : tile.departing
      ? "All staged to leave"
      : tile.quantity.toLocaleString("en-US");
  const tooltip = [name, status, movable ? moveHint : undefined]
    .filter(Boolean)
    .join("\n");

  // Double-clicks are timed from plain clicks rather than read from the
  // browser's dblclick event: an embedded host may never report a click
  // count of 2, and listening to both would fire twice where it does.
  // Ctrl/Shift clicks only edit the selection and never count toward one.
  const lastClick = useRef(0);
  function onClick(event: MouseEvent) {
    const toggle = event.ctrlKey || event.metaKey;
    const range = event.shiftKey;
    if (toggle || range) {
      lastClick.current = 0;
      onSelect({ toggle, range });
      return;
    }
    const now = Date.now();
    if (now - lastClick.current <= DOUBLE_CLICK_MS) {
      lastClick.current = 0;
      onMoveAll();
    } else {
      lastClick.current = now;
      onSelect({ toggle: false, range: false });
    }
  }

  // Right-click is the amount picker that needs no modifier key, in case a
  // host drops Shift from mouse events.
  function onContextMenu(event: MouseEvent) {
    event.preventDefault();
    onPickAmount(false);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (!movable || event.key !== "Enter") return;
    event.preventDefault();
    if (event.shiftKey) onPickAmount(true);
    else onMoveAll();
  }

  return (
    <div
      className={classes.join(" ")}
      title={tooltip}
      tabIndex={movable ? 0 : undefined}
      data-tile-key={movable ? tile.key : undefined}
      onPointerDown={movable ? onPointerDown : undefined}
      onClick={movable ? onClick : undefined}
      onContextMenu={movable ? onContextMenu : undefined}
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
