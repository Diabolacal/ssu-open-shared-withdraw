import { FormEvent } from "react";
import { isConfiguredPackageId, CLAIM_PACKAGE_ID } from "./config";
import type { ResolvedAssembly, ResolvedCharacter, StatusState } from "./types";

interface ClaimPanelProps {
  assembly?: ResolvedAssembly;
  character?: ResolvedCharacter;
  typeId: string;
  quantity: string;
  setTypeId: (value: string) => void;
  setQuantity: (value: string) => void;
  onClaim: () => Promise<void>;
  status: StatusState;
}

export function ClaimPanel({
  assembly,
  character,
  typeId,
  quantity,
  setTypeId,
  setQuantity,
  onClaim,
  status,
}: ClaimPanelProps) {
  const disabled =
    status.state === "building" ||
    status.state === "awaiting-signature" ||
    !assembly?.id ||
    !character?.id ||
    !isConfiguredPackageId(CLAIM_PACKAGE_ID);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onClaim();
  }

  return (
    <form className="panel" onSubmit={submit}>
      <div className="panel-title">Open inventory</div>
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
      <button type="submit" disabled={disabled}>
        Withdraw to my SSU inventory
      </button>
    </form>
  );
}

