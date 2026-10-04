import { useEffect, useRef, useState } from "react";

interface QuantityDialogProps {
  title: string;
  itemName: string;
  max: number;
  onConfirm: (amount: number) => void;
  onCancel: () => void;
}

/** The shift-drag amount prompt, like the game's split-stack box. */
export function QuantityDialog({
  title,
  itemName,
  max,
  onConfirm,
  onCancel,
}: QuantityDialogProps) {
  const [value, setValue] = useState(String(max));
  const input = useRef<HTMLInputElement>(null);

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

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
          if (event.key === "Enter") submit();
        }}
      >
        <div className="dialog-title">{title}</div>
        <p className="dialog-item">{itemName}</p>
        <div className="dialog-row">
          <button
            type="button"
            className="step"
            title="One less"
            onClick={() => bump(-1)}
          >
            −
          </button>
          <input
            ref={input}
            inputMode="numeric"
            value={value}
            onChange={(event) => setValue(event.target.value.replace(/[^0-9]/g, ""))}
          />
          <button
            type="button"
            className="step"
            title="One more"
            onClick={() => bump(1)}
          >
            +
          </button>
          <button
            type="button"
            className="step max"
            title={`The whole stack (${max.toLocaleString("en-US")})`}
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
            type="button"
            className="action"
            title="Stage this amount. Nothing moves until you confirm below."
            disabled={!valid}
            onClick={submit}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
