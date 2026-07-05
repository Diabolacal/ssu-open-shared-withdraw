import { FormEvent } from "react";
import type { ResolvedAssembly, ResolvedCharacter, StatusState } from "./types";

interface OwnerPanelProps {
  assembly?: ResolvedAssembly;
  character?: ResolvedCharacter;
  ownerCapId: string;
  setOwnerCapId: (value: string) => void;
  typeId: string;
  quantity: string;
  setTypeId: (value: string) => void;
  setQuantity: (value: string) => void;
  onAuthorize: () => Promise<void>;
  onStock: () => Promise<void>;
  status: StatusState;
}

export function OwnerPanel({
  assembly,
  character,
  ownerCapId,
  setOwnerCapId,
  typeId,
  quantity,
  setTypeId,
  setQuantity,
  onAuthorize,
  onStock,
  status,
}: OwnerPanelProps) {
  const busy = status.state === "building" || status.state === "awaiting-signature";
  const missingBase = !assembly?.id || !character?.id || !ownerCapId;

  function authorize(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onAuthorize();
  }

  function stock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onStock();
  }

  return (
    <section className="panel owner-panel">
      <div className="panel-title">Owner setup</div>
      <form onSubmit={authorize}>
        <label>
          <span>OwnerCap</span>
          <input
            value={ownerCapId}
            onChange={(event) => setOwnerCapId(event.target.value)}
            placeholder="0x..."
          />
        </label>
        <button type="submit" disabled={busy || missingBase}>
          Authorize extension
        </button>
      </form>
      <form onSubmit={stock}>
        <label>
          <span>type_id</span>
          <input
            inputMode="numeric"
            value={typeId}
            onChange={(event) => setTypeId(event.target.value)}
            placeholder="88069"
          />
        </label>
        <label>
          <span>quantity</span>
          <input
            inputMode="numeric"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            placeholder="1"
          />
        </label>
        <button type="submit" disabled={busy || missingBase}>
          Stock open shelf
        </button>
      </form>
    </section>
  );
}

