import { useEffect, useMemo, useRef, useState } from "react";
import { useConnection, useSmartObject } from "@evefrontier/dapp-kit";
import { useCurrentAccount, useDAppKit, useWallets } from "@mysten/dapp-kit-react";
import {
  CLAIM_AUTH_TYPE,
  CLAIM_PACKAGE_ID,
  isConfiguredPackageId,
  normalizeTypeName,
} from "./config";
import { applyDemoMoves, demoCharacter } from "./demo";
import type { MoveSummary, StockEntry } from "./inventory/moves";
import { SharedInventory } from "./inventory/SharedInventory";
import { compactAddress } from "./objectReaders";
import { OwnerNotice } from "./OwnerNotice";
import {
  buildAuthorizeTx,
  buildMoveTx,
  buildRevokeTx,
  signAndExecute,
  waitForIndexed,
} from "./transactions";
import type { DAppKitSigner, SmartObjectState, StatusState } from "./types";
import { useTypeNames } from "./typeNames";
import { readUrlContext } from "./urlContext";
import { usePlayerCharacter } from "./usePlayerCharacter";
import { useUnitId } from "./useUnitId";
import { useUnitState } from "./useUnitState";
import type { Transaction } from "@mysten/sui/transactions";

interface ShelfEntry extends StockEntry {
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

// The in-game browser sometimes reopens the dApp without its query string;
// remembering the last unit gives players a one-click way back in.
const LAST_UNIT_KEY = "ssu-shared:last-unit";

function readLastUnit(): { id?: string; name?: string } | undefined {
  try {
    const raw = localStorage.getItem(LAST_UNIT_KEY);
    return raw ? (JSON.parse(raw) as { id?: string; name?: string }) : undefined;
  } catch {
    return undefined;
  }
}

function App() {
  const urlContext = useMemo(readUrlContext, []);
  const demo = urlContext.demo;

  const smartObject = useSmartObject() as SmartObjectState;
  const { hasEveVault, handleConnect } = useConnection();
  const account = useCurrentAccount();
  const dAppKit = useDAppKit() as DAppKitSigner;

  // In game the client wallet connects on its own, first visit included; the
  // browser EXTENSION never auto-connects (its unlock popup on load is what
  // the boot-time key clearing in main.tsx removes) — there, Connect is the
  // click in the top bar. "EVE Frontier Client Wallet" is the CEF-injected
  // wallet's registered name (dapp-kit SupportedWallets).
  const wallets = useWallets();
  const hasClientWallet = wallets.some((wallet) =>
    wallet.name.includes("EVE Frontier Client Wallet"),
  );
  const autoConnectTried = useRef(false);
  useEffect(() => {
    if (demo || autoConnectTried.current || account?.address || !hasClientWallet) return;
    autoConnectTried.current = true;
    void handleConnect();
  }, [demo, account?.address, hasClientWallet, handleConnect]);

  const [fallbackUnitId, setFallbackUnitId] = useState<string>();
  const unitId = useUnitId(urlContext, smartObject) || fallbackUnitId;
  const lastUnit = useMemo(readLastUnit, []);

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
        volume: entry.volume,
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
          volume: entry.volume,
          mainQuantity: 0,
          openQuantity: entry.quantity,
        });
      }
    }
    return [...byType.values()].sort((a, b) => a.typeId - b.typeId);
  }, [state?.main, state?.open]);

  const ownEntries = useMemo(() => state?.own?.entries ?? [], [state?.own]);
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
  // "submitted" covers the settle wait after signing: staged ghosts stay up
  // and nothing can be re-staged until the fresh read lands.
  const busy =
    status.state === "building" ||
    status.state === "awaiting-signature" ||
    status.state === "submitted";

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
    /**
     * Runs once the transaction's effects have been re-read, so staged ghosts
     * hand straight over to the real result (no snap-back in between).
     */
    onSettled?: () => void;
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
        const digest = await signAndExecute(dAppKit, tx);
        settleStatus({ state: "submitted", message: "Sent. Updating…" });
        await waitForIndexed(digest);
      }
      await refetch({ fresh: true });
      input.onSettled?.();
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

  /** A new staging action retires an old failure/done message. */
  function clearStaleStatus() {
    if (status.state === "failed" || status.state === "done") {
      settleStatus({ state: "idle", message: "" });
    }
  }

  /** Every staged take and share, in one transaction. */
  async function commitMoves(moves: MoveSummary, clearStaged: () => void) {
    if (!unit || !character) return;
    const takes = moves.takes.map(({ typeId, quantity }) => {
      // Drain the main hangar first; anything beyond comes from leftovers an
      // older version of this dApp parked in the open inventory.
      const entry = shelf.find((candidate) => candidate.typeId === typeId);
      const mainQuantity = Math.min(quantity, entry?.mainQuantity ?? 0);
      return { typeId: String(typeId), mainQuantity, openQuantity: quantity - mainQuantity };
    });
    const shares = moves.shares.map(({ typeId, quantity }) => ({
      typeId: String(typeId),
      quantity,
    }));
    await runTx({
      doneMessage:
        takes.length > 0
          ? "Done. Open the unit in game and drag your items into your inventory."
          : "Shared. Anyone can take them now.",
      build: () =>
        buildMoveTx({
          storageUnitId: unit.id,
          characterId: character.id,
          characterOwnerCapId: character.ownerCapId,
          takes,
          shares,
        }),
      simulate: () => applyDemoMoves(moves.takes, moves.shares),
      onSettled: clearStaged,
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

  function revoke() {
    if (!unit?.ownerCapId || !character) return;
    void runTx({
      doneMessage: "Shared access disabled. Items stay where they are.",
      build: () =>
        buildRevokeTx({
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

  // Remember the last unit this browser successfully opened.
  useEffect(() => {
    if (!unit?.id || demo) return;
    try {
      localStorage.setItem(
        LAST_UNIT_KEY,
        JSON.stringify({ id: unit.id, name: unit.name || "" }),
      );
    } catch {
      // Storage unavailable; recovery just won't be offered.
    }
  }, [unit?.id, unit?.name, demo]);

  let hint =
    "Drag items between the panels. Hold Shift to pick an amount. Double-click moves a whole stack.";
  if (!connected) {
    hint = hasEveVault
      ? "Connect to take or share items."
      : "Open this in game, or install EVE Vault, to take or share items.";
  } else if (unit && !authorized) {
    hint =
      isOwner === true
        ? "Enable shared access above so others can take and share."
        : "Read only until the owner enables shared access.";
  } else if (unit?.online === false) {
    hint = "This unit is offline.";
  } else if (isOwner === true) {
    hint = "You own this unit: move items in and out in game. Everything in it is shared.";
  } else if (!character) {
    hint = "Finding your character…";
  }

  const ownEmpty = !connected
    ? "Connect to see your items in this unit."
    : isOwner === true
      ? "Items you put in this unit in game go straight into shared storage."
      : "Drag items here to take them. To share something, put it in this unit in game first and it shows up here.";

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
          <p>
            No storage unit in the URL. Open this dApp from the unit in game,
            or pass ?storageUnitId=0x…
          </p>
          {lastUnit?.id && (
            <button
              type="button"
              className="action wide"
              onClick={() => setFallbackUnitId(lastUnit.id)}
            >
              {`Open last unit${lastUnit.name ? ` — ${lastUnit.name}` : ""}`}
            </button>
          )}
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

      {unit && (
        <SharedInventory
          // A different wallet/character starts with nothing staged.
          key={character?.id ?? "no-character"}
          shared={shelfSorted}
          own={ownSorted}
          sharedBucket={
            state?.main
              ? { used: state.main.usedCapacity, max: state.main.maxCapacity }
              : undefined
          }
          ownBucket={
            state?.own
              ? { used: state.own.usedCapacity, max: state.own.maxCapacity }
              : undefined
          }
          nameOf={(typeId) => names[typeId] ?? `Item Type ${typeId}`}
          canTake={canTake && isOwner !== true}
          canShare={canShare}
          busy={busy}
          status={status}
          hint={hint}
          sharedEmpty={
            loading && !state ? "Reading the unit…" : "Nothing in shared storage yet."
          }
          ownEmpty={ownEmpty}
          onCommit={commitMoves}
          onStagingChange={clearStaleStatus}
        />
      )}

      {authorized && isOwner === true && (
        <details className="owner-tools">
          <summary>Owner setup</summary>
          <div className="notice owner">
            <p>
              Shared access is on. Disabling stops anyone taking or adding;
              items stay where they are.
            </p>
            <button
              type="button"
              className="action wide"
              disabled={busy}
              onClick={revoke}
            >
              Disable shared access
            </button>
          </div>
        </details>
      )}

      {!unit && status.state !== "idle" && (
        <div className={`notice status-${status.state}`}>{status.message}</div>
      )}
    </main>
  );
}

export default App;
