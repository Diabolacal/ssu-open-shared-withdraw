import { useEffect, useMemo, useRef, useState } from "react";
import { useConnection, useSmartObject } from "@evefrontier/dapp-kit";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import {
  CLAIM_AUTH_TYPE,
  CLAIM_PACKAGE_ID,
  isConfiguredPackageId,
  normalizeTypeName,
  VOLUME_SCALE,
} from "./config";
import { applyDemoAction, demoCharacter, DEMO_TYPE_NAMES } from "./demo";
import { ItemTable } from "./ItemTable";
import { compactAddress } from "./objectReaders";
import { OwnerNotice } from "./OwnerNotice";
import { StatusStrip } from "./StatusStrip";
import {
  buildAuthorizeTx,
  buildPutTx,
  buildTakeTx,
  signAndExecute,
} from "./transactions";
import type { DAppKitSigner, SmartObjectState, StatusState } from "./types";
import { primeTypeNames, useTypeNames } from "./typeNames";
import { readUrlContext } from "./urlContext";
import { usePlayerCharacter } from "./usePlayerCharacter";
import { useUnitId } from "./useUnitId";
import { useUnitState } from "./useUnitState";
import type { Transaction } from "@mysten/sui/transactions";

interface ShelfEntry {
  typeId: number;
  quantity: number;
  mainQuantity: number;
  openQuantity: number;
}

function friendlyError(raw: string): string {
  const message = raw.toLowerCase();
  if (message.includes("insufficient capacity"))
    return "Not enough room in the destination. Clear some space, then retry.";
  if (message.includes("insufficient quantity"))
    return "Not enough of that item left. The list refreshes every few seconds.";
  if (message.includes("not online")) return "This unit is offline.";
  if (message.includes("extension"))
    return "Shared access is not enabled on this unit.";
  if (message.includes("gas"))
    return "Your wallet needs a little testnet SUI to pay gas.";
  if (
    message.includes("reject") ||
    message.includes("denied") ||
    message.includes("dismiss")
  )
    return "Signature request declined.";
  return raw.length > 140 ? `${raw.slice(0, 140)}…` : raw;
}

function formatM3(units: number): string {
  return (units / VOLUME_SCALE).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
}

