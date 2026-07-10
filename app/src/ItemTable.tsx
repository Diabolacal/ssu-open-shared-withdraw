import { useState } from "react";

export interface DisplayEntry {
  typeId: number;
  quantity: number;
}

export interface RowAction {
  label: string;
  onAction: (typeId: number, quantity: number) => void;
}

interface ItemTableProps {
  entries: DisplayEntry[];
  names: Record<number, string>;
  action?: RowAction;
  busy: boolean;
  emptyMessage: string;
}

/**
 * The in-game inventory list look: NAME / AMOUNT / ID columns. When an action
 * is available, clicking a row unfolds a quantity stepper and the action
 * button; at rest the list is indistinguishable from the game's own.
 */
export function ItemTable({
  entries,
  names,
  action,
  busy,
  emptyMessage,
}: ItemTableProps) {
  const [selected, setSelected] = useState<number>();
  const [amount, setAmount] = useState("");

  if (entries.length === 0) {
    return <p className="empty">{emptyMessage}</p>;
  }

  function toggle(entry: DisplayEntry) {
    if (!action) return;
    if (selected === entry.typeId) {
      setSelected(undefined);
    } else {
      setSelected(entry.typeId);
      setAmount(String(entry.quantity));
    }
  }

  function bump(entry: DisplayEntry, delta: number) {
    const current = Number(amount) || 0;
    const next = Math.min(Math.max(current + delta, 1), entry.quantity);
    setAmount(String(next));
  }

  return (
    <div className="table" role="table">
      <div className="table-head" role="row">
        <span>Name</span>
        <span>Amount</span>
        <span>ID</span>
      </div>
      {entries.map((entry) => {
        const isOpen = action && selected === entry.typeId;
        const parsed = Number(amount);
        const valid =
          Number.isInteger(parsed) && parsed > 0 && parsed <= entry.quantity;
        return (
          <div key={entry.typeId} className={isOpen ? "row open" : "row"}>
            <div
              className={action ? "row-line actionable" : "row-line"}
              role="row"
              tabIndex={action ? 0 : undefined}
              onClick={() => toggle(entry)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") toggle(entry);
              }}
            >
              <span className="cell-name">
                {names[entry.typeId] ?? `Item Type ${entry.typeId}`}
              </span>
              <span className="cell-amount">{entry.quantity}</span>
              <span className="cell-id">{entry.typeId}</span>
            </div>
            {isOpen && (
              <div className="row-controls">
                <button
                  type="button"
                  className="step"
                  aria-label="less"
                  disabled={busy}
                  onClick={() => bump(entry, -1)}
                >
                  −
                </button>
                <input
                  inputMode="numeric"
                  value={amount}
                  disabled={busy}
                  onChange={(event) =>
                    setAmount(event.target.value.replace(/[^0-9]/g, ""))
                  }
                />
                <button
                  type="button"
                  className="step"
                  aria-label="more"
                  disabled={busy}
                  onClick={() => bump(entry, 1)}
                >
                  +
                </button>
                <button
                  type="button"
                  className="step max"
                  disabled={busy}
                  onClick={() => setAmount(String(entry.quantity))}
                >
                  Max
                </button>
                <button
                  type="button"
                  className="action"
                  disabled={busy || !valid}
                  onClick={() => action.onAction(entry.typeId, parsed)}
                >
                  {action.label}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
