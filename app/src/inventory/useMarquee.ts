import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";

/**
 * Box (rubber-band) selection inside a scrolling storage window: press on
 * empty space and drag to select every tile the box touches.
 *
 * Coordinates are kept in the window's CONTENT space (scroll included), so
 * the box stays anchored where it started when the window scrolls under it.
 * Tiles opt in with a `data-tile-key` attribute.
 */

export interface MarqueeBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface MarqueeOptions {
  bodyRef: RefObject<HTMLElement | null>;
  /** The box changed: these tile keys (display order) are under it. */
  onBox: (hits: string[], additive: boolean) => void;
  /** A press on empty space that never grew into a box. */
  onEmptyClick: (additive: boolean) => void;
  /** Escape abandoned the box: put back the selection it started from. */
  onCancel: () => void;
}

/** Movement (px) before a press on empty space becomes a box. */
const BOX_THRESHOLD = 4;
/** Within this many px of the window's top or bottom edge, dragging scrolls it. */
const EDGE = 20;
const SCROLL_STEP = 16;

export function useMarquee({ bodyRef, onBox, onEmptyClick, onCancel }: MarqueeOptions) {
  const [box, setBox] = useState<MarqueeBox>();
  const press = useRef<{
    x: number;
    y: number;
    startClientY: number;
    clientX: number;
    clientY: number;
    additive: boolean;
    /** The hits last reported, so an unchanged box doesn't re-select. */
    lastHits: string;
    active: boolean;
    /** The host reported the held button at pointerdown (see useTileDrag). */
    tracksButtons: boolean;
  }>(undefined);
  const handlers = useRef({ onBox, onEmptyClick, onCancel });
  handlers.current = { onBox, onEmptyClick, onCancel };

  const end = useCallback(() => {
    press.current = undefined;
    setBox(undefined);
  }, []);

  useEffect(() => {
    function update() {
      const current = press.current;
      const body = bodyRef.current;
      if (!current?.active || !body) return;
      const rect = body.getBoundingClientRect();
      const toContentX = (clientX: number) => clientX - rect.left + body.scrollLeft;
      const toContentY = (clientY: number) => clientY - rect.top + body.scrollTop;
      const x = Math.min(Math.max(toContentX(current.clientX), 0), body.scrollWidth);
      const y = Math.min(Math.max(toContentY(current.clientY), 0), body.scrollHeight);
      const left = Math.min(current.x, x);
      const top = Math.min(current.y, y);
      const right = Math.max(current.x, x);
      const bottom = Math.max(current.y, y);
      setBox({ left, top, width: right - left, height: bottom - top });

      const hits: string[] = [];
      for (const tile of body.querySelectorAll<HTMLElement>("[data-tile-key]")) {
        const r = tile.getBoundingClientRect();
        const tileLeft = toContentX(r.left);
        const tileTop = toContentY(r.top);
        const touches =
          tileLeft < right &&
          tileLeft + r.width > left &&
          tileTop < bottom &&
          tileTop + r.height > top;
        if (touches && tile.dataset.tileKey) hits.push(tile.dataset.tileKey);
      }
      const hitsKey = hits.join(" ");
      if (hitsKey === current.lastHits) return;
      current.lastHits = hitsKey;
      handlers.current.onBox(hits, current.additive);
    }

    function onMove(event: PointerEvent) {
      const current = press.current;
      const body = bodyRef.current;
      if (!current || !body) return;
      if (current.tracksButtons && (event.buttons & 1) === 0) {
        end();
        return;
      }
      current.clientX = event.clientX;
      current.clientY = event.clientY;
      if (!current.active) {
        const rect = body.getBoundingClientRect();
        const distance = Math.hypot(
          event.clientX - rect.left + body.scrollLeft - current.x,
          event.clientY - rect.top + body.scrollTop - current.y,
        );
        if (distance < BOX_THRESHOLD) return;
        current.active = true;
      }
      // Dragging toward the top or bottom edge scrolls the window; the scroll
      // listener below then refreshes the box.
      const rect = body.getBoundingClientRect();
      const upward = event.clientY < current.startClientY;
      if (upward && event.clientY < rect.top + EDGE) body.scrollTop -= SCROLL_STEP;
      else if (!upward && event.clientY > rect.bottom - EDGE) body.scrollTop += SCROLL_STEP;
      update();
    }

    function onUp() {
      const current = press.current;
      if (!current) return;
      if (!current.active) handlers.current.onEmptyClick(current.additive);
      end();
    }

    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || !press.current) return;
      // Claim the key so the window's "Escape clears the selection" skips it.
      event.preventDefault();
      if (press.current.active) handlers.current.onCancel();
      end();
    }

    const body = bodyRef.current;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", end);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", end);
    body?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", end);
      body?.removeEventListener("scroll", update);
    };
  }, [bodyRef, end]);

  /** Call from the window body's onPointerDown when the press missed every tile. */
  const begin = useCallback(
    (event: ReactPointerEvent) => {
      const body = bodyRef.current;
      if (!body || event.button !== 0 || event.pointerType === "touch") return;
      const rect = body.getBoundingClientRect();
      // A press on the scrollbar is scrolling, not selecting.
      if (event.clientX >= rect.left + body.clientLeft + body.clientWidth) return;
      press.current = {
        x: event.clientX - rect.left + body.scrollLeft,
        y: event.clientY - rect.top + body.scrollTop,
        startClientY: event.clientY,
        clientX: event.clientX,
        clientY: event.clientY,
        additive: event.ctrlKey || event.metaKey || event.shiftKey,
        lastHits: "",
        active: false,
        tracksButtons: (event.buttons & 1) === 1,
      };
    },
    [bodyRef],
  );

  return { box, begin };
}
