import { useMemo, useState } from "react";
import { useConnection, useSmartObject } from "@evefrontier/dapp-kit";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { CLAIM_PACKAGE_ID, isConfiguredPackageId } from "./config";
import { ClaimPanel } from "./ClaimPanel";
import { OwnerPanel } from "./OwnerPanel";
import { compactAddress, readAssembly } from "./objectReaders";
import { StatusLine } from "./StatusLine";
import {
  buildAuthorizeTx,
  buildClaimTx,
  buildStockTx,
  signAndExecute,
} from "./transactions";
import type { DAppKitSigner, ResolvedAssembly, StatusState, SmartObjectState } from "./types";
import { readUrlContext } from "./urlContext";
import { usePlayerCharacter } from "./usePlayerCharacter";

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
  const [typeId, setTypeId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [ownerCapId, setOwnerCapId] = useState(assembly?.ownerCapId || "");
  const [status, setStatus] = useState<StatusState>({
    state: "idle",
    message: isConfiguredPackageId(CLAIM_PACKAGE_ID)
      ? "ready"
      : "claim package not configured",
  });

  async function runTx(label: string, build: () => ReturnType<typeof buildClaimTx>) {
    try {
      setStatus({ state: "building", message: `${label}: building transaction` });
      const tx = build();
      setStatus({ state: "awaiting-signature", message: `${label}: awaiting signature` });
      const digest = await signAndExecute(dAppKit, tx);
      setStatus({ state: "submitted", message: `${label}: submitted`, digest });
      await smartObject.refetch?.();
      setStatus({ state: "done", message: `${label}: done`, digest });
    } catch (error) {
      setStatus({
        state: "failed",
        message: error instanceof Error ? error.message : `${label}: failed`,
      });
    }
  }

  const character = playerCharacter.character;
  const walletAddress = account?.address;

  return (
    <main className="app-shell">
      <header>
        <div>
          <p className="eyebrow">Shared storage</p>
          <h1>{assembly?.name || urlContext.itemId || "SSU open shelf"}</h1>
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

      <ClaimPanel
        assembly={assembly}
        character={character}
        typeId={typeId}
        quantity={quantity}
        setTypeId={setTypeId}
        setQuantity={setQuantity}
        onClaim={() =>
          runTx("withdraw", () =>
            buildClaimTx({
              storageUnitId: assembly?.id || "",
              characterId: character?.id || "",
              typeId,
              quantity,
            }),
          )
        }
        status={status}
      />

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

      <StatusLine status={status} />
    </main>
  );
}

export default App;
