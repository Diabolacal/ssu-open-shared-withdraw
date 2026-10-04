import { Transaction } from "@mysten/sui/transactions";
import { CLAIM_MODULE, CLAIM_PACKAGE_ID, WORLD_PACKAGE_ID } from "./config";
import type { DAppKitSigner } from "./types";

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
 * Shares run first so a full personal slot frees room before takes land.
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
