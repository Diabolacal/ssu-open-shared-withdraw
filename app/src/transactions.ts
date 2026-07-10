import { Transaction } from "@mysten/sui/transactions";
import { CLAIM_MODULE, CLAIM_PACKAGE_ID, WORLD_PACKAGE_ID } from "./config";
import type { DAppKitSigner } from "./types";

function claimTarget(functionName: string): string {
  return `${CLAIM_PACKAGE_ID}::${CLAIM_MODULE}::${functionName}`;
}

/**
 * Take items from the shared shelf into the caller's own slot. The shelf is
 * the main hangar; `openQuantity` drains any leftovers that older versions of
 * this dApp parked in the open inventory, in the same transaction.
 */
export function buildTakeTx(input: {
  storageUnitId: string;
  characterId: string;
  typeId: string;
  mainQuantity: number;
  openQuantity: number;
}): Transaction {
  const tx = new Transaction();
  if (input.mainQuantity > 0) {
    tx.moveCall({
      target: claimTarget("take"),
      arguments: [
        tx.object(input.storageUnitId),
        tx.object(input.characterId),
        tx.pure.u64(BigInt(input.typeId)),
        tx.pure.u32(input.mainQuantity),
      ],
    });
  }
  if (input.openQuantity > 0) {
    tx.moveCall({
      target: claimTarget("claim_from_open"),
      arguments: [
        tx.object(input.storageUnitId),
        tx.object(input.characterId),
        tx.pure.u64(BigInt(input.typeId)),
        tx.pure.u32(input.openQuantity),
      ],
    });
  }
  return tx;
}

/** Move items from the caller's own slot onto the shared shelf (main hangar). */
export function buildPutTx(input: {
  storageUnitId: string;
  characterId: string;
  characterOwnerCapId: string;
  typeId: string;
  quantity: number;
}): Transaction {
  const tx = new Transaction();
  const [ownerCap, receipt] = tx.moveCall({
    target: `${WORLD_PACKAGE_ID}::character::borrow_owner_cap`,
    typeArguments: [`${WORLD_PACKAGE_ID}::character::Character`],
    arguments: [tx.object(input.characterId), tx.object(input.characterOwnerCapId)],
  });

  tx.moveCall({
    target: claimTarget("put"),
    arguments: [
      tx.object(input.storageUnitId),
      tx.object(input.characterId),
      ownerCap,
      tx.pure.u64(BigInt(input.typeId)),
      tx.pure.u32(input.quantity),
    ],
  });

  tx.moveCall({
    target: `${WORLD_PACKAGE_ID}::character::return_owner_cap`,
    typeArguments: [`${WORLD_PACKAGE_ID}::character::Character`],
    arguments: [tx.object(input.characterId), ownerCap, receipt],
  });
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

export async function signAndExecute(
  signer: DAppKitSigner,
  transaction: Transaction,
): Promise<string> {
  const execute = signer.signAndExecute || signer.signAndExecuteTransaction;
  if (!execute) throw new Error("Wallet cannot execute transactions.");

  const result = await execute({ transaction });
  if (!result.digest) throw new Error("Transaction submitted without a digest.");
  return result.digest;
}
