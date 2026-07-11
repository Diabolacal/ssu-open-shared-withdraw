interface OwnerNoticeProps {
  /** Our extension is the authorized one. */
  authorized: boolean;
  /** Raw on-chain extension type, null when none is authorized. */
  extensionType: string | null;
  /** true / false when known; undefined when it could not be determined. */
  isOwner?: boolean;
  canAuthorize: boolean;
  busy: boolean;
  onAuthorize: () => void;
}

function shortType(extensionType: string): string {
  const parts = extensionType.split("::");
  if (parts.length < 3) return extensionType;
  return `${parts[0].slice(0, 8)}…::${parts[1]}::${parts[2]}`;
}

/**
 * Shown only while shared access is not enabled: tells visitors why the shelf
 * is read-only and gives the owner the enable (or replace) button.
 */
export function OwnerNotice({
  authorized,
  extensionType,
  isOwner,
  canAuthorize,
  busy,
  onAuthorize,
}: OwnerNoticeProps) {
  if (authorized) return null;

  const foreign = extensionType !== null;

  if (isOwner === false) {
    return (
      <div className="notice">
        {foreign
          ? "This unit is running a different dApp, so items cannot be taken here."
          : "Shared access is not enabled on this unit yet. Only the owner can enable it."}
      </div>
    );
  }

  const enableButton = (
    <button
      type="button"
      className="action wide"
      disabled={busy || !canAuthorize}
      onClick={onAuthorize}
    >
      {foreign ? "Replace and enable shared access" : "Enable shared access"}
    </button>
  );

  if (isOwner === true) {
    return (
      <div className="notice owner">
        <p>
          {foreign
            ? `Another dApp is authorized on this unit (${shortType(extensionType)}). Enabling shared access will replace it.`
            : "Shared access is off. Enable it so anyone can take from and add to this unit."}
        </p>
        {enableButton}
        {!canAuthorize && (
          <p className="hint">Connect the owner wallet to enable.</p>
        )}
      </div>
    );
  }

  // Owner unknown (e.g. opened without in-game context): explain the
  // read-only state and keep the tool visible (open by default — owners
  // must be able to find it). The chain rejects non-owners anyway.
  return (
    <>
      {foreign && (
        <div className="notice">
          This unit is running a different dApp, so items cannot be taken here.
        </div>
      )}
      <details className="owner-tools" open>
        <summary>Owner setup</summary>
        <div className="notice owner">
          <p>
            {foreign
              ? `Another dApp is authorized on this unit (${shortType(extensionType)}). Enabling shared access will replace it.`
              : "Shared access is off. If you own this unit, enable it so anyone can take from and add to it."}
          </p>
          {enableButton}
        </div>
      </details>
    </>
  );
}
