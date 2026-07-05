import { useState } from "react";
import type { InventoryEntry } from "./inventories";
import type { StatusState } from "./types";

interface InventoryTableProps {
  entries: InventoryEntry[];
  names: Record<number, string>;
  actionLabel: string;
  emptyMessage: string;
  disabled: boolean;
  onAction: (typeId: number, quantity: number) => void;
}

function InventoryTable({
  entries,
  names,
  actionLabel,
  emptyMessage,
  disabled,
  onAction,
}: InventoryTableProps) {
  const [amounts, setAmounts] = useState<Record<number, string>>({});

  if (entries.length === 0) {
    return <p className="empty">{emptyMessage}</p>;
  }

  return (
    <table className="inventory">
      <thead>
        <tr>
          <th>item</th>
          <th>stored</th>
          <th>amount</th>
          <th aria-label="action" />
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => {
          const amount = amounts[entry.typeId] ?? String(entry.quantity);
          const parsed = Number(amount);
          const valid =
            Number.isInteger(parsed) && parsed > 0 && parsed <= entry.quantity;
          return (
            <tr key={entry.typeId}>
              <td>{names[entry.typeId] ?? `type ${entry.typeId}`}</td>
              <td className="qty">{entry.quantity}</td>
              <td>
                <input
                  inputMode="numeric"
                  value={amount}
                  onChange={(event) =>
                    setAmounts((previous) => ({
                      ...previous,
                      [entry.typeId]: event.target.value,
                    }))
                  }
                />
              </td>
              <td>
                <button
                  type="button"
                  disabled={disabled || !valid}
                  onClick={() => onAction(entry.typeId, parsed)}
                >
                  {actionLabel}
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

interface SharedStoragePanelProps {
  open: InventoryEntry[];
  own: InventoryEntry[];
  names: Record<number, string>;
  loading: boolean;
  error?: string;
  canTransact: boolean;
  canShare: boolean;
  status: StatusState;
  onTake: (typeId: number, quantity: number) => void;
  onPut: (typeId: number, quantity: number) => void;
  onRefresh: () => void;
}

export function SharedStoragePanel({
  open,
  own,
  names,
  loading,
  error,
  canTransact,
  canShare,
  status,
  onTake,
  onPut,
  onRefresh,
}: SharedStoragePanelProps) {
  const busy =
    status.state === "building" || status.state === "awaiting-signature";

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <div className="panel-title">Shared storage</div>
          <button
            type="button"
            className="refresh"
            disabled={loading}
            onClick={onRefresh}
          >
            {loading ? "loading" : "refresh"}
          </button>
        </div>
        {error && <div className="warning">{error}</div>}
        <InventoryTable
          entries={open}
          names={names}
          actionLabel="Take"
          emptyMessage="Nothing shared yet."
          disabled={busy || !canTransact}
          onAction={onTake}
        />
      </section>

      <section className="panel">
        <div className="panel-title">Your items in this SSU</div>
        <InventoryTable
          entries={own}
          names={names}
          actionLabel="Put in"
          emptyMessage="Nothing here. Deposit items into this SSU in game, then refresh."
          disabled={busy || !canTransact || !canShare}
          onAction={onPut}
        />
        {!canShare && own.length > 0 && (
          <p className="hint">Character owner cap not resolved yet.</p>
        )}
      </section>
    </>
  );
}
