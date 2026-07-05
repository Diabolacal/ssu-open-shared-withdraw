import { getObjectWithDynamicFields } from "@evefrontier/dapp-kit";
import { blake2b } from "@noble/hashes/blake2.js";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { asRecord } from "./objectReaders";

export interface InventoryEntry {
  typeId: number;
  quantity: number;
}

export interface SsuInventories {
  /** Shared open inventory: anyone can take from / put into it. */
  open: InventoryEntry[];
  /** The connected character's own owned/ephemeral inventory in this SSU. */
  own: InventoryEntry[];
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Mirrors world::storage_unit::open_storage_key_from_id:
 * blake2b256( bcs(storage_unit_id) ++ b"open_inventory" ).
 */
export function openStorageKey(storageUnitId: string): string {
  const idBytes = hexToBytes(normalizeSuiAddress(storageUnitId));
  const suffix = new TextEncoder().encode("open_inventory");
  const data = new Uint8Array(idBytes.length + suffix.length);
  data.set(idBytes);
  data.set(suffix, idBytes.length);
  const digest = blake2b(data, { dkLen: 32 });
  return normalizeSuiAddress(`0x${bytesToHex(digest)}`);
}

function parseInventoryEntries(contentsJson: unknown): InventoryEntry[] | undefined {
  const inventory = asRecord(contentsJson);
  const items = asRecord(inventory?.items);
  if (!items || !Array.isArray(items.contents)) return undefined;

  const entries: InventoryEntry[] = [];
  for (const pair of items.contents) {
    const record = asRecord(pair);
    const value = asRecord(record?.value);
    const typeId = Number(record?.key ?? value?.type_id);
    const quantity = Number(value?.quantity);
    if (Number.isFinite(typeId) && Number.isFinite(quantity) && quantity > 0) {
      entries.push({ typeId, quantity });
    }
  }
  entries.sort((a, b) => a.typeId - b.typeId);
  return entries;
}

/**
 * Reads all inventories stored as dynamic fields on the StorageUnit and picks
 * out the shared open inventory plus the caller's own owned/ephemeral slot
 * (keyed by their character's OwnerCap id).
 */
export async function fetchSsuInventories(
  storageUnitId: string,
  characterOwnerCapId?: string,
): Promise<SsuInventories> {
  const response = await getObjectWithDynamicFields(storageUnitId);
  const nodes =
    response.data?.object?.asMoveObject?.dynamicFields?.nodes ?? [];

  const openKey = openStorageKey(storageUnitId);
  const ownKey = characterOwnerCapId
    ? normalizeSuiAddress(characterOwnerCapId)
    : undefined;

  let open: InventoryEntry[] = [];
  let own: InventoryEntry[] = [];

  for (const node of nodes) {
    const nameJson = node?.name?.json;
    if (typeof nameJson !== "string") continue;
    const key = normalizeSuiAddress(nameJson);
    if (key !== openKey && key !== ownKey) continue;

    const entries = parseInventoryEntries(node?.contents?.json);
    if (!entries) continue;
    if (key === openKey) open = entries;
    if (key === ownKey) own = entries;
  }

  return { open, own };
}
