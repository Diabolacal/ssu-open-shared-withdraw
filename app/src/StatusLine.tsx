import { compactAddress } from "./objectReaders";
import type { StatusState } from "./types";

interface StatusLineProps {
  status: StatusState;
}

export function StatusLine({ status }: StatusLineProps) {
  return (
    <div className={`status status-${status.state}`}>
      <span>{status.message}</span>
      {status.digest && <span>digest {compactAddress(status.digest)}</span>}
    </div>
  );
}

