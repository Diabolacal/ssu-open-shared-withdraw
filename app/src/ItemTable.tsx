import { useEffect, useMemo, useRef, useState } from "react";

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

/** Short lists stay pristine; the filter box only appears past this. */
const FILTER_THRESHOLD = 20;

type SortState = { key: "name" | "amount"; dir: 1 | -1 };

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
  const [sort, setSort] = useState<SortState>();
  const [filter, setFilter] = useState("");
  const tableRef = useRef<HTMLDivElement>(null);

  // Entries arrive name-sorted; header clicks override that order.
  function toggleSort(key: SortState["key"]) {
    setSort((prev) => {
      if (prev?.key === key) return { key, dir: prev.dir === 1 ? -1 : 1 };
      // Amounts start biggest-first; names start A-to-Z.
      return { key, dir: key === "amount" ? -1 : 1 };
    });
  }

  const filterable = entries.length > FILTER_THRESHOLD;
  const visible = useMemo(() => {
    let list = entries;
    const needle = filterable ? filter.trim().toLowerCase() : "";
    if (needle) {
      list = list.filter((entry) => {
        const name = names[entry.typeId] ?? `Item Type ${entry.typeId}`;
        return (
          name.toLowerCase().includes(needle) ||
          String(entry.typeId).includes(needle)
        );
      });
    }
    if (!sort) return list;
    const sorted = [...list].sort((a, b) => {
      if (sort.key === "amount") return (a.quantity - b.quantity) * sort.dir;
      const nameA = names[a.typeId] ?? `Item Type ${a.typeId}`;
      const nameB = names[b.typeId] ?? `Item Type ${b.typeId}`;
      return nameA.localeCompare(nameB) * sort.dir;
    });
    return sorted;
  }, [entries, names, sort, filter, filterable]);

  // Clicking anywhere outside the table, or pressing Escape, closes the
  // open row — matching the "click away to dismiss" instinct.
  useEffect(() => {
    if (selected === undefined) return;
    function onPointerDown(event: MouseEvent) {
      if (!tableRef.current?.contains(event.target as Node)) {
        setSelected(undefined);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSelected(undefined);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [selected]);

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

  function sortMark(key: SortState["key"]) {
    if (sort?.key !== key) return "";
    return sort.dir === 1 ? " ▴" : " ▾";
  }

  return (
    <div className="table" role="table" ref={tableRef}>
      {filterable && (
        <div className="table-filter">
          <input
            type="text"
            placeholder="Filter items"
            title="Show only items whose name or ID contains this"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </div>
      )}
      <div className="table-head" role="row">
        <button
          type="button"
          className="sort"
          title="Sort by name. Click again to reverse."
          onClick={() => toggleSort("name")}
        >
          Name{sortMark("name")}
        </button>
        <button
          type="button"
          className="sort"
          title="Sort by amount. Click again to reverse."
          onClick={() => toggleSort("amount")}
        >
          Amount{sortMark("amount")}
        </button>
        <span>ID</span>
      </div>
      {visible.length === 0 && (
        <p className="empty">No items match your filter.</p>
      )}
      {visible.map((entry) => {
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
                  onClick={() => {
                    // Close the row as the action fires; reselect to repeat.
                    setSelected(undefined);
                    action.onAction(entry.typeId, parsed);
                  }}
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
