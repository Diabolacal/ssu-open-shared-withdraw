import { Transaction } from "@mysten/sui/transactions";
import { CLAIM_MODULE, CLAIM_PACKAGE_ID, WORLD_PACKAGE_ID } from "./config";
import type { DAppKitSigner } from "./types";
import { gql } from "./unitState";

function claimTarget(functionName: string): string {
  return `${CLAIM_PACKAGE_ID}::${CLAIM_MODULE}::${functionName}`;
}

export interface TakeLine {
  typeId: string;
  /** Taken from the main hangar (the shared storage). */
  mainQuantity: number;
  /** Drained from leftovers older versions of this dApp parked in the open inventory. */
  openQuantity: number;
}

export interface ShareLine {
  typeId: string;
  quantity: number;
}

/**
 * Every staged move in ONE transaction (one signature, one gas charge).
 *
 * Takes run first. Every deposit is capacity-checked, and the side that
 * fills up is the main hangar (a personal slot is created with the main
 * hangar's own max capacity), so letting takes free main-hangar room before
 * shares land means the transaction fits whenever the NET result fits. The
 * capacity preview in SharedInventory assumes exactly this order.
 *
 * The character's OwnerCap is borrowed once and passed by reference to every
 * `put`, then returned; `take` needs no cap.
 */
export function buildMoveTx(input: {
  storageUnitId: string;
  characterId: string;
  characterOwnerCapId?: string;
  takes: TakeLine[];
  shares: ShareLine[];
}): Transaction {
  const tx = new Transaction();

  for (const take of input.takes) {
    if (take.mainQuantity > 0) {
      tx.moveCall({
        target: claimTarget("take"),
        arguments: [
          tx.object(input.storageUnitId),
          tx.object(input.characterId),
          tx.pure.u64(BigInt(take.typeId)),
          tx.pure.u32(take.mainQuantity),
        ],
      });
    }
    if (take.openQuantity > 0) {
      tx.moveCall({
        target: claimTarget("claim_from_open"),
        arguments: [
          tx.object(input.storageUnitId),
          tx.object(input.characterId),
          tx.pure.u64(BigInt(take.typeId)),
          tx.pure.u32(take.openQuantity),
        ],
      });
    }
  }

  if (input.shares.length > 0) {
    if (!input.characterOwnerCapId) throw new Error("Character not ready to share yet.");
    const [ownerCap, receipt] = tx.moveCall({
      target: `${WORLD_PACKAGE_ID}::character::borrow_owner_cap`,
      typeArguments: [`${WORLD_PACKAGE_ID}::character::Character`],
      arguments: [tx.object(input.characterId), tx.object(input.characterOwnerCapId)],
    });
    for (const share of input.shares) {
      tx.moveCall({
        target: claimTarget("put"),
        arguments: [
          tx.object(input.storageUnitId),
          tx.object(input.characterId),
          ownerCap,
          tx.pure.u64(BigInt(share.typeId)),
          tx.pure.u32(share.quantity),
        ],
      });
    }
    tx.moveCall({
      target: `${WORLD_PACKAGE_ID}::character::return_owner_cap`,
      typeArguments: [`${WORLD_PACKAGE_ID}::character::Character`],
      arguments: [tx.object(input.characterId), ownerCap, receipt],
    });
  }
  return tx;
}

/** Owner enables shared access by authorizing the ClaimAuth extension. */
export function buildAuthorizeTx(input: {
  storageUnitId: string;
  ownerCharacterId: string;
  ownerCapId: string;
}): Transaction {
  const tx = new Transaction();
  const [ownerCap, receipt] = tx.moveCall({
    target: `${WORLD_PACKAGE_ID}::character::borrow_owner_cap`,
    typeArguments: [`${WORLD_PACKAGE_ID}::storage_unit::StorageUnit`],
    arguments: [tx.object(input.ownerCharacterId), tx.object(input.ownerCapId)],
  });

  tx.moveCall({
    target: claimTarget("authorize"),
    arguments: [tx.object(input.storageUnitId), ownerCap],
  });

  tx.moveCall({
    target: `${WORLD_PACKAGE_ID}::character::return_owner_cap`,
    typeArguments: [`${WORLD_PACKAGE_ID}::storage_unit::StorageUnit`],
    arguments: [tx.object(input.ownerCharacterId), ownerCap, receipt],
  });
  return tx;
}

/** Owner turns shared access back off (items stay where they are). */
export function buildRevokeTx(input: {
  storageUnitId: string;
  ownerCharacterId: string;
  ownerCapId: string;
}): Transaction {
  const tx = new Transaction();
  const [ownerCap, receipt] = tx.moveCall({
    target: `${WORLD_PACKAGE_ID}::character::borrow_owner_cap`,
    typeArguments: [`${WORLD_PACKAGE_ID}::storage_unit::StorageUnit`],
    arguments: [tx.object(input.ownerCharacterId), tx.object(input.ownerCapId)],
  });

  tx.moveCall({
    target: `${WORLD_PACKAGE_ID}::storage_unit::revoke_extension_authorization`,
    arguments: [tx.object(input.storageUnitId), ownerCap],
  });

  tx.moveCall({
    target: `${WORLD_PACKAGE_ID}::character::return_owner_cap`,
    typeArguments: [`${WORLD_PACKAGE_ID}::storage_unit::StorageUnit`],
    arguments: [tx.object(input.ownerCharacterId), ownerCap, receipt],
  });
  return tx;
}

export async function signAndExecute(
  signer: DAppKitSigner,
  transaction: Transaction,
): Promise<string> {
  const execute = signer.signAndExecute || signer.signAndExecuteTransaction;
  if (!execute) throw new Error("Wallet cannot execute transactions.");

  // The in-game client wallet resolves without a digest field on success;
  // treat resolving as submitted and report the digest when there is one.
  const result = await execute({ transaction });
  return result?.digest ?? "";
}

const INDEX_POLL_MS = 500;
const INDEX_TIMEOUT_MS = 12_000;
/** The in-game wallet returns no digest; give the indexer this long instead. */
const NO_DIGEST_SETTLE_MS = 3_000;

const TX_QUERY = `query TxIndexed($digest: String!) { transaction(digest: $digest) { digest } }`;

/**
 * Resolves once the public GraphQL index has the transaction, so a re-read
 * shows its effects instead of the pre-transaction inventories. Gives up
 * quietly after a timeout (the regular poll catches up from there).
 */
export async function waitForIndexed(digest: string): Promise<void> {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  if (!digest) {
    await sleep(NO_DIGEST_SETTLE_MS);
    return;
  }
  const deadline = Date.now() + INDEX_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const data = await gql(TX_QUERY, { digest });
      if ((data?.transaction as { digest?: string } | null)?.digest) return;
    } catch {
      // Transient read failure: keep waiting until the deadline.
    }
    await sleep(INDEX_POLL_MS);
  }
}
