import type { StatusState } from "./types";

interface StatusStripProps {
  status: StatusState;
}

/** Bottom status line, styled like the game's tooltip strip. */
export function StatusStrip({ status }: StatusStripProps) {
  if (status.state === "idle") return null;
  return (
    <div className={`status status-${status.state}`} role="status">
      <span>{status.message}</span>
    </div>
  );
}
