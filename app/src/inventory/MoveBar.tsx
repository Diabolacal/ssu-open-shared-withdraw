import type { StatusState } from "../types";
import type { MoveSummary } from "./moves";

interface MoveBarProps {
  summary: MoveSummary;
  status: StatusState;
  busy: boolean;
  /** Plain guidance shown when nothing is staged and no status is up. */
  hint: string;
  /** Why the staged moves cannot be confirmed, if they can't. */
  blockedReason?: string;
  /** Offer the one-click "share everything in your items" shortcut. */
  canShareAll: boolean;
  onShareAll: () => void;
  onCommit: () => void;
  onClear: () => void;
}

function stacks(count: number): string {
  return `${count} stack${count === 1 ? "" : "s"}`;
}

/**
 * The strip between the two panels: guidance at rest, a summary of what is
 * staged, transaction status, and the single button that commits it all.
 */
export function MoveBar({
  summary,
  status,
  busy,
  hint,
  blockedReason,
  canShareAll,
  onShareAll,
  onCommit,
  onClear,
}: MoveBarProps) {
  const takes = summary.takes.length;
  const shares = summary.shares.length;
  const staged = takes + shares > 0;

  const commitLabel = takes && shares ? "Move all" : takes ? "Take all" : "Share all";
  const commitTip =
    takes && shares
      ? "Take and share everything staged, in one transaction"
      : takes
        ? "Take everything staged into your items, in one transaction"
        : "Share everything staged into shared storage, in one transaction";

  let message: string;
  let tone = "";
  if (status.state !== "idle") {
    message = status.message;
    tone = `status-${status.state}`;
  } else if (staged && blockedReason) {
    message = blockedReason;
    tone = "status-failed";
  } else if (staged) {
    const parts = [];
    if (takes) parts.push(`Taking ${stacks(takes)}`);
    if (shares) parts.push(`Sharing ${stacks(shares)}`);
    message = parts.join(", ");
  } else {
    message = hint;
    tone = "is-hint";
  }

  return (
    <div className="movebar" role="status">
      <span className={`movebar-text ${tone}`}>{message}</span>
      <span className="movebar-actions">
        {staged ? (
          <>
            <button
              type="button"
              title="Put everything staged back where it was"
              disabled={busy}
              onClick={onClear}
            >
              Cancel
            </button>
            <button
              type="button"
              className="action"
              title={commitTip}
              disabled={busy || Boolean(blockedReason)}
              onClick={onCommit}
            >
              {commitLabel}
            </button>
          </>
        ) : (
          canShareAll && (
            <button
              type="button"
              className="action"
              title="Share every item in your items with one transaction"
              disabled={busy}
              onClick={onShareAll}
            >
              Share all
            </button>
          )
        )}
      </span>
    </div>
  );
}
