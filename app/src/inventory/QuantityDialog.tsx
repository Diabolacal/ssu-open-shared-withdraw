import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";

interface QuantityDialogProps {
  title: string;
  itemName: string;
  max: number;
  /**
   * Opened from the keyboard (Shift+Enter on a tile): ignore Enter until the
   * key that opened the box has been released, even if the host does not
   * flag its auto-repeats.
   */
  waitForEnterRelease?: boolean;
  onConfirm: (amount: number) => void;
  onCancel: () => void;
}

/**
 * A lone Enter key-up this long after opening is a deliberate press, not the
 * release of the key that opened the box (key repeat starts around 500 ms).
 */
const KEYUP_ONLY_GRACE_MS = 600;

function isEnter(event: KeyboardEvent): boolean {
  return event.key === "Enter" || event.nativeEvent.keyCode === 13;
}

/** The step buttons leave focus in the box, so Enter still confirms after them. */
function keepFocus(event: MouseEvent) {
  event.preventDefault();
}

/** The shift-drag amount prompt, like the game's split-stack box. */
export function QuantityDialog({
  title,
  itemName,
  max,
  waitForEnterRelease = false,
  onConfirm,
  onCancel,
}: QuantityDialogProps) {
  const [value, setValue] = useState(String(max));
  const input = useRef<HTMLInputElement>(null);
  const openedAt = useRef(performance.now());
  const sawEnterDown = useRef(false);
  const armed = useRef(!waitForEnterRelease);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const parsed = Number(value);
  const valid = Number.isInteger(parsed) && parsed > 0 && parsed <= max;

  function bump(delta: number) {
    const current = Number(value) || 0;
    setValue(String(Math.min(Math.max(current + delta, 1), max)));
  }

  function submit() {
    if (valid) onConfirm(parsed);
  }

  // Enter is handled on the key itself rather than left to the form: the
  // browser only submits a form on Enter's character event, which an
  // embedded host like the in-game browser may never deliver.
  function onInputKeyDown(event: KeyboardEvent) {
    if (!isEnter(event)) return;
    event.preventDefault();
    sawEnterDown.current = true;
    // A held Enter (e.g. the Shift+Enter that opened this box) auto-repeats;
    // only a fresh press confirms.
    if (armed.current && !event.repeat) submit();
  }

  // Fallback for a host that reports Enter's key-up but not its key-down.
  // The grace period skips the release of the key that opened this box.
  function onInputKeyUp(event: KeyboardEvent) {
    if (!isEnter(event)) return;
    if (!armed.current) {
      armed.current = true;
      return;
    }
    if (sawEnterDown.current) return;
    if (performance.now() - openedAt.current >= KEYUP_ONLY_GRACE_MS) submit();
  }

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          onCancel();
        }}
      >
        <div className="dialog-title">{title}</div>
        <p className="dialog-item">{itemName}</p>
        <div className="dialog-row">
          <button
            type="button"
            className="step"
            title="One less"
            onMouseDown={keepFocus}
            onClick={() => bump(-1)}
          >
            −
          </button>
          <input
            ref={input}
            inputMode="numeric"
            value={value}
            onChange={(event) => setValue(event.target.value.replace(/[^0-9]/g, ""))}
            onKeyDown={onInputKeyDown}
            onKeyUp={onInputKeyUp}
          />
          <button
            type="button"
            className="step"
            title="One more"
            onMouseDown={keepFocus}
            onClick={() => bump(1)}
          >
            +
          </button>
          <button
            type="button"
            className="step max"
            title={`The whole stack (${max.toLocaleString("en-US")})`}
            onMouseDown={keepFocus}
            onClick={() => setValue(String(max))}
          >
            Max
          </button>
        </div>
        <div className="dialog-actions">
          <button type="button" title="Close without moving anything" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="submit"
            className="action"
            title="Stage this amount (or press Enter). Nothing moves until you confirm below."
            disabled={!valid}
          >
            OK
          </button>
        </div>
      </form>
    </div>
  );
}
