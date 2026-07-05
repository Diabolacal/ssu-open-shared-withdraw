import { useMemo, useState } from "react";
import { useConnection, useSmartObject } from "@evefrontier/dapp-kit";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { CLAIM_PACKAGE_ID, isConfiguredPackageId } from "./config";
import { OwnerPanel } from "./OwnerPanel";
import { SharedStoragePanel } from "./SharedStoragePanel";
import { compactAddress, readAssembly } from "./objectReaders";
import { StatusLine } from "./StatusLine";
import {
  buildAuthorizeTx,
  buildClaimTx,
  buildShareTx,
  buildStockTx,
  signAndExecute,
} from "./transactions";
import type { DAppKitSigner, ResolvedAssembly, StatusState, SmartObjectState } from "./types";
import { readUrlContext } from "./urlContext";
import { useInventories } from "./useInventories";
import { usePlayerCharacter } from "./usePlayerCharacter";
import { useTypeNames } from "./typeNames";
import type { Transaction } from "@mysten/sui/transactions";

function App() {
  const urlContext = useMemo(readUrlContext, []);
  const smartObject = useSmartObject() as SmartObjectState;
  const { handleConnect, handleDisconnect } = useConnection();
  const account = useCurrentAccount();
  const dAppKit = useDAppKit() as DAppKitSigner;

  const assembly = useMemo<ResolvedAssembly | undefined>(() => {
    const read = readAssembly(smartObject.assembly, urlContext.storageUnitId);
    return read.id ? { id: read.id, name: read.name, state: read.state, ownerCapId: read.ownerCapId } : undefined;
  }, [smartObject.assembly, urlContext.storageUnitId]);

  const playerCharacter = usePlayerCharacter(account?.address, urlContext.characterId);
  const character = playerCharacter.character;
  const walletAddress = account?.address;

  const inventories = useInventories(assembly?.id, character?.ownerCapId);
  const typeNames = useTypeNames(
    useMemo(
      () => [
        ...inventories.open.map((entry) => entry.typeId),
        ...inventories.own.map((entry) => entry.typeId),
      ],
      [inventories.open, inventories.own],
    ),
  );

  const [typeId, setTypeId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [ownerCapId, setOwnerCapId] = useState(assembly?.ownerCapId || "");
  const [status, setStatus] = useState<StatusState>({
    state: "idle",
    message: isConfiguredPackageId(CLAIM_PACKAGE_ID)
      ? "ready"
      : "claim package not configured",
  });

  async function runTx(label: string, build: () => Transaction) {
    try {
      setStatus({ state: "building", message: `${label}: building transaction` });
      const tx = build();
      setStatus({ state: "awaiting-signature", message: `${label}: awaiting signature` });
      const digest = await signAndExecute(dAppKit, tx);
      setStatus({ state: "submitted", message: `${label}: submitted`, digest });
      await Promise.all([smartObject.refetch?.(), inventories.refetch()]);
      setStatus({ state: "done", message: `${label}: done`, digest });
    } catch (error) {
      setStatus({
        state: "failed",
        message: error instanceof Error ? error.message : `${label}: failed`,
      });
    }
  }

  function takeFromShared(entryTypeId: number, entryQuantity: number) {
    void runTx("take", () =>
      buildClaimTx({
        storageUnitId: assembly?.id || "",
        characterId: character?.id || "",
        typeId: String(entryTypeId),
        quantity: String(entryQuantity),
      }),
    );
  }

  function putIntoShared(entryTypeId: number, entryQuantity: number) {
    void runTx("put", () =>
      buildShareTx({
        storageUnitId: assembly?.id || "",
        characterId: character?.id || "",
        characterOwnerCapId: character?.ownerCapId || "",
        typeId: String(entryTypeId),
        quantity: String(entryQuantity),
      }),
    );
  }

  const canTransact = Boolean(
    assembly?.id && character?.id && isConfiguredPackageId(CLAIM_PACKAGE_ID),
  );

  return (
    <main className="app-shell">
      <header>
        <div>
          <p className="eyebrow">Shared storage</p>
          <h1>{assembly?.name || urlContext.itemId || "SSU shared storage"}</h1>
        </div>
        <button
          className="wallet-button"
          onClick={() => (walletAddress ? handleDisconnect() : handleConnect())}
        >
          {walletAddress ? compactAddress(walletAddress) : "Connect wallet"}
        </button>
      </header>

      <section className="facts">
        <div><span>SSU</span><strong>{compactAddress(assembly?.id)}</strong></div>
        <div><span>tenant</span><strong>{urlContext.tenant || "-"}</strong></div>
        <div><span>state</span><strong>{assembly?.state || "-"}</strong></div>
        <div><span>character</span><strong>{character?.name || compactAddress(character?.id)}</strong></div>
      </section>

      {Boolean(smartObject.error) && (
        <div className="warning">assembly lookup failed</div>
      )}
      {playerCharacter.error && (
        <div className="warning">{playerCharacter.error}</div>
      )}

      <SharedStoragePanel
        open={inventories.open}
        own={inventories.own}
        names={typeNames}
        loading={inventories.loading}
        error={inventories.error}
        canTransact={canTransact}
        canShare={Boolean(character?.ownerCapId)}
        status={status}
        onTake={takeFromShared}
        onPut={putIntoShared}
        onRefresh={() => void inventories.refetch()}
      />

      <StatusLine status={status} />

      <details className="owner-tools">
        <summary>Owner setup</summary>
        <OwnerPanel
          assembly={assembly}
          character={character}
          ownerCapId={ownerCapId}
          setOwnerCapId={setOwnerCapId}
          typeId={typeId}
          quantity={quantity}
          setTypeId={setTypeId}
          setQuantity={setQuantity}
          onAuthorize={() =>
            runTx("authorize", () =>
              buildAuthorizeTx({
                storageUnitId: assembly?.id || "",
                ownerCharacterId: character?.id || "",
                ownerCapId,
              }),
            )
          }
          onStock={() =>
            runTx("stock", () =>
              buildStockTx({
                storageUnitId: assembly?.id || "",
                ownerCharacterId: character?.id || "",
                ownerCapId,
                typeId,
                quantity,
              }),
            )
          }
          status={status}
        />
      </details>
    </main>
  );
}

export default App;