function App() {
  const urlContext = useMemo(readUrlContext, []);
  const demo = urlContext.demo;
  if (demo) primeTypeNames(DEMO_TYPE_NAMES);

  const smartObject = useSmartObject() as SmartObjectState;
  const { hasEveVault, handleConnect } = useConnection();
  const account = useCurrentAccount();
  const dAppKit = useDAppKit() as DAppKitSigner;

  const unitId = useUnitId(urlContext, smartObject);

  const resolvedCharacter = usePlayerCharacter(
    demo ? undefined : account?.address,
    urlContext.characterId,
  );
  const character = demo ? demoCharacter() : resolvedCharacter.character;

  const { state, loading, error, refetch } = useUnitState(
    unitId,
    character?.ownerCapId,
    demo,
  );
  const unit = state?.unit;

  const shelf = useMemo<ShelfEntry[]>(() => {
    const byType = new Map<number, ShelfEntry>();
    for (const entry of state?.main?.entries ?? []) {
      byType.set(entry.typeId, {
        typeId: entry.typeId,
        quantity: entry.quantity,
        mainQuantity: entry.quantity,
        openQuantity: 0,
      });
    }
    for (const entry of state?.open?.entries ?? []) {
      const existing = byType.get(entry.typeId);
      if (existing) {
        existing.quantity += entry.quantity;
        existing.openQuantity = entry.quantity;
      } else {
        byType.set(entry.typeId, {
          typeId: entry.typeId,
          quantity: entry.quantity,
          mainQuantity: 0,
          openQuantity: entry.quantity,
        });
      }
    }
    return [...byType.values()].sort((a, b) => a.typeId - b.typeId);
  }, [state?.main, state?.open]);

  const ownEntries = state?.own?.entries ?? [];
  const names = useTypeNames(
    useMemo(
      () => [
        ...shelf.map((entry) => entry.typeId),
        ...ownEntries.map((entry) => entry.typeId),
      ],
      [shelf, ownEntries],
    ),
  );

  // Sort by player-facing name once resolved (unresolved sink to the bottom).
  function byName(a: { typeId: number }, b: { typeId: number }): number {
    const nameA = names[a.typeId];
    const nameB = names[b.typeId];
    if (nameA && nameB) return nameA.localeCompare(nameB);
    if (nameA) return -1;
    if (nameB) return 1;
    return a.typeId - b.typeId;
  }
  const shelfSorted = [...shelf].sort(byName);
  const ownSorted = [...ownEntries].sort(byName);

  const authorized = Boolean(
    unit?.extensionType &&
      normalizeTypeName(unit.extensionType) === CLAIM_AUTH_TYPE,
  );
  const isOwner = useMemo<boolean | undefined>(() => {
    if (!character?.id || !unit?.ownerCharacterId) return undefined;
    return character.id.toLowerCase() === unit.ownerCharacterId.toLowerCase();
  }, [character?.id, unit?.ownerCharacterId]);

  const [status, setStatus] = useState<StatusState>({
    state: "idle",
    message: "",
  });
  const statusTimer = useRef<number | undefined>(undefined);
  const busy = status.state === "building" || status.state === "awaiting-signature";

  function settleStatus(next: StatusState, clearAfterMs?: number) {
    window.clearTimeout(statusTimer.current);
    setStatus(next);
    if (clearAfterMs) {
      statusTimer.current = window.setTimeout(
        () => setStatus({ state: "idle", message: "" }),
        clearAfterMs,
      );
    }
  }

  async function runTx(input: {
    doneMessage: string;
    build: () => Transaction;
    simulate?: () => Promise<void>;
  }) {
    try {
      if (demo && input.simulate) {
        settleStatus({ state: "submitted", message: "Working…" });
        await input.simulate();
      } else {
        settleStatus({ state: "building", message: "Preparing…" });
        const tx = input.build();
        settleStatus({
          state: "awaiting-signature",
          message: "Confirm in your wallet…",
        });
        await signAndExecute(dAppKit, tx);
      }
      await refetch();
      settleStatus({ state: "done", message: input.doneMessage }, 9000);
    } catch (cause) {
      settleStatus({
        state: "failed",
        message: friendlyError(
          cause instanceof Error ? cause.message : "Something went wrong.",
        ),
      });
    }
  }

  function take(typeId: number, quantity: number) {
    const entry = shelf.find((candidate) => candidate.typeId === typeId);
    if (!entry || !unit || !character) return;
    const mainQuantity = Math.min(quantity, entry.mainQuantity);
    const openQuantity = quantity - mainQuantity;
    void runTx({
      doneMessage:
        "Done. Drag the items from the Storage Unit panel into your inventory.",
      build: () =>
        buildTakeTx({
          storageUnitId: unit.id,
          characterId: character.id,
          typeId: String(typeId),
          mainQuantity,
          openQuantity,
        }),
      simulate: () => applyDemoAction("take", typeId, quantity),
    });
  }

  function share(typeId: number, quantity: number) {
    if (!unit || !character?.ownerCapId) return;
    void runTx({
      doneMessage: "Shared. The items are on the shelf for everyone.",
      build: () =>
        buildPutTx({
          storageUnitId: unit.id,
          characterId: character.id,
          characterOwnerCapId: character.ownerCapId!,
          typeId: String(typeId),
          quantity,
        }),
      simulate: () => applyDemoAction("put", typeId, quantity),
    });
  }

  function authorize() {
    if (!unit?.ownerCapId || !character) return;
    void runTx({
      doneMessage: "Shared access enabled.",
      build: () =>
        buildAuthorizeTx({
          storageUnitId: unit.id,
          ownerCharacterId: character.id,
          ownerCapId: unit.ownerCapId!,
        }),
    });
  }

  const connected = demo || Boolean(account?.address);
  const packageReady = isConfiguredPackageId(CLAIM_PACKAGE_ID);
  const canTransact =
    connected && Boolean(unit && character) && (demo || packageReady);
  const canTake = canTransact && authorized && unit?.online !== false;
  const canShare = canTake && Boolean(character?.ownerCapId);

  // Clean up the status timer on unmount.
  useEffect(() => () => window.clearTimeout(statusTimer.current), []);

  const shelfCapacity = state?.main;

  return (
    <main className="shell">
      <header className="topbar">
        <span className="unit-name">{unit?.name || "Storage Unit"}</span>
        <span className="topbar-right">
          {demo && (
            <span className="tag" title="Demo data — transactions are simulated">
              Demo
            </span>
          )}
          {authorized && (
            <span className="tag" title="Shared access is enabled on this unit">
              Shared
            </span>
          )}
          {unit && unit.online === false && (
            <span className="tag warn" title="The unit is offline">
              Offline
            </span>
          )}
          {connected ? (
            <span className="who" title="Connected as">
              {character?.name ||
                (account?.address ? compactAddress(account.address) : "…")}
            </span>
          ) : hasEveVault ? (
            <button
              type="button"
              className="action"
              onClick={() => void handleConnect()}
            >
              Connect
            </button>
          ) : (
            <span className="tag warn" title="Open in game or install EVE Vault">
              No wallet
            </span>
          )}
          {unit && (
            <button
              type="button"
              className="step refresh"
              aria-label="refresh"
              title="Refresh"
              disabled={loading}
              onClick={() => void refetch()}
            >
              ⟳
            </button>
          )}
        </span>
      </header>

      {!unitId && !demo && (
        <div className="notice">
          No storage unit in the URL. Open this dApp from the unit in game, or
          pass ?storageUnitId=0x…
        </div>
      )}
      {error && <div className="notice warn-text">{error}</div>}
      {resolvedCharacter.error && !demo && connected && (
        <div className="notice warn-text">{resolvedCharacter.error}</div>
      )}
      {!packageReady && !demo && (
        <div className="notice warn-text">claim package not configured</div>
      )}

      {unit && (
        <OwnerNotice
          authorized={authorized}
          extensionType={unit.extensionType}
          isOwner={isOwner}
          canAuthorize={Boolean(connected && character && unit.ownerCapId)}
          busy={busy}
          onAuthorize={authorize}
        />
      )}

      <section className="panel">
        <div className="panel-title">Shared items</div>
        <ItemTable
          entries={shelfSorted}
          names={names}
          action={
            canTake && isOwner !== true
              ? { label: "Take", onAction: take }
              : undefined
          }
          busy={busy}
          emptyMessage={
            loading && !state ? "Reading the unit…" : "Nothing on the shelf yet."
          }
        />
        {shelfCapacity && shelfCapacity.maxCapacity > 0 && (
          <div className="capbar">
            <div
              className="capbar-fill"
              style={{
                width: `${Math.min(
                  (shelfCapacity.usedCapacity / shelfCapacity.maxCapacity) * 100,
                  100,
                )}%`,
              }}
            />
            <span className="capbar-label">
              {formatM3(shelfCapacity.usedCapacity)} /{" "}
              {formatM3(shelfCapacity.maxCapacity)} m3
            </span>
          </div>
        )}
        {isOwner === true && (
          <p className="hint">
            You own this unit: drag items in or out directly in the Storage
            Unit panel. Everything in it is shared.
          </p>
        )}
        {connected && !authorized && unit && isOwner !== true && (
          <p className="hint">Read-only until the owner enables shared access.</p>
        )}
      </section>

      {(isOwner !== true || ownEntries.length > 0) && (
        <section className="panel">
          <div className="panel-title">Your items in this unit</div>
          <ItemTable
            entries={ownSorted}
            names={names}
            action={canShare ? { label: "Share", onAction: share } : undefined}
            busy={busy}
            emptyMessage={
              connected
                ? "Nothing waiting. To add items: drag them into the Storage Unit panel, then share them here."
                : "Connect to see your items in this unit."
            }
          />
          {ownEntries.length > 0 && (
            <p className="hint">
              These are only visible to you. Drag them to your inventory in the
              Storage Unit panel, or share them onto the shelf.
            </p>
          )}
        </section>
      )}

      <StatusStrip status={status} />
    </main>
  );
}

export default App;
