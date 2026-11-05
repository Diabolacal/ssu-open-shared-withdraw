import { Transaction } from "@mysten/sui/transactions";
import { chainKeyToBigInt } from "./chainKey";
import type { ChainKey } from "./chainKey";
import { CLAIM_MODULE, CLAIM_PACKAGE_ID, WORLD_PACKAGE_ID } from "./config";
import { executedDigest, TxError, WHOLE_UNITS_TEXT } from "./txOutcome";
import type { DAppKitSigner } from "./types";
import { gql } from "./unitState";

function claimTarget(functionName: string): string {
  return `${CLAIM_PACKAGE_ID}::${CLAIM_MODULE}::${functionName}`;
}

export interface TakeLine {
  /** The exact on-chain item key (packed with its variant, if any). */
  typeId: ChainKey;
  /** Taken from the main hangar (the shared storage). */
  mainQuantity: number;
  /** Drained from leftovers older versions of this dApp parked in the open inventory. */
  openQuantity: number;
}

export interface ShareLine {
  /** The exact on-chain item key (packed with its variant, if any). */
  typeId: ChainKey;
  quantity: number;
}

const U32_MAX = 4_294_967_295;

/**
 * Chain quantities are whole u32 units and claim.move aborts on 0, so an
 * amount below one unit (or a fraction) stops here with a clear message
 * instead of reaching the contract. `allowZero` is for the optional half of
 * a take (main hangar vs leftovers), which is skipped when 0.
 */
function wholeUnits(quantity: number, allowZero = false): number {
  const ok =
    Number.isInteger(quantity) && quantity <= U32_MAX && (quantity >= 1 || (allowZero && quantity === 0));
  if (!ok) throw new TxError("invalid-amount", WHOLE_UNITS_TEXT);
  return quantity;
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
    const key = chainKeyToBigInt(take.typeId);
    const main = wholeUnits(take.mainQuantity, true);
    const open = wholeUnits(take.openQuantity, true);
    if (main + open < 1) throw new TxError("invalid-amount", WHOLE_UNITS_TEXT);
    if (main > 0) {
      tx.moveCall({
        target: claimTarget("take"),
        arguments: [
          tx.object(input.storageUnitId),
          tx.object(input.characterId),
          tx.pure.u64(key),
          tx.pure.u32(main),
        ],
      });
    }
    if (open > 0) {
      tx.moveCall({
        target: claimTarget("claim_from_open"),
        arguments: [
          tx.object(input.storageUnitId),
          tx.object(input.characterId),
          tx.pure.u64(key),
          tx.pure.u32(open),
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
          tx.pure.u64(chainKeyToBigInt(share.typeId)),
          tx.pure.u32(wholeUnits(share.quantity)),
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

/**
 * Signs and sends, then returns the digest of a transaction that ran. Throws
 * a TxError when it failed on chain or the wallet confirmed nothing (see
 * txOutcome.ts); a declined or broken request rejects as the wallet threw it.
 *
 * No timeout on purpose: the game's approval window waits for the player for
 * as long as they take, and so does this.
 */
export async function signAndExecute(
  signer: DAppKitSigner,
  transaction: Transaction,
): Promise<string> {
  // Method-call syntax keeps `this` bound to the wallet object.
  let result: unknown;
  if (signer.signAndExecute) result = await signer.signAndExecute({ transaction });
  else if (signer.signAndExecuteTransaction) {
    result = await signer.signAndExecuteTransaction({ transaction });
  } else throw new TxError("other", "This wallet cannot send transactions.");
  return executedDigest(result);
}

const INDEX_POLL_MS = 500;
const INDEX_TIMEOUT_MS = 12_000;

const TX_QUERY = `query TxIndexed($digest: String!) { transaction(digest: $digest) { digest } }`;

/**
 * Resolves once the public GraphQL index has the transaction, so a re-read
 * shows its effects instead of the pre-transaction inventories. Gives up
 * quietly after a timeout (the regular poll catches up from there).
 */
export async function waitForIndexed(digest: string): Promise<void> {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  if (!digest) return;
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
