import { Transaction } from "@mysten/sui/transactions";
import { CLAIM_MODULE, CLAIM_PACKAGE_ID, WORLD_PACKAGE_ID } from "./config";
import type { DAppKitSigner } from "./types";

function claimTarget(functionName: string): string {
  return `${CLAIM_PACKAGE_ID}::${CLAIM_MODULE}::${functionName}`;
}

export function buildClaimTx(input: {
  storageUnitId: string;
  characterId: string;
  typeId: string;
  quantity: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: claimTarget("claim_from_open"),
    arguments: [
      tx.object(input.storageUnitId),
      tx.object(input.characterId),
      tx.pure.u64(BigInt(input.typeId)),
      tx.pure.u32(Number(input.quantity)),
    ],
  });
  return tx;
}

export function buildShareTx(input: {
  storageUnitId: string;
  characterId: string;
  characterOwnerCapId: string;
  typeId: string;
  quantity: string;
}): Transaction {
  const tx = new Transaction();
  const [ownerCap, receipt] = tx.moveCall({
    target: `${WORLD_PACKAGE_ID}::character::borrow_owner_cap`,
    typeArguments: [`${WORLD_PACKAGE_ID}::character::Character`],
    arguments: [tx.object(input.characterId), tx.object(input.characterOwnerCapId)],
  });

  tx.moveCall({
    target: claimTarget("share_to_open"),
    arguments: [
      tx.object(input.storageUnitId),
      tx.object(input.characterId),
      ownerCap,
      tx.pure.u64(BigInt(input.typeId)),
      tx.pure.u32(Number(input.quantity)),
    ],
  });

  tx.moveCall({
    target: `${WORLD_PACKAGE_ID}::character::return_owner_cap`,
    typeArguments: [`${WORLD_PACKAGE_ID}::character::Character`],
    arguments: [tx.object(input.characterId), ownerCap, receipt],
  });
  return tx;
}

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

export function buildStockTx(input: {
  storageUnitId: string;
  ownerCharacterId: string;
  ownerCapId: string;
  typeId: string;
  quantity: string;
}): Transaction {
  const tx = new Transaction();
  const [ownerCap, receipt] = tx.moveCall({
    target: `${WORLD_PACKAGE_ID}::character::borrow_owner_cap`,
    typeArguments: [`${WORLD_PACKAGE_ID}::storage_unit::StorageUnit`],
    arguments: [tx.object(input.ownerCharacterId), tx.object(input.ownerCapId)],
  });

  tx.moveCall({
    target: claimTarget("stock_open"),
    arguments: [
      tx.object(input.storageUnitId),
      tx.object(input.ownerCharacterId),
      ownerCap,
      tx.pure.u64(BigInt(input.typeId)),
      tx.pure.u32(Number(input.quantity)),
    ],
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

