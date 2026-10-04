import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { PanelId } from "./moves";

/**
 * Pointer-event drag and drop between the two inventory panels.
 *
 * Deliberately NOT the HTML5 drag-and-drop API: the in-game browser renders
 * off-screen (embedded Chromium), where native drag sessions depend on the
 * host implementing them and commonly never start. Plain pointer events work
 * anywhere a mouse does.
 */

export interface DragPayload {
  typeId: number;
  from: PanelId;
  /** Most that can move from the dragged tile (its badge count). */
  max: number;
  /** The dragged tile is a staged arrival being put back. */
  ghost: boolean;
  iconUrl?: string;
}

export interface DragState extends DragPayload {
  x: number;
  y: number;
  /** Panel under the pointer that accepts this drop, if any. */
  over?: PanelId;
}

export interface DropEvent extends DragPayload {
  to: PanelId;
  /** Shift held at the drop: ask for an amount instead of the whole stack. */
  pickAmount: boolean;
}

/** Movement (px) before a press becomes a drag, so double-clicks stay clicks. */
const DRAG_THRESHOLD = 5;

function panelAt(x: number, y: number): PanelId | undefined {
  const element = document.elementFromPoint(x, y);
  const zone = element?.closest<HTMLElement>("[data-drop-panel]");
  const panel = zone?.dataset.dropPanel;
  return panel === "shared" || panel === "own" ? panel : undefined;
}

export function useTileDrag(onDrop: (event: DropEvent) => void) {
  const [drag, setDrag] = useState<DragState>();
  const press = useRef<{
    payload: DragPayload;
    x: number;
    y: number;
    active: boolean;
    /** The host reported the held button at pointerdown (see onMove). */
    tracksButtons: boolean;
  }>(undefined);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  const end = useCallback(() => {
    press.current = undefined;
    setDrag(undefined);
  }, []);

  useEffect(() => {
    function onMove(event: PointerEvent) {
      const current = press.current;
      if (!current) return;
      // The release happened somewhere we never heard about (e.g. outside
      // the in-game browser surface): drop the drag rather than leave a
      // ghost glued to a cursor with no button held. Only trusted when the
      // host reported the button at pointerdown, so hosts that never fill
      // in `buttons` still drag normally.
      if (current.tracksButtons && (event.buttons & 1) === 0) {
        end();
        return;
      }
      if (!current.active) {
        const distance = Math.hypot(event.clientX - current.x, event.clientY - current.y);
        if (distance < DRAG_THRESHOLD) return;
        current.active = true;
      }
      const over = panelAt(event.clientX, event.clientY);
      setDrag({
        ...current.payload,
        x: event.clientX,
        y: event.clientY,
        over: over && over !== current.payload.from ? over : undefined,
      });
    }

    function onUp(event: PointerEvent) {
      const current = press.current;
      if (!current) return;
      if (current.active) {
        const to = panelAt(event.clientX, event.clientY);
        if (to && to !== current.payload.from) {
          onDropRef.current({ ...current.payload, to, pickAmount: event.shiftKey });
        }
      }
      end();
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && press.current) end();
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", end);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", end);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", end);
    };
  }, [end]);

  /** Call from a tile's onPointerDown. */
  const begin = useCallback((event: ReactPointerEvent, payload: DragPayload) => {
    if (event.button !== 0 || event.pointerType === "touch" || payload.max <= 0) return;
    press.current = {
      payload,
      x: event.clientX,
      y: event.clientY,
      active: false,
      tracksButtons: (event.buttons & 1) === 1,
    };
  }, []);

  return { drag, begin };
}
